package dev.puma.polymarket.client;

import dev.puma.polymarket.market.Book;
import dev.puma.polymarket.market.Market;
import dev.puma.polymarket.market.MarketFeed;
import dev.puma.polymarket.market.Outcome;
import dev.puma.polymarket.market.Snapshot;
import dev.puma.polymarket.network.ClientState;
import dev.puma.polymarket.network.Messages;
import dev.puma.polymarket.network.Network;
import java.net.URI;
import java.util.List;
import java.util.Locale;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ConfirmLinkScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * The trading window of a billboard. First-time players pick a trader name; then three tabs: Trade (buy Up or Down
 * with gold ingots at the current prices), Profile (open positions, results) and Leaderboard. Every action is a
 * request to the server, which answers with the result and the updated profile.
 */
public class TradeScreen extends Screen {
    private enum Tab { TRADE, PROFILE, LEADERBOARD }

    private static final int PANEL_W = 340;
    private static final int PANEL_H = 236;
    private static final int[] PRESETS = {1, 5, 16, 64};
    private static final int BG = 0xF00D121C;
    private static final int LINE = 0xFF263042;
    private static final int GRAY = 0xFF9CA3AF;
    private static final int WHITE = 0xFFFFFFFF;
    private static final int GOLD = 0xFFFBBF24;

    private final BlockPos board;
    private Tab tab = Tab.TRADE;
    private String amountText = "5";
    private String nameText;
    private Button buyUp;
    private Button buyDown;
    private String builtFor = "";
    private int left;
    private int top;

    public TradeScreen(BlockPos board) {
        super(Component.translatable("screen.polymarket_billboard.title"));
        this.board = board;
    }

    // ---- Widgets -------------------------------------------------------------------------------------------------

    @Override
    protected void init() {
        left = (width - PANEL_W) / 2;
        top = Math.max(2, (height - PANEL_H) / 2);
        builtFor = widgetsKey();
        buyUp = null;
        buyDown = null;
        Messages.Profile profile = ClientState.profile;

        addRenderableWidget(Button.builder(Component.literal("Close"), b -> onClose()).bounds(left + PANEL_W - 70, top + PANEL_H - 22, 60, 16).build());
        if (profile == null) return;
        if (!profile.registered()) {
            initRegistration();
            return;
        }

        int x = left + 10;
        for (Tab t : Tab.values()) {
            String label = switch (t) {
                case TRADE -> "Trade";
                case PROFILE -> "Profile";
                case LEADERBOARD -> "Leaderboard";
            };
            Button b = addRenderableWidget(Button.builder(Component.literal(label), btn -> {
                tab = t;
                rebuildWidgets();
            }).bounds(x, top + 20, 72, 14).build());
            b.active = tab != t;
            x += 76;
        }

        switch (tab) {
            case TRADE -> initTrade();
            case PROFILE -> initProfile(profile);
            case LEADERBOARD -> {}
        }
    }

    private void initRegistration() {
        if (nameText == null) {
            String own = Minecraft.getInstance().getUser().getName();
            nameText = own.matches("[A-Za-z0-9_]{3,16}") ? own : "";
        }
        EditBox name = addRenderableWidget(new EditBox(font, left + 46, top + 118, 150, 18, Component.literal("Trader name")));
        name.setMaxLength(16);
        name.setValue(nameText);
        name.setResponder(s -> nameText = s);
        setInitialFocus(name);
        addRenderableWidget(Button.builder(Component.literal("Register").withStyle(ChatFormatting.GOLD), b -> Network.toServer(new Messages.Register(nameText)))
            .bounds(left + 204, top + 117, 80, 20).build());
    }

    private void initTrade() {
        int y = top + 124;
        buyUp = addRenderableWidget(Button.builder(Component.literal("Buy Up"), b -> buy(Outcome.UP)).bounds(left + 10, y, 156, 20).build());
        buyDown = addRenderableWidget(Button.builder(Component.literal("Buy Down"), b -> buy(Outcome.DOWN)).bounds(left + 174, y, 156, 20).build());
        y += 26;
        EditBox amount = addRenderableWidget(new EditBox(font, left + 46, y, 44, 18, Component.literal("Gold ingots")));
        amount.setMaxLength(3);
        amount.setValue(amountText);
        amount.setResponder(s -> amountText = s);
        int x = left + 128;
        for (int preset : PRESETS) {
            addRenderableWidget(Button.builder(Component.literal(String.valueOf(preset)), b -> amount.setValue(String.valueOf(preset))).bounds(x, y - 1, 30, 20).build());
            x += 34;
        }
        addRenderableWidget(Button.builder(Component.literal("Open on Polymarket"), b -> {
            Market m = MarketFeed.get().snapshot().market();
            ConfirmLinkScreen.confirmLinkNow(this, URI.create(m != null ? m.url() : "https://polymarket.com/crypto/5M"));
        }).bounds(left + 10, top + PANEL_H - 22, 120, 16).build());
    }

    private void initProfile(Messages.Profile profile) {
        int y = top + 92;
        long now = System.currentTimeMillis() / 1000;
        for (Messages.PositionView p : profile.positions().stream().limit(5).toList()) {
            if (now < p.windowEnd() - 3) {
                addRenderableWidget(Button.builder(Component.literal("Sell"), b -> Network.toServer(new Messages.Sell(p.id())))
                    .bounds(left + PANEL_W - 50, y - 4, 40, 15).build());
            }
            y += 16;
        }
    }

    /** What the widgets depend on: the profile's positions, the tab and the market window. */
    private String widgetsKey() {
        Messages.Profile p = ClientState.profile;
        long now = System.currentTimeMillis() / 1000;
        StringBuilder sb = new StringBuilder().append(tab).append('|').append(now / MarketFeed.WINDOW_SECONDS);
        if (p == null) return sb.append("|none").toString();
        sb.append('|').append(p.name());
        for (Messages.PositionView v : p.positions()) sb.append(v.id()).append(v.shares()).append(now < v.windowEnd() - 3);
        return sb.toString();
    }

    @Override
    public void tick() {
        MarketFeed.get().touch();
        if (!widgetsKey().equals(builtFor)) {
            rebuildWidgets();
            return;
        }
        if (buyUp != null) {
            Snapshot s = MarketFeed.get().snapshot();
            boolean open = s.market() != null && System.currentTimeMillis() / 1000 < s.market().endSec() - 3;
            buyUp.active = open;
            buyDown.active = open;
            buyUp.setMessage(Component.literal("Buy Up · " + Fmt.cents(s.up().bestAsk())).withStyle(ChatFormatting.GREEN));
            buyDown.setMessage(Component.literal("Buy Down · " + Fmt.cents(s.down().bestAsk())).withStyle(ChatFormatting.RED));
        }
    }

    private void buy(Outcome outcome) {
        int ingots;
        try {
            ingots = Integer.parseInt(amountText.trim());
        } catch (NumberFormatException e) {
            ingots = 0;
        }
        if (ingots <= 0) {
            ClientState.result = new Messages.Result(false, "Enter how many gold ingots to trade");
            ClientState.resultTime = System.currentTimeMillis();
            return;
        }
        Network.toServer(new Messages.Buy(outcome, ingots, board));
    }

    // ---- Drawing -------------------------------------------------------------------------------------------------

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        BoardTexture.refresh();
        Snapshot s = MarketFeed.get().snapshot();
        Messages.Profile profile = ClientState.profile;
        long now = System.currentTimeMillis();

        g.fill(left, top, left + PANEL_W, top + PANEL_H, BG);
        g.outline(left, top, PANEL_W, PANEL_H, LINE);
        g.fill(left + 1, top + 1, left + PANEL_W - 1, top + 2, BoardTexture.BLUE);
        g.text(font, Component.literal("Bitcoin Up or Down").withStyle(ChatFormatting.BOLD), left + 10, top + 7, WHITE);
        if (s.market() != null) {
            String cd = Fmt.countdown(s.market(), now) + " left · " + Fmt.times(s.market().title());
            g.text(font, cd, left + PANEL_W - 10 - font.width(cd), top + 7, GOLD);
        }

        if (profile == null) {
            g.centeredText(font, "Connecting to the server…", left + PANEL_W / 2, top + PANEL_H / 2, GRAY);
        } else if (!profile.registered()) {
            drawRegistration(g);
        } else {
            String who = font.plainSubstrByWidth(profile.name(), 70) + " · #" + profile.rank();
            g.text(font, who, left + PANEL_W - 10 - font.width(who), top + 23, GOLD);
            switch (tab) {
                case TRADE -> drawTrade(g, s, profile);
                case PROFILE -> drawProfile(g, s, profile);
                case LEADERBOARD -> drawLeaderboard(g, profile);
            }
        }

        Messages.Result result = ClientState.result;
        if (result != null && now - ClientState.resultTime < 6000) {
            int y = profile != null && profile.registered() && tab == Tab.TRADE ? top + 112 : top + PANEL_H - 36;
            g.centeredText(font, Component.literal(result.message()).withStyle(result.ok() ? ChatFormatting.GREEN : ChatFormatting.RED), left + PANEL_W / 2, y, WHITE);
        }
        super.extractRenderState(g, mouseX, mouseY, partialTick);
    }

    private void drawRegistration(GuiGraphicsExtractor g) {
        g.text(font, Component.literal("Become a trader").withStyle(ChatFormatting.BOLD, ChatFormatting.GOLD), left + 10, top + 40, WHITE);
        int y = top + 56;
        for (String line : List.of(
            "Trade Polymarket's live Bitcoin Up or Down market with",
            "gold ingots. A winning share pays 1 gold when the market",
            "resolves; fractions of an ingot are paid in nuggets.",
            "Your name and profit appear on the leaderboard next to",
            "the billboard. Pick a name (3-16 letters, numbers or _):")) {
            g.text(font, line, left + 10, y, GRAY);
            y += 11;
        }
        g.text(font, "Name", left + 10, top + 123, WHITE);
    }

    private void drawTrade(GuiGraphicsExtractor g, Snapshot s, Messages.Profile profile) {
        int cx = left + 10, cy = top + 38, cw = PANEL_W - 20, ch = 58;
        int u0 = BoardTexture.CHART_X0 - 6, v0 = BoardTexture.CHART_Y0 - 6;
        int uw = BoardTexture.CHART_X1 - BoardTexture.CHART_X0 + 12, vh = BoardTexture.CHART_Y1 - BoardTexture.CHART_Y0 + 12;
        g.blit(RenderPipelines.GUI_TEXTURED, BoardTexture.ID, cx, cy, u0, v0, cw, ch, uw, vh, BoardTexture.WIDTH, BoardTexture.HEIGHT);
        if (s.market() == null) g.centeredText(font, s.error() != null ? s.error() : "Connecting to Polymarket…", cx + cw / 2, cy + ch / 2 - 4, GRAY);

        double up = s.upProbability();
        int py = top + 100;
        g.text(font, Component.literal("Up " + Fmt.percent(up)).withStyle(ChatFormatting.BOLD), left + 10, py, BoardTexture.UP);
        String down = "Down " + Fmt.downPercent(up);
        g.text(font, Component.literal(down).withStyle(ChatFormatting.BOLD), left + PANEL_W - 10 - font.width(down) - 6, py, BoardTexture.DOWN);
        g.centeredText(font, "Sell Up " + Fmt.cents(s.up().bestBid()) + "  ·  Sell Down " + Fmt.cents(s.down().bestBid()), left + PANEL_W / 2, py, GRAY);

        g.text(font, "Gold", left + 10, top + 155, GOLD);
        g.text(font, "ingots", left + 94, top + 155, GRAY);
        g.text(font, "You have " + goldInInventory() + " gold ingots · a winning share pays 1 gold", left + 10, top + 176, GRAY);

        int y = top + 190;
        for (Messages.PositionView p : profile.positions().stream().filter(p -> s.market() != null && p.slug().equals(s.market().slug())).limit(2).toList()) {
            Book book = s.book(p.outcome());
            String line = p.outcome().label() + " · " + Fmt.shares(p.shares()) + " shares for " + gold(p.cost()) + " gold";
            if (!Double.isNaN(book.bestBid())) line += " · now " + gold(p.shares() * book.bestBid()) + " gold";
            g.text(font, line, left + 10, y, p.outcome() == Outcome.UP ? BoardTexture.UP : BoardTexture.DOWN);
            y += 11;
        }
    }

    private void drawProfile(GuiGraphicsExtractor g, Snapshot s, Messages.Profile p) {
        g.text(font, Component.literal(p.name()).withStyle(ChatFormatting.BOLD), left + 10, top + 40, GOLD);
        String rank = "Rank #" + p.rank() + " of " + ClientState.leaderboard.traders();
        g.text(font, rank, left + PANEL_W - 10 - font.width(rank), top + 40, GRAY);
        g.text(font, "Profit " + signedGold(p.pnl()) + " · " + p.wins() + " won · " + p.losses() + " lost · " + p.trades() + (p.trades() == 1 ? " trade" : " trades"),
            left + 10, top + 53, p.pnl() >= 0 ? BoardTexture.UP : BoardTexture.DOWN);
        if (p.pendingNuggets() > 0) {
            g.text(font, gold(p.pendingNuggets() / 9.0) + " gold waiting for room: free some slots, then open a billboard", left + 10, top + 65, GOLD);
        }

        g.text(font, Component.literal("Open positions").withStyle(ChatFormatting.BOLD), left + 10, top + 78, WHITE);
        int y = top + 92;
        long now = System.currentTimeMillis() / 1000;
        if (p.positions().isEmpty()) {
            g.text(font, "None: buy Up or Down in the Trade tab.", left + 10, y, GRAY);
            y += 16;
        }
        for (Messages.PositionView v : p.positions().stream().limit(5).toList()) {
            String line = v.outcome().label() + " · " + Fmt.shares(v.shares()) + " sh @ " + Fmt.cents(v.cost() / v.shares()) + " · " + Fmt.times(v.title()).replace(" ET", "");
            boolean live = s.market() != null && v.slug().equals(s.market().slug());
            if (now >= v.windowEnd()) {
                line += " · resolving…";
            } else if (live && !Double.isNaN(s.book(v.outcome()).bestBid())) {
                double value = v.shares() * s.book(v.outcome()).bestBid();
                double change = Math.round((value - v.cost()) * 10) / 10.0;
                line += " · now " + gold(value) + " gold (" + (change > 0 ? "+" : "") + gold(change) + ")";
            }
            g.text(font, line, left + 10, y, v.outcome() == Outcome.UP ? BoardTexture.UP : BoardTexture.DOWN);
            y += 16;
        }

        g.text(font, Component.literal("Recent trades").withStyle(ChatFormatting.BOLD), left + 10, y + 2, WHITE);
        y += 14;
        if (p.history().isEmpty()) g.text(font, "No finished trades yet.", left + 10, y, GRAY);
        for (Messages.ClosedView c : p.history().stream().limit(Math.max(1, (top + PANEL_H - 30 - y) / 11)).toList()) {
            double profit = c.payout() - c.cost();
            g.text(font, c.result() + " " + signedGold(profit) + " · " + c.outcome().label() + " · " + Fmt.times(c.title()), left + 10, y,
                profit >= 0 ? BoardTexture.UP : BoardTexture.DOWN);
            y += 11;
        }
    }

    private void drawLeaderboard(GuiGraphicsExtractor g, Messages.Profile p) {
        Messages.Leaderboard board = ClientState.leaderboard;
        int y = top + 42;
        g.text(font, "#", left + 12, y, GRAY);
        g.text(font, "Trader", left + 32, y, GRAY);
        g.text(font, "Profit", left + 190, y, GRAY);
        g.text(font, "Trades", left + 250, y, GRAY);
        g.text(font, "Won", left + 300, y, GRAY);
        g.fill(left + 10, y + 11, left + PANEL_W - 10, y + 12, LINE);
        y += 16;
        if (board.entries().isEmpty()) g.text(font, "No traders yet: be the first!", left + 12, y, GRAY);
        int rank = 1;
        for (Messages.LeaderboardEntry e : board.entries()) {
            if (e.name().equals(p.name())) g.fill(left + 10, y - 2, left + PANEL_W - 10, y + 10, 0x33FBBF24);
            int color = rank == 1 ? GOLD : WHITE;
            g.text(font, String.valueOf(rank), left + 12, y, color);
            g.text(font, e.name(), left + 32, y, color);
            g.text(font, signedGold(e.pnl()), left + 190, y, e.pnl() >= 0 ? BoardTexture.UP : BoardTexture.DOWN);
            g.text(font, String.valueOf(e.trades()), left + 250, y, GRAY);
            g.text(font, String.valueOf(e.wins()), left + 300, y, GRAY);
            y += 15;
            rank++;
        }
        if (board.traders() > board.entries().size()) g.text(font, "+ " + (board.traders() - board.entries().size()) + " more traders", left + 12, y, GRAY);
    }

    private static int goldInInventory() {
        var player = Minecraft.getInstance().player;
        if (player == null) return 0;
        Inventory inv = player.getInventory();
        int n = 0;
        for (int i = 0; i < inv.getContainerSize(); i++) {
            ItemStack stack = inv.getItem(i);
            if (stack.is(Items.GOLD_INGOT)) n += stack.getCount();
        }
        return n;
    }

    /** "12", or "12.4" when there is a fraction. */
    static String gold(double g) {
        double r = Math.round(g * 10) / 10.0;
        return r == Math.rint(r) ? String.valueOf((long) r) : String.format(Locale.ROOT, "%.1f", r);
    }

    static String signedGold(double g) {
        double r = Math.round(g * 10) / 10.0;
        return (r > 0 ? "+" : "") + gold(r) + " gold";
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
