import type { CountryCode } from '../src/core/types';
import type { StockChange, StockState } from './stock-diff';
import type { ObservationSet, PollInput, StoreHealth } from './store-types';

export type Awaitable<T> = T | Promise<T>;

export interface StockRepository {
  readStates(): Awaitable<Map<string, StockState>>;
  savePoll(
    poll: PollInput,
    states: readonly StockState[],
    changes: readonly StockChange[],
  ): Awaitable<void>;
  recordFailure(
    collectedAt: number,
    finishedAt: number,
    durationMs: number,
    message: string,
  ): Awaitable<void>;
  readObservations(
    country: CountryCode,
    from: number,
    to: number,
    itemId?: number | null,
    includePrior?: boolean,
  ): Awaitable<ObservationSet>;
  readHealth(now: number): Awaitable<StoreHealth>;
  prune(before: number): Awaitable<void>;
}
