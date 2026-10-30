package dev.puma.polymarket.market;

import java.util.List;

/**
 * What the billboard and the trading screen show, replaced as a whole every time the feed updates.
 *
 * @param market  the market of the current five-minute window, or null while it is being looked up
 * @param up      order book of the Up outcome
 * @param down    order book of the Down outcome
 * @param history the Up probability over the window so far, oldest first
 * @param error   why there is no data (no connection, market not found), or null
 */
public record Snapshot(Market market, Book up, Book down, List<Point> history, String error, long updatedMillis) {
    public record Point(long timeMillis, double up) {}

    public static final Snapshot LOADING = new Snapshot(null, Book.EMPTY, Book.EMPTY, List.of(), null, 0);

    public Book book(Outcome outcome) {
        return outcome == Outcome.UP ? up : down;
    }

    /** Up probability now (Down is 1 minus it). */
    public double upProbability() {
        double p = up.probability();
        if (!Double.isNaN(p)) return p;
        double d = down.probability();
        return Double.isNaN(d) ? Double.NaN : 1 - d;
    }
}
