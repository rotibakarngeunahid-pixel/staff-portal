# RBN Staff Portal

Migrasi Staff Attendance Portal Roti Bakar Ngeunah ke Next.js 15, Vercel, dan Supabase sesuai PRD `PRD_Migrasi_Vercel_Supabase.md`.

## Jalankan lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

Isi `SUPABASE_SERVICE_ROLE_KEY`, `PIN_SECRET`, dan `JWT_SECRET` sebelum mencoba login atau memanggil API. Untuk production pertama kali, set `ADMIN_INITIAL_PIN` jika tabel `config` belum punya `admin_pin_hash`.

## Setup Supabase

1. Buka Supabase SQL Editor.
2. Jalankan migration di `supabase/migrations/0001_initial_schema.sql`.
3. Upload folder `photo-hosting` ke hosting `foto-laporan-area.rotibakarngeunah.my.id`.
4. Pastikan `PHOTO_UPLOAD_ENDPOINT` mengarah ke `/api/upload-laporan-area.php`.
5. Set env production di Vercel dengan nilai yang sama seperti `.env.local`.

Di development, PIN admin default saat database belum punya `admin_pin_hash` adalah `admin1234`. Di production, default ini dinonaktifkan; gunakan `ADMIN_INITIAL_PIN` atau isi `admin_pin_hash` lebih dulu. Ganti password dari `/admin/config` setelah login pertama.
