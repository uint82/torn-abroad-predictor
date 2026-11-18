import type { ItemRow, PriceTrend, StockForecast, TripPlan } from '../core/types';
import { el } from './dom';
import { createDialogShell } from './dialog-shell';
import {
  formatMoney,
  formatPercent,
  formatRelative,
  formatSignedMoney,
  formatSignedPercent,
  formatStock,
  formatTctDateTime,
  formatTctTime,
} from './format';

export interface ItemDialogView {
  element: HTMLDialogElement;
  open(row: ItemRow, plan: TripPlan, now: number): void;
  close(): void;
  isOpen(): boolean;
}

function trendText(trend: PriceTrend): string {
  if (trend.direction === 'unknown') {
    return 'Not enough price history';
  }
  const label = trend.direction.charAt(0).toUpperCase() + trend.direction.slice(1);
  return `${label} ${formatSignedPercent(trend.changePercent)}`;
}

function forecastText(forecast: StockForecast): string {
  if (forecast.status === 'unknown' || forecast.expectedStock === null) {
    return 'Not enough stock history yet. The forecast improves as the tracker records changes.';
  }
  const expected = `${formatStock(forecast.expectedStock)} units expected at arrival`;
  return `${expected} (${forecast.confidence} confidence, ${forecast.samples} samples).`;
}

function detail(label: string, value: string, tone = ''): HTMLElement {
  return el('div', { className: 'stat' }, [
    el('span', { className: 'stat__label', text: label }),
    el('span', { className: `stat__value ${tone}`.trim(), text: value }),
  ]);
}

function restockDetail(forecast: StockForecast): HTMLElement {
  const timestamp = forecast.nextRestockAt;
  const entry = detail('Next restock', timestamp === null ? 'n/a' : formatTctTime(timestamp));
  if (timestamp !== null) {
    entry.title = `Estimated restock ${formatTctDateTime(timestamp)}.`;
  }
  return entry;
}

export function createItemDialog(): ItemDialogView {
  const body = el('div', { className: 'dialog__body' });
  const footer = el('div', { className: 'dialog__footer' }, []);
  const close = el('button', {
    className: 'btn btn--accent',
    text: 'Close',
    attrs: { type: 'button' },
  });
  footer.append(close);

  const shell = createDialogShell({
    title: 'Item',
    subtitle: '',
    body,
    footer,
  });
  close.addEventListener('click', () => shell.close());

  return {
    element: shell.dialog,
    open(row, plan, now) {
      shell.title.textContent = row.name;
      shell.subtitle.textContent = `${row.type} - ${row.shop}`;
      const pick = plan.picks.find((entry) => entry.itemId === row.itemId);
      const profitTone =
        row.unitProfit === null
          ? ''
          : row.unitProfit >= 0
            ? 'stat__value--positive'
            : 'stat__value--negative';
      const tripTone = pick
        ? pick.profit >= 0
          ? 'stat__value--positive'
          : 'stat__value--negative'
        : '';

      const grid = el('div', { className: 'item-detail' }, [
        detail('Buy price', formatMoney(row.buyPrice)),
        detail(
          'Stock now',
          row.stock === null ? 'n/a' : formatStock(row.stock),
          row.stock === null ? '' : row.stock > 0 ? '' : 'stat__value--negative',
        ),
        detail('Market price', formatMoney(row.salePrice)),
        detail('Net sale', formatMoney(row.netSalePrice)),
        detail(
          'Unit profit',
          row.unitProfit === null ? 'n/a' : formatSignedMoney(row.unitProfit),
          profitTone,
        ),
        detail('Price trend', trendText(row.trend)),
        restockDetail(row.forecast),
        detail('Trip pick', pick ? `x${pick.units}` : 'Not in basket'),
        detail('Trip profit', pick ? formatSignedMoney(pick.profit) : '-', tripTone),
      ]);

      const forecast = el('div', { className: 'callout' }, [
        el('strong', { text: 'Stock forecast. ' }),
        document.createTextNode(forecastText(row.forecast)),
      ]);

      const source = el('p', { className: 'field__hint' });
      if (row.quoteSource === 'live') {
        source.textContent = `Live item market quote fetched ${formatRelative(row.quoteFetchedAt, now)}.`;
      } else if (row.quoteSource === 'catalog') {
        source.textContent = 'Catalog market price. Add an API key for live item market quotes.';
      } else {
        source.textContent = 'No market price is available for this item.';
      }

      const stock = el('p', {
        className: 'field__hint',
        text:
          row.stockUpdatedAt === null
            ? 'No stock report for this item yet.'
            : `Stock reported ${formatRelative(row.stockUpdatedAt, now)}.`,
      });

      const feePercent =
        row.salePrice !== null && row.salePrice > 0 && row.netSalePrice !== null
          ? 100 - (row.netSalePrice / row.salePrice) * 100
          : null;
      const fee = el('p', {
        className: 'field__hint',
        text:
          feePercent === null
            ? 'No sale price is available, so no fee is applied.'
            : `${formatPercent(feePercent, 1)} of the sale price goes to fees.`,
      });

      body.replaceChildren(grid, forecast, source, stock, fee);
      if (!shell.dialog.open) {
        shell.dialog.showModal();
      }
    },
    close() {
      shell.close();
    },
    isOpen() {
      return shell.dialog.open;
    },
  };
}
