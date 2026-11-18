import type { ItemRow, PriceTrend, Settings, StockForecast } from '../src/core/types';
import { DEFAULT_SETTINGS } from '../src/core/types';

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

export function makeForecast(overrides: Partial<StockForecast> = {}): StockForecast {
  return {
    status: 'unknown',
    expectedStock: null,
    nextRestockAt: null,
    confidence: 'low',
    sellRatePerHour: null,
    restockSize: null,
    horizonMinutes: 0,
    samples: 0,
    ...overrides,
  };
}

export function makeTrend(overrides: Partial<PriceTrend> = {}): PriceTrend {
  return {
    direction: 'unknown',
    changePercent: null,
    volatilityPercent: null,
    samples: 0,
    ...overrides,
  };
}

export function makeRow(itemId: number, name: string, overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    itemId,
    name,
    type: 'Other',
    group: 'other',
    shop: 'Test shop',
    buyPrice: 100,
    stock: 10,
    stockUpdatedAt: 0,
    marketAverage: 110,
    lowestListing: null,
    salePrice: 110,
    netSalePrice: 104.5,
    unitProfit: 4.5,
    quoteSource: 'catalog',
    quoteFetchedAt: null,
    forecast: makeForecast(),
    trend: makeTrend(),
    ...overrides,
  };
}

export const at = (hour: number, minute = 0): number => Date.UTC(2026, 0, 1, hour, minute, 0);
