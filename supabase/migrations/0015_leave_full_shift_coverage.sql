-- Migration 0015: Libur bergantian + full-shift coverage otomatis untuk outlet 2 shift
-- Tujuan:
--   1. Memungkinkan rollback yang bersih saat cuti dibatalkan — partner yang sebelumnya
--      di-upgrade ke FULL_SHIFT bisa dikembalikan ke shift aslinya.
--   2. Konfigurasi jam mulai munculnya popup heads-up "besok kamu full shift" (WITA).
--
-- Additive only & idempoten — aman dijalankan berkali-kali. Tidak menghapus data.

-- ─────────────────────────────────────────────────────────────────
-- 1. Kolom auto_cover_prev_shift_type pada staff_shift_assignments
--    Menyimpan shift_type partner SEBELUM di-upgrade jadi FULL_SHIFT saat meng-cover libur.
--      NULL        → assignment FULL_SHIFT dibuat baru khusus untuk cover
--                    (rollback = batalkan assignment).
--      SHIFT_1 /   → partner sudah punya shift ini lalu di-upgrade ke FULL_SHIFT
--      SHIFT_2       (rollback = kembalikan ke shift ini).
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE staff_shift_assignments
  ADD COLUMN IF NOT EXISTS auto_cover_prev_shift_type shift_type;

-- ─────────────────────────────────────────────────────────────────
-- 2. Config default
--    full_shift_headsup_from_hour: jam (WITA, 0-23) mulai popup "besok full shift"
--    ditampilkan di home staff yang meng-cover, pada H-1.
--      0  = tampil sepanjang hari H-1 (tanpa batas jam) — default.
--      16 = hanya tampil mulai sore/malam H-1 (mendekati tutup toko).
-- ─────────────────────────────────────────────────────────────────
INSERT INTO config (key, value) VALUES
  ('full_shift_headsup_from_hour', '0')
ON CONFLICT (key) DO NOTHING;
