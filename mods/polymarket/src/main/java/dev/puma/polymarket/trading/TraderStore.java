package dev.puma.polymarket.trading;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.mojang.logging.LogUtils;
import dev.puma.polymarket.market.Outcome;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.storage.LevelResource;
import org.slf4j.Logger;

/**
 * Every trader of a world: name, positions, history and results, saved as JSON in the world folder
 * ({@code polymarket_billboard/traders.json}). Only touched on the server thread.
 */
public final class TraderStore {
    private static final Logger LOGGER = LogUtils.getLogger();
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final int MAX_HISTORY = 30;

    /** An open position: shares of one outcome of one market, bought at one billboard. */
    public static final class Position {
        public String id;
        public String slug;
        public String title;
        public Outcome outcome;
        public double shares;
        /** Gold paid for the shares. */
        public double cost;
        public long windowEnd;
        /** Where it was bought: winnings that don't fit in the inventory go in a chest behind this billboard. */
        public String dimension;
        public int boardX;
        public int boardY;
        public int boardZ;
        public String boardFacing;
    }

    /** A finished trade. */
    public static final class Closed {
        public String title;
        public Outcome outcome;
        public double shares;
        public double cost;
        /** Gold received: the payout of a winning position, or the price of a sale. */
        public double payout;
        /** "Won", "Lost" or "Sold". */
        public String result;
        public long time;

        public double profit() {
            return payout - cost;
        }
    }

    public static final class Trader {
        public String name;
        /** Realised profit and loss in gold, over every finished trade. */
        public double pnl;
        public int wins;
        public int losses;
        public int trades;
        /** Winnings that couldn't be delivered yet (no room anywhere), in gold nuggets. */
        public int pendingNuggets;
        public List<Position> positions = new ArrayList<>();
        public List<Closed> history = new ArrayList<>();

        public void record(Closed c) {
            history.addFirst(c);
            while (history.size() > MAX_HISTORY) history.removeLast();
        }
    }

    private static final class Data {
        Map<String, Trader> traders = new LinkedHashMap<>();
    }

    private static Data data = new Data();
    private static Path file;

    private TraderStore() {}

    public static void load(MinecraftServer server) {
        file = server.getWorldPath(LevelResource.ROOT).resolve("polymarket_billboard").resolve("traders.json");
        data = new Data();
        if (!Files.exists(file)) return;
        try {
            Data loaded = GSON.fromJson(Files.readString(file), Data.class);
            if (loaded != null && loaded.traders != null) {
                for (Trader t : loaded.traders.values()) {
                    if (t.positions == null) t.positions = new ArrayList<>();
                    if (t.history == null) t.history = new ArrayList<>();
                }
                data = loaded;
            }
        } catch (Exception e) {
            LOGGER.error("Couldn't read the Polymarket traders file {}", file, e);
        }
    }

    public static void save() {
        if (file == null) return;
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling("traders.json.tmp");
            Files.writeString(tmp, GSON.toJson(data));
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            LOGGER.error("Couldn't save the Polymarket traders file", e);
        }
    }

    public static Trader get(UUID player) {
        return data.traders.get(player.toString());
    }

    public static Map<String, Trader> all() {
        return data.traders;
    }

    public static boolean nameTaken(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        return data.traders.values().stream().anyMatch(t -> t.name.toLowerCase(Locale.ROOT).equals(n));
    }

    public static Trader register(UUID player, String name) {
        Trader t = new Trader();
        t.name = name;
        data.traders.put(player.toString(), t);
        save();
        return t;
    }

    /** Traders ranked by profit, best first (ties: more trades first). */
    public static List<Trader> ranking() {
        return data.traders.values().stream()
            .sorted(Comparator.comparingDouble((Trader t) -> -t.pnl).thenComparingInt(t -> -t.trades))
            .toList();
    }
}
