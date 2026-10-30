A big screen for your world that shows Polymarket's live **Bitcoin Up or Down – 5 minute** market. Players trade it
with gold ingots and compete on a leaderboard beside the screen.

![A Polymarket situation room in Minecraft: the live billboard and leaderboard above the bar](https://raw.githubusercontent.com/txtaan/Puma-Launcher-Minecraft/main/mods/polymarket/docs/situation-room.png)

## What it adds

- **The Polymarket Prediction Market block.** Place it, and a screen 5 blocks wide and 3 tall appears above the post,
  with a leaderboard beside it. It's in the **Functional Blocks** creative tab. In survival, craft it from three glass
  panes on top, then a glass pane, redstone and a glass pane, and an iron ingot at the bottom centre.
- **A live market on the screen:** the current five-minute window of Polymarket's Bitcoin Up or Down market. It shows
  the Up and Down probabilities, the prices to buy each side, a countdown to the end of the window, and a chart that
  moves with the market once a second.
- **Gold trading:** right-click the post, pick a trader name, and stake gold ingots on Up or Down. Orders fill at the
  real Polymarket order book, and you can sell before the window ends. When Polymarket resolves the market, each
  winning share pays 1 gold, and the win is announced in chat.
- **A leaderboard** of every trader in the world, ranked by profit in gold.

![The billboard up close: the live market and the leaderboard beside it](https://raw.githubusercontent.com/txtaan/Puma-Launcher-Minecraft/main/mods/polymarket/docs/board.png)

![Trading screen: buying Up with 5 gold ingots](https://raw.githubusercontent.com/txtaan/Puma-Launcher-Minecraft/main/mods/polymarket/docs/trading.png)

## Good to know

- **Minecraft 26.3 with Forge** (66.1 or newer).
- **Install it on the server and on every player's game.** Trades, payouts and the leaderboard are handled by the
  server, so everyone in a world shares one leaderboard.
- **Internet access:** the game and the server read Polymarket's public API (`gamma-api.polymarket.com` and
  `clob.polymarket.com`) to show the market and settle trades. The mod only downloads market data: it sends nothing
  about the players or the world.
- **No real money:** no Polymarket account, keys or wallet. The gold is Minecraft gold. This is a game, not financial
  advice.
- **Saved data:** traders, positions and results are saved in the world folder, in
  `polymarket_billboard/traders.json`.

The full guide, the source code and the issue tracker are on
[GitHub](https://github.com/txtaan/Puma-Launcher-Minecraft/tree/main/mods/polymarket). This mod is not an official
Polymarket product. The Polymarket name and logo belong to Polymarket.
