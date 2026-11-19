import { ShapeError } from '../core/errors';
import { isRecord } from '../core/json';
import type {
  CatalogItem,
  CatalogShop,
  CountryCode,
  CountryStock,
  MarketQuote,
  RemoteStockHistory,
  StockData,
  StockEntry,
  StockObservation,
} from '../core/types';
import { COUNTRY_CODES } from '../core/types';

export interface ApiErrorPayload {
  code: number;
  message: string;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ShapeError('an object', path);
  }
  return value;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ShapeError('an array', path);
  }
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new ShapeError('a string', path);
  }
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ShapeError('a finite number', path);
  }
  return value;
}

function optionalNumber(value: unknown, path: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  return number(value, path);
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = number(value, path);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ShapeError('a positive integer', path);
  }
  return parsed;
}

export function extractApiError(payload: unknown): ApiErrorPayload | null {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return null;
  }
  const code = typeof payload.error.code === 'number' ? payload.error.code : 0;
  const message =
    typeof payload.error.error === 'string' ? payload.error.error : 'Torn returned an error.';
  return { code, message };
}

function parseShop(value: unknown, path: string): CatalogShop {
  const shop = record(value, path);
  return {
    country: text(shop.country, `${path}.country`),
    shop: text(shop.shop, `${path}.shop`),
    buyPrice: optionalNumber(shop.buy_price, `${path}.buy_price`),
    sellPrice: optionalNumber(shop.sell_price, `${path}.sell_price`),
  };
}

export function parseItemsResponse(payload: unknown): CatalogItem[] {
  const root = record(payload, 'response');
  return list(root.items, 'response.items').map((value, index) => {
    const path = `response.items[${index}]`;
    const item = record(value, path);
    const itemValue =
      item.value === undefined || item.value === null ? {} : record(item.value, `${path}.value`);
    const shops =
      itemValue.shops === undefined || itemValue.shops === null
        ? []
        : list(itemValue.shops, `${path}.value.shops`).map((shop, shopIndex) =>
            parseShop(shop, `${path}.value.shops[${shopIndex}]`),
          );
    return {
      id: number(item.id, `${path}.id`),
      name: text(item.name, `${path}.name`),
      type: item.type === undefined ? 'Unknown' : text(item.type, `${path}.type`),
      marketPrice: optionalNumber(itemValue.market_price, `${path}.value.market_price`),
      shops,
    };
  });
}

export function parseItemMarketResponse(
  payload: unknown,
  itemId: number,
  fetchedAt = Date.now(),
): MarketQuote {
  const root = record(payload, 'response');
  const market = record(root.itemmarket, 'response.itemmarket');
  const listings =
    market.listings === undefined || market.listings === null
      ? []
      : list(market.listings, 'response.itemmarket.listings');

  let lowestPrice: number | null = null;
  listings.forEach((value, index) => {
    const path = `response.itemmarket.listings[${index}]`;
    const listing = record(value, path);
    const price = number(listing.price, `${path}.price`);
    const amount = number(listing.amount, `${path}.amount`);
    if (price > 0 && amount > 0 && (lowestPrice === null || price < lowestPrice)) {
      lowestPrice = price;
    }
  });

  const item =
    market.item === undefined || market.item === null
      ? {}
      : record(market.item, 'response.itemmarket.item');
  const average = optionalNumber(item.average_price, 'response.itemmarket.item.average_price');
  const metadata = isRecord(root._metadata) ? root._metadata : {};
  const total = optionalNumber(metadata.total, 'response._metadata.total');

  return {
    itemId,
    averagePrice: average !== null && average > 0 ? average : null,
    lowestPrice,
    listingsCount: total !== null && total >= 0 ? Math.floor(total) : listings.length,
    fetchedAt,
  };
}

function toMillis(timestamp: number): number {
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
}

function parseStockEntry(value: unknown, path: string): StockEntry {
  const entry = record(value, path);
  return {
    itemId: positiveInteger(entry.id, `${path}.id`),
    name: text(entry.name, `${path}.name`),
    quantity: number(entry.quantity, `${path}.quantity`),
    cost: number(entry.cost, `${path}.cost`),
  };
}

function parseStockObservation(value: unknown, path: string): StockObservation {
  const observation = record(value, path);
  const at = number(observation.at, `${path}.at`);
  const quantity = number(observation.quantity, `${path}.quantity`);
  if (quantity < 0) {
    throw new ShapeError('a non-negative quantity', `${path}.quantity`);
  }
  return { at, quantity: Math.floor(quantity) };
}

export function parseRemoteStockHistory(
  payload: unknown,
  expectedCountry: CountryCode,
): RemoteStockHistory {
  const root = record(payload, 'history');
  const country = text(root.country, 'history.country');
  if (!COUNTRY_CODES.includes(country as CountryCode) || country !== expectedCountry) {
    throw new ShapeError(expectedCountry, 'history.country');
  }
  const from = number(root.from, 'history.from');
  const to = number(root.to, 'history.to');
  if (from > to) {
    throw new ShapeError('a time range with from <= to', 'history');
  }

  const rawItems = record(root.items, 'history.items');
  const items: Record<number, StockObservation[]> = {};
  for (const [key, value] of Object.entries(rawItems)) {
    const itemId = Number(key);
    if (!Number.isInteger(itemId) || itemId <= 0 || String(itemId) !== key) {
      continue;
    }
    const entries = list(value, `history.items.${key}`).map((entry, index) =>
      parseStockObservation(entry, `history.items.${key}[${index}]`),
    );
    if (entries.length > 0) {
      items[itemId] = entries.sort((a, b) => a.at - b.at);
    }
  }

  return { country: expectedCountry, from, to, items };
}

export function parseTravelExport(payload: unknown, fetchedAt = Date.now()): StockData {
  const root = record(payload, 'response');
  const stocks = record(root.stocks, 'response.stocks');
  const countries: Partial<Record<CountryCode, CountryStock>> = {};

  for (const code of COUNTRY_CODES) {
    const value = stocks[code];
    if (value === undefined || value === null) {
      continue;
    }
    const path = `response.stocks.${code}`;
    const country = record(value, path);
    const entries =
      country.stocks === undefined || country.stocks === null
        ? []
        : list(country.stocks, `${path}.stocks`).map((entry, index) =>
            parseStockEntry(entry, `${path}.stocks[${index}]`),
          );
    countries[code] = {
      code,
      updatedAt: toMillis(number(country.update, `${path}.update`)),
      items: entries,
    };
  }

  return { fetchedAt, countries };
}
