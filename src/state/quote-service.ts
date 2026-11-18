import { errorMessage, isAbortError, ApiError } from '../core/errors';
import type { StorageAdapter } from '../storage/storage';
import { isCacheFresh } from '../storage/cache';
import { saveHistories } from '../storage/history';
import type { AppState } from './app-state';
import type { Store } from './store';
import type { CatalogClient } from './clients';
import { mergeQuoteHistory } from './history-sync';
import { selectQuotableIds, selectRows } from './selectors';

export const QUOTE_TTL_MS = 5 * 60_000;

export interface QuoteServiceOptions {
  store: Store<AppState>;
  storage: StorageAdapter;
  getClient: () => CatalogClient | null;
  now?: () => number;
}

function isKeyError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 2 || error.code === 16);
}

export class QuoteService {
  readonly #store: Store<AppState>;
  readonly #storage: StorageAdapter;
  readonly #getClient: () => CatalogClient | null;
  readonly #now: () => number;
  #abort: AbortController | null = null;

  constructor(options: QuoteServiceOptions) {
    this.#store = options.store;
    this.#storage = options.storage;
    this.#getClient = options.getClient;
    this.#now = options.now ?? Date.now;
  }

  abort(): void {
    this.#abort?.abort();
  }

  async refresh(force: boolean): Promise<void> {
    const client = this.#getClient();
    if (!client) {
      return;
    }
    const state = this.#store.get();
    const now = this.#now();
    if (state.catalog.length === 0) {
      return;
    }
    if (
      !force &&
      state.lastQuoteRefreshAt !== null &&
      isCacheFresh(state.lastQuoteRefreshAt, QUOTE_TTL_MS, now)
    ) {
      return;
    }
    if (this.#abort) {
      return;
    }
    const ids = selectQuotableIds(selectRows(state, now));
    if (ids.length === 0) {
      this.#update((current) => ({
        ...current,
        quoteStatus: 'ready',
        lastQuoteRefreshAt: now,
      }));
      return;
    }
    const controller = new AbortController();
    this.#abort = controller;
    this.#update((current) => ({ ...current, quoteStatus: 'loading' }));
    try {
      const batch = await client.getQuotes(ids, controller.signal);
      const fetchedAt = this.#now();
      const histories = mergeQuoteHistory(this.#store.get().histories, batch.quotes, fetchedAt);
      saveHistories(this.#storage, histories, fetchedAt);
      this.#update((current) => ({
        ...current,
        quotes: { ...current.quotes, ...batch.quotes },
        quoteFailures: batch.failures,
        quoteStatus: 'ready',
        lastQuoteRefreshAt: fetchedAt,
        histories,
        keyStatus: 'valid',
        keyMessage: null,
        error: null,
        notice:
          batch.failures.length > 0
            ? `${batch.failures.length} live quotes failed; catalog prices were used.`
            : null,
        lastUpdatedAt: fetchedAt,
      }));
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      const invalidKey = isKeyError(error);
      this.#update((current) => ({
        ...current,
        quoteStatus: current.lastQuoteRefreshAt === null ? 'error' : 'ready',
        keyStatus: invalidKey ? 'invalid' : current.keyStatus,
        keyMessage: invalidKey ? errorMessage(error) : current.keyMessage,
        error: invalidKey ? null : errorMessage(error),
      }));
    } finally {
      if (this.#abort === controller) {
        this.#abort = null;
      }
    }
  }

  #update(updater: (state: AppState) => AppState): void {
    this.#store.update(updater);
  }
}
