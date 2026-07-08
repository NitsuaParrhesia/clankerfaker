CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  rounds_recorded INTEGER NOT NULL DEFAULT 0,
  replays_reviewed INTEGER NOT NULL DEFAULT 0,
  faker_wins INTEGER NOT NULL DEFAULT 0,
  spotter_wins INTEGER NOT NULL DEFAULT 0,
  faker_rating INTEGER NOT NULL DEFAULT 1000,
  spotter_rating INTEGER NOT NULL DEFAULT 1000
);

ALTER TABLE replays ADD COLUMN owner_profile_id TEXT REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_replays_owner_profile_id ON replays (owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON profiles (last_seen_at);
