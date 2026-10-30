package dev.puma.polymarket.market;

/** Fills against a Polymarket order book, walking the price levels like a market order. Amounts are in gold. */
public final class Fills {
    private Fills() {}

    /** Shares bought and gold spent. */
    public record Fill(double shares, double gold) {}

    /** Spend up to {@code stake} gold on shares at the asks, cheapest first. */
    public static Fill buy(Book book, double stake) {
        double left = stake;
        double shares = 0;
        for (Book.Level level : book.asks()) {
            if (left <= 1e-9) break;
            double take = Math.min(level.size(), left / level.price());
            shares += take;
            left -= take * level.price();
        }
        return new Fill(shares, stake - left);
    }

    /** Sell up to {@code shares} at the bids, highest first. */
    public static Fill sell(Book book, double shares) {
        double left = shares;
        double gold = 0;
        for (Book.Level level : book.bids()) {
            if (left <= 1e-9) break;
            double take = Math.min(level.size(), left);
            gold += take * level.price();
            left -= take;
        }
        return new Fill(shares - left, gold);
    }
}
