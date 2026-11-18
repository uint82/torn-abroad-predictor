import type { CatalogItem, CatalogShop, StockData, StockEntry } from '../core/types';
import { COUNTRY_CODES, type CountryCode, type CountryStock } from '../core/types';
import { isFiniteNumber, isNonNegativeNumber, isRecord } from '../core/json';
import type { StorageAdapter } from './storage';
import { STORAGE_KEYS } from './keys';

export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
export const STOCK_TTL_MS = 60 * 1000;
export const STOCK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface CatalogCache {
  savedAt: number;
  items: CatalogItem[];
}

export interface StockCache {
  savedAt: number;
  data: StockData;
}

function isCatalogShop(value: unknown): value is CatalogShop {
  return (
    isRecord(value) &&
    typeof value.country === 'string' &&
    typeof value.shop === 'string' &&
    (value.buyPrice === null || isNonNegativeNumber(value.buyPrice)) &&
    (value.sellPrice === null || isNonNegativeNumber(value.sellPrice))
  );
}

function isCatalogItem(value: unknown): value is CatalogItem {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    typeof value.name === 'string' &&
    typeof value.type === 'string' &&
    (value.marketPrice === null || isNonNegativeNumber(value.marketPrice)) &&
    Array.isArray(value.shops) &&
    value.shops.every(isCatalogShop)
  );
}

function isStockEntry(value: unknown): value is StockEntry {
  return (
    isRecord(value) &&
    isFiniteNumber(value.itemId) &&
    typeof value.name === 'string' &&
    isNonNegativeNumber(value.quantity) &&
    isNonNegativeNumber(value.cost)
  );
}

function isCountryStock(value: unknown, code: CountryCode): value is CountryStock {
  return (
    isRecord(value) &&
    value.code === code &&
    isFiniteNumber(value.updatedAt) &&
    Array.isArray(value.items) &&
    value.items.every(isStockEntry)
  );
}

function isStockData(value: unknown): value is StockData {
  if (!isRecord(value) || !isFiniteNumber(value.fetchedAt) || !isRecord(value.countries)) {
    return false;
  }
  const countries = value.countries;
  return COUNTRY_CODES.every((code) => {
    const country = countries[code];
    return country === undefined || isCountryStock(country, code);
  });
}

function readEnvelope(
  storage: StorageAdapter,
  key: string,
  now: number,
): { savedAt: number; value: unknown } | null {
  const raw = storage.read(key);
  if (!isRecord(raw) || !isFiniteNumber(raw.savedAt) || raw.savedAt > now + 60_000) {
    return null;
  }
  return { savedAt: raw.savedAt, value: raw.value };
}

export function isCacheFresh(savedAt: number, ttlMs: number, now: number): boolean {
  const age = now - savedAt;
  return age >= 0 && age <= ttlMs;
}

export function loadCatalogCache(storage: StorageAdapter, now: number): CatalogCache | null {
  const envelope = readEnvelope(storage, STORAGE_KEYS.catalog, now);
  if (!envelope || !isRecord(envelope.value) || !Array.isArray(envelope.value.items)) {
    return null;
  }
  return {
    savedAt: envelope.savedAt,
    items: envelope.value.items.filter(isCatalogItem),
  };
}

export function saveCatalogCache(
  storage: StorageAdapter,
  items: readonly CatalogItem[],
  now: number,
): boolean {
  return storage.write(STORAGE_KEYS.catalog, { savedAt: now, value: { items } });
}

export function loadStockCache(storage: StorageAdapter, now: number): StockCache | null {
  const envelope = readEnvelope(storage, STORAGE_KEYS.stock, now);
  if (!envelope || !isStockData(envelope.value)) {
    return null;
  }
  return { savedAt: envelope.savedAt, data: envelope.value };
}

export function saveStockCache(storage: StorageAdapter, data: StockData, now: number): boolean {
  return storage.write(STORAGE_KEYS.stock, { savedAt: now, value: data });
}
