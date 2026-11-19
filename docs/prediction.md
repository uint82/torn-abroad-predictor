# Profit and stock prediction

The planner separates what is known from what is estimated. Known values are the shop price, the current stock snapshot, and the market price. Estimated values are future stock and the price trend.

## Profit math

For each item:

```text
net sale = sale price * (1 - fee / 100)
unit profit = net sale - buy price
```

The sale price is the average listing by default. The lowest listing is available as an option, which is usually easier to beat. The fee is 5 percent for the item market, 0 percent for a bazaar, or a custom percentage.

The trip plan selects items with positive unit profit and available stock. Items are sorted by unit profit, then name, then item ID. Each item occupies one suitcase slot, so the basket fills the capacity with the highest-profit items first.

```text
flight cost = standard fare * 2, or business ticket * 2, or 0 for airstrip and WLT
total minutes = round trip flight time + extra waiting minutes
net profit = basket profit - flight cost
profit per hour = net profit * 60 / total minutes
ROI = net profit / basket cost * 100
```

The standard fare is charged both ways. A business ticket is configured per leg and is also charged both ways. `Mailing Yourself Abroad` reduces flight time by 25 percent, rounded to the nearest minute.

## Availability

When predicted stock is enabled, the planner uses the expected stock at arrival. When it is disabled, it uses the current stock. Items with no stock and no usable forecast are left out.

The basket can use a restock that is expected before landing. This is why a current zero can still appear with a small number at arrival.

## Stock forecast

The forecast uses observations recorded from YATA. Local snapshots cover 24 hours. When a collector is configured, the browser adds up to 30 days of remote changes for the selected country.

Sell-rate and restock-size intervals must be longer than 30 seconds and shorter than 6 hours. Longer gaps are treated as missing data because the exact change time is unknown. Sellout cycles do not reject long gaps, so slow items can still produce a cycle.

- Sell rate: total units sold divided by total hours across intervals with a negative delta in the last 24 hours.
- Restock size: median of zero-to-positive jumps in the last 7 days, rounded to at least 1. Other increases are sellbacks and are ignored. With no measured restock, the size is unknown and a restock is not projected.
- Sellout cycle: a zero-to-positive restock until the next zero.
- Restock lag: time from one sellout to the next restock, measured across sellout cycles in the available history. The median is used once there are at least two lags. With fewer, the fallback is half the median sellout duration.
- Restock window: the interquartile range of measured lags, snapped to quarter-hour ticks. It is shown only when at least two lags exist. The window is clipped to the 24-hour lookahead.
- Next restock time: for an empty item, the latest sellout plus the restock lag. For a stocked item, project the remaining stock at the current sell rate to a sellout, then add the lag. Torn restocks on quarter-hour ticks, so the estimate moves to the next tick. A point estimate over 24 hours away is left blank.
- Arrival stock chance: share of scenario combinations of measured lags and sellout durations that still have stock at arrival. Current stock that covers the whole horizon returns 100 percent. The estimate needs at least two lag samples and two duration samples.
- Horizon: one-way flight time plus extra waiting time.
- Simulation: project current stock to now, add a restock at the estimated time, then subtract sales to arrival. Later restocks use the median sellout duration plus the restock lag.

All restock times are shown in Torn City Time. TCT is UTC all year, so the clock does not follow daylight saving. The table shows `HH:mm TCT`; the tooltip and item dialog show the full date, the restock window, and the arrival stock chance.

The result reports one of these states:

| Status             | Meaning                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `in-stock`         | Current stock is expected to last until arrival.                   |
| `restock-expected` | The item is expected to sell out and restock before arrival.       |
| `sold-out`         | The item is expected to be empty at arrival.                       |
| `unknown`          | The snapshot is older than 60 minutes or there is not enough data. |

A forecast older than 60 minutes is not used. An empty current quantity with no restock history is also treated as unknown rather than zero. If a restock estimate is already overdue, the next quarter-hour tick is shown instead.

## Confidence

Stock confidence and restock confidence are separate signals. Neither one is a probability.

Stock confidence reflects how much history supports the current sell rate:

- High: at least 8 observations over at least 2 hours, with a known sell rate.
- Medium: at least 3 observations over at least 30 minutes, with a known sell rate.
- Low: everything else, including stale snapshots.

Restock confidence reflects how many measured lags support the timing window:

- High: at least 5 lags and a window of 30 minutes or less.
- Medium: at least 3 lags and a window of 90 minutes or less.
- Low: everything else, including no usable window.

If the stock forecast depends on a restock and there are fewer than two measured lags, high stock confidence is reduced to medium.

## Price trend

The price trend compares the first and last price in a 6-hour window.

```text
change percent = (last - first) / first * 100
```

A change above 2 percent is rising, below -2 percent is falling, and the rest is stable. Volatility is the population standard deviation divided by the mean. The trend is a direction hint, not a price prediction.

## Known limits

- Local history starts empty for a new browser, so early forecasts are weak. A collector that has been running supplies history immediately.
- Local stock history keeps 24 hours, so slow sellout cycles need the collector to be timed.
- Remote history is capped at 30 days and 4096 observations per item. Sell rate still uses only the last 24 hours.
- YATA snapshots can miss a restock or contain a manual change. One-minute sampling can miss short sellouts, and the collector inherits the same limit.
- The model assumes a constant sell rate and a stable restock size.
- One or two sellout cycles can give a noisy restock time and a wide window.
- Arrival stock chance assumes measured lag and duration samples represent the next cycles. It has not been calibrated against live outcomes yet.
- Market prices can move between the quote and the sale.
- The planner does not model item market undercuts, listing time, or bazaar demand.
- Flight time and fares are fixed data and must be updated when the game changes.
