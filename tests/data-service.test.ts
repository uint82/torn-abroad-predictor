import { describe, expect, it, vi } from 'vitest';
import type { CatalogItem, MarketQuote, StockData } from '../src/core/types';
import { DEFAULT_FILTERS, DEFAULT_SETTINGS } from '../src/core/types';
import { ApiError } from '../src/core/errors';
import type { CatalogClient, StockClient } from '../src/state/clients';
import { createInitialState } from '../src/state/app-state';
import { DataService } from '../src/state/data-service';
import { Store } from '../src/state/store';
import { createMemoryBackend, createStorageAdapter } from '../src/storage/storage';
import { loadCatalogCache, loadStockCache } from '../src/storage/cache';
import { loadSettings } from '../src/storage/settings';
import { loadHistories } from '../src/storage/history';
import { at } from './fixtures';

const NOW = at(12);

const catalog: CatalogItem[] = [
  {
    id: 1,
    name: 'Ramen',
    type: 'Drug',
    marketPrice: 2000,
    shops: [{ country: 'Japan', shop: 'Ramen Shop', buyPrice: 900, sellPrice: null }],
  },
  {
    id: 2,
    name: 'Panda Plushie',
    type: 'Plushie',
    marketPrice: 1000,
    shops: [{ country: 'Japan', shop: 'Toy Shop', buyPrice: 500, sellPrice: null }],
  },
];

const stockData: StockData = {
  fetchedAt: NOW,
  countries: {
    jap: {
      code: 'jap',
      updatedAt: NOW,
      items: [
        { itemId: 1, name: 'Ramen', quantity: 5, cost: 900 },
        { itemId: 2, name: 'Panda Plushie', quantity: 50, cost: 500 },
      ],
    },
  },
};

const quote: MarketQuote = {
  itemId: 1,
  averagePrice: 2100,
  lowestPrice: 2000,
  listingsCount: 3,
  fetchedAt: NOW,
};

function makeStockClient(): StockClient {
  return { getTravelStock: async () => stockData };
}

function makeTornClient(overrides: Partial<CatalogClient> = {}): CatalogClient {
  return {
    getCatalog: async () => catalog,
    getQuotes: async () => ({ quotes: { 1: quote }, failures: [] }),
    ...overrides,
  };
}

function makeService(
  options: {
    apiKey?: string;
    torn?: CatalogClient;
    withCatalog?: boolean;
    withStock?: boolean;
  } = {},
) {
  const storage = createStorageAdapter(createMemoryBackend());
  const store = new Store(
    createInitialState({
      settings: { ...DEFAULT_SETTINGS, method: 'airstrip', capacity: 10 },
      filters: DEFAULT_FILTERS,
      apiKey: options.apiKey ?? '',
      catalog: options.withCatalog ? { savedAt: NOW, items: catalog } : null,
      stock: options.withStock ? { savedAt: NOW, data: stockData } : null,
      histories: { stock: {}, prices: {} },
      country: 'jap',
    }),
  );
  const torn = options.torn ?? makeTornClient();
  const service = new DataService({
    store,
    storage,
    createTornClient: () => torn,
    createStockClient: makeStockClient,
    now: () => NOW,
  });
  return { store, storage, service, torn };
}

describe('DataService', () => {
  it('refreshes stock and records history', async () => {
    const { store, storage, service } = makeService();
    await service.refreshStock(true);

    const state = store.get();
    expect(state.stock).toEqual(stockData);
    expect(state.stockSavedAt).toBe(NOW);
    expect(state.stockStatus).toBe('ready');
    expect(state.histories.stock.jap?.[1]).toHaveLength(1);
    expect(loadStockCache(storage, NOW)?.savedAt).toBe(NOW);
    expect(loadHistories(storage, NOW)?.stock.jap?.[1]).toHaveLength(1);
  });

  it('validates the key while refreshing the catalog', async () => {
    const { store, storage, service } = makeService({ apiKey: 'good' });
    await service.refreshCatalog(true);

    expect(store.get().catalog).toHaveLength(2);
    expect(store.get().keyStatus).toBe('valid');
    expect(loadCatalogCache(storage, NOW)?.items).toHaveLength(2);
  });

  it('flags an invalid key', async () => {
    const torn = makeTornClient({
      getCatalog: async () => {
        throw new ApiError('Invalid key.', 2, false);
      },
    });
    const { store, service } = makeService({ apiKey: 'bad', torn });
    await service.refreshCatalog(true);

    expect(store.get().keyStatus).toBe('invalid');
    expect(store.get().keyMessage).toBe('Invalid key.');
    expect(store.get().catalogStatus).toBe('error');
  });

  it('refreshes quotes after the catalog is ready', async () => {
    const getQuotes = vi.fn(async () => ({
      quotes: { 1: quote },
      failures: [{ itemId: 2, message: 'No listings.' }],
    }));
    const torn = makeTornClient({ getQuotes });
    const { store, storage, service } = makeService({
      apiKey: 'good',
      torn,
      withCatalog: true,
      withStock: true,
    });
    await service.refreshAll(true);

    const state = store.get();
    expect(getQuotes).toHaveBeenCalled();
    expect(state.quotes[1]).toEqual(quote);
    expect(state.quoteStatus).toBe('ready');
    expect(state.quoteFailures).toHaveLength(1);
    expect(state.notice).toContain('1 live quotes failed');
    expect(state.histories.prices[1]).toHaveLength(1);
    expect(loadHistories(storage, NOW)?.prices[1]).toHaveLength(1);
  });

  it('stores and validates a new key', async () => {
    const { store, service } = makeService();
    await service.saveKey('good');

    expect(store.get().apiKey).toBe('good');
    expect(store.get().keyStatus).toBe('valid');
    expect(store.get().catalog).toHaveLength(2);
  });

  it('clears the key and live quotes', () => {
    const { store, service } = makeService({ apiKey: 'good' });
    service.removeKey();

    const state = store.get();
    expect(state.apiKey).toBe('');
    expect(state.keyStatus).toBe('missing');
    expect(state.quotes).toEqual({});
    expect(state.quoteStatus).toBe('idle');
  });

  it('sanitizes settings before saving', () => {
    const { store, storage, service } = makeService();
    service.updateSettings({ ...DEFAULT_SETTINGS, capacity: 99, waitMinutes: -5 });

    expect(store.get().settings.capacity).toBe(43);
    expect(store.get().settings.waitMinutes).toBe(0);
    expect(loadSettings(storage).capacity).toBe(43);
  });

  it('refetches quotes when the country changes', async () => {
    const { store, service } = makeService({
      apiKey: 'good',
      withCatalog: true,
      withStock: true,
    });
    await service.setCountry('mex');

    expect(store.get().country).toBe('mex');
    expect(store.get().selectedItemId).toBeNull();
    expect(store.get().lastQuoteRefreshAt).toBe(NOW);
  });
});
