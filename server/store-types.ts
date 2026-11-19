import type { CountryCode, StockObservation } from '../src/core/types';

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

export interface ObservationSet {
  country: CountryCode;
  from: number;
  to: number;
  items: Record<number, StockObservation[]>;
}
