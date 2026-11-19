import { MINUTE_MS } from '../core/time';

export const RESTOCK_INTERVAL_MS = 15 * MINUTE_MS;

export function nextRestockTick(timestamp: number): number {
  return Math.floor(timestamp / RESTOCK_INTERVAL_MS) * RESTOCK_INTERVAL_MS + RESTOCK_INTERVAL_MS;
}

export function restockTickAtOrAfter(timestamp: number): number {
  return Math.ceil(timestamp / RESTOCK_INTERVAL_MS) * RESTOCK_INTERVAL_MS;
}
