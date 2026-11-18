import type { StockObservation } from '../core/types';
import { MINUTE_MS } from '../core/time';
import { nextRestockTick, restockTickAtOrAfter } from './restock-ticks';

export interface StockSimulationInput {
  current: StockObservation;
  now: number;
  end: number;
  stockAtNow: number;
  ratePerMinute: number;
  cycleDurationMs: number | null;
  delayMs: number | null;
  restockSize: number;
  nextRestockAt: number | null;
}

export interface StockSimulationResult {
  stock: number;
  restocked: boolean;
}

function nextCycleRestockAt(restockAt: number, cycleDurationMs: number, delayMs: number): number {
  const readyAt = restockAt + cycleDurationMs + delayMs;
  const next = restockTickAtOrAfter(readyAt);
  return next > restockAt ? next : nextRestockTick(restockAt);
}

export function simulateStock(input: StockSimulationInput): StockSimulationResult {
  const { current, now, end, stockAtNow, ratePerMinute, cycleDurationMs, delayMs, restockSize } =
    input;
  let stock = stockAtNow;
  let cursor = Math.max(now, current.at);
  let restocked = false;
  let next = input.nextRestockAt;

  while (next !== null && next <= end) {
    stock = Math.max(0, stock - ratePerMinute * ((next - cursor) / MINUTE_MS));
    stock += restockSize;
    restocked = true;
    cursor = next;
    if (cycleDurationMs === null || delayMs === null || ratePerMinute <= 0) {
      break;
    }
    next = nextCycleRestockAt(next, cycleDurationMs, delayMs);
  }
  stock = Math.max(0, stock - ratePerMinute * ((end - cursor) / MINUTE_MS));
  return { stock, restocked };
}
