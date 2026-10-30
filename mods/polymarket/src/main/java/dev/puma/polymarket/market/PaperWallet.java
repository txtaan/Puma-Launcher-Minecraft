package dev.puma.polymarket.market;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.mojang.logging.LogUtils;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import org.slf4j.Logger;

/**
 * Paper trading: a virtual dollar balance that buys and sells Up/Down shares at the prices of Polymarket's real order
 * book, walking the book level by level like a market order would. No real money or Polymarket account is involved.
 * When a market resolves, each winning share pays $1 and losing shares expire worthless, as on Polymarket.
 *
 * The wallet is saved as JSON in the game's config folder, so it is kept between sessions and per game folder.
 */
public final class PaperWallet {
    private static final Logger LOGGER = LogUtils.getLogger();
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    public static final double STARTING_BALANCE = 1000;
    private static final int MAX_HISTORY = 50;

    private static final PaperWallet INSTANCE = new PaperWallet();

    /** A holding of one outcome of one market. */
    public static final class Position {
        public String slug;
        public String title;
        public Outcome outcome;
        public double shares;
        /** Dollars paid for these shares. */
        public double cost;
        public long windowEnd;

        public double averagePrice() {
            return shares > 0 ? cost / shares : 0;
        }
    }

    /** A finished trade: sold before the end, or settled when the market resolved. */
    public static final class Closed {
        public String title;
        public Outcome outcome;
        public double shares;
        public double cost;
        public double proceeds;
        public String result;
        public long time;

        public double profit() {
            return proceeds - cost;
        }
    }

    private static final class State {
        double balance = STARTING_BALANCE;
        List<Position> positions = new ArrayList<>();
        List<Closed> history = new ArrayList<>();
    }

    /** The result of a buy or sell: shares and dollars actually filled, or why nothing was. */
    public record Fill(double shares, double dollars, String error) {
        static Fill failed(String error) {
            return new Fill(0, 0, error);
        }

        public boolean ok() {
            return error == null;
        }
    }

    private State state = new State();
    private Path file;

    public static PaperWallet get() {
        return INSTANCE;
    }

    public synchronized void load(Path configDir) {
        file = configDir.resolve("polymarket_billboard-paper-wallet.json");
        if (!Files.exists(file)) return;
        try {
            State loaded = GSON.fromJson(Files.readString(file), State.class);
            if (loaded != null) {
                if (loaded.positions == null) loaded.positions = new ArrayList<>();
                if (loaded.history == null) loaded.history = new ArrayList<>();
                state = loaded;
            }
        } catch (Exception e) {
            LOGGER.warn("Couldn't read the paper wallet {}, starting a new one", file, e);
        }
    }

    public synchronized double balance() {
        return state.balance;
    }

    public synchronized List<Position> positions() {
        return List.copyOf(state.positions);
    }

    public synchronized List<Closed> history() {
        return List.copyOf(state.history);
    }

    /** Spend up to {@code dollars} on shares of an outcome at the current asks. */
    public synchronized Fill buy(Market market, Outcome outcome, Book book, double dollars, long nowSec) {
        if (market == null) return Fill.failed("No market right now");
        if (nowSec >= market.endSec()) return Fill.failed("This market has closed");
        if (!(dollars > 0)) return Fill.failed("Enter an amount");
        if (dollars > state.balance + 1e-9) return Fill.failed("Not enough paper dollars");
        double left = dollars;
        double shares = 0;
        for (Book.Level level : book.asks()) {
            if (left <= 1e-9) break;
            double take = Math.min(level.size(), left / level.price());
            shares += take;
            left -= take * level.price();
        }
        double spent = dollars - left;
        if (shares <= 0) return Fill.failed("Nobody is selling " + outcome.label() + " right now");
        state.balance -= spent;
        Position p = state.positions.stream()
            .filter(x -> x.slug.equals(market.slug()) && x.outcome == outcome)
            .findFirst()
            .orElseGet(() -> {
                Position n = new Position();
                n.slug = market.slug();
                n.title = market.title();
                n.outcome = outcome;
                n.windowEnd = market.endSec();
                state.positions.add(n);
                return n;
            });
        p.shares += shares;
        p.cost += spent;
        save();
        return new Fill(shares, spent, null);
    }

    /** Sell a whole position at the current bids. */
    public synchronized Fill sell(Position position, Book book, long nowSec) {
        Position p = state.positions.stream().filter(x -> x.slug.equals(position.slug) && x.outcome == position.outcome).findFirst().orElse(null);
        if (p == null) return Fill.failed("Position not found");
        if (nowSec >= p.windowEnd) return Fill.failed("This market has closed: it pays out when it resolves");
        double left = p.shares;
        double proceeds = 0;
        for (Book.Level level : book.bids()) {
            if (left <= 1e-9) break;
            double take = Math.min(level.size(), left);
            proceeds += take * level.price();
            left -= take;
        }
        double sold = p.shares - left;
        if (sold <= 0) return Fill.failed("Nobody is buying " + p.outcome.label() + " right now");
        double costPart = p.cost * (sold / p.shares);
        state.balance += proceeds;
        record(p, sold, costPart, proceeds, "Sold");
        p.shares -= sold;
        p.cost -= costPart;
        if (p.shares <= 1e-6) state.positions.remove(p);
        save();
        return new Fill(sold, proceeds, null);
    }

    /** Pay out positions of markets that have resolved. Called from the feed thread every few seconds. */
    void settle(Function<String, Optional<Outcome>> resolution) {
        List<Position> ended;
        synchronized (this) {
            long now = System.currentTimeMillis() / 1000;
            ended = state.positions.stream().filter(p -> now >= p.windowEnd).toList();
        }
        for (Position p : ended) {
            // Network call outside the lock, so trading never waits on it.
            Optional<Outcome> winner = resolution.apply(p.slug);
            if (winner.isEmpty()) continue;
            synchronized (this) {
                if (!state.positions.contains(p)) continue;
                boolean won = winner.get() == p.outcome;
                double payout = won ? p.shares : 0;
                state.balance += payout;
                record(p, p.shares, p.cost, payout, won ? "Won" : "Lost");
                state.positions.remove(p);
                save();
            }
        }
    }

    public synchronized void reset() {
        state = new State();
        save();
    }

    private void record(Position p, double shares, double cost, double proceeds, String result) {
        Closed c = new Closed();
        c.title = p.title;
        c.outcome = p.outcome;
        c.shares = shares;
        c.cost = cost;
        c.proceeds = proceeds;
        c.result = result;
        c.time = System.currentTimeMillis();
        state.history.addFirst(c);
        while (state.history.size() > MAX_HISTORY) state.history.removeLast();
    }

    private void save() {
        if (file == null) return;
        try {
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, GSON.toJson(state));
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            LOGGER.warn("Couldn't save the paper wallet", e);
        }
    }
}
