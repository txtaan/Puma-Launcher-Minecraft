package dev.puma.polymarket.client;

import dev.puma.polymarket.market.Market;
import java.util.Locale;

/** Number and time formatting shared by the billboard and the trading screen. */
final class Fmt {
    private Fmt() {}

    static String percent(double p) {
        return Double.isNaN(p) ? "–" : Math.round(p * 100) + "%";
    }

    /** Down's percentage, rounded so that Up and Down always add up to 100%. */
    static String downPercent(double up) {
        return Double.isNaN(up) ? "–" : (100 - Math.round(up * 100)) + "%";
    }

    static String cents(double price) {
        if (Double.isNaN(price)) return "–";
        double c = price * 100;
        return (Math.abs(c - Math.round(c)) < 0.05 ? String.valueOf(Math.round(c)) : String.format(Locale.ROOT, "%.1f", c)) + "¢";
    }

    static String dollars(double d) {
        double cents = Math.round(d * 100) / 100.0;
        return (cents < 0 ? "-$" : "$") + String.format(Locale.ROOT, "%,.2f", Math.abs(cents));
    }

    /** With a + for gains; no sign when it rounds to zero. */
    static String signedDollars(double d) {
        return (Math.round(d * 100) > 0 ? "+" : "") + dollars(d);
    }

    static String shares(double s) {
        return String.format(Locale.ROOT, s >= 100 ? "%.0f" : "%.2f", s);
    }

    /** Time left in the window as m:ss. */
    static String countdown(Market market, long nowMillis) {
        long left = Math.max(0, market.endSec() * 1000 - nowMillis);
        long s = (left + 999) / 1000;
        return (s / 60) + ":" + String.format(Locale.ROOT, "%02d", s % 60);
    }

    /** "7:35AM-7:40AM ET" from "Bitcoin Up or Down - October 30, 7:35AM-7:40AM ET". */
    static String times(String title) {
        int comma = title.lastIndexOf(", ");
        return comma >= 0 ? title.substring(comma + 2) : title;
    }

    /** "October 30, 7:35AM-7:40AM ET" from "Bitcoin Up or Down - October 30, 7:35AM-7:40AM ET". */
    static String window(Market market) {
        String title = market.title();
        int dash = title.indexOf(" - ");
        return dash >= 0 ? title.substring(dash + 3) : title;
    }
}
