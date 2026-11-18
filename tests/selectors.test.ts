import { describe, expect, it, vi } from 'vitest';
import type { CatalogItem, StockData } from '../src/core/types';
import { DEFAULT_FILTERS, DEFAULT_SETTINGS } from '../src/core/types';
import { createInitialState } from '../src/state/app-state';
import {
  MAX_QUOTED_ITEMS,
  selectOverview,
  selectPlan,
  selectQuotableIds,
  selectRow,
  selectRows,
  selectVisibleRows,
} from '../src/state/selectors';
import { Store } from '../src/state/store';
import { at } from './fixtures';

const catalog: CatalogItem[] = [
  {
    id: 1,
    name: 'Ramen',
    type: 'Drug',
    marketPrice: 2000,
    shops: [{ country: 'Japan', shop: 'Ramen Shop', buyPrice: 900, sellPrice: null }],
  },
  {
    id: 2,
    name: 'Panda Plushie',
    type: 'Plushie',
    marketPrice: 1000,
    shops: [{ country: 'Japan', shop: 'Toy Shop', buyPrice: 500, sellPrice: null }],
  },
  {
    id: 3,
    name: 'Cactus',
    type: 'Flower',
    marketPrice: 800,
    shops: [{ country: 'Mexico', shop: 'Floreria', buyPrice: 100, sellPrice: null }],
  },
];

const stock: StockData = {
  fetchedAt: at(10),
  countries: {
    jap: {
      code: 'jap',
      updatedAt: at(10),
      items: [
        { itemId: 1, name: 'Ramen', quantity: 5, cost: 900 },
        { itemId: 2, name: 'Panda Plushie', quantity: 50, cost: 500 },
      ],
    },
    mex: {
      code: 'mex',
      updatedAt: at(10),
      items: [{ itemId: 3, name: 'Cactus', quantity: 10, cost: 100 }],
    },
  },
};

function makeState() {
  return createInitialState({
    settings: { ...DEFAULT_SETTINGS, method: 'airstrip', capacity: 10 },
    filters: DEFAULT_FILTERS,
    apiKey: '',
    catalog: { savedAt: at(10), items: catalog },
    stock: { savedAt: at(10), data: stock },
    histories: { stock: {}, prices: {} },
    country: 'jap',
  });
}

describe('selectors', () => {
  it('builds rows for the selected country only', () => {
    const rows = selectRows(makeState(), at(10));
    expect(rows.map((row) => row.name)).toEqual(['Panda Plushie', 'Ramen']);
    expect(rows[0]?.unitProfit).toBe(450);
    expect(rows[1]?.unitProfit).toBe(1000);
  });

  it('filters and sorts visible rows', () => {
    const state = {
      ...makeState(),
      filters: { group: 'drug' as const, sort: 'name' as const, inStockOnly: false },
    };
    expect(selectVisibleRows(state, at(10)).map((row) => row.name)).toEqual(['Ramen']);
  });

  it('builds a trip plan from the visible rows', () => {
    const state = makeState();
    const plan = selectPlan(state, selectRows(state, at(10)));
    expect(plan.units).toBe(10);
    expect(plan.grossProfit).toBe(7250);
    expect(plan.netProfit).toBe(7250);
  });

  it('ranks countries by profit per hour', () => {
    const overview = selectOverview(makeState(), at(10));
    expect(overview[0]?.country).toBe('mex');
    expect(overview[0]?.plan.netProfit).toBe(6600);
    expect(overview[1]?.country).toBe('jap');
    expect(overview).toHaveLength(11);
  });

  it('selects the most promising items for live quotes', () => {
    const state = makeState();
    const ids = selectQuotableIds(selectRows(state, at(10)));
    expect(ids).toEqual([1, 2]);
    expect(ids.length).toBeLessThanOrEqual(MAX_QUOTED_ITEMS);
  });

  it('finds the selected row', () => {
    const state = { ...makeState(), selectedItemId: 2 };
    const row = selectRow(state, selectRows(state, at(10)));
    expect(row?.name).toBe('Panda Plushie');
    expect(selectRow({ ...state, selectedItemId: 99 }, selectRows(state, at(10)))).toBeNull();
  });
});

describe('createInitialState', () => {
  it('marks a missing key', () => {
    expect(makeState().keyStatus).toBe('missing');
  });

  it('marks a stored key as unchecked', () => {
    const state = createInitialState({
      settings: DEFAULT_SETTINGS,
      filters: DEFAULT_FILTERS,
      apiKey: 'abc',
      catalog: null,
      stock: null,
      histories: { stock: {}, prices: {} },
      country: 'jap',
    });
    expect(state.keyStatus).toBe('unchecked');
    expect(state.catalogStatus).toBe('idle');
    expect(state.quoteStatus).toBe('idle');
  });
});

describe('Store', () => {
  it('notifies subscribers on change', () => {
    const store = new Store({ value: 1 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update((state) => ({ value: state.value + 1 }));
    expect(store.get().value).toBe(2);
    expect(listener).toHaveBeenCalledWith({ value: 2 });

    unsubscribe();
    store.update((state) => ({ value: state.value + 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('skips an unchanged state object', () => {
    const store = new Store({ value: 1 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.update((state) => state);
    expect(listener).not.toHaveBeenCalled();
  });
});
