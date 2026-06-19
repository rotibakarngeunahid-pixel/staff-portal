-- Migration 0012: Bonus staff pada pembayaran gaji
-- Bonus adalah tambahan di atas gaji shift (tidak mengurangi saldo gaji tertahan).
-- Disimpan terpisah pada record payment agar tetap bisa dilacak & ditampilkan
-- sebagai komponen tersendiri di slip gaji. Backward-compatible: data lama bonus = 0.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bonus NUMERIC(12,0) NOT NULL DEFAULT 0;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bonus_note TEXT;

-- Bonus tidak boleh negatif
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_bonus_nonnegative'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_bonus_nonnegative CHECK (bonus >= 0);
  END IF;
END $$;
