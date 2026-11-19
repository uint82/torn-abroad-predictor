import type { PriceObservation, PriceTrend } from '../core/types';
import { DAY_MS, MINUTE_MS } from '../core/time';

export const DEFAULT_TREND_WINDOW_MINUTES = 360;
export const TREND_THRESHOLD_PERCENT = 2;

const HISTORY_WINDOW_MINUTES = DAY_MS / MINUTE_MS;

export function sanitizePriceObservations(
  observations: readonly PriceObservation[],
  now: number,
  windowMinutes = HISTORY_WINDOW_MINUTES,
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
