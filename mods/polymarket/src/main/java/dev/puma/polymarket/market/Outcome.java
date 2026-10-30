package dev.puma.polymarket.market;

public enum Outcome {
    UP,
    DOWN;

    public String label() {
        return this == UP ? "Up" : "Down";
    }
}
