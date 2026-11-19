import { DatabaseSync } from 'node:sqlite';
import type { CountryCode, StockObservation } from '../src/core/types';
import type { StockChange, StockState } from './stock-diff';
import {
  INSERT_EVENT,
  INSERT_POLL,
  OBSERVATIONS,
  OBSERVATIONS_RANGE,
  SCHEMA,
  UPSERT_STATE,
} from './store-schema';
import { numberValue, parsePoll, parseState } from './store-rows';
import type { ObservationSet, PollInput, StoreHealth } from './store-types';

const DATABASE_TIMEOUT_MS = 5_000;

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
    includePrior = true,
  ): ObservationSet {
    const rows = includePrior
      ? this.#db
          .prepare(OBSERVATIONS)
          .all(
            country,
            from,
            to,
            itemId,
            itemId,
            country,
            from,
            itemId,
            itemId,
            country,
            itemId,
            itemId,
          )
      : this.#db.prepare(OBSERVATIONS_RANGE).all(country, from, to, itemId, itemId);
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
          (SELECT value FROM stats WHERE key = 'event_count') AS events,
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
