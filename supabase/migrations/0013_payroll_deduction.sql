-- Migration 0013: Potongan gaji manual pada pembayaran
-- Simetris dengan bonus (migrasi 0012): potongan adalah pengurang di level transfer
-- (gaji shift + bonus − potongan = total diterima). Tidak mengubah saldo gaji tertahan.
-- deduction_note = alasan potongan yang ditampilkan ke staff di slip & riwayat.
-- Backward-compatible: data lama deduction = 0, deduction_note = NULL.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS deduction NUMERIC(12,0) NOT NULL DEFAULT 0;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS deduction_note TEXT;

-- Potongan tidak boleh negatif
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_deduction_nonnegative'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_deduction_nonnegative CHECK (deduction >= 0);
  END IF;
END $$;
