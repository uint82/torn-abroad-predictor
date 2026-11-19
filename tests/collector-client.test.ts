import { describe, expect, it, vi } from 'vitest';
import { ShapeError } from '../src/core/errors';
import type { Histories, RemoteStockHistory } from '../src/core/types';
import { CollectorClient } from '../src/api/collector';
import { HttpClient } from '../src/api/http';
import { parseRemoteStockHistory } from '../src/api/schemas';
import {
  MAX_MERGED_STOCK_OBSERVATIONS,
  REMOTE_HISTORY_WINDOW_MS,
} from '../src/domain/stock-history';
import { mergeRemoteStockHistory } from '../src/state/history-sync';
import { at } from './fixtures';

const NOW = at(12);

function remoteHistory(overrides: Partial<RemoteStockHistory> = {}): RemoteStockHistory {
  return {
    country: 'jap',
    from: NOW - 86_400_000,
    to: NOW,
    items: { 1: [{ at: NOW - 3_600_000, quantity: 10 }] },
    ...overrides,
  };
}

describe('parseRemoteStockHistory', () => {
  it('parses and sorts observations', () => {
    const history = parseRemoteStockHistory(
      {
        country: 'jap',
        from: NOW - 86_400_000,
        to: NOW,
        items: {
          1: [
            { at: NOW, quantity: 4 },
            { at: NOW - 60_000, quantity: 8 },
          ],
        },
      },
      'jap',
    );
    expect(history.items[1]).toEqual([
      { at: NOW - 60_000, quantity: 8 },
      { at: NOW, quantity: 4 },
    ]);
  });

  it('rejects a different country', () => {
    expect(() =>
      parseRemoteStockHistory(
        {
          country: 'mex',
          from: NOW - 60_000,
          to: NOW,
          items: {},
        },
        'jap',
      ),
    ).toThrow(ShapeError);
  });

  it('rejects inverted time ranges and malformed points', () => {
    expect(() =>
      parseRemoteStockHistory({ country: 'jap', from: NOW, to: NOW - 1, items: {} }, 'jap'),
    ).toThrow(ShapeError);
    expect(() =>
      parseRemoteStockHistory(
        {
          country: 'jap',
          from: NOW - 60_000,
          to: NOW,
          items: { 1: [{ at: NOW, quantity: -1 }] },
        },
        'jap',
      ),
    ).toThrow(ShapeError);
  });

  it('ignores non-canonical item keys', () => {
    const history = parseRemoteStockHistory(
      {
        country: 'jap',
        from: NOW - 60_000,
        to: NOW,
        items: {
          '01': [{ at: NOW, quantity: 1 }],
          '-1': [{ at: NOW, quantity: 1 }],
          2: [{ at: NOW, quantity: 2 }],
        },
      },
      'jap',
    );
    expect(Object.keys(history.items)).toEqual(['2']);
  });
});

describe('CollectorClient', () => {
  it('requests the selected country and parses the response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            country: 'jap',
            from: NOW - 86_400_000,
            to: NOW,
            items: { 1: [{ at: NOW, quantity: 9 }] },
          }),
          { status: 200 },
        ),
    );
    const client = new CollectorClient(
      'https://collector.test/',
      new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch, retries: 0 }),
    );
    const history = await client.getStockHistory('jap', 30);
    expect(history.items[1]?.[0]?.quantity).toBe(9);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://collector.test/api/v1/observations?country=jap&days=30',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('fails clearly without a base URL', async () => {
    const client = new CollectorClient('');
    await expect(client.getStockHistory('jap', 30)).rejects.toThrow(
      'Collector URL is not configured.',
    );
  });
});

describe('mergeRemoteStockHistory', () => {
  it('merges remote points with local history and preserves prices', () => {
    const histories: Histories = {
      stock: {
        jap: { 1: [{ at: NOW - 60 * 60_000, quantity: 12 }] },
      },
      prices: { 1: [{ at: NOW - 60_000, price: 1_000 }] },
    };
    const merged = mergeRemoteStockHistory(
      histories,
      remoteHistory({
        items: {
          1: [
            { at: NOW - 3 * 60 * 60_000, quantity: 20 },
            { at: NOW - 30 * 60_000, quantity: 6 },
          ],
        },
      }),
      NOW,
    );
    expect(merged.stock.jap?.[1]).toEqual([
      { at: NOW - 3 * 60 * 60_000, quantity: 20 },
      { at: NOW - 60 * 60_000, quantity: 12 },
      { at: NOW - 30 * 60_000, quantity: 6 },
    ]);
    expect(merged.prices).toEqual(histories.prices);
  });

  it('lets the newest source win for the same timestamp', () => {
    const histories: Histories = {
      stock: { jap: { 1: [{ at: NOW, quantity: 4 }] } },
      prices: {},
    };
    const merged = mergeRemoteStockHistory(
      histories,
      remoteHistory({ items: { 1: [{ at: NOW, quantity: 9 }] } }),
      NOW,
    );
    expect(merged.stock.jap?.[1]).toEqual([{ at: NOW, quantity: 9 }]);
  });

  it('drops points older than the remote retention window', () => {
    const merged = mergeRemoteStockHistory(
      { stock: {}, prices: {} },
      remoteHistory({
        items: {
          1: [
            { at: NOW - REMOTE_HISTORY_WINDOW_MS - 1, quantity: 100 },
            { at: NOW - 60_000, quantity: 5 },
          ],
        },
      }),
      NOW,
    );
    expect(merged.stock.jap?.[1]).toEqual([{ at: NOW - 60_000, quantity: 5 }]);
  });

  it('caps observations per item', () => {
    const items = Array.from({ length: MAX_MERGED_STOCK_OBSERVATIONS + 10 }, (_value, index) => ({
      at: NOW - index * 1_000,
      quantity: index,
    }));
    const merged = mergeRemoteStockHistory(
      { stock: {}, prices: {} },
      remoteHistory({ items: { 1: items } }),
      NOW,
    );
    expect(merged.stock.jap?.[1]).toHaveLength(MAX_MERGED_STOCK_OBSERVATIONS);
    expect(merged.stock.jap?.[1]?.[0]?.at).toBe(NOW - 4_095_000);
  });

  it('ignores empty and invalid item entries', () => {
    const merged = mergeRemoteStockHistory(
      { stock: {}, prices: {} },
      remoteHistory({ items: { 0: [], 1: [], 2: [{ at: NOW, quantity: 2 }] } }),
      NOW,
    );
    expect(Object.keys(merged.stock.jap ?? {})).toEqual(['2']);
  });
});
