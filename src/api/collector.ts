import type { CountryCode, RemoteStockHistory } from '../core/types';
import type { HistoryClient } from '../state/clients';
import { HttpClient } from './http';
import { parseRemoteStockHistory } from './schemas';

function configuredUrl(): string {
  const value = import.meta.env.VITE_COLLECTOR_URL;
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

export const COLLECTOR_URL = configuredUrl();

export class CollectorClient implements HistoryClient {
  readonly #baseUrl: string;
  readonly #http: HttpClient;

  constructor(
    baseUrl: string,
    http: HttpClient = new HttpClient({ target: 'the stock collector' }),
  ) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#http = http;
  }

  async getStockHistory(
    country: CountryCode,
    days: number,
    signal?: AbortSignal,
  ): Promise<RemoteStockHistory> {
    if (this.#baseUrl === '') {
      throw new Error('Collector URL is not configured.');
    }
    const url = `${this.#baseUrl}/api/v1/observations?country=${encodeURIComponent(country)}&days=${days}`;
    const payload = await this.#http.json(url, { signal });
    return parseRemoteStockHistory(payload, country);
  }
}

export function createDefaultHistoryClient(): HistoryClient | null {
  return COLLECTOR_URL === '' ? null : new CollectorClient(COLLECTOR_URL);
}
