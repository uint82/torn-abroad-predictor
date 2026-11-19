import type { CountryCode, StockData } from '../src/core/types';

export type StockChangeKind = 'initial' | 'restock' | 'sellback' | 'sale';

export interface StockState {
  country: CountryCode;
  itemId: number;
  quantity: number;
  cost: number;
  sourceUpdatedAt: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastEventAt: number;
}

export interface StockChange {
  country: CountryCode;
  itemId: number;
  at: number;
  sourceUpdatedAt: number;
  previousQuantity: number | null;
  quantity: number;
  cost: number;
  delta: number;
  kind: StockChangeKind;
}

export interface StockDiff {
  changes: StockChange[];
  states: StockState[];
  sourceUpdatedAt: number;
}

export function stockStateKey(country: CountryCode, itemId: number): string {
  return `${country}:${itemId}`;
}

function changeKind(previous: number | null, quantity: number): StockChangeKind {
  if (previous === null) {
    return 'initial';
  }
  if (quantity > previous) {
    return previous === 0 ? 'restock' : 'sellback';
  }
  return 'sale';
}

function eventAt(previous: StockState | undefined, sourceUpdatedAt: number, now: number): number {
  const source = Math.min(now, Math.max(0, sourceUpdatedAt));
  if (!previous) {
    return source;
  }
  return Math.min(now, Math.max(source, previous.lastEventAt + 1));
}

function normalizedQuantity(quantity: number): number {
  return Math.max(0, Math.floor(quantity));
}

export function diffStock(
  data: StockData,
  states: ReadonlyMap<string, StockState>,
  now: number,
): StockDiff {
  const changes: StockChange[] = [];
  const nextStates: StockState[] = [];
  let sourceUpdatedAt = 0;

  for (const country of Object.values(data.countries)) {
    if (!country) {
      continue;
    }
    const updatedAt = Math.min(now, Math.max(0, country.updatedAt));
    sourceUpdatedAt = Math.max(sourceUpdatedAt, updatedAt);

    for (const item of country.items) {
      if (!Number.isFinite(item.quantity) || !Number.isFinite(item.cost)) {
        continue;
      }
      const quantity = normalizedQuantity(item.quantity);
      const key = stockStateKey(country.code, item.itemId);
      const previous = states.get(key);
      const lastEventAt =
        previous?.quantity === quantity ? previous.lastEventAt : eventAt(previous, updatedAt, now);
      nextStates.push({
        country: country.code,
        itemId: item.itemId,
        quantity,
        cost: item.cost,
        sourceUpdatedAt: updatedAt,
        firstSeenAt: previous?.firstSeenAt ?? updatedAt,
        lastSeenAt: now,
        lastEventAt,
      });

      if (previous?.quantity === quantity) {
        continue;
      }
      changes.push({
        country: country.code,
        itemId: item.itemId,
        at: lastEventAt,
        sourceUpdatedAt: updatedAt,
        previousQuantity: previous?.quantity ?? null,
        quantity,
        cost: item.cost,
        delta: quantity - (previous?.quantity ?? 0),
        kind: changeKind(previous?.quantity ?? null, quantity),
      });
    }
  }

  return { changes, states: nextStates, sourceUpdatedAt };
}
