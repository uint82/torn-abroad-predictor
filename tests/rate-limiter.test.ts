import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/api/rate-limiter';
import { abortError, sleep } from '../src/api/timing';
import { isAbortError } from '../src/core/errors';

describe('RateLimiter', () => {
  it('allows requests up to the limit', async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new RateLimiter({
      max: 2,
      windowMs: 1000,
      now: () => now,
      wait: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });

    await limiter.acquire();
    now += 100;
    await limiter.acquire();
    expect(waits).toEqual([]);
  });

  it('waits for the oldest request to leave the window', async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new RateLimiter({
      max: 2,
      windowMs: 1000,
      now: () => now,
      wait: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });

    await limiter.acquire();
    now += 100;
    await limiter.acquire();
    await limiter.acquire();
    expect(waits).toEqual([901]);
    expect(now).toBe(1001);
  });

  it('lets requests through after the window passes', async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new RateLimiter({
      max: 1,
      windowMs: 1000,
      now: () => now,
      wait: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });

    await limiter.acquire();
    now = 5000;
    await limiter.acquire();
    expect(waits).toEqual([]);
  });

  it('aborts instead of waiting', async () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 });
    await limiter.acquire();
    const controller = new AbortController();
    controller.abort();
    await expect(limiter.acquire(controller.signal)).rejects.toSatisfy((error: unknown) =>
      isAbortError(error),
    );
  });
});

describe('sleep', () => {
  it('resolves immediately for zero milliseconds', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });

  it('rejects when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(1000, controller.signal)).rejects.toSatisfy((error: unknown) =>
      isAbortError(error),
    );
  });

  it('stops waiting when aborted', async () => {
    const controller = new AbortController();
    const pending = sleep(10_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toSatisfy((error: unknown) => isAbortError(error));
  });

  it('prefers the abort reason', async () => {
    const controller = new AbortController();
    const reason = new Error('stop');
    controller.abort(reason);
    expect(abortError(controller.signal)).toBe(reason);
  });
});
