import type { CountryCode } from '../src/core/types';
import { COUNTRY_CODES } from '../src/core/types';
import { errorMessage } from '../src/core/errors';
import { DAY_MS } from '../src/core/time';
import type { StockRepository } from './stock-repository';

export const DEFAULT_OBSERVATION_DAYS = 30;
export const MAX_OBSERVATION_DAYS = 90;
export const OBSERVATION_CACHE_SECONDS = 30;
export const GZIP_MIN_BYTES = 1_024;

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
};

export interface ApiRequest {
  method: string;
  url: URL;
}

export interface ApiResult {
  status: number;
  body: unknown | null;
  cacheControl: string;
}

interface ObservationQuery {
  country: CountryCode;
  from: number;
  itemId: number | null;
  includePrior: boolean;
}

export interface ApiOptions {
  store: StockRepository;
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

function jsonResult(status: number, body: unknown, cacheControl = 'no-store'): ApiResult {
  return { status, body, cacheControl };
}

function errorResult(status: number, message: string): ApiResult {
  return jsonResult(status, { error: message });
}

function observationCacheControl(): string {
  return `public, max-age=${OBSERVATION_CACHE_SECONDS}, stale-while-revalidate=${OBSERVATION_CACHE_SECONDS}`;
}

function parseObservationQuery(url: URL, now: number): ObservationQuery | ApiResult {
  const country = url.searchParams.get('country');
  if (!isCountry(country)) {
    return errorResult(400, 'Unknown or missing country.');
  }
  const days = boundedInteger(
    url.searchParams.get('days'),
    DEFAULT_OBSERVATION_DAYS,
    1,
    MAX_OBSERVATION_DAYS,
  );
  if (days === null) {
    return errorResult(400, `days must be an integer from 1 to ${MAX_OBSERVATION_DAYS}.`);
  }
  const itemValue = url.searchParams.get('itemId');
  const itemId = itemValue === null ? null : Number(itemValue);
  if (itemId !== null && (!Number.isInteger(itemId) || itemId <= 0)) {
    return errorResult(400, 'itemId must be a positive integer.');
  }
  const sinceValue = url.searchParams.get('since');
  const since = sinceValue === null ? null : Number(sinceValue);
  if (since !== null && (!Number.isInteger(since) || since < 0 || since > now)) {
    return errorResult(400, 'since must be an integer timestamp no later than now.');
  }

  const windowStart = now - days * DAY_MS;
  const from = since === null ? windowStart : Math.max(windowStart, since);
  return {
    country,
    from,
    itemId,
    includePrior: since === null || since <= windowStart,
  };
}

function isApiResult(value: ObservationQuery | ApiResult): value is ApiResult {
  return 'status' in value;
}

export async function handleApiRequest(
  request: ApiRequest,
  options: ApiOptions,
): Promise<ApiResult> {
  if (request.method === 'OPTIONS') {
    return { status: 204, body: null, cacheControl: 'no-store' };
  }
  if (request.method !== 'GET') {
    return errorResult(405, 'Method not allowed.');
  }

  const now = (options.now ?? Date.now)();
  try {
    if (request.url.pathname === '/api/v1/health') {
      return jsonResult(200, await options.store.readHealth(now));
    }
    if (request.url.pathname === '/api/v1/observations') {
      const query = parseObservationQuery(request.url, now);
      if (isApiResult(query)) {
        return query;
      }
      const observations = await options.store.readObservations(
        query.country,
        query.from,
        now,
        query.itemId,
        query.includePrior,
      );
      return jsonResult(200, observations, observationCacheControl());
    }
    return errorResult(404, 'Not found.');
  } catch (error) {
    (options.log ?? (() => undefined))(`API request failed: ${errorMessage(error)}`);
    return errorResult(500, 'Internal server error.');
  }
}
