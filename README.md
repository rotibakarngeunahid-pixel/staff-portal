# RBN Staff Portal

Migrasi Staff Attendance Portal Roti Bakar Ngeunah ke Next.js 15, Vercel, dan Supabase sesuai PRD `PRD_Migrasi_Vercel_Supabase.md`.

## Jalankan lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

Isi `SUPABASE_SERVICE_ROLE_KEY`, `PIN_SECRET`, `JWT_SECRET`, dan `PHOTO_UPLOAD_SECRET` sebelum mencoba login atau memanggil API. Untuk production pertama kali, isi `admin_pin_hash` atau aktifkan bootstrap eksplisit dengan `ALLOW_ADMIN_BOOTSTRAP=true` dan `ADMIN_INITIAL_PIN`.

## Setup Supabase

1. Buka Supabase SQL Editor.
2. Jalankan migration di `supabase/migrations/0001_initial_schema.sql`.
3. Upload folder `photo-hosting` ke hosting `foto-laporan-area.rotibakarngeunah.my.id`.
4. Pastikan `PHOTO_UPLOAD_ENDPOINT` mengarah ke `/api/upload-laporan-area.php` dan `PHOTO_UPLOAD_SECRET` di Vercel sama dengan hosting PHP.
5. Set env production di Vercel dengan nilai yang sama seperti `.env.local`.

Tidak ada PIN admin default. Jika `admin_pin_hash` masih kosong, login admin ditolak kecuali bootstrap eksplisit diaktifkan. Ganti password dari `/admin/config` setelah login pertama.
