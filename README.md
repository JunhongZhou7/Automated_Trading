# Strategy Studio

A dependency-free, interactive paper-trading research prototype. Requires Node.js 24 or newer.

```sh
cd /workspace/Automated_Trading
npm test
npm run check
npm start
```

The server listens on 127.0.0.1:3000 (`PORT` and `HOST` can override it). There are no dependencies to install. Use your development platform's port access to open the interface. Account state persists in this browser's local storage; reset clears the simulated account. Synthetic demo needs no credentials. Alpaca data and paper account access require server-side paper credentials; live-money execution is unavailable.

## Supported workflow

- Start/pause a seeded synthetic market, change its speed, or advance 30 simulated minutes.
- Enable pairs trading, profit ladder, trend breakout + ATR sizing, VWAP reversion + limited scaling, and RSI recovery + time stop independently or together.
- Buy, sell, and short stocks; buy calls or puts and close positions. Closing a pair closes both legs.
- Track equity, ROI, cash, gross exposure, position P&L, fills, and strategy events. The activity table displays the latest 50 of 500 retained orders; chart retains 600 samples.
- Configure pairs entry, exit, and stop z-scores, ladder trigger thresholds, and maximum gross exposure for new orders.

## Strategy assumptions

Pairs trading uses the last 40 AAPL/MSFT log-price ratios with at least 30 observations. It allocates approximately 15% of equity to each leg, enters at an absolute z-score of 2, exits below 0.4, and stops above 3.5. These assets are illustrative, not a validated cointegrated pair. Turning it off blocks new entries but retains exits for open pairs.

The profit ladder uses the original entry price as its reference. Default rules: -3% hold; -15% buy 10%; -25% buy 25%; +5% and +15% hold; +25% sell 10%; +35% sell 20%; +45% sell 30%; +60% sell 40%; +100% sell all. Each rule fires once per position; rejected orders may retry later. Buys and sells use the current remaining share count, rounded down. Multiple crossed thresholds execute in listed order. A sale of all remaining shares ends the position. Threshold edits do not reset fired rules.

The ladder manages independent manual long stock positions. It does not resize pairs, options, or positions owned by the three new combinations. All strategies can run concurrently on their respective positions. Large percentage thresholds suit longer holding periods more than typical intraday stock moves. Averaging down increases risk and neither strategy guarantees profits.

## Three entry + position-management combinations

The website includes Chinese suitability and risk descriptions for all five strategy cards. The following three combinations trade long stocks in the local research account. Defaults are research parameters, not validated optimal settings.

| Combination | Suitable research scenario | Entry | Position management |
| --- | --- | --- | --- |
| Trend breakout + ATR | Persistent trends; intraday or longer holding periods. Current signals use one-minute candles. | Close exceeds highs of the previous 20 candles, excluding the current candle. | Initial stop at entry minus 2 × ATR(14); exit on stop or close below the preceding 10-candle low. No averaging down. |
| VWAP reversion + risk limits | Liquid equities/ETFs in intraday ranging markets. | Previous close was below previous session VWAP minus 1.5 volume-weighted standard deviations, and current close rises while still below VWAP. | Approximately half of target size initially, at most one addition after a later completed candle confirms a higher price below VWAP, bounded by the original risk budget and size caps. ATR stop, VWAP target, or pre-close exit. |
| RSI recovery + time stop | Ranging markets and short oversold rebounds. | Wilder RSI(14) crosses upward through 30. | ATR-based initial stop and sizing, RSI >= 60 exit, or exit after 30 strategy progression samples. No averaging down. |

Defaults trade SPY, QQQ, and AAPL respectively. Each card lets you change the symbol, per-trade risk budget (default 0.5% of local account equity), position-value cap (15%), and its signal parameters. ATR is the simple average of the last 14 true ranges, including prior-close gaps. VWAP uses current regular-session typical price `(high + low + close)/3` weighted by actual candle volume; it resets daily. RSI uses Wilder smoothing. Current-session warmup is required for each indicator.

Target whole shares are the minimum allowed by risk budget / stop distance, position-value cap / price, remaining total gross exposure / price, and available cash less the entry fee / price. Risk sizing is an estimate: slippage, gaps, and fees can exceed the budget. Stop checks use the latest sampled price, not a broker stop order and not intrabar fills. Management settings are frozen when the position opens; parameter changes apply to future entries.

The default 2% daily loss gate uses the whole local portfolio’s marked equity at the first progression sample of the session. Once breached, it latches until the next session and blocks only new entries in these three combinations plus VWAP additions. It does not liquidate the account or control the original pair/ladder modules. Existing positions retain exits even when their entry switches are disabled. New entries are checked in order: pairs, trend, VWAP, RSI. A stock already held by any stock position is unavailable for another automatic entry; pairs also avoid entering when either leg already has a stock holding. Independent manual orders remain possible.

Normal VWAP pre-close exit begins at 15:55 America/New_York; Alpaca’s market clock moves this earlier on shortened sessions. Synthetic sessions contain 390 steps and reset session VWAP on the next session. RSI time stops count processed strategy samples, not elapsed wall-clock minutes during a disconnection. Trend/RSI may carry positions across sessions; their price stops remain checked when fresh quotes resume. The browser must remain running with fresh data for exits to execute; a pre-close liquidation is not guaranteed across disconnections or a paused simulation.

Synthetic mode creates clearly synthetic OHLCV candles and volume for mechanic tests. Real mode uses authenticated Alpaca one-minute stock bars, discards unfinished/invalid candles and uses only regular-session bars no later than the execution quote timestamp. Candles older than two minutes after their close block new entries. IEX VWAP measures IEX trades, not consolidated US volume. New combinations require no new API secrets beyond the existing Alpaca paper credentials. None route automatic orders to the Alpaca account.

## Simulation limits

Quotes are synthetic, not live or historical market data. Each step is labeled one minute, but there are no exchange calendars or sessions. Fills occur at the current simulated mark with a $1 fee, without bid/ask spreads, slippage, latency, liquidity limits, borrowing costs, margin interest, or dividends. The exposure cap is checked on new orders, not enforced as automatic liquidation when markets move. Short losses can exceed initial proceeds.

Calls and puts are long-only, 100 shares per contract, with an at-the-money strike and 390-step expiry. Marks use intrinsic value plus linearly decaying initial time value. Expiry cash-settles intrinsic value; this differs from actual US equity option exercise and assignment. This is not an options valuation model or a production trading system.

## Alpaca real market data and paper account

Windows Command Prompt:

```bat
git pull --ff-only
copy .env.example .env
notepad .env
npm test
npm start
```

On macOS/Linux use `cp .env.example .env` and edit with your preferred editor. Existing `.env` files must be edited, not overwritten. Node.js 24+ is required (`node --version`). No `npm install` is needed.

Get an API Key and Secret from your **Alpaca Paper Trading** account and enter them in the local `.env` file:

```dotenv
ALPACA_API_KEY=your-paper-api-key
ALPACA_SECRET_KEY=your-paper-api-secret
ALPACA_DATA_FEED=iex
ALPACA_PAPER_ORDERS=false
```

Restart the server after editing `.env`. Never send secrets in chat or commit `.env`. The server loads `.env` using Node's built-in loader; exported environment variables take precedence. API credentials stay server-side and are sent only to the fixed Alpaca HTTPS destinations. Outbound HTTP proxies use Node's `--use-env-proxy`; TLS verification remains enabled. Cloud users must enter the two secret bindings in environment settings and allow `data.alpaca.markets` and `paper-api.alpaca.markets`.

Open `http://localhost:3000`. The new connection panel offers:

1. **Synthetic demo**: original seeded prices, accelerated simulation, and simplified options.
2. **Alpaca real market data · local paper strategies**: real latest stock trades polled every 15 seconds, with timestamps and IEX/SIP source labels. Your automatic strategies still execute locally using simulated fills. This account is stored separately from the synthetic demo account. Real mode supports stocks, not simplified option orders. Closed markets, missing quotes, quotes older than two minutes, and quote timestamps more than one minute apart block trading. Strategies run at most once per distinct minute, with gaps over five minutes resetting the rolling window. Pairs use sampled latest trades. The three new combinations additionally use completed one-minute OHLCV candles fetched from Alpaca’s stock bars API; missing or stale candle data blocks their entries.
3. **Alpaca paper account**: separate broker-reported equity, daily return, cash, buying power, positions, fill quantities and prices, pending orders, and cancellation. Set `ALPACA_PAPER_ORDERS=true` and restart to enable manual stock orders into that account. The UI supports buy, sell held shares, short, and cover. Market DAY orders are accepted only during regular market hours with fresh quotes. Broker eligibility rules still apply. Pending orders block further submissions through this app. Submission is not treated as a fill; the account refreshes every 15 seconds after the first account refresh. Cancellation is a request, not a guaranteed cancellation.

IEX is real data from a single exchange and does not cover the entire US market. SIP requires your account's relevant data subscription. No silent switch to synthetic quotes occurs on API failure. This release does not send automatic strategy trades to Alpaca and does not submit broker option orders. Those require a persistent execution/reconciliation service and real option contract selection respectively.

The local gross exposure setting is also checked for new manual broker stock orders against broker positions. The service serializes submissions and rejects new entries while pending orders exist. This is a snapshot check, not a guarantee against concurrent orders submitted outside this app or market-price changes. Alpaca performs the final buying power/eligibility checks. Submission timeouts can be ambiguous: refresh broker orders and check the displayed client order reference before placing another order. Do not blindly retry with a new client ID.

The broker endpoint is fixed to `https://paper-api.alpaca.markets`; no production trading URL override exists. Alpaca paper fills remain simulated, even though market data is real. Local portfolio ROI and broker daily return are separate measurements. Reset only affects the local research account, not the Alpaca account.

Keep the server bound to localhost for local use. This is a single-user development app without authentication. Do not expose a credential-enabled server to a public network without adding authentication. Cloud port access must be protected by your platform. Broker submissions require same-origin JSON requests; secret/configuration files are not served.

## IBKR extension

`brokers/base.js` defines the provider-neutral contract: `quotes`, `bars`, `marketClock`, `snapshot`, `submitOrder`, `cancelOrder`, and capability metadata. `brokers/alpaca.js` translates Alpaca responses into that contract. `broker-service.js` contains provider-independent order validation. `brokers/ibkr.js` is an explicit unimplemented adapter, and `brokers/index.js` is the adapter factory. The UI marks IBKR unavailable instead of falling back to another provider.

A future IBKR implementation can use Gateway/TWS or Client Portal, normalize its responses into the same types, and add session/account selection behind the server. Enabling live money is a separate development and validation step after paper trading, rather than merely swapping an API URL.

## Validation

`npm test` covers the original engine and mocked Alpaca HTTP contracts, real-data freshness/minute deduplication, broker order/account risk checks, submission idempotency, concurrency, paper-only routing, and same-origin API protection. Tests do not prove a real account connection. End-to-end account and feed validation require valid paper credentials and network access. Full browser rendering was not validated in the cloud because the browser download domain was blocked.
