ALTER TABLE flag_submissions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE flag_submissions ADD COLUMN browser_hash text;
ALTER TABLE flag_submissions ADD COLUMN fingerprint text;
ALTER TABLE flag_submissions ADD COLUMN is_spam boolean NOT NULL DEFAULT false;
ALTER TABLE flag_submissions ADD COLUMN moderated_by integer;
ALTER TABLE flag_submissions ADD COLUMN moderated_at timestamp;
ALTER TABLE flag_submissions ADD COLUMN moderation_reason text;
ALTER TABLE flag_items ADD COLUMN resolved_value_hash text;
CREATE UNIQUE INDEX flag_browser_item_uq ON flag_submissions(flag_item_id, browser_hash) WHERE browser_hash IS NOT NULL;
CREATE UNIQUE INDEX flag_account_item_uq ON flag_submissions(flag_item_id, user_id) WHERE fingerprint IS NOT NULL AND user_id IS NOT NULL;
CREATE INDEX flag_submission_item_idx ON flag_submissions(flag_item_id, id);
CREATE INDEX flag_recent_resolved_idx ON flag_items(target_ref, resolved_at);
CREATE TABLE flag_admissions (
  id serial PRIMARY KEY,
  browser_hash text,
  network_hash text,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX flag_admission_browser_idx ON flag_admissions(browser_hash, created_at);
CREATE INDEX flag_admission_network_idx ON flag_admissions(network_hash, created_at);
CREATE INDEX flag_admission_user_idx ON flag_admissions(user_id, created_at);
CREATE TABLE flag_request_buckets (
  network_hash text NOT NULL,
  minute timestamp NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (network_hash, minute)
);
CREATE TABLE flag_metrics (
  hour timestamp NOT NULL,
  event text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, event)
);
