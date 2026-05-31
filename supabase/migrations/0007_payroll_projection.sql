-- Migration 0007: Payroll Projection Indexes
-- Tambah index untuk performa endpoint proyeksi gaji.
-- View opsional staff_payroll_anchor untuk kemudahan query payday.
-- Idempoten — aman dijalankan berkali-kali.

-- ─────────────────────────────────────────────────────────────────
-- 1. Index untuk attendance (proyeksi query range historis)
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_attendance_staff_date_projection
  ON attendance(staff_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_staff_paid_date_projection
  ON attendance(staff_id, paid_status, date);

-- ─────────────────────────────────────────────────────────────────
-- 2. Index untuk payments
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_payments_staff_period_projection
  ON payments(staff_id, date_from, date_to);

-- ─────────────────────────────────────────────────────────────────
-- 3. Index untuk staff_dayoff
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_staff_dayoff_staff_date_projection
  ON staff_dayoff(staff_id, date, status);

-- ─────────────────────────────────────────────────────────────────
-- 4. Index untuk leave_requests
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leave_staff_date_projection
  ON leave_requests(staff_id, date, status);

-- ─────────────────────────────────────────────────────────────────
-- 5. Index untuk staff_shift_assignments
-- ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_assignment_staff_date_projection
  ON staff_shift_assignments(staff_id, date, status);

-- ─────────────────────────────────────────────────────────────────
-- 6. View opsional: staff_payroll_anchor
--    Memudahkan query payday_day berdasarkan absensi pertama.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW staff_payroll_anchor AS
SELECT
  s.id          AS staff_id,
  s.name        AS staff_name,
  MIN(a.date)   AS first_attendance_date,
  EXTRACT(DAY FROM MIN(a.date))::int AS payday_day
FROM staff s
LEFT JOIN attendance a ON a.staff_id = s.id
GROUP BY s.id, s.name;
