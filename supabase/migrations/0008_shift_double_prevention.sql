-- Migration 0008: Shift Double-Checkin Prevention
-- Urutan eksekusi: tambah kolom → cleanup duplikat lama → buat unique index

-- ─────────────────────────────────────────────────────────────────
-- 1. Tambah kolom is_duplicate
--    Digunakan untuk menandai record duplikat tanpa menghapus data.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────
-- 2. Cleanup duplikat lama
--    Untuk setiap (outlet_id, date, shift) yang punya >1 staff checkin,
--    record pertama (checkin_time paling awal) = valid,
--    sisanya ditandai is_duplicate=true, final_salary=0.
-- ─────────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT
    id,
    final_salary,
    original_final_salary,
    flags,
    ROW_NUMBER() OVER (
      PARTITION BY outlet_id, date, shift
      ORDER BY checkin_time ASC
    ) AS rn
  FROM attendance
  WHERE checkin_time IS NOT NULL
    AND shift IN (1, 2)
),
dupes AS (
  SELECT id, final_salary, original_final_salary, flags
  FROM ranked
  WHERE rn > 1
)
UPDATE attendance a
SET
  is_duplicate          = true,
  original_final_salary = COALESCE(a.original_final_salary, a.final_salary),
  final_salary          = 0,
  deduction             = 0,
  flags = CASE
    WHEN a.flags IS NULL OR a.flags = '' THEN 'DUPLIKAT'
    WHEN a.flags NOT LIKE '%DUPLIKAT%'   THEN a.flags || ',DUPLIKAT'
    ELSE a.flags
  END
FROM dupes d
WHERE a.id = d.id;

-- ─────────────────────────────────────────────────────────────────
-- 3. Unique partial index — hanya pada record valid (bukan duplikat)
--    Mencegah checkin double di level database.
--    Record is_duplicate=true dikecualikan dari index ini.
-- ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_outlet_date_shift_checkedin
  ON attendance(outlet_id, date, shift)
  WHERE checkin_time IS NOT NULL
    AND shift IN (1, 2)
    AND NOT is_duplicate;
