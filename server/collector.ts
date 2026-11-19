import { errorMessage } from '../src/core/errors';
import { HttpClient } from '../src/api/http';
import { parseTravelExport } from '../src/api/schemas';
import { YATA_TRAVEL_URL } from '../src/api/yata';
import type { StockStore } from './database';
import { DEFAULT_POLL_INTERVAL_MS } from './config';
import { diffStock } from './stock-diff';

export const COLLECTOR_USER_AGENT = 'torn-abroad-predictor-collector/1.0';
const COLLECTOR_TIMEOUT_MS = 20_000;

export interface CollectorOptions {
  store: StockStore;
  url?: string;
  intervalMs?: number;
  now?: () => number;
  log?: (message: string) => void;
  http?: HttpClient;
}

export interface CollectResult {
  ok: boolean;
  itemCount: number;
  changeCount: number;
}

export class StockCollector {
  readonly #store: StockStore;
  readonly #url: string;
  readonly #intervalMs: number;
  readonly #now: () => number;
  readonly #log: (message: string) => void;
  readonly #http: HttpClient;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #abort: AbortController | null = null;
  #running = false;
  #stopped = true;

  constructor(options: CollectorOptions) {
    this.#store = options.store;
    this.#url = options.url ?? YATA_TRAVEL_URL;
    this.#intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#now = options.now ?? Date.now;
    this.#log = options.log ?? (() => undefined);
    this.#http =
      options.http ??
      new HttpClient({
        target: 'yata.yt',
        timeoutMs: COLLECTOR_TIMEOUT_MS,
        headers: { 'User-Agent': COLLECTOR_USER_AGENT },
      });
  }

  start(): void {
    if (!this.#stopped) {
      return;
    }
    this.#stopped = false;
    void this.#run();
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#abort?.abort();
  }

  async collectOnce(): Promise<CollectResult> {
    if (this.#running) {
      return { ok: false, itemCount: 0, changeCount: 0 };
    }
    this.#running = true;
    const collectedAt = this.#now();
    const controller = new AbortController();
    this.#abort = controller;

    try {
      const payload = await this.#http.json(this.#url, { signal: controller.signal });
      const data = parseTravelExport(payload, collectedAt);
      const diff = diffStock(data, this.#store.readStates(), collectedAt);
      const finishedAt = this.#now();
      this.#store.savePoll(
        {
          collectedAt,
          finishedAt,
          sourceUpdatedAt: diff.sourceUpdatedAt,
          durationMs: finishedAt - collectedAt,
          itemCount: diff.states.length,
          changeCount: diff.changes.length,
        },
        diff.states,
        diff.changes,
      );
      this.#log(
        `Collected ${diff.states.length} items from ${diff.sourceUpdatedAt} (${diff.changes.length} changes)`,
      );
      return {
        ok: true,
        itemCount: diff.states.length,
        changeCount: diff.changes.length,
      };
    } catch (error) {
      const finishedAt = this.#now();
      const message = errorMessage(error);
      this.#store.recordFailure(collectedAt, finishedAt, finishedAt - collectedAt, message);
      this.#log(`Collection failed: ${message}`);
      return { ok: false, itemCount: 0, changeCount: 0 };
    } finally {
      if (this.#abort === controller) {
        this.#abort = null;
      }
      this.#running = false;
    }
  }

  async #run(): Promise<void> {
    await this.collectOnce();
    if (this.#stopped) {
      return;
    }
    this.#timer = setTimeout(() => {
      void this.#run();
    }, this.#intervalMs);
  }
}
