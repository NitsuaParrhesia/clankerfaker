CREATE TABLE IF NOT EXISTS replays (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_replays_expires_at ON replays (expires_at);
