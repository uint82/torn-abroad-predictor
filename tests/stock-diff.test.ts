import { describe, expect, it } from 'vitest';
import type { StockData } from '../src/core/types';
import { diffStock } from '../server/stock-diff';
import { at } from './fixtures';

function stockData(
  now: number,
  items: readonly { itemId: number; quantity: number; cost?: number }[],
  updatedAt = now,
): StockData {
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

function stateMap(now: number, quantity: number, cost = 100) {
  const diff = diffStock(stockData(now, [{ itemId: 1, quantity, cost }]), new Map(), now);
  return new Map(diff.states.map((state) => [`jap:${state.itemId}`, state]));
}

describe('diffStock', () => {
  it('records an initial point for every item', () => {
    const now = at(10);
    const diff = diffStock(
      stockData(now, [
        { itemId: 1, quantity: 5 },
        { itemId: 2, quantity: 0 },
      ]),
      new Map(),
      now,
    );

    expect(diff.changes).toHaveLength(2);
    expect(diff.changes[0]).toMatchObject({
      country: 'jap',
      itemId: 1,
      at: now,
      previousQuantity: null,
      quantity: 5,
      delta: 5,
      kind: 'initial',
    });
    expect(diff.states).toHaveLength(2);
    expect(diff.sourceUpdatedAt).toBe(now);
  });

  it('classifies sales, sellbacks, and restocks separately', () => {
    const now = at(10);
    const states = stateMap(at(9), 10);

    const sale = diffStock(stockData(now, [{ itemId: 1, quantity: 7 }]), states, now);
    expect(sale.changes[0]).toMatchObject({ previousQuantity: 10, quantity: 7, kind: 'sale' });

    const sellbackStates = new Map(sale.states.map((state) => [`jap:${state.itemId}`, state]));
    const sellback = diffStock(
      stockData(now + 60_000, [{ itemId: 1, quantity: 20 }]),
      sellbackStates,
      now + 60_000,
    );
    expect(sellback.changes[0]).toMatchObject({
      previousQuantity: 7,
      quantity: 20,
      kind: 'sellback',
    });

    const restockStates = new Map(sellback.states.map((state) => [`jap:${state.itemId}`, state]));
    const restock = diffStock(
      stockData(now + 120_000, [{ itemId: 1, quantity: 0 }]),
      restockStates,
      now + 120_000,
    );
    const emptyStates = new Map(restock.states.map((state) => [`jap:${state.itemId}`, state]));
    const refill = diffStock(
      stockData(now + 180_000, [{ itemId: 1, quantity: 60 }]),
      emptyStates,
      now + 180_000,
    );
    expect(refill.changes[0]).toMatchObject({
      previousQuantity: 0,
      quantity: 60,
      kind: 'restock',
    });
  });

  it('does not record unchanged quantities but refreshes the last seen time', () => {
    const firstAt = at(9);
    const states = stateMap(firstAt, 10);
    const now = at(10);
    const diff = diffStock(stockData(now, [{ itemId: 1, quantity: 10 }]), states, now);

    expect(diff.changes).toEqual([]);
    expect(diff.states[0]).toMatchObject({
      quantity: 10,
      firstSeenAt: firstAt,
      lastSeenAt: now,
      lastEventAt: firstAt,
    });
  });

  it('treats a cost-only change as state, not stock history', () => {
    const states = stateMap(at(9), 10, 100);
    const now = at(10);
    const diff = diffStock(stockData(now, [{ itemId: 1, quantity: 10, cost: 125 }]), states, now);

    expect(diff.changes).toEqual([]);
    expect(diff.states[0]?.cost).toBe(125);
  });

  it('keeps event timestamps monotonic and bounded by collection time', () => {
    const states = stateMap(at(9), 10);
    const now = at(10);
    const diff = diffStock(stockData(now, [{ itemId: 1, quantity: 4 }], at(8)), states, now);
    expect(diff.changes[0]?.at).toBe(at(9) + 1);

    const future = diffStock(
      stockData(now + 60_000, [{ itemId: 1, quantity: 3 }], now + 999_000),
      new Map(diff.states.map((state) => [`jap:${state.itemId}`, state])),
      now + 60_000,
    );
    expect(future.changes[0]?.at).toBe(now + 60_000);
  });

  it('normalizes fractional and negative quantities', () => {
    const now = at(10);
    const diff = diffStock(
      stockData(now, [
        { itemId: 1, quantity: 4.9 },
        { itemId: 2, quantity: -2 },
      ]),
      new Map(),
      now,
    );
    expect(diff.states.map((state) => state.quantity)).toEqual([4, 0]);
  });

  it('ignores items with non-finite values', () => {
    const now = at(10);
    const data = stockData(now, [{ itemId: 1, quantity: 5 }]);
    data.countries.jap?.items.push({
      itemId: 2,
      name: 'Broken',
      quantity: Number.NaN,
      cost: 100,
    });
    const diff = diffStock(data, new Map(), now);
    expect(diff.states).toHaveLength(1);
    expect(diff.changes).toHaveLength(1);
  });
});
