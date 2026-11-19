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
