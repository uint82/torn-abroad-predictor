import type { StorageAdapter } from '../storage/storage';
import type { AppState } from './app-state';
import type { CatalogClient, HistoryClient, StockClient } from './clients';
import type { Store } from './store';

export interface DataServiceOptions {
  store: Store<AppState>;
  storage: StorageAdapter;
  createTornClient?: (key: string) => CatalogClient;
  createStockClient?: () => StockClient;
  createHistoryClient?: () => HistoryClient | null;
  historyDays?: number;
  historyTtlMs?: number;
  now?: () => number;
}
