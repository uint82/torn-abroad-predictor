import { MINUTE_MS } from '../core/time';
import { nextRestockTick, restockTickAtOrAfter } from './restock-ticks';
import type { SelloutCycle } from './stock-history';
import { summarizeDistribution, type DistributionSummary } from './statistics';

const MIN_LAG_SAMPLES = 2;
const RESTOCK_DELAY_RATIO = 1 / 2;

export interface RestockGap {
  soldOutAt: number;
  restockedAt: number;
  lagMs: number;
  cycleDurationMs: number;
}

export interface RestockHistory {
  gaps: RestockGap[];
  lags: DistributionSummary;
  durations: DistributionSummary;
}

export function buildRestockGaps(cycles: readonly SelloutCycle[]): RestockGap[] {
  const gaps: RestockGap[] = [];
  for (let index = 0; index < cycles.length - 1; index += 1) {
    const cycle = cycles[index];
    const next = cycles[index + 1];
    if (!cycle || !next) {
      continue;
    }
    const lagMs = next.restockedAt - cycle.soldOutAt;
    if (!Number.isFinite(lagMs) || lagMs <= 0) {
      continue;
    }
    gaps.push({
      soldOutAt: cycle.soldOutAt,
      restockedAt: next.restockedAt,
      lagMs,
      cycleDurationMs: cycle.durationMs,
    });
  }
  return gaps;
}

export function summarizeRestockHistory(cycles: readonly SelloutCycle[]): RestockHistory {
  const gaps = buildRestockGaps(cycles);
  return {
    gaps,
    lags: summarizeDistribution(gaps.map((gap) => gap.lagMs)),
    durations: summarizeDistribution(cycles.map((cycle) => cycle.durationMs)),
  };
}

function estimateDelayMs(history: RestockHistory): number | null {
  if (history.lags.samples >= MIN_LAG_SAMPLES && history.lags.median !== null) {
    return history.lags.median;
  }
  return history.durations.median === null ? null : history.durations.median * RESTOCK_DELAY_RATIO;
}

function latestSoldOutAt(cycles: readonly SelloutCycle[], stockAtNow: number): number | null {
  if (stockAtNow > 0) {
    return null;
  }
  return cycles[cycles.length - 1]?.soldOutAt ?? null;
}

function projectedEmptyAt(input: NextRestockInput, soldOutAt: number | null): number | null {
  const floor = Math.max(input.now, input.currentAt);
  if (input.stockAtNow > 0) {
    if (input.ratePerMinute <= 0) {
      return null;
    }
    return floor + (input.stockAtNow / input.ratePerMinute) * MINUTE_MS;
  }
  return soldOutAt === null ? null : Math.min(soldOutAt, input.now);
}

function nextTickAfter(readyAt: number, floor: number): number {
  const tick = restockTickAtOrAfter(readyAt);
  return tick <= floor ? nextRestockTick(floor) : tick;
}

function estimateWindow(
  emptyAt: number,
  history: RestockHistory,
  floor: number,
  cap: number,
): { earliestAt: number | null; latestAt: number | null } {
  const { lags } = history;
  if (lags.samples < MIN_LAG_SAMPLES || lags.low === null || lags.high === null) {
    return { earliestAt: null, latestAt: null };
  }
  const earliest = nextTickAfter(emptyAt + lags.low, floor);
  if (earliest > cap) {
    return { earliestAt: null, latestAt: null };
  }
  const latest = Math.min(nextTickAfter(emptyAt + lags.high, floor), cap);
  return { earliestAt: earliest, latestAt: latest };
}

export interface NextRestockInput {
  now: number;
  currentAt: number;
  stockAtNow: number;
  ratePerMinute: number;
  cycles: readonly SelloutCycle[];
  history: RestockHistory;
  lookaheadMs: number;
}

export interface NextRestockEstimate {
  at: number | null;
  earliestAt: number | null;
  latestAt: number | null;
  samples: number;
  delayMs: number | null;
  emptyAt: number | null;
}

export function estimateNextRestock(input: NextRestockInput): NextRestockEstimate {
  const soldOutAt = latestSoldOutAt(input.cycles, input.stockAtNow);
  const delayMs = estimateDelayMs(input.history);
  const emptyAt = projectedEmptyAt(input, soldOutAt);
  const base = {
    at: null,
    earliestAt: null,
    latestAt: null,
    samples: input.history.lags.samples,
    delayMs,
    emptyAt,
  };
  if (emptyAt === null || delayMs === null) {
    return base;
  }

  const floor = Math.max(input.now, input.currentAt);
  const at = nextTickAfter(emptyAt + delayMs, floor);
  const cap = input.now + input.lookaheadMs;
  if (at > cap) {
    return base;
  }
  const window = estimateWindow(emptyAt, input.history, floor, cap);
  return {
    ...base,
    at,
    earliestAt: window.earliestAt,
    latestAt: window.latestAt,
  };
}
