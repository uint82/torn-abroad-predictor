import type { HttpClient } from '../src/api/http';
import type { StockRepository } from './stock-repository';
import { collectStock } from './collection';
import type { CollectResult } from './collection';
import { DEFAULT_POLL_INTERVAL_MS } from './defaults';

export { COLLECTOR_USER_AGENT } from './collection';
export type { CollectResult } from './collection';

export interface StockCollectorOptions {
  store: StockRepository;
  url?: string;
  intervalMs?: number;
  now?: () => number;
  log?: (message: string) => void;
  http?: HttpClient;
}

export class StockCollector {
  readonly #store: StockRepository;
  readonly #url: string;
  readonly #intervalMs: number;
  readonly #now: () => number;
  readonly #log: (message: string) => void;
  readonly #http: HttpClient | undefined;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #abort: AbortController | null = null;
  #running = false;
  #stopped = true;

  constructor(options: StockCollectorOptions) {
    this.#store = options.store;
    this.#url = options.url ?? '';
    this.#intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#now = options.now ?? Date.now;
    this.#log = options.log ?? (() => undefined);
    this.#http = options.http;
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
    const controller = new AbortController();
    this.#abort = controller;
    try {
      return await collectStock({
        store: this.#store,
        url: this.#url || undefined,
        now: this.#now,
        log: this.#log,
        http: this.#http,
        signal: controller.signal,
      });
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
