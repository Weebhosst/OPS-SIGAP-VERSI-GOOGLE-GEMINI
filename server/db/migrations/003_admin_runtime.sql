CREATE TABLE admin_filter_state (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  site_id text REFERENCES sites(id) ON DELETE SET NULL,
  shift_code text CHECK (shift_code IN ('SHIFT_1','SHIFT_2','SHIFT_3')),
  member_user_id text REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE radius_calibrations (
  id text PRIMARY KEY,
  site_id text NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  checkpoint_id text NOT NULL REFERENCES checkpoints(id) ON DELETE RESTRICT,
  tested_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tested_at timestamptz NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  gps_accuracy double precision,
  calculated_distance_meter double precision NOT NULL,
  configured_radius_meter double precision NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('VALID','REJECTED')),
  device_model text,
  notes text,
  created_at timestamptz NOT NULL
);

CREATE INDEX admin_filter_state_site_idx ON admin_filter_state(site_id);
CREATE INDEX radius_calibrations_checkpoint_idx ON radius_calibrations(checkpoint_id, tested_at DESC);
