import type { AppState } from '../state/app-state';
import { el, setHidden, setText } from './dom';
import { icon } from './icons';
import { createDialogShell } from './dialog-shell';

export interface KeyDialogResult {
  ok: boolean;
  message: string | null;
}

export interface KeyDialogActions {
  onSave: (key: string) => Promise<KeyDialogResult>;
  onRemove: () => void;
}

export interface KeyDialogView {
  element: HTMLDialogElement;
  open(state: AppState): void;
  update(state: AppState): void;
}

const TORN_KEY_PAGE = 'https://www.torn.com/preferences.php#tab=api';

export function createKeyDialog(actions: KeyDialogActions): KeyDialogView {
  const input = el('input', {
    className: 'input',
    attrs: {
      type: 'password',
      name: 'api-key',
      placeholder: 'Paste your Torn API key',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'Torn API key',
    },
  });
  const reveal = el(
    'button',
    {
      className: 'icon-btn',
      title: 'Show key',
      attrs: { type: 'button', 'aria-label': 'Show API key' },
    },
    [icon('eye')],
  );

  const status = el('div', { className: 'status', attrs: { role: 'status' } });
  const statusText = el('span');
  status.append(el('span', { className: 'status__message' }, [statusText]));
  status.hidden = true;

  const form = el('form', { className: 'field' }, [
    el('span', { className: 'field__label', text: 'API key' }),
    el('div', { className: 'field__row' }, [input, reveal]),
    el('span', {
      className: 'field__hint',
      text: 'Use a full access key. Market data needs the market permission.',
    }),
  ]);

  const privacy = el('ul', { className: 'privacy-list' }, [
    el('li', {}, [
      el('strong', { text: 'Stored' }),
      el('span', { text: 'In this browser only, under this site origin.' }),
    ]),
    el('li', {}, [
      el('strong', { text: 'Sent' }),
      el('span', { text: 'Only to api.torn.com, as the Authorization header.' }),
    ]),
    el('li', {}, [
      el('strong', { text: 'Removed' }),
      el('span', { text: 'From the Remove key button here, any time.' }),
    ]),
  ]);

  const body = el('div', { className: 'dialog__body' }, [
    form,
    status,
    privacy,
    el('a', {
      text: 'Create or manage API keys on Torn',
      attrs: { href: TORN_KEY_PAGE, target: '_blank', rel: 'noreferrer noopener' },
    }),
  ]);

  const cancel = el('button', {
    className: 'btn btn--ghost',
    text: 'Cancel',
    attrs: { type: 'button' },
  });
  const save = el('button', {
    className: 'btn btn--accent',
    text: 'Save key',
    attrs: { type: 'submit', form: 'key-form' },
  });
  const remove = el('button', {
    className: 'btn btn--danger',
    text: 'Remove key',
    attrs: { type: 'button' },
  });
  const footer = el('div', { className: 'dialog__footer' }, [
    remove,
    el('span', { className: 'dialog__footer-spacer' }),
    cancel,
    save,
  ]);

  const shell = createDialogShell({ title: 'Torn API key', body, footer });
  form.id = 'key-form';

  let current = '';
  let saving = false;

  const showStatus = (kind: 'loading' | 'error' | 'success', message: string) => {
    status.hidden = false;
    status.className = `status status--${kind}`;
    setText(statusText, message);
  };

  reveal.addEventListener('click', () => {
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    reveal.replaceChildren(icon(visible ? 'eye' : 'eyeOff'));
    reveal.title = visible ? 'Show key' : 'Hide key';
    reveal.setAttribute('aria-label', visible ? 'Show API key' : 'Hide API key');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    const key = input.value.trim();
    if (key === '') {
      if (current !== '') {
        shell.close();
      } else {
        showStatus('error', 'Enter a Torn API key first.');
      }
      return;
    }
    saving = true;
    save.disabled = true;
    remove.disabled = true;
    showStatus('loading', 'Checking the key with Torn...');
    const result = await actions.onSave(key);
    saving = false;
    save.disabled = false;
    remove.disabled = false;
    if (result.ok) {
      input.value = '';
      showStatus('success', 'Key accepted. Live quotes are loading.');
      window.setTimeout(() => shell.close(), 700);
    } else {
      showStatus('error', result.message ?? 'Torn rejected the key. Check it and try again.');
    }
  });

  cancel.addEventListener('click', () => shell.close());
  remove.addEventListener('click', () => {
    actions.onRemove();
    shell.close();
  });

  return {
    element: shell.dialog,
    open(state) {
      current = state.apiKey;
      input.value = '';
      input.type = 'password';
      reveal.replaceChildren(icon('eye'));
      status.hidden = true;
      save.disabled = false;
      remove.disabled = false;
      setHidden(remove, state.apiKey === '');
      if (!shell.dialog.open) {
        shell.dialog.showModal();
      }
      input.focus();
    },
    update(state) {
      current = state.apiKey;
      setHidden(remove, state.apiKey === '');
    },
  };
}
