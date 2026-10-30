package dev.puma.polymarket.client;

import dev.puma.polymarket.network.Messages;
import dev.puma.polymarket.network.Network;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;

/** Client-only actions called from common code, kept in their own class so servers never load client classes. */
public final class ClientAccess {
    private ClientAccess() {}

    public static void openTradeScreen(BlockPos board) {
        Network.toServer(new Messages.Refresh(board));
        Minecraft.getInstance().gui.setScreen(new TradeScreen(board));
    }
}
