-- Tambah kolom mapping branch_id inventori per outlet
-- Diisi manual oleh admin di halaman Manajemen Outlet
ALTER TABLE outlets
  ADD COLUMN IF NOT EXISTS inventory_branch_id TEXT DEFAULT NULL;

COMMENT ON COLUMN outlets.inventory_branch_id IS
  'ID cabang di sistem inventori eksternal. Dipakai untuk cek status checkout sebelum staff absen keluar.';
