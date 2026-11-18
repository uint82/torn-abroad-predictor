# Privacy

Torn Abroad Predictor runs in your browser. There is no application server, account system, analytics, or advertising.

## What is stored

The app uses `localStorage` under its own site origin for:

- Your Torn API key, if you add one.
- Your planner settings.
- Cached Torn item catalog data.
- Cached YATA stock data.
- Stock and price history used for forecasts.

These values stay in your browser until you remove them, clear site data, or your browser deletes them.

## Where data is sent

- The Torn API key is sent only to `api.torn.com` in the `Authorization` header.
- Requests to `api.torn.com` also include the item or market path and normal browser headers.
- Requests to `yata.yt` never include your API key.
- No data is sent to the project maintainer or any other third party.

The app does not include telemetry. Your browser may still send standard request metadata, such as your IP address, to Torn and YATA as part of normal HTTPS traffic.

## Removing your key

Open the key dialog in the app and choose Remove key. This deletes the stored key and clears cached live quotes. You can also clear site data in your browser settings.

## Third-party policies

Torn and YATA control their own data handling. Review their policies before using the app:

- https://www.torn.com/
- https://yata.yt/

## Changes

Material changes to this policy will be noted in the repository history and in the app release notes.
