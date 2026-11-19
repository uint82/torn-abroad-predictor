import type { ItemRow, SortKey, TripPlan } from '../core/types';
import type { AppState } from '../state/app-state';
import { el } from './dom';
import {
  formatMoney,
  formatRelative,
  formatSignedMoney,
  formatSignedPercent,
  formatStock,
  formatTctTime,
} from './format';
import { icon } from './icons';
import { restockTooltip } from './restock-format';

export interface ItemTableActions {
  onSelect: (itemId: number) => void;
  onSort: (sort: SortKey) => void;
}

export interface ItemTableView {
  element: HTMLElement;
  update(rows: readonly ItemRow[], plan: TripPlan, state: AppState, now: number): void;
}

const COLUMNS: readonly { label: string; sort: SortKey | null }[] = [
  { label: 'Item', sort: 'name' },
  { label: 'Buy', sort: 'buy' },
  { label: 'Stock', sort: 'stock' },
  { label: 'Restock', sort: null },
  { label: 'Market', sort: 'market' },
  { label: 'Net sale', sort: null },
  { label: 'Unit profit', sort: 'profit' },
  { label: 'Trend', sort: null },
  { label: 'Pick', sort: null },
  { label: 'Trip profit', sort: null },
];

const ASCENDING: readonly SortKey[] = ['name', 'buy'];

function headerCell(
  label: string,
  sort: SortKey | null,
  active: SortKey,
  onSort: (sort: SortKey) => void,
): HTMLTableCellElement {
  const cell = el('th', { attrs: { scope: 'col' } });
  if (sort === null) {
    cell.textContent = label;
    return cell;
  }
  const button = el(
    'button',
    {
      className: 'items-table__sort',
      attrs: { type: 'button' },
      on: { click: () => onSort(sort) },
    },
    [label],
  );
  if (sort === active) {
    button.append(icon(ASCENDING.includes(sort) ? 'arrowUp' : 'arrowDown', 11));
  }
  cell.append(button);
  return cell;
}

function numberCell(text: string, className = ''): HTMLTableCellElement {
  return el('td', { className: `items-table__num ${className}`.trim(), text });
}

function sourceBadge(row: ItemRow, now: number): HTMLElement {
  if (row.quoteSource === 'live') {
    const badge = el('span', { className: 'badge badge--info', text: 'live' });
    badge.title =
      row.quoteFetchedAt === null
        ? 'Live item market quote'
        : `Live item market quote from ${formatRelative(row.quoteFetchedAt, now)}`;
    return badge;
  }
  if (row.quoteSource === 'catalog') {
    const badge = el('span', { className: 'badge badge--muted', text: 'catalog' });
    badge.title = 'Torn catalog market price, not a live listing';
    return badge;
  }
  const badge = el('span', { className: 'badge badge--warning', text: 'no price' });
  badge.title = 'No market price is available for this item';
  return badge;
}

function stockCell(row: ItemRow, now: number): HTMLTableCellElement {
  const cell = el('td');
  const valueClass =
    row.stock === null
      ? 'items-table__stock-value--unknown'
      : row.stock <= 0
        ? 'items-table__stock-value--empty'
        : '';
  const value = el('span', {
    className: `items-table__stock-value ${valueClass}`.trim(),
    text: row.stock === null ? 'n/a' : formatStock(row.stock),
  });
  const wrapper = el('span', { className: 'items-table__stock' }, [value]);

  const forecast = row.forecast;
  if (forecast.status !== 'in-stock') {
    const soldLabel = row.stock !== null && row.stock > 0 ? 'sells out' : 'sold out';
    const labels = {
      'restock-expected': ['restock', 'badge--warning'],
      'sold-out': [soldLabel, 'badge--negative'],
      unknown: ['no data', 'badge--muted'],
    } as const;
    const [label, className] = labels[forecast.status];
    wrapper.append(el('span', { className: `badge ${className}`, text: label }));
  }

  if (
    forecast.expectedStock !== null &&
    forecast.expectedStock !== row.stock &&
    forecast.status !== 'unknown'
  ) {
    const note = el('span', {
      className: 'items-table__stock-note',
      text: `${formatStock(forecast.expectedStock)} at arrival`,
    });
    note.title = `Forecast confidence: ${forecast.confidence}, samples: ${forecast.samples}`;
    wrapper.append(note);
  }

  if (row.stockUpdatedAt !== null) {
    wrapper.title = `Stock reported ${formatRelative(row.stockUpdatedAt, now)}`;
  }
  cell.append(wrapper);
  return cell;
}

function restockCell(row: ItemRow, now: number): HTMLTableCellElement {
  const cell = el('td');
  const timestamp = row.forecast.nextRestockAt;
  if (timestamp === null) {
    const value = el('span', {
      className: 'items-table__restock items-table__restock--unknown',
      text: 'n/a',
    });
    value.title = restockTooltip(row.forecast, now);
    cell.append(value);
    return cell;
  }
  const value = el('span', {
    className: 'items-table__restock',
    text: formatTctTime(timestamp),
  });
  value.title = restockTooltip(row.forecast, now);
  cell.append(value);
  return cell;
}

function trendCell(row: ItemRow): HTMLTableCellElement {
  const { trend } = row;
  const cell = el('td');
  if (trend.direction === 'unknown') {
    cell.append(
      el('span', { className: 'items-table__trend items-table__trend--unknown', text: 'n/a' }),
    );
    return cell;
  }
  const map = {
    rising: { icon: 'arrowUp', className: 'rising' },
    falling: { icon: 'arrowDown', className: 'falling' },
    stable: { icon: 'minus', className: 'stable' },
  } as const;
  const style = map[trend.direction];
  const wrapper = el('span', {
    className: `items-table__trend items-table__trend--${style.className}`,
  });
  wrapper.append(
    icon(style.icon, 12),
    el('span', { text: formatSignedPercent(trend.changePercent) }),
  );
  wrapper.title = `${trend.samples} saved price samples`;
  cell.append(wrapper);
  return cell;
}

export function createItemTable(actions: ItemTableActions): ItemTableView {
  const head = el('thead');
  const body = el('tbody');
  const table = el('table', { className: 'items-table' }, [head, body]);
  const element = el('div', { className: 'table-wrap' }, [table]);

  return {
    element,
    update(rows, plan, state, now) {
      head.replaceChildren(
        el(
          'tr',
          {},
          COLUMNS.map((column) =>
            headerCell(column.label, column.sort, state.filters.sort, actions.onSort),
          ),
        ),
      );

      const picks = new Map(plan.picks.map((pick) => [pick.itemId, pick]));
      body.replaceChildren(
        ...rows.map((row) => {
          const pick = picks.get(row.itemId);
          const selected = state.selectedItemId === row.itemId;

          const name = el('button', {
            className: 'items-table__item-name',
            text: row.name,
            attrs: { type: 'button' },
            on: {
              click: (event) => {
                event.stopPropagation();
                actions.onSelect(row.itemId);
              },
            },
          });
          const meta = el('span', { className: 'items-table__item-meta' }, [
            el('span', { className: 'type-chip', text: row.type }),
            sourceBadge(row, now),
          ]);

          const profitClass =
            row.unitProfit === null
              ? 'items-table__profit--muted'
              : row.unitProfit < 0
                ? 'items-table__profit--negative'
                : '';

          const unitProfit = row.unitProfit === null ? 'n/a' : formatSignedMoney(row.unitProfit);
          const tripProfit = pick ? formatSignedMoney(pick.profit) : '-';

          return el(
            'tr',
            {
              className: 'items-table__row',
              attrs: { 'aria-selected': String(selected) },
              on: { click: () => actions.onSelect(row.itemId) },
            },
            [
              el('td', {}, [
                el('span', { className: 'items-table__item' }, [
                  el('span', { className: 'items-table__item-body' }, [name, meta]),
                ]),
              ]),
              numberCell(formatMoney(row.buyPrice)),
              stockCell(row, now),
              restockCell(row, now),
              numberCell(formatMoney(row.salePrice)),
              numberCell(formatMoney(row.netSalePrice)),
              numberCell(unitProfit, `items-table__profit ${profitClass}`.trim()),
              trendCell(row),
              el('td', {}, [
                el('span', {
                  className: `items-table__pick${pick ? '' : ' items-table__pick--empty'}`,
                  text: pick ? `x${pick.units}` : '-',
                }),
              ]),
              numberCell(
                tripProfit,
                `items-table__profit ${pick ? '' : 'items-table__profit--muted'}`.trim(),
              ),
            ],
          );
        }),
      );
    },
  };
}
