package dev.puma.polymarket.market;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.logging.LogUtils;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;

/**
 * Follows Polymarket's "Bitcoin Up or Down - 5 minute" markets: finds the market of the current window, polls both
 * order books every second and records the Up probability, so the billboards and the trading screen can read the
 * latest {@link Snapshot} at any time without waiting on the network.
 *
 * Only Polymarket's public read endpoints are used (Gamma for markets, the CLOB for order books); no account is needed.
 */
public final class MarketFeed {
    private static final Logger LOGGER = LogUtils.getLogger();
    private static final String GAMMA = "https://gamma-api.polymarket.com";
    private static final String CLOB = "https://clob.polymarket.com";
    /** Series slug prefix; each market is "btc-updown-5m-<window start in Unix seconds>". */
    private static final String SLUG_PREFIX = "btc-updown-5m-";
    public static final long WINDOW_SECONDS = 300;
    private static final int MAX_POINTS = 600;

    private static final MarketFeed INSTANCE = new MarketFeed();

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final Map<Long, Market> markets = new ConcurrentHashMap<>();
    private final List<Snapshot.Point> history = new ArrayList<>();
    private volatile Snapshot snapshot = Snapshot.LOADING;
    private ScheduledExecutorService executor;
    private long historyWindow = -1;
    private long lastResolveCheck;
    /** When a billboard was last drawn or the trading screen last open; the feed rests when nothing shows it. */
    private volatile long lastUsed;

    public static MarketFeed get() {
        return INSTANCE;
    }

    public Snapshot snapshot() {
        return snapshot;
    }

    /** Something is showing the market: keep the data fresh (starts the feed the first time). */
    public void touch() {
        lastUsed = System.currentTimeMillis();
        if (executor == null) start();
    }

    /** Start polling (once). Safe to call again. */
    public synchronized void start() {
        if (executor != null) return;
        executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "Polymarket feed");
            t.setDaemon(true);
            return t;
        });
        executor.scheduleWithFixedDelay(this::tick, 0, 1, TimeUnit.SECONDS);
    }

    public static long windowStart(long epochSeconds) {
        return epochSeconds / WINDOW_SECONDS * WINDOW_SECONDS;
    }

    private void tick() {
        try {
            // Settle paper positions of markets that have ended, every 10 seconds, even when nothing is on screen.
            if (System.currentTimeMillis() - lastResolveCheck > 10_000) {
                lastResolveCheck = System.currentTimeMillis();
                PaperWallet.get().settle(this::resolution);
            }
            if (System.currentTimeMillis() - lastUsed > 15_000) return;
            long now = Instant.now().getEpochSecond();
            long start = windowStart(now);
            Market market = market(start).orElse(null);
            if (market == null) {
                snapshot = new Snapshot(null, Book.EMPTY, Book.EMPTY, List.of(), "Waiting for the next market…", System.currentTimeMillis());
                return;
            }
            if (historyWindow != start) {
                history.clear();
                historyWindow = start;
                seedHistory(market);
            }
            Book up = book(market.upToken());
            Book down = book(market.downToken());
            Snapshot next = new Snapshot(market, up, down, List.of(), null, System.currentTimeMillis());
            double p = next.upProbability();
            if (!Double.isNaN(p)) {
                history.add(new Snapshot.Point(System.currentTimeMillis(), p));
                if (history.size() > MAX_POINTS) history.removeFirst();
            }
            snapshot = new Snapshot(market, up, down, List.copyOf(history), null, System.currentTimeMillis());
        } catch (Exception e) {
            LOGGER.debug("Polymarket feed update failed", e);
            Snapshot last = snapshot;
            snapshot = new Snapshot(last.market(), last.up(), last.down(), last.history(), "Can't reach Polymarket: " + e.getMessage(), last.updatedMillis());
        }
    }

    /** The market of the window starting at {@code start}, looked up once and then cached. */
    public Optional<Market> market(long start) throws IOException, InterruptedException {
        Market cached = markets.get(start);
        if (cached != null) return Optional.of(cached);
        JsonElement events = getJson(GAMMA + "/events?slug=" + SLUG_PREFIX + start);
        if (!events.isJsonArray() || events.getAsJsonArray().isEmpty()) return Optional.empty();
        JsonObject event = events.getAsJsonArray().get(0).getAsJsonObject();
        JsonObject m = event.getAsJsonArray("markets").get(0).getAsJsonObject();
        JsonArray tokens = JsonParser.parseString(m.get("clobTokenIds").getAsString()).getAsJsonArray();
        JsonArray outcomes = JsonParser.parseString(m.get("outcomes").getAsString()).getAsJsonArray();
        // Outcomes are ["Up", "Down"]; read the order anyway rather than assume it.
        int upIndex = "up".equalsIgnoreCase(outcomes.get(0).getAsString()) ? 0 : 1;
        Market market = new Market(
            event.get("slug").getAsString(),
            event.get("title").getAsString(),
            start,
            start + WINDOW_SECONDS,
            tokens.get(upIndex).getAsString(),
            tokens.get(1 - upIndex).getAsString()
        );
        markets.put(start, market);
        return Optional.of(market);
    }

    /** The order book of one outcome token, best prices first. */
    private Book book(String token) throws IOException, InterruptedException {
        JsonObject json = getJson(CLOB + "/book?token_id=" + token).getAsJsonObject();
        List<Book.Level> bids = levels(json.getAsJsonArray("bids"));
        List<Book.Level> asks = levels(json.getAsJsonArray("asks"));
        bids.sort((a, b) -> Double.compare(b.price(), a.price()));
        asks.sort((a, b) -> Double.compare(a.price(), b.price()));
        JsonElement last = json.get("last_trade_price");
        double lastTrade = last == null || last.isJsonNull() || last.getAsString().isEmpty() ? Double.NaN : last.getAsDouble();
        return new Book(List.copyOf(bids), List.copyOf(asks), lastTrade);
    }

    private static List<Book.Level> levels(JsonArray array) {
        List<Book.Level> out = new ArrayList<>();
        if (array == null) return out;
        for (JsonElement e : array) {
            JsonObject o = e.getAsJsonObject();
            out.add(new Book.Level(o.get("price").getAsDouble(), o.get("size").getAsDouble()));
        }
        return out;
    }

    /** Fill the chart with the prices Polymarket recorded before we started watching this window. */
    private void seedHistory(Market market) {
        try {
            long now = Instant.now().getEpochSecond();
            JsonObject json = getJson(CLOB + "/prices-history?market=" + market.upToken() + "&startTs=" + market.startSec() + "&endTs=" + now + "&fidelity=1").getAsJsonObject();
            for (JsonElement e : json.getAsJsonArray("history")) {
                JsonObject o = e.getAsJsonObject();
                history.add(new Snapshot.Point(o.get("t").getAsLong() * 1000, o.get("p").getAsDouble()));
            }
        } catch (Exception e) {
            LOGGER.debug("No price history for {}", market.slug(), e);
        }
    }

    /**
     * How a market ended: the winning outcome once Polymarket has closed it, or empty while it is still open or being
     * resolved (usually a minute or two after the window ends).
     */
    public Optional<Outcome> resolution(String slug) {
        try {
            JsonElement events = getJson(GAMMA + "/events?slug=" + slug);
            if (!events.isJsonArray() || events.getAsJsonArray().isEmpty()) return Optional.empty();
            JsonObject m = events.getAsJsonArray().get(0).getAsJsonObject().getAsJsonArray("markets").get(0).getAsJsonObject();
            if (!m.has("closed") || !m.get("closed").getAsBoolean()) return Optional.empty();
            JsonArray prices = JsonParser.parseString(m.get("outcomePrices").getAsString()).getAsJsonArray();
            JsonArray outcomes = JsonParser.parseString(m.get("outcomes").getAsString()).getAsJsonArray();
            for (int i = 0; i < prices.size(); i++) {
                if (prices.get(i).getAsDouble() >= 0.999) {
                    return Optional.of("up".equalsIgnoreCase(outcomes.get(i).getAsString()) ? Outcome.UP : Outcome.DOWN);
                }
            }
        } catch (Exception e) {
            LOGGER.debug("Couldn't check how {} resolved", slug, e);
        }
        return Optional.empty();
    }

    private JsonElement getJson(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(10))
            .header("Accept", "application/json")
            .header("User-Agent", "PolymarketBillboard/1.0 (Minecraft mod)")
            .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IOException("HTTP " + response.statusCode());
        return JsonParser.parseString(response.body());
    }
}
