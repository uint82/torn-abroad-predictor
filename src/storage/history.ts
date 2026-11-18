import type { CountryCode, Histories, PriceObservation, StockObservation } from '../core/types';
import { COUNTRY_CODES } from '../core/types';
import { isFiniteNumber, isNonNegativeNumber, isPositiveInteger, isRecord } from '../core/json';
import { sanitizePriceObservations, sanitizeStockObservations } from '../domain/prediction';
import type { StorageAdapter } from './storage';
import { STORAGE_KEYS } from './keys';

export const MAX_HISTORY_ITEMS = 240;
export const MAX_OBSERVATIONS = 288;
export const STOCK_RECORD_MIN_GAP_MS = 5 * 60_000;
export const PRICE_RECORD_MIN_GAP_MS = 30 * 60_000;

export interface StockSnapshotEntry {
  itemId: number;
  quantity: number;
}

export interface PriceSnapshotEntry {
  itemId: number;
  price: number | null;
}

function isStockObservation(value: unknown): value is StockObservation {
  return isRecord(value) && isFiniteNumber(value.at) && isNonNegativeNumber(value.quantity);
}

function isPriceObservation(value: unknown): value is PriceObservation {
  return (
    isRecord(value) && isFiniteNumber(value.at) && isFiniteNumber(value.price) && value.price > 0
  );
}

function readObservationMap<T>(
  value: unknown,
  guard: (entry: unknown) => entry is T,
): Record<number, T[]> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<number, T[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    const itemId = Number(key);
    if (!isPositiveInteger(itemId) || !Array.isArray(raw)) {
      continue;
    }
    const observations = raw.filter(guard);
    if (observations.length > 0) {
      result[itemId] = observations;
    }
  }
  return result;
}

function lastAt(observations: readonly { at: number }[]): number {
  return observations[observations.length - 1]?.at ?? 0;
}

function pruneMap<T extends { at: number }>(
  map: Record<number, readonly T[]>,
  clean: (observations: readonly T[]) => T[],
): Record<number, T[]> {
  const entries = Object.entries(map).flatMap(([key, observations]) => {
    const itemId = Number(key);
    if (!isPositiveInteger(itemId) || !Array.isArray(observations)) {
      return [];
    }
    const cleaned = clean(observations).slice(-MAX_OBSERVATIONS);
    return cleaned.length > 0 ? [{ itemId, observations: cleaned }] : [];
  });

  entries.sort((a, b) => lastAt(b.observations) - lastAt(a.observations));
  const result: Record<number, T[]> = {};
  for (const entry of entries.slice(0, MAX_HISTORY_ITEMS)) {
    result[entry.itemId] = entry.observations;
  }
  return result;
}

function pruneStockHistories(stock: Histories['stock'], now: number): Histories['stock'] {
  const result: Histories['stock'] = {};
  for (const code of COUNTRY_CODES) {
    const map = stock[code];
    if (!map) {
      continue;
    }
    const pruned = pruneMap(map, (observations) => sanitizeStockObservations(observations, now));
    if (Object.keys(pruned).length > 0) {
      result[code] = pruned;
    }
  }
  return result;
}

function readStockHistories(value: unknown): Histories['stock'] {
  if (!isRecord(value)) {
    return {};
  }
  const result: Histories['stock'] = {};
  for (const code of COUNTRY_CODES) {
    const country = value[code];
    if (country === undefined) {
      continue;
    }
    const observations = readObservationMap(country, isStockObservation);
    if (Object.keys(observations).length > 0) {
      result[code] = observations;
    }
  }
  return result;
}

export function pruneHistories(histories: Histories, now: number): Histories {
  return {
    stock: pruneStockHistories(histories.stock, now),
    prices: pruneMap(histories.prices, (observations) =>
      sanitizePriceObservations(observations, now),
    ),
  };
}

export function loadHistories(storage: StorageAdapter, now: number): Histories {
  const raw = storage.read(STORAGE_KEYS.histories);
  if (!isRecord(raw)) {
    return { stock: {}, prices: {} };
  }
  return pruneHistories(
    {
      stock: readStockHistories(raw.stock),
      prices: readObservationMap(raw.prices, isPriceObservation),
    },
    now,
  );
}

export function saveHistories(storage: StorageAdapter, histories: Histories, now: number): boolean {
  return storage.write(STORAGE_KEYS.histories, pruneHistories(histories, now));
}

export function recordStockSnapshot(
  histories: Histories,
  country: CountryCode,
  entries: readonly StockSnapshotEntry[],
  at: number,
  now: number,
): Histories {
  if (!isFiniteNumber(at)) {
    return histories;
  }
  const stock = { ...histories.stock };
  const countryHistory = { ...(stock[country] ?? {}) };
  for (const entry of entries) {
    if (!isPositiveInteger(entry.itemId) || !isNonNegativeNumber(entry.quantity)) {
      continue;
    }
    const quantity = Math.floor(entry.quantity);
    const history = countryHistory[entry.itemId] ?? [];
    const latest = history[history.length - 1];
    if (latest && at <= latest.at) {
      continue;
    }
    const unchanged =
      latest !== undefined &&
      latest.quantity === quantity &&
      at - latest.at < STOCK_RECORD_MIN_GAP_MS;
    if (unchanged) {
      continue;
    }
    countryHistory[entry.itemId] = [...history, { at, quantity }];
  }
  stock[country] = countryHistory;
  return pruneHistories({ stock, prices: histories.prices }, now);
}

export function recordPriceSnapshot(
  histories: Histories,
  entries: readonly PriceSnapshotEntry[],
  at: number,
  now: number,
): Histories {
  if (!isFiniteNumber(at)) {
    return histories;
  }
  const prices = { ...histories.prices };
  for (const entry of entries) {
    if (
      !isPositiveInteger(entry.itemId) ||
      entry.price === null ||
      !isFiniteNumber(entry.price) ||
      entry.price <= 0
    ) {
      continue;
    }
    const history = prices[entry.itemId] ?? [];
    const latest = history[history.length - 1];
    if (latest && at <= latest.at) {
      continue;
    }
    const unchanged =
      latest !== undefined &&
      latest.price === entry.price &&
      at - latest.at < PRICE_RECORD_MIN_GAP_MS;
    if (unchanged) {
      continue;
    }
    prices[entry.itemId] = [...history, { at, price: entry.price }];
  }
  return pruneHistories({ stock: histories.stock, prices }, now);
}
