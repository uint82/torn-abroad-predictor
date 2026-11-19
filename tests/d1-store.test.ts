import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { StockData } from '../src/core/types';
import { diffStock } from '../server/stock-diff';
import { SCHEMA } from '../server/store-schema';
import { D1StockStore } from '../worker/d1-store';
import { createFakeD1, type FakeDatabase } from './fake-d1';
import { at } from './fixtures';

interface Item {
  itemId: number;
  quantity: number;
  cost?: number;
}

function stockData(now: number, items: readonly Item[]): StockData {
  return {
    fetchedAt: now,
    countries: {
      jap: {
        code: 'jap',
        updatedAt: now,
        items: items.map((item) => ({
          itemId: item.itemId,
          name: `Item ${item.itemId}`,
          quantity: item.quantity,
          cost: item.cost ?? 100,
        })),
      },
    },
  };
}

async function collect(
  store: D1StockStore,
  data: StockData,
  now: number,
): Promise<ReturnType<typeof diffStock>> {
  const diff = diffStock(data, await store.readStates(), now);
  await store.savePoll(
    {
      collectedAt: now,
      finishedAt: now,
      sourceUpdatedAt: diff.sourceUpdatedAt,
      durationMs: 0,
      itemCount: diff.states.length,
      changeCount: diff.changes.length,
    },
    diff.changedStates,
    diff.changes,
  );
  return diff;
}

let db: FakeDatabase | null = null;
let store: D1StockStore | null = null;

function openStore(): D1StockStore {
  db = createFakeD1();
  store = new D1StockStore(db);
  return store;
}

afterEach(() => {
  db?.close();
  db = null;
  store = null;
});

describe('D1StockStore', () => {
  it('stores initial state and observations', async () => {
    const target = openStore();
    const now = at(10);
    await collect(target, stockData(now, [{ itemId: 1, quantity: 5 }]), now);

    const states = await target.readStates();
    expect(states.get('jap:1')).toMatchObject({
      country: 'jap',
      itemId: 1,
      quantity: 5,
      lastEventAt: now,
    });
    const observations = await target.readObservations('jap', now - 60_000, now);
    expect(observations.items[1]).toEqual([{ at: now, quantity: 5 }]);
  });

  it('keeps unchanged polls out of the state write path', async () => {
    const target = openStore();
    const first = at(10);
    await collect(target, stockData(first, [{ itemId: 1, quantity: 5 }]), first);
    const second = await collect(
      target,
      stockData(first + 60_000, [{ itemId: 1, quantity: 5 }]),
      first + 60_000,
    );

    expect(second.changes).toEqual([]);
    expect(second.changedStates).toEqual([]);
    const health = await target.readHealth(first + 60_000);
    expect(health.eventCount).toBe(1);
    expect(health.stateCount).toBe(1);
  });

  it('returns an anchor only for full history requests', async () => {
    const target = openStore();
    const start = at(9);
    await collect(target, stockData(start, [{ itemId: 1, quantity: 10 }]), start);
    await collect(
      target,
      stockData(start + 30 * 60_000, [{ itemId: 1, quantity: 4 }]),
      start + 30 * 60_000,
    );
    await collect(
      target,
      stockData(start + 60 * 60_000, [{ itemId: 1, quantity: 20 }]),
      start + 60 * 60_000,
    );

    const full = await target.readObservations('jap', start + 45 * 60_000, start + 60 * 60_000);
    expect(full.items[1]).toEqual([
      { at: start + 30 * 60_000, quantity: 4 },
      { at: start + 60 * 60_000, quantity: 20 },
    ]);

    const incremental = await target.readObservations(
      'jap',
      start + 45 * 60_000,
      start + 60 * 60_000,
      null,
      false,
    );
    expect(incremental.items[1]).toEqual([{ at: start + 60 * 60_000, quantity: 20 }]);
  });

  it('reports health and updates the event counter after pruning', async () => {
    const target = openStore();
    const start = at(9);
    await collect(target, stockData(start, [{ itemId: 1, quantity: 10 }]), start);
    await collect(
      target,
      stockData(start + 60 * 60_000, [{ itemId: 1, quantity: 8 }]),
      start + 60 * 60_000,
    );
    await collect(
      target,
      stockData(start + 120 * 60_000, [{ itemId: 1, quantity: 6 }]),
      start + 120 * 60_000,
    );

    const before = await target.readHealth(start + 120 * 60_000);
    expect(before.status).toBe('ok');
    expect(before.eventCount).toBe(3);

    await target.prune(start + 30 * 60_000);
    const after = await target.readHealth(start + 120 * 60_000);
    expect(after.eventCount).toBe(2);
    const observations = await target.readObservations('jap', start, start + 120 * 60_000);
    expect(observations.items[1]).toEqual([
      { at: start + 60 * 60_000, quantity: 8 },
      { at: start + 120 * 60_000, quantity: 6 },
    ]);
  });

  it('records failures without throwing', async () => {
    const target = openStore();
    await target.recordFailure(at(10), at(10) + 1_000, 1_000, 'YATA is down');
    const health = await target.readHealth(at(10) + 1_000);
    expect(health.status).toBe('degraded');
    expect(health.lastPoll?.error).toBe('YATA is down');
  });

  it('keeps the D1 migration aligned with the runtime schema', () => {
    const migration = readFileSync(
      new URL('../migrations/0001_stock_history.sql', import.meta.url),
      {
        encoding: 'utf8',
      },
    );
    expect(migration.trim()).toBe(SCHEMA.trim());
  });
});
