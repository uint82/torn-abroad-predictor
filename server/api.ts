import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import type { CountryCode } from '../src/core/types';
import { COUNTRY_CODES } from '../src/core/types';
import { DAY_MS } from '../src/core/time';
import type { StockStore } from './database';

export const DEFAULT_OBSERVATION_DAYS = 30;
export const MAX_OBSERVATION_DAYS = 90;
export const OBSERVATION_CACHE_SECONDS = 30;
export const GZIP_MIN_BYTES = 1_024;

export interface ApiOptions {
  store: StockStore;
  now?: () => number;
  log?: (message: string) => void;
}

function isCountry(value: string | null): value is CountryCode {
  return value !== null && COUNTRY_CODES.includes(value as CountryCode);
}

function boundedInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (value === null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function setCommonHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  payload: unknown,
  cacheControl: string,
): void {
  const body = Buffer.from(JSON.stringify(payload));
  const acceptsGzip = req.headers['accept-encoding']?.includes('gzip') ?? false;
  const compressed = acceptsGzip && body.byteLength >= GZIP_MIN_BYTES;
  const output = compressed ? gzipSync(body) : body;

  setCommonHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Vary', 'Accept-Encoding');
  if (compressed) {
    res.setHeader('Content-Encoding', 'gzip');
  }
  res.setHeader('Content-Length', String(output.byteLength));
  res.end(output);
}

function sendError(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  message: string,
): void {
  sendJson(req, res, status, { error: message }, 'no-store');
}

function handleObservations(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  store: StockStore,
  now: number,
): void {
  const country = url.searchParams.get('country');
  if (!isCountry(country)) {
    sendError(req, res, 400, 'Unknown or missing country.');
    return;
  }
  const days = boundedInteger(
    url.searchParams.get('days'),
    DEFAULT_OBSERVATION_DAYS,
    1,
    MAX_OBSERVATION_DAYS,
  );
  if (days === null) {
    sendError(req, res, 400, `days must be an integer from 1 to ${MAX_OBSERVATION_DAYS}.`);
    return;
  }
  const itemValue = url.searchParams.get('itemId');
  const itemId = itemValue === null ? null : Number(itemValue);
  if (itemId !== null && (!Number.isInteger(itemId) || itemId <= 0)) {
    sendError(req, res, 400, 'itemId must be a positive integer.');
    return;
  }

  const from = now - days * DAY_MS;
  const observations = store.readObservations(country, from, now, itemId);
  sendJson(
    req,
    res,
    200,
    observations,
    `public, max-age=${OBSERVATION_CACHE_SECONDS}, stale-while-revalidate=${OBSERVATION_CACHE_SECONDS}`,
  );
}

export function createApiHandler(
  options: ApiOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);

  return (req, res) => {
    if (req.method === 'OPTIONS') {
      setCommonHeaders(res);
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'GET') {
      sendError(req, res, 405, 'Method not allowed.');
      return;
    }

    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      sendError(req, res, 400, 'Invalid request URL.');
      return;
    }

    try {
      if (url.pathname === '/api/v1/health') {
        sendJson(req, res, 200, options.store.readHealth(now()), 'no-store');
        return;
      }
      if (url.pathname === '/api/v1/observations') {
        handleObservations(req, res, url, options.store, now());
        return;
      }
      sendError(req, res, 404, 'Not found.');
    } catch (error) {
      log(`API request failed: ${error instanceof Error ? error.message : String(error)}`);
      sendError(req, res, 500, 'Internal server error.');
    }
  };
}
