import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTERS, DEFAULT_SETTINGS } from '../src/core/types';
import type { HistoryClient, StockHistoryRequest } from '../src/state/clients';
import { createInitialState } from '../src/state/app-state';
import { REMOTE_HISTORY_OVERLAP_MS, RemoteHistoryService } from '../src/state/remote-history';
import { Store } from '../src/state/store';
import { at } from './fixtures';

const NOW = at(12);
const TTL_MS = 60_000;

function makeHistoryClient(
  now: () => number,
  requests: StockHistoryRequest[],
  fail = false,
): HistoryClient {
  return {
    getStockHistory: async (request) => {
      requests.push(request);
      if (fail) {
        throw new Error('collector offline');
      }
      return {
        country: request.country,
        from: request.since ?? now() - 30 * 24 * 60 * 60_000,
        to: now(),
        items: { 1: [{ at: now(), quantity: 5 }] },
      };
    },
  };
}

function makeService(client: HistoryClient, now: () => number) {
  const store = new Store(
    createInitialState({
      settings: DEFAULT_SETTINGS,
      filters: DEFAULT_FILTERS,
      apiKey: '',
      catalog: null,
      stock: null,
      histories: { stock: {}, prices: {} },
      country: 'jap',
    }),
  );
  const service = new RemoteHistoryService({
    store,
    client,
    ttlMs: TTL_MS,
    now,
  });
  return { store, service };
}

describe('RemoteHistoryService', () => {
  it('requests a full window first and only the missing tail afterwards', async () => {
    let now = NOW;
    const requests: StockHistoryRequest[] = [];
    const { store, service } = makeService(
      makeHistoryClient(() => now, requests),
      () => now,
    );

    await service.refresh(false);
    expect(requests[0]).toEqual({ country: 'jap', days: 30, since: undefined });
    expect(store.get().remoteHistories.stock.jap?.[1]).toHaveLength(1);

    now += TTL_MS;
    await service.refresh(false);
    expect(requests[1]).toEqual({
      country: 'jap',
      days: 30,
      since: NOW - REMOTE_HISTORY_OVERLAP_MS,
    });
  });

  it('does not advance the sync point after a failed request', async () => {
    let now = NOW;
    const requests: StockHistoryRequest[] = [];
    let shouldFail = false;
    const client: HistoryClient = {
      getStockHistory: async (request) => {
        requests.push(request);
        if (shouldFail) {
          throw new Error('collector offline');
        }
        return {
          country: request.country,
          from: request.since ?? NOW - 30 * 24 * 60 * 60_000,
          to: NOW,
          items: {},
        };
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { service } = makeService(client, () => now);

    await service.refresh(false);
    shouldFail = true;
    now += TTL_MS;
    await service.refresh(false);
    shouldFail = false;
    now += TTL_MS;
    await service.refresh(false);

    expect(requests[2]?.since).toBe(NOW - REMOTE_HISTORY_OVERLAP_MS);
    warn.mockRestore();
  });
});
