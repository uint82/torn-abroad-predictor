import type { StockForecast } from '../core/types';
import { formatPercent, formatRelative, formatTctDateTime, formatTctTime } from './format';

function isSameTctDay(a: number, b: number): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getUTCFullYear() === second.getUTCFullYear() &&
    first.getUTCMonth() === second.getUTCMonth() &&
    first.getUTCDate() === second.getUTCDate()
  );
}

export function formatRestockWindow(forecast: StockForecast): string {
  const { nextRestockEarliestAt: earliest, nextRestockLatestAt: latest } = forecast;
  if (earliest === null || latest === null) {
    return 'n/a';
  }
  if (earliest === latest) {
    return formatTctDateTime(earliest);
  }
  if (isSameTctDay(earliest, latest)) {
    return `${formatTctTime(earliest)} to ${formatTctTime(latest)}`;
  }
  return `${formatTctDateTime(earliest)} to ${formatTctDateTime(latest)}`;
}

export function restockTooltip(forecast: StockForecast, now: number): string {
  const timestamp = forecast.nextRestockAt;
  if (timestamp === null) {
    return forecast.restockSamples === 0
      ? 'No restock estimate yet. Timing needs a completed sellout and refill cycle.'
      : 'No restock estimate within the 24-hour lookahead.';
  }
  const parts = [
    `Estimated restock ${formatTctDateTime(timestamp)} (${formatRelative(timestamp, now)})`,
  ];
  if (forecast.nextRestockEarliestAt !== null && forecast.nextRestockLatestAt !== null) {
    parts.push(`Plausible window ${formatRestockWindow(forecast)}`);
  }
  if (forecast.arrivalStockChance !== null) {
    parts.push(
      `${formatPercent(forecast.arrivalStockChance * 100, 0)} chance the item is in stock at arrival`,
    );
  }
  parts.push(
    `${forecast.restockConfidence} restock confidence from ${forecast.restockSamples} measured lags`,
  );
  return `${parts.join('. ')}.`;
}
