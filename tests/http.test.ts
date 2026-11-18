import { describe, expect, it, vi } from 'vitest';
import { ApiError, AppError, isAbortError } from '../src/core/errors';
import { HttpClient } from '../src/api/http';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpClient', () => {
  it('returns parsed JSON and sends the expected headers', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ items: [] }),
    );
    const http = new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(
      http.json('https://example.test/items', { headers: { Authorization: 'ApiKey abc' } }),
    ).resolves.toEqual({ items: [] });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'ApiKey abc',
    });
  });

  it('calls fetch with the global receiver', async () => {
    const fetchImpl = function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    };
    const http = new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(http.json('https://example.test')).resolves.toEqual({ ok: true });
  });

  it('turns the Torn error envelope into an ApiError', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { code: 2, error: 'Incorrect key' } }),
    );
    const http = new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(http.json('https://example.test')).rejects.toMatchObject({
      name: 'ApiError',
      code: 2,
      message: 'That API key was rejected by Torn.',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a server error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const http = new HttpClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryBaseMs: 0,
    });

    await expect(http.json('https://example.test')).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'boom' }, 500));
    const http = new HttpClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryBaseMs: 0,
    });

    await expect(http.json('https://example.test')).rejects.toMatchObject({
      name: 'ApiError',
      code: 500,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a rejected key', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { code: 2, error: 'Incorrect key' } }),
    );
    const http = new HttpClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retries: 3,
      retryBaseMs: 0,
    });

    await expect(http.json('https://example.test')).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('wraps a network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('connection refused');
    });
    const http = new HttpClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryBaseMs: 0,
    });

    await expect(http.json('https://example.test')).rejects.toMatchObject({
      name: 'ApiError',
      code: 0,
      message: 'Could not reach the API. Check your connection or content blocker.',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('names the endpoint in a network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const http = new HttpClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      target: 'api.torn.com',
      retries: 0,
    });

    await expect(http.json('https://api.torn.com/v2/torn/items')).rejects.toMatchObject({
      name: 'ApiError',
      code: 0,
      message: 'Could not reach api.torn.com. Check your connection or content blocker.',
    });
  });

  it('times out a stalled request', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const http = new HttpClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
      retries: 0,
    });

    await expect(http.json('https://example.test')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'The request to the API timed out. Try again.',
    });
  });

  it('does not start an aborted request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const http = new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const controller = new AbortController();
    controller.abort();

    await expect(
      http.json('https://example.test', { signal: controller.signal }),
    ).rejects.toSatisfy((error: unknown) => isAbortError(error));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stops a request aborted mid-flight', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const http = new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const controller = new AbortController();
    const pending = http.json('https://example.test', { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toSatisfy((error: unknown) => isAbortError(error));
  });

  it('rejects invalid JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 200 }));
    const http = new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(http.json('https://example.test')).rejects.toBeInstanceOf(AppError);
  });
});
