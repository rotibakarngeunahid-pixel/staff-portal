-- Migration 0003: PRD Revisi Manajemen Staff, Jadwal Shift, Libur Staff, Delete Aman
-- Fase 1 - Additive only. Tidak menghapus tabel/kolom lama.
-- Tabel lama (shift_schedule, shift_dayoff) dipertahankan untuk kompatibilitas legacy.
--
-- Urutan:
--   1. ENUM types
--   2. staff_shift_assignments (jadwal berbasis assignment)
--   3. staff_dayoff (libur berbasis nama staff)
--   4. Kolom tambahan: attendance, reports, staff
--   5. idempotency_keys
--   6. RLS untuk tabel baru
--   7. Config defaults baru

-- ─────────────────────────────────────────────────────────────────
-- 1. ENUM Types (dengan guard agar idempoten)
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE shift_type AS ENUM ('SHIFT_1','SHIFT_2','FULL_SHIFT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE schedule_status AS ENUM (
    'confirmed','cancelled','admin_override','auto_cover','locked','completed','conflict'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE schedule_source AS ENUM ('staff','admin','auto_dayoff','migration','checkin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dayoff_status_v2 AS ENUM ('active','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dayoff_source_v2 AS ENUM ('admin','staff_request','migration');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. staff_shift_assignments — sumber kebenaran jadwal baru
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_shift_assignments (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id         UUID NOT NULL REFERENCES outlets(id),
  staff_id          UUID NOT NULL REFERENCES staff(id),
  staff_name        TEXT NOT NULL,
  date              DATE NOT NULL,
  shift_type        shift_type NOT NULL,
  status            schedule_status NOT NULL DEFAULT 'confirmed',
  source            schedule_source NOT NULL DEFAULT 'staff',
  requested_at      TIMESTAMPTZ,
  confirmed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at      TIMESTAMPTZ,
  locked_at         TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  overridden_from_id UUID REFERENCES staff_shift_assignments(id),
  note              TEXT,
  cancel_reason     TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu staff hanya boleh punya satu assignment aktif per tanggal
CREATE UNIQUE INDEX IF NOT EXISTS ux_ssa_staff_active_day
  ON staff_shift_assignments(staff_id, date)
  WHERE status IN ('confirmed','admin_override','auto_cover','locked','completed');

-- Satu outlet/tanggal hanya boleh punya satu coverage Shift 1 (termasuk FULL_SHIFT)
CREATE UNIQUE INDEX IF NOT EXISTS ux_ssa_outlet_shift1_active
  ON staff_shift_assignments(outlet_id, date)
  WHERE status IN ('confirmed','admin_override','auto_cover','locked','completed')
    AND shift_type IN ('SHIFT_1','FULL_SHIFT');

-- Satu outlet/tanggal hanya boleh punya satu coverage Shift 2 (termasuk FULL_SHIFT)
CREATE UNIQUE INDEX IF NOT EXISTS ux_ssa_outlet_shift2_active
  ON staff_shift_assignments(outlet_id, date)
  WHERE status IN ('confirmed','admin_override','auto_cover','locked','completed')
    AND shift_type IN ('SHIFT_2','FULL_SHIFT');

CREATE INDEX IF NOT EXISTS idx_ssa_outlet_date ON staff_shift_assignments(outlet_id, date);
CREATE INDEX IF NOT EXISTS idx_ssa_staff_date  ON staff_shift_assignments(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_ssa_date        ON staff_shift_assignments(date);

-- ─────────────────────────────────────────────────────────────────
-- 3. staff_dayoff — libur berbasis nama staff (bukan shift)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_dayoff (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id                UUID NOT NULL REFERENCES outlets(id),
  staff_id                 UUID NOT NULL REFERENCES staff(id),
  staff_name               TEXT NOT NULL,
  date                     DATE NOT NULL,
  status                   dayoff_status_v2 NOT NULL DEFAULT 'active',
  source                   dayoff_source_v2 NOT NULL DEFAULT 'admin',
  leave_request_id         UUID REFERENCES leave_requests(id),
  replacement_schedule_id  UUID REFERENCES staff_shift_assignments(id),
  reason                   TEXT,
  created_by               TEXT,
  cancelled_at             TIMESTAMPTZ,
  cancel_reason            TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu staff hanya boleh punya satu dayoff aktif per tanggal
CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_dayoff_active
  ON staff_dayoff(staff_id, date)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_staff_dayoff_outlet_date ON staff_dayoff(outlet_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_dayoff_staff_date  ON staff_dayoff(staff_id, date);

-- ─────────────────────────────────────────────────────────────────
-- 4a. Kolom tambahan: attendance
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS schedule_id          UUID REFERENCES staff_shift_assignments(id),
  ADD COLUMN IF NOT EXISTS shift_type           TEXT,
  ADD COLUMN IF NOT EXISTS client_request_id    TEXT,
  ADD COLUMN IF NOT EXISTS missing_checkout_flag BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_client_request
  ON attendance(client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 4b. Kolom tambahan: reports
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS attendance_id        UUID REFERENCES attendance(id),
  ADD COLUMN IF NOT EXISTS schedule_id          UUID REFERENCES staff_shift_assignments(id),
  ADD COLUMN IF NOT EXISTS client_request_id    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_reports_client_request
  ON reports(client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 4c. Kolom tambahan: staff (untuk safe delete/archive)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by    TEXT,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_staff_deleted_at ON staff(deleted_at);

-- ─────────────────────────────────────────────────────────────────
-- 5. idempotency_keys — anti double submit lebih andal dari nonces
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           TEXT PRIMARY KEY,
  scope         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('started','succeeded','failed')),
  response_json JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- ─────────────────────────────────────────────────────────────────
-- 6. RLS untuk tabel baru
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'staff_shift_assignments',
    'staff_dayoff',
    'idempotency_keys'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS deny_anon ON %I', t);
    EXECUTE format('CREATE POLICY deny_anon ON %I FOR ALL TO anon USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 7. Config defaults baru
-- ─────────────────────────────────────────────────────────────────
INSERT INTO config (key, value) VALUES
  ('schedule_self_select_cutoff_minutes', '0'),
  ('schedule_cancel_cutoff_minutes', '60')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- Catatan migrasi data (jalankan manual setelah validasi):
--
-- Migrasi jadwal lama (shift_schedule) ke staff_shift_assignments:
--   INSERT INTO staff_shift_assignments
--     (outlet_id, staff_id, staff_name, date, shift_type, status, source, requested_at, created_by)
--   SELECT
--     outlet_id,
--     staff_id,
--     COALESCE(staff_name,''),
--     date,
--     CASE shift WHEN 1 THEN 'SHIFT_1'::shift_type WHEN 2 THEN 'SHIFT_2'::shift_type END,
--     'confirmed'::schedule_status,
--     'migration'::schedule_source,
--     requested_at,
--     'migration'
--   FROM shift_schedule
--   WHERE status = 'claimed'
--     AND staff_id IS NOT NULL
--   ON CONFLICT DO NOTHING;
--
-- Verifikasi setelah migrasi:
--   SELECT count(*) FROM staff_shift_assignments;
--   SELECT count(*) FROM shift_schedule WHERE status='claimed';
-- ─────────────────────────────────────────────────────────────────
