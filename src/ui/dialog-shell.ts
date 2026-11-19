import { el } from './dom';
import { icon } from './icons';

export interface DialogShellOptions {
  title: string;
  subtitle?: string;
  body: HTMLElement;
  footer?: HTMLElement;
}

export interface DialogShell {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  close: () => void;
}

export function createDialogShell(options: DialogShellOptions): DialogShell {
  const title = el('h2', { className: 'dialog__title', text: options.title });
  const subtitle = el('p', { className: 'dialog__subtitle', text: options.subtitle ?? '' });
  const closeButton = el(
    'button',
    {
      className: 'icon-btn dialog__close',
      title: 'Close',
      attrs: { type: 'button', 'aria-label': 'Close dialog' },
    },
    [icon('close')],
  );
  const dialog = el('dialog', { className: 'dialog' }, [
    el('div', { className: 'dialog__header' }, [el('div', {}, [title, subtitle]), closeButton]),
    options.body,
    options.footer ?? el('div', { className: 'dialog__footer' }, []),
  ]);

  const close = () => dialog.close();
  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      close();
    }
  });

  return { dialog, title, subtitle, body: options.body, footer: options.footer ?? dialog, close };
}
