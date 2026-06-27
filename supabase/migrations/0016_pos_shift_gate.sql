-- Tambah kolom mapping branch_id POS/Kasir per outlet.
-- Dipakai untuk memvalidasi "Tutup Kasir/Shift" sudah dilakukan sebelum staff
-- bisa mengirim Laporan Tutup Toko (gate tutup toko).
-- Diisi manual oleh admin di halaman Manajemen Outlet.
ALTER TABLE outlets
  ADD COLUMN IF NOT EXISTS pos_branch_id TEXT DEFAULT NULL;

COMMENT ON COLUMN outlets.pos_branch_id IS
  'ID cabang di sistem POS/Kasir (cPanel). Dipakai untuk cek shift kasir sudah ditutup sebelum staff submit laporan tutup toko.';
