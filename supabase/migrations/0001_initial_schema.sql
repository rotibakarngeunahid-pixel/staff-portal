CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outlets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location_url TEXT,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 100,
  shift_mode INTEGER NOT NULL DEFAULT 1 CHECK (shift_mode IN (1, 2)),
  shift1_start TIME NOT NULL,
  shift1_end TIME NOT NULL,
  shift2_start TIME,
  shift2_end TIME,
  report_buka_start TIME,
  report_buka_end TIME,
  report_tutup_start TIME,
  report_tutup_end TIME,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  salary_per_shift NUMERIC(12,0) NOT NULL DEFAULT 0,
  outlet_id UUID REFERENCES outlets(id),
  active BOOLEAN NOT NULL DEFAULT true,
  photo_url TEXT,
  ktp_no TEXT,
  ktp_photo_url TEXT,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_outlet ON staff(outlet_id);
CREATE INDEX IF NOT EXISTS idx_staff_name ON staff(name);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  outlet_name TEXT NOT NULL,
  date DATE NOT NULL,
  shift INTEGER NOT NULL CHECK (shift IN (1, 2, 0)),
  arrival_time TIMESTAMPTZ,
  report_time TIMESTAMPTZ,
  checkin_time TIMESTAMPTZ,
  checkout_time TIMESTAMPTZ,
  final_checkin_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','present','absent','late','off')),
  late_minutes INTEGER NOT NULL DEFAULT 0,
  deduction NUMERIC(12,0) NOT NULL DEFAULT 0,
  final_salary NUMERIC(12,0) NOT NULL DEFAULT 0,
  flags TEXT,
  selfie_in TEXT,
  selfie_out TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  paid_status BOOLEAN NOT NULL DEFAULT false,
  payment_id UUID,
  revision_note TEXT,
  revised_at TIMESTAMPTZ,
  revised_by TEXT,
  original_late_minutes INTEGER,
  original_deduction NUMERIC(12,0),
  original_final_salary NUMERIC(12,0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_staff_date_shift ON attendance(staff_id, date, shift);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_outlet ON attendance(outlet_id);

CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  outlet_name TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BUKA', 'TUTUP')),
  items_json JSONB NOT NULL DEFAULT '[]',
  selfie TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_outlet_date_type ON reports(outlet_id, date, type);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);

CREATE TABLE IF NOT EXISTS report_cfg (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  type TEXT NOT NULL CHECK (type IN ('BUKA', 'TUTUP')),
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  example_photo_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_report_cfg_outlet ON report_cfg(outlet_id, type);

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  amount NUMERIC(12,0) NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proof_url TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_staff ON payments(staff_id);

CREATE TABLE IF NOT EXISTS shift_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  date DATE NOT NULL,
  shift INTEGER NOT NULL CHECK (shift IN (1, 2)),
  staff_id UUID REFERENCES staff(id),
  staff_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','cancelled','off')),
  requested_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  note TEXT,
  created_by TEXT,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_outlet_date_shift ON shift_schedule(outlet_id, date, shift);
CREATE INDEX IF NOT EXISTS idx_schedule_staff ON shift_schedule(staff_id, date);

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','cancelled')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_staff_date ON leave_requests(staff_id, date);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  user_name TEXT NOT NULL,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

CREATE TABLE IF NOT EXISTS shift_dayoff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  date DATE NOT NULL,
  shift INTEGER NOT NULL CHECK (shift IN (1, 2)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dayoff_outlet_date_shift ON shift_dayoff(outlet_id, date, shift);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nonces_created_at ON nonces(created_at);

INSERT INTO config (key, value) VALUES
  ('late_tolerance_minutes', '10'),
  ('deduction_per_minute', '1000'),
  ('late_deduction_per_minute', '1000'),
  ('admin_pin_hash', ''),
  ('notification_email', 'rotibakarngeunahid@gmail.com'),
  ('company_name', 'Roti Bakar Ngeunah'),
  ('token_hours', '8'),
  ('max_login_attempts', '5'),
  ('lockout_minutes', '15'),
  ('early_checkout_tolerance', '15')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'config',
    'outlets',
    'staff',
    'attendance',
    'reports',
    'report_cfg',
    'payments',
    'shift_schedule',
    'leave_requests',
    'audit_log',
    'shift_dayoff',
    'admin_login_attempts',
    'nonces'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS deny_anon ON %I', t);
    EXECUTE format('CREATE POLICY deny_anon ON %I FOR ALL TO anon USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;

-- Foto tidak disimpan di Supabase Storage. Kolom foto di atas menyimpan URL WebP dari
-- PHOTO_UPLOAD_ENDPOINT hosting folder: foto-laporan-area.rotibakarngeunah.my.id.
