-- Migration 0017: Resignation Cases (Pemotongan Gaji Resign Tidak Sesuai Prosedur)
-- Domain resign terpisah dari delete/archive staff (lihat PRD-pemotongan-gaji-resign.md).
-- Resign sesuai prosedur dibayar 100% dari eligible final salary; resign tidak sesuai
-- prosedur dibayar sesuai `resignation_non_compliant_payout_rate` (default 20%). Rate
-- disimpan di config, bukan hardcode, karena kebijakan ini tetap wajib disetujui
-- HR/legal sebelum dipakai untuk pembayaran produksi nyata (PRD §1).
-- Additive only & idempoten — aman dijalankan berkali-kali. Tidak menghapus data.

CREATE TABLE IF NOT EXISTS resignation_cases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  outlet_id UUID REFERENCES outlets(id),
  outlet_name TEXT,
  source TEXT NOT NULL CHECK (source IN ('staff_portal', 'admin_entry', 'abandonment')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'submitted',
    'under_review',
    'approved_compliant',
    'approved_non_compliant',
    'exempted',
    'withdrawn',
    'cancelled',
    'final_payroll_approved',
    'paid'
  )),
  submitted_at TIMESTAMPTZ,
  letter_received_at TIMESTAMPTZ,
  requested_last_working_date DATE NOT NULL,
  approved_last_working_date DATE,
  effective_resign_date DATE,
  notice_required_days INTEGER NOT NULL DEFAULT 30,
  notice_given_days INTEGER,
  written_notice_received BOOLEAN NOT NULL DEFAULT false,
  resignation_letter_url TEXT,
  reason TEXT,
  auto_compliance_status TEXT CHECK (auto_compliance_status IN ('auto_compliant', 'auto_non_compliant', 'needs_review')),
  final_compliance_status TEXT CHECK (final_compliance_status IN ('compliant', 'non_compliant', 'exempted')),
  compliance_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  final_payroll_payment_id UUID REFERENCES payments(id),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resignation_cases_staff_created_at
  ON resignation_cases(staff_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resignation_cases_status
  ON resignation_cases(status);

-- Satu staff hanya boleh punya satu case yang masih "berjalan" (belum withdrawn/cancelled/paid).
CREATE UNIQUE INDEX IF NOT EXISTS ux_resignation_active_staff
  ON resignation_cases(staff_id)
  WHERE status IN (
    'draft', 'submitted', 'under_review',
    'approved_compliant', 'approved_non_compliant', 'exempted',
    'final_payroll_approved'
  );

ALTER TABLE resignation_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon ON resignation_cases;
CREATE POLICY deny_anon ON resignation_cases
  FOR ALL TO anon USING (false) WITH CHECK (false);

-- ─── Kolom baru di staff ────────────────────────────────────────────────
-- employment_status hanya label turunan untuk UI/reporting; sumber kebenaran utama
-- tetap active/deleted_at (dipakai semua guard existing) supaya tidak ada dua source
-- of truth yang bisa berbeda.
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'resigning', 'resigned', 'inactive', 'archived')),
  ADD COLUMN IF NOT EXISTS resigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_working_date DATE,
  ADD COLUMN IF NOT EXISTS resignation_case_id UUID REFERENCES resignation_cases(id);

-- Backfill staff existing supaya employment_status konsisten dengan active/deleted_at
-- yang sudah ada sebelum kolom ini ditambahkan (PRD §9.1.2 mapping backward compat).
UPDATE staff SET employment_status = 'archived'
  WHERE deleted_at IS NOT NULL AND employment_status = 'active';
UPDATE staff SET employment_status = 'inactive'
  WHERE deleted_at IS NULL AND active = false AND employment_status = 'active';

-- ─── Kolom baru di payments (final resignation payroll) ────────────────
-- payments.deduction (migrasi 0013) tetap dipakai sebagai total deduction untuk
-- backward compatibility: untuk final_resignation, deduction = resignation_policy_deduction + manual_deduction.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_kind TEXT NOT NULL DEFAULT 'regular'
    CHECK (payment_kind IN ('regular', 'final_resignation')),
  ADD COLUMN IF NOT EXISTS resignation_case_id UUID REFERENCES resignation_cases(id),
  ADD COLUMN IF NOT EXISTS payout_rate NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS resignation_policy_deduction NUMERIC(12,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_deduction NUMERIC(12,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_transfer_amount NUMERIC(12,0);

CREATE INDEX IF NOT EXISTS idx_payments_resignation_case_id ON payments(resignation_case_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_resignation_policy_deduction_nonnegative'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_resignation_policy_deduction_nonnegative CHECK (resignation_policy_deduction >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_manual_deduction_nonnegative'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_manual_deduction_nonnegative CHECK (manual_deduction >= 0);
  END IF;
END $$;

-- ─── Config default ─────────────────────────────────────────────────────
INSERT INTO config (key, value) VALUES
  ('resignation_notice_days', '30'),
  ('resignation_notice_days_probation', '30'),
  ('resignation_non_compliant_payout_rate', '0.20'),
  ('resignation_apply_to_bonus', 'false'),
  ('resignation_no_show_threshold_workdays', '2')
ON CONFLICT (key) DO NOTHING;
