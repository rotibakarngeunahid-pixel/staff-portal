-- Migration 0006: Leave Request Improvements
-- Tambah status 'rejected', kolom admin_note, rejected_at, dan outlet_name ke leave_requests
-- Idempoten — aman dijalankan berkali-kali.

-- ─────────────────────────────────────────────────────────────────
-- 1. Extend CHECK constraint untuk status leave_requests
--    (tambah nilai 'rejected')
-- ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Coba drop constraint dengan nama auto-generated PostgreSQL
  BEGIN
    ALTER TABLE leave_requests DROP CONSTRAINT leave_requests_status_check;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- constraint tidak ada atau sudah punya nama lain
  END;
END $$;

-- Tambah kembali constraint dengan nilai lengkap
ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('pending', 'approved', 'cancelled', 'rejected'));

-- ─────────────────────────────────────────────────────────────────
-- 2. Tambah kolom baru
-- ─────────────────────────────────────────────────────────────────

-- admin_note: catatan/alasan dari admin saat approve atau reject
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- rejected_at: timestamp saat request ditolak admin
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- outlet_name: denormalisasi nama outlet agar query admin lebih cepat
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS outlet_name TEXT;

-- ─────────────────────────────────────────────────────────────────
-- 3. Index tambahan untuk query berdasarkan status
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_outlet_date ON leave_requests(outlet_id, date);
