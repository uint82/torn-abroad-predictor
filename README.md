# Torn Abroad Predictor

Torn Abroad Predictor is a client-side profit planner for Torn City travel. It compares abroad shop prices with market prices, tracks stock and restocks from YATA, and estimates the profit of a shopping trip after fees, flight cost, and suitcase space.

The app runs entirely in the browser. No backend is required, and an API key is optional.

## Features

- Rank all 11 destinations by estimated profit per hour.
- Compare item shop prices with live item market quotes or cached catalog prices.
- Estimate current stock, sell rate, and the next restock at arrival.
- Build a suitcase-sized basket using profit per unit and predicted availability.
- Adjust travel method, suitcase capacity, sale channel, fees, price basis, and waiting time.
- Keep catalog, stock, and price history in local storage so a reload is not a cold start.
- Work without an API key using YATA stock and catalog prices.

## How it works

1. The Torn item catalog supplies item names, types, shop prices, and fallback market prices.
2. YATA supplies current abroad stock for every country.
3. When a key is present, Torn item market listings supply live quotes for the selected country.
4. The domain layer combines those sources into item rows, forecasts stock at arrival, and scores a trip.
5. The UI renders the ranked destinations, the selected country basket, and item details.

The stock forecast is a simple model, not a guarantee. It learns sell rate and restock size from recorded YATA snapshots, then simulates 15-minute restock ticks over the flight time. A cold start has no history, so the first visits rely on current stock only.

See `docs/architecture.md`, `docs/data-sources.md`, and `docs/prediction.md` for details.

## Development

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run dev
```

The dev server starts on `http://localhost:5173`.

Useful commands:

| Command             | Purpose                                |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Start the Vite dev server.             |
| `npm run build`     | Build the static site into `dist/`.    |
| `npm run preview`   | Preview the production build.          |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm run lint`      | Run ESLint.                            |
| `npm run format`    | Format files with Prettier.            |
| `npm test`          | Run the Vitest suite once.             |
| `npm run coverage`  | Run tests with a coverage report.      |

Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before opening a pull request.

## API key and privacy

A Torn API key unlocks live item market prices. The key is stored in `localStorage` under this site origin and sent only to `api.torn.com` as the `Authorization` header. It is never sent to YATA or any other host.

A public access or limited key is enough. A custom key must include the market selection for live item prices. The key validation step uses the Torn API.

Open the key dialog in the app to remove the stored key at any time. See `PRIVACY.md` for the full disclosure.

## Troubleshooting

If the app says it cannot reach `api.torn.com`, the browser or a content blocker stopped the request. Open the browser console and check for a CORS or `NetworkError` message, then allow the site in any blocker or privacy extension. Torn allows cross-origin requests from `localhost` and GitHub Pages, so `localhost` by itself is not the cause. If the message names `yata.yt`, Torn is reachable and the stock source is the problem.

## Deployment

`npm run build` produces a static site. The Vite base path is relative, so `dist/` can be served from a subdirectory such as GitHub Pages.

For GitHub Pages, publish the `dist` directory from a workflow or a `gh-pages` branch. No server-side environment variables are needed.

## Project layout

```text
src/
  api/        Torn and YATA clients, schemas, HTTP handling
  core/       Shared types, defaults, errors, JSON guards
  domain/     Destinations, item groups, profit, prediction
  state/      Store, selectors, cache orchestration
  storage/    Local storage adapter and persistence
  styles/     SCSS tokens, layout, components, utilities
  ui/         DOM views and dialogs
tests/        Vitest unit tests
docs/         Architecture, data, and prediction notes
```

## Data sources and attribution

- [Torn API](https://www.torn.com/api.html)
- [YATA travel stock API](https://yata.yt/api/v1/travel/export/)

Torn Abroad Predictor is not affiliated with Torn City or YATA. Prices and stock are estimates and can change while you travel. Check the game before spending.

## License

MIT. See `LICENSE`.
