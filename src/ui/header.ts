import type { AppState, KeyStatus } from '../state/app-state';
import { el, setText } from './dom';
import { createLogo, icon } from './icons';
import { formatRelative } from './format';

export interface HeaderActions {
  onKey: () => void;
  onSettings: () => void;
  onRefresh: () => void;
}

export interface HeaderView {
  element: HTMLElement;
  update(state: AppState, now: number): void;
}

const KEY_LABELS: Record<KeyStatus, string> = {
  missing: 'Add API key',
  unchecked: 'Key saved',
  checking: 'Checking key',
  valid: 'Key active',
  invalid: 'Key invalid',
};

const KEY_DOTS: Record<KeyStatus, string> = {
  missing: '',
  unchecked: 'pill__dot--stale',
  checking: 'pill__dot--stale',
  valid: 'pill__dot--live',
  invalid: 'pill__dot--down',
};

export function createHeader(actions: HeaderActions): HeaderView {
  const keyDot = el('span', { className: 'pill__dot' });
  const keyLabel = el('span');
  const keyButton = el(
    'button',
    {
      className: 'btn btn--ghost',
      attrs: { type: 'button' },
      on: { click: actions.onKey },
    },
    [icon('key'), keyLabel, keyDot],
  );

  const refreshIcon = icon('refresh');
  const refreshLabel = el('span', { text: 'Refresh' });
  const refreshButton = el(
    'button',
    {
      className: 'btn btn--ghost',
      attrs: { type: 'button' },
      on: { click: actions.onRefresh },
    },
    [refreshIcon, refreshLabel],
  );

  const settingsButton = el(
    'button',
    {
      className: 'icon-btn',
      title: 'Trip settings',
      attrs: { type: 'button', 'aria-label': 'Trip settings' },
      on: { click: actions.onSettings },
    },
    [icon('settings')],
  );

  const brand = el(
    'a',
    { className: 'topbar__brand', attrs: { href: './', 'aria-label': 'Torn Abroad Predictor' } },
    [
      createLogo(),
      el('span', {}, [
        el('span', { className: 'brand-name', text: 'Torn Abroad Predictor' }),
        el('span', { className: 'brand-tagline', text: 'Travel profit planner' }),
      ]),
    ],
  );

  const element = el('header', { className: 'topbar' }, [
    el('div', { className: 'container topbar__inner' }, [
      brand,
      el('div', { className: 'topbar__actions' }, [keyButton, refreshButton, settingsButton]),
    ]),
  ]);

  return {
    element,
    update(state, now) {
      setText(keyLabel, KEY_LABELS[state.keyStatus]);
      keyDot.className = `pill__dot ${KEY_DOTS[state.keyStatus]}`.trim();
      keyButton.title =
        state.keyStatus === 'invalid'
          ? (state.keyMessage ?? 'The API key was rejected.')
          : state.keyStatus === 'valid'
            ? 'API key is stored in this browser'
            : 'Add your Torn API key for live market quotes';
      const busy =
        state.stockStatus === 'loading' ||
        state.catalogStatus === 'loading' ||
        state.quoteStatus === 'loading';
      refreshButton.disabled = busy;
      refreshIcon.classList.toggle('is-spinning', busy);
      setText(refreshLabel, busy ? 'Refreshing' : 'Refresh');
      refreshButton.title =
        state.lastUpdatedAt === null
          ? 'Fetch the latest data'
          : `Last updated ${formatRelative(state.lastUpdatedAt, now)}`;
    },
  };
}
