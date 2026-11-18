import type { Histories, MarketQuote, StockData } from '../core/types';
import { recordPriceSnapshot, recordStockSnapshot } from '../storage/history';

export function mergeStockHistory(histories: Histories, data: StockData, now: number): Histories {
  let next = histories;
  for (const country of Object.values(data.countries)) {
    if (!country) {
      continue;
    }
    next = recordStockSnapshot(
      next,
      country.code,
      country.items.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
      Math.min(now, country.updatedAt),
      now,
    );
  }
  return next;
}

export function mergeQuoteHistory(
  histories: Histories,
  quotes: Readonly<Record<number, MarketQuote>>,
  now: number,
): Histories {
  return recordPriceSnapshot(
    histories,
    Object.values(quotes).map((quote) => ({
      itemId: quote.itemId,
      price: quote.averagePrice ?? quote.lowestPrice,
    })),
    now,
    now,
  );
}
