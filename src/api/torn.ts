import type { CatalogItem, MarketQuote } from '../core/types';
import { AppError, errorMessage, isAbortError } from '../core/errors';
import { HttpClient } from './http';
import { RateLimiter } from './rate-limiter';
import { parseItemMarketResponse, parseItemsResponse } from './schemas';

export const TORN_API_BASE = 'https://api.torn.com/v2';
export const TORN_REQUESTS_PER_MINUTE = 90;
export const ITEM_MARKET_LISTING_LIMIT = 100;
export const QUOTE_CONCURRENCY = 4;

const APP_COMMENT = 'TornAbroadPredictor';

export interface QuoteFailure {
  itemId: number;
  message: string;
}

export interface QuoteBatch {
  quotes: Record<number, MarketQuote>;
  failures: QuoteFailure[];
}

export interface TornClientOptions {
  http?: HttpClient;
  limiter?: RateLimiter;
}

type QuoteResult = { quote: MarketQuote } | { failure: QuoteFailure };

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const run = async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      const item = items[index];
      if (item === undefined) {
        return;
      }
      results[index] = await worker(item);
    }
  };

  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, () => run());
  await Promise.all(workers);
  return results;
}

export class TornClient {
  readonly #key: string;
  readonly #http: HttpClient;
  readonly #limiter: RateLimiter;

  constructor(key: string, options: TornClientOptions = {}) {
    const trimmed = key.trim();
    if (trimmed === '') {
      throw new AppError('Enter a Torn API key first.');
    }
    this.#key = trimmed;
    this.#http = options.http ?? new HttpClient({ target: 'api.torn.com' });
    this.#limiter =
      options.limiter ?? new RateLimiter({ max: TORN_REQUESTS_PER_MINUTE, windowMs: 60_000 });
  }

  async getCatalog(signal?: AbortSignal): Promise<CatalogItem[]> {
    const payload = await this.#get(
      `/torn/items?comment=${encodeURIComponent(APP_COMMENT)}`,
      signal,
    );
    return parseItemsResponse(payload);
  }

  async getItemMarket(itemId: number, signal?: AbortSignal): Promise<MarketQuote> {
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new AppError('Invalid item id.');
    }
    const payload = await this.#get(
      `/market/${itemId}/itemmarket?limit=${ITEM_MARKET_LISTING_LIMIT}&comment=${encodeURIComponent(APP_COMMENT)}`,
      signal,
    );
    return parseItemMarketResponse(payload, itemId);
  }

  async getQuotes(itemIds: readonly number[], signal?: AbortSignal): Promise<QuoteBatch> {
    const ids = [...new Set(itemIds.filter((itemId) => Number.isInteger(itemId) && itemId > 0))];
    const results = await mapWithConcurrency<number, QuoteResult>(
      ids,
      QUOTE_CONCURRENCY,
      async (itemId) => {
        try {
          return { quote: await this.getItemMarket(itemId, signal) };
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }
          return { failure: { itemId, message: errorMessage(error) } };
        }
      },
    );

    const quotes: Record<number, MarketQuote> = {};
    const failures: QuoteFailure[] = [];
    for (const result of results) {
      if ('quote' in result) {
        quotes[result.quote.itemId] = result.quote;
      } else {
        failures.push(result.failure);
      }
    }
    return { quotes, failures };
  }

  async #get(path: string, signal?: AbortSignal): Promise<unknown> {
    await this.#limiter.acquire(signal);
    return this.#http.json(`${TORN_API_BASE}${path}`, {
      headers: { Authorization: `ApiKey ${this.#key}` },
      signal,
    });
  }
}
