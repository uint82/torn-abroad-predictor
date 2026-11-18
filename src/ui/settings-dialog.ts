import type { PriceBasis, SaleChannel, Settings, TravelMethod } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import { TRAVEL_METHOD_LABELS } from '../domain/destinations';
import { el } from './dom';
import { createDialogShell } from './dialog-shell';

export interface SettingsDialogActions {
  onSave: (settings: Settings) => void;
}

export interface SettingsDialogView {
  element: HTMLDialogElement;
  open(settings: Settings): void;
}

const CHANNEL_LABELS: Record<SaleChannel, string> = {
  'item-market': 'Item market (5% fee)',
  bazaar: 'Bazaar (no fee)',
  custom: 'Custom fee',
};

const PRICE_BASIS_LABELS: Record<PriceBasis, string> = {
  average: 'Average listing',
  lowest: 'Lowest listing',
};

function field(label: string, control: HTMLElement, hint?: string): HTMLLabelElement {
  return el('label', { className: 'field' }, [
    el('span', { className: 'field__label', text: label }),
    control,
    hint ? el('span', { className: 'field__hint', text: hint }) : null,
  ]);
}

function toggleField(label: string, input: HTMLInputElement): HTMLLabelElement {
  return el('label', { className: 'field field--inline' }, [
    el('span', { className: 'field__label', text: label }),
    input,
  ]);
}

function numberInput(name: string, min: number, max: number, step = 1): HTMLInputElement {
  return el('input', {
    className: 'input',
    attrs: { type: 'number', name, min, max, step, required: true },
  });
}

function select(name: string): HTMLSelectElement {
  return el('select', { className: 'select', attrs: { name } });
}

function options<T extends string>(element: HTMLSelectElement, labels: Record<T, string>): void {
  for (const [value, label] of Object.entries(labels) as [string, string][]) {
    element.append(el('option', { text: label, attrs: { value } }));
  }
}

export function createSettingsDialog(actions: SettingsDialogActions): SettingsDialogView {
  const method = select('method');
  options<TravelMethod>(method, TRAVEL_METHOD_LABELS);
  const capacity = numberInput('capacity', 1, 43);
  const book = el('input', { attrs: { type: 'checkbox', name: 'book' } });
  const ticket = numberInput('businessTicketCost', 0, 100_000_000, 1000);

  const channel = select('channel');
  options<SaleChannel>(channel, CHANNEL_LABELS);
  const fee = numberInput('customFeePercent', 0, 100, 0.1);
  const priceBasis = select('priceBasis');
  options<PriceBasis>(priceBasis, PRICE_BASIS_LABELS);
  const wait = numberInput('waitMinutes', 0, 1440);
  const predicted = el('input', {
    attrs: { type: 'checkbox', name: 'includePredictedStock' },
  });

  const travel = el('div', { className: 'form-section' }, [
    el('div', { className: 'form-section__title', text: 'Travel' }),
    el('div', { className: 'form-grid' }, [
      field('Method', method, 'Airstrip and WLT flights are free. Business uses your ticket cost.'),
      field('Suitcase capacity', capacity, 'Base is 28. A large suitcase raises it to 43.'),
      field('Business ticket cost', ticket, 'Total paid for the round trip, in dollars.'),
      toggleField('Mailing Yourself Abroad', book),
    ]),
  ]);

  const selling = el('div', { className: 'form-section' }, [
    el('div', { className: 'form-section__title', text: 'Selling and timing' }),
    el('div', { className: 'form-grid' }, [
      field('Sale channel', channel, 'The fee is taken from the sale price.'),
      field('Custom fee percent', fee, 'Used only with a custom sale channel.'),
      field('Market price to use', priceBasis, 'Lowest listing is usually easier to beat.'),
      field('Extra waiting minutes', wait, 'Time spent waiting for a restock or a buyer.'),
    ]),
  ]);

  const estimation = el('div', { className: 'form-section' }, [
    el('div', { className: 'form-section__title', text: 'Estimates' }),
    toggleField('Include predicted stock in the basket', predicted),
    el('p', {
      className: 'field__hint',
      text: 'When enabled, the basket can use stock expected to restock before you land.',
    }),
  ]);

  const form = el('form', { className: 'dialog__body', attrs: { id: 'settings-form' } }, [
    travel,
    selling,
    estimation,
  ]);

  const reset = el('button', {
    className: 'btn btn--ghost',
    text: 'Reset defaults',
    attrs: { type: 'button' },
  });
  const cancel = el('button', {
    className: 'btn btn--ghost',
    text: 'Cancel',
    attrs: { type: 'button' },
  });
  const save = el('button', {
    className: 'btn btn--accent',
    text: 'Save settings',
    attrs: { type: 'submit', form: 'settings-form' },
  });
  const footer = el('div', { className: 'dialog__footer' }, [
    reset,
    el('span', { className: 'dialog__footer-spacer' }),
    cancel,
    save,
  ]);

  const shell = createDialogShell({
    title: 'Trip settings',
    subtitle: 'These values feed the profit math. They are saved in this browser.',
    body: form,
    footer,
  });

  const syncFee = (): void => {
    if (channel.value === 'item-market') {
      fee.value = '5';
      fee.disabled = true;
    } else if (channel.value === 'bazaar') {
      fee.value = '0';
      fee.disabled = true;
    } else {
      fee.disabled = false;
      if (fee.value === '') {
        fee.value = '5';
      }
    }
  };
  channel.addEventListener('change', syncFee);

  const apply = (settings: Settings): void => {
    method.value = settings.method;
    capacity.value = String(settings.capacity);
    book.checked = settings.book;
    ticket.value = String(settings.businessTicketCost);
    channel.value = settings.channel;
    fee.value = String(settings.customFeePercent);
    priceBasis.value = settings.priceBasis;
    wait.value = String(settings.waitMinutes);
    predicted.checked = settings.includePredictedStock;
    syncFee();
  };

  const read = (): Settings => ({
    method: method.value as TravelMethod,
    capacity: capacity.valueAsNumber,
    book: book.checked,
    businessTicketCost: ticket.valueAsNumber,
    channel: channel.value as SaleChannel,
    customFeePercent: fee.valueAsNumber,
    priceBasis: priceBasis.value as PriceBasis,
    waitMinutes: wait.valueAsNumber,
    includePredictedStock: predicted.checked,
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    actions.onSave(read());
    shell.close();
  });
  reset.addEventListener('click', () => apply(DEFAULT_SETTINGS));
  cancel.addEventListener('click', () => shell.close());

  return {
    element: shell.dialog,
    open(settings) {
      apply(settings);
      if (!shell.dialog.open) {
        shell.dialog.showModal();
      }
      method.focus();
    },
  };
}
