import type { StockData } from '../core/types';
import { HttpClient } from './http';
import { parseTravelExport } from './schemas';

export const YATA_TRAVEL_URL = 'https://yata.yt/api/v1/travel/export/';

export class YataClient {
  readonly #http: HttpClient;

  constructor(http: HttpClient = new HttpClient()) {
    this.#http = http;
  }

  async getTravelStock(signal?: AbortSignal): Promise<StockData> {
    const payload = await this.#http.json(YATA_TRAVEL_URL, { signal });
    return parseTravelExport(payload);
  }
}
