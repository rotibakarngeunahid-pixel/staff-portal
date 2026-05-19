# PRD Perbaikan Security, Bug, dan Bottleneck Staff Portal

## 1. Ringkasan

Dokumen ini mendefinisikan kebutuhan produk dan teknis untuk memperbaiki bug, celah keamanan, dan bottleneck performa pada Staff Portal Roti Bakar Ngeunah.

Fokus utama:

- Menutup kebocoran data sensitif ke client.
- Memperkuat login staff dan admin.
- Mengamankan endpoint upload foto.
- Menghilangkan race condition pada jadwal, check-in, dan payroll.
- Membuat endpoint laporan/payroll lebih scalable.
- Mengurangi latency proses submit laporan.

## 2. Latar Belakang

Audit kode menemukan beberapa risiko yang berdampak langsung pada keamanan dan keandalan operasional:

- Endpoint staff mengirim seluruh konfigurasi, termasuk hash PIN admin.
- Login staff menggunakan daftar nama publik dan PIN pendek tanpa rate limit.
- Token JWT masih disimpan di localStorage.
- Endpoint upload foto PHP terbuka untuk publik tanpa autentikasi.
- Claim shift, check-in, dan payroll belum atomic sehingga rentan bentrok saat request paralel.
- Beberapa endpoint mengambil data terlalu luas lalu memprosesnya di memory aplikasi.

Jika tidak diperbaiki, sistem berisiko mengalami brute force login, data sensitif bocor, penyalahgunaan storage foto, double payment, overwrite jadwal shift, dan penurunan performa saat volume data bertambah.

## 3. Tujuan

1. Tidak ada data sensitif server-side yang dikirim ke staff/admin client tanpa kebutuhan eksplisit.
2. Login staff dan admin tahan terhadap brute force dasar.
3. Token sesi tidak mudah dicuri melalui script client.
4. Upload foto hanya bisa dilakukan oleh request valid dari aplikasi.
5. Operasi shift dan payroll konsisten walau ada request bersamaan.
6. Endpoint dashboard, payroll, laporan, dan attendance tetap cepat pada data besar.
7. Submit laporan tidak gagal atau lambat hanya karena email notification sedang bermasalah.

## 4. Non-Goal

- Tidak mengganti Supabase sebagai database utama.
- Tidak membangun ulang UI dari nol.
- Tidak mengganti seluruh mekanisme absensi, GPS, dan selfie.
- Tidak membuat sistem HR/payroll baru di luar scope pembayaran attendance saat ini.
- Tidak mengubah domain bisnis shift 1, shift 2, full shift, laporan BUKA, dan laporan TUTUP kecuali untuk memperbaiki konsistensi data.

## 5. Prioritas

### P0 - Wajib Sebelum Production Stabil

- Hilangkan leak `admin_pin_hash` dan config sensitif dari endpoint staff.
- Tambah rate limit login staff dan admin.
- Hapus fallback admin PIN default.
- Amankan upload foto dengan server-side signature/token.
- Buat operasi claim shift dan payroll atomic.

### P1 - Performa dan Reliability

- Pagination dan filter wajib untuk attendance, reports, payroll.
- Aggregation payroll dipindahkan ke SQL/RPC.
- Email laporan dipindahkan ke background job atau retry queue.
- Batasi ukuran body dan jumlah foto laporan per request.

### P2 - Hardening Lanjutan

- Migrasi hash PIN ke bcrypt/argon2.
- Kurangi atau hapus localStorage token.
- Tambah observability, audit detail, dan alerting.
- Upgrade dependency yang rentan.

## 6. Requirement Fungsional

### 6.1 Config Exposure

Masalah saat ini:

- `staffAttendanceStatus` mengambil `configMap(db)` dan mengirim `config: cfg` ke client.
- Isi config dapat mencakup `admin_pin_hash`, secret operasional, dan parameter internal lain.

Requirement:

- Sistem harus hanya mengirim config yang benar-benar dibutuhkan UI staff.
- Config sensitif seperti `admin_pin_hash`, secret, email internal, dan hash lain tidak boleh pernah dikirim ke client staff.
- Admin config endpoint tetap boleh membaca config setelah sesi admin valid, tetapi field sensitif harus dimasking kecuali saat update.

Allowlist config staff:

- `late_tolerance_minutes`
- `deduction_per_minute`
- `early_checkout_tolerance`
- `company_name`

Acceptance criteria:

- Response `GET /api/attendance/status` tidak mengandung `admin_pin_hash`.
- Test otomatis gagal jika response staff mengandung key config di luar allowlist.
- UI staff tetap berjalan tanpa bergantung pada config mentah.

### 6.2 Login Staff

Masalah saat ini:

- `GET /api/staff/list` public menampilkan nama staff aktif.
- `POST /api/auth/login` menerima `name` dan `pin`.
- Tidak ada rate limit staff login.
- PIN pendek di-hash dengan SHA-256 cepat.

Requirement:

- Staff login harus menggunakan `staff_id` dari dropdown, bukan `name`, agar nama duplikat tidak menyebabkan error atau ambiguity.
- Rate limit login staff berdasarkan kombinasi `staff_id`, IP, dan device/session fingerprint ringan.
- Setelah gagal berulang, staff tersebut dikunci sementara tanpa mengunci seluruh outlet.
- Response login gagal harus tetap generik.
- Hash PIN baru harus memakai algoritma lambat seperti bcrypt atau argon2id.
- Sistem harus mendukung migrasi bertahap dari hash lama ke hash baru.

Acceptance criteria:

- 5 kali gagal dalam window konfigurasi membuat login staff terkait terkunci sementara.
- Login dengan nama duplikat tidak memakai `maybeSingle()` berbasis name.
- PIN lama tetap bisa login selama masa migrasi, lalu otomatis di-rehash ke format baru saat login sukses.
- Audit log mencatat login gagal dan sukses tanpa menyimpan PIN.

### 6.3 Login Admin

Masalah saat ini:

- Ada fallback `admin1234` jika config hash kosong.
- Lockout admin dihitung global untuk semua IP.
- Config default menyisipkan `admin_pin_hash` kosong.

Requirement:

- Tidak boleh ada fallback admin PIN default pada runtime production.
- Saat setup pertama, admin harus membuat PIN melalui proses bootstrap eksplisit yang hanya aktif jika env `ALLOW_ADMIN_BOOTSTRAP=true`.
- Rate limit admin berdasarkan IP dan scope admin, bukan global semua user.
- Hash admin PIN memakai bcrypt/argon2id.

Acceptance criteria:

- Jika `admin_pin_hash` kosong dan bootstrap tidak aktif, login admin ditolak dengan error setup.
- Gagal login dari satu IP tidak mengunci IP lain.
- Tidak ada string `admin1234` di kode production path.

### 6.4 Session Token

Masalah saat ini:

- Token JWT disimpan di localStorage dan cookie.
- `apiFetch` membaca token dari localStorage untuk Authorization header.

Requirement:

- Auth utama harus memakai cookie HTTP-only.
- Token tidak perlu dikembalikan ke client setelah login, atau jika tetap dikembalikan untuk masa transisi, UI tidak boleh menyimpannya di localStorage.
- Layout guard client tidak boleh menjadi satu-satunya proteksi halaman; API tetap menjadi sumber validasi utama.
- Tambahkan CSRF protection untuk endpoint mutasi berbasis cookie.

Acceptance criteria:

- Setelah login sukses, localStorage tidak berisi `rbn_staff_token` atau `rbn_admin_token`.
- Semua endpoint POST/PUT/DELETE memvalidasi CSRF token atau mekanisme equivalent.
- Logout menghapus cookie sesi dan CSRF token.

### 6.5 Upload Foto

Masalah saat ini:

- Endpoint PHP `upload-laporan-area.php` memiliki `Access-Control-Allow-Origin: *`.
- Endpoint tidak membutuhkan auth/signature.
- Aplikasi Next.js mengirim foto ke PHP tanpa shared secret.
- Foto dikirim base64 JSON lalu diubah ulang menjadi multipart, menambah memory dan bandwidth.

Requirement:

- Endpoint upload harus memvalidasi signature HMAC dari server aplikasi.
- Signature mencakup timestamp, nonce, content hash, dan scope upload.
- Signature expired maksimal 5 menit.
- Endpoint PHP harus menolak request tanpa signature valid.
- CORS dibatasi ke domain aplikasi production dan preview yang diizinkan.
- Batasi dimensi pixel gambar, bukan hanya ukuran byte.
- Simpan file dengan path yang mengandung scope, tanggal, dan random id.
- Untuk fase berikutnya, gunakan direct multipart upload dari browser ke Next.js atau signed upload URL agar tidak memakai base64 besar.

Acceptance criteria:

- Upload langsung ke PHP tanpa signature mendapat 401/403.
- Upload dengan signature expired ditolak.
- Gambar dengan dimensi ekstrem ditolak walau ukuran byte kecil.
- CORS tidak lagi `*` di production.

### 6.6 Claim Shift dan Check-in

Masalah saat ini:

- `claimShift` melakukan read existing lalu `upsert`, sehingga rentan race condition.
- `checkin` dapat `upsert` ke `shift_schedule` dan menimpa slot yang sudah diklaim staff lain.

Requirement:

- Claim shift harus atomic di database.
- Check-in untuk outlet 2 shift harus memvalidasi kepemilikan slot:
  - Jika slot open, staff boleh check-in dan slot diklaim oleh staff tersebut.
  - Jika slot sudah claimed oleh staff yang sama, check-in boleh lanjut.
  - Jika slot claimed oleh staff lain, check-in ditolak.
  - Jika slot off, check-in ditolak.
- Gunakan RPC SQL atau transaksi server-side yang menjamin compare-and-set.

Acceptance criteria:

- Dua staff yang claim shift bersamaan hanya menghasilkan satu pemenang.
- Check-in tidak bisa overwrite `staff_id` pada `shift_schedule` milik staff lain.
- Error untuk staff kedua adalah `SHIFT_TAKEN`.

### 6.7 Payroll Payment

Masalah saat ini:

- Proses payroll membaca attendance unpaid, insert payment, lalu update attendance.
- Dua request paralel bisa membayar attendance yang sama dua kali.

Requirement:

- Proses payment harus atomic.
- Attendance yang dibayar harus dikunci selama transaksi.
- Jika attendance sudah dibayar request lain, request berikutnya tidak boleh membuat payment duplikat untuk row yang sama.
- Payment amount boleh lebih besar dari earned hanya jika admin konfirmasi overpayment.

Acceptance criteria:

- Simulasi dua request payroll paralel untuk staff dan date range sama hanya menghasilkan satu payment valid untuk attendance yang sama.
- Semua attendance yang dibayar memiliki `payment_id`.
- Payment tanpa attendance unpaid membutuhkan flag eksplisit `allowOverpayment=true`.

### 6.8 Report Submit dan Email

Masalah saat ini:

- Submit laporan upload foto item sequential.
- Email dikirim synchronous di request user.
- Jika Resend lambat, user menunggu lebih lama.

Requirement:

- Upload foto item dapat diproses parallel dengan batas concurrency.
- Email notification masuk queue setelah report tersimpan.
- Worker/retry job mengirim email maksimal 3 kali.
- Kegagalan email tidak membuat submit laporan gagal.
- Status email dicatat di tabel baru `report_notifications`.

Acceptance criteria:

- API submit report return sukses setelah report tersimpan, tanpa menunggu email provider.
- Email gagal tercatat dan bisa retry.
- Response submit report menyertakan `notificationQueued`.

### 6.9 Pagination dan Query Performance

Masalah saat ini:

- Admin payroll mengambil semua attendance dan payments.
- Staff payroll mengambil seluruh riwayat.
- Beberapa endpoint memakai `limit(500)` tanpa metadata pagination.

Requirement:

- Semua endpoint list harus mendukung pagination.
- Default date range wajib diterapkan untuk attendance, reports, payroll.
- Payroll summary dihitung di SQL/RPC, bukan filter semua row di JS.
- Response list menyertakan `page`, `pageSize`, `total`, dan `hasMore`.

Endpoint terdampak:

- `GET /api/admin/payroll`
- `GET /api/staff/payroll`
- `GET /api/admin/attendance`
- `GET /api/admin/reports`
- `GET /api/admin/leave`
- `GET /api/admin/schedule`

Acceptance criteria:

- Tidak ada endpoint list yang mengambil seluruh tabel tanpa range/limit eksplisit.
- Admin payroll tetap responsif pada minimal 100.000 attendance rows.
- Query memakai index yang sesuai.

### 6.10 Error Handling dan Body Limit

Masalah saat ini:

- `readBody()` langsung `JSON.parse(text)` tanpa handling parse error khusus.
- Foto base64 besar bisa membuat memory tinggi.

Requirement:

- JSON invalid harus return 400 `INVALID_JSON`, bukan 500.
- Body size limit harus konsisten dan terdokumentasi.
- Jumlah foto per laporan harus dibatasi oleh config.
- API menolak request dengan payload terlalu besar sebelum proses upload.

Acceptance criteria:

- JSON invalid menghasilkan response 400.
- Payload melebihi limit menghasilkan 413.
- Error user-facing tetap dalam Bahasa Indonesia dan tidak membocorkan stack trace.

## 7. Requirement Non-Fungsional

### Security

- Semua secret harus berasal dari env, tanpa fallback default production.
- Semua mutasi berbasis cookie harus terlindungi dari CSRF.
- Semua upload harus authenticated atau signed.
- Password/PIN hash harus memakai algoritma lambat.
- Audit log tidak boleh menyimpan token, PIN, secret, atau full KTP.

### Performance

- Endpoint list target p95 kurang dari 800 ms untuk dataset production normal.
- Submit laporan target p95 kurang dari 2 detik di luar waktu upload file.
- Payroll summary target p95 kurang dari 1,5 detik untuk 100.000 attendance rows.

### Reliability

- Operasi payroll, claim shift, dan check-in harus idempotent atau atomic.
- Email notification memakai retry.
- Nonce lama harus dibersihkan berkala agar tabel tidak tumbuh tanpa batas.

### Observability

- Log audit ditambah untuk:
  - login failed staff/admin
  - rate limit triggered
  - upload rejected
  - payroll payment created
  - email queued/sent/failed
- Tambah structured error code untuk client.

## 8. Perubahan Database

### 8.1 Tabel Rate Limit/Login Attempts

Tambahkan tabel:

```sql
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff','admin')),
  actor_id TEXT,
  ip_address TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_scope
  ON login_attempts(actor_type, actor_id, ip_address, attempted_at DESC);
```

### 8.2 PIN Hash Migration

Tambahkan kolom:

```sql
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS pin_hash_algo TEXT NOT NULL DEFAULT 'sha256',
  ADD COLUMN IF NOT EXISTS pin_rehash_required BOOLEAN NOT NULL DEFAULT true;
```

Config admin:

```sql
INSERT INTO config (key, value)
VALUES ('admin_pin_hash_algo', 'sha256')
ON CONFLICT (key) DO NOTHING;
```

### 8.3 Report Notification Queue

```sql
CREATE TABLE IF NOT EXISTS report_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES reports(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_notifications_pending
  ON report_notifications(status, next_attempt_at);
```

### 8.4 Payroll Transaction RPC

Buat RPC Supabase untuk process payment atomic:

- Input: `staff_id`, `date_from`, `date_to`, `amount`, `proof_url`, `note`, `allow_overpayment`.
- Lock attendance unpaid dengan `FOR UPDATE`.
- Insert payment.
- Update attendance rows dengan `paid_status=true`, `payment_id`.
- Return payment, earned, overpayment, row count.

### 8.5 Claim Shift RPC

Buat RPC Supabase untuk claim slot atomic:

- Input: `outlet_id`, `date`, `shift`, `staff_id`, `staff_name`.
- Reject jika dayoff.
- Insert jika belum ada.
- Update hanya jika status open/cancelled atau claimed oleh staff yang sama.
- Reject jika claimed oleh staff lain.

## 9. Perubahan API

### 9.1 Auth

- `POST /api/auth/login`
  - Input berubah dari `{ name, pin }` menjadi `{ staffId, pin }`.
  - Untuk backward compatibility sementara, `name` masih diterima tapi deprecated.

- `POST /api/auth/admin-login`
  - Rate limit per IP.
  - Tidak memakai fallback PIN default.

- `POST /api/auth/logout`
  - Hapus cookie session dan CSRF.

### 9.2 Upload

- Next.js menambahkan HMAC signature saat memanggil PHP upload endpoint.
- PHP endpoint memvalidasi signature.
- Tambahkan env:
  - `PHOTO_UPLOAD_SECRET`
  - `PHOTO_ALLOWED_ORIGINS`
  - `PHOTO_SIGNATURE_TTL_SECONDS`

### 9.3 Payroll

- `GET /api/admin/payroll`
  - Query params: `dateFrom`, `dateTo`, `outletId`, `page`, `pageSize`.
  - Return summary agregat, bukan semua attendance nested.

- `POST /api/admin/payroll`
  - Memanggil RPC atomic.
  - Input tambah `allowOverpayment`.

### 9.4 Lists

Semua endpoint list menerima:

- `page`
- `pageSize`
- `dateFrom`
- `dateTo`
- filter relevan

Response standar:

```json
{
  "ok": true,
  "data": [],
  "page": 1,
  "pageSize": 50,
  "total": 123,
  "hasMore": true
}
```

## 10. UX Requirement

- Pesan rate limit harus jelas: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi."
- Saat sesi habis, user diarahkan ke login.
- Saat upload foto gagal karena ukuran/dimensi, tampilkan alasan spesifik.
- Admin payroll menampilkan filter tanggal default bulan berjalan.
- Admin bisa melihat status email laporan: pending, sent, failed.
- Staff login dropdown tetap mudah dipakai, tetapi value memakai `staff_id`.

## 11. Rencana Implementasi

### Phase 1 - Hotfix Security P0

1. Buat allowlist config untuk staff.
2. Hapus `admin_pin_hash` dari response staff dan masking pada admin config.
3. Tambah rate limit staff/admin.
4. Hapus fallback `admin1234` dari production path.
5. Tambah signature upload PHP.

Deliverable:

- Migration login attempts.
- Env baru upload secret.
- Unit/integration tests auth dan config exposure.

### Phase 2 - Atomic Operations

1. Buat RPC claim shift.
2. Update API `claimShift` memakai RPC.
3. Update check-in agar validasi slot tidak overwrite staff lain.
4. Buat RPC payroll payment.
5. Update API payroll payment memakai RPC.

Deliverable:

- Migration RPC.
- Test concurrency claim shift.
- Test double payroll request.

### Phase 3 - Performance

1. Tambah pagination standard.
2. Refactor admin payroll ke SQL aggregation.
3. Refactor staff payroll dengan date range dan pagination.
4. Tambah index jika query plan membutuhkan.
5. Batasi payload report dan upload concurrency.

Deliverable:

- Endpoint list baru backward compatible.
- UI filter pagination minimal.
- Benchmark query.

### Phase 4 - Session dan PIN Hardening

1. Hapus localStorage token.
2. Tambah CSRF.
3. Migrasi hash PIN ke bcrypt/argon2id.
4. Rehash otomatis saat login sukses.

Deliverable:

- Cookie-only auth.
- CSRF token flow.
- Migration status PIN hash.

### Phase 5 - Notification Queue dan Observability

1. Tambah tabel `report_notifications`.
2. Submit report hanya enqueue email.
3. Buat worker/cron retry.
4. Tambah audit log detail.

Deliverable:

- Retry email maksimal 3 kali.
- Admin dapat melihat status email laporan.

## 12. Testing Plan

### Automated Tests

- Config staff response tidak mengandung sensitive keys.
- Login staff gagal 5 kali lalu terkunci.
- Login admin kosong tanpa bootstrap ditolak.
- Claim shift concurrent hanya satu sukses.
- Check-in tidak overwrite claimed slot staff lain.
- Payroll concurrent tidak double pay.
- Invalid JSON return 400.
- Upload tanpa signature return 401/403.
- Upload expired signature return 401/403.
- Payroll list memakai pagination.

### Manual QA

- Staff login normal.
- Staff check-in, submit BUKA, submit TUTUP, checkout.
- Staff full shift saat shift lain off.
- Staff claim dan cancel shift.
- Admin tambah/edit staff.
- Admin set dayoff.
- Admin proses payroll.
- Admin lihat reports dan attendance dengan filter.
- Upload foto dari jaringan lambat.
- Sesi expired diarahkan ulang ke login.

### Load/Performance Test

Dataset minimal:

- 100 staff.
- 20 outlet.
- 100.000 attendance rows.
- 20.000 reports.
- 10.000 payments.

Target:

- `GET /api/admin/payroll` p95 kurang dari 1,5 detik.
- `GET /api/admin/attendance` p95 kurang dari 800 ms dengan filter tanggal.
- Submit laporan tidak menunggu email provider.

## 13. Rollout Plan

1. Deploy migration additive lebih dulu.
2. Deploy code Phase 1 dengan env lengkap.
3. Verifikasi production smoke test.
4. Aktifkan rate limit dalam mode monitor selama 1 hari.
5. Aktifkan enforcement rate limit.
6. Deploy RPC atomic dan pindahkan endpoint.
7. Deploy pagination UI.
8. Migrasi token localStorage ke cookie-only.
9. Migrasi PIN hash bertahap.

Rollback:

- Migration additive tidak perlu rollback langsung.
- Feature flag untuk:
  - new staff login by id
  - upload signature enforcement
  - payroll RPC
  - claim shift RPC
  - cookie-only auth

## 14. Metrics Keberhasilan

- 0 sensitive config key di response staff.
- 0 successful unsigned upload di production.
- 0 duplicate payment untuk attendance yang sama.
- 0 overwrite shift claimed by other staff.
- Penurunan p95 admin payroll minimal 50 persen setelah aggregation.
- Error submit report karena email provider tidak lagi berdampak ke user.

## 15. Risiko dan Mitigasi

Risiko: Staff gagal login setelah perubahan input dari name ke staffId.
Mitigasi: Sediakan backward compatibility sementara dan update UI login lebih dulu.

Risiko: Upload PHP gagal karena env secret tidak sinkron.
Mitigasi: Tambah health check signature dan deploy bertahap mode warn sebelum enforce.

Risiko: RPC payroll salah mengunci rows.
Mitigasi: Test concurrency dan dry run pada staging dengan snapshot data.

Risiko: Cookie-only auth membuat halaman client guard berubah.
Mitigasi: API tetap sumber validasi utama, UI memakai endpoint profile/status untuk validasi sesi.

Risiko: PIN hash migration memutus login lama.
Mitigasi: Dual-verify SHA-256 lama dan hash baru selama masa migrasi.

## 16. File/Area Kode Terdampak

- `app/api/[[...path]]/route.ts`
- `lib/auth.ts`
- `lib/client-api.ts`
- `stores/session.ts`
- `lib/storage.ts`
- `photo-hosting/api/upload-laporan-area.php`
- `supabase/migrations/*`
- `app/(staff)/app/login/page.tsx`
- `app/(admin)/admin/payroll/page.tsx`
- `app/(admin)/admin/attendance/page.tsx`
- `app/(admin)/admin/reports/page.tsx`
- `app/(staff)/app/payroll/page.tsx`

## 17. Definition of Done

- Semua P0 dan P1 acceptance criteria terpenuhi.
- `npm run typecheck`, `npm run lint`, dan `npm run build` lulus.
- Migration dapat dijalankan berulang secara idempotent.
- Smoke test staff dan admin lulus di staging.
- Tidak ada token sesi tersimpan di localStorage setelah cookie-only phase aktif.
- Dokumentasi env production diperbarui.
- Hasil audit dependency ditangani atau diberi risk acceptance eksplisit.
