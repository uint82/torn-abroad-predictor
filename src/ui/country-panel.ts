import type { CountryCode, Filters, SortKey, TripPlan } from '../core/types';
import type { AppState } from '../state/app-state';
import { selectPlan, selectVisibleRows } from '../state/selectors';
import { getDestination, roundTripMinutes } from '../domain/destinations';
import { ITEM_GROUPS, ITEM_GROUP_LABELS } from '../domain/item-groups';
import { el, setHidden, setText } from './dom';
import { formatMinutes, formatMoney, formatPercent, formatSignedMoney } from './format';
import { createItemTable } from './item-table';

export interface CountryPanelActions {
  onFilters: (filters: Filters) => void;
  onSelectItem: (itemId: number) => void;
  onSort: (sort: SortKey) => void;
  onKey: () => void;
  onRefresh: () => void;
}

export interface CountryPanelView {
  element: HTMLElement;
  update(state: AppState, now: number): void;
}

function stat(label: string, value: string, note: string, tone = ''): HTMLElement {
  return el('div', { className: 'stat' }, [
    el('span', { className: 'stat__label', text: label }),
    el('span', { className: `stat__value ${tone}`.trim(), text: value }),
    el('span', { className: 'stat__note', text: note }),
  ]);
}

function createGroupChips(onChange: (group: Filters['group']) => void): {
  element: HTMLElement;
  update: (filters: Filters) => void;
} {
  const buttons = new Map<Filters['group'], HTMLButtonElement>();
  const element = el(
    'div',
    { className: 'controls__group', attrs: { role: 'group', 'aria-label': 'Item group' } },
    ITEM_GROUPS.map((group) => {
      const button = el('button', {
        className: 'chip',
        text: ITEM_GROUP_LABELS[group],
        attrs: { type: 'button', 'aria-pressed': false },
        on: { click: () => onChange(group) },
      });
      buttons.set(group, button);
      return button;
    }),
  );
  return {
    element,
    update(filters) {
      for (const [group, button] of buttons) {
        button.setAttribute('aria-pressed', String(group === filters.group));
      }
    },
  };
}

const SORT_LABELS: Record<SortKey, string> = {
  profit: 'Unit profit',
  stock: 'Stock',
  name: 'Name',
  buy: 'Buy price',
  market: 'Market price',
};

export function createCountryPanel(actions: CountryPanelActions): CountryPanelView {
  const title = el('h2', { className: 'country-head__title' });
  const subtitle = el('span', { className: 'country-head__subtitle' });
  const tag = el('span', { className: 'country-tag' });
  const stats = el('div', { className: 'country-stats' });
  let filters: Filters = { group: 'all', sort: 'profit', inStockOnly: false };

  const chips = createGroupChips((group) => {
    actions.onFilters({ ...filters, group });
  });

  const sortSelect = el('select', {
    className: 'select',
    attrs: { 'aria-label': 'Sort items' },
    on: {
      change: () => {
        actions.onFilters({ ...filters, sort: sortSelect.value as SortKey });
      },
    },
  });
  for (const [value, label] of Object.entries(SORT_LABELS)) {
    sortSelect.append(el('option', { text: label, attrs: { value } }));
  }

  const stockToggle = el('input', {
    attrs: { type: 'checkbox' },
    on: { change: () => actions.onFilters({ ...filters, inStockOnly: stockToggle.checked }) },
  });
  const stockLabel = el('label', { className: 'toggle' }, [stockToggle, 'In stock only']);

  const table = createItemTable({
    onSelect: actions.onSelectItem,
    onSort: actions.onSort,
  });

  const empty = el('div', { className: 'empty' }, [
    el('h3', { className: 'empty__title', text: 'Nothing to show yet' }),
    el('p', { className: 'empty__text' }),
  ]);
  const emptyText = empty.querySelector('.empty__text');

  const noKey = el('div', { className: 'callout' }, [
    el('strong', { text: 'No API key.' }),
    document.createTextNode(
      ' Prices come from the cached catalog. Add a key for live item market quotes.',
    ),
    el('button', {
      className: 'btn btn--sm',
      text: 'Add key',
      attrs: { type: 'button' },
      on: { click: actions.onKey },
    }),
  ]);
  const noKeyRow = el('div', { className: 'controls' }, [noKey]);

  const panel = el('div', { className: 'country-panel' }, [
    el('div', { className: 'country-head' }, [
      el('div', { className: 'country-head__identity' }, [tag, el('div', {}, [title, subtitle])]),
      stats,
    ]),
    el('div', { className: 'controls' }, [
      chips.element,
      el('div', { className: 'controls__group' }, [sortSelect, stockLabel]),
    ]),
    noKeyRow,
    table.element,
    empty,
  ]);

  const element = el('section', { className: 'section' }, [panel]);

  return {
    element,
    update(state, now) {
      const hasCatalog = state.catalog.length > 0;
      setHidden(element, !hasCatalog);
      if (!hasCatalog) {
        return;
      }
      const destination = getDestination(state.country);
      filters = state.filters;
      setText(tag, destination.tag);
      setText(title, destination.name);
      setText(subtitle, `${destination.city} - local shop prices`);

      chips.update(state.filters);
      sortSelect.value = state.filters.sort;
      stockToggle.checked = state.filters.inStockOnly;

      const rows = selectVisibleRows(state, now);
      const plan = selectPlan(state, rows);
      renderStats(stats, state, plan, destination.code);

      setHidden(noKeyRow, state.apiKey !== '');

      table.update(rows, plan, state, now);
      setHidden(table.element, rows.length === 0);
      setHidden(empty, rows.length > 0);
      if (rows.length === 0 && emptyText) {
        setText(
          emptyText,
          hasCatalog
            ? 'No items match these filters for this destination. Try another group or turn off the stock filter.'
            : 'Add an API key to load the item catalog, or refresh once the catalog is available.',
        );
        empty
          .querySelector('.empty__title')
          ?.replaceChildren(hasCatalog ? 'No matching items' : 'Catalog not loaded');
      }
    },
  };
}

function renderStats(
  container: HTMLElement,
  state: AppState,
  plan: TripPlan,
  country: CountryCode,
): void {
  const destination = getDestination(country);
  const tripMinutes = roundTripMinutes(destination, state.settings.method, state.settings.book);
  container.replaceChildren(
    stat(
      'Net profit',
      formatSignedMoney(plan.netProfit),
      `${formatMoney(plan.buyCost)} spent`,
      plan.netProfit >= 0 ? 'stat__value--positive' : 'stat__value--negative',
    ),
    stat('Per hour', formatMoney(plan.profitPerHour), 'after fees and travel'),
    stat('ROI', formatPercent(plan.roiPercent), 'on items bought'),
    stat('Trip', formatMinutes(plan.totalMinutes), `${formatMinutes(tripMinutes)} flying`),
    stat(
      'Flight',
      formatMoney(plan.flightCost),
      state.settings.method === 'business'
        ? 'business seats'
        : state.settings.method === 'standard'
          ? 'tickets'
          : 'free flight',
    ),
    stat(
      'Basket',
      `${plan.units}/${plan.capacity}`,
      `${formatPercent(plan.fillRate * 100, 0)} full`,
    ),
  );
}
