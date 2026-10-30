package dev.puma.polymarket.market;

import java.util.List;

/**
 * One side of a market's order book: price levels sorted best first (highest bid, lowest ask).
 * Prices are probabilities from 0 to 1; sizes are shares.
 */
public record Book(List<Level> bids, List<Level> asks, double lastTrade) {
    public record Level(double price, double size) {}

    public static final Book EMPTY = new Book(List.of(), List.of(), Double.NaN);

    public double bestBid() {
        return bids.isEmpty() ? Double.NaN : bids.getFirst().price();
    }

    public double bestAsk() {
        return asks.isEmpty() ? Double.NaN : asks.getFirst().price();
    }

    /**
     * The probability Polymarket shows: the midpoint of the best bid and ask, or the last trade when the spread is
     * wider than 10¢ (or one side of the book is empty). A last trade outside the book is stale, so it is kept between
     * the best bid and the best ask: in a market's last seconds the book can be down to one side, an ask at 0.1¢, while
     * the last trade is still at 99.9¢.
     */
    public double probability() {
        double bid = bestBid();
        double ask = bestAsk();
        if (!Double.isNaN(bid) && !Double.isNaN(ask) && ask - bid <= 0.10 + 1e-9) return (bid + ask) / 2;
        if (!Double.isNaN(lastTrade)) {
            double p = lastTrade;
            if (!Double.isNaN(ask)) p = Math.min(p, ask);
            if (!Double.isNaN(bid)) p = Math.max(p, bid);
            return p;
        }
        if (!Double.isNaN(bid) && !Double.isNaN(ask)) return (bid + ask) / 2;
        return Double.NaN;
    }
}
