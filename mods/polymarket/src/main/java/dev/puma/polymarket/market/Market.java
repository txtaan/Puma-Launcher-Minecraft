package dev.puma.polymarket.market;

/** One "Bitcoin Up or Down" market: a five-minute window and the tokens of its two outcomes. */
public record Market(String slug, String title, long startSec, long endSec, String upToken, String downToken) {
    public String token(Outcome outcome) {
        return outcome == Outcome.UP ? upToken : downToken;
    }

    public String url() {
        return "https://polymarket.com/event/" + slug;
    }
}
