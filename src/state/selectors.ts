import type { CountryCode, ItemRow, TripPlan } from '../core/types';
import { DESTINATIONS } from '../domain/destinations';
import { buildItemRows } from '../domain/catalog';
import { filterRows, sortRows } from '../domain/filters';
import { buildTripPlan } from '../domain/profit';
import type { AppState } from './app-state';

export const MAX_QUOTED_ITEMS = 60;

export interface CountryPlan {
  country: CountryCode;
  plan: TripPlan;
}

export function selectRows(state: AppState, now: number): ItemRow[] {
  return buildItemRows({
    country: state.country,
    stock: state.stock?.countries[state.country],
    catalog: state.catalog,
    quotes: state.quotes,
    histories: state.histories,
    remoteHistories: state.remoteHistories,
    settings: state.settings,
    now,
  });
}

export function selectVisibleRows(state: AppState, now: number): ItemRow[] {
  return sortRows(filterRows(selectRows(state, now), state.filters), state.filters.sort);
}

export function selectPlan(state: AppState, rows: readonly ItemRow[]): TripPlan {
  return buildTripPlan(state.country, rows, state.settings);
}

export function selectOverview(state: AppState, now: number): CountryPlan[] {
  return DESTINATIONS.map((destination) => {
    const rows = buildItemRows({
      country: destination.code,
      stock: state.stock?.countries[destination.code],
      catalog: state.catalog,
      quotes: {},
      histories: state.histories,
      remoteHistories: state.remoteHistories,
      settings: state.settings,
      now,
    });
    return {
      country: destination.code,
      plan: buildTripPlan(destination.code, rows, state.settings),
    };
  }).sort((a, b) => {
    const rateA = a.plan.profitPerHour ?? Number.NEGATIVE_INFINITY;
    const rateB = b.plan.profitPerHour ?? Number.NEGATIVE_INFINITY;
    return rateB - rateA || b.plan.netProfit - a.plan.netProfit;
  });
}

export function selectQuotableIds(rows: readonly ItemRow[]): number[] {
  return rows
    .filter((row) => row.buyPrice !== null)
    .sort(
      (a, b) =>
        (b.unitProfit ?? Number.NEGATIVE_INFINITY) - (a.unitProfit ?? Number.NEGATIVE_INFINITY) ||
        a.itemId - b.itemId,
    )
    .slice(0, MAX_QUOTED_ITEMS)
    .map((row) => row.itemId);
}

export function selectRow(state: AppState, rows: readonly ItemRow[]): ItemRow | null {
  if (state.selectedItemId === null) {
    return null;
  }
  return rows.find((row) => row.itemId === state.selectedItemId) ?? null;
}
