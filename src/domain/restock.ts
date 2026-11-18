import type { Confidence, StockForecast, StockObservation, StockStatus } from '../core/types';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../core/time';
import {
  buildSelloutCycles,
  estimateRestockSize,
  estimateSellRatePerHour,
  median,
  sanitizeStockObservations,
  type SelloutCycle,
} from './stock-history';
import { nextRestockTick, RESTOCK_INTERVAL_MS, restockTickAtOrAfter } from './restock-ticks';

export const STALE_OBSERVATION_MS = 20 * MINUTE_MS;
export const STALE_FORECAST_MS = HOUR_MS;
export const RESTOCK_LOOKAHEAD_MS = DAY_MS;

const HIGH_CONFIDENCE_SAMPLES = 8;
const HIGH_CONFIDENCE_SPAN_MS = 2 * HOUR_MS;
const MEDIUM_CONFIDENCE_SAMPLES = 3;
const MEDIUM_CONFIDENCE_SPAN_MS = 30 * MINUTE_MS;
const MAX_HORIZON_MINUTES = DAY_MS / MINUTE_MS;
const RESTOCK_DELAY_RATIO = 1 / 2;

export interface ForecastOptions {
  now: number;
  horizonMinutes: number;
}

interface RestockTiming {
  current: StockObservation;
  cycles: readonly SelloutCycle[];
  cycleDurationMs: number | null;
  stockAtNow: number;
  ratePerMinute: number;
  now: number;
}

interface StockSimulation {
  current: StockObservation;
  now: number;
  end: number;
  stockAtNow: number;
  ratePerMinute: number;
  cycleDurationMs: number | null;
  restockSize: number;
  nextRestockAt: number | null;
}

function confidenceFor(
  samples: number,
  spanMs: number,
  ageMs: number,
  rateKnown: boolean,
): Confidence {
  if (!rateKnown || ageMs > STALE_OBSERVATION_MS) {
    return 'low';
  }
  if (samples >= HIGH_CONFIDENCE_SAMPLES && spanMs >= HIGH_CONFIDENCE_SPAN_MS) {
    return 'high';
  }
  if (samples >= MEDIUM_CONFIDENCE_SAMPLES && spanMs >= MEDIUM_CONFIDENCE_SPAN_MS) {
    return 'medium';
  }
  return 'low';
}

function stockAt(timestamp: number, observation: StockObservation, ratePerMinute: number): number {
  const elapsed = Math.max(0, timestamp - observation.at);
  return Math.max(0, observation.quantity - ratePerMinute * (elapsed / MINUTE_MS));
}

function findNextRestockAt(options: RestockTiming): number | null {
  const { current, cycles, cycleDurationMs, stockAtNow, ratePerMinute, now } = options;
  if (cycleDurationMs === null) {
    return null;
  }
  const earliest = Math.max(now, current.at);
  let readyAt: number;
  if (stockAtNow > 0) {
    if (ratePerMinute <= 0) {
      return null;
    }
    readyAt =
      earliest + (stockAtNow / ratePerMinute) * MINUTE_MS + cycleDurationMs * RESTOCK_DELAY_RATIO;
  } else {
    const cycle = cycles[cycles.length - 1];
    if (!cycle) {
      return null;
    }
    readyAt = cycle.soldOutAt + cycleDurationMs * RESTOCK_DELAY_RATIO;
  }

  let next = restockTickAtOrAfter(readyAt);
  if (next <= earliest) {
    next = nextRestockTick(earliest);
  }
  return next > now + RESTOCK_LOOKAHEAD_MS ? null : next;
}

function nextCycleRestockAt(restockAt: number, cycleDurationMs: number): number {
  const readyAt = restockAt + cycleDurationMs * (1 + RESTOCK_DELAY_RATIO);
  const next = restockTickAtOrAfter(readyAt);
  return next > restockAt ? next : next + RESTOCK_INTERVAL_MS;
}

function simulateStock(options: StockSimulation): { stock: number; restocked: boolean } {
  const { current, now, end, stockAtNow, ratePerMinute, cycleDurationMs, restockSize } = options;
  let stock = stockAtNow;
  let cursor = Math.max(now, current.at);
  let restocked = false;
  let next = options.nextRestockAt;

  while (next !== null && next <= end) {
    stock = Math.max(0, stock - ratePerMinute * ((next - cursor) / MINUTE_MS));
    stock += restockSize;
    restocked = true;
    cursor = next;
    if (cycleDurationMs === null || ratePerMinute <= 0) {
      break;
    }
    next = nextCycleRestockAt(next, cycleDurationMs);
  }
  stock = Math.max(0, stock - ratePerMinute * ((end - cursor) / MINUTE_MS));
  return { stock, restocked };
}

function emptyForecast(horizonMinutes: number): StockForecast {
  return {
    status: 'unknown',
    expectedStock: null,
    nextRestockAt: null,
    confidence: 'low',
    sellRatePerHour: null,
    restockSize: null,
    horizonMinutes,
    samples: 0,
  };
}

export function forecastStock(
  observations: readonly StockObservation[],
  options: ForecastOptions,
): StockForecast {
  const now = options.now;
  const horizonMinutes = Number.isFinite(options.horizonMinutes)
    ? Math.min(MAX_HORIZON_MINUTES, Math.max(0, options.horizonMinutes))
    : 0;
  const history = sanitizeStockObservations(observations, now);
  const current = history[history.length - 1];
  if (!current) {
    return emptyForecast(horizonMinutes);
  }

  const samples = history.length;
  const first = history[0] ?? current;
  const ageMs = Math.max(0, now - current.at);
  const rate = estimateSellRatePerHour(history);
  const restockSize = estimateRestockSize(history);
  const ratePerMinute = rate === null ? 0 : rate / 60;
  const cycles = buildSelloutCycles(history);
  const cycleDurationMs = median(cycles.map((cycle) => cycle.durationMs));
  const currentStock = stockAt(now, current, ratePerMinute);

  if (ageMs > STALE_FORECAST_MS) {
    return {
      status: 'unknown',
      expectedStock: null,
      nextRestockAt: null,
      confidence: 'low',
      sellRatePerHour: rate,
      restockSize,
      horizonMinutes,
      samples,
    };
  }

  const nextRestockAt =
    restockSize === null
      ? null
      : findNextRestockAt({
          current,
          cycles,
          cycleDurationMs,
          stockAtNow: currentStock,
          ratePerMinute,
          now,
        });
  const end = Math.max(now, current.at) + horizonMinutes * MINUTE_MS;
  const simulation: StockSimulation = {
    current,
    cycleDurationMs,
    stockAtNow: currentStock,
    ratePerMinute,
    now,
    end,
    restockSize: restockSize ?? 0,
    nextRestockAt,
  };
  const { stock, restocked } = simulateStock(simulation);

  let status: StockStatus;
  let expectedStock: number | null = Math.max(0, Math.floor(stock));
  if (stock > 0) {
    status = restocked ? 'restock-expected' : 'in-stock';
  } else if (restockSize === null && current.quantity === 0) {
    status = 'unknown';
    expectedStock = null;
  } else {
    status = 'sold-out';
  }

  let confidence = confidenceFor(samples, current.at - first.at, ageMs, rate !== null);
  if (restocked && cycles.length < 2 && confidence === 'high') {
    confidence = 'medium';
  }

  return {
    status,
    expectedStock,
    nextRestockAt,
    confidence,
    sellRatePerHour: rate,
    restockSize,
    horizonMinutes,
    samples,
  };
}
