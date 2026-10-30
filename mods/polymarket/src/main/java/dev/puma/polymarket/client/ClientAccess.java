package dev.puma.polymarket.client;

import net.minecraft.client.Minecraft;

/** Client-only actions called from common code, kept in their own class so servers never load client classes. */
public final class ClientAccess {
    private ClientAccess() {}

    public static void openTradeScreen() {
        Minecraft.getInstance().gui.setScreen(new TradeScreen());
    }
}
