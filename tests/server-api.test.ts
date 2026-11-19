import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { StockData } from '../src/core/types';
import { createApiHandler } from '../server/api';
import { StockStore } from '../server/database';
import { diffStock } from '../server/stock-diff';
import { at } from './fixtures';

const NOW = at(12);

function stockData(now: number, quantity = 5): StockData {
  return {
    fetchedAt: now,
    countries: {
      jap: {
        code: 'jap',
        updatedAt: now,
        items: [{ itemId: 1, name: 'Ramen', quantity, cost: 900 }],
      },
    },
  };
}

function seed(store: StockStore, now = NOW): void {
  const diff = diffStock(stockData(now), store.readStates(), now);
  store.savePoll(
    {
      collectedAt: now,
      finishedAt: now,
      sourceUpdatedAt: diff.sourceUpdatedAt,
      durationMs: 0,
      itemCount: diff.states.length,
      changeCount: diff.changes.length,
    },
    diff.states,
    diff.changes,
  );
}

interface ApiServer {
  baseUrl: string;
  server: Server;
}

let store: StockStore | null = null;
let api: ApiServer | null = null;

async function startApi(): Promise<ApiServer> {
  store = new StockStore(':memory:');
  const server = createServer(
    createApiHandler({
      store,
      now: () => NOW,
      log: () => undefined,
    }),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  api = { baseUrl: `http://127.0.0.1:${address.port}`, server };
  return api;
}

afterEach(async () => {
  if (api) {
    await new Promise<void>((resolve, reject) => {
      api?.server.close((error) => (error ? reject(error) : resolve()));
    });
    api = null;
  }
  store?.close();
  store = null;
});

describe('collector API', () => {
  it('reports collection health without caching it', async () => {
    const running = await startApi();
    const starting = await fetch(`${running.baseUrl}/api/v1/health`);
    expect(starting.status).toBe(200);
    expect(starting.headers.get('cache-control')).toBe('no-store');
    expect(await starting.json()).toMatchObject({ status: 'starting', eventCount: 0 });

    seed(store as StockStore);
    const healthy = await fetch(`${running.baseUrl}/api/v1/health`);
    expect(await healthy.json()).toMatchObject({ status: 'ok', eventCount: 1 });
    expect(healthy.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns observations for a country and time range', async () => {
    const running = await startApi();
    seed(store as StockStore);

    const response = await fetch(`${running.baseUrl}/api/v1/observations?country=jap&days=1`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('max-age=30');
    expect(await response.json()).toMatchObject({
      country: 'jap',
      from: NOW - 86_400_000,
      to: NOW,
      items: { 1: [{ at: NOW, quantity: 5 }] },
    });
  });

  it('filters observations by item', async () => {
    const running = await startApi();
    seed(store as StockStore);
    const response = await fetch(`${running.baseUrl}/api/v1/observations?country=jap&itemId=1`);
    const body = await response.json();
    expect(Object.keys(body.items)).toEqual(['1']);
  });

  it('rejects invalid query parameters', async () => {
    const running = await startApi();
    const cases = [
      'country=nowhere',
      'country=jap&days=0',
      'country=jap&days=91',
      'country=jap&days=1.5',
      'country=jap&itemId=0',
      'country=jap&itemId=abc',
    ];
    for (const query of cases) {
      const response = await fetch(`${running.baseUrl}/api/v1/observations?${query}`);
      expect(response.status).toBe(400);
    }
  });

  it('handles preflight and unsupported methods', async () => {
    const running = await startApi();
    const preflight = await fetch(`${running.baseUrl}/api/v1/observations`, {
      method: 'OPTIONS',
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');

    const post = await fetch(`${running.baseUrl}/api/v1/observations`, { method: 'POST' });
    expect(post.status).toBe(405);
  });

  it('returns 404 for unknown routes', async () => {
    const running = await startApi();
    const response = await fetch(`${running.baseUrl}/api/v1/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found.' });
  });

  it('gzip compresses large observation payloads', async () => {
    const running = await startApi();
    const data = stockData(NOW);
    if (data.countries.jap) {
      data.countries.jap.items = Array.from({ length: 120 }, (_value, index) => ({
        itemId: index + 1,
        name: `Item ${index + 1}`,
        quantity: index,
        cost: 100,
      }));
    }
    const full = diffStock(data, new Map(), NOW);
    store!.savePoll(
      {
        collectedAt: NOW,
        finishedAt: NOW,
        sourceUpdatedAt: full.sourceUpdatedAt,
        durationMs: 0,
        itemCount: full.states.length,
        changeCount: full.changes.length,
      },
      full.states,
      full.changes,
    );

    const response = await fetch(`${running.baseUrl}/api/v1/observations?country=jap&days=1`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    expect(response.headers.get('content-encoding')).toBe('gzip');
  });
});
