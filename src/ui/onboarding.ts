import type { AppState } from '../state/app-state';
import { el, setHidden, setText } from './dom';
import { icon } from './icons';

export interface OnboardingActions {
  onKey: () => void;
  onSettings: () => void;
  onRetry: () => void;
}

export interface OnboardingView {
  element: HTMLElement;
  update(state: AppState): void;
}

const POINTS = [
  {
    title: 'Live shop stock',
    text: 'YATA reports what is on the shelves right now, refreshed every minute.',
  },
  {
    title: 'Real sale prices',
    text: 'Live item market quotes when a key is present, catalog prices as a fallback.',
  },
  {
    title: 'Trip math included',
    text: 'Flight time, ticket cost, market fees, and suitcase space are part of every plan.',
  },
];

function actionButton(label: string, accent: boolean, onClick: () => void): HTMLButtonElement {
  return el(
    'button',
    {
      className: `btn${accent ? ' btn--accent' : ' btn--ghost'}`,
      attrs: { type: 'button' },
      on: { click: onClick },
    },
    [label],
  );
}

function externalButton(label: string, href: string): HTMLAnchorElement {
  return el(
    'a',
    {
      className: 'btn btn--ghost',
      attrs: { href, target: '_blank', rel: 'noreferrer noopener' },
    },
    [label, icon('external', 15)],
  );
}

function createPoints(): HTMLElement {
  return el(
    'div',
    { className: 'hero__points' },
    POINTS.map((point, index) =>
      el('div', { className: 'hero__point' }, [
        el('span', { className: 'hero__point-index', text: String(index + 1) }),
        el('span', {}, [el('strong', { text: point.title }), document.createTextNode(point.text)]),
      ]),
    ),
  );
}

export function createOnboarding(actions: OnboardingActions): OnboardingView {
  const title = el('h1', { className: 'hero__title' });
  const lead = el('p', { className: 'hero__lead' });
  const actionRow = el('div', { className: 'hero__actions' });
  const points = createPoints();

  const element = el('section', { className: 'hero' }, [
    el('div', { className: 'hero__grid' }, [el('div', {}, [title, lead, actionRow]), points]),
  ]);

  return {
    element,
    update(state) {
      const needsCatalog = state.catalog.length === 0;
      setHidden(element, !needsCatalog);
      if (!needsCatalog) {
        return;
      }

      if (state.keyStatus === 'missing') {
        setText(title, 'Know what to buy before you board.');
        setText(
          lead,
          'Compare abroad shop stock with Torn market prices, then fly with a basket that pays for the trip. Add a Torn API key for live quotes, or explore with the cached catalog.',
        );
        actionRow.replaceChildren(
          actionButton('Add API key', true, actions.onKey),
          actionButton('Trip settings', false, actions.onSettings),
        );
        return;
      }

      if (state.keyStatus === 'invalid') {
        setText(title, 'That API key was rejected.');
        setText(
          lead,
          state.keyMessage ??
            'Torn did not accept the key. Check that it is a full access key with market permissions, then try again.',
        );
        actionRow.replaceChildren(
          actionButton('Replace API key', true, actions.onKey),
          externalButton('Torn API settings', 'https://www.torn.com/preferences.php#tab=api'),
        );
        return;
      }

      setText(title, 'Loading the item catalog.');
      setText(
        lead,
        'Torn is returning item prices and shop data. This usually takes a few seconds on the first load.',
      );
      actionRow.replaceChildren(
        state.catalogStatus === 'error'
          ? actionButton('Try again', true, actions.onRetry)
          : el('span', { className: 'badge badge--info', text: 'Fetching catalog' }),
        actionButton('Trip settings', false, actions.onSettings),
      );
    },
  };
}
