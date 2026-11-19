# Privacy

Torn Abroad Predictor runs in your browser. There is no account system, analytics, or advertising. An optional stock collector can serve shared history; the site works without one.

## What is stored

The app uses `localStorage` under its own site origin for:

- Your Torn API key, if you add one.
- Your planner settings.
- Cached Torn item catalog data.
- Cached YATA stock data.
- Stock and price history used for forecasts. Remote history fetched from a collector is kept in memory only.

Stored values stay in your browser until you remove them, clear site data, or your browser deletes them.

## Where data is sent

- The Torn API key is sent only to `api.torn.com` in the `Authorization` header.
- Requests to `api.torn.com` also include the item or market path and normal browser headers.
- Requests to `yata.yt` never include your API key.
- If a collector URL is configured, requests to that collector contain the selected country code, history length, and an optional last-sync timestamp. They never include your API key or settings.
- A collector sees standard request metadata, such as your IP address and browser headers. This repository does not include a hosted collector; the site operator or a self-hosted instance receives those requests. A Cloudflare Worker deployment also passes requests through Cloudflare.
- No other data is sent to the project maintainer or another third party.

The app does not include telemetry. Your browser may still send standard request metadata, such as your IP address, to Torn, YATA, and a configured collector as part of normal HTTPS traffic. Cloudflare may process that metadata when the collector runs on Workers.

## Removing your key

Open the key dialog in the app and choose Remove key. This deletes the stored key and clears cached live quotes. You can also clear site data in your browser settings.

## Third-party policies

Torn and YATA control their own data handling. Review their policies before using the app:

- https://www.torn.com/
- https://yata.yt/

If you use a collector hosted by someone else, review that operator's privacy policy and server logs policy.

## Changes

Material changes to this policy will be noted in the repository history and in the app release notes.
