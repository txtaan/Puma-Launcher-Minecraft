package dev.puma.polymarket.trading;

import com.mojang.logging.LogUtils;
import dev.puma.polymarket.PolymarketBillboard;
import dev.puma.polymarket.block.BillboardBlock;
import dev.puma.polymarket.market.Book;
import dev.puma.polymarket.market.Fills;
import dev.puma.polymarket.market.Market;
import dev.puma.polymarket.market.MarketFeed;
import dev.puma.polymarket.market.Outcome;
import dev.puma.polymarket.network.Messages;
import dev.puma.polymarket.network.Network;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.HopperBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import org.slf4j.Logger;

/**
 * Trading with gold, run by the server. A trade takes gold ingots from the player's inventory and buys shares at the
 * real Polymarket order book (fetched fresh for each trade); when Polymarket resolves the market, every winning share
 * pays 1 gold. Winnings go into the trader's inventory (fractions as nuggets); what doesn't fit, or what is won while
 * the trader is offline, goes into a chest behind the billboard where the trade was placed.
 *
 * Network calls run on a background thread; all game state changes happen on the server thread.
 */
public final class Trading {
    private static final Logger LOGGER = LogUtils.getLogger();
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_]{3,16}");
    public static final int MAX_INGOTS = 640;
    /** No new trades in the last seconds of a window: the order book empties out as it closes. */
    private static final long CLOSE_BUFFER_SECONDS = 3;
    private static final int LEADERBOARD_SIZE = 10;
    private static final int NUGGETS_PER_INGOT = 9;

    private static final ExecutorService HTTP = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "Polymarket trading");
        t.setDaemon(true);
        return t;
    });
    /** Markets whose resolution is being looked up, so each is asked about once at a time. */
    private static final Set<String> checking = new HashSet<>();
    private static int tickCounter;

    private Trading() {}

    // ---- Requests from players -----------------------------------------------------------------------------------

    public static void register(ServerPlayer player, String name) {
        if (player == null) return;
        if (TraderStore.get(player.getUUID()) != null) {
            reply(player, false, "You are already registered");
            return;
        }
        String n = name.trim();
        if (!NAME.matcher(n).matches()) {
            reply(player, false, "Names are 3–16 letters, numbers or _");
            return;
        }
        if (TraderStore.nameTaken(n)) {
            reply(player, false, "That name is taken");
            return;
        }
        TraderStore.register(player.getUUID(), n);
        reply(player, true, "Welcome, " + n + "! You trade with gold ingots.");
        sendProfile(player);
        broadcastLeaderboard(player.level().getServer());
    }

    /** Send a player their profile and the leaderboard, handing over any winnings that were waiting for them. */
    public static void refresh(ServerPlayer player, BlockPos board) {
        if (player == null) return;
        deliverPending(player, board != null && nearBillboard(player, board) ? board : null);
        sendProfile(player);
        Network.toPlayer(player, leaderboard());
    }

    public static void buy(ServerPlayer player, Outcome outcome, int ingots, BlockPos board) {
        if (player == null) return;
        TraderStore.Trader trader = TraderStore.get(player.getUUID());
        if (trader == null) {
            reply(player, false, "Register a trader name first");
            return;
        }
        if (ingots < 1 || ingots > MAX_INGOTS) {
            reply(player, false, "Trade between 1 and " + MAX_INGOTS + " gold ingots");
            return;
        }
        if (!nearBillboard(player, board)) {
            reply(player, false, "Stand next to a billboard to trade");
            return;
        }
        if (countGold(player.getInventory()) < ingots) {
            reply(player, false, "You don't have " + ingots + " gold ingots");
            return;
        }
        MinecraftServer server = player.level().getServer();
        UUID id = player.getUUID();
        // Fetch the current market and a fresh order book off the server thread, then trade on it.
        CompletableFuture.supplyAsync(() -> {
            try {
                Market market = MarketFeed.get().currentMarket().orElse(null);
                return market == null ? null : new Quote(market, MarketFeed.get().fetchBook(market.token(outcome)));
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }, HTTP).whenComplete((quote, error) -> server.execute(() -> {
            ServerPlayer p = server.getPlayerList().getPlayer(id);
            if (p == null) return;
            if (error != null || quote == null) {
                reply(p, false, error != null ? "Can't reach Polymarket right now" : "No market right now: try again in a moment");
                return;
            }
            completeBuy(p, trader, quote, outcome, ingots, board);
        }));
    }

    private record Quote(Market market, Book book) {}

    private static void completeBuy(ServerPlayer player, TraderStore.Trader trader, Quote quote, Outcome outcome, int ingots, BlockPos board) {
        Market market = quote.market();
        if (Instant.now().getEpochSecond() >= market.endSec() - CLOSE_BUFFER_SECONDS) {
            reply(player, false, "This market is closing: wait for the next one");
            return;
        }
        Fills.Fill fill = Fills.buy(quote.book(), ingots);
        if (fill.shares() <= 0) {
            reply(player, false, "Nobody is selling " + outcome.label() + " right now");
            return;
        }
        if (!takeGold(player.getInventory(), ingots)) {
            reply(player, false, "You don't have " + ingots + " gold ingots");
            return;
        }
        // A thin book can leave part of the stake unspent: give it back.
        int refund = nuggets(ingots - fill.gold());
        if (refund > 0) giveOrStore(player.level().getServer(), player.getUUID(), refund, board, player.level(), facing(player.level(), board));
        double cost = ingots - refund / (double) NUGGETS_PER_INGOT;

        TraderStore.Position p = trader.positions.stream()
            .filter(x -> x.slug.equals(market.slug()) && x.outcome == outcome)
            .findFirst()
            .orElseGet(() -> {
                TraderStore.Position n = new TraderStore.Position();
                n.id = UUID.randomUUID().toString();
                n.slug = market.slug();
                n.title = market.title();
                n.outcome = outcome;
                n.windowEnd = market.endSec();
                trader.positions.add(n);
                return n;
            });
        p.shares += fill.shares();
        p.cost += cost;
        p.dimension = player.level().dimension().identifier().toString();
        p.boardX = board.getX();
        p.boardY = board.getY();
        p.boardZ = board.getZ();
        p.boardFacing = facing(player.level(), board).getSerializedName();
        TraderStore.save();
        reply(player, true, String.format(Locale.ROOT, "Bought %s %s shares for %s gold (avg %s)",
            shares(fill.shares()), outcome.label(), gold(cost), cents(cost / fill.shares())));
        sendProfile(player);
    }

    public static void sell(ServerPlayer player, String positionId) {
        if (player == null) return;
        TraderStore.Trader trader = TraderStore.get(player.getUUID());
        TraderStore.Position position = trader == null ? null : trader.positions.stream().filter(p -> p.id.equals(positionId)).findFirst().orElse(null);
        if (position == null) {
            reply(player, false, "Position not found");
            return;
        }
        if (Instant.now().getEpochSecond() >= position.windowEnd - CLOSE_BUFFER_SECONDS) {
            reply(player, false, "This market has closed: it pays out when Polymarket resolves it");
            return;
        }
        MinecraftServer server = player.level().getServer();
        UUID id = player.getUUID();
        CompletableFuture.supplyAsync(() -> {
            try {
                Market market = MarketFeed.get().market(position.windowEnd - MarketFeed.WINDOW_SECONDS).orElse(null);
                return market == null ? null : MarketFeed.get().fetchBook(market.token(position.outcome));
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }, HTTP).whenComplete((book, error) -> server.execute(() -> {
            ServerPlayer p = server.getPlayerList().getPlayer(id);
            if (p == null) return;
            if (error != null || book == null) {
                reply(p, false, "Can't reach Polymarket right now");
                return;
            }
            completeSell(p, trader, position, book);
        }));
    }

    private static void completeSell(ServerPlayer player, TraderStore.Trader trader, TraderStore.Position position, Book book) {
        if (!trader.positions.contains(position)) return;
        Fills.Fill fill = Fills.sell(book, position.shares);
        if (fill.shares() <= 0) {
            reply(player, false, "Nobody is buying " + position.outcome.label() + " right now");
            return;
        }
        int paid = nuggets(fill.gold());
        double payout = paid / (double) NUGGETS_PER_INGOT;
        double costPart = position.cost * (fill.shares() / position.shares);
        giveOrStore(player.level().getServer(), player.getUUID(), paid, new BlockPos(position.boardX, position.boardY, position.boardZ),
            player.level(), Direction.byName(position.boardFacing));
        finish(trader, position, fill.shares(), costPart, payout, "Sold");
        position.shares -= fill.shares();
        position.cost -= costPart;
        if (position.shares <= 1e-6) trader.positions.remove(position);
        TraderStore.save();
        reply(player, true, String.format(Locale.ROOT, "Sold %s %s shares for %s gold", shares(fill.shares()), position.outcome.label(), gold(payout)));
        sendProfile(player);
        broadcastLeaderboard(player.level().getServer());
    }

    // ---- Settlement ----------------------------------------------------------------------------------------------

    /** Every 10 seconds: look up how ended markets resolved, and pay out the ones Polymarket has closed. */
    public static void tick(MinecraftServer server) {
        if (++tickCounter % 200 != 0) return;
        long now = Instant.now().getEpochSecond();
        Set<String> ended = new HashSet<>();
        for (TraderStore.Trader t : TraderStore.all().values()) {
            for (TraderStore.Position p : t.positions) if (now >= p.windowEnd) ended.add(p.slug);
        }
        for (String slug : ended) {
            if (!checking.add(slug)) continue;
            CompletableFuture.supplyAsync(() -> MarketFeed.get().resolution(slug), HTTP)
                .whenComplete((winner, error) -> server.execute(() -> {
                    checking.remove(slug);
                    if (error == null && winner.isPresent()) settle(server, slug, winner.get());
                }));
        }
    }

    private static void settle(MinecraftServer server, String slug, Outcome winner) {
        boolean changed = false;
        for (Map.Entry<String, TraderStore.Trader> entry : TraderStore.all().entrySet()) {
            UUID uuid = UUID.fromString(entry.getKey());
            TraderStore.Trader trader = entry.getValue();
            for (TraderStore.Position p : new ArrayList<>(trader.positions)) {
                if (!p.slug.equals(slug)) continue;
                changed = true;
                boolean won = p.outcome == winner;
                int paid = won ? nuggets(p.shares) : 0;
                double payout = paid / (double) NUGGETS_PER_INGOT;
                if (paid > 0) {
                    ServerLevel level = server.getLevel(ResourceKey.create(Registries.DIMENSION, Identifier.parse(p.dimension)));
                    giveOrStore(server, uuid, paid, new BlockPos(p.boardX, p.boardY, p.boardZ), level, Direction.byName(p.boardFacing));
                    server.getPlayerList().broadcastSystemMessage(Component.empty()
                        .append(Component.literal(trader.name).withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD))
                        .append(Component.literal(" has won " + gold(payout) + " gold on ").withStyle(ChatFormatting.YELLOW))
                        .append(Component.literal(p.title).withStyle(ChatFormatting.WHITE)), false);
                }
                finish(trader, p, p.shares, p.cost, payout, won ? "Won" : "Lost");
                trader.positions.remove(p);
                ServerPlayer player = server.getPlayerList().getPlayer(uuid);
                if (player != null) {
                    if (!won) reply(player, false, "Your " + p.outcome.label() + " position lost: " + p.title);
                    sendProfile(player);
                }
            }
        }
        if (changed) {
            TraderStore.save();
            broadcastLeaderboard(server);
        }
    }

    private static void finish(TraderStore.Trader trader, TraderStore.Position p, double shares, double cost, double payout, String result) {
        TraderStore.Closed c = new TraderStore.Closed();
        c.title = p.title;
        c.outcome = p.outcome;
        c.shares = shares;
        c.cost = cost;
        c.payout = payout;
        c.result = result;
        c.time = System.currentTimeMillis();
        trader.record(c);
        trader.pnl += payout - cost;
        trader.trades++;
        if (result.equals("Won")) trader.wins++;
        if (result.equals("Lost")) trader.losses++;
    }

    // ---- Gold ----------------------------------------------------------------------------------------------------

    /** Gold to nuggets, rounded down (a fraction of a nugget can't be paid). */
    private static int nuggets(double gold) {
        return (int) Math.floor(gold * NUGGETS_PER_INGOT + 1e-6);
    }

    private static int countGold(Inventory inv) {
        int n = 0;
        for (int i = 0; i < inv.getContainerSize(); i++) {
            ItemStack s = inv.getItem(i);
            if (s.is(Items.GOLD_INGOT)) n += s.getCount();
        }
        return n;
    }

    private static boolean takeGold(Inventory inv, int ingots) {
        if (countGold(inv) < ingots) return false;
        int left = ingots;
        for (int i = 0; i < inv.getContainerSize() && left > 0; i++) {
            ItemStack s = inv.getItem(i);
            if (!s.is(Items.GOLD_INGOT)) continue;
            int take = Math.min(left, s.getCount());
            s.shrink(take);
            left -= take;
        }
        inv.setChanged();
        return true;
    }

    private static List<ItemStack> goldStacks(int nuggets) {
        List<ItemStack> out = new ArrayList<>();
        int ingots = nuggets / NUGGETS_PER_INGOT;
        while (ingots > 0) {
            int n = Math.min(64, ingots);
            out.add(new ItemStack(Items.GOLD_INGOT, n));
            ingots -= n;
        }
        if (nuggets % NUGGETS_PER_INGOT > 0) out.add(new ItemStack(Items.GOLD_NUGGET, nuggets % NUGGETS_PER_INGOT));
        return out;
    }

    /**
     * Give gold to a trader. If they are online it goes into their inventory, and what doesn't fit into the chest behind
     * the billboard (placing one if there is none). If they are offline, or there is no room, it waits as pending gold
     * and is handed over when they join or open a billboard.
     */
    private static void giveOrStore(MinecraftServer server, UUID uuid, int nuggets, BlockPos board, Level level, Direction facing) {
        if (nuggets <= 0) return;
        ServerPlayer player = server.getPlayerList().getPlayer(uuid);
        List<ItemStack> stacks = goldStacks(nuggets);
        if (player != null) stacks = give(player, stacks, level instanceof ServerLevel l ? l : null, board, facing);
        int left = count(stacks);
        if (left > 0) {
            TraderStore.Trader trader = TraderStore.get(uuid);
            if (trader != null) trader.pendingNuggets += left;
            TraderStore.save();
        }
    }

    /** Into the inventory, onto the gold already there or into free slots; then into the chest behind the billboard. */
    private static List<ItemStack> give(ServerPlayer player, List<ItemStack> stacks, ServerLevel level, BlockPos board, Direction facing) {
        for (ItemStack s : stacks) player.getInventory().add(s);
        List<ItemStack> left = new ArrayList<>(stacks);
        left.removeIf(ItemStack::isEmpty);
        if (left.isEmpty() || level == null || board == null || facing == null) return left;
        left = putInChest(level, board, facing, left);
        if (left.isEmpty()) {
            player.sendSystemMessage(Component.literal("Your inventory is full: the gold is in the chest behind the billboard").withStyle(ChatFormatting.YELLOW));
        }
        return left;
    }

    private static int count(List<ItemStack> stacks) {
        return stacks.stream().mapToInt(s -> s.getCount() * (s.is(Items.GOLD_INGOT) ? NUGGETS_PER_INGOT : 1)).sum();
    }

    private static List<ItemStack> putInChest(ServerLevel level, BlockPos board, Direction facing, List<ItemStack> stacks) {
        BlockPos behind = board.relative(facing.getOpposite());
        BlockState state = level.getBlockState(behind);
        if (!(level.getBlockEntity(behind) instanceof Container) && state.canBeReplaced()) {
            level.setBlockAndUpdate(behind, Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, facing.getOpposite()));
        }
        BlockEntity be = level.getBlockEntity(behind);
        if (!(be instanceof Container chest)) return stacks;
        List<ItemStack> left = new ArrayList<>();
        for (ItemStack s : stacks) {
            ItemStack rest = HopperBlockEntity.addItem(null, chest, s, null);
            if (!rest.isEmpty()) left.add(rest);
        }
        chest.setChanged();
        return left;
    }

    /** Hand over waiting winnings: into the inventory, and with a billboard at hand, into the chest behind it. */
    private static void deliverPending(ServerPlayer player, BlockPos board) {
        TraderStore.Trader trader = TraderStore.get(player.getUUID());
        if (trader == null || trader.pendingNuggets <= 0) return;
        int pending = trader.pendingNuggets;
        ServerLevel level = player.level();
        int left = count(give(player, goldStacks(pending), level, board, board == null ? null : facing(level, board)));
        trader.pendingNuggets = left;
        TraderStore.save();
        if (left < pending) {
            reply(player, true, "Delivered " + gold((pending - left) / (double) NUGGETS_PER_INGOT) + " gold of earlier winnings");
        }
    }

    // ---- Billboards ----------------------------------------------------------------------------------------------

    private static boolean nearBillboard(ServerPlayer player, BlockPos board) {
        return player.level().getBlockState(board).is(PolymarketBillboard.BILLBOARD.get())
            && player.distanceToSqr(board.getX() + 0.5, board.getY() + 0.5, board.getZ() + 0.5) < 10 * 10;
    }

    private static Direction facing(Level level, BlockPos board) {
        BlockState state = level.getBlockState(board);
        return state.hasProperty(BillboardBlock.FACING) ? state.getValue(BillboardBlock.FACING) : Direction.NORTH;
    }

    // ---- Sync ----------------------------------------------------------------------------------------------------

    public static void sendProfile(ServerPlayer player) {
        TraderStore.Trader t = TraderStore.get(player.getUUID());
        if (t == null) {
            Network.toPlayer(player, new Messages.Profile("", 0, 0, 0, 0, 0, 0, List.of(), List.of()));
            return;
        }
        int rank = TraderStore.ranking().indexOf(t) + 1;
        Network.toPlayer(player, new Messages.Profile(t.name, t.pnl, t.wins, t.losses, t.trades, t.pendingNuggets, rank,
            t.positions.stream().map(p -> new Messages.PositionView(p.id, p.slug, p.title, p.outcome, p.shares, p.cost, p.windowEnd)).toList(),
            t.history.stream().limit(10).map(c -> new Messages.ClosedView(c.title, c.outcome, c.cost, c.payout, c.result, c.time)).toList()));
    }

    public static Messages.Leaderboard leaderboard() {
        List<TraderStore.Trader> ranking = TraderStore.ranking();
        return new Messages.Leaderboard(
            ranking.stream().limit(LEADERBOARD_SIZE).map(t -> new Messages.LeaderboardEntry(t.name, t.pnl, t.trades, t.wins)).toList(),
            ranking.size());
    }

    public static void broadcastLeaderboard(MinecraftServer server) {
        if (server != null) Network.toAll(leaderboard());
    }

    private static void reply(ServerPlayer player, boolean ok, String message) {
        Network.toPlayer(player, new Messages.Result(ok, message));
    }

    // ---- Formatting ----------------------------------------------------------------------------------------------

    /** "12", or "12.4" when there is a fraction. */
    public static String gold(double g) {
        double r = Math.round(g * 10) / 10.0;
        return r == Math.rint(r) ? String.valueOf((long) r) : String.format(Locale.ROOT, "%.1f", r);
    }

    private static String shares(double s) {
        return String.format(Locale.ROOT, s >= 100 ? "%.0f" : "%.2f", s);
    }

    private static String cents(double price) {
        double c = price * 100;
        return (Math.abs(c - Math.round(c)) < 0.05 ? String.valueOf(Math.round(c)) : String.format(Locale.ROOT, "%.1f", c)) + "¢";
    }
}
