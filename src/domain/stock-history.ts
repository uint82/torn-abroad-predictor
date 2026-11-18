import type { StockObservation } from '../core/types';
import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS } from '../core/time';
import { nextRestockTick, RESTOCK_INTERVAL_MS } from './restock-ticks';

export const HISTORY_WINDOW_MS = DAY_MS;
export const MIN_OBSERVATION_GAP_MS = 30 * SECOND_MS;
export const MAX_OBSERVATION_GAP_MS = 6 * HOUR_MS;

const MIN_RESTOCK_SIZE = 1;

interface Interval {
  from: number;
  to: number;
  minutes: number;
  delta: number;
}

export interface SelloutCycle {
  restockedAt: number;
  soldOutAt: number;
  durationMs: number;
}

export function sanitizeStockObservations(
  observations: readonly StockObservation[],
  now: number,
  windowMs = HISTORY_WINDOW_MS,
): StockObservation[] {
  const cutoff = now - windowMs;
  const latestByTimestamp = new Map<number, StockObservation>();
  for (const observation of observations) {
    if (
      !Number.isFinite(observation.at) ||
      !Number.isFinite(observation.quantity) ||
      observation.at < cutoff ||
      observation.at > now + MINUTE_MS ||
      observation.quantity < 0
    ) {
      continue;
    }
    latestByTimestamp.set(observation.at, {
      at: observation.at,
      quantity: Math.floor(observation.quantity),
    });
  }
  return [...latestByTimestamp.values()].sort((a, b) => a.at - b.at);
}

function buildIntervals(observations: readonly StockObservation[]): Interval[] {
  const intervals: Interval[] = [];
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    if (!previous || !current) {
      continue;
    }
    const elapsed = current.at - previous.at;
    if (elapsed < MIN_OBSERVATION_GAP_MS || elapsed > MAX_OBSERVATION_GAP_MS) {
      continue;
    }
    intervals.push({
      from: previous.at,
      to: current.at,
      minutes: elapsed / MINUTE_MS,
      delta: current.quantity - previous.quantity,
    });
  }
  return intervals;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const lower = sorted[middle - 1];
    const upper = sorted[middle];
    if (lower === undefined || upper === undefined) {
      return null;
    }
    return (lower + upper) / 2;
  }
  return sorted[middle] ?? null;
}

export function estimateSellRatePerHour(observations: readonly StockObservation[]): number | null {
  const intervals = buildIntervals(observations).filter((interval) => interval.delta < 0);
  if (intervals.length === 0) {
    return null;
  }
  const minutes = intervals.reduce((total, interval) => total + interval.minutes, 0);
  const units = intervals.reduce((total, interval) => total - interval.delta, 0);
  if (minutes <= 0 || units <= 0) {
    return null;
  }
  return units / (minutes / 60);
}

export function estimateRestockSize(observations: readonly StockObservation[]): number | null {
  const jumps = buildIntervals(observations)
    .filter((interval) => interval.delta > 0)
    .map((interval) => interval.delta);
  const size = median(jumps);
  return size === null ? null : Math.max(MIN_RESTOCK_SIZE, Math.round(size));
}

function inferRestockAt(previous: StockObservation, current: StockObservation): number {
  const tick = Math.floor(current.at / RESTOCK_INTERVAL_MS) * RESTOCK_INTERVAL_MS;
  const estimated = tick > previous.at ? tick : nextRestockTick(previous.at);
  return Math.min(current.at, estimated);
}

function findSoldOutAt(
  observations: readonly StockObservation[],
  restockIndex: number,
): number | null {
  for (let index = restockIndex + 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    if (!previous || !current) {
      continue;
    }
    if (current.at - previous.at > MAX_OBSERVATION_GAP_MS) {
      return null;
    }
    if (current.quantity <= 0) {
      return current.at;
    }
    if (current.quantity > previous.quantity) {
      return null;
    }
  }
  return null;
}

export function buildSelloutCycles(observations: readonly StockObservation[]): SelloutCycle[] {
  const cycles: SelloutCycle[] = [];
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    if (!previous || !current || previous.quantity > 0 || current.quantity <= 0) {
      continue;
    }
    if (current.at - previous.at > MAX_OBSERVATION_GAP_MS) {
      continue;
    }
    const restockedAt = inferRestockAt(previous, current);
    const soldOutAt = findSoldOutAt(observations, index);
    if (soldOutAt === null || soldOutAt <= restockedAt) {
      continue;
    }
    cycles.push({ restockedAt, soldOutAt, durationMs: soldOutAt - restockedAt });
  }
  return cycles;
}
