package dev.puma.polymarket.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import dev.puma.polymarket.block.BillboardBlock;
import dev.puma.polymarket.block.BillboardBlockEntity;
import dev.puma.polymarket.market.MarketFeed;
import dev.puma.polymarket.market.Snapshot;
import dev.puma.polymarket.network.ClientState;
import dev.puma.polymarket.network.Messages;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.Font;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.blockentity.state.BlockEntityRenderState;
import net.minecraft.client.renderer.feature.ModelFeatureRenderer;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.util.LightCoordsUtil;
import net.minecraft.world.phys.Vec3;

/**
 * Draws the billboard's screen above the post: the {@link BoardTexture} (background and live chart) and, on top of it,
 * the market's title, time window, countdown, Up/Down probabilities and prices; and, to its right, the leaderboard of
 * the server's traders. Layout units: 100 per block, origin at the screen's top-left corner, y pointing down (like the
 * texture).
 */
public class BillboardRenderer implements BlockEntityRenderer<BillboardBlockEntity, BillboardRenderer.State> {
    public static class State extends BlockEntityRenderState {
        Direction facing = Direction.SOUTH;
    }

    private static final float UNIT = 0.01F;
    private static final float W = BoardTexture.WIDTH;
    private static final float H = BoardTexture.HEIGHT;
    /** Screen thickness in layout units, and how far the front sits in front of the post's centre. */
    private static final float DEPTH = 8;
    private static final float FRONT = 10;
    private static final int GRAY = 0xFF9CA3AF;
    private static final int WHITE = 0xFFFFFFFF;
    private static final int AMBER = 0xFFFBBF24;
    /** Gap between the screen and the leaderboard panel. */
    private static final float PANEL_GAP = 20;

    private final Font font;

    public BillboardRenderer(BlockEntityRendererProvider.Context context) {
        this.font = context.font();
    }

    @Override
    public State createRenderState() {
        return new State();
    }

    @Override
    public void extractRenderState(BillboardBlockEntity blockEntity, State state, float partialTicks, Vec3 cameraPosition,
                                   ModelFeatureRenderer.CrumblingOverlay breakProgress) {
        BlockEntityRenderer.super.extractRenderState(blockEntity, state, partialTicks, cameraPosition, breakProgress);
        state.facing = blockEntity.getBlockState().getValue(BillboardBlock.FACING);
        MarketFeed.get().touch();
    }

    @Override
    public void submit(State state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
        BoardTexture.refresh();
        Snapshot snapshot = MarketFeed.get().snapshot();

        poseStack.pushPose();
        poseStack.translate(0.5F, 0, 0.5F);
        poseStack.rotate(Axis.YP.rotationDegrees(-state.facing.toYRot()));
        poseStack.translate(-BillboardBlock.SCREEN_WIDTH / 2, BillboardBlock.SCREEN_TOP, FRONT * UNIT);
        poseStack.scale(UNIT, -UNIT, UNIT);

        int light = state.lightCoords;
        collector.submitCustomGeometry(poseStack, RenderTypes.text(BoardTexture.ID), (pose, buffer) -> box(buffer, pose, 0, W, light));
        drawText(poseStack, collector, snapshot);

        // The leaderboard panel, to the right of the screen.
        float px = W + PANEL_GAP;
        float pw = BoardTexture.PANEL_WIDTH;
        poseStack.pushPose();
        poseStack.translate(px, 0, 0);
        collector.submitCustomGeometry(poseStack, RenderTypes.text(BoardTexture.PANEL_ID), (pose, buffer) -> box(buffer, pose, 0, pw, light));
        drawLeaderboard(poseStack, collector, pw);
        poseStack.popPose();
        poseStack.popPose();
    }

    /** A panel of the given width: the texture on the front (lit like a screen), frame colour on the back and edges. */
    private static void box(VertexConsumer buffer, PoseStack.Pose pose, float x0, float x1, int light) {
        quad(buffer, pose, x0, H, 0, x1, H, 0, x1, 0, 0, x0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, LightCoordsUtil.FULL_BRIGHT);
        float u = BoardTexture.FRAME_U, v = BoardTexture.FRAME_V, z = -DEPTH;
        quad(buffer, pose, x1, H, z, x0, H, z, x0, 0, z, x1, 0, z, u, v, u, v, u, v, u, v, light);
        quad(buffer, pose, x0, 0, z, x0, 0, 0, x1, 0, 0, x1, 0, z, u, v, u, v, u, v, u, v, light);
        quad(buffer, pose, x0, H, 0, x0, H, z, x1, H, z, x1, H, 0, u, v, u, v, u, v, u, v, light);
        quad(buffer, pose, x0, H, z, x0, H, 0, x0, 0, 0, x0, 0, z, u, v, u, v, u, v, u, v, light);
        quad(buffer, pose, x1, H, 0, x1, H, z, x1, 0, z, x1, 0, 0, u, v, u, v, u, v, u, v, light);
    }

    private void drawLeaderboard(PoseStack pose, SubmitNodeCollector out, float pw) {
        Messages.Leaderboard board = ClientState.leaderboard;
        text(pose, out, Component.literal("Top traders").withStyle(ChatFormatting.BOLD).getVisualOrderText(), 14, 18, 2.2F, AMBER, Align.LEFT);
        text(pose, out, "Profit in gold", 14, 42, 1.25F, GRAY, Align.LEFT);
        if (board.entries().isEmpty()) {
            text(pose, out, "No traders yet", pw / 2, 120, 1.5F, GRAY, Align.CENTER_MIDDLE);
            text(pose, out, "Right-click the post", pw / 2, 140, 1.2F, GRAY, Align.CENTER_MIDDLE);
            text(pose, out, "to register", pw / 2, 154, 1.2F, GRAY, Align.CENTER_MIDDLE);
        }
        int rank = 0;
        for (Messages.LeaderboardEntry e : board.entries()) {
            if (rank >= BoardTexture.PANEL_ROWS) break;
            float y = BoardTexture.PANEL_FIRST_ROW + rank * BoardTexture.PANEL_ROW_HEIGHT;
            int color = rank == 0 ? AMBER : WHITE;
            text(pose, out, String.valueOf(rank + 1), 16, y, 1.5F, color, Align.LEFT);
            String pnl = (Math.round(e.pnl() * 10) > 0 ? "+" : "") + TradeScreen.gold(e.pnl());
            float pnlWidth = font.width(pnl) * 1.5F;
            String name = font.plainSubstrByWidth(e.name(), (int) ((pw - 40 - 16 - pnlWidth - 8) / 1.5F));
            text(pose, out, name, 40, y, 1.5F, color, Align.LEFT);
            text(pose, out, pnl, pw - 16, y, 1.5F, e.pnl() >= 0 ? BoardTexture.UP : BoardTexture.DOWN, Align.RIGHT);
            rank++;
        }
        String footer = board.traders() == 1 ? "1 trader" : board.traders() + " traders";
        text(pose, out, footer, pw / 2, 284, 1.2F, GRAY, Align.CENTER_MIDDLE);
    }

    private void drawText(PoseStack pose, SubmitNodeCollector out, Snapshot s) {
        long now = System.currentTimeMillis();
        text(pose, out, Component.literal("B").withStyle(ChatFormatting.BOLD).getVisualOrderText(), 44, 44, 2.2F, WHITE, Align.CENTER_MIDDLE);
        text(pose, out, "Bitcoin Up or Down", 72, 22, 2.4F, WHITE, Align.LEFT);
        if (s.market() == null) {
            text(pose, out, s.error() != null ? s.error() : "Connecting to Polymarket…", W / 2, (BoardTexture.CHART_Y0 + BoardTexture.CHART_Y1) / 2F, 1.6F, GRAY, Align.CENTER_MIDDLE);
        } else {
            text(pose, out, "5 min · " + Fmt.window(s.market()), 72, 49, 1.4F, GRAY, Align.LEFT);
            text(pose, out, Fmt.countdown(s.market(), now), 476, 18, 3.2F, AMBER, Align.RIGHT);
            text(pose, out, "left", 476, 50, 1.2F, GRAY, Align.RIGHT);

            double up = s.upProbability();
            text(pose, out, "Up " + Fmt.percent(up), 24, 74, 2.8F, BoardTexture.UP, Align.LEFT);
            text(pose, out, "Down " + Fmt.downPercent(up), 476, 74, 2.8F, BoardTexture.DOWN, Align.RIGHT);
            text(pose, out, "Buy " + Fmt.cents(s.up().bestAsk()), 24, 100, 1.3F, GRAY, Align.LEFT);
            text(pose, out, "Buy " + Fmt.cents(s.down().bestAsk()), 476, 100, 1.3F, GRAY, Align.RIGHT);
            for (int pct : new int[] {100, 50, 0}) {
                text(pose, out, pct + "%", 480, BoardTexture.chartY(pct / 100.0) - 4, 1.0F, GRAY, Align.LEFT);
            }
            if (s.history().isEmpty()) {
                text(pose, out, "Waiting for prices…", W / 2, (BoardTexture.CHART_Y0 + BoardTexture.CHART_Y1) / 2F, 1.4F, GRAY, Align.CENTER_MIDDLE);
            }
        }
        text(pose, out, "Right-click the post to trade with gold", 24, 274, 1.15F, GRAY, Align.LEFT);
        FormattedCharSequence powered = Component.literal("Powered by ").withColor(GRAY & 0xFFFFFF)
            .append(Component.literal("Polymarket").withStyle(ChatFormatting.BOLD).withColor(WHITE & 0xFFFFFF))
            .getVisualOrderText();
        text(pose, out, powered, 476, 272, 1.5F, WHITE, Align.RIGHT);
    }

    private enum Align { LEFT, RIGHT, CENTER_MIDDLE }

    private void text(PoseStack pose, SubmitNodeCollector out, String s, float x, float y, float scale, int color, Align align) {
        text(pose, out, Component.literal(s).getVisualOrderText(), x, y, scale, color, align);
    }

    private void text(PoseStack pose, SubmitNodeCollector out, FormattedCharSequence s, float x, float y, float scale, int color, Align align) {
        float width = font.width(s) * scale;
        float left = switch (align) {
            case LEFT -> x;
            case RIGHT -> x - width;
            case CENTER_MIDDLE -> x - width / 2;
        };
        float top = align == Align.CENTER_MIDDLE ? y - 4 * scale : y;
        pose.pushPose();
        pose.translate(left, top, 0.5F);
        pose.scale(scale, scale, 1);
        out.submitText(pose, 0, 0, s, false, Font.DisplayMode.POLYGON_OFFSET, LightCoordsUtil.FULL_BRIGHT, color, 0, 0);
        pose.popPose();
    }

    private static void quad(VertexConsumer buffer, PoseStack.Pose pose,
                             float x0, float y0, float z0, float x1, float y1, float z1,
                             float x2, float y2, float z2, float x3, float y3, float z3,
                             float u0, float v0, float u1, float v1, float u2, float v2, float u3, float v3, int light) {
        buffer.addVertex(pose, x0, y0, z0).setColor(-1).setUv(u0, v0).setLight(light);
        buffer.addVertex(pose, x1, y1, z1).setColor(-1).setUv(u1, v1).setLight(light);
        buffer.addVertex(pose, x2, y2, z2).setColor(-1).setUv(u2, v2).setLight(light);
        buffer.addVertex(pose, x3, y3, z3).setColor(-1).setUv(u3, v3).setLight(light);
    }

    @Override
    public boolean shouldRenderOffScreen() {
        return true;
    }

    @Override
    public int getViewDistance() {
        return 128;
    }
}
