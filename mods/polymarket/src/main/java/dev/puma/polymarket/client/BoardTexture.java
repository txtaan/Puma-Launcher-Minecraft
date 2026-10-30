package dev.puma.polymarket.client;

import com.mojang.blaze3d.platform.NativeImage;
import dev.puma.polymarket.PolymarketBillboard;
import dev.puma.polymarket.market.MarketFeed;
import dev.puma.polymarket.market.Snapshot;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

/**
 * The billboard's picture: background, frame, Bitcoin badge and the chart of the Up probability, redrawn whenever the
 * market data changes. Text is drawn on top of it with Minecraft's font. Every billboard, and the chart in the trading
 * screen, shows this one texture.
 */
public final class BoardTexture {
    public static final Identifier ID = Identifier.fromNamespaceAndPath(PolymarketBillboard.MODID, "dynamic/board");
    /** Size in pixels; one pixel is one unit of the billboard's layout (100 units per block). */
    public static final int WIDTH = 500;
    public static final int HEIGHT = 300;
    /** The chart's plotting area. */
    public static final int CHART_X0 = 24;
    public static final int CHART_Y0 = 116;
    public static final int CHART_X1 = 476;
    public static final int CHART_Y1 = 262;
    /** A pixel of plain frame colour, for the screen's back and edges. */
    public static final float FRAME_U = 1.5F / WIDTH;
    public static final float FRAME_V = 1.5F / HEIGHT;

    public static final int UP = 0xFF22C55E;
    public static final int DOWN = 0xFFEF4444;
    public static final int BLUE = 0xFF3B82F6;
    public static final int BITCOIN = 0xFFF7931A;
    private static final int FRAME = 0xFF1B2130;
    private static final int BG_TOP = 0xFF111827;
    private static final int BG_BOTTOM = 0xFF0A0E16;
    private static final int CHART_BG = 0xFF0D1320;
    private static final int GRID = 0xFF1A2333;
    private static final int MIDLINE = 0xFF3A4658;

    /** The leaderboard panel beside the screen: a fixed background, the names are drawn as text. */
    public static final Identifier PANEL_ID = Identifier.fromNamespaceAndPath(PolymarketBillboard.MODID, "dynamic/leaderboard");
    public static final int PANEL_WIDTH = 240;
    public static final int PANEL_ROWS = 9;
    public static final int PANEL_FIRST_ROW = 66;
    public static final int PANEL_ROW_HEIGHT = 22;

    private static DynamicTexture texture;
    private static DynamicTexture panel;
    private static long drawnFor = -1;
    private static long drawnSecond = -1;

    private BoardTexture() {}

    /** Make sure the texture exists and shows the latest data. Call on the render thread. */
    public static void refresh() {
        if (texture == null) {
            texture = new DynamicTexture(() -> "Polymarket billboard", WIDTH, HEIGHT, true);
            Minecraft.getInstance().getTextureManager().register(ID, texture);
            panel = new DynamicTexture(() -> "Polymarket leaderboard", PANEL_WIDTH, HEIGHT, true);
            paintPanel(panel.getPixels());
            panel.upload();
            Minecraft.getInstance().getTextureManager().register(PANEL_ID, panel);
        }
        Snapshot snapshot = MarketFeed.get().snapshot();
        long second = System.currentTimeMillis() / 1000;
        if (snapshot.updatedMillis() == drawnFor && second == drawnSecond) return;
        drawnFor = snapshot.updatedMillis();
        drawnSecond = second;
        paint(texture.getPixels(), snapshot);
        texture.upload();
    }

    private static void paint(NativeImage img, Snapshot snapshot) {
        // Background with a soft vertical gradient, and a frame.
        for (int y = 0; y < HEIGHT; y++) {
            int c = lerpColor(BG_TOP, BG_BOTTOM, y / (float) HEIGHT);
            for (int x = 0; x < WIDTH; x++) img.setPixel(x, y, c);
        }
        rect(img, 0, 0, WIDTH, 4, FRAME);
        rect(img, 0, HEIGHT - 4, WIDTH, 4, FRAME);
        rect(img, 0, 0, 4, HEIGHT, FRAME);
        rect(img, WIDTH - 4, 0, 4, HEIGHT, FRAME);
        rect(img, 4, 4, WIDTH - 8, 2, BLUE);

        // Bitcoin badge: an orange disc (the "B" is drawn as text).
        disc(img, 44, 44, 18, BITCOIN);

        // Chart: panel, grid every 25% and every minute, dashed 50% line.
        rect(img, CHART_X0 - 6, CHART_Y0 - 6, CHART_X1 - CHART_X0 + 12, CHART_Y1 - CHART_Y0 + 12, CHART_BG);
        for (int i = 0; i <= 4; i++) {
            int y = CHART_Y1 - (CHART_Y1 - CHART_Y0) * i / 4;
            if (i == 2) {
                for (int x = CHART_X0; x < CHART_X1; x += 8) rect(img, x, y, 4, 1, MIDLINE);
            } else {
                rect(img, CHART_X0, y, CHART_X1 - CHART_X0, 1, GRID);
            }
        }
        for (int m = 1; m < 5; m++) {
            int x = CHART_X0 + (CHART_X1 - CHART_X0) * m / 5;
            rect(img, x, CHART_Y0, 1, CHART_Y1 - CHART_Y0, GRID);
        }

        if (snapshot.market() == null || snapshot.history().isEmpty()) return;
        long start = snapshot.market().startSec() * 1000;
        long span = MarketFeed.WINDOW_SECONDS * 1000;
        List<Snapshot.Point> points = snapshot.history();
        double now = snapshot.upProbability();
        int line = Double.isNaN(now) || now >= 0.5 ? UP : DOWN;

        // Area under the line, fading towards the bottom.
        int[] ys = new int[CHART_X1 - CHART_X0 + 1];
        java.util.Arrays.fill(ys, Integer.MIN_VALUE);
        int lastX = Integer.MIN_VALUE;
        for (int i = 0; i < points.size(); i++) {
            Snapshot.Point p = points.get(i);
            int x = chartX(p.timeMillis(), start, span);
            int y = chartY(p.up());
            if (i > 0 && lastX != Integer.MIN_VALUE) {
                Snapshot.Point q = points.get(i - 1);
                int x0 = chartX(q.timeMillis(), start, span);
                int y0 = chartY(q.up());
                // Step-free: interpolate between samples.
                for (int xx = Math.max(CHART_X0, x0); xx <= Math.min(CHART_X1, x); xx++) {
                    float t = x == x0 ? 1 : (xx - x0) / (float) (x - x0);
                    ys[xx - CHART_X0] = Math.round(y0 + (y - y0) * t);
                }
            } else if (x >= CHART_X0 && x <= CHART_X1) {
                ys[x - CHART_X0] = y;
            }
            lastX = x;
        }
        for (int i = 0; i < ys.length; i++) {
            if (ys[i] == Integer.MIN_VALUE) continue;
            for (int y = ys[i]; y <= CHART_Y1; y++) {
                float fade = 1 - (y - ys[i]) / (float) Math.max(1, CHART_Y1 - ys[i] + 40);
                blend(img, CHART_X0 + i, y, line, 0.28F * fade);
            }
        }
        // The line itself, 3 pixels thick.
        int prevX = Integer.MIN_VALUE;
        int prevY = 0;
        for (int i = 0; i < ys.length; i++) {
            if (ys[i] == Integer.MIN_VALUE) continue;
            int x = CHART_X0 + i;
            if (prevX != Integer.MIN_VALUE && x - prevX == 1) {
                int a = Math.min(prevY, ys[i]);
                int b = Math.max(prevY, ys[i]);
                for (int y = a; y <= b; y++) disc(img, x, y, 1.6F, line);
            } else {
                disc(img, x, ys[i], 1.6F, line);
            }
            prevX = x;
            prevY = ys[i];
        }
        // Where the price is now.
        if (prevX != Integer.MIN_VALUE) {
            disc(img, prevX, prevY, 7, (line & 0x00FFFFFF) | 0x55000000);
            disc(img, prevX, prevY, 4, line);
        }
    }

    private static void paintPanel(NativeImage img) {
        int w = PANEL_WIDTH;
        for (int y = 0; y < HEIGHT; y++) {
            int c = lerpColor(BG_TOP, BG_BOTTOM, y / (float) HEIGHT);
            for (int x = 0; x < w; x++) img.setPixel(x, y, c);
        }
        fill(img, w, 0, 0, w, 4, FRAME);
        fill(img, w, 0, HEIGHT - 4, w, 4, FRAME);
        fill(img, w, 0, 0, 4, HEIGHT, FRAME);
        fill(img, w, w - 4, 0, 4, HEIGHT, FRAME);
        fill(img, w, 4, 4, w - 8, 2, BITCOIN);
        fill(img, w, 14, PANEL_FIRST_ROW - 8, w - 28, 1, MIDLINE);
        for (int r = 0; r < PANEL_ROWS; r++) {
            if (r % 2 == 0) fill(img, w, 10, PANEL_FIRST_ROW + r * PANEL_ROW_HEIGHT - 4, w - 20, PANEL_ROW_HEIGHT, CHART_BG);
        }
    }

    private static void fill(NativeImage img, int imgWidth, int x, int y, int w, int h, int color) {
        for (int yy = Math.max(0, y); yy < Math.min(HEIGHT, y + h); yy++) {
            for (int xx = Math.max(0, x); xx < Math.min(imgWidth, x + w); xx++) img.setPixel(xx, yy, color);
        }
    }

    public static int chartX(long timeMillis, long startMillis, long spanMillis) {
        double f = (timeMillis - startMillis) / (double) spanMillis;
        return (int) Math.round(CHART_X0 + Math.max(0, Math.min(1, f)) * (CHART_X1 - CHART_X0));
    }

    public static int chartY(double probability) {
        return (int) Math.round(CHART_Y1 - Math.max(0, Math.min(1, probability)) * (CHART_Y1 - CHART_Y0));
    }

    private static void rect(NativeImage img, int x, int y, int w, int h, int color) {
        for (int yy = Math.max(0, y); yy < Math.min(HEIGHT, y + h); yy++) {
            for (int xx = Math.max(0, x); xx < Math.min(WIDTH, x + w); xx++) img.setPixel(xx, yy, color);
        }
    }

    /** A filled circle with a softened edge. */
    private static void disc(NativeImage img, float cx, float cy, float r, int color) {
        int alpha = color >>> 24;
        for (int y = (int) Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
            for (int x = (int) Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
                if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
                float d = (float) Math.hypot(x - cx, y - cy);
                float cover = Math.max(0, Math.min(1, r + 0.5F - d));
                if (cover > 0) blend(img, x, y, color | 0xFF000000, cover * alpha / 255F);
            }
        }
    }

    private static void blend(NativeImage img, int x, int y, int color, float amount) {
        if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || amount <= 0) return;
        int base = img.getPixel(x, y);
        img.setPixel(x, y, lerpColor(base, color | 0xFF000000, Math.min(1, amount)));
    }

    private static int lerpColor(int a, int b, float t) {
        int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
        int br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        int r = Math.round(ar + (br - ar) * t);
        int g = Math.round(ag + (bg - ag) * t);
        int bl = Math.round(ab + (bb - ab) * t);
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }
}
