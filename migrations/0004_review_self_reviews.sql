ALTER TABLE review_attempts ADD COLUMN self_review INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_review_attempts_self_review ON review_attempts (self_review);
