package dev.puma.polymarket.network;

import dev.puma.polymarket.PolymarketBillboard;
import dev.puma.polymarket.trading.Trading;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.ChannelBuilder;
import net.minecraftforge.network.NetworkDirection;
import net.minecraftforge.network.PacketDistributor;
import net.minecraftforge.network.SimpleChannel;

/** The mod's network channel. The client only asks; every trade is checked and carried out on the server. */
public final class Network {
    public static final SimpleChannel CHANNEL = ChannelBuilder
        .named(Identifier.fromNamespaceAndPath(PolymarketBillboard.MODID, "trading"))
        .networkProtocolVersion(1)
        .simpleChannel();

    private Network() {}

    public static void init() {
        CHANNEL.messageBuilder(Messages.Register.class, NetworkDirection.PLAY_TO_SERVER)
            .encoder(Messages.Register::write).decoder(Messages.Register::read)
            .consumerMainThread((m, c) -> Trading.register(c.getSender(), m.name())).add();
        CHANNEL.messageBuilder(Messages.Buy.class, NetworkDirection.PLAY_TO_SERVER)
            .encoder(Messages.Buy::write).decoder(Messages.Buy::read)
            .consumerMainThread((m, c) -> Trading.buy(c.getSender(), m.outcome(), m.ingots(), m.board())).add();
        CHANNEL.messageBuilder(Messages.Sell.class, NetworkDirection.PLAY_TO_SERVER)
            .encoder(Messages.Sell::write).decoder(Messages.Sell::read)
            .consumerMainThread((m, c) -> Trading.sell(c.getSender(), m.positionId())).add();
        CHANNEL.messageBuilder(Messages.Refresh.class, NetworkDirection.PLAY_TO_SERVER)
            .encoder(Messages.Refresh::write).decoder(Messages.Refresh::read)
            .consumerMainThread((m, c) -> Trading.refresh(c.getSender(), m.board())).add();

        CHANNEL.messageBuilder(Messages.Profile.class, NetworkDirection.PLAY_TO_CLIENT)
            .encoder(Messages.Profile::write).decoder(Messages.Profile::read)
            .consumerMainThread((m, c) -> {
                ClientState.profile = m;
                ClientState.version++;
            }).add();
        CHANNEL.messageBuilder(Messages.Leaderboard.class, NetworkDirection.PLAY_TO_CLIENT)
            .encoder(Messages.Leaderboard::write).decoder(Messages.Leaderboard::read)
            .consumerMainThread((m, c) -> {
                ClientState.leaderboard = m;
                ClientState.version++;
            }).add();
        CHANNEL.messageBuilder(Messages.Result.class, NetworkDirection.PLAY_TO_CLIENT)
            .encoder(Messages.Result::write).decoder(Messages.Result::read)
            .consumerMainThread((m, c) -> {
                ClientState.result = m;
                ClientState.resultTime = System.currentTimeMillis();
                ClientState.version++;
            }).add();
    }

    public static void toServer(Object message) {
        CHANNEL.send(message, PacketDistributor.SERVER.noArg());
    }

    public static void toPlayer(ServerPlayer player, Object message) {
        CHANNEL.send(message, PacketDistributor.PLAYER.with(player));
    }

    public static void toAll(Object message) {
        CHANNEL.send(message, PacketDistributor.ALL.noArg());
    }
}
