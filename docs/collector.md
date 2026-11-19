# Stock collector

Browser history is local and limited to 24 hours. The optional stock collector polls YATA once per minute, stores stock changes in SQLite, and serves up to 90 days of history. The browser still runs the forecast. The collector only supplies observations.

The collector is a single Node process with no runtime dependencies. It reads YATA's public travel export, so it needs no Torn API key and stores no user data.

## Run

Node.js 22.13 or newer is required because the collector uses `node:sqlite`.

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

## Connect the site

Set `VITE_COLLECTOR_URL` when building the static site:

```bash
VITE_COLLECTOR_URL=https://history.example.com npm run build
```

Vite embeds the value into the built assets, so changing it requires a rebuild. Leave it unset or empty to run without a collector.

The browser requests history every 5 minutes and immediately after a country change. Requests contain only the country code and day count. The Torn API key is never sent to the collector. Remote history is merged with local snapshots and is not written to local storage.

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

Timestamps are Unix milliseconds. Only changes are stored, so unchanged minutes are omitted. Each item also includes its last event before `from` as an anchor, which lets the client measure the first interval. Items with no data are absent.

The response uses CORS `*`, gzip for payloads of at least 1 KiB, and `Cache-Control: public, max-age=30, stale-while-revalidate=30`.

Invalid parameters return a JSON error with a 400 status. Unknown routes return 404, unsupported methods return 405, and internal failures return 500.

## Storage

SQLite runs in WAL mode with `synchronous=NORMAL`.

- `stock_state` holds the latest quantity and cost for each country and item.
- `stock_events` holds quantity changes. `initial` is the first observation, `restock` is a jump from zero, `sellback` is any other increase, and `sale` is a decrease. Cost-only changes update state without creating an event.
- `polls` holds one row per attempt, including failures and duration.

Events are kept for `RETENTION_DAYS`, with the most recent event before the cutoff retained as the anchor for the oldest interval. Pruning runs hourly. A run removes old polls and state rows for items that have not appeared recently.

Run one collector per database file. SQLite allows one writer, and a second process would compete for the same WAL.

## Operations

YATA updates its export roughly once per minute. Polling faster than that adds load without data. The default 60-second interval and the 30-second minimum reflect that.

A failed fetch is recorded and retried on the next interval. The previous state and history remain. The health endpoint is the quickest way to alert on stale data.

Serve the API over HTTPS through a reverse proxy when the static site is on HTTPS. The API is read-only and has no secrets, but TLS avoids mixed-content blocking and protects request metadata in transit.

The collector has no user accounts, cookies, or analytics. Reverse proxy logs may contain client IP addresses, so configure retention if that matters to you.

Collector uptime determines data continuity. If the process is down for an hour, that hour has no intervals. The forecast falls back to whatever local and remote observations exist.
