import { describe, expect, it } from 'vitest';
import type { CatalogItem, Histories, StockData } from '../src/core/types';
import {
  createMemoryBackend,
  createStorageAdapter,
  getDefaultBackend,
} from '../src/storage/storage';
import {
  MAX_API_KEY_LENGTH,
  MAX_CAPACITY,
  loadApiKey,
  loadSettings,
  sanitizeSettings,
  saveApiKey,
  saveSettings,
} from '../src/storage/settings';
import {
  CATALOG_TTL_MS,
  STOCK_TTL_MS,
  isCacheFresh,
  loadCatalogCache,
  loadStockCache,
  saveCatalogCache,
  saveStockCache,
} from '../src/storage/cache';
import {
  MAX_OBSERVATIONS,
  loadHistories,
  pruneHistories,
  recordPriceSnapshot,
  recordStockSnapshot,
  saveHistories,
} from '../src/storage/history';
import { STORAGE_KEYS } from '../src/storage/keys';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { at } from './fixtures';

const catalogItem: CatalogItem = {
  id: 1,
  name: 'Ramen',
  type: 'Drug',
  marketPrice: 2000,
  shops: [{ country: 'Japan', shop: 'Ramen Shop', buyPrice: 900, sellPrice: null }],
};

const stockData: StockData = {
  fetchedAt: at(10),
  countries: {
    mex: {
      code: 'mex',
      updatedAt: at(10),
      items: [{ itemId: 1, name: 'Ramen', quantity: 5, cost: 100 }],
    },
  },
};

function memoryStorage() {
  return createStorageAdapter(createMemoryBackend());
}

describe('storage adapter', () => {
  it('round-trips JSON values', () => {
    const storage = memoryStorage();
    expect(storage.write('key', { hello: 'world' })).toBe(true);
    expect(storage.read('key')).toEqual({ hello: 'world' });
    storage.remove('key');
    expect(storage.read('key')).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    const backend = createMemoryBackend();
    backend.setItem('key', '{oops');
    const storage = createStorageAdapter(backend);
    expect(storage.read('key')).toBeNull();
  });

  it('reports a failed write', () => {
    const storage = createStorageAdapter({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    });
    expect(storage.write('key', 1)).toBe(false);
  });

  it('falls back to memory without localStorage', () => {
    const backend = getDefaultBackend();
    backend.setItem('a', '1');
    expect(backend.getItem('a')).toBe('1');
  });
});

describe('settings', () => {
  it('fills defaults from garbage', () => {
    const settings = sanitizeSettings({
      method: 'teleport',
      capacity: 500,
      channel: 'bank',
      customFeePercent: -5,
      priceBasis: 'wat',
      waitMinutes: -10,
      book: 'yes',
      includePredictedStock: null,
      businessTicketCost: Number.POSITIVE_INFINITY,
    });
    expect(settings).toEqual({
      ...DEFAULT_SETTINGS,
      capacity: MAX_CAPACITY,
      customFeePercent: 0,
      waitMinutes: 0,
      businessTicketCost: 0,
    });
  });

  it('keeps valid values', () => {
    const settings = sanitizeSettings({
      method: 'business',
      capacity: 30,
      channel: 'custom',
      customFeePercent: 7.5,
      priceBasis: 'lowest',
      waitMinutes: 20,
      book: true,
      includePredictedStock: false,
      businessTicketCost: 1234,
    });
    expect(settings).toEqual({
      method: 'business',
      capacity: 30,
      channel: 'custom',
      customFeePercent: 7.5,
      priceBasis: 'lowest',
      waitMinutes: 20,
      book: true,
      includePredictedStock: false,
      businessTicketCost: 1234,
    });
  });

  it('round-trips settings', () => {
    const storage = memoryStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, capacity: 40 });
    expect(loadSettings(storage).capacity).toBe(40);
  });

  it('round-trips and clears the API key', () => {
    const storage = memoryStorage();
    expect(saveApiKey(storage, '  abc  ')).toBe(true);
    expect(loadApiKey(storage)).toBe('abc');
    saveApiKey(storage, '');
    expect(loadApiKey(storage)).toBe('');
  });

  it('truncates an oversized key', () => {
    const storage = memoryStorage();
    saveApiKey(storage, 'x'.repeat(MAX_API_KEY_LENGTH + 10));
    expect(loadApiKey(storage)).toHaveLength(MAX_API_KEY_LENGTH);
  });
});

describe('cache', () => {
  it('round-trips the catalog', () => {
    const storage = memoryStorage();
    const now = at(10);
    expect(saveCatalogCache(storage, [catalogItem], now)).toBe(true);
    expect(loadCatalogCache(storage, now)).toEqual({ savedAt: now, items: [catalogItem] });
  });

  it('drops malformed cached items', () => {
    const storage = memoryStorage();
    const now = at(10);
    storage.write(STORAGE_KEYS.catalog, {
      savedAt: now,
      value: { items: [catalogItem, { id: 'nope' }] },
    });
    expect(loadCatalogCache(storage, now)?.items).toEqual([catalogItem]);
  });

  it('ignores a cache from the future', () => {
    const storage = memoryStorage();
    const now = at(10);
    storage.write(STORAGE_KEYS.catalog, {
      savedAt: now + 120_000,
      value: { items: [] },
    });
    expect(loadCatalogCache(storage, now)).toBeNull();
  });

  it('round-trips stock data', () => {
    const storage = memoryStorage();
    const now = at(10);
    saveStockCache(storage, stockData, now);
    expect(loadStockCache(storage, now)).toEqual({ savedAt: now, data: stockData });
  });

  it('rejects malformed stock data', () => {
    const storage = memoryStorage();
    const now = at(10);
    storage.write(STORAGE_KEYS.stock, {
      savedAt: now,
      value: { fetchedAt: now, countries: { mex: { code: 'mex' } } },
    });
    expect(loadStockCache(storage, now)).toBeNull();
  });

  it('measures freshness', () => {
    expect(isCacheFresh(1000, 500, 1400)).toBe(true);
    expect(isCacheFresh(1000, 500, 1600)).toBe(false);
    expect(isCacheFresh(1000, 500, 900)).toBe(false);
    expect(CATALOG_TTL_MS).toBeGreaterThan(STOCK_TTL_MS);
  });
});

describe('history', () => {
  it('stores a changed quantity immediately', () => {
    const histories: Histories = { stock: {}, prices: {} };
    const first = recordStockSnapshot(histories, [{ itemId: 1, quantity: 50 }], at(9), at(9));
    const second = recordStockSnapshot(first, [{ itemId: 1, quantity: 40 }], at(9, 1), at(9, 1));
    expect(second.stock[1]).toEqual([
      { at: at(9), quantity: 50 },
      { at: at(9, 1), quantity: 40 },
    ]);
  });

  it('skips an unchanged quantity inside the gap', () => {
    const histories = recordStockSnapshot(
      { stock: {}, prices: {} },
      [{ itemId: 1, quantity: 50 }],
      at(9),
      at(9),
    );
    const next = recordStockSnapshot(histories, [{ itemId: 1, quantity: 50 }], at(9, 1), at(9, 1));
    expect(next.stock[1]).toHaveLength(1);
  });

  it('keeps an unchanged quantity after the gap', () => {
    const histories = recordStockSnapshot(
      { stock: {}, prices: {} },
      [{ itemId: 1, quantity: 50 }],
      at(9),
      at(9),
    );
    const next = recordStockSnapshot(histories, [{ itemId: 1, quantity: 50 }], at(9, 5), at(9, 5));
    expect(next.stock[1]).toHaveLength(2);
  });

  it('ignores observations that go backwards', () => {
    const histories = recordStockSnapshot(
      { stock: {}, prices: {} },
      [{ itemId: 1, quantity: 50 }],
      at(9),
      at(9),
    );
    const next = recordStockSnapshot(histories, [{ itemId: 1, quantity: 40 }], at(8), at(9));
    expect(next.stock[1]).toEqual([{ at: at(9), quantity: 50 }]);
  });

  it('prunes old observations and invalid entries', () => {
    const histories: Histories = {
      stock: {
        1: [
          { at: at(9), quantity: 50 },
          { at: at(9) - 25 * 60 * 60 * 1000, quantity: 10 },
        ],
      },
      prices: {},
    };
    expect(pruneHistories(histories, at(10)).stock[1]).toEqual([{ at: at(9), quantity: 50 }]);
  });

  it('caps the number of observations', () => {
    const entries = Array.from({ length: MAX_OBSERVATIONS + 5 }, (_value, index) => ({
      at: at(9) + index * 60_000,
      quantity: 50,
    }));
    const histories: Histories = { stock: { 1: entries }, prices: {} };
    const pruned = pruneHistories(histories, at(15));
    expect(pruned.stock[1]).toHaveLength(MAX_OBSERVATIONS);
    expect(pruned.stock[1]?.[0]?.at).toBe(at(9) + 5 * 60_000);
  });

  it('records a changed price immediately', () => {
    const histories: Histories = { stock: {}, prices: {} };
    const first = recordPriceSnapshot(histories, [{ itemId: 1, price: 100 }], at(9), at(9));
    const second = recordPriceSnapshot(first, [{ itemId: 1, price: 110 }], at(9, 1), at(9, 1));
    expect(second.prices[1]).toEqual([
      { at: at(9), price: 100 },
      { at: at(9, 1), price: 110 },
    ]);
  });

  it('skips an unchanged price until the gap', () => {
    const histories = recordPriceSnapshot(
      { stock: {}, prices: {} },
      [{ itemId: 1, price: 100 }],
      at(9),
      at(9),
    );
    const sameMinute = recordPriceSnapshot(
      histories,
      [{ itemId: 1, price: 100 }],
      at(9, 1),
      at(9, 1),
    );
    expect(sameMinute.prices[1]).toHaveLength(1);
    const later = recordPriceSnapshot(
      sameMinute,
      [{ itemId: 1, price: 100 }],
      at(9, 31),
      at(9, 31),
    );
    expect(later.prices[1]).toHaveLength(2);
  });

  it('ignores a null price', () => {
    const histories = recordPriceSnapshot(
      { stock: {}, prices: {} },
      [{ itemId: 1, price: null }],
      at(9),
      at(9),
    );
    expect(histories.prices[1]).toBeUndefined();
  });

  it('round-trips histories and drops malformed entries', () => {
    const storage = memoryStorage();
    const now = at(10);
    const histories: Histories = {
      stock: { 1: [{ at: at(9), quantity: 50 }] },
      prices: { 1: [{ at: at(9), price: 100 }] },
    };
    expect(saveHistories(storage, histories, now)).toBe(true);
    const loaded = loadHistories(storage, now);
    expect(loaded.stock[1]).toEqual([{ at: at(9), quantity: 50 }]);
    expect(loaded.prices[1]).toEqual([{ at: at(9), price: 100 }]);

    storage.write(STORAGE_KEYS.histories, {
      stock: { 2: [{ at: at(9), quantity: 'many' }] },
      prices: { 2: [{ at: at(9), price: -1 }] },
    });
    expect(loadHistories(storage, now)).toEqual({ stock: {}, prices: {} });
  });
});
