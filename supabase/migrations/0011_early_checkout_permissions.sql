-- Migration 0011: Izin Pulang Awal Karyawan (early checkout permissions)
-- Approval admin per attendance aktif agar staff bisa menutup shift lebih awal
-- secara terkontrol, dengan audit trail dan reason wajib. Tidak mengubah payroll.

CREATE TABLE IF NOT EXISTS early_checkout_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_id UUID NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  date DATE NOT NULL,
  shift INTEGER NOT NULL CHECK (shift IN (0, 1, 2)),
  reason TEXT NOT NULL,
  note TEXT,
  allowed_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  require_tutup_report BOOLEAN NOT NULL DEFAULT true,
  require_inventory_check BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'cancelled', 'expired')),
  created_by TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT
);

-- Cegah lebih dari satu izin aktif per attendance (edge case §15.13)
CREATE UNIQUE INDEX IF NOT EXISTS ux_early_checkout_active_attendance
  ON early_checkout_permissions(attendance_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_early_checkout_staff_date
  ON early_checkout_permissions(staff_id, date);

CREATE INDEX IF NOT EXISTS idx_early_checkout_outlet_date
  ON early_checkout_permissions(outlet_id, date);

CREATE INDEX IF NOT EXISTS idx_early_checkout_status_created
  ON early_checkout_permissions(status, created_at DESC);

-- RLS: aplikasi memakai service role di API server, anon ditolak seperti tabel lain
ALTER TABLE early_checkout_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon ON early_checkout_permissions;
CREATE POLICY deny_anon ON early_checkout_permissions
  FOR ALL TO anon USING (false) WITH CHECK (false);
