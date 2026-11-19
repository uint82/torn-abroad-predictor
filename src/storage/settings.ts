import type { PriceBasis, SaleChannel, Settings, TravelMethod } from '../core/types';
import { DEFAULT_SETTINGS, SALE_CHANNELS, TRAVEL_METHODS } from '../core/types';
import { isFiniteNumber, isRecord } from '../core/json';
import type { StorageAdapter } from './storage';
import { STORAGE_KEYS } from './keys';

export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 43;
export const MAX_WAIT_MINUTES = 24 * 60;
export const MAX_TICKET_COST = 100_000_000;
export const MAX_API_KEY_LENGTH = 64;
export const PRICE_BASES: readonly PriceBasis[] = ['average', 'lowest'];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && options.includes(value as T) ? (value as T) : fallback;
}

export function sanitizeSettings(value: unknown): Settings {
  const record = isRecord(value) ? value : {};
  return {
    method: pick<TravelMethod>(record.method, TRAVEL_METHODS, DEFAULT_SETTINGS.method),
    capacity: clampInteger(record.capacity, MIN_CAPACITY, MAX_CAPACITY, DEFAULT_SETTINGS.capacity),
    channel: pick<SaleChannel>(record.channel, SALE_CHANNELS, DEFAULT_SETTINGS.channel),
    customFeePercent: clampNumber(
      record.customFeePercent,
      0,
      100,
      DEFAULT_SETTINGS.customFeePercent,
    ),
    priceBasis: pick<PriceBasis>(record.priceBasis, PRICE_BASES, DEFAULT_SETTINGS.priceBasis),
    waitMinutes: clampInteger(
      record.waitMinutes,
      0,
      MAX_WAIT_MINUTES,
      DEFAULT_SETTINGS.waitMinutes,
    ),
    book: typeof record.book === 'boolean' ? record.book : DEFAULT_SETTINGS.book,
    includePredictedStock:
      typeof record.includePredictedStock === 'boolean'
        ? record.includePredictedStock
        : DEFAULT_SETTINGS.includePredictedStock,
    businessTicketCost: clampNumber(
      record.businessTicketCost,
      0,
      MAX_TICKET_COST,
      DEFAULT_SETTINGS.businessTicketCost,
    ),
  };
}

export function loadSettings(storage: StorageAdapter): Settings {
  return sanitizeSettings(storage.read(STORAGE_KEYS.settings));
}

export function saveSettings(storage: StorageAdapter, settings: Settings): boolean {
  return storage.write(STORAGE_KEYS.settings, sanitizeSettings(settings));
}

export function loadApiKey(storage: StorageAdapter): string {
  const value = storage.read(STORAGE_KEYS.apiKey);
  return typeof value === 'string' ? value.trim().slice(0, MAX_API_KEY_LENGTH) : '';
}

export function saveApiKey(storage: StorageAdapter, key: string): boolean {
  const trimmed = key.trim().slice(0, MAX_API_KEY_LENGTH);
  if (trimmed === '') {
    storage.remove(STORAGE_KEYS.apiKey);
    return true;
  }
  return storage.write(STORAGE_KEYS.apiKey, trimmed);
}
