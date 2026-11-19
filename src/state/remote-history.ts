import type { CountryCode } from '../core/types';
import { errorMessage, isAbortError } from '../core/errors';
import type { AppState } from './app-state';
import type { HistoryClient } from './clients';
import { mergeRemoteStockHistory } from './history-sync';
import type { Store } from './store';

export const REMOTE_HISTORY_DAYS = 30;
export const REMOTE_HISTORY_TTL_MS = 5 * 60_000;

export interface RemoteHistoryOptions {
  store: Store<AppState>;
  client: HistoryClient | null;
  days?: number;
  ttlMs?: number;
  now?: () => number;
}

export class RemoteHistoryService {
  readonly #store: Store<AppState>;
  readonly #client: HistoryClient | null;
  readonly #days: number;
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #attemptedAt = new Map<CountryCode, number>();
  #abort: AbortController | null = null;

  constructor(options: RemoteHistoryOptions) {
    this.#store = options.store;
    this.#client = options.client;
    this.#days = options.days ?? REMOTE_HISTORY_DAYS;
    this.#ttlMs = options.ttlMs ?? REMOTE_HISTORY_TTL_MS;
    this.#now = options.now ?? Date.now;
  }

  abort(): void {
    this.#abort?.abort();
  }

  async refresh(force: boolean): Promise<void> {
    if (!this.#client) {
      return;
    }
    const country = this.#store.get().country;
    const now = this.#now();
    const lastAttempt = this.#attemptedAt.get(country) ?? 0;
    if (!force && now - lastAttempt < this.#ttlMs) {
      return;
    }
    if (this.#abort) {
      if (!force) {
        return;
      }
      this.#abort.abort();
    }
    const controller = new AbortController();
    this.#abort = controller;
    this.#attemptedAt.set(country, now);
    try {
      const remote = await this.#client.getStockHistory(country, this.#days, controller.signal);
      const receivedAt = this.#now();
      this.#store.update((current) => ({
        ...current,
        remoteHistories: mergeRemoteStockHistory(current.remoteHistories, remote, receivedAt),
      }));
    } catch (error) {
      if (!isAbortError(error)) {
        console.warn(`Remote stock history unavailable: ${errorMessage(error)}`);
      }
    } finally {
      if (this.#abort === controller) {
        this.#abort = null;
      }
    }
  }
}
