package dev.puma.polymarket.network;

import java.util.List;

/**
 * What the server last told this client: its trader profile, the leaderboard and the result of its last request.
 * Plain data (no client classes), written by the packet handlers and read by the screen and the billboards.
 */
public final class ClientState {
    private ClientState() {}

    /** Null until the server has answered. */
    public static volatile Messages.Profile profile;
    public static volatile Messages.Leaderboard leaderboard = new Messages.Leaderboard(List.of(), 0);
    public static volatile Messages.Result result;
    public static volatile long resultTime;
    /** Bumped on every update, so screens can tell when to rebuild. */
    public static volatile int version;
}
