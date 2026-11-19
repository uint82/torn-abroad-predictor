import type { CatalogItem, CountryCode, RemoteStockHistory, StockData } from '../core/types';
import type { QuoteBatch } from '../api/torn';

export interface CatalogClient {
  getCatalog(signal?: AbortSignal): Promise<CatalogItem[]>;
  getQuotes(itemIds: readonly number[], signal?: AbortSignal): Promise<QuoteBatch>;
}

export interface StockClient {
  getTravelStock(signal?: AbortSignal): Promise<StockData>;
}

export interface HistoryClient {
  getStockHistory(
    country: CountryCode,
    days: number,
    signal?: AbortSignal,
  ): Promise<RemoteStockHistory>;
}
