import { DAY_MS } from '../src/core/time';
import { DEFAULT_RETENTION_DAYS, MAX_RETENTION_DAYS, MIN_RETENTION_DAYS } from '../server/defaults';
import { integerFromEnv } from '../server/env';

export function retentionMs(value: string | undefined): number {
  return (
    integerFromEnv(value, DEFAULT_RETENTION_DAYS, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS) * DAY_MS
  );
}
