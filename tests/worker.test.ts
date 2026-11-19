import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../src/api/http';
import type { WorkerEnv } from '../worker/env';
import { COLLECT_CRON, PRUNE_CRON } from '../worker/cron';
import { createWorkerRuntime } from '../worker/runtime';
import { toWorkerResponse } from '../worker/response';
import { createFakeD1, type FakeDatabase } from './fake-d1';
import { at } from './fixtures';

function yataPayload(updatedAt: number, quantity: number): unknown {
  return {
    stocks: {
      jap: {
        update: Math.floor(updatedAt / 1000),
        stocks: [{ id: 1, name: 'Ramen', quantity, cost: 900 }],
      },
    },
  };
}

function createHarness(fetchImpl: typeof fetch, now: () => number) {
  const db = createFakeD1();
  const env = { DB: db, RETENTION_DAYS: '90' } as WorkerEnv;
  const runtime = createWorkerRuntime(env, {
    now,
    log: () => undefined,
    http: new HttpClient({ fetchImpl, retries: 0, target: 'yata.test' }),
  });
  return { db, runtime };
}

let db: FakeDatabase | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

describe('Cloudflare worker runtime', () => {
  it('collects on the minute cron and serves the API', async () => {
    let now = at(10);
    const quantities = [5, 0, 30];
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      const quantity = quantities[call] ?? 30;
      call += 1;
      return new Response(JSON.stringify(yataPayload(now, quantity)), { status: 200 });
    });
    const harness = createHarness(fetchImpl as unknown as typeof fetch, () => now);
    db = harness.db;

    await harness.runtime.scheduled(COLLECT_CRON);
    now += 60_000;
    await harness.runtime.scheduled(COLLECT_CRON);

    const healthResponse = await harness.runtime.fetch(
      new Request('https://collector.test/api/v1/health'),
    );
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.headers.get('access-control-allow-origin')).toBe('*');
    expect(await healthResponse.json()).toMatchObject({
      status: 'ok',
      eventCount: 2,
      stateCount: 1,
    });

    const observationsResponse = await harness.runtime.fetch(
      new Request('https://collector.test/api/v1/observations?country=jap&days=1'),
    );
    expect(await observationsResponse.json()).toMatchObject({
      country: 'jap',
      items: {
        1: [
          { at: at(10), quantity: 5 },
          { at: at(10, 1), quantity: 0 },
        ],
      },
    });
  });

  it('serves preflight and unknown routes', async () => {
    const harness = createHarness(vi.fn() as unknown as typeof fetch, () => at(10));
    db = harness.db;

    const preflight = await harness.runtime.fetch(
      new Request('https://collector.test/api/v1/observations', { method: 'OPTIONS' }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');

    const missing = await harness.runtime.fetch(new Request('https://collector.test/api/v1/nope'));
    expect(missing.status).toBe(404);
  });

  it('runs pruning on the daily cron and ignores unknown schedules', async () => {
    let now = at(9);
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify(yataPayload(now, 5)), { status: 200 });
    });
    const harness = createHarness(fetchImpl as unknown as typeof fetch, () => now);
    db = harness.db;

    await harness.runtime.scheduled(COLLECT_CRON);
    now += 101 * 24 * 60 * 60_000;
    await harness.runtime.scheduled(PRUNE_CRON);

    const healthResponse = await harness.runtime.fetch(
      new Request('https://collector.test/api/v1/health'),
    );
    expect(await healthResponse.json()).toMatchObject({
      status: 'starting',
      eventCount: 1,
      stateCount: 0,
    });

    await harness.runtime.scheduled('0 0 1 1 *');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gzip compresses large JSON responses', async () => {
    const body = { items: 'x'.repeat(2_000) };
    const response = await toWorkerResponse(
      { status: 200, body, cacheControl: 'public, max-age=30' },
      'gzip',
    );
    expect(response.headers.get('content-encoding')).toBe('gzip');

    const decompressed = new Blob([await response.arrayBuffer()])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    expect(JSON.parse(await new Response(decompressed).text())).toEqual(body);
  });
});
