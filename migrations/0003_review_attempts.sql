ALTER TABLE replays ADD COLUMN human_actor_id TEXT;
ALTER TABLE replays ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE replays ADD COLUMN faker_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE replays ADD COLUMN spotter_wins INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS review_attempts (
  id TEXT PRIMARY KEY,
  replay_id TEXT NOT NULL REFERENCES replays(id),
  owner_profile_id TEXT REFERENCES profiles(id),
  reviewer_profile_id TEXT NOT NULL REFERENCES profiles(id),
  guessed_actor_id TEXT NOT NULL,
  human_actor_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(replay_id, reviewer_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_review_attempts_replay_id ON review_attempts (replay_id);
CREATE INDEX IF NOT EXISTS idx_review_attempts_reviewer_profile_id ON review_attempts (reviewer_profile_id);
CREATE INDEX IF NOT EXISTS idx_review_attempts_owner_profile_id ON review_attempts (owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_review_attempts_created_at ON review_attempts (created_at);
