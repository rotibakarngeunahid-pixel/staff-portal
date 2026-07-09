-- Migration 0017: Denda staff (mis. info libur di hari-H, bukan H-1)
-- Dicatat terpisah dari pembayaran gaji supaya admin bisa mencatat pelanggaran
-- begitu terjadi, tanpa harus menunggu proses transfer gaji.
-- Additive only & idempoten — aman dijalankan berkali-kali.

CREATE TABLE IF NOT EXISTS staff_fines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  amount NUMERIC(12,0) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  incident_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'applied', 'waived')),
  payment_id UUID REFERENCES payments(id),
  applied_at TIMESTAMPTZ,
  waived_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_fines_staff_status ON staff_fines(staff_id, status);
