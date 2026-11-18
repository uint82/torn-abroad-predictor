import type { AppState } from '../state/app-state';
import { el, setHidden } from './dom';
import { icon } from './icons';

export interface StatusActions {
  onDismiss: () => void;
}

export interface StatusView {
  element: HTMLElement;
  update(state: AppState): void;
}

export function createStatus(actions: StatusActions): StatusView {
  const message = el('span');
  const close = el(
    'button',
    {
      className: 'status__close',
      title: 'Dismiss',
      attrs: { type: 'button', 'aria-label': 'Dismiss message' },
      on: { click: actions.onDismiss },
    },
    [icon('close', 14)],
  );
  const element = el(
    'div',
    {
      className: 'status',
      attrs: { role: 'status', 'aria-live': 'polite' },
    },
    [el('span', { className: 'status__message' }, [message]), close],
  );

  return {
    element,
    update(state) {
      const text = state.error ?? state.notice;
      setHidden(element, text === null);
      if (text === null) {
        return;
      }
      const isError = state.error !== null;
      element.className = `status ${isError ? 'status--error' : 'status--warning'}`;
      message.replaceChildren(
        icon(isError ? 'warning' : 'info', 16),
        document.createTextNode(text),
      );
      close.title = isError ? 'Dismiss error' : 'Dismiss notice';
    },
  };
}
