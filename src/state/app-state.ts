import type {
  CatalogItem,
  CountryCode,
  Filters,
  Histories,
  MarketQuote,
  Settings,
  StockData,
} from '../core/types';
import type { QuoteFailure } from '../api/torn';
import type { CatalogCache, StockCache } from '../storage/cache';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export type KeyStatus = 'missing' | 'unchecked' | 'checking' | 'valid' | 'invalid';

export interface AppState {
  apiKey: string;
  keyStatus: KeyStatus;
  keyMessage: string | null;
  settings: Settings;
  filters: Filters;
  country: CountryCode;
  catalog: CatalogItem[];
  catalogSavedAt: number | null;
  catalogStatus: LoadStatus;
  stock: StockData | null;
  stockSavedAt: number | null;
  stockStatus: LoadStatus;
  quotes: Record<number, MarketQuote>;
  quoteStatus: LoadStatus;
  quoteFailures: QuoteFailure[];
  lastQuoteRefreshAt: number | null;
  histories: Histories;
  remoteHistories: Histories;
  selectedItemId: number | null;
  notice: string | null;
  error: string | null;
  lastUpdatedAt: number | null;
}

export interface InitialData {
  settings: Settings;
  filters: Filters;
  apiKey: string;
  catalog: CatalogCache | null;
  stock: StockCache | null;
  histories: Histories;
  country: CountryCode;
}

export function createInitialState(data: InitialData): AppState {
  return {
    apiKey: data.apiKey,
    keyStatus: data.apiKey === '' ? 'missing' : 'unchecked',
    keyMessage: null,
    settings: data.settings,
    filters: data.filters,
    country: data.country,
    catalog: data.catalog?.items ?? [],
    catalogSavedAt: data.catalog?.savedAt ?? null,
    catalogStatus: data.catalog ? 'ready' : 'idle',
    stock: data.stock?.data ?? null,
    stockSavedAt: data.stock?.savedAt ?? null,
    stockStatus: data.stock ? 'ready' : 'idle',
    quotes: {},
    quoteStatus: 'idle',
    quoteFailures: [],
    lastQuoteRefreshAt: null,
    histories: data.histories,
    remoteHistories: { stock: {}, prices: {} },
    selectedItemId: null,
    notice: null,
    error: null,
    lastUpdatedAt: null,
  };
}
