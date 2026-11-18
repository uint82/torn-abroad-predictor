import './styles/main.scss';
import { createStorageAdapter, getDefaultBackend } from './storage/storage';
import { loadApiKey, loadSettings } from './storage/settings';
import { loadCatalogCache, loadStockCache, STOCK_MAX_AGE_MS } from './storage/cache';
import { loadHistories } from './storage/history';
import { createInitialState } from './state/app-state';
import { Store } from './state/store';
import { DataService } from './state/data-service';
import { parseUrlState } from './ui/url-state';
import { createApp } from './ui/app';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('App root not found');
}

const now = Date.now();
const storage = createStorageAdapter(getDefaultBackend());
const url = parseUrlState(window.location.search);
const stockCache = loadStockCache(storage, now);
const state = createInitialState({
  settings: loadSettings(storage),
  filters: url.filters,
  apiKey: loadApiKey(storage),
  catalog: loadCatalogCache(storage, now),
  stock: stockCache !== null && now - stockCache.savedAt <= STOCK_MAX_AGE_MS ? stockCache : null,
  histories: loadHistories(storage, now),
  country: url.country,
});

const store = new Store(state);
const service = new DataService({ store, storage });

createApp({ root, store, service });
service.start();
