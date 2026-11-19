import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../src/api/http';
import { StockCollector } from '../server/collector';
import { StockStore } from '../server/database';
import { at } from './fixtures';

function yataPayload(updatedAt: number, quantity: number): unknown {
  return {
    stocks: {
      jap: {
        update: Math.floor(updatedAt / 1000),
        stocks: [{ id: 1, name: 'Ramen', quantity, cost: 900 }],
      },
    },
  };
}

function makeCollector(
  fetchImpl: typeof fetch,
  now: () => number,
): { collector: StockCollector; store: StockStore } {
  const store = new StockStore(':memory:');
  const collector = new StockCollector({
    store,
    url: 'https://yata.test/export',
    now,
    http: new HttpClient({ fetchImpl, retries: 0, target: 'yata.test' }),
  });
  return { collector, store };
}

let store: StockStore | null = null;

afterEach(() => {
  store?.close();
  store = null;
});

describe('StockCollector', () => {
  it('records every poll and detects restocks', async () => {
    let now = at(10);
    const quantities = [5, 2, 0, 30];
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      const quantity = quantities[call] ?? 30;
      call += 1;
      return new Response(JSON.stringify(yataPayload(now, quantity)), { status: 200 });
    });
    const context = makeCollector(fetchImpl as unknown as typeof fetch, () => now);
    store = context.store;

    for (let index = 0; index < quantities.length; index += 1) {
      const result = await context.collector.collectOnce();
      expect(result.ok).toBe(true);
      now += 60_000;
    }

    const health = store.readHealth(now);
    expect(health.status).toBe('ok');
    expect(health.eventCount).toBe(4);
    expect(store.readObservations('jap', at(10), now).items[1]).toEqual([
      { at: at(10), quantity: 5 },
      { at: at(10, 1), quantity: 2 },
      { at: at(10, 2), quantity: 0 },
      { at: at(10, 3), quantity: 30 },
    ]);
  });

  it('records a failed poll without throwing', async () => {
    const now = at(10);
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 503 }));
    const context = makeCollector(fetchImpl as unknown as typeof fetch, () => now);
    store = context.store;

    const result = await context.collector.collectOnce();
    const health = store.readHealth(now);
    expect(result.ok).toBe(false);
    expect(health.status).toBe('degraded');
    expect(health.lastPoll?.error).toContain('HTTP 503');
    expect(health.eventCount).toBe(0);
  });

  it('rejects malformed YATA payloads', async () => {
    const now = at(10);
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const context = makeCollector(fetchImpl as unknown as typeof fetch, () => now);
    store = context.store;

    const result = await context.collector.collectOnce();
    expect(result.ok).toBe(false);
    expect(store.readHealth(now).lastPoll?.status).toBe('error');
  });

  it('does not run two collections at once', async () => {
    const now = at(10);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      await pending;
      return new Response(JSON.stringify(yataPayload(now, 5)), { status: 200 });
    });
    const context = makeCollector(fetchImpl as unknown as typeof fetch, () => now);
    store = context.store;

    const first = context.collector.collectOnce();
    const second = await context.collector.collectOnce();
    expect(second.ok).toBe(false);
    release();
    expect((await first).ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
