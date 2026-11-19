import type { D1Database } from '@cloudflare/workers-types';

export interface WorkerEnv {
  DB: D1Database;
  RETENTION_DAYS?: string;
}
