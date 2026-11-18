import type {
  Confidence,
  PriceObservation,
  PriceTrend,
  StockForecast,
  StockObservation,
  StockStatus,
} from '../core/types';

export const MINUTE_MS = 60_000;
export const RESTOCK_INTERVAL_MS = 15 * MINUTE_MS;
export const HISTORY_WINDOW_MS = 24 * 60 * MINUTE_MS;
export const MIN_OBSERVATION_GAP_MS = 30_000;
export const MAX_OBSERVATION_GAP_MS = 6 * 60 * MINUTE_MS;
export const STALE_OBSERVATION_MS = 20 * MINUTE_MS;
export const STALE_FORECAST_MS = 60 * MINUTE_MS;
export const DEFAULT_TREND_WINDOW_MINUTES = 360;
export const TREND_THRESHOLD_PERCENT = 2;

interface Interval {
  from: number;
  to: number;
  minutes: number;
  delta: number;
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
    .map((interval) => interval.delta)
    .sort((a, b) => a - b);
  if (jumps.length === 0) {
    return null;
  }
  const middle = Math.floor(jumps.length / 2);
  const median =
    jumps.length % 2 === 0
      ? ((jumps[middle - 1] ?? 0) + (jumps[middle] ?? 0)) / 2
      : (jumps[middle] ?? 0);
  return Math.max(1, Math.round(median));
}

export function nextRestockTick(timestamp: number): number {
  return Math.floor(timestamp / RESTOCK_INTERVAL_MS) * RESTOCK_INTERVAL_MS + RESTOCK_INTERVAL_MS;
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
  if (samples >= 8 && spanMs >= 2 * 60 * MINUTE_MS) {
    return 'high';
  }
  if (samples >= 3 && spanMs >= 30 * MINUTE_MS) {
    return 'medium';
  }
  return 'low';
}

export interface ForecastOptions {
  now: number;
  horizonMinutes: number;
}

export function forecastStock(
  observations: readonly StockObservation[],
  options: ForecastOptions,
): StockForecast {
  const now = options.now;
  const horizonMinutes = Number.isFinite(options.horizonMinutes)
    ? Math.min(24 * 60, Math.max(0, options.horizonMinutes))
    : 0;
  const history = sanitizeStockObservations(observations, now);
  const samples = history.length;
  const current = history[history.length - 1];

  if (!current) {
    return {
      status: 'unknown',
      expectedStock: null,
      confidence: 'low',
      sellRatePerHour: null,
      restockSize: null,
      horizonMinutes,
      samples: 0,
    };
  }

  const first = history[0] ?? current;
  const ageMs = Math.max(0, now - current.at);
  const intervals = buildIntervals(history);
  const restockSamples = intervals.filter((interval) => interval.delta > 0).length;
  const rate = estimateSellRatePerHour(history);
  const restock = estimateRestockSize(history);
  const ratePerMinute = rate === null ? 0 : rate / 60;
  const staleForForecast = ageMs > STALE_FORECAST_MS;

  if (staleForForecast) {
    return {
      status: 'unknown',
      expectedStock: null,
      confidence: 'low',
      sellRatePerHour: rate,
      restockSize: restock,
      horizonMinutes,
      samples,
    };
  }

  const end = Math.max(now, current.at) + horizonMinutes * MINUTE_MS;
  let stock = current.quantity;
  let cursor = Math.max(now, current.at);
  let restocked = false;
  let tick = nextRestockTick(cursor);

  while (tick <= end) {
    stock = Math.max(0, stock - ratePerMinute * ((tick - cursor) / MINUTE_MS));
    if (stock <= 0 && restock !== null) {
      stock = restock;
      restocked = true;
    }
    cursor = tick;
    tick += RESTOCK_INTERVAL_MS;
  }
  stock = Math.max(0, stock - ratePerMinute * ((end - cursor) / MINUTE_MS));

  let status: StockStatus;
  let expectedStock: number | null = Math.max(0, Math.floor(stock));
  if (stock > 0) {
    status = restocked ? 'restock-expected' : 'in-stock';
  } else if (restock === null && current.quantity === 0) {
    status = 'unknown';
    expectedStock = null;
  } else {
    status = 'sold-out';
  }

  let confidence = confidenceFor(samples, current.at - first.at, ageMs, rate !== null);
  if (restocked && restockSamples < 2 && confidence === 'high') {
    confidence = 'medium';
  }

  return {
    status,
    expectedStock,
    confidence,
    sellRatePerHour: rate,
    restockSize: restock,
    horizonMinutes,
    samples,
  };
}

export function sanitizePriceObservations(
  observations: readonly PriceObservation[],
  now: number,
  windowMinutes = HISTORY_WINDOW_MS / MINUTE_MS,
): PriceObservation[] {
  const cutoff = now - windowMinutes * MINUTE_MS;
  const latestByTimestamp = new Map<number, PriceObservation>();
  for (const observation of observations) {
    if (
      !Number.isFinite(observation.at) ||
      !Number.isFinite(observation.price) ||
      observation.at < cutoff ||
      observation.at > now + MINUTE_MS ||
      observation.price <= 0
    ) {
      continue;
    }
    latestByTimestamp.set(observation.at, {
      at: observation.at,
      price: observation.price,
    });
  }
  return [...latestByTimestamp.values()].sort((a, b) => a.at - b.at);
}

export interface TrendOptions {
  now: number;
  windowMinutes?: number;
}

export function predictPriceTrend(
  observations: readonly PriceObservation[],
  options: TrendOptions,
): PriceTrend {
  const windowMinutes = options.windowMinutes ?? DEFAULT_TREND_WINDOW_MINUTES;
  const history = sanitizePriceObservations(observations, options.now, windowMinutes);
  if (history.length < 2) {
    return {
      direction: 'unknown',
      changePercent: null,
      volatilityPercent: null,
      samples: history.length,
    };
  }

  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last || first.price <= 0) {
    return {
      direction: 'unknown',
      changePercent: null,
      volatilityPercent: null,
      samples: history.length,
    };
  }

  const changePercent = ((last.price - first.price) / first.price) * 100;
  const mean = history.reduce((total, point) => total + point.price, 0) / history.length;
  const variance =
    history.reduce((total, point) => total + (point.price - mean) ** 2, 0) / history.length;
  const volatilityPercent = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : null;

  let direction: PriceTrend['direction'] = 'stable';
  if (changePercent > TREND_THRESHOLD_PERCENT) {
    direction = 'rising';
  } else if (changePercent < -TREND_THRESHOLD_PERCENT) {
    direction = 'falling';
  }

  return {
    direction,
    changePercent,
    volatilityPercent,
    samples: history.length,
  };
}
