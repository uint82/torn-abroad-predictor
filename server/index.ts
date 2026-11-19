import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApiHandler } from './api';
import { StockCollector } from './collector';
import { readConfig } from './config';
import { StockStore } from './database';
import { DAY_MS } from '../src/core/time';

const PRUNE_INTERVAL_MS = 60 * 60_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = readConfig();
if (config.databasePath !== ':memory:') {
  mkdirSync(dirname(config.databasePath), { recursive: true });
}

const store = new StockStore(config.databasePath);
const collector = new StockCollector({
  store,
  intervalMs: config.pollIntervalMs,
  log: (message) => console.info(message),
});
const server = createServer(
  createApiHandler({
    store,
    log: (message) => console.warn(message),
  }),
);

const pruneTimer = setInterval(() => {
  store.prune(Date.now() - config.retentionMs);
}, PRUNE_INTERVAL_MS);
pruneTimer.unref();

server.on('error', (error) => {
  console.error('Collector HTTP server failed:', error);
  collector.stop();
  store.close();
  process.exitCode = 1;
});

server.listen(config.port, config.host, () => {
  console.info(`Collector listening on http://${config.host}:${config.port}`);
  console.info(`Retaining ${config.retentionMs / DAY_MS} days of stock history`);
  collector.start();
});

let closing = false;

function shutdown(signal: string): void {
  if (closing) {
    return;
  }
  closing = true;
  console.info(`Received ${signal}, shutting down.`);
  clearInterval(pruneTimer);
  collector.stop();
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => {
    store.close();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
