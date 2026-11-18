import { describe, expect, it, vi } from 'vitest';
import type { HttpClient, HttpRequestOptions } from '../src/api/http';
import { TornClient } from '../src/api/torn';
import { ApiError, AppError, isAbortError } from '../src/core/errors';

const itemsPayload = {
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
};

const marketPayload = {
  itemmarket: {
    item: { id: 1, name: 'Ramen', average_price: 150, market_value: 150 },
    listings: [{ price: 140, amount: 2 }],
  },
};

function fakeHttp(handler: (url: string, options?: HttpRequestOptions) => Promise<unknown>) {
  const json = vi.fn(handler);
  return { json, client: { json } as unknown as HttpClient };
}

describe('TornClient', () => {
  it('requires a key', () => {
    expect(() => new TornClient('   ')).toThrow(AppError);
  });

  it('fetches and parses the catalog', async () => {
    const { json, client } = fakeHttp(async () => itemsPayload);
    const torn = new TornClient(' secret ', { http: client });

    const items = await torn.getCatalog();
    expect(items[0]?.name).toBe('Ramen');
    expect(json).toHaveBeenCalledTimes(1);
    const url = json.mock.calls[0]?.[0];
    const options = json.mock.calls[0]?.[1] as HttpRequestOptions | undefined;
    expect(url).toContain('/torn/items?comment=TornAbroadPredictor');
    expect(options?.headers?.Authorization).toBe('ApiKey secret');
  });

  it('fetches one item market page', async () => {
    const { json, client } = fakeHttp(async () => marketPayload);
    const torn = new TornClient('secret', { http: client });

    const quote = await torn.getItemMarket(1);
    expect(quote).toMatchObject({ itemId: 1, averagePrice: 150, lowestPrice: 140 });
    expect(json.mock.calls[0]?.[0]).toContain('/market/1/itemmarket?limit=100');
  });

  it('rejects an invalid item id', async () => {
    const { client } = fakeHttp(async () => marketPayload);
    const torn = new TornClient('secret', { http: client });
    await expect(torn.getItemMarket(0)).rejects.toBeInstanceOf(AppError);
  });

  it('deduplicates quotes and records failures', async () => {
    const { json, client } = fakeHttp(async (url) => {
      if (url.includes('/market/1/')) {
        return marketPayload;
      }
      throw new ApiError('Item market unavailable.', 502, false);
    });
    const torn = new TornClient('secret', { http: client });

    const batch = await torn.getQuotes([1, 2, 2, 0, -1, 1.5]);
    expect(Object.keys(batch.quotes)).toEqual(['1']);
    expect(batch.failures).toEqual([{ itemId: 2, message: 'Item market unavailable.' }]);
    expect(json).toHaveBeenCalledTimes(2);
  });

  it('propagates an abort', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    const { client } = fakeHttp(async () => {
      throw abort;
    });
    const torn = new TornClient('secret', { http: client });

    await expect(torn.getQuotes([1])).rejects.toSatisfy((error: unknown) => isAbortError(error));
  });
});
