import { DAY_MS } from '../src/core/time';

export const DEFAULT_PORT = 8787;
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_DATABASE_PATH = 'data/stock.sqlite';
export const DEFAULT_POLL_INTERVAL_MS = 60_000;
export const DEFAULT_RETENTION_DAYS = 90;
export const MIN_POLL_INTERVAL_MS = 30_000;
export const MAX_POLL_INTERVAL_MS = 15 * 60_000;
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 365;

export interface ServerConfig {
  port: number;
  host: string;
  databasePath: string;
  pollIntervalMs: number;
  retentionMs: number;
}

function integerFromEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: integerFromEnv(env.PORT, DEFAULT_PORT, 1, 65_535),
    host: env.HOST?.trim() || DEFAULT_HOST,
    databasePath: env.DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH,
    pollIntervalMs: integerFromEnv(
      env.POLL_INTERVAL_MS,
      DEFAULT_POLL_INTERVAL_MS,
      MIN_POLL_INTERVAL_MS,
      MAX_POLL_INTERVAL_MS,
    ),
    retentionMs:
      integerFromEnv(
        env.RETENTION_DAYS,
        DEFAULT_RETENTION_DAYS,
        MIN_RETENTION_DAYS,
        MAX_RETENTION_DAYS,
      ) * DAY_MS,
  };
}
