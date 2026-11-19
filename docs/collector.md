# Stock collector

Browser history is local and limited to 24 hours. The optional stock collector polls YATA once per minute, stores stock changes, and serves up to 90 days of history. The browser still runs the forecast. The collector only supplies observations.

Two deployments share the same collection and API code:

- A Node process with SQLite for local development or a VPS.
- A Cloudflare Worker with D1 for a small free deployment.

Both read YATA's public travel export, so they need no Torn API key and store no user data.

## Run locally with Node

Node.js 22.13 or newer is required because the local store uses `node:sqlite`.

```bash
npm install
npm run server:build
PORT=8787 DATABASE_PATH=./data/stock.sqlite npm run server:start
```

`npm run server` builds and starts in one step. The process creates the database directory when needed.

| Variable           | Default             | Range                   |
| ------------------ | ------------------- | ----------------------- |
| `PORT`             | `8787`              | 1 to 65535              |
| `HOST`             | `0.0.0.0`           | Any bind address        |
| `DATABASE_PATH`    | `data/stock.sqlite` | File path or `:memory:` |
| `POLL_INTERVAL_MS` | `60000`             | 30000 to 900000         |
| `RETENTION_DAYS`   | `90`                | 7 to 365                |

The collector reads the process environment directly. It does not load `.env`; set variables in a service unit, container environment, or shell.

Run one collector per database file. SQLite allows one writer, and a second process would compete for the same WAL.

## Deploy on Cloudflare Workers

The Worker uses the same collection core, API routes, and validation as the Node server. D1 replaces SQLite. Cron triggers replace the in-process timer.

```bash
npx wrangler login
npx wrangler d1 create torn-abroad-stock
```

Copy the `database_id` from the command output into `wrangler.jsonc` and remove the placeholder note. Then apply the schema and deploy:

```bash
npm run worker:migrate
npm run worker:deploy
```

For a local Worker with a local D1 database:

```bash
npm run worker:migrate:local
npm run worker:dev
```

The Worker runs two cron schedules:

- `* * * * *` collects one YATA snapshot.
- `17 3 * * *` prunes history older than `RETENTION_DAYS`.

`wrangler.jsonc` sets `RETENTION_DAYS` to 90. Change it there and redeploy. The cron parser ignores schedules it does not recognise, so adding an unrelated trigger will not start a second collector.

### Free tier limits

Workers Free currently includes 100,000 requests per day, 10 ms of CPU per invocation, and five cron triggers. D1 Free includes 5 million rows read per day, 100,000 rows written per day, 5 GB of storage, and 500 MB per database. Limits change, so check Cloudflare's current pricing before relying on them.

The collector is designed to stay well below the write limit. It stores only state rows that changed and one event per change. A quiet minute costs one poll row. A busy restock can still produce many rows, but the total remains far below the cap at one poll per minute.

Reads are the main risk. The health endpoint reads aggregate counts. The history endpoint reads events for one country and window. Browser requests send `since` after the first successful sync, so a normal refresh reads only the last few minutes instead of 30 days.

Cron invocations can be delayed, and a daily limit hard-fails until midnight UTC. Treat collector uptime as best effort. The browser keeps local history and any remote history already in memory when a request fails.

## Connect the site

Set `VITE_COLLECTOR_URL` when building the static site:

```bash
VITE_COLLECTOR_URL=https://collector.example.com npm run build
```

Vite embeds the value into the built assets, so changing it requires a rebuild. Leave it unset or empty to run without a collector.

The browser requests history after a country change and when the last successful request is older than 5 minutes. The first request asks for the full 30-day window. Later requests send `since` with a 10-minute overlap, which covers clock skew and data that YATA published late. The overlap also prevents a missed boundary from dropping an interval.

Requests contain the country code, day count, and optional `since` timestamp. The Torn API key is never sent to the collector. Remote history is merged with local snapshots and is not written to local storage.

If the collector is unreachable, the browser keeps local history and the rest of the app continues to work.

## API

### `GET /api/v1/health`

Reports collector state without caching.

```json
{
  "status": "ok",
  "dataAgeMs": 42000,
  "lastSuccess": {
    "collectedAt": 1770000000000,
    "finishedAt": 1770000001200,
    "sourceUpdatedAt": 1769999980000,
    "durationMs": 1200,
    "itemCount": 490,
    "changeCount": 12,
    "status": "ok",
    "error": null
  },
  "lastPoll": {},
  "eventCount": 18420,
  "stateCount": 490
}
```

`status` is `starting` before the first poll, `ok` after a successful poll, and `degraded` after a failed poll. `lastPoll` has the same shape as `lastSuccess` and may contain an error message. `dataAgeMs` measures the last successful YATA update time, not the request time.

### `GET /api/v1/observations`

Returns stock changes for one country.

| Query     | Required | Description                                                                         |
| --------- | -------- | ----------------------------------------------------------------------------------- |
| `country` | Yes      | One of `mex`, `cay`, `can`, `haw`, `uni`, `arg`, `swi`, `jap`, `chi`, `uae`, `sou`. |
| `days`    | No       | Window length from 1 to 90. Defaults to 30.                                         |
| `itemId`  | No       | Positive item ID.                                                                   |
| `since`   | No       | Unix milliseconds. Return only events at or after this time.                        |

```json
{
  "country": "jap",
  "from": 1767408000000,
  "to": 1770000000000,
  "items": {
    "123": [
      { "at": 1769999980000, "quantity": 4 },
      { "at": 1770000100000, "quantity": 0 }
    ]
  }
}
```

Timestamps are Unix milliseconds. Only changes are stored, so unchanged minutes are omitted.

Without `since`, each item also includes its last event before `from` as an anchor, which lets the client measure the first interval. With `since` inside the requested window, the response starts at `since` and omits the anchor. If `since` is missing, older than the window, or in the future, the collector uses the full window. That keeps an old client, a clock change, or a long offline period correct without a special error path.

The response uses CORS `*`, gzip for payloads of at least 1 KiB, and `Cache-Control: public, max-age=30, stale-while-revalidate=30`.

Invalid parameters return a JSON error with a 400 status. Unknown routes return 404, unsupported methods return 405, and internal failures return 500.

## Storage

The Node store uses SQLite in WAL mode with `synchronous=NORMAL`. D1 uses the same schema and constraints.

- `stock_state` holds the latest quantity and cost for each country and item.
- `stock_events` holds quantity changes. `initial` is the first observation, `restock` is a jump from zero, `sellback` is any other increase, and `sale` is a decrease. Cost-only changes update state without creating an event.
- `polls` holds one row per attempt, including failures and duration.
- `stats` keeps an `event_count` used by the health endpoint. Insert and delete triggers on `stock_events` keep it current, so health does not scan the event table.

Events are kept for `RETENTION_DAYS`, with the most recent event before the cutoff retained as the anchor for the oldest interval. The Node server prunes hourly. The Worker prunes daily. A run removes old polls and state rows for items that have not changed recently.

A poll writes state rows only when quantity or cost changes. This keeps a quiet minute to one poll row instead of one state write per item. `stock_state.last_seen_at` therefore means the last change, not the last poll. That is enough for pruning, which only needs to drop items that have been unchanged for the whole retention period.

## Operations

YATA updates its export roughly once per minute. Polling faster than that adds load without data. The default 60-second interval and the 30-second Node minimum reflect that.

A failed fetch is recorded and retried on the next interval. The previous state and history remain. The health endpoint is the quickest way to alert on stale data.

Serve the Node API over HTTPS through a reverse proxy when the static site is on HTTPS. The Worker provides HTTPS by default. The API is read-only and has no secrets, but TLS avoids mixed-content blocking and protects request metadata in transit.

The collector has no user accounts, cookies, or analytics. Reverse proxy logs and Cloudflare request logs may contain client IP addresses, so configure retention if that matters to you.

Collector uptime determines data continuity. A missed cron run leaves a gap. The forecast falls back to whatever local and remote observations exist.
