import type { Confidence, StockForecast, StockObservation, StockStatus } from '../core/types';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../core/time';
import { estimateArrivalStockChance } from './restock-probability';
import { simulateStock, type StockSimulationResult } from './restock-simulation';
import {
  estimateNextRestock,
  summarizeRestockHistory,
  type NextRestockEstimate,
  type RestockHistory,
} from './restock-timing';
import {
  buildSelloutCycles,
  estimateRestockSize,
  estimateSellRatePerHour,
  REMOTE_HISTORY_WINDOW_MS,
  sanitizeStockObservations,
  type SelloutCycle,
} from './stock-history';

export const STALE_OBSERVATION_MS = 20 * MINUTE_MS;
export const STALE_FORECAST_MS = HOUR_MS;
export const RESTOCK_LOOKAHEAD_MS = DAY_MS;

const SELL_RATE_WINDOW_MS = DAY_MS;
const RESTOCK_SIZE_WINDOW_MS = 7 * DAY_MS;

const HIGH_CONFIDENCE_SAMPLES = 8;
const HIGH_CONFIDENCE_SPAN_MS = 2 * HOUR_MS;
const MEDIUM_CONFIDENCE_SAMPLES = 3;
const MEDIUM_CONFIDENCE_SPAN_MS = 30 * MINUTE_MS;
const MAX_HORIZON_MINUTES = DAY_MS / MINUTE_MS;
const HIGH_RESTOCK_SAMPLES = 5;
const MEDIUM_RESTOCK_SAMPLES = 3;
const HIGH_RESTOCK_WINDOW_MS = 30 * MINUTE_MS;
const MEDIUM_RESTOCK_WINDOW_MS = 90 * MINUTE_MS;

export interface ForecastOptions {
  now: number;
  horizonMinutes: number;
}

interface ForecastState {
  current: StockObservation;
  cycles: readonly SelloutCycle[];
  restockHistory: RestockHistory;
  currentStock: number;
  rate: number | null;
  restockSize: number | null;
  ratePerMinute: number;
  samples: number;
  ageMs: number;
  spanMs: number;
  now: number;
  horizonMinutes: number;
  end: number;
}

interface StockProjection extends StockSimulationResult {
  nextRestockAt: number | null;
}

function clampHorizon(minutes: number): number {
  if (!Number.isFinite(minutes)) {
    return 0;
  }
  return Math.min(MAX_HORIZON_MINUTES, Math.max(0, minutes));
}

function stockAt(timestamp: number, observation: StockObservation, ratePerMinute: number): number {
  const elapsed = Math.max(0, timestamp - observation.at);
  return Math.max(0, observation.quantity - ratePerMinute * (elapsed / MINUTE_MS));
}

function historySince(
  observations: readonly StockObservation[],
  cutoff: number,
): StockObservation[] {
  return observations.filter((observation) => observation.at >= cutoff);
}

function createForecastState(
  history: readonly StockObservation[],
  current: StockObservation,
  options: ForecastOptions,
  horizonMinutes: number,
): ForecastState {
  const rateHistory = historySince(history, options.now - SELL_RATE_WINDOW_MS);
  const restockHistory = historySince(history, options.now - RESTOCK_SIZE_WINDOW_MS);
  const rate = estimateSellRatePerHour(rateHistory);
  const restockSize = estimateRestockSize(restockHistory, true);
  const ratePerMinute = rate === null ? 0 : rate / 60;
  const cycles = buildSelloutCycles(history);
  const first = rateHistory[0] ?? current;
  const end = Math.max(options.now, current.at) + horizonMinutes * MINUTE_MS;
  return {
    current,
    cycles,
    restockHistory: summarizeRestockHistory(cycles),
    currentStock: stockAt(options.now, current, ratePerMinute),
    rate,
    restockSize,
    ratePerMinute,
    samples: rateHistory.length,
    ageMs: Math.max(0, options.now - current.at),
    spanMs: current.at - first.at,
    now: options.now,
    horizonMinutes,
    end,
  };
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

function windowWidth(timing: NextRestockEstimate): number | null {
  if (timing.earliestAt === null || timing.latestAt === null) {
    return null;
  }
  return timing.latestAt - timing.earliestAt;
}

function restockConfidenceFor(timing: NextRestockEstimate, ageMs: number): Confidence {
  const width = windowWidth(timing);
  if (
    timing.at === null ||
    width === null ||
    timing.samples < MEDIUM_RESTOCK_SAMPLES ||
    ageMs > STALE_OBSERVATION_MS
  ) {
    return 'low';
  }
  if (timing.samples >= HIGH_RESTOCK_SAMPLES && width <= HIGH_RESTOCK_WINDOW_MS) {
    return 'high';
  }
  if (width <= MEDIUM_RESTOCK_WINDOW_MS) {
    return 'medium';
  }
  return 'low';
}

function stockConfidenceFor(
  state: ForecastState,
  projection: StockProjection,
  timing: NextRestockEstimate,
): Confidence {
  const confidence = confidenceFor(state.samples, state.spanMs, state.ageMs, state.rate !== null);
  if (projection.restocked && timing.samples < 2 && confidence === 'high') {
    return 'medium';
  }
  return confidence;
}

function statusFor(
  stock: number,
  restocked: boolean,
  restockSize: number | null,
  currentQuantity: number,
): { status: StockStatus; expectedStock: number | null } {
  if (stock > 0) {
    return {
      status: restocked ? 'restock-expected' : 'in-stock',
      expectedStock: Math.floor(stock),
    };
  }
  if (restockSize === null && currentQuantity === 0) {
    return { status: 'unknown', expectedStock: null };
  }
  return { status: 'sold-out', expectedStock: 0 };
}

function emptyForecast(horizonMinutes: number): StockForecast {
  return {
    status: 'unknown',
    expectedStock: null,
    nextRestockAt: null,
    nextRestockEarliestAt: null,
    nextRestockLatestAt: null,
    arrivalStockChance: null,
    confidence: 'low',
    restockConfidence: 'low',
    restockSamples: 0,
    sellRatePerHour: null,
    restockSize: null,
    horizonMinutes,
    samples: 0,
  };
}

function staleForecast(state: ForecastState): StockForecast {
  return {
    ...emptyForecast(state.horizonMinutes),
    sellRatePerHour: state.rate,
    restockSize: state.restockSize,
    samples: state.samples,
  };
}

function nextRestockFor(state: ForecastState): NextRestockEstimate {
  return estimateNextRestock({
    now: state.now,
    currentAt: state.current.at,
    stockAtNow: state.currentStock,
    ratePerMinute: state.ratePerMinute,
    cycles: state.cycles,
    history: state.restockHistory,
    lookaheadMs: RESTOCK_LOOKAHEAD_MS,
  });
}

function projectStock(state: ForecastState, timing: NextRestockEstimate): StockProjection {
  const nextRestockAt = state.restockSize === null ? null : timing.at;
  const simulation = simulateStock({
    current: state.current,
    now: state.now,
    end: state.end,
    stockAtNow: state.currentStock,
    ratePerMinute: state.ratePerMinute,
    cycleDurationMs: state.restockHistory.durations.median,
    delayMs: timing.delayMs,
    restockSize: state.restockSize ?? 0,
    nextRestockAt,
  });
  return { ...simulation, nextRestockAt };
}

function arrivalChanceFor(state: ForecastState, timing: NextRestockEstimate): number | null {
  return estimateArrivalStockChance({
    now: state.now,
    end: state.end,
    emptyAt: timing.emptyAt,
    alwaysInStock: state.currentStock > 0 && state.ratePerMinute <= 0,
    lags: state.restockHistory.gaps.map((gap) => gap.lagMs),
    durations: state.cycles.map((cycle) => cycle.durationMs),
  });
}

function composeForecast(
  state: ForecastState,
  timing: NextRestockEstimate,
  projection: StockProjection,
): StockForecast {
  const { status, expectedStock } = statusFor(
    projection.stock,
    projection.restocked,
    state.restockSize,
    state.current.quantity,
  );
  return {
    status,
    expectedStock,
    nextRestockAt: projection.nextRestockAt,
    nextRestockEarliestAt: projection.nextRestockAt === null ? null : timing.earliestAt,
    nextRestockLatestAt: projection.nextRestockAt === null ? null : timing.latestAt,
    arrivalStockChance: arrivalChanceFor(state, timing),
    confidence: stockConfidenceFor(state, projection, timing),
    restockConfidence: restockConfidenceFor(timing, state.ageMs),
    restockSamples: timing.samples,
    sellRatePerHour: state.rate,
    restockSize: state.restockSize,
    horizonMinutes: state.horizonMinutes,
    samples: state.samples,
  };
}

export function forecastStock(
  observations: readonly StockObservation[],
  options: ForecastOptions,
): StockForecast {
  const horizonMinutes = clampHorizon(options.horizonMinutes);
  const history = sanitizeStockObservations(observations, options.now, REMOTE_HISTORY_WINDOW_MS);
  const current = history[history.length - 1];
  if (!current) {
    return emptyForecast(horizonMinutes);
  }
  const state = createForecastState(history, current, options, horizonMinutes);
  if (state.ageMs > STALE_FORECAST_MS) {
    return staleForecast(state);
  }
  const timing = nextRestockFor(state);
  return composeForecast(state, timing, projectStock(state, timing));
}
