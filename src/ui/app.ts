import type { CountryCode } from '../core/types';
import type { AppState } from '../state/app-state';
import type { Store } from '../state/store';
import type { DataService } from '../state/data-service';
import { selectPlan, selectRow, selectRows, selectVisibleRows } from '../state/selectors';
import { buildSearch, parseUrlState, replaceUrlState } from './url-state';
import { el } from './dom';
import { createHeader } from './header';
import { createOnboarding } from './onboarding';
import { createStatus } from './status';
import { createOverview } from './overview';
import { createCountryPanel } from './country-panel';
import { createFooter } from './footer';
import { createKeyDialog } from './key-dialog';
import { createSettingsDialog } from './settings-dialog';
import { createItemDialog } from './item-dialog';

export interface AppOptions {
  root: HTMLElement;
  store: Store<AppState>;
  service: DataService;
}

export interface App {
  destroy(): void;
}

const CLOCK_INTERVAL_MS = 30_000;

export function createApp(options: AppOptions): App {
  const { root, store, service } = options;
  const settingsDialog = createSettingsDialog({
    onSave: (settings) => service.updateSettings(settings),
  });

  const keyDialog = createKeyDialog({
    onSave: async (key) => {
      await service.saveKey(key);
      const state = store.get();
      return {
        ok: state.keyStatus === 'valid',
        message: state.keyMessage,
      };
    },
    onRemove: () => service.removeKey(),
  });

  const header = createHeader({
    onKey: () => keyDialog.open(store.get()),
    onSettings: () => settingsDialog.open(store.get().settings),
    onRefresh: () => void service.refreshAll(true),
  });

  const onboarding = createOnboarding({
    onKey: () => keyDialog.open(store.get()),
    onSettings: () => settingsDialog.open(store.get().settings),
    onRetry: () => void service.refreshAll(true),
  });

  const status = createStatus({ onDismiss: () => service.dismissNotice() });

  const selectCountry = (country: CountryCode): void => {
    void service.setCountry(country).then(() => {
      panel.element.scrollIntoView({ block: 'start' });
    });
  };

  const overview = createOverview({ onSelect: selectCountry });

  const panel = createCountryPanel({
    onFilters: (filters) => service.setFilters(filters),
    onSelectItem: (itemId) => service.selectItem(itemId),
    onSort: (sort) => service.setFilters({ ...store.get().filters, sort }),
    onKey: () => keyDialog.open(store.get()),
    onRefresh: () => void service.refreshAll(true),
  });

  const footer = createFooter();

  const itemDialog = createItemDialog();
  itemDialog.element.addEventListener('close', () => {
    if (store.get().selectedItemId !== null) {
      service.selectItem(null);
    }
  });

  const layout = el('div', { className: 'app' }, [
    header.element,
    el('main', { className: 'main' }, [
      el('div', { className: 'container' }, [
        onboarding.element,
        status.element,
        overview.element,
        panel.element,
      ]),
    ]),
    footer.element,
  ]);

  root.replaceChildren(layout, keyDialog.element, settingsDialog.element, itemDialog.element);

  const syncUrl = (state: AppState): void => {
    const search = buildSearch({ country: state.country, filters: state.filters });
    if (search !== window.location.search) {
      replaceUrlState({ country: state.country, filters: state.filters });
    }
  };

  const render = (state: AppState): void => {
    const now = Date.now();
    header.update(state, now);
    onboarding.update(state);
    status.update(state);
    overview.update(state, now);
    panel.update(state, now);
    footer.update(state, now);
    keyDialog.update(state);

    const rows = selectRows(state, now);
    const selected = selectRow(state, rows);
    if (selected) {
      const visible = selectVisibleRows(state, now);
      itemDialog.open(selected, selectPlan(state, visible), now);
    } else if (itemDialog.isOpen()) {
      itemDialog.close();
    }

    syncUrl(state);
  };

  const unsubscribe = store.subscribe(render);

  const onPopState = (): void => {
    const url = parseUrlState(window.location.search);
    service.setFilters(url.filters);
    void service.setCountry(url.country);
  };
  window.addEventListener('popstate', onPopState);

  const clock = window.setInterval(() => {
    const state = store.get();
    const now = Date.now();
    header.update(state, now);
    footer.update(state, now);
  }, CLOCK_INTERVAL_MS);

  render(store.get());

  return {
    destroy() {
      unsubscribe();
      window.removeEventListener('popstate', onPopState);
      window.clearInterval(clock);
    },
  };
}
