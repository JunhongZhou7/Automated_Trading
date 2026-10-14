# Strategy Studio

A dependency-free, interactive paper-trading research prototype. Requires Node.js 22 or newer.

```sh
cd /workspace/Automated_Trading
npm test
npm run check
npm start
```

The server listens on port 3000 (`PORT` and `HOST` can override it). There are no dependencies to install. Use your development platform's port access to open the interface. Account state persists in this browser's local storage; reset clears the simulated account. No broker credentials or live trading connections are used.

## Supported workflow

- Start/pause a seeded synthetic market, change its speed, or advance 30 simulated minutes.
- Enable labeled pairs trading and profit ladder strategies independently or together.
- Buy, sell, and short stocks; buy calls or puts and close positions. Closing a pair closes both legs.
- Track equity, ROI, cash, gross exposure, position P&L, fills, and strategy events. The activity table displays the latest 50 of 500 retained orders; chart retains 600 samples.
- Configure pairs entry, exit, and stop z-scores, ladder trigger thresholds, and maximum gross exposure for new orders.

## Strategy assumptions

Pairs trading uses the last 40 AAPL/MSFT log-price ratios with at least 30 observations. It allocates approximately 15% of equity to each leg, enters at an absolute z-score of 2, exits below 0.4, and stops above 3.5. These assets are illustrative, not a validated cointegrated pair. Turning it off blocks new entries but retains exits for open pairs.

The profit ladder uses the original entry price as its reference. Default rules: -3% hold; -15% buy 10%; -25% buy 25%; +5% and +15% hold; +25% sell 10%; +35% sell 20%; +45% sell 30%; +60% sell 40%; +100% sell all. Each rule fires once per position; rejected orders may retry later. Buys and sells use the current remaining share count, rounded down. Multiple crossed thresholds execute in listed order. A sale of all remaining shares ends the position. Threshold edits do not reset fired rules.

The ladder manages independent long stock positions. It does not resize pairs, which would break the hedge, or options. Both strategies can run concurrently on their respective positions. Large percentage thresholds suit longer holding periods more than typical intraday stock moves. Averaging down increases risk and neither strategy guarantees profits.

## Simulation limits

Quotes are synthetic, not live or historical market data. Each step is labeled one minute, but there are no exchange calendars or sessions. Fills occur at the current simulated mark with a $1 fee, without bid/ask spreads, slippage, latency, liquidity limits, borrowing costs, margin interest, or dividends. The exposure cap is checked on new orders, not enforced as automatic liquidation when markets move. Short losses can exceed initial proceeds.

Calls and puts are long-only, 100 shares per contract, with an at-the-money strike and 390-step expiry. Marks use intrinsic value plus linearly decaying initial time value. Expiry cash-settles intrinsic value; this differs from actual US equity option exercise and assignment. This is not an options valuation model or a production trading system.

## Broker integration

No external paper account is connected in this version. Alpaca is the recommended next integration because its HTTP API and API-key authentication are simpler than IBKR's Gateway/TWS session management. A broker adapter will need server-side secure credentials, market data permissions, reconciliation, order-state handling, and broker risk controls. Never put API secrets into browser code or source control. Backtesting on historical data is a separate next step before assessing performance.
