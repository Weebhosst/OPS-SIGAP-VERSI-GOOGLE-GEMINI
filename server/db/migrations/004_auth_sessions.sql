CREATE TABLE auth_sessions (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_address text,
  user_agent text
);

CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id, expires_at DESC);
CREATE INDEX auth_sessions_active_idx ON auth_sessions(expires_at) WHERE revoked_at IS NULL;
