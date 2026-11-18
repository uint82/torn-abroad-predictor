import { nextRestockTick, restockTickAtOrAfter } from './restock-ticks';

export const MIN_SCENARIO_SAMPLES = 2;
const MAX_RESTOCKS_PER_SCENARIO = 96;

export interface ArrivalChanceInput {
  now: number;
  end: number;
  emptyAt: number | null;
  alwaysInStock: boolean;
  lags: readonly number[];
  durations: readonly number[];
}

function usableSamples(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

function restockAfter(readyAt: number, now: number): number {
  const tick = restockTickAtOrAfter(Math.max(readyAt, now));
  return tick <= now ? nextRestockTick(now) : tick;
}

function staysInStock(
  emptyAt: number,
  lagMs: number,
  durationMs: number,
  now: number,
  end: number,
): boolean {
  let empty = emptyAt;
  for (let count = 0; count < MAX_RESTOCKS_PER_SCENARIO; count += 1) {
    const restockedAt = restockAfter(empty + lagMs, now);
    if (restockedAt > end) {
      return false;
    }
    if (restockedAt + durationMs > end) {
      return true;
    }
    empty = restockedAt + durationMs;
  }
  return false;
}

function scoreScenarios(
  emptyAt: number,
  lags: readonly number[],
  durations: readonly number[],
  now: number,
  end: number,
): number {
  let inStock = 0;
  for (const lag of lags) {
    for (const duration of durations) {
      if (staysInStock(emptyAt, lag, duration, now, end)) {
        inStock += 1;
      }
    }
  }
  return inStock / (lags.length * durations.length);
}

export function estimateArrivalStockChance(input: ArrivalChanceInput): number | null {
  const now = input.now;
  const end = Number.isFinite(input.end) ? Math.max(now, input.end) : now;
  if (input.alwaysInStock || (input.emptyAt !== null && input.emptyAt > end)) {
    return 1;
  }
  if (input.emptyAt === null) {
    return null;
  }

  const lags = usableSamples(input.lags);
  const durations = usableSamples(input.durations);
  if (lags.length < MIN_SCENARIO_SAMPLES || durations.length < MIN_SCENARIO_SAMPLES) {
    return null;
  }
  return scoreScenarios(input.emptyAt, lags, durations, now, end);
}
