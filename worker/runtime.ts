import type { HttpClient } from '../src/api/http';
import { handleApiRequest } from '../server/api-core';
import { collectStock } from '../server/collection';
import { COLLECT_CRON, PRUNE_CRON } from './cron';
import type { WorkerEnv } from './env';
import { D1StockStore } from './d1-store';
import { toWorkerResponse } from './response';
import { retentionMs } from './retention';

export interface WorkerRuntimeOptions {
  now?: () => number;
  log?: (message: string) => void;
  http?: HttpClient;
}

export interface WorkerRuntime {
  fetch(request: Request): Promise<Response>;
  scheduled(cron: string): Promise<void>;
}

export function createWorkerRuntime(
  env: WorkerEnv,
  options: WorkerRuntimeOptions = {},
): WorkerRuntime {
  const now = options.now ?? Date.now;
  const log = options.log ?? ((message) => console.warn(message));
  const store = new D1StockStore(env.DB);

  return {
    async fetch(request) {
      const result = await handleApiRequest(
        { method: request.method, url: new URL(request.url) },
        { store, now, log },
      );
      return toWorkerResponse(result, request.headers.get('accept-encoding'));
    },

    async scheduled(cron) {
      if (cron === PRUNE_CRON) {
        await store.prune(now() - retentionMs(env.RETENTION_DAYS));
        return;
      }
      if (cron !== COLLECT_CRON) {
        log(`Ignoring unknown cron schedule: ${cron}`);
        return;
      }
      await collectStock({ store, now, log, http: options.http });
    },
  };
}
