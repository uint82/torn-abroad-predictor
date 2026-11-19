import type { CountryCode, ItemRow, Settings, TripPick, TripPlan } from '../core/types';
import { getDestination, roundTripMinutes } from './destinations';

export const ITEM_MARKET_FEE_PERCENT = 5;
export const MAX_FEE_PERCENT = 100;

export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isPositiveAmount(value: unknown): value is number {
  return isValidAmount(value) && value > 0;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(MAX_FEE_PERCENT, Math.max(0, value));
}

export function feePercentFor(settings: Pick<Settings, 'channel' | 'customFeePercent'>): number {
  switch (settings.channel) {
    case 'item-market':
      return ITEM_MARKET_FEE_PERCENT;
    case 'bazaar':
      return 0;
    case 'custom':
      return clampPercent(settings.customFeePercent);
  }
}

export function netSalePrice(salePrice: number, feePercent: number): number | null {
  if (!isPositiveAmount(salePrice)) {
    return null;
  }
  return salePrice * (1 - clampPercent(feePercent) / 100);
}

export interface UnitProfitInput {
  buyPrice: number;
  salePrice: number;
  feePercent: number;
}

export function unitProfit(input: UnitProfitInput): number | null {
  if (!isValidAmount(input.buyPrice) || !isPositiveAmount(input.salePrice)) {
    return null;
  }
  const net = netSalePrice(input.salePrice, input.feePercent);
  return net === null ? null : net - input.buyPrice;
}

export interface FlightCostInput {
  destinationCode: CountryCode;
  method: Settings['method'];
  businessTicketCost: number;
  roundTrip?: boolean;
}

export function flightCost(input: FlightCostInput): number {
  const legs = input.roundTrip === false ? 1 : 2;
  if (input.method === 'airstrip' || input.method === 'wlt') {
    return 0;
  }
  if (input.method === 'business') {
    return isValidAmount(input.businessTicketCost) ? input.businessTicketCost * legs : 0;
  }
  return getDestination(input.destinationCode).standardFare * legs;
}

export function profitPerHour(netProfit: number, totalMinutes: number): number | null {
  if (!Number.isFinite(netProfit) || !Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return null;
  }
  return netProfit * (60 / totalMinutes);
}

export interface BasketCandidate {
  itemId: number;
  name: string;
  unitProfit: number;
  stock: number;
  buyPrice: number;
}

export interface BasketSelection {
  units: number;
  buyCost: number;
  grossProfit: number;
  picks: TripPick[];
}

export function selectBasket(
  candidates: readonly BasketCandidate[],
  capacity: number,
): BasketSelection {
  const slots = Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0;
  const sorted = [...candidates]
    .filter(
      (candidate) =>
        candidate.unitProfit > 0 &&
        Number.isFinite(candidate.unitProfit) &&
        candidate.stock > 0 &&
        Number.isFinite(candidate.stock) &&
        isValidAmount(candidate.buyPrice),
    )
    .sort(
      (a, b) => b.unitProfit - a.unitProfit || a.name.localeCompare(b.name) || a.itemId - b.itemId,
    );

  let remaining = slots;
  let buyCost = 0;
  let grossProfit = 0;
  const picks: TripPick[] = [];

  for (const candidate of sorted) {
    if (remaining <= 0) {
      break;
    }
    const units = Math.min(Math.floor(candidate.stock), remaining);
    if (units <= 0) {
      continue;
    }
    const profit = candidate.unitProfit * units;
    picks.push({
      itemId: candidate.itemId,
      units,
      unitProfit: candidate.unitProfit,
      profit,
    });
    buyCost += candidate.buyPrice * units;
    grossProfit += profit;
    remaining -= units;
  }

  return {
    units: slots - remaining,
    buyCost,
    grossProfit,
    picks,
  };
}

export function buildTripPlan(
  country: TripPlan['country'],
  rows: readonly ItemRow[],
  settings: Settings,
): TripPlan {
  const destination = getDestination(country);
  const candidates = rows.flatMap<BasketCandidate>((row) => {
    const availability = settings.includePredictedStock ? row.forecast.expectedStock : row.stock;
    if (
      row.unitProfit === null ||
      row.buyPrice === null ||
      availability === null ||
      availability <= 0
    ) {
      return [];
    }
    return [
      {
        itemId: row.itemId,
        name: row.name,
        unitProfit: row.unitProfit,
        stock: availability,
        buyPrice: row.buyPrice,
      },
    ];
  });

  const selection = selectBasket(candidates, settings.capacity);
  const cost = flightCost({
    destinationCode: country,
    method: settings.method,
    businessTicketCost: settings.businessTicketCost,
  });
  const minutes =
    roundTripMinutes(destination, settings.method, settings.book) + settings.waitMinutes;
  const netProfit = selection.grossProfit - cost;

  return {
    country,
    capacity: Math.max(0, Math.floor(settings.capacity)),
    units: selection.units,
    buyCost: selection.buyCost,
    grossProfit: selection.grossProfit,
    flightCost: cost,
    netProfit,
    roiPercent: selection.buyCost > 0 ? (netProfit / selection.buyCost) * 100 : null,
    profitPerHour: selection.units > 0 ? profitPerHour(netProfit, minutes) : null,
    totalMinutes: minutes,
    fillRate:
      settings.capacity > 0 ? selection.units / Math.max(1, Math.floor(settings.capacity)) : 0,
    picks: selection.picks,
  };
}
