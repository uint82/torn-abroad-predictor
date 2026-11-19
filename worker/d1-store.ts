import type { D1Database } from '@cloudflare/workers-types';
import type { CountryCode, StockObservation } from '../src/core/types';
import { numberValue, parsePoll, parseState } from '../server/store-rows';
import type { StockChange, StockState } from '../server/stock-diff';
import {
  INSERT_EVENT,
  INSERT_POLL,
  OBSERVATIONS,
  OBSERVATIONS_RANGE,
  UPSERT_STATE,
} from '../server/store-schema';
import type { ObservationSet, PollInput, StoreHealth } from '../server/store-types';

type Row = Record<string, unknown>;

export class D1StockStore {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async readStates(): Promise<Map<string, StockState>> {
    const result = await this.#db.prepare('SELECT * FROM stock_state').all<Row>();
    const states = new Map<string, StockState>();
    for (const row of result.results) {
      const state = parseState(row);
      if (state) {
        states.set(`${state.country}:${state.itemId}`, state);
      }
    }
    return states;
  }

  async savePoll(
    poll: PollInput,
    states: readonly StockState[],
    changes: readonly StockChange[],
  ): Promise<void> {
    const statements = states.map((state) =>
      this.#db
        .prepare(UPSERT_STATE)
        .bind(
          state.country,
          state.itemId,
          state.quantity,
          state.cost,
          state.sourceUpdatedAt,
          state.firstSeenAt,
          state.lastSeenAt,
          state.lastEventAt,
        ),
    );
    for (const change of changes) {
      statements.push(
        this.#db
          .prepare(INSERT_EVENT)
          .bind(
            change.country,
            change.itemId,
            change.at,
            change.sourceUpdatedAt,
            change.previousQuantity,
            change.quantity,
            change.cost,
            change.delta,
            change.kind,
          ),
      );
    }
    statements.push(
      this.#db
        .prepare(INSERT_POLL)
        .bind(
          poll.collectedAt,
          poll.finishedAt,
          poll.sourceUpdatedAt,
          poll.durationMs,
          poll.itemCount,
          poll.changeCount,
          'ok',
          null,
        ),
    );
    await this.#db.batch(statements);
  }

  async recordFailure(
    collectedAt: number,
    finishedAt: number,
    durationMs: number,
    message: string,
  ): Promise<void> {
    await this.#db
      .prepare(INSERT_POLL)
      .bind(collectedAt, finishedAt, 0, durationMs, 0, 0, 'error', message)
      .run();
  }

  async readObservations(
    country: CountryCode,
    from: number,
    to: number,
    itemId: number | null = null,
    includePrior = true,
  ): Promise<ObservationSet> {
    const statement = this.#db.prepare(includePrior ? OBSERVATIONS : OBSERVATIONS_RANGE);
    const result = includePrior
      ? await statement
          .bind(
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
          .all<Row>()
      : await statement.bind(country, from, to, itemId, itemId).all<Row>();
    const items: Record<number, StockObservation[]> = {};
    for (const row of result.results) {
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

  async readHealth(now: number): Promise<StoreHealth> {
    const lastPollRow = await this.#db
      .prepare('SELECT * FROM polls ORDER BY collected_at DESC LIMIT 1')
      .first<Row>();
    const lastSuccessRow = await this.#db
      .prepare("SELECT * FROM polls WHERE status = 'ok' ORDER BY collected_at DESC LIMIT 1")
      .first<Row>();
    const countRow = await this.#db
      .prepare(
        `SELECT
          (SELECT value FROM stats WHERE key = 'event_count') AS events,
          (SELECT COUNT(*) FROM stock_state) AS states`,
      )
      .first<Row>();
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

  async prune(before: number): Promise<void> {
    await this.#db.batch([
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
        .bind(before),
      this.#db.prepare('DELETE FROM polls WHERE collected_at < ?').bind(before),
      this.#db.prepare('DELETE FROM stock_state WHERE last_seen_at < ?').bind(before),
    ]);
  }
}
