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

The forecast uses observations recorded from YATA. An observation is one quantity at one timestamp.

Only intervals longer than 30 seconds and shorter than 6 hours are used. Longer gaps are treated as missing data because a restock or a sale could have happened inside the gap.

- Sell rate: total units sold divided by total hours across intervals with a negative delta.
- Restock size: median of positive deltas, rounded up to at least 1.
- Restock ticks: every 15 minutes, aligned to the hour.
- Horizon: one-way flight time plus extra waiting time.
- Simulation: subtract the sell rate until each tick, add a restock if stock reaches zero, then subtract the remaining time to arrival.

The result reports one of these states:

| Status             | Meaning                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `in-stock`         | Current stock is expected to last until arrival.                   |
| `restock-expected` | The item is expected to sell out and restock before arrival.       |
| `sold-out`         | The item is expected to be empty at arrival.                       |
| `unknown`          | The snapshot is older than 60 minutes or there is not enough data. |

A forecast older than 60 minutes is not used. An empty current quantity with no restock history is also treated as unknown rather than zero.

## Confidence

Confidence is a sample-size signal, not a probability.

- High: at least 8 observations over at least 2 hours, with a known sell rate.
- Medium: at least 3 observations over at least 30 minutes, with a known sell rate.
- Low: everything else, including stale snapshots.

If the forecast depends on a restock and there are fewer than two restock samples, high confidence is reduced to medium.

## Price trend

The price trend compares the first and last price in a 6-hour window.

```text
change percent = (last - first) / first * 100
```

A change above 2 percent is rising, below -2 percent is falling, and the rest is stable. Volatility is the population standard deviation divided by the mean. The trend is a direction hint, not a price prediction.

## Known limits

- History starts empty for a new browser, so early forecasts are weak.
- YATA snapshots can miss a restock or contain a manual change.
- The model assumes a constant sell rate and a stable restock size.
- Market prices can move between the quote and the sale.
- The planner does not model item market undercuts, listing time, or bazaar demand.
- Flight time and fares are fixed data and must be updated when the game changes.
