import { describe, expect, it } from 'vitest';
import type { CatalogItem, CountryStock, Histories, MarketQuote } from '../src/core/types';
import { EMPTY_HISTORIES } from '../src/core/types';
import { buildItemRows } from '../src/domain/catalog';
import { at, makeSettings } from './fixtures';

const catalog: CatalogItem[] = [
  {
    id: 1,
    name: 'Ramen',
    type: 'Drug',
    marketPrice: 2000,
    shops: [
      { country: 'Japan', shop: 'Ramen Shop', buyPrice: 1000, sellPrice: null },
      { country: 'Japan', shop: 'Cheap Ramen', buyPrice: 900, sellPrice: null },
      { country: 'China', shop: 'Beijing Shop', buyPrice: 700, sellPrice: null },
    ],
  },
  {
    id: 2,
    name: 'Panda Plushie',
    type: 'Plushie',
    marketPrice: 1000,
    shops: [{ country: 'Japan', shop: 'Toy Shop', buyPrice: 500, sellPrice: null }],
  },
  {
    id: 4,
    name: 'No Japan Shop',
    type: 'Flower',
    marketPrice: 100,
    shops: [{ country: 'Mexico', shop: 'Floreria', buyPrice: 10, sellPrice: null }],
  },
];

const stock: CountryStock = {
  code: 'jap',
  updatedAt: at(10),
  items: [
    { itemId: 1, name: 'Ramen', quantity: 5, cost: 950 },
    { itemId: 3, name: 'YATA Only', quantity: 7, cost: 300 },
  ],
};

const quotes: Record<number, MarketQuote> = {
  1: {
    itemId: 1,
    averagePrice: 2500,
    lowestPrice: 2400,
    listingsCount: 10,
    fetchedAt: at(9, 55),
  },
};

function build(overrides: Partial<Parameters<typeof buildItemRows>[0]> = {}) {
  return buildItemRows({
    country: 'jap',
    stock,
    catalog,
    quotes,
    histories: EMPTY_HISTORIES,
    settings: makeSettings(),
    now: at(10),
    ...overrides,
  });
}

describe('buildItemRows', () => {
  it('merges catalog and stock without inventing items', () => {
    const rows = build();
    expect(rows.map((row) => row.itemId).sort()).toEqual([1, 2, 3]);
  });

  it('lets the live stock cost beat the catalog shop price', () => {
    const row = build().find((entry) => entry.itemId === 1);
    expect(row?.buyPrice).toBe(950);
    expect(row?.shop).toBe('Cheap Ramen');
    expect(row?.stock).toBe(5);
    expect(row?.stockUpdatedAt).toBe(at(10));
  });

  it('uses live quotes and applies the item market fee', () => {
    const row = build().find((entry) => entry.itemId === 1);
    expect(row?.quoteSource).toBe('live');
    expect(row?.salePrice).toBe(2500);
    expect(row?.netSalePrice).toBe(2375);
    expect(row?.unitProfit).toBe(1425);
  });

  it('uses the lowest listing when asked', () => {
    const row = build({ settings: makeSettings({ priceBasis: 'lowest' }) }).find(
      (entry) => entry.itemId === 1,
    );
    expect(row?.salePrice).toBe(2400);
    expect(row?.netSalePrice).toBe(2280);
    expect(row?.unitProfit).toBe(1330);
  });

  it('falls back to the catalog market price', () => {
    const row = build({ quotes: {} }).find((entry) => entry.itemId === 2);
    expect(row?.quoteSource).toBe('catalog');
    expect(row?.marketAverage).toBe(1000);
    expect(row?.unitProfit).toBe(450);
    expect(row?.stock).toBeNull();
  });

  it('keeps items that only exist in the stock feed', () => {
    const row = build().find((entry) => entry.itemId === 3);
    expect(row?.name).toBe('YATA Only');
    expect(row?.type).toBe('Unknown');
    expect(row?.group).toBe('other');
    expect(row?.shop).toBe('Unknown shop');
    expect(row?.buyPrice).toBe(300);
    expect(row?.salePrice).toBeNull();
    expect(row?.unitProfit).toBeNull();
  });

  it('drops items with neither a stock entry nor a local shop', () => {
    const row = build().find((entry) => entry.itemId === 4);
    expect(row).toBeUndefined();
  });

  it('honours bazaar fees', () => {
    const row = build({ settings: makeSettings({ channel: 'bazaar' }) }).find(
      (entry) => entry.itemId === 1,
    );
    expect(row?.netSalePrice).toBe(2500);
    expect(row?.unitProfit).toBe(1550);
  });

  it('treats a zero quote as missing', () => {
    const row = build({
      quotes: {
        1: { itemId: 1, averagePrice: 0, lowestPrice: null, listingsCount: 0, fetchedAt: at(10) },
      },
    }).find((entry) => entry.itemId === 1);
    expect(row?.marketAverage).toBe(2000);
    expect(row?.salePrice).toBe(2000);
  });

  it('forecasts from stored observations plus the current stock', () => {
    const histories: Histories = {
      stock: { jap: { 1: [{ at: at(9), quantity: 100 }] } },
      prices: {},
    };
    const row = build({ histories }).find((entry) => entry.itemId === 1);
    expect(row?.forecast.status).toBe('sold-out');
    expect(row?.forecast.expectedStock).toBe(0);
    expect(row?.forecast.samples).toBe(2);
  });

  it('adds the current observation only once', () => {
    const histories: Histories = {
      stock: { jap: { 1: [{ at: at(10), quantity: 5 }] } },
      prices: {},
    };
    const row = build({ histories }).find((entry) => entry.itemId === 1);
    expect(row?.forecast.samples).toBe(1);
  });

  it('predicts the price trend from stored quotes', () => {
    const histories: Histories = {
      stock: {},
      prices: {
        1: [
          { at: at(9), price: 2000 },
          { at: at(9, 30), price: 2100 },
        ],
      },
    };
    const row = build({ histories }).find((entry) => entry.itemId === 1);
    expect(row?.trend.direction).toBe('rising');
    expect(row?.trend.samples).toBe(2);
  });
});
