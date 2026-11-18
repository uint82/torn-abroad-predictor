import type { CountryCode } from '../core/types';
import type { AppState } from '../state/app-state';
import { selectOverview } from '../state/selectors';
import { getDestination } from '../domain/destinations';
import { el, setHidden } from './dom';
import { formatMinutes, formatMoney, formatPercent, formatSignedMoney } from './format';

export interface OverviewActions {
  onSelect: (country: CountryCode) => void;
}

export interface OverviewView {
  element: HTMLElement;
  update(state: AppState, now: number): void;
}

function metaRow(label: string, value: string): HTMLElement {
  return el('div', { className: 'card__row' }, [
    el('span', { text: label }),
    el('span', { className: 'card__value', text: value }),
  ]);
}

export function createOverview(actions: OverviewActions): OverviewView {
  const grid = el('div', { className: 'overview' });
  const element = el('section', { className: 'section' }, [
    el('div', { className: 'section__head' }, [
      el('h2', { className: 'section__title', text: 'Destinations' }),
      el('span', {
        className: 'section__hint',
        text: 'Ranked by estimated profit per hour, using catalog prices and current stock.',
      }),
    ]),
    grid,
  ]);

  return {
    element,
    update(state, now) {
      setHidden(element, state.catalog.length === 0);
      if (state.catalog.length === 0) {
        return;
      }
      grid.replaceChildren(
        ...selectOverview(state, now).map((entry, index) => {
          const destination = getDestination(entry.country);
          const { plan } = entry;
          const selected = state.country === entry.country;
          const tone =
            plan.netProfit > 0
              ? 'text-positive'
              : plan.netProfit < 0
                ? 'text-negative'
                : 'text-muted';
          return el(
            'button',
            {
              className: 'card',
              attrs: {
                type: 'button',
                'aria-pressed': String(selected),
                title: `Show ${destination.name}`,
              },
              on: { click: () => actions.onSelect(entry.country) },
            },
            [
              el('div', { className: 'card__top' }, [
                el('span', { className: 'card__identity' }, [
                  el('span', { className: 'country-tag', text: destination.tag }),
                  el('span', {}, [
                    el('span', { className: 'card__name', text: destination.shortName }),
                    el('span', { className: 'card__meta', text: destination.city }),
                  ]),
                ]),
                el('span', {
                  className: `badge ${index === 0 && plan.units > 0 ? 'badge--info' : 'badge--muted'}`,
                  text: index === 0 && plan.units > 0 ? 'Best' : `#${index + 1}`,
                }),
              ]),
              el('div', { className: 'card__profit' }, [
                el('div', { className: 'card__profit-label', text: 'Net profit' }),
                el('div', {
                  className: `card__profit-value ${tone}`,
                  text: formatSignedMoney(plan.netProfit),
                }),
              ]),
              metaRow('Per hour', formatMoney(plan.profitPerHour)),
              metaRow('Trip', formatMinutes(plan.totalMinutes)),
              metaRow(
                'Basket',
                `${plan.units}/${plan.capacity} (${formatPercent(plan.fillRate * 100, 0)})`,
              ),
            ],
          );
        }),
      );
    },
  };
}
