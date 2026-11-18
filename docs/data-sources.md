# Data sources

The app reads public Torn and YATA data directly from the browser. Both services allow cross-origin requests, so no proxy or worker is required.

## Torn API

Base URL: `https://api.torn.com/v2`

| Request                                 | Use                                                         |
| --------------------------------------- | ----------------------------------------------------------- |
| `GET /torn/items`                       | Item names, types, shop prices, and fallback market prices. |
| `GET /market/{id}/itemmarket?limit=100` | Live listings for one item.                                 |

Authentication uses the `Authorization: ApiKey <key>` header. The key is optional. Without one, the app skips live quotes and uses catalog prices.

Torn returns an error envelope with a numeric code and message. The app treats codes 1, 2, 10, 13, 16, and 18 as unusable-key errors. That covers empty, incorrect, jailed, inactive, insufficient access, and paused keys. The key flow shows Torn's message, and automatic refreshes stop until the key is replaced or a manual refresh succeeds. Other API errors are shown as a general data error.

Network failures name the host that could not be reached, so a YATA outage is not reported as a Torn key problem. The app sends the key in the `Authorization` header, which is not exposed in URLs or proxy logs.

The documented limit is 100 requests per minute per key or 5000 per minute per IP. The app limits quote requests to 60 item IDs and gates them at 90 requests per minute, leaving room for the catalog request and retries.

Market requests use the average listing price when present and the lowest listing as a fallback. The app records only one quote per item per refresh.

## YATA

Endpoint: `https://yata.yt/api/v1/travel/export/`

The response contains an `update` timestamp and a `stocks` object keyed by country code. Each country lists item IDs, names, quantities, and shop costs.

YATA data has no authentication and is fetched on every stock refresh. The app accepts a response only when the shape passes `parseTravelExport`. Invalid countries or items are skipped rather than failing the whole refresh.

YATA updates its export roughly once per minute. The app treats a stock snapshot as fresh for 60 seconds, usable for 24 hours, and stale beyond that. A failed fetch keeps the previous snapshot when one exists.

## Refresh timing

- Stock refreshes at most once per minute.
- The catalog is cached for 24 hours and refreshed when a key is saved.
- Live quotes refresh after a country change, after a key change, and when older than 5 minutes.
- The auto-refresh tick runs every 60 seconds and requests only data that is due.

A manual refresh forces all three sources for the current view. It can take a few seconds because each quote request is a separate call.

## Historical data

Each stock refresh appends one observation per item for every country in the YATA response. Each quote refresh appends one price observation per quoted item. Histories are pruned to the last 24 hours when loaded and when saved.

Stock observations are keyed by timestamp and quantity. Price observations are keyed by timestamp. Duplicate timestamps are collapsed before use.

## Data quality and limits

- A shop price comes from YATA cost first, then the lowest matching catalog shop price.
- A market price comes from a live quote first, then the catalog market price.
- Missing prices produce a row with no profit instead of a dropped item when stock still exists.
- The forecast cannot know about events, updates, or manual stock changes. Treat the result as an estimate.
- The app never writes to Torn or YATA.
