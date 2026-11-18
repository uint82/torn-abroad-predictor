import { describe, expect, it } from 'vitest';
import { ShapeError } from '../src/core/errors';
import {
  extractApiError,
  parseItemMarketResponse,
  parseItemsResponse,
  parseTravelExport,
} from '../src/api/schemas';

describe('extractApiError', () => {
  it('reads the Torn error envelope', () => {
    expect(extractApiError({ error: { code: 2, error: 'Incorrect key' } })).toEqual({
      code: 2,
      message: 'Incorrect key',
    });
  });

  it('ignores payloads without an error object', () => {
    expect(extractApiError({ items: [] })).toBeNull();
    expect(extractApiError(null)).toBeNull();
    expect(extractApiError({ error: 'nope' })).toBeNull();
  });
});

describe('parseItemsResponse', () => {
  it('maps catalog items and shops', () => {
    const items = parseItemsResponse({
      items: [
        {
          id: 1,
          name: 'Ramen',
          type: 'Drug',
          value: {
            market_price: 2000,
            shops: [{ country: 'Japan', shop: 'Ramen Shop', buy_price: 900, sell_price: null }],
          },
        },
      ],
    });
    expect(items).toEqual([
      {
        id: 1,
        name: 'Ramen',
        type: 'Drug',
        marketPrice: 2000,
        shops: [{ country: 'Japan', shop: 'Ramen Shop', buyPrice: 900, sellPrice: null }],
      },
    ]);
  });

  it('defaults missing optional fields', () => {
    const items = parseItemsResponse({
      items: [{ id: 2, name: 'Rock', value: {} }],
    });
    expect(items[0]?.type).toBe('Unknown');
    expect(items[0]?.marketPrice).toBeNull();
    expect(items[0]?.shops).toEqual([]);
  });

  it('rejects a response without items', () => {
    expect(() => parseItemsResponse({})).toThrow(ShapeError);
  });

  it('rejects a malformed shop', () => {
    expect(() =>
      parseItemsResponse({
        items: [
          {
            id: 1,
            name: 'Ramen',
            value: { shops: [{ country: 'Japan', buy_price: 900 }] },
          },
        ],
      }),
    ).toThrow('response.items[0].value.shops[0].shop');
  });
});

describe('parseItemMarketResponse', () => {
  it('takes the average and the cheapest funded listing', () => {
    const quote = parseItemMarketResponse(
      {
        itemmarket: {
          item: { id: 1, name: 'Ramen', average_price: 150, market_value: 150 },
          listings: [
            { price: 120, amount: 0 },
            { price: 110, amount: 2 },
            { price: 130, amount: 1 },
          ],
        },
        _metadata: { total: 3 },
      },
      1,
      123,
    );
    expect(quote).toEqual({
      itemId: 1,
      averagePrice: 150,
      lowestPrice: 110,
      listingsCount: 3,
      fetchedAt: 123,
    });
  });

  it('treats a zero average as missing', () => {
    const quote = parseItemMarketResponse(
      {
        itemmarket: {
          item: { id: 1, average_price: 0 },
          listings: [],
        },
      },
      1,
    );
    expect(quote.averagePrice).toBeNull();
    expect(quote.lowestPrice).toBeNull();
    expect(quote.listingsCount).toBe(0);
  });

  it('rejects a response without itemmarket', () => {
    expect(() => parseItemMarketResponse({}, 1)).toThrow(ShapeError);
  });
});

describe('parseTravelExport', () => {
  it('parses known countries and converts seconds to milliseconds', () => {
    const data = parseTravelExport(
      {
        stocks: {
          mex: {
            update: 1_700_000_000,
            stocks: [{ id: 1, name: 'Ramen', quantity: 5, cost: 100 }],
          },
          jap: {
            update: 1_700_000_000_000,
            stocks: [{ id: 2, name: 'Sushi', quantity: 1, cost: 50 }],
          },
        },
      },
      999,
    );
    expect(data.fetchedAt).toBe(999);
    expect(data.countries.mex?.updatedAt).toBe(1_700_000_000_000);
    expect(data.countries.jap?.updatedAt).toBe(1_700_000_000_000);
    expect(data.countries.mex?.items[0]).toEqual({
      itemId: 1,
      name: 'Ramen',
      quantity: 5,
      cost: 100,
    });
    expect(data.countries.uae).toBeUndefined();
  });

  it('rejects a malformed root', () => {
    expect(() => parseTravelExport({ stocks: [] })).toThrow(ShapeError);
  });

  it('rejects a malformed stock entry', () => {
    expect(() =>
      parseTravelExport({
        stocks: { mex: { update: 1, stocks: [{ id: 1, name: 'Ramen', quantity: 5 }] } },
      }),
    ).toThrow('response.stocks.mex.stocks[0].cost');
  });
});
