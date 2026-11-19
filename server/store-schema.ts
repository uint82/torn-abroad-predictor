export const SCHEMA = `
CREATE TABLE IF NOT EXISTS stock_state (
  country TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  cost REAL NOT NULL,
  source_updated_at INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_event_at INTEGER NOT NULL,
  PRIMARY KEY (country, item_id)
);

CREATE TABLE IF NOT EXISTS stock_events (
  country TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  observed_at INTEGER NOT NULL,
  source_updated_at INTEGER NOT NULL,
  previous_quantity INTEGER,
  quantity INTEGER NOT NULL,
  cost REAL NOT NULL,
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (country, item_id, observed_at)
);

CREATE INDEX IF NOT EXISTS stock_events_country_time
  ON stock_events (country, observed_at);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collected_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  source_updated_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  item_count INTEGER NOT NULL,
  change_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS polls_collected_at ON polls (collected_at);

CREATE TABLE IF NOT EXISTS stats (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT OR IGNORE INTO stats (key, value) VALUES ('event_count', 0);

CREATE TRIGGER IF NOT EXISTS stock_events_count_insert
AFTER INSERT ON stock_events
BEGIN
  UPDATE stats SET value = value + 1 WHERE key = 'event_count';
END;

CREATE TRIGGER IF NOT EXISTS stock_events_count_delete
AFTER DELETE ON stock_events
BEGIN
  UPDATE stats SET value = value - 1 WHERE key = 'event_count';
END;
`;

export const UPSERT_STATE = `
INSERT INTO stock_state (
  country, item_id, quantity, cost, source_updated_at,
  first_seen_at, last_seen_at, last_event_at
) VALUES (
  ?, ?, ?, ?, ?,
  ?, ?, ?
)
ON CONFLICT(country, item_id) DO UPDATE SET
  quantity = excluded.quantity,
  cost = excluded.cost,
  source_updated_at = excluded.source_updated_at,
  last_seen_at = excluded.last_seen_at,
  last_event_at = excluded.last_event_at
`;

export const INSERT_EVENT = `
INSERT OR IGNORE INTO stock_events (
  country, item_id, observed_at, source_updated_at,
  previous_quantity, quantity, cost, delta, kind
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const INSERT_POLL = `
INSERT INTO polls (
  collected_at, finished_at, source_updated_at,
  duration_ms, item_count, change_count, status, error
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

export const OBSERVATIONS = `
WITH selected AS (
  SELECT item_id, observed_at, quantity
  FROM stock_events
  WHERE country = ?
    AND observed_at >= ?
    AND observed_at <= ?
    AND (? IS NULL OR item_id = ?)

  UNION ALL

  SELECT event.item_id, event.observed_at, event.quantity
  FROM stock_events AS event
  JOIN (
    SELECT item_id, MAX(observed_at) AS observed_at
    FROM stock_events
    WHERE country = ?
      AND observed_at < ?
      AND (? IS NULL OR item_id = ?)
    GROUP BY item_id
  ) AS prior
    ON prior.item_id = event.item_id
   AND prior.observed_at = event.observed_at
  WHERE event.country = ?
)
SELECT item_id, observed_at, quantity
FROM selected
WHERE (? IS NULL OR item_id = ?)
ORDER BY item_id, observed_at
`;

export const OBSERVATIONS_RANGE = `
SELECT item_id, observed_at, quantity
FROM stock_events
WHERE country = ?
  AND observed_at >= ?
  AND observed_at <= ?
  AND (? IS NULL OR item_id = ?)
ORDER BY item_id, observed_at
`;
