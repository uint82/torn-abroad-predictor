import { DatabaseSync } from 'node:sqlite';
import type { CountryCode, StockObservation } from '../src/core/types';
import { COUNTRY_CODES } from '../src/core/types';
import type { StockChange, StockState } from './stock-diff';

export interface PollInput {
  collectedAt: number;
  finishedAt: number;
  sourceUpdatedAt: number;
  durationMs: number;
  itemCount: number;
  changeCount: number;
}

export interface PollRecord {
  collectedAt: number;
  finishedAt: number;
  sourceUpdatedAt: number;
  durationMs: number;
  itemCount: number;
  changeCount: number;
  status: 'ok' | 'error';
  error: string | null;
}

export interface StoreHealth {
  status: 'starting' | 'ok' | 'degraded';
  dataAgeMs: number | null;
  lastSuccess: PollRecord | null;
  lastPoll: PollRecord | null;
  eventCount: number;
  stateCount: number;
}

const DATABASE_TIMEOUT_MS = 5_000;

export interface ObservationSet {
  country: CountryCode;
  from: number;
  to: number;
  items: Record<number, StockObservation[]>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stock_state (
  country TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  cost REAL NOT NULL,
  source_updated_at INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_event_at INTEGER NOT NULL,
  PRIMARY KEY (country, item_id)
);

CREATE TABLE IF NOT EXISTS stock_events (
  country TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  observed_at INTEGER NOT NULL,
  source_updated_at INTEGER NOT NULL,
  previous_quantity INTEGER,
  quantity INTEGER NOT NULL,
  cost REAL NOT NULL,
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (country, item_id, observed_at)
);

CREATE INDEX IF NOT EXISTS stock_events_country_time
  ON stock_events (country, observed_at);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collected_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  source_updated_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  item_count INTEGER NOT NULL,
  change_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS polls_collected_at ON polls (collected_at);

PRAGMA user_version = 1;
`;

const UPSERT_STATE = `
INSERT INTO stock_state (
  country, item_id, quantity, cost, source_updated_at,
  first_seen_at, last_seen_at, last_event_at
) VALUES (
  ?, ?, ?, ?, ?,
  ?, ?, ?
)
ON CONFLICT(country, item_id) DO UPDATE SET
  quantity = excluded.quantity,
  cost = excluded.cost,
  source_updated_at = excluded.source_updated_at,
  last_seen_at = excluded.last_seen_at,
  last_event_at = excluded.last_event_at
`;

const INSERT_EVENT = `
INSERT OR IGNORE INTO stock_events (
  country, item_id, observed_at, source_updated_at,
  previous_quantity, quantity, cost, delta, kind
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_POLL = `
INSERT INTO polls (
  collected_at, finished_at, source_updated_at,
  duration_ms, item_count, change_count, status, error
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

const OBSERVATIONS = `
WITH selected AS (
  SELECT item_id, observed_at, quantity
  FROM stock_events
  WHERE country = :country
    AND observed_at >= :from
    AND observed_at <= :to
    AND (:itemId IS NULL OR item_id = :itemId)

  UNION ALL

  SELECT event.item_id, event.observed_at, event.quantity
  FROM stock_events AS event
  JOIN (
    SELECT item_id, MAX(observed_at) AS observed_at
    FROM stock_events
    WHERE country = :country
      AND observed_at < :from
      AND (:itemId IS NULL OR item_id = :itemId)
    GROUP BY item_id
  ) AS prior
    ON prior.item_id = event.item_id
   AND prior.observed_at = event.observed_at
  WHERE event.country = :country
)
SELECT item_id, observed_at, quantity
FROM selected
WHERE (:itemId IS NULL OR item_id = :itemId)
ORDER BY item_id, observed_at
`;

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function countryValue(value: unknown): CountryCode | null {
  return typeof value === 'string' && COUNTRY_CODES.includes(value as CountryCode)
    ? (value as CountryCode)
    : null;
}

function parseState(row: Record<string, unknown>): StockState | null {
  const country = countryValue(row.country);
  const itemId = numberValue(row.item_id);
  const quantity = numberValue(row.quantity);
  const cost = numberValue(row.cost);
  const sourceUpdatedAt = numberValue(row.source_updated_at);
  const firstSeenAt = numberValue(row.first_seen_at);
  const lastSeenAt = numberValue(row.last_seen_at);
  const lastEventAt = numberValue(row.last_event_at);
  if (
    country === null ||
    itemId === null ||
    quantity === null ||
    cost === null ||
    sourceUpdatedAt === null ||
    firstSeenAt === null ||
    lastSeenAt === null ||
    lastEventAt === null
  ) {
    return null;
  }
  return {
    country,
    itemId,
    quantity,
    cost,
    sourceUpdatedAt,
    firstSeenAt,
    lastSeenAt,
    lastEventAt,
  };
}

function parsePoll(row: Record<string, unknown>): PollRecord | null {
  const collectedAt = numberValue(row.collected_at);
  const finishedAt = numberValue(row.finished_at);
  const sourceUpdatedAt = numberValue(row.source_updated_at);
  const durationMs = numberValue(row.duration_ms);
  const itemCount = numberValue(row.item_count);
  const changeCount = numberValue(row.change_count);
  const status = stringValue(row.status);
  if (
    collectedAt === null ||
    finishedAt === null ||
    sourceUpdatedAt === null ||
    durationMs === null ||
    itemCount === null ||
    changeCount === null ||
    (status !== 'ok' && status !== 'error')
  ) {
    return null;
  }
  return {
    collectedAt,
    finishedAt,
    sourceUpdatedAt,
    durationMs,
    itemCount,
    changeCount,
    status,
    error: stringValue(row.error),
  };
}

export class StockStore {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path, { timeout: DATABASE_TIMEOUT_MS });
    this.#db.exec('PRAGMA journal_mode = WAL');
    this.#db.exec('PRAGMA synchronous = NORMAL');
    this.#db.exec(SCHEMA);
  }

  close(): void {
    this.#db.close();
  }

  readStates(): Map<string, StockState> {
    const rows = this.#db.prepare('SELECT * FROM stock_state').all();
    const states = new Map<string, StockState>();
    for (const row of rows) {
      const state = parseState(row);
      if (state) {
        states.set(`${state.country}:${state.itemId}`, state);
      }
    }
    return states;
  }

  savePoll(poll: PollInput, states: readonly StockState[], changes: readonly StockChange[]): void {
    this.#withTransaction(() => {
      const upsert = this.#db.prepare(UPSERT_STATE);
      for (const state of states) {
        upsert.run(
          state.country,
          state.itemId,
          state.quantity,
          state.cost,
          state.sourceUpdatedAt,
          state.firstSeenAt,
          state.lastSeenAt,
          state.lastEventAt,
        );
      }

      const insert = this.#db.prepare(INSERT_EVENT);
      for (const change of changes) {
        insert.run(
          change.country,
          change.itemId,
          change.at,
          change.sourceUpdatedAt,
          change.previousQuantity,
          change.quantity,
          change.cost,
          change.delta,
          change.kind,
        );
      }

      this.#db
        .prepare(INSERT_POLL)
        .run(
          poll.collectedAt,
          poll.finishedAt,
          poll.sourceUpdatedAt,
          poll.durationMs,
          poll.itemCount,
          poll.changeCount,
          'ok',
          null,
        );
    });
  }

  recordFailure(
    collectedAt: number,
    finishedAt: number,
    durationMs: number,
    message: string,
  ): void {
    this.#db
      .prepare(INSERT_POLL)
      .run(collectedAt, finishedAt, 0, durationMs, 0, 0, 'error', message);
  }

  readObservations(
    country: CountryCode,
    from: number,
    to: number,
    itemId: number | null = null,
  ): ObservationSet {
    const rows = this.#db.prepare(OBSERVATIONS).all({ country, from, to, itemId });
    const items: Record<number, StockObservation[]> = {};
    for (const row of rows) {
      const id = numberValue(row.item_id);
      const at = numberValue(row.observed_at);
      const quantity = numberValue(row.quantity);
      if (id === null || at === null || quantity === null) {
        continue;
      }
      const observations = items[id] ?? [];
      observations.push({ at, quantity });
      items[id] = observations;
    }
    return { country, from, to, items };
  }

  readHealth(now: number): StoreHealth {
    const lastPollRow = this.#db
      .prepare('SELECT * FROM polls ORDER BY collected_at DESC LIMIT 1')
      .get();
    const lastSuccessRow = this.#db
      .prepare("SELECT * FROM polls WHERE status = 'ok' ORDER BY collected_at DESC LIMIT 1")
      .get();
    const countRow = this.#db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM stock_events) AS events,
          (SELECT COUNT(*) FROM stock_state) AS states`,
      )
      .get();
    const lastPoll = lastPollRow ? parsePoll(lastPollRow) : null;
    const lastSuccess = lastSuccessRow ? parsePoll(lastSuccessRow) : null;
    const eventCount = numberValue(countRow?.events) ?? 0;
    const stateCount = numberValue(countRow?.states) ?? 0;
    const status = lastPoll === null ? 'starting' : lastPoll.status === 'ok' ? 'ok' : 'degraded';
    return {
      status,
      dataAgeMs: lastSuccess === null ? null : Math.max(0, now - lastSuccess.sourceUpdatedAt),
      lastSuccess,
      lastPoll,
      eventCount,
      stateCount,
    };
  }

  prune(before: number): void {
    this.#withTransaction(() => {
      this.#db
        .prepare(
          `DELETE FROM stock_events
           WHERE observed_at < ?
             AND EXISTS (
               SELECT 1 FROM stock_events AS newer
               WHERE newer.country = stock_events.country
                 AND newer.item_id = stock_events.item_id
                 AND newer.observed_at > stock_events.observed_at
             )`,
        )
        .run(before);
      this.#db.prepare('DELETE FROM polls WHERE collected_at < ?').run(before);
      this.#db.prepare('DELETE FROM stock_state WHERE last_seen_at < ?').run(before);
    });
  }

  #withTransaction(run: () => void): void {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      run();
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }
}
