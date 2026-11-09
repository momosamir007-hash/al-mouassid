-- New shared rate-limit and cross-device deletion tables.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0)
);

CREATE TABLE IF NOT EXISTS exercise_deletions (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_deletions_user_client_uq UNIQUE (user_id, client_id)
);
