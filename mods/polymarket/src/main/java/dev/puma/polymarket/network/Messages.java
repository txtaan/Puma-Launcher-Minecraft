package dev.puma.polymarket.network;

import dev.puma.polymarket.market.Outcome;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.network.FriendlyByteBuf;

/** The packets between the trading screen and the server. */
public final class Messages {
    private Messages() {}

    // ---- Client to server ----------------------------------------------------------------------------------------

    /** Pick a trader name (once). */
    public record Register(String name) {
        void write(FriendlyByteBuf b) {
            b.writeUtf(name, 32);
        }

        static Register read(FriendlyByteBuf b) {
            return new Register(b.readUtf(32));
        }
    }

    /** Buy an outcome of the current market with gold ingots, at a billboard. */
    public record Buy(Outcome outcome, int ingots, BlockPos board) {
        void write(FriendlyByteBuf b) {
            b.writeEnum(outcome);
            b.writeVarInt(ingots);
            b.writeBlockPos(board);
        }

        static Buy read(FriendlyByteBuf b) {
            return new Buy(b.readEnum(Outcome.class), b.readVarInt(), b.readBlockPos());
        }
    }

    /** Sell a whole open position at the current bids. */
    public record Sell(String positionId) {
        void write(FriendlyByteBuf b) {
            b.writeUtf(positionId, 64);
        }

        static Sell read(FriendlyByteBuf b) {
            return new Sell(b.readUtf(64));
        }
    }

    /** Ask for this player's profile and the leaderboard when the trading screen of the billboard at {@code board} opens. */
    public record Refresh(BlockPos board) {
        void write(FriendlyByteBuf b) {
            b.writeBlockPos(board);
        }

        static Refresh read(FriendlyByteBuf b) {
            return new Refresh(b.readBlockPos());
        }
    }

    // ---- Server to client ----------------------------------------------------------------------------------------

    public record PositionView(String id, String slug, String title, Outcome outcome, double shares, double cost, long windowEnd) {}

    public record ClosedView(String title, Outcome outcome, double cost, double payout, String result, long time) {}

    /** This player's trader profile; an empty name means they haven't registered yet. */
    public record Profile(String name, double pnl, int wins, int losses, int trades, int pendingNuggets, int rank,
                          List<PositionView> positions, List<ClosedView> history) {
        void write(FriendlyByteBuf b) {
            b.writeUtf(name, 32);
            b.writeDouble(pnl);
            b.writeVarInt(wins);
            b.writeVarInt(losses);
            b.writeVarInt(trades);
            b.writeVarInt(pendingNuggets);
            b.writeVarInt(rank);
            b.writeVarInt(positions.size());
            for (PositionView p : positions) {
                b.writeUtf(p.id(), 64);
                b.writeUtf(p.slug(), 128);
                b.writeUtf(p.title(), 256);
                b.writeEnum(p.outcome());
                b.writeDouble(p.shares());
                b.writeDouble(p.cost());
                b.writeLong(p.windowEnd());
            }
            b.writeVarInt(history.size());
            for (ClosedView c : history) {
                b.writeUtf(c.title(), 256);
                b.writeEnum(c.outcome());
                b.writeDouble(c.cost());
                b.writeDouble(c.payout());
                b.writeUtf(c.result(), 16);
                b.writeLong(c.time());
            }
        }

        static Profile read(FriendlyByteBuf b) {
            String name = b.readUtf(32);
            double pnl = b.readDouble();
            int wins = b.readVarInt(), losses = b.readVarInt(), trades = b.readVarInt(), pending = b.readVarInt(), rank = b.readVarInt();
            int n = b.readVarInt();
            List<PositionView> positions = new ArrayList<>(n);
            for (int i = 0; i < n; i++) {
                positions.add(new PositionView(b.readUtf(64), b.readUtf(128), b.readUtf(256), b.readEnum(Outcome.class), b.readDouble(), b.readDouble(), b.readLong()));
            }
            int h = b.readVarInt();
            List<ClosedView> history = new ArrayList<>(h);
            for (int i = 0; i < h; i++) {
                history.add(new ClosedView(b.readUtf(256), b.readEnum(Outcome.class), b.readDouble(), b.readDouble(), b.readUtf(16), b.readLong()));
            }
            return new Profile(name, pnl, wins, losses, trades, pending, rank, positions, history);
        }

        public boolean registered() {
            return !name.isEmpty();
        }
    }

    public record LeaderboardEntry(String name, double pnl, int trades, int wins) {}

    /** The best traders of the server, for the billboards' leaderboard and the screen. */
    public record Leaderboard(List<LeaderboardEntry> entries, int traders) {
        void write(FriendlyByteBuf b) {
            b.writeVarInt(traders);
            b.writeVarInt(entries.size());
            for (LeaderboardEntry e : entries) {
                b.writeUtf(e.name(), 32);
                b.writeDouble(e.pnl());
                b.writeVarInt(e.trades());
                b.writeVarInt(e.wins());
            }
        }

        static Leaderboard read(FriendlyByteBuf b) {
            int traders = b.readVarInt();
            int n = b.readVarInt();
            List<LeaderboardEntry> entries = new ArrayList<>(n);
            for (int i = 0; i < n; i++) entries.add(new LeaderboardEntry(b.readUtf(32), b.readDouble(), b.readVarInt(), b.readVarInt()));
            return new Leaderboard(entries, traders);
        }
    }

    /** The outcome of a request, for the screen's status line. */
    public record Result(boolean ok, String message) {
        void write(FriendlyByteBuf b) {
            b.writeBoolean(ok);
            b.writeUtf(message, 256);
        }

        static Result read(FriendlyByteBuf b) {
            return new Result(b.readBoolean(), b.readUtf(256));
        }
    }
}
