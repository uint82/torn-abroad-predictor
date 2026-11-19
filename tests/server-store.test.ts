import { afterEach, describe, expect, it } from 'vitest';
import type { StockData } from '../src/core/types';
import { StockStore } from '../server/database';
import { diffStock } from '../server/stock-diff';
import { at } from './fixtures';

interface Item {
  itemId: number;
  quantity: number;
  cost?: number;
}

function stockData(now: number, items: readonly Item[], updatedAt = now): StockData {
  return {
    fetchedAt: now,
    countries: {
      jap: {
        code: 'jap',
        updatedAt,
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

function collect(store: StockStore, data: StockData, now: number): void {
  const diff = diffStock(data, store.readStates(), now);
  store.savePoll(
    {
      collectedAt: now,
      finishedAt: now,
      sourceUpdatedAt: diff.sourceUpdatedAt,
      durationMs: 0,
      itemCount: diff.states.length,
      changeCount: diff.changes.length,
    },
    diff.states,
    diff.changes,
  );
}

let store: StockStore | null = null;

afterEach(() => {
  store?.close();
  store = null;
});

describe('StockStore', () => {
  it('stores initial state and observations', () => {
    store = new StockStore(':memory:');
    const now = at(10);
    collect(store, stockData(now, [{ itemId: 1, quantity: 5 }]), now);

    expect(store.readStates().get('jap:1')).toMatchObject({
      country: 'jap',
      itemId: 1,
      quantity: 5,
      lastEventAt: now,
    });
    const observations = store.readObservations('jap', now - 60_000, now);
    expect(observations.items[1]).toEqual([{ at: now, quantity: 5 }]);
  });

  it('records changes without duplicating an unchanged poll', () => {
    store = new StockStore(':memory:');
    const first = at(10);
    collect(store, stockData(first, [{ itemId: 1, quantity: 5 }]), first);
    collect(store, stockData(first + 60_000, [{ itemId: 1, quantity: 5 }]), first + 60_000);
    collect(store, stockData(first + 120_000, [{ itemId: 1, quantity: 2 }]), first + 120_000);

    const observations = store.readObservations('jap', first, first + 120_000);
    expect(observations.items[1]).toEqual([
      { at: first, quantity: 5 },
      { at: first + 120_000, quantity: 2 },
    ]);
    expect(store.readHealth(first + 120_000).eventCount).toBe(2);
  });

  it('includes the latest observation before the requested range as an anchor', () => {
    store = new StockStore(':memory:');
    const start = at(9);
    collect(store, stockData(start, [{ itemId: 1, quantity: 10 }]), start);
    collect(
      store,
      stockData(start + 30 * 60_000, [{ itemId: 1, quantity: 4 }]),
      start + 30 * 60_000,
    );
    collect(
      store,
      stockData(start + 60 * 60_000, [{ itemId: 1, quantity: 20 }]),
      start + 60 * 60_000,
    );

    const observations = store.readObservations('jap', start + 45 * 60_000, start + 60 * 60_000);
    expect(observations.items[1]).toEqual([
      { at: start + 30 * 60_000, quantity: 4 },
      { at: start + 60 * 60_000, quantity: 20 },
    ]);
  });

  it('filters one item without losing other item state', () => {
    store = new StockStore(':memory:');
    const now = at(10);
    collect(
      store,
      stockData(now, [
        { itemId: 1, quantity: 5 },
        { itemId: 2, quantity: 8 },
      ]),
      now,
    );

    const observations = store.readObservations('jap', now - 60_000, now, 2);
    expect(Object.keys(observations.items)).toEqual(['2']);
    expect(store.readStates().size).toBe(2);
  });

  it('reports health transitions and keeps the last successful poll', () => {
    store = new StockStore(':memory:');
    const now = at(10);
    expect(store.readHealth(now).status).toBe('starting');

    collect(store, stockData(now, [{ itemId: 1, quantity: 5 }]), now);
    const healthy = store.readHealth(now + 60_000);
    expect(healthy.status).toBe('ok');
    expect(healthy.dataAgeMs).toBe(60_000);
    expect(healthy.lastSuccess?.status).toBe('ok');

    store.recordFailure(now + 120_000, now + 121_000, 1_000, 'YATA is down');
    const degraded = store.readHealth(now + 120_000);
    expect(degraded.status).toBe('degraded');
    expect(degraded.lastPoll?.error).toBe('YATA is down');
    expect(degraded.lastSuccess?.collectedAt).toBe(now);
  });

  it('prunes old history but keeps the most recent point for active items', () => {
    store = new StockStore(':memory:');
    const start = at(9);
    collect(store, stockData(start, [{ itemId: 1, quantity: 10 }]), start);
    collect(
      store,
      stockData(start + 60 * 60_000, [{ itemId: 1, quantity: 8 }]),
      start + 60 * 60_000,
    );
    collect(
      store,
      stockData(start + 120 * 60_000, [{ itemId: 1, quantity: 6 }]),
      start + 120 * 60_000,
    );

    store.prune(start + 30 * 60_000);
    const observations = store.readObservations('jap', start, start + 120 * 60_000);
    expect(observations.items[1]).toEqual([
      { at: start + 60 * 60_000, quantity: 8 },
      { at: start + 120 * 60_000, quantity: 6 },
    ]);
  });

  it('removes inactive state after the retention cutoff', () => {
    store = new StockStore(':memory:');
    const now = at(10);
    collect(store, stockData(now, [{ itemId: 1, quantity: 5 }]), now);
    store.prune(now + 1);
    expect(store.readStates().size).toBe(0);
  });
});
