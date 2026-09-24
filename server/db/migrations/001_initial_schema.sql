CREATE TABLE IF NOT EXISTS app_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);

CREATE TABLE sites (
  id text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE, name text NOT NULL,
  personnel_capacity integer NOT NULL CHECK (personnel_capacity >= 1),
  target_rounds_per_shift integer NOT NULL DEFAULT 1 CHECK (target_rounds_per_shift >= 1),
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  status text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);

CREATE TABLE users (
  id text PRIMARY KEY, npk text NOT NULL UNIQUE, name text NOT NULL, email text NOT NULL,
  password_hash text NOT NULL, role text NOT NULL CHECK (role IN ('ANGGOTA','ADMIN','CHIEF','SUPER_ADMIN')),
  position text, status text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
  must_change_password boolean NOT NULL DEFAULT false, password_changed_at timestamptz,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);

CREATE TABLE user_assignments (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_id text REFERENCES customers(id) ON DELETE RESTRICT,
  site_id text REFERENCES sites(id) ON DELETE RESTRICT,
  effective_from timestamptz NOT NULL, effective_until timestamptz,
  is_current boolean NOT NULL DEFAULT true,
  changed_by text REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((is_current AND effective_until IS NULL) OR NOT is_current)
);
CREATE UNIQUE INDEX user_assignments_one_current ON user_assignments(user_id) WHERE is_current;

CREATE TABLE checkpoints (
  id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  code text NOT NULL, name text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  coordinate_method text NOT NULL DEFAULT 'MANUAL' CHECK (coordinate_method IN ('MANUAL','GPS')),
  gps_accuracy double precision, gps_captured_at timestamptz,
  radius_meter integer NOT NULL CHECK (radius_meter >= 1),
  status text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
  qr_status text NOT NULL DEFAULT 'INACTIVE' CHECK (qr_status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE(site_id, code)
);

CREATE TABLE checkpoint_tokens (
  id text PRIMARY KEY, checkpoint_id text NOT NULL REFERENCES checkpoints(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE, token_version integer NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
  generated_at timestamptz NOT NULL, revoked_at timestamptz,
  created_by text REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX checkpoint_tokens_one_active ON checkpoint_tokens(checkpoint_id) WHERE status='ACTIVE';

CREATE TABLE shift_sessions (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  site_id text NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  shift_code text NOT NULL CHECK (shift_code IN ('SHIFT_1','SHIFT_2','SHIFT_3')),
  operational_date date NOT NULL, started_at timestamptz NOT NULL, ended_at timestamptz,
  status text NOT NULL CHECK (status IN ('ACTIVE','COMPLETED','FORCE_CLOSED','CANCELLED')),
  checkpoint_target integer NOT NULL CHECK (checkpoint_target >= 0), checkpoint_completed integer NOT NULL DEFAULT 0 CHECK (checkpoint_completed >= 0),
  start_documentation_completed boolean NOT NULL DEFAULT false, start_documentation_at timestamptz,
  end_documentation_completed boolean NOT NULL DEFAULT false, end_documentation_at timestamptz,
  force_closed boolean NOT NULL DEFAULT false, force_closed_by text REFERENCES users(id) ON DELETE SET NULL,
  force_close_role text, force_close_reason text, force_closed_at timestamptz,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX shift_sessions_one_active_user ON shift_sessions(user_id) WHERE status='ACTIVE';

CREATE TABLE patrol_rounds (
  id text PRIMARY KEY, session_id text NOT NULL REFERENCES shift_sessions(id) ON DELETE RESTRICT,
  round_number integer NOT NULL CHECK (round_number >= 1),
  status text NOT NULL CHECK (status IN ('PENDING','ACTIVE','COMPLETED')),
  started_at timestamptz, completed_at timestamptz,
  UNIQUE(session_id, round_number)
);

CREATE TABLE patrol_logs (
  id text PRIMARY KEY, session_id text NOT NULL REFERENCES shift_sessions(id) ON DELETE RESTRICT,
  round_id text REFERENCES patrol_rounds(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  site_id text NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  checkpoint_id text REFERENCES checkpoints(id) ON DELETE RESTRICT,
  latitude double precision NOT NULL, longitude double precision NOT NULL, gps_accuracy double precision,
  distance_meter double precision NOT NULL,
  validation_status text NOT NULL CHECK (validation_status IN ('VALID','REVIEW','REJECTED')),
  rejection_reason text, rejection_message text, observation_status text,
  notes text, scanned_at timestamptz NOT NULL, sync_source text NOT NULL DEFAULT 'ONLINE',
  is_low_gps_accuracy boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX patrol_logs_unique_valid_checkpoint_round ON patrol_logs(session_id, round_id, checkpoint_id) WHERE validation_status='VALID';

CREATE TABLE validation_alerts (
  id text PRIMARY KEY, patrol_log_id text NOT NULL UNIQUE REFERENCES patrol_logs(id) ON DELETE RESTRICT,
  session_id text NOT NULL REFERENCES shift_sessions(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  site_id text NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  checkpoint_id text REFERENCES checkpoints(id) ON DELETE RESTRICT,
  alert_type text NOT NULL, status text NOT NULL CHECK (status IN ('OPEN','UNDER_REVIEW','CLOSED')),
  message text NOT NULL, reviewed_by text REFERENCES users(id) ON DELETE SET NULL, reviewed_at timestamptz,
  closed_by text REFERENCES users(id) ON DELETE SET NULL, closed_at timestamptz, close_note text,
  reopened_by text REFERENCES users(id) ON DELETE SET NULL, reopened_at timestamptz,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);

CREATE TABLE incident_reports (
  id text PRIMARY KEY, session_id text REFERENCES shift_sessions(id) ON DELETE RESTRICT,
  customer_id text REFERENCES customers(id) ON DELETE RESTRICT, site_id text NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  incident_at timestamptz NOT NULL, shift_code text NOT NULL, operational_date date NOT NULL,
  category text NOT NULL, severity text NOT NULL, title text NOT NULL, location_text text NOT NULL,
  latitude double precision, longitude double precision, notes text, chronology text NOT NULL, initial_action text NOT NULL,
  follow_up text, person_involved text, witness text, vehicle_involved text, asset_involved text,
  police_report_no text, external_party text, status text NOT NULL, escalated boolean NOT NULL DEFAULT false,
  escalated_to text, closed_at timestamptz, created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);

CREATE TABLE handovers (
  id text PRIMARY KEY, session_id text REFERENCES shift_sessions(id) ON DELETE RESTRICT,
  site_id text NOT NULL REFERENCES sites(id) ON DELETE RESTRICT, operational_date date NOT NULL, shift_code text NOT NULL,
  handover_type text NOT NULL, from_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  to_user_id text REFERENCES users(id) ON DELETE SET NULL, event_at timestamptz NOT NULL,
  latitude double precision, longitude double precision, condition_status text NOT NULL,
  personnel_status text NOT NULL, equipment_status text NOT NULL, keys_status text NOT NULL, vehicle_status text NOT NULL,
  outstanding_issues text, handover_notes text, item_name text, item_quantity text, item_condition text,
  handed_from text, handed_to text, is_taruna boolean NOT NULL DEFAULT false,
  ack_from boolean NOT NULL DEFAULT false, ack_to boolean NOT NULL DEFAULT false, status text NOT NULL,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);

CREATE TABLE shift_documentation (
  id text PRIMARY KEY, session_id text NOT NULL REFERENCES shift_sessions(id) ON DELETE RESTRICT,
  document_type text NOT NULL, reference_type text NOT NULL, reference_id text NOT NULL,
  documented_at timestamptz NOT NULL, created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE(session_id, document_type, reference_id)
);

CREATE TABLE media (
  id text PRIMARY KEY,
  document_type text NOT NULL CHECK (document_type IN ('SERTIGAS_NAIK_JAGA','SERTIGAS_TURUN_JAGA','PATROLI_QR','SERAH_TERIMA_BARANG','TARUNA','INSIDEN','LAINNYA')),
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id text REFERENCES shift_sessions(id) ON DELETE RESTRICT,
  customer_id text REFERENCES customers(id) ON DELETE RESTRICT,
  site_id text NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  reference_type text NOT NULL, reference_id text NOT NULL,
  storage_provider text NOT NULL, storage_key text NOT NULL,
  mime_type text, file_name text, file_size bigint,
  captured_at timestamptz NOT NULL, created_at timestamptz NOT NULL,
  UNIQUE(reference_type, reference_id, storage_key)
);

CREATE TABLE incident_media (incident_id text NOT NULL REFERENCES incident_reports(id) ON DELETE RESTRICT, media_id text NOT NULL UNIQUE REFERENCES media(id) ON DELETE RESTRICT, PRIMARY KEY(incident_id, media_id));
CREATE TABLE handover_media (handover_id text NOT NULL REFERENCES handovers(id) ON DELETE RESTRICT, media_id text NOT NULL UNIQUE REFERENCES media(id) ON DELETE RESTRICT, PRIMARY KEY(handover_id, media_id));

CREATE TABLE audit_logs (
  id text PRIMARY KEY, actor_user_id text REFERENCES users(id) ON DELETE SET NULL, actor_role text,
  action text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
  before_data jsonb, after_data jsonb, metadata jsonb,
  ip_address inet, user_agent text, created_at timestamptz NOT NULL
);
