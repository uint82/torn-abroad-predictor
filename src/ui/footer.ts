import type { AppState } from '../state/app-state';
import { el, setText } from './dom';
import { formatRelative } from './format';

export interface FooterView {
  element: HTMLElement;
  update(state: AppState, now: number): void;
}

interface Pill {
  element: HTMLElement;
  label: HTMLElement;
  dot: HTMLElement;
}

function createPill(label: string): Pill {
  const text = el('span', { text: label });
  const dot = el('span', { className: 'pill__dot' });
  return {
    element: el('span', { className: 'pill' }, [dot, text]),
    label: text,
    dot,
  };
}

function dotClass(age: number | null, freshMs: number, staleMs: number): string {
  if (age === null || age < 0) {
    return '';
  }
  if (age <= freshMs) {
    return 'pill__dot--live';
  }
  if (age <= staleMs) {
    return 'pill__dot--stale';
  }
  return 'pill__dot--down';
}

function link(label: string, href: string): HTMLAnchorElement {
  return el('a', {
    text: label,
    attrs: { href, target: '_blank', rel: 'noreferrer noopener' },
  });
}

export function createFooter(): FooterView {
  const stockPill = createPill('Stock');
  const quotePill = createPill('Quotes');
  const catalogPill = createPill('Catalog');

  const element = el('footer', { className: 'footer' }, [
    el('div', { className: 'container footer__inner' }, [
      el('div', { className: 'footer__text' }, [
        el('p', {
          text: 'Prices are estimates. Stock, listings, and fees move; check in game before spending.',
        }),
        el('p', {
          text: 'Data from the Torn API and YATA. This project is not affiliated with Torn City.',
        }),
        el('div', { className: 'footer__links' }, [
          link('GitHub', 'https://github.com/uint82/torn-abroad-predictor'),
          link('Torn API', 'https://www.torn.com/api.html'),
          link('YATA', 'https://yata.yt/'),
        ]),
      ]),
      el('div', { className: 'footer__links' }, [
        stockPill.element,
        quotePill.element,
        catalogPill.element,
      ]),
    ]),
  ]);

  return {
    element,
    update(state, now) {
      const stockAge = state.stockSavedAt === null ? null : now - state.stockSavedAt;
      setText(
        stockPill.label,
        state.stockSavedAt === null
          ? 'Stock not loaded'
          : `Stock ${formatRelative(state.stockSavedAt, now)}`,
      );
      stockPill.dot.className = `pill__dot ${dotClass(stockAge, 3 * 60_000, 30 * 60_000)}`.trim();

      if (state.apiKey === '') {
        setText(quotePill.label, 'Live quotes off');
        quotePill.dot.className = 'pill__dot';
      } else {
        const quoteAge = state.lastQuoteRefreshAt === null ? null : now - state.lastQuoteRefreshAt;
        setText(
          quotePill.label,
          state.lastQuoteRefreshAt === null
            ? 'Quotes pending'
            : `Quotes ${formatRelative(state.lastQuoteRefreshAt, now)}`,
        );
        quotePill.dot.className =
          `pill__dot ${dotClass(quoteAge, 10 * 60_000, 30 * 60_000)}`.trim();
      }

      const catalogAge = state.catalogSavedAt === null ? null : now - state.catalogSavedAt;
      setText(
        catalogPill.label,
        state.catalogSavedAt === null
          ? 'Catalog missing'
          : `Catalog ${formatRelative(state.catalogSavedAt, now)}`,
      );
      catalogPill.dot.className = `pill__dot ${dotClass(
        catalogAge,
        25 * 60 * 60_000,
        48 * 60 * 60_000,
      )}`.trim();
    },
  };
}
