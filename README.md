# Torn Abroad Predictor

Torn Abroad Predictor is a client-side profit planner for Torn City travel. It compares abroad shop prices with market prices, tracks stock and restocks from YATA, and estimates the profit of a shopping trip after fees, flight cost, and suitcase space.

The planner runs in the browser and needs no account. An API key is optional. A small collector can keep shared stock history and improve forecasts across devices. The collector runs on a VPS with SQLite or on a free Cloudflare Worker with D1.

## Features

- Rank all 11 destinations by estimated profit per hour.
- Compare item shop prices with live item market quotes or cached catalog prices.
- Estimate current stock, sell rate, the next restock window in TCT, and the chance of stock at arrival.
- Build a suitcase-sized basket using profit per unit and predicted availability.
- Adjust travel method, suitcase capacity, sale channel, fees, price basis, and waiting time.
- Keep catalog, stock, and price history in local storage so a reload is not a cold start.
- Use an optional collector for up to 30 days of stock history instead of 24 hours of local history.
- Work without an API key using YATA stock and catalog prices.

## How it works

1. The Torn item catalog supplies item names, types, shop prices, and fallback market prices.
2. YATA supplies current abroad stock for every country.
3. If a collector URL is configured, the collector supplies up to 30 days of stock changes collected from YATA.
4. When a key is present, Torn item market listings supply live quotes for the selected country.
5. The domain layer combines those sources into item rows, forecasts stock at arrival and restock timing, and scores a trip.
6. The UI renders the ranked destinations, the selected country basket, and item details.

The stock forecast is a model, not a guarantee. It learns sell rate, restock size, sellout duration, and the lag between a sellout and the next restock from recorded YATA snapshots. Local snapshots cover 24 hours. A collector extends that to 30 days. Restock times use the measured lag when there are at least two restock lags; otherwise they fall back to half the median sellout duration. The forecast reports a plausible restock window and the chance that stock is available at arrival. Without local or remote history, the first visits rely on current stock only.

See `docs/architecture.md`, `docs/data-sources.md`, `docs/prediction.md`, and `docs/collector.md` for details.

## Development

Requirements: Node.js 22.13 or newer and npm.

```bash
npm install
npm run dev
```

The dev server starts on `http://localhost:5173`. To run the collector locally, start it in one terminal:

```bash
npm run server
```

Then start the dev server in another terminal with the collector URL:

```bash
VITE_COLLECTOR_URL=http://localhost:8787 npm run dev
```

`npm run server` builds the collector and starts it on port 8787. Set `VITE_COLLECTOR_URL` in `.env.local` instead of the shell if you prefer. Without the variable, the site uses local history only.

Useful commands:

| Command                  | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `npm run dev`            | Start the Vite dev server.                    |
| `npm run build`          | Build the static site into `dist/`.           |
| `npm run preview`        | Preview the production build.                 |
| `npm run server`         | Build and start the Node stock collector.     |
| `npm run server:build`   | Build the Node collector into `dist-server/`. |
| `npm run server:start`   | Run the built Node collector.                 |
| `npm run worker:dev`     | Run the Cloudflare Worker locally.            |
| `npm run worker:build`   | Build the Worker without deploying.           |
| `npm run worker:deploy`  | Deploy the Worker.                            |
| `npm run worker:migrate` | Apply D1 migrations to the remote database.   |
| `npm run typecheck`      | Typecheck the site, server, and Worker.       |
| `npm run lint`           | Run ESLint.                                   |
| `npm run format`         | Format files with Prettier.                   |
| `npm test`               | Run the Vitest suite once.                    |
| `npm run coverage`       | Run tests with a coverage report.             |

Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run server:build`, and `npm run worker:build` before opening a pull request.

## Optional collector

The collector polls the YATA travel export once per minute, stores stock changes, and serves history through a small read-only API. It needs no Torn API key. The browser merges that history with its local snapshots, then runs the same forecast as before.

The Node version keeps SQLite on disk:

```bash
npm run server
```

| Variable           | Default             | Use                                     |
| ------------------ | ------------------- | --------------------------------------- |
| `PORT`             | `8787`              | HTTP port.                              |
| `HOST`             | `0.0.0.0`           | Bind address.                           |
| `DATABASE_PATH`    | `data/stock.sqlite` | SQLite file.                            |
| `POLL_INTERVAL_MS` | `60000`             | YATA poll interval, 30 seconds minimum. |
| `RETENTION_DAYS`   | `90`                | Stored history, 7 to 365 days.          |

The Cloudflare version uses a Worker, cron triggers, and D1:

```bash
npx wrangler login
npx wrangler d1 create torn-abroad-stock
```

Put the printed database id into `wrangler.jsonc`, then run:

```bash
npm run worker:migrate
npm run worker:deploy
```

The API exposes `GET /api/v1/health` and `GET /api/v1/observations?country=jap&days=30`. Clients can add `since` to fetch only the missing tail of the window. The observations response is keyed by item ID and contains change timestamps and quantities. It does not contain forecasts. See `docs/collector.md` for the API contract, storage model, free-tier limits, and deployment notes.

## API key and privacy

A Torn API key unlocks live item market prices. The key is stored in `localStorage` under this site origin and sent only to `api.torn.com` as the `Authorization` header. It is never sent to YATA or any other host.

A public access or limited key is enough. A custom key must include the market selection for live item prices. The key validation step uses the Torn API.

Open the key dialog in the app to remove the stored key at any time. See `PRIVACY.md` for the full disclosure.

## Troubleshooting

If the app says it cannot reach `api.torn.com`, the browser or a content blocker stopped the request. Open the browser console and check for a CORS or `NetworkError` message, then allow the site in any blocker or privacy extension. Torn allows cross-origin requests from `localhost` and GitHub Pages, so `localhost` by itself is not the cause. If the message names `yata.yt`, Torn is reachable and the stock source is the problem.

## Deployment

`npm run build` produces a static site. The Vite base path is relative, so `dist/` can be served from a subdirectory, GitHub Pages, Vercel, or any static host.

Browser-only mode needs no server-side environment variables. To use shared history, build with `VITE_COLLECTOR_URL` set to the collector origin.

A free deployment can put the static site on Vercel and the collector on Cloudflare Workers with D1. Vercel only serves assets. The Worker runs the API and the minute cron. Cloudflare's free tier is enough for personal traffic, but D1 daily limits hard-fail until midnight UTC, so treat the collector as best effort. See `docs/collector.md`.

The collector API is read-only and allows cross-origin reads. A Worker is HTTPS by default. For the Node server, terminate TLS at a reverse proxy when the site uses HTTPS.

## Project layout

```text
src/
  api/        Torn, YATA, and collector clients, schemas, HTTP handling
  core/       Shared types, defaults, errors, JSON guards
  domain/     Destinations, item groups, profit, prediction
  state/      Store, selectors, cache orchestration
  storage/    Local storage adapter and persistence
  styles/     SCSS tokens, layout, components, utilities
  ui/         DOM views and dialogs
server/       Optional stock collector, API core, SQLite store, Node adapter
worker/       Cloudflare Worker adapter, D1 store, cron entry points
migrations/   D1 schema migrations
tests/        Vitest unit tests
docs/         Architecture, data, prediction, and collector notes
```

## Data sources and attribution

- [Torn API](https://www.torn.com/api.html)
- [YATA travel stock API](https://yata.yt/api/v1/travel/export/)
- YATA export data is collected by the optional self-hosted collector described in `docs/collector.md`.

Torn Abroad Predictor is not affiliated with Torn City or YATA. Prices and stock are estimates and can change while you travel. Check the game before spending.

## License

MIT. See `LICENSE`.
