import { errorMessage } from '../src/core/errors';
import { HttpClient } from '../src/api/http';
import { parseTravelExport } from '../src/api/schemas';
import { YATA_TRAVEL_URL } from '../src/api/yata';
import type { StockRepository } from './stock-repository';
import { diffStock } from './stock-diff';

export const COLLECTOR_USER_AGENT = 'torn-abroad-predictor-collector/1.0';

const COLLECTOR_TIMEOUT_MS = 20_000;

export interface CollectOptions {
  store: StockRepository;
  url?: string;
  now?: () => number;
  log?: (message: string) => void;
  http?: HttpClient;
  signal?: AbortSignal;
}

export interface CollectResult {
  ok: boolean;
  itemCount: number;
  changeCount: number;
}

function makeHttpClient(): HttpClient {
  return new HttpClient({
    target: 'yata.yt',
    timeoutMs: COLLECTOR_TIMEOUT_MS,
    headers: { 'User-Agent': COLLECTOR_USER_AGENT },
  });
}

async function recordFailure(
  store: StockRepository,
  collectedAt: number,
  finishedAt: number,
  message: string,
  log: (message: string) => void,
): Promise<void> {
  try {
    await store.recordFailure(collectedAt, finishedAt, finishedAt - collectedAt, message);
  } catch (error) {
    log(`Could not record the failed poll: ${errorMessage(error)}`);
  }
}

export async function collectStock(options: CollectOptions): Promise<CollectResult> {
  const store = options.store;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  const http = options.http ?? makeHttpClient();
  const url = options.url ?? YATA_TRAVEL_URL;
  const collectedAt = now();

  try {
    const payload = await http.json(url, { signal: options.signal });
    const data = parseTravelExport(payload, collectedAt);
    const diff = diffStock(data, await store.readStates(), collectedAt);
    const finishedAt = now();
    await store.savePoll(
      {
        collectedAt,
        finishedAt,
        sourceUpdatedAt: diff.sourceUpdatedAt,
        durationMs: finishedAt - collectedAt,
        itemCount: diff.states.length,
        changeCount: diff.changes.length,
      },
      diff.changedStates,
      diff.changes,
    );
    log(
      `Collected ${diff.states.length} items from ${diff.sourceUpdatedAt} (${diff.changes.length} changes)`,
    );
    return {
      ok: true,
      itemCount: diff.states.length,
      changeCount: diff.changes.length,
    };
  } catch (error) {
    const finishedAt = now();
    const message = errorMessage(error);
    await recordFailure(store, collectedAt, finishedAt, message, log);
    log(`Collection failed: ${message}`);
    return { ok: false, itemCount: 0, changeCount: 0 };
  }
}
