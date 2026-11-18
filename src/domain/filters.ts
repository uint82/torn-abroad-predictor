import type { Filters, ItemRow, SortKey } from '../core/types';

function compareNullableDescending(a: number | null, b: number | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return b - a;
}

function priceFor(row: ItemRow): number | null {
  return row.salePrice;
}

export function filterRows(rows: readonly ItemRow[], filters: Filters): ItemRow[] {
  return rows.filter((row) => {
    if (filters.group !== 'all' && row.group !== filters.group) {
      return false;
    }
    if (filters.inStockOnly && (row.stock === null || row.stock <= 0)) {
      return false;
    }
    return true;
  });
}

export function sortRows(rows: readonly ItemRow[], sort: SortKey): ItemRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let result = 0;
    switch (sort) {
      case 'name':
        result = a.name.localeCompare(b.name);
        break;
      case 'stock':
        result = compareNullableDescending(a.stock, b.stock);
        break;
      case 'buy':
        result =
          (a.buyPrice ?? Number.POSITIVE_INFINITY) - (b.buyPrice ?? Number.POSITIVE_INFINITY);
        break;
      case 'market':
        result = compareNullableDescending(priceFor(a), priceFor(b));
        break;
      case 'profit':
        result = compareNullableDescending(a.unitProfit, b.unitProfit);
        break;
    }
    return result || a.name.localeCompare(b.name) || a.itemId - b.itemId;
  });
  return sorted;
}
