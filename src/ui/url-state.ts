import type { CountryCode, Filters, ItemGroup, SortKey } from '../core/types';
import { isCountryCode } from '../domain/destinations';

export const DEFAULT_COUNTRY: CountryCode = 'jap';
export const DEFAULT_GROUP: ItemGroup = 'all';
export const DEFAULT_SORT: SortKey = 'profit';

const GROUPS: readonly ItemGroup[] = [
  'all',
  'plushie',
  'flower',
  'drug',
  'weapon',
  'gear',
  'other',
];

const SORTS: readonly SortKey[] = ['profit', 'stock', 'name', 'buy', 'market'];

export interface UrlState {
  country: CountryCode;
  filters: Filters;
}

export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  const country = params.get('country');
  const group = params.get('group');
  const sort = params.get('sort');
  return {
    country: country !== null && isCountryCode(country) ? country : DEFAULT_COUNTRY,
    filters: {
      group:
        group !== null && GROUPS.includes(group as ItemGroup)
          ? (group as ItemGroup)
          : DEFAULT_GROUP,
      sort: sort !== null && SORTS.includes(sort as SortKey) ? (sort as SortKey) : DEFAULT_SORT,
      inStockOnly: params.get('stock') === '1',
    },
  };
}

export function buildSearch(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.country !== DEFAULT_COUNTRY) {
    params.set('country', state.country);
  }
  if (state.filters.group !== DEFAULT_GROUP) {
    params.set('group', state.filters.group);
  }
  if (state.filters.sort !== DEFAULT_SORT) {
    params.set('sort', state.filters.sort);
  }
  if (state.filters.inStockOnly) {
    params.set('stock', '1');
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export function replaceUrlState(state: UrlState): void {
  window.history.replaceState(null, '', `${buildSearch(state)}${window.location.hash}`);
}
