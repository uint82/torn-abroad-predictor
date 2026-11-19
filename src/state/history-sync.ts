import type { Histories, MarketQuote, RemoteStockHistory, StockData } from '../core/types';
import { mergeStockObservations } from '../domain/stock-history';
import { recordPriceSnapshot, recordStockSnapshot } from '../storage/history';

export function mergeRemoteStockHistory(
  histories: Histories,
  remote: RemoteStockHistory,
  now: number,
): Histories {
  const stock = { ...histories.stock };
  const countryHistory = { ...(stock[remote.country] ?? {}) };
  for (const [key, incoming] of Object.entries(remote.items)) {
    const itemId = Number(key);
    if (!Number.isInteger(itemId) || itemId <= 0 || incoming.length === 0) {
      continue;
    }
    countryHistory[itemId] = mergeStockObservations(countryHistory[itemId] ?? [], incoming, now);
  }
  stock[remote.country] = countryHistory;
  return { stock, prices: histories.prices };
}

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
