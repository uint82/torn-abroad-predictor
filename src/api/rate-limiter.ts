import { abortError, sleep } from './timing';

export const DEFAULT_REQUESTS_PER_WINDOW = 90;
export const DEFAULT_WINDOW_MS = 60_000;

export interface RateLimiterOptions {
  max?: number;
  windowMs?: number;
  now?: () => number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export class RateLimiter {
  readonly #max: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #wait: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly #timestamps: number[] = [];

  constructor(options: RateLimiterOptions = {}) {
    this.#max = Math.max(1, Math.floor(options.max ?? DEFAULT_REQUESTS_PER_WINDOW));
    this.#windowMs = Math.max(1, options.windowMs ?? DEFAULT_WINDOW_MS);
    this.#now = options.now ?? Date.now;
    this.#wait = options.wait ?? sleep;
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) {
        throw abortError(signal);
      }
      const now = this.#now();
      const cutoff = now - this.#windowMs;
      while ((this.#timestamps[0] ?? Number.POSITIVE_INFINITY) <= cutoff) {
        this.#timestamps.shift();
      }
      if (this.#timestamps.length < this.#max) {
        this.#timestamps.push(now);
        return;
      }
      const oldest = this.#timestamps[0] ?? now;
      await this.#wait(Math.max(1, this.#windowMs - (now - oldest) + 1), signal);
    }
  }
}
