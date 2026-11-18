import { ApiError, AppError, isAbortError } from '../core/errors';
import { abortError, sleep } from './timing';
import { extractApiError } from './schemas';

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_RETRIES = 1;
export const DEFAULT_RETRY_BASE_MS = 500;
export const NETWORK_ERROR_CODE = 0;
export const RATE_LIMIT_ERROR_CODE = 5;

const TORN_ERROR_MESSAGES: Readonly<Record<number, string>> = {
  2: 'That API key was rejected by Torn.',
  5: 'Torn is rate limiting requests. Try again shortly.',
  16: 'That API key does not have access to this endpoint.',
};

export interface HttpClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryBaseMs?: number;
  target?: string;
}

export interface HttpRequestOptions {
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}

function shouldRetry(error: unknown, attempt: number, retries: number): boolean {
  return (
    attempt < retries &&
    error instanceof ApiError &&
    error.retryable &&
    error.code !== RATE_LIMIT_ERROR_CODE &&
    error.code !== 429
  );
}

export class HttpClient {
  readonly #fetchImpl: typeof fetch;
  readonly #timeoutMs: number;
  readonly #retries: number;
  readonly #retryBaseMs: number;
  readonly #target: string;

  constructor(options: HttpClientOptions = {}) {
    this.#fetchImpl = (options.fetchImpl ?? globalThis.fetch).bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#retries = options.retries ?? DEFAULT_RETRIES;
    this.#retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.#target = options.target ?? 'the API';
  }

  async json<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.#attempt<T>(url, options);
      } catch (error) {
        if (!shouldRetry(error, attempt, this.#retries)) {
          throw error;
        }
        const jitter = 0.8 + Math.random() * 0.4;
        await sleep(Math.round(this.#retryBaseMs * 2 ** attempt * jitter), options.signal);
      }
    }
  }

  async #attempt<T>(url: string, options: HttpRequestOptions): Promise<T> {
    if (options.signal?.aborted) {
      throw abortError(options.signal);
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

    let response: Response;
    try {
      response = await this.#fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...options.headers },
        signal: controller.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) {
        throw abortError(options.signal);
      }
      if (controller.signal.aborted) {
        throw new ApiError(
          `The request to ${this.#target} timed out. Try again.`,
          NETWORK_ERROR_CODE,
          true,
          { cause: error },
        );
      }
      if (isAbortError(error)) {
        throw error;
      }
      throw new ApiError(
        `Could not reach ${this.#target}. Check your connection or content blocker.`,
        NETWORK_ERROR_CODE,
        true,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }

    if (options.signal?.aborted) {
      throw abortError(options.signal);
    }

    const body = await response.text();
    let payload: unknown = null;
    if (body.trim() !== '') {
      try {
        payload = JSON.parse(body);
      } catch (error) {
        throw new AppError(`${this.#target} returned invalid JSON.`, { cause: error });
      }
    }

    const apiError = extractApiError(payload);
    if (apiError) {
      throw new ApiError(
        TORN_ERROR_MESSAGES[apiError.code] ?? apiError.message,
        apiError.code,
        apiError.code === RATE_LIMIT_ERROR_CODE,
      );
    }

    if (!response.ok) {
      throw new ApiError(
        `Request to ${this.#target} failed with HTTP ${response.status}.`,
        response.status,
        response.status >= 500,
      );
    }

    return payload as T;
  }
}
