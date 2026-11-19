import { DAY_MS } from '../src/core/time';
import {
  DEFAULT_DATABASE_PATH,
  DEFAULT_HOST,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_PORT,
  DEFAULT_RETENTION_DAYS,
  MAX_POLL_INTERVAL_MS,
  MAX_RETENTION_DAYS,
  MIN_POLL_INTERVAL_MS,
  MIN_RETENTION_DAYS,
} from './defaults';
import { integerFromEnv } from './env';

export {
  DEFAULT_DATABASE_PATH,
  DEFAULT_HOST,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_PORT,
  DEFAULT_RETENTION_DAYS,
  MAX_POLL_INTERVAL_MS,
  MAX_RETENTION_DAYS,
  MIN_POLL_INTERVAL_MS,
  MIN_RETENTION_DAYS,
};

export interface ServerConfig {
  port: number;
  host: string;
  databasePath: string;
  pollIntervalMs: number;
  retentionMs: number;
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
