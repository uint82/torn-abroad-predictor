# Architecture

The app is a static Vite site with no server component. Data fetching, storage, scoring, and rendering all run in the browser.

## Layers

| Layer         | Responsibility                                                              |
| ------------- | --------------------------------------------------------------------------- |
| `src/core`    | Shared types, defaults, error classes, JSON guards.                         |
| `src/api`     | Torn and YATA clients, response schemas, timeouts, rate limiting.           |
| `src/domain`  | Pure calculations: destinations, groups, rows, profit, prediction, restock. |
| `src/storage` | Local storage adapter, settings, cache, and history persistence.            |
| `src/state`   | Store, selectors, quote service, and the data refresh service.              |
| `src/ui`      | DOM construction, dialogs, formatting, URL state.                           |

Dependencies point inward. The domain layer has no DOM or storage imports, which keeps prediction, restock, and profit logic testable in Node.

## Startup flow

1. `src/main.ts` reads settings, the API key, cached catalog, cached stock, and price and stock histories.
2. `createInitialState` turns the loaded data into the first `AppState`.
3. `Store` holds the state and notifies subscribers when an update changes it.
4. `DataService` receives the store and storage adapter.
5. `createApp` builds the views and subscribes to the store.
6. `DataService.start` refreshes stock, catalog, and quotes as needed, then schedules a 60-second tick.

The first render happens before the first network request completes. Cached data fills the page, and loading or error states update in place.

## State flow

`DataService` is the only component that writes application data to the store. Views never fetch data themselves. A view calls a service method, the service updates the store, and the subscription re-renders every view.

`selectRows` builds the full row list for the selected country. `selectVisibleRows` applies the active filters, `selectPlan` scores the basket, and `selectOverview` scores every destination. These selectors are pure and run on each render, which is cheap for a few hundred items.

The store ignores updates when the updater returns the same object reference. This prevents a refresh from re-rendering when nothing changed.

## Refresh policy

| Data            | Freshness  | Behavior                                               |
| --------------- | ---------- | ------------------------------------------------------ |
| Item catalog    | 24 hours   | Loaded once, validated with the key when needed.       |
| Country stock   | 60 seconds | Refreshed on the tick, history recorded on each fetch. |
| Live quotes     | 5 minutes  | Refreshed only for the selected country.               |
| Overview prices | Catalog    | No live quote fan-out for all countries.               |

Quotes are capped at 60 item IDs per refresh and gated at 90 requests per minute to stay under the Torn limit of 100 requests per minute per key. When several quote requests fail, the service keeps catalog prices and shows one notice instead of a stack of errors.

A stock fetch failure keeps the last cached snapshot. A catalog failure keeps the cached catalog if one exists. An invalid key updates the key status, leaves the cached catalog in place, and explains the problem in the key dialog.

## API key lifecycle

The key is read from local storage at startup and stored in `AppState` so the UI can mask and remove it. Saving a key aborts an in-flight catalog check, validates the new key with a catalog request, then requests live quotes. While the key is invalid, automatic refreshes skip catalog and quote requests. A manual refresh may retry once so a paused or jailed key can recover without being re-entered. Removing a key clears the key and quote cache, stops quote refreshes, and keeps the catalog and stock data.

The key is sent only to `api.torn.com` as the `Authorization` header. Requests to YATA never include it.

## Rendering

The UI is built with small DOM factories in `src/ui/dom.ts`. No view uses `innerHTML`, so API content is inserted as text and cannot inject markup. Each view returns an `update` method and owns its element.

Native `<dialog>` elements handle the key, settings, and item dialogs. A dialog is created once and reused. The item dialog follows `selectedItemId` in the store, so URL changes and table clicks share one open and close path.

The URL carries the selected country, group filter, sort key, and stock toggle. The app reads those values at startup and writes them back with `history.replaceState`. Back and forward navigation parses the same format, so a shared link restores the view.

## Failure handling

The API layer wraps network failures, timeouts, malformed responses, and Torn error codes in typed errors. Network messages name the failing host, so a YATA outage is not mistaken for a Torn key problem. The UI shows a short message and keeps whatever data is still usable.

Abort controllers cancel in-flight stock, catalog, and quote requests when the user changes country, saves a key, or stops the service. Aborted requests are ignored rather than reported as failures.

## Testing

The Vitest suite covers schemas, HTTP behavior, rate limiting, storage migration and validation, domain math, prediction edge cases, selectors, and data service orchestration. UI code is verified by type checking and production builds; the view layer intentionally stays thin.
