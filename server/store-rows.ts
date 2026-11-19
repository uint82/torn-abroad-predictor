import type { CountryCode } from '../src/core/types';
import { COUNTRY_CODES } from '../src/core/types';
import type { StockState } from './stock-diff';
import type { PollRecord } from './store-types';

export function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function countryValue(value: unknown): CountryCode | null {
  return typeof value === 'string' && COUNTRY_CODES.includes(value as CountryCode)
    ? (value as CountryCode)
    : null;
}

export function parseState(row: Record<string, unknown>): StockState | null {
  const country = countryValue(row.country);
  const itemId = numberValue(row.item_id);
  const quantity = numberValue(row.quantity);
  const cost = numberValue(row.cost);
  const sourceUpdatedAt = numberValue(row.source_updated_at);
  const firstSeenAt = numberValue(row.first_seen_at);
  const lastSeenAt = numberValue(row.last_seen_at);
  const lastEventAt = numberValue(row.last_event_at);
  if (
    country === null ||
    itemId === null ||
    quantity === null ||
    cost === null ||
    sourceUpdatedAt === null ||
    firstSeenAt === null ||
    lastSeenAt === null ||
    lastEventAt === null
  ) {
    return null;
  }
  return {
    country,
    itemId,
    quantity,
    cost,
    sourceUpdatedAt,
    firstSeenAt,
    lastSeenAt,
    lastEventAt,
  };
}

export function parsePoll(row: Record<string, unknown>): PollRecord | null {
  const collectedAt = numberValue(row.collected_at);
  const finishedAt = numberValue(row.finished_at);
  const sourceUpdatedAt = numberValue(row.source_updated_at);
  const durationMs = numberValue(row.duration_ms);
  const itemCount = numberValue(row.item_count);
  const changeCount = numberValue(row.change_count);
  const status = stringValue(row.status);
  if (
    collectedAt === null ||
    finishedAt === null ||
    sourceUpdatedAt === null ||
    durationMs === null ||
    itemCount === null ||
    changeCount === null ||
    (status !== 'ok' && status !== 'error')
  ) {
    return null;
  }
  return {
    collectedAt,
    finishedAt,
    sourceUpdatedAt,
    durationMs,
    itemCount,
    changeCount,
    status,
    error: stringValue(row.error),
  };
}
