package dev.puma.polymarket.client;

import dev.puma.polymarket.market.Book;
import dev.puma.polymarket.market.Market;
import dev.puma.polymarket.market.MarketFeed;
import dev.puma.polymarket.market.Outcome;
import dev.puma.polymarket.market.PaperWallet;
import dev.puma.polymarket.market.Snapshot;
import java.net.URI;
import java.util.List;
import java.util.Locale;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ConfirmLinkScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;

/**
 * Paper trading for the current "Bitcoin Up or Down - 5 minute" market: buy Up or Down for a dollar amount at the
 * best asks of Polymarket's real order book, sell open positions at the bids, and see results as markets resolve.
 */
public class TradeScreen extends Screen {
    private static final int PANEL_W = 340;
    private static final int PANEL_H = 236;
    private static final int[] PRESETS = {1, 5, 25, 100};
    private static final int BG = 0xF00D121C;
    private static final int LINE = 0xFF263042;
    private static final int GRAY = 0xFF9CA3AF;

    private EditBox amount;
    private String amountText = "10";
    private Button buyUp;
    private Button buyDown;
    private String positionsKey = "";
    private Component status;
    private long statusUntil;
    private int left;
    private int top;

    public TradeScreen() {
        super(Component.translatable("screen.polymarket_billboard.title"));
    }

    @Override
    protected void init() {
        left = (width - PANEL_W) / 2;
        top = Math.max(4, (height - PANEL_H) / 2);
        int y = top + 136;

        buyUp = addRenderableWidget(Button.builder(Component.literal("Buy Up"), b -> buy(Outcome.UP)).bounds(left + 10, y, 156, 20).build());
        buyDown = addRenderableWidget(Button.builder(Component.literal("Buy Down"), b -> buy(Outcome.DOWN)).bounds(left + 174, y, 156, 20).build());

        y += 24;
        amount = addRenderableWidget(new EditBox(font, left + 66, y, 62, 18, Component.literal("Amount")));
        amount.setValue(amountText);
        amount.setMaxLength(8);
        amount.setResponder(s -> amountText = s);
        int x = left + 136;
        for (int preset : PRESETS) {
            addRenderableWidget(Button.builder(Component.literal("$" + preset), b -> amount.setValue(String.valueOf(preset))).bounds(x, y - 1, 34, 20).build());
            x += 38;
        }

        // A Sell button for each open position in the market that is still trading.
        List<PaperWallet.Position> positions = PaperWallet.get().positions();
        positionsKey = widgetsKey();
        int py = top + 196;
        long now = System.currentTimeMillis() / 1000;
        for (PaperWallet.Position p : positions.stream().limit(2).toList()) {
            if (now < p.windowEnd) {
                addRenderableWidget(Button.builder(Component.literal("Sell"), b -> sell(p)).bounds(left + PANEL_W - 52, py - 4, 42, 16).build());
            }
            py += 14;
        }

        addRenderableWidget(Button.builder(Component.literal("Open on Polymarket"), b -> {
            Market m = MarketFeed.get().snapshot().market();
            ConfirmLinkScreen.confirmLinkNow(this, URI.create(m != null ? m.url() : "https://polymarket.com/crypto/5M"));
        }).bounds(left + 10, top + PANEL_H - 24, 120, 18).build());
        addRenderableWidget(Button.builder(Component.literal("Reset wallet"), b -> {
            PaperWallet.get().reset();
            flash(Component.literal("Paper wallet reset to " + Fmt.dollars(PaperWallet.STARTING_BALANCE)), false);
            rebuildWidgets();
        }).bounds(left + 136, top + PANEL_H - 24, 90, 18).build());
        addRenderableWidget(Button.builder(Component.literal("Close"), b -> onClose()).bounds(left + PANEL_W - 70, top + PANEL_H - 24, 60, 18).build());
    }

    @Override
    public void tick() {
        MarketFeed.get().touch();
        Snapshot s = MarketFeed.get().snapshot();
        boolean open = s.market() != null && System.currentTimeMillis() / 1000 < s.market().endSec();
        buyUp.active = open && !s.up().asks().isEmpty();
        buyDown.active = open && !s.down().asks().isEmpty();
        buyUp.setMessage(Component.literal("Buy Up · " + Fmt.cents(s.up().bestAsk())).withStyle(ChatFormatting.GREEN));
        buyDown.setMessage(Component.literal("Buy Down · " + Fmt.cents(s.down().bestAsk())).withStyle(ChatFormatting.RED));
        // Positions change when a trade fills, a market resolves or a window ends: rebuild so the Sell buttons match.
        if (!widgetsKey().equals(positionsKey)) rebuildWidgets();
    }

    private static String widgetsKey() {
        StringBuilder sb = new StringBuilder().append(System.currentTimeMillis() / 1000 / MarketFeed.WINDOW_SECONDS).append('|');
        for (PaperWallet.Position p : PaperWallet.get().positions()) sb.append(p.slug).append(p.outcome).append(p.shares).append(';');
        return sb.toString();
    }

    private void buy(Outcome outcome) {
        double dollars;
        try {
            dollars = Double.parseDouble(amountText);
        } catch (NumberFormatException e) {
            flash(Component.literal("Enter an amount"), true);
            return;
        }
        Snapshot s = MarketFeed.get().snapshot();
        PaperWallet.Fill fill = PaperWallet.get().buy(s.market(), outcome, s.book(outcome), dollars, System.currentTimeMillis() / 1000);
        if (!fill.ok()) {
            flash(Component.literal(fill.error()), true);
            return;
        }
        flash(Component.literal(String.format(Locale.ROOT, "Bought %s %s shares for %s (avg %s)",
            Fmt.shares(fill.shares()), outcome.label(), Fmt.dollars(fill.dollars()), Fmt.cents(fill.dollars() / fill.shares()))), false);
        rebuildWidgets();
    }

    private void sell(PaperWallet.Position position) {
        Snapshot s = MarketFeed.get().snapshot();
        PaperWallet.Fill fill = PaperWallet.get().sell(position, s.book(position.outcome), System.currentTimeMillis() / 1000);
        if (!fill.ok()) {
            flash(Component.literal(fill.error()), true);
            return;
        }
        flash(Component.literal(String.format(Locale.ROOT, "Sold %s %s shares for %s",
            Fmt.shares(fill.shares()), position.outcome.label(), Fmt.dollars(fill.dollars()))), false);
        rebuildWidgets();
    }

    private void flash(Component message, boolean error) {
        status = message.copy().withStyle(error ? ChatFormatting.RED : ChatFormatting.GREEN);
        statusUntil = System.currentTimeMillis() + 5000;
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
        BoardTexture.refresh();
        Snapshot s = MarketFeed.get().snapshot();
        long now = System.currentTimeMillis();

        g.fill(left, top, left + PANEL_W, top + PANEL_H, BG);
        g.outline(left, top, PANEL_W, PANEL_H, LINE);
        g.fill(left + 1, top + 1, left + PANEL_W - 1, top + 2, BoardTexture.BLUE);

        // Header
        g.text(font, Component.literal("Bitcoin Up or Down").withStyle(ChatFormatting.BOLD), left + 10, top + 8, 0xFFFFFFFF);
        g.text(font, "Paper trading · Powered by Polymarket", left + 10, top + 20, GRAY);
        if (s.market() != null) {
            String cd = Fmt.countdown(s.market(), now);
            g.text(font, cd + " left", left + PANEL_W - 10 - font.width(cd + " left"), top + 8, 0xFFFBBF24);
            String w = Fmt.times(s.market().title());
            g.text(font, w, left + PANEL_W - 10 - font.width(w), top + 20, GRAY);
        }

        // Chart: the plotting area of the billboard's texture.
        int cx = left + 10, cy = top + 34, cw = PANEL_W - 20, ch = 70;
        int u0 = BoardTexture.CHART_X0 - 6, v0 = BoardTexture.CHART_Y0 - 6;
        int uw = BoardTexture.CHART_X1 - BoardTexture.CHART_X0 + 12, vh = BoardTexture.CHART_Y1 - BoardTexture.CHART_Y0 + 12;
        g.blit(RenderPipelines.GUI_TEXTURED, BoardTexture.ID, cx, cy, u0, v0, cw, ch, uw, vh, BoardTexture.WIDTH, BoardTexture.HEIGHT);
        if (s.market() == null) {
            String msg = s.error() != null ? s.error() : "Connecting to Polymarket…";
            g.centeredText(font, msg, cx + cw / 2, cy + ch / 2 - 4, GRAY);
        }

        // Probabilities
        double up = s.upProbability();
        int py = top + 110;
        g.text(font, Component.literal("Up " + Fmt.percent(up)).withStyle(ChatFormatting.BOLD), left + 10, py, BoardTexture.UP);
        String downText = "Down " + Fmt.downPercent(up);
        g.text(font, Component.literal(downText).withStyle(ChatFormatting.BOLD), left + PANEL_W - 10 - font.width(downText) - 6, py, BoardTexture.DOWN);
        String spread = "Sell Up " + Fmt.cents(s.up().bestBid()) + "  ·  Sell Down " + Fmt.cents(s.down().bestBid());
        g.centeredText(font, spread, left + PANEL_W / 2, py, GRAY);

        // Amount row label
        g.text(font, "Amount $", left + 10, top + 165, GRAY);

        // Balance and positions
        PaperWallet wallet = PaperWallet.get();
        int y = top + 184;
        g.text(font, "Paper balance: " + Fmt.dollars(wallet.balance()), left + 10, y, 0xFFFFFFFF);
        double pnl = wallet.history().stream().mapToDouble(PaperWallet.Closed::profit).sum();
        if (!wallet.history().isEmpty()) {
            String r = "Result so far: " + Fmt.signedDollars(pnl);
            g.text(font, r, left + PANEL_W - 10 - font.width(r), y, pnl >= 0 ? BoardTexture.UP : BoardTexture.DOWN);
        }
        y += 12;
        List<PaperWallet.Position> positions = wallet.positions();
        if (positions.isEmpty()) {
            PaperWallet.Closed last = wallet.history().isEmpty() ? null : wallet.history().getFirst();
            String line = last == null
                ? "No positions yet: pick Up or Down and an amount."
                : "Last: " + last.result + " " + Fmt.signedDollars(last.profit()) + " · " + last.outcome.label() + " · " + Fmt.times(last.title);
            g.text(font, line, left + 10, y, last == null ? GRAY : (last.profit() >= 0 ? BoardTexture.UP : BoardTexture.DOWN));
        }
        for (PaperWallet.Position p : positions.stream().limit(2).toList()) {
            boolean live = s.market() != null && p.slug.equals(s.market().slug());
            Book book = live ? s.book(p.outcome) : Book.EMPTY;
            String line = p.outcome.label() + " · " + Fmt.shares(p.shares) + " sh @ " + Fmt.cents(p.averagePrice());
            if (now / 1000 >= p.windowEnd) {
                line += " · resolving…";
            } else if (!Double.isNaN(book.bestBid())) {
                double value = p.shares * book.bestBid();
                line += " · now " + Fmt.dollars(value) + " (" + Fmt.signedDollars(value - p.cost) + ")";
            }
            g.text(font, line, left + 10, y, p.outcome == Outcome.UP ? BoardTexture.UP : BoardTexture.DOWN);
            y += 14;
        }
        if (positions.size() > 2) g.text(font, "+ " + (positions.size() - 2) + " more", left + 10, y, GRAY);

        if (status != null && now < statusUntil) {
            g.centeredText(font, status, left + PANEL_W / 2, top + 123, 0xFFFFFFFF);
        }

        super.extractRenderState(g, mouseX, mouseY, partialTick);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
