import type {
  CatalogItem,
  CatalogShop,
  CountryCode,
  CountryStock,
  Histories,
  ItemRow,
  MarketQuote,
  Settings,
  StockObservation,
} from '../core/types';
import { getDestination, oneWayMinutes } from './destinations';
import { groupForType } from './item-groups';
import { forecastStock, predictPriceTrend } from './prediction';
import { feePercentFor, isValidAmount, netSalePrice, unitProfit } from './profit';

export interface BuildRowsOptions {
  country: CountryCode;
  stock: CountryStock | null | undefined;
  catalog: readonly CatalogItem[] | null | undefined;
  quotes: Readonly<Record<number, MarketQuote>>;
  histories: Histories;
  settings: Settings;
  now: number;
}

function pickShop(shops: readonly CatalogShop[], countryName: string): CatalogShop | null {
  const local = shops.filter((shop) => shop.country === countryName);
  const priced = local.filter((shop) => isValidAmount(shop.buyPrice));
  const pool = priced.length > 0 ? priced : local;
  return (
    [...pool].sort(
      (a, b) => (a.buyPrice ?? Number.POSITIVE_INFINITY) - (b.buyPrice ?? Number.POSITIVE_INFINITY),
    )[0] ?? null
  );
}

function withCurrentStock(
  history: readonly StockObservation[],
  quantity: number,
  at: number,
): StockObservation[] {
  const latest = history[history.length - 1];
  if (latest && latest.at === at && latest.quantity === quantity) {
    return [...history];
  }
  return [...history, { at, quantity }];
}

function quotePrice(quote: MarketQuote | undefined): number | null {
  if (!quote) {
    return null;
  }
  return isValidAmount(quote.averagePrice) && quote.averagePrice > 0 ? quote.averagePrice : null;
}

export function buildItemRows(options: BuildRowsOptions): ItemRow[] {
  const destination = getDestination(options.country);
  const catalogById = new Map((options.catalog ?? []).map((item) => [item.id, item]));
  const stockById = new Map((options.stock?.items ?? []).map((item) => [item.itemId, item]));
  const itemIds = new Set<number>([...catalogById.keys(), ...stockById.keys()]);
  const feePercent = feePercentFor(options.settings);
  const horizonMinutes =
    oneWayMinutes(destination, options.settings.method, options.settings.book) +
    options.settings.waitMinutes;
  const rows: ItemRow[] = [];

  for (const itemId of itemIds) {
    const catalogItem = catalogById.get(itemId);
    const stockItem = stockById.get(itemId);
    const shop = catalogItem ? pickShop(catalogItem.shops, destination.name) : null;
    const buyPrice =
      stockItem && isValidAmount(stockItem.cost)
        ? stockItem.cost
        : isValidAmount(shop?.buyPrice)
          ? shop.buyPrice
          : null;

    if (!stockItem && buyPrice === null) {
      continue;
    }

    const quote = options.quotes[itemId];
    const marketAverage =
      quotePrice(quote) ??
      (isValidAmount(catalogItem?.marketPrice) ? catalogItem.marketPrice : null);
    const lowestListing =
      quote && isValidAmount(quote.lowestPrice) && quote.lowestPrice > 0 ? quote.lowestPrice : null;
    const salePrice =
      options.settings.priceBasis === 'lowest' ? (lowestListing ?? marketAverage) : marketAverage;
    const netSale = salePrice !== null ? netSalePrice(salePrice, feePercent) : null;
    const profit =
      buyPrice !== null && salePrice !== null
        ? unitProfit({ buyPrice, salePrice, feePercent })
        : null;

    const stockAt = stockItem ? (options.stock?.updatedAt ?? options.now) : options.now;
    const stockHistory = stockItem
      ? withCurrentStock(
          options.histories.stock[options.country]?.[itemId] ?? [],
          stockItem.quantity,
          stockAt,
        )
      : (options.histories.stock[options.country]?.[itemId] ?? []);

    rows.push({
      itemId,
      name: catalogItem?.name ?? stockItem?.name ?? `Item ${itemId}`,
      type: catalogItem?.type ?? 'Unknown',
      group: groupForType(catalogItem?.type ?? ''),
      shop: shop?.shop ?? 'Unknown shop',
      buyPrice,
      stock: stockItem ? stockItem.quantity : null,
      stockUpdatedAt: stockItem ? stockAt : null,
      marketAverage,
      lowestListing,
      salePrice,
      netSalePrice: netSale,
      unitProfit: profit,
      quoteSource: quote ? 'live' : marketAverage !== null ? 'catalog' : 'none',
      quoteFetchedAt: quote?.fetchedAt ?? null,
      forecast: forecastStock(stockHistory, {
        now: options.now,
        horizonMinutes,
      }),
      trend: predictPriceTrend(options.histories.prices[itemId] ?? [], {
        now: options.now,
      }),
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.itemId - b.itemId);
}
