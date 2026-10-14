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

Pairs trading uses the last 40 log-price ratios for the selected pair (AAPL/MSFT by default; PEP/KO is also available) with at least 30 observations. It allocates approximately 15% of equity to each leg, enters at an absolute z-score of 2, exits below 0.4, and stops above 3.5. Both pairs are illustrative candidates, not validated cointegrated relationships. Existing positions retain their opening pair until closed; selection does not rebalance them. Turning it off blocks new entries but retains exits for open pairs.

The profit ladder uses the original entry price as its reference. Default rules: -3% hold; -15% buy 10%; -25% buy 25%; +5% and +15% hold; +25% sell 10%; +35% sell 20%; +45% sell 30%; +60% sell 40%; +100% sell all. Each rule fires once per position; rejected orders may retry later. Buys and sells use the current remaining share count, rounded down. Multiple crossed thresholds execute in listed order. A sale of all remaining shares ends the position. Threshold edits do not reset fired rules.

The ladder manages independent manual long stock positions. It does not resize pairs, options, or positions owned by the three new combinations. All strategies can run concurrently on their respective positions. Large percentage thresholds suit longer holding periods more than typical intraday stock moves. Averaging down increases risk and neither strategy guarantees profits.

## Synthetic prices: what they do and do not establish

Synthetic demo starts from arbitrary constants (examples): AAPL 190, MSFT 420, SPY 550, QQQ 480, PEP 160 and KO 70. It does not download quotes or replay history. With seed 42, each minute applies `price *= exp(commonMarketShock + individualShock)`, where the uniform common log shock is in approximately [-0.003, 0.003] and the individual log shock in [-0.004, 0.004]. High/low ranges and volume are also randomly generated. The synthetic path does not encode real volatility, market microstructure, mean reversion, cointegration, or company fundamentals. It is reproducible for testing mechanics, not evidence of profitability, realistic risk, or suitability of any pair. Adding symbols can change the seeded path between software versions.

## Pair research: real prices + news NLP, manual selection

The **交易对研究 · 价格 + 新闻NLP** panel scans every pair in a curated ten-pair research pool. Click **扫描全部10组交易对** to fetch real Alpaca adjusted daily bars and the last seven days of news for all candidates:

| Pair | Companies / research sector |
| --- | --- |
| AAPL/MSFT | Apple / Microsoft — large technology |
| PEP/KO | PepsiCo / Coca-Cola — beverages and consumer products |
| V/MA | Visa / Mastercard — payment networks |
| XOM/CVX | Exxon Mobil / Chevron — integrated energy |
| JPM/BAC | JPMorgan Chase / Bank of America — large banks |
| WMT/COST | Walmart / Costco — retail |
| HD/LOW | Home Depot / Lowe’s — home improvement |
| UPS/FDX | UPS / FedEx — parcel logistics |
| MCD/YUM | McDonald’s / Yum! Brands — restaurant chains |
| GOOGL/META | Alphabet / Meta — digital advertising |

This is the full configured candidate pool, not all possible US-listed stock combinations. Candidates can be extended in `universe.js`; membership and industry similarity are not evidence of cointegration. Every pair appears in the results, including failures and missing data. A shared daily-price request covers the 20 candidate stocks; news is queried separately per pair so popular symbols do not crowd out the rest of the pool. At most three pairs are processed concurrently. The UI starts a background scan, polls progress, and reports the number completed, eligible, and failed. A pair-specific news or semantic-model failure does not erase other pairs' rankings. It works independently of the current chart mode and never uses synthetic prices or fabricated news. Existing Alpaca paper API credentials need access to both historical data and news. Analysis can be run outside market hours; execution still requires fresh market data during trading hours.

The service aligns up to 60 completed daily observations and requires at least 40. It fits an OLS log-price relationship on all but the last observation, computes the last residual z-score, daily-return correlation, and each leg's five-session price change. The beta is diagnostic only: execution continues to use equal-dollar legs and the existing rolling minute log-ratio signal. The daily analysis is a candidate screen, not the execution signal. No cointegration or out-of-sample validation has been performed. Similar brands alone do not establish a tradable mean-reverting relationship.

The default text analyzer is **local English keyword NLP**, not a language model. It counts explicit positive/negative earnings phrases on single-company articles and flags possible structural-event terms such as mergers, recalls, and fraud. Shared articles are shown but not assigned directional company sentiment. Negation, ambiguity, broad multi-ticker articles, and incomplete news coverage remain limitations. Missing company coverage is unknown; the pair receives no combined score. A missing event keyword does not establish safety.

The optional semantic analyzer sends at most 20 headlines/summaries per pair to OpenAI (up to ten pair analyses per full scan, so API usage grows with the pool). To enable it, edit the existing `.env` (do not overwrite your Alpaca keys):

```dotenv
PAIR_NLP_PROVIDER=semantic
NLP_API_KEY=your-own-api-key
NLP_MODEL=gpt-4.1-mini
```

Restart the server. This uses your own API account and may incur charges. The key stays server-side; `NLP_API_KEY` is a custom application variable, not the platform-reserved `OPENAI_API_KEY`. For cloud use, enter the optional personal secret securely in environment settings and allow `api.openai.com`. Without semantic configuration, keep `PAIR_NLP_PROVIDER=keyword`. Semantic failures do not silently revert to keyword scores. News is treated as untrusted input and model outputs require bounded sentiment values and valid supplied article IDs; this does not make the analysis fact-checked.

Research scores combine return correlation (40%), daily spread deviation capped at |z|=2 (30%), and similarity of text sentiment (30%), with a structural-event penalty. Weak correlation (<0.5), nonpositive OLS beta, extreme daily |z| (>3.5), event flags, large sentiment divergence, or missing text coverage prevent the pair from being labeled a priority research candidate. These gates and weights are unvalidated heuristics; a score is not a probability of profit. You can still choose a pair for observation, but the app never automatically selects or trades from this ranking.

Results include source links, publication times, evidence IDs, limitations and data dates. News pagination is capped at 150 recent articles per pair and labeled if truncated; lexical inputs include summaries up to 2,000 characters and semantic inputs are further capped. Results are cached for five minutes, expire after fifteen minutes, and are not historical point-in-time backtests. The current server has no persistent research storage.

Use the pair dropdown or a result's selection button to choose a pair manually, then enable pairs trading and start the local research workflow. Selection alone never places an order. Close both legs before changing an active pair. Both synthetic and Alpaca research accounts remember their selections separately. Only one pair can be open at a time. All candidate stocks are available in manual stock order forms. The watchlist and real-time subscription include the four base watch symbols, selected/open pair legs, held stocks, enabled-combination symbols, and the selected local order symbol. Unrelated research candidates do not need fresh quotes for the current strategies to advance. Switching to a new symbol requests fresh data; missing data blocks orders rather than using its synthetic initialization price. Old browser accounts are migrated without inventing prior PEP/KO history; they need fresh pair samples for warmup.

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

Scan API: `GET /api/pair-analysis?async=1&start=1` starts or reuses a scan. `GET /api/pair-analysis?async=1` returns `running` with completed/total progress, `complete` with all rows, or `failed` for a shared prerequisite failure. `GET /api/pair-analysis` remains a blocking endpoint for scripts. Jobs/results are in-memory and do not survive a server restart. `GET /api/quotes?symbols=AAPL,MSFT,V,MA` and `/api/bars?symbols=...` accept only the configured symbol universe.
