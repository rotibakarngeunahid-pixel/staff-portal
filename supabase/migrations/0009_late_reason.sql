-- Tambah kolom alasan keterlambatan pada tabel attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_reason TEXT;
