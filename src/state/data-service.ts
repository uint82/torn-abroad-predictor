import type { CountryCode, Filters, Settings } from '../core/types';
import { errorMessage, isAbortError, isKeyError } from '../core/errors';
import { createDefaultHistoryClient } from '../api/collector';
import { TornClient } from '../api/torn';
import { YataClient } from '../api/yata';
import type { StorageAdapter } from '../storage/storage';
import {
  CATALOG_TTL_MS,
  STOCK_TTL_MS,
  isCacheFresh,
  saveCatalogCache,
  saveStockCache,
} from '../storage/cache';
import { sanitizeSettings, saveApiKey, saveSettings } from '../storage/settings';
import { saveHistories } from '../storage/history';
import type { AppState } from './app-state';
import type { Store } from './store';
import type { CatalogClient, StockClient } from './clients';
import type { DataServiceOptions } from './data-service-options';
import { mergeStockHistory } from './history-sync';
import { QuoteService } from './quote-service';
import { RemoteHistoryService } from './remote-history';

export const AUTO_REFRESH_MS = 60_000;

export class DataService {
  readonly #store: Store<AppState>;
  readonly #storage: StorageAdapter;
  readonly #createTornClient: (key: string) => CatalogClient;
  readonly #createStockClient: () => StockClient;
  readonly #now: () => number;
  readonly #quotes: QuoteService;
  readonly #remoteHistory: RemoteHistoryService;
  #client: CatalogClient | null = null;
  #stockAbort: AbortController | null = null;
  #catalogAbort: AbortController | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DataServiceOptions) {
    this.#store = options.store;
    this.#storage = options.storage;
    this.#createTornClient = options.createTornClient ?? ((key) => new TornClient(key));
    this.#createStockClient = options.createStockClient ?? (() => new YataClient());
    this.#now = options.now ?? Date.now;
    this.#remoteHistory = new RemoteHistoryService({
      store: options.store,
      client: (options.createHistoryClient ?? createDefaultHistoryClient)(),
      days: options.historyDays,
      ttlMs: options.historyTtlMs,
      now: this.#now,
    });
    const key = this.#store.get().apiKey;
    if (key !== '') {
      this.#client = this.#createTornClient(key);
    }
    this.#quotes = new QuoteService({
      store: this.#store,
      storage: this.#storage,
      getClient: () => this.#client,
      now: this.#now,
    });
  }

  start(): void {
    if (this.#timer !== null) {
      return;
    }
    this.#timer = setInterval(() => this.#tick(), AUTO_REFRESH_MS);
    void this.refreshAll(false);
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#stockAbort?.abort();
    this.#catalogAbort?.abort();
    this.#remoteHistory.abort();
    this.#quotes.abort();
  }

  async refreshAll(force: boolean): Promise<void> {
    const tasks: Promise<void>[] = [this.refreshStock(force), this.#remoteHistory.refresh(force)];
    const canUseKey = this.#client !== null && (force || this.#store.get().keyStatus !== 'invalid');
    if (canUseKey) {
      tasks.push(this.refreshCatalog(force));
    }
    await Promise.allSettled(tasks);
    if (canUseKey) {
      await this.#quotes.refresh(force);
    }
  }

  async refreshStock(force: boolean): Promise<void> {
    const state = this.#store.get();
    const now = this.#now();
    if (
      !force &&
      state.stockSavedAt !== null &&
      isCacheFresh(state.stockSavedAt, STOCK_TTL_MS, now)
    ) {
      return;
    }
    if (this.#stockAbort) {
      return;
    }
    const controller = new AbortController();
    this.#stockAbort = controller;
    this.#update((current) => ({ ...current, stockStatus: 'loading' }));
    try {
      const data = await this.#createStockClient().getTravelStock(controller.signal);
      const fetchedAt = this.#now();
      const histories = mergeStockHistory(this.#store.get().histories, data, fetchedAt);
      saveStockCache(this.#storage, data, fetchedAt);
      saveHistories(this.#storage, histories, fetchedAt);
      this.#update((current) => ({
        ...current,
        stock: data,
        stockSavedAt: fetchedAt,
        stockStatus: 'ready',
        histories,
        lastUpdatedAt: fetchedAt,
        error: null,
      }));
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      this.#update((current) => ({
        ...current,
        stockStatus: 'error',
        error: errorMessage(error),
      }));
    } finally {
      if (this.#stockAbort === controller) {
        this.#stockAbort = null;
      }
    }
  }

  async refreshCatalog(force: boolean): Promise<void> {
    if (!this.#client) {
      return;
    }
    const state = this.#store.get();
    const now = this.#now();
    if (
      !force &&
      state.keyStatus === 'valid' &&
      state.catalogSavedAt !== null &&
      isCacheFresh(state.catalogSavedAt, CATALOG_TTL_MS, now)
    ) {
      return;
    }
    if (this.#catalogAbort) {
      if (!force) {
        return;
      }
      // A forced check follows a user action, so replace the stale request.
      this.#catalogAbort.abort();
    }
    const controller = new AbortController();
    this.#catalogAbort = controller;
    this.#update((current) => ({
      ...current,
      catalogStatus: 'loading',
      keyStatus: current.keyStatus === 'valid' ? 'valid' : 'checking',
      keyMessage: null,
    }));
    try {
      const items = await this.#client.getCatalog(controller.signal);
      const fetchedAt = this.#now();
      saveCatalogCache(this.#storage, items, fetchedAt);
      this.#update((current) => ({
        ...current,
        catalog: items,
        catalogSavedAt: fetchedAt,
        catalogStatus: 'ready',
        keyStatus: 'valid',
        keyMessage: null,
        error: null,
        lastUpdatedAt: fetchedAt,
      }));
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      const invalidKey = isKeyError(error);
      this.#update((current) => ({
        ...current,
        catalogStatus: current.catalog.length > 0 ? 'ready' : 'error',
        keyStatus: invalidKey
          ? 'invalid'
          : current.keyStatus === 'checking'
            ? 'unchecked'
            : current.keyStatus,
        keyMessage: invalidKey ? errorMessage(error) : current.keyMessage,
        error: invalidKey ? null : errorMessage(error),
      }));
    } finally {
      if (this.#catalogAbort === controller) {
        this.#catalogAbort = null;
      }
    }
  }

  async saveKey(key: string): Promise<void> {
    const trimmed = key.trim();
    saveApiKey(this.#storage, trimmed);
    if (trimmed === '') {
      this.removeKey();
      return;
    }
    this.#client = this.#createTornClient(trimmed);
    this.#quotes.abort();
    this.#update((current) => ({
      ...current,
      apiKey: trimmed,
      keyStatus: 'checking',
      keyMessage: null,
      quotes: {},
      quoteFailures: [],
      lastQuoteRefreshAt: null,
      error: null,
    }));
    await this.refreshCatalog(true);
    await this.#quotes.refresh(true);
  }

  removeKey(): void {
    this.#quotes.abort();
    this.#catalogAbort?.abort();
    this.#client = null;
    saveApiKey(this.#storage, '');
    this.#update((current) => ({
      ...current,
      apiKey: '',
      keyStatus: 'missing',
      keyMessage: null,
      quotes: {},
      quoteFailures: [],
      quoteStatus: 'idle',
      lastQuoteRefreshAt: null,
    }));
  }

  async setCountry(country: CountryCode): Promise<void> {
    if (this.#store.get().country === country) {
      return;
    }
    this.#update((current) => ({
      ...current,
      country,
      selectedItemId: null,
      quoteFailures: [],
      lastQuoteRefreshAt: null,
      notice: null,
    }));
    await Promise.all([this.#quotes.refresh(true), this.#remoteHistory.refresh(true)]);
  }

  setFilters(filters: Filters): void {
    this.#update((current) => ({ ...current, filters }));
  }

  updateSettings(settings: Settings): void {
    const next = sanitizeSettings(settings);
    saveSettings(this.#storage, next);
    this.#update((current) => ({ ...current, settings: next }));
  }

  selectItem(itemId: number | null): void {
    this.#update((current) => ({ ...current, selectedItemId: itemId }));
  }

  dismissNotice(): void {
    this.#update((current) => ({ ...current, notice: null, error: null }));
  }

  #tick(): void {
    const state = this.#store.get();
    const now = this.#now();
    if (state.stockSavedAt === null || !isCacheFresh(state.stockSavedAt, STOCK_TTL_MS, now)) {
      void this.refreshStock(false);
    }
    if (this.#client) {
      void this.refreshCatalog(false).then(() => this.#quotes.refresh(false));
    }
    void this.#remoteHistory.refresh(false);
  }

  #update(updater: (state: AppState) => AppState): void {
    this.#store.update(updater);
  }
}
