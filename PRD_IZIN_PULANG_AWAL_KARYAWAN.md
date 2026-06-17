# PRD Izin Pulang Awal Karyawan

Versi: 1.0  
Tanggal: 2026-06-17  
Basis kode: Next.js 15, Supabase, API catch-all `app/api/[[...path]]/route.ts`, UI admin/staff, modul attendance, schedule, report, inventory, dan payroll.

## 1. Ringkasan

Fitur Izin Pulang Awal memungkinkan admin memberi izin kepada staff yang sedang bekerja untuk menutup shift sebelum jam selesai normal. Contoh kebutuhan operasional:

- Roti atau stok jualan habis lebih cepat.
- Outlet perlu tutup lebih awal karena kejadian mendadak.
- Ada kondisi operasional lain yang membuat staff perlu pulang sebelum jadwal selesai.

Aturan produk yang wajib dipertahankan:

- Staff tetap wajib mengirim Laporan Tutup Toko sebelum absen pulang.
- Staff tetap wajib selfie absen pulang.
- Staff tetap wajib berada di radius GPS outlet saat absen pulang.
- Jika outlet memakai integrasi inventori, pengecekan inventori tetap wajib selesai sebelum checkout.
- Izin pulang awal hanya membuka blokir jam checkout, bukan melewati alur operasional penutupan toko.

Secara teknis, sistem saat ini memblokir checkout sebelum jam selesai shift melalui `isCheckoutTimeReached()` di UI staff dan server checkout. Fitur ini menambahkan approval admin per attendance agar blokir waktu tersebut dapat dilewati secara terkontrol, dengan audit trail dan reason wajib.

## 2. Source Code Yang Ditinjau

- `types/domain.ts`
- `lib/business.ts`
- `app/api/[[...path]]/route.ts`
- `app/(staff)/app/home/page.tsx`
- `app/(admin)/admin/attendance/page.tsx`
- `app/(admin)/admin/config/page.tsx`
- `components/admin/admin-nav.tsx`
- `supabase/migrations/0001_initial_schema.sql`
- `supabase/migrations/0003_prd_v1.sql`
- `supabase/migrations/0005_inventory_integration.sql`
- `supabase/migrations/0008_shift_double_prevention.sql`
- `supabase/migrations/0010_security_atomicity.sql`

## 3. Kondisi Sistem Saat Ini

### 3.1 Checkout staff dibatasi jam selesai shift

Di `app/(staff)/app/home/page.tsx`:

- `checkoutAllowed` dihitung memakai `shiftEndTime()` dan `isCheckoutTimeReached()`.
- Jika belum waktunya, tombol checkout disabled.
- Staff melihat pesan `Belum Waktunya Absen Keluar`.

Di `app/api/[[...path]]/route.ts` endpoint `POST /api/attendance/checkout`:

- Server kembali mengecek `shiftEndTime()` dan `isCheckoutTimeReached()`.
- Jika belum waktunya, server mengembalikan error `CHECKOUT_TOO_EARLY`.

Ini benar untuk alur normal, tetapi belum ada pengecualian resmi ketika admin memang mengizinkan staff pulang lebih awal.

### 3.2 Laporan tutup toko juga dibatasi window

Endpoint `POST /api/reports/submit` memakai `reportSubmissionStatus()`.

Jika staff perlu tutup toko lebih awal, staff bisa terblokir karena:

- laporan `TUTUP` belum masuk window normal, misalnya default `20:00 - 01:00`;
- staff shift 1 normalnya hanya eligible untuk `BUKA`, sedangkan early close harus tetap membuat `TUTUP`;
- checkout tetap menolak jika laporan `TUTUP` belum ada.

Fitur pulang awal harus menangani bagian ini secara eksplisit: approval admin harus membuat staff boleh mengirim Laporan Tutup Toko lebih awal untuk attendance yang diberi izin.

### 3.3 Config `early_checkout_tolerance` sudah ada tetapi belum menjadi approval

Schema awal sudah memiliki config:

```text
early_checkout_tolerance = 15
```

Config ini muncul di halaman admin config, tetapi pada alur checkout saat ini validasi tetap memakai jam selesai shift tanpa approval per staff.

Untuk fitur ini, `early_checkout_tolerance` tidak cukup karena:

- toleransi global tidak menjawab kasus tutup toko jauh lebih awal;
- tidak ada alasan dan audit siapa yang mengizinkan;
- tidak bisa membuka window Laporan Tutup Toko secara selektif;
- berisiko membuat semua staff dapat checkout lebih awal tanpa keputusan admin.

MVP harus memakai approval per attendance, bukan hanya config global.

### 3.4 Admin saat ini hanya bisa koreksi setelah kejadian

Halaman `/admin/attendance` sudah mendukung:

- tambah absen manual;
- bulk attendance;
- revisi gaji/status/shift;
- revisi `checkout_time` secara manual.

Namun ini adalah koreksi data, bukan izin real-time. Staff tetap tidak bisa menyelesaikan alur sendiri di aplikasi jika checkout masih diblokir jam selesai shift.

## 4. Tujuan Bisnis

1. Memberi admin kontrol operasional saat outlet perlu tutup lebih awal.
2. Mengurangi kebutuhan koreksi manual absensi setelah staff pulang.
3. Menjaga disiplin laporan penutupan toko meskipun pulang lebih awal.
4. Menyediakan bukti audit: siapa yang mengizinkan, kapan, staff mana, alasan apa, dan kapan izin dipakai.
5. Menjaga payroll tetap rapi karena attendance tetap diselesaikan lewat alur resmi staff.

## 5. Permasalahan Yang Diselesaikan

Masalah saat ini:

- Staff tidak bisa checkout sebelum jam selesai shift walaupun admin sudah mengizinkan secara verbal.
- Jika toko perlu tutup jam 15:00, staff bisa terblokir dari Laporan Tutup Toko karena window tutup normal baru malam.
- Admin harus mengubah data checkout manual jika staff terlanjur pulang.
- Tidak ada catatan sistem yang membedakan checkout normal, checkout manual, dan checkout pulang awal atas izin admin.
- Tidak ada indikator di UI staff bahwa admin sudah memberi izin.

Fitur ini menyelesaikan masalah dengan:

- Menambahkan approval pulang awal per attendance aktif.
- Menampilkan status izin di UI staff.
- Memaksa staff menyelesaikan Laporan Tutup Toko sebelum checkout.
- Membuka submit Laporan Tutup Toko lebih awal hanya untuk attendance yang punya izin.
- Membuka checkout sebelum jam selesai shift hanya jika laporan tutup sudah terkirim.
- Menyimpan audit log dan status izin.

## 6. Definisi Produk

### 6.1 Izin Pulang Awal

Izin Pulang Awal adalah approval admin untuk satu attendance staff yang sudah check-in dan belum checkout.

Syarat pembuatan izin:

1. Staff sudah absen masuk.
2. Attendance belum memiliki `checkout_time`.
3. Attendance belum dibayar.
4. Admin mengisi alasan.
5. Izin hanya berlaku untuk tanggal operasional dan shift attendance tersebut.

### 6.2 Dampak Izin

Jika izin aktif:

1. Staff boleh mengirim Laporan Tutup Toko meskipun belum masuk window laporan tutup normal.
2. Staff tetap wajib mengirim Laporan Tutup Toko sebelum checkout.
3. Staff boleh checkout sebelum jam selesai shift setelah Laporan Tutup Toko selesai.
4. Checkout tetap wajib GPS, selfie, dan inventory check jika berlaku.
5. Attendance diberi flag/audit bahwa checkout terjadi dengan izin pulang awal.

### 6.3 Yang Tidak Diubah

Izin pulang awal tidak:

- menghapus kewajiban Laporan Tutup Toko;
- menghapus kewajiban Laporan Buka jika shift tersebut memang wajib BUKA;
- menghapus validasi GPS checkout;
- menghapus validasi selfie checkout;
- menghapus validasi inventory untuk shift penutupan;
- otomatis mengurangi gaji;
- otomatis membayar attendance;
- otomatis menghapus jadwal staff lain.

## 7. Scope

In-scope MVP:

- Admin dapat memberi izin pulang awal dari halaman absensi.
- Admin wajib mengisi alasan.
- Admin dapat membatalkan izin selama belum dipakai.
- Staff melihat banner bahwa pulang awal sudah diizinkan.
- Staff tetap diarahkan ke Laporan Tutup Toko sebelum checkout.
- Laporan Tutup Toko dapat dikirim lebih awal untuk staff yang punya izin.
- Checkout sebelum jam shift selesai hanya bisa dilakukan jika izin aktif dan Laporan Tutup Toko sudah terkirim.
- Audit log untuk create, cancel, dan used.
- Badge/status di tabel attendance admin.
- Data permission tersimpan di tabel baru.

Out-of-scope MVP:

- Pemotongan gaji otomatis karena durasi kerja lebih pendek.
- Workflow request dari staff ke admin.
- Approval multi-level.
- Push notification real-time.
- Penutupan outlet massal otomatis yang membatalkan semua jadwal sisa hari.
- Perubahan besar pada payroll.
- Mengubah struktur unik laporan outlet/date/type di luar kebutuhan minimal.

## 8. User Role dan Hak Akses

### 8.1 Admin

Admin boleh:

- melihat attendance yang sedang aktif;
- memberi izin pulang awal;
- mengisi alasan izin;
- membatalkan izin yang belum dipakai;
- melihat histori izin;
- melihat apakah izin sudah dipakai saat staff checkout.

Admin tidak boleh:

- membuat izin untuk attendance yang belum check-in;
- membuat izin untuk attendance yang sudah checkout;
- membuat izin untuk attendance yang sudah dibayar;
- membuat izin tanpa alasan.

### 8.2 Staff

Staff boleh:

- melihat bahwa admin sudah mengizinkan pulang lebih awal;
- mengirim Laporan Tutup Toko lebih awal jika izin aktif;
- checkout lebih awal setelah laporan tutup selesai.

Staff tidak boleh:

- membuat izin sendiri;
- checkout lebih awal tanpa izin admin;
- melewati Laporan Tutup Toko;
- melewati GPS/selfie/inventory.

## 9. User Flow

### 9.1 Admin Mengizinkan Pulang Awal

1. Admin login.
2. Admin membuka `/admin/attendance`.
3. Admin melihat staff yang sudah check-in dan belum checkout.
4. Admin klik aksi `Izinkan Pulang Awal`.
5. Sistem membuka modal.
6. Admin mengisi alasan, misalnya `Roti habis lebih cepat`.
7. Admin klik `Simpan Izin`.
8. Sistem menyimpan izin dengan status `active`.
9. Tabel attendance menampilkan badge `Pulang awal diizinkan`.
10. Sistem menulis audit log `admin_create_early_checkout_permission`.

### 9.2 Staff Menutup Toko Lebih Awal

1. Staff membuka halaman home.
2. Sistem memuat `/api/attendance/status`.
3. Jika izin aktif, UI menampilkan banner:

```text
Pulang awal diizinkan
Isi Laporan Tutup Toko terlebih dahulu sebelum absen pulang.
```

4. Jika Laporan Buka masih wajib dan belum terkirim, staff tetap diarahkan ke Laporan Buka lebih dulu.
5. Setelah requirement laporan sebelumnya selesai, staff diarahkan ke `Laporan Tutup Toko`.
6. Staff mengirim Laporan Tutup Toko meskipun jam normal tutup belum dimulai.
7. Setelah Laporan Tutup Toko selesai, staff dapat menekan `Absen Pulang Lebih Awal`.
8. Staff tetap mengambil selfie dan GPS checkout.
9. Server menyimpan `checkout_time`, selfie, GPS flag, dan menandai izin sebagai `used`.

### 9.3 Admin Membatalkan Izin

1. Admin membuka attendance yang memiliki badge izin aktif.
2. Admin klik `Batalkan Izin`.
3. Admin mengisi alasan pembatalan.
4. Sistem mengubah status izin menjadi `cancelled`.
5. Jika staff belum checkout, UI staff kembali mengikuti aturan jam checkout normal.
6. Sistem menulis audit log `admin_cancel_early_checkout_permission`.

## 10. Requirement Fungsional

### 10.1 Admin Attendance UI

1. Tabel attendance harus menampilkan status izin pulang awal.
2. Row yang eligible menampilkan aksi `Izinkan Pulang Awal`.
3. Eligibility row:
   - `checkin_time` tidak kosong,
   - `checkout_time` kosong,
   - `paid_status = false`.
4. Modal izin wajib memiliki:
   - nama staff,
   - outlet,
   - tanggal,
   - shift,
   - jam masuk,
   - alasan izin,
   - catatan opsional.
5. Alasan izin wajib diisi minimal 5 karakter.
6. Jika izin aktif, action berubah menjadi:
   - `Batalkan Izin` jika belum dipakai,
   - badge `Pulang awal dipakai` jika sudah dipakai.
7. Admin harus mendapat warning:

```text
Staff tetap wajib mengirim Laporan Tutup Toko sebelum absen pulang.
```

### 10.2 Staff Home UI

1. Response `/api/attendance/status` harus mengirim data izin aktif.
2. Jika izin aktif, tampilkan banner khusus.
3. `requiredReports` harus menambahkan `TUTUP` saat izin aktif.
4. Urutan step:
   - jika BUKA wajib dan belum ada, tampilkan `report_buka`;
   - jika TUTUP wajib karena izin pulang awal dan belum ada, tampilkan `report_tutup`;
   - jika laporan lengkap, tampilkan `checkout`.
5. Tombol checkout sebelum jam selesai shift boleh enabled hanya jika:
   - izin pulang awal aktif,
   - Laporan Tutup Toko sudah terkirim,
   - GPS ready,
   - tidak ada blocking inventory.
6. Label tombol checkout saat izin aktif:

```text
Absen Pulang Lebih Awal
```

7. Jika staff mencoba checkout lebih awal tetapi laporan tutup belum ada, tampilkan:

```text
Laporan Tutup Toko wajib dikirim sebelum absen pulang lebih awal.
```

### 10.3 Submit Laporan Tutup Toko

1. Endpoint `POST /api/reports/submit` tetap mewajibkan staff sudah check-in.
2. Untuk type `TUTUP`, sistem harus mengizinkan submit lebih awal jika staff memiliki izin pulang awal aktif untuk attendance tanggal tersebut.
3. Untuk attendance shift 1, izin pulang awal membuat staff eligible mengirim `TUTUP`.
4. Semua required photo item dari `report_cfg` tetap wajib.
5. Jika outlet memiliki `inventory_branch_id`, pengecekan inventori sebelum submit TUTUP tetap berlaku sesuai rule yang ada.
6. Report yang dibuat karena izin pulang awal harus memiliki marker pada response atau audit, misalnya `earlyCheckoutPermissionId`.

Catatan penting:

- Permission hanya membuka window waktu laporan TUTUP.
- Permission tidak mengurangi kelengkapan laporan.

### 10.4 Checkout Staff

1. Endpoint `POST /api/attendance/checkout` harus mencari izin aktif untuk attendance.
2. Jika checkout dilakukan sebelum jam selesai shift:
   - tanpa izin aktif -> tetap error `CHECKOUT_TOO_EARLY`;
   - dengan izin aktif tetapi TUTUP belum ada -> error `MISSING_REPORT_TUTUP`;
   - dengan izin aktif dan TUTUP sudah ada -> boleh lanjut.
3. Jika checkout dilakukan setelah jam selesai shift, alur normal tetap berlaku.
4. GPS checkout tetap wajib.
5. Selfie checkout tetap wajib.
6. Inventory check tetap wajib untuk closing shift atau attendance dengan izin pulang awal.
7. Setelah checkout berhasil:
   - update `attendance.checkout_time`,
   - append flag `EARLY_CHECKOUT_APPROVED`,
   - append `EARLY_CHECKOUT_PERMISSION:<id>` atau simpan relasi di tabel,
   - update permission status menjadi `used`,
   - isi `used_at`,
   - tulis audit log `early_checkout_used`.

### 10.5 Admin Cancel

1. Izin hanya bisa dibatalkan jika status masih `active`.
2. Izin tidak bisa dibatalkan jika attendance sudah checkout memakai izin tersebut.
3. Pembatalan wajib memiliki alasan.
4. Staff status harus tidak lagi menganggap checkout lebih awal sebagai allowed.

### 10.6 Payroll

1. MVP tidak mengubah `final_salary`.
2. Gaji tetap dihitung dari check-in seperti aturan sekarang.
3. Durasi kerja tetap boleh dicatat untuk audit dan laporan operasional.
4. Jika nanti pemilik ingin potongan karena pulang lebih awal, itu menjadi fitur fase lanjutan.

## 11. Struktur Database Yang Diperlukan

### 11.1 Table Baru: `early_checkout_permissions`

Gunakan tabel baru agar approval punya audit, status, dan tidak tercampur hanya sebagai string `flags`.

```sql
CREATE TABLE IF NOT EXISTS early_checkout_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_id UUID NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  date DATE NOT NULL,
  shift INTEGER NOT NULL CHECK (shift IN (0, 1, 2)),
  reason TEXT NOT NULL,
  note TEXT,
  allowed_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  require_tutup_report BOOLEAN NOT NULL DEFAULT true,
  require_inventory_check BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'cancelled', 'expired')),
  created_by TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_early_checkout_active_attendance
  ON early_checkout_permissions(attendance_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_early_checkout_staff_date
  ON early_checkout_permissions(staff_id, date);

CREATE INDEX IF NOT EXISTS idx_early_checkout_outlet_date
  ON early_checkout_permissions(outlet_id, date);

CREATE INDEX IF NOT EXISTS idx_early_checkout_status_created
  ON early_checkout_permissions(status, created_at DESC);
```

### 11.2 RLS

Karena aplikasi memakai service role di API server, RLS tetap dapat dibuat deny anon seperti tabel lain:

```sql
ALTER TABLE early_checkout_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon ON early_checkout_permissions;
CREATE POLICY deny_anon ON early_checkout_permissions
  FOR ALL TO anon USING (false) WITH CHECK (false);
```

### 11.3 Perubahan TypeScript

Tambahkan type di `types/domain.ts`:

```ts
export type EarlyCheckoutPermissionStatus =
  | "active"
  | "used"
  | "cancelled"
  | "expired";

export type EarlyCheckoutPermission = {
  id: string;
  attendance_id: string;
  staff_id: string;
  outlet_id: string;
  date: string;
  shift: 0 | 1 | 2;
  reason: string;
  note: string | null;
  allowed_from: string;
  require_tutup_report: boolean;
  require_inventory_check: boolean;
  status: EarlyCheckoutPermissionStatus;
  created_by: string;
  created_at: string;
  used_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};
```

Opsional tambahkan field pada `Attendance`:

```ts
early_checkout_permission?: EarlyCheckoutPermission | null;
```

## 12. API Yang Perlu Dibuat/Diubah

### 12.1 Admin List Permission

Endpoint:

```text
GET /api/admin/early-checkout
```

Query:

| Param | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `date` | date | Tidak | Filter tanggal |
| `outletId` | uuid | Tidak | Filter outlet |
| `staffId` | uuid | Tidak | Filter staff |
| `status` | string | Tidak | `active`, `used`, `cancelled`, `expired` |

Response:

```json
{
  "ok": true,
  "permissions": [
    {
      "id": "uuid",
      "attendance_id": "uuid",
      "staff_name": "Asep",
      "outlet_name": "Outlet Antapani",
      "date": "2026-06-17",
      "shift": 1,
      "reason": "Roti habis lebih cepat",
      "status": "active",
      "created_at": "2026-06-17T07:30:00.000Z"
    }
  ]
}
```

### 12.2 Admin Create Permission

Endpoint:

```text
POST /api/admin/early-checkout
```

Body:

```json
{
  "attendanceId": "uuid",
  "reason": "Roti habis lebih cepat",
  "note": "Sisa roti sudah kosong jam 15:20"
}
```

Validasi:

- session harus admin;
- `attendanceId` wajib;
- attendance harus ada;
- `checkin_time` wajib ada;
- `checkout_time` harus kosong;
- `paid_status` harus `false`;
- `reason` wajib minimal 5 karakter;
- tidak boleh ada permission `active` lain untuk attendance yang sama.

Response:

```json
{
  "ok": true,
  "permission": {
    "id": "uuid",
    "attendance_id": "uuid",
    "status": "active",
    "reason": "Roti habis lebih cepat"
  }
}
```

### 12.3 Admin Cancel Permission

Endpoint:

```text
PUT /api/admin/early-checkout
```

Body:

```json
{
  "permissionId": "uuid",
  "action": "cancel",
  "cancelReason": "Toko lanjut buka karena stok datang lagi"
}
```

Validasi:

- session harus admin;
- permission harus status `active`;
- attendance belum checkout memakai permission tersebut;
- cancel reason wajib.

### 12.4 Staff Attendance Status

Endpoint existing:

```text
GET /api/attendance/status
```

Tambahkan response:

```json
{
  "earlyCheckoutPermission": {
    "id": "uuid",
    "reason": "Roti habis lebih cepat",
    "status": "active",
    "allowed_from": "2026-06-17T07:30:00.000Z",
    "require_tutup_report": true
  },
  "earlyCheckoutAllowed": true,
  "requiredReports": ["BUKA", "TUTUP"],
  "nextStep": "report_tutup"
}
```

Rule:

- Jika permission aktif, `requiredReports` harus menyertakan `TUTUP`.
- Jika BUKA masih wajib dan belum ada, `nextStep` tetap `report_buka`.
- Jika TUTUP belum ada, `nextStep` menjadi `report_tutup`.
- Jika semua laporan wajib lengkap, `nextStep` menjadi `checkout`.

### 12.5 Staff Submit Report

Endpoint existing:

```text
POST /api/reports/submit
```

Perubahan untuk `type = TUTUP`:

1. Jika staff punya permission aktif, staff eligible submit TUTUP walaupun attendance shift adalah `1`.
2. Jika staff punya permission aktif, window report TUTUP dianggap terbuka untuk attendance tersebut.
3. Required photo dan inventory check tetap berjalan.
4. Audit log `submit_report` harus menyertakan `earlyCheckoutPermissionId` jika ada.

### 12.6 Staff Checkout

Endpoint existing:

```text
POST /api/attendance/checkout
```

Tambahkan logic:

```text
if checkout belum waktunya:
  cari permission active untuk attendance
  jika tidak ada -> CHECKOUT_TOO_EARLY
  jika ada -> lanjut hanya jika TUTUP sudah ada

validasi laporan tetap:
  BUKA jika shift membutuhkan BUKA
  TUTUP jika shift membutuhkan TUTUP atau permission require_tutup_report=true

validasi GPS tetap
validasi selfie tetap
validasi inventory tetap
mark permission used setelah update attendance sukses
```

## 13. Helper Logic Yang Disarankan

Tambahkan helper di `app/api/[[...path]]/route.ts` atau service baru jika ingin lebih rapi:

```ts
async function getActiveEarlyCheckoutPermission(db, attendanceId) {
  return db
    .from("early_checkout_permissions")
    .select("*")
    .eq("attendance_id", attendanceId)
    .eq("status", "active")
    .maybeSingle();
}
```

Helper untuk required reports:

```ts
function requiredReportsForAttendance(shift, earlyPermission) {
  const reports = new Set<string>();
  if (shift === 0 || shift === 1) reports.add("BUKA");
  if (shift === 0 || shift === 2) reports.add("TUTUP");
  if (earlyPermission?.require_tutup_report) reports.add("TUTUP");
  return [...reports];
}
```

Helper untuk checkout:

```ts
function canBypassCheckoutTime(earlyPermission) {
  return earlyPermission?.status === "active";
}
```

## 14. Wireframe Sederhana

### 14.1 Admin Attendance

```text
+--------------------------------------------------------------------------------+
| Absensi                                                                        |
| Filter, absen manual, dan revisi gaji                                           |
+--------------------------------------------------------------------------------+
| Staff | Tanggal | Shift | Masuk | Pulang | Status Izin       | Aksi            |
+--------------------------------------------------------------------------------+
| Asep  | 17 Jun  | S1    | 09:02 | -      | -                 | Izinkan Pulang  |
| Siti  | 17 Jun  | Full  | 08:55 | -      | Pulang awal aktif | Batalkan Izin   |
| Deni  | 17 Jun  | S2    | 15:01 | 18:12  | Dipakai           | Detail          |
+--------------------------------------------------------------------------------+
```

Modal:

```text
+------------------------------------------------+
| Izinkan Pulang Awal                            |
+------------------------------------------------+
| Staff: Siti                                    |
| Outlet: Antapani                               |
| Tanggal: 17 Juni 2026                          |
| Shift: Full Shift                              |
| Masuk: 08:55                                   |
|                                                |
| Alasan *                                       |
| [Roti habis lebih cepat____________________]   |
|                                                |
| Catatan                                        |
| [Sisa stok kosong jam 15:20________________]   |
|                                                |
| Staff tetap wajib mengirim Laporan Tutup Toko  |
| sebelum absen pulang.                          |
|                                                |
| [Batal]                         [Simpan Izin]  |
+------------------------------------------------+
```

### 14.2 Staff Home

```text
+------------------------------------------+
| Pulang awal diizinkan                    |
| Roti habis lebih cepat                   |
| Isi Laporan Tutup Toko sebelum absen     |
| pulang.                                  |
+------------------------------------------+

Status: Laporan Tutup Toko
[Isi Laporan Tutup Toko]

Setelah laporan lengkap:

[Absen Pulang Lebih Awal]
```

## 15. Edge Case

1. Admin memberi izin sebelum staff check-in:
   - Ditolak. Attendance harus sudah punya `checkin_time`.

2. Admin memberi izin setelah staff checkout:
   - Ditolak. Attendance sudah selesai.

3. Admin memberi izin untuk attendance yang sudah dibayar:
   - Ditolak agar payroll tidak berubah setelah pembayaran.

4. Staff refresh halaman setelah izin dibuat:
   - `/api/attendance/status` mengirim permission aktif dan UI langsung berubah.

5. Staff mencoba checkout sebelum kirim TUTUP:
   - Ditolak dengan `MISSING_REPORT_TUTUP`.

6. Staff mencoba submit TUTUP sebelum window normal tanpa izin:
   - Tetap ditolak dengan `REPORT_TOO_EARLY`.

7. Staff shift 1 diberi izin pulang awal:
   - Staff tetap wajib menyelesaikan BUKA jika belum.
   - Staff juga wajib submit TUTUP karena early close berarti penutupan toko/shift.

8. Staff full shift diberi izin pulang awal:
   - Staff wajib BUKA dan TUTUP.

9. Outlet 2 shift masih punya jadwal shift berikutnya:
   - MVP menampilkan warning ke admin bahwa izin ini berarti penutupan operasional lebih awal.
   - Admin bertanggung jawab menyesuaikan jadwal sisa hari jika diperlukan.
   - Fase lanjutan dapat otomatis membatalkan assignment sisa hari.

10. Inventory belum selesai:
   - Submit TUTUP atau checkout tetap ditolak sesuai rule inventory existing.

11. GPS staff di luar radius:
   - Checkout tetap ditolak dengan `OUTSIDE_RADIUS`.

12. Admin membatalkan izin saat staff sedang membuka halaman:
   - Checkout harus tetap divalidasi server, jadi jika staff menekan tombol lama, server menolak.

13. Ada permission aktif ganda:
   - Dicegah oleh unique index `ux_early_checkout_active_attendance`.

14. Attendance shift dikoreksi admin setelah permission dibuat:
   - Permission tetap mengikuti `attendance_id`.
   - UI menampilkan shift terbaru dari attendance.
   - Jika shift berubah, required report dihitung dari attendance terbaru plus TUTUP karena permission aktif.

15. Report TUTUP sudah ada sebelum permission:
   - Permission tetap bisa dipakai jika alasan valid.
   - Checkout lebih awal dapat lanjut setelah validasi lain selesai.

## 16. Acceptance Criteria

### 16.1 Admin Membuat Izin

- Admin dapat membuat izin pulang awal untuk attendance yang sudah check-in dan belum checkout.
- Admin tidak dapat membuat izin tanpa alasan.
- Admin tidak dapat membuat izin untuk attendance yang sudah checkout.
- Admin tidak dapat membuat izin untuk attendance yang sudah dibayar.
- Setelah izin dibuat, tabel attendance menampilkan badge izin aktif.
- Audit log mencatat action, admin, attendance id, staff, date, shift, dan reason.

### 16.2 Staff Melihat Izin

- Staff yang memiliki permission aktif melihat banner pulang awal.
- Banner menampilkan alasan izin.
- UI tidak langsung menampilkan checkout jika Laporan Tutup Toko belum terkirim.
- UI mengarahkan staff ke Laporan Tutup Toko.

### 16.3 Laporan Tutup Toko Tetap Wajib

- Staff dengan izin pulang awal tidak bisa checkout sebelum Laporan Tutup Toko terkirim.
- Endpoint checkout mengembalikan `MISSING_REPORT_TUTUP` jika TUTUP belum ada.
- Staff dapat submit TUTUP lebih awal hanya jika permission aktif.
- Staff tanpa permission tetap tidak bisa submit TUTUP sebelum window normal.
- Required photo report tetap wajib.

### 16.4 Checkout Lebih Awal

- Staff dengan permission aktif dan TUTUP lengkap dapat checkout sebelum jam selesai shift.
- Staff tanpa permission tetap ditolak dengan `CHECKOUT_TOO_EARLY`.
- GPS checkout tetap wajib.
- Selfie checkout tetap wajib.
- Inventory check tetap wajib jika outlet memakai inventory.
- Setelah checkout sukses, permission berubah menjadi `used`.

### 16.5 Pembatalan Izin

- Admin dapat membatalkan permission aktif yang belum dipakai.
- Permission yang sudah `used` tidak bisa dibatalkan.
- Setelah permission dibatalkan, staff tidak bisa checkout lebih awal.
- Audit log mencatat alasan pembatalan.

### 16.6 Payroll

- `final_salary` tidak berubah hanya karena izin pulang awal.
- Attendance tetap masuk payroll seperti attendance normal.
- Payroll detail dapat menampilkan flag `EARLY_CHECKOUT_APPROVED` sebagai informasi.

## 17. Langkah Implementasi Bertahap

### Fase 1 - Database dan Type

1. Buat migration `0011_early_checkout_permissions.sql`.
2. Tambahkan tabel `early_checkout_permissions`.
3. Tambahkan index dan RLS deny anon.
4. Tambahkan type `EarlyCheckoutPermission` di `types/domain.ts`.

### Fase 2 - API Admin

1. Tambahkan route di `adminDispatch`:
   - `GET /admin/early-checkout`
   - `POST /admin/early-checkout`
   - `PUT /admin/early-checkout`
2. Implementasi validasi create permission.
3. Implementasi cancel permission.
4. Tambahkan audit log create/cancel.

### Fase 3 - API Staff Status

1. Update `staffAttendanceStatus`.
2. Cari permission aktif berdasarkan attendance aktif.
3. Tambahkan `earlyCheckoutPermission` di response.
4. Update `requiredReports` agar menyertakan `TUTUP` saat permission aktif.
5. Update `nextStep` agar TUTUP muncul sebelum checkout.

### Fase 4 - Report dan Checkout Rule

1. Update `submitReport`:
   - TUTUP eligible untuk shift 1 jika permission aktif.
   - TUTUP boleh submit sebelum window jika permission aktif.
   - Required photo tetap divalidasi.
2. Update `checkout`:
   - cari permission aktif;
   - bypass jam selesai shift hanya jika permission aktif;
   - TUTUP tetap wajib;
   - GPS, selfie, inventory tetap wajib;
   - mark permission `used` setelah checkout sukses.
3. Tambahkan flag `EARLY_CHECKOUT_APPROVED` pada attendance.

### Fase 5 - Admin UI

1. Tambahkan state permission di `/admin/attendance`.
2. Tambahkan badge status izin.
3. Tambahkan tombol `Izinkan Pulang Awal`.
4. Tambahkan modal create permission.
5. Tambahkan action cancel.
6. Tampilkan warning bahwa TUTUP tetap wajib.

### Fase 6 - Staff UI

1. Update `StatusPayload`.
2. Tampilkan banner permission aktif.
3. Ubah label tombol checkout menjadi `Absen Pulang Lebih Awal`.
4. Pastikan checkout tetap disabled jika TUTUP belum ada.
5. Pastikan report TUTUP muncul sebagai step wajib.

### Fase 7 - QA Manual

1. Staff check-in shift 1.
2. Admin buat izin pulang awal.
3. Staff refresh home dan melihat banner.
4. Staff submit TUTUP sebelum window normal.
5. Staff checkout sebelum jam selesai shift.
6. Verifikasi permission menjadi `used`.
7. Verifikasi attendance memiliki checkout time dan flag early checkout.
8. Ulangi tanpa permission dan pastikan checkout tetap ditolak.
9. Ulangi dengan permission tetapi tanpa TUTUP dan pastikan checkout ditolak.
10. Ulangi dengan GPS luar radius dan pastikan checkout ditolak.

## 18. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Staff checkout tanpa TUTUP karena UI salah state | Laporan penutupan hilang | Server checkout wajib validasi TUTUP, bukan hanya UI |
| Permission dipakai untuk shift 1 padahal ada shift 2 berikutnya | Laporan TUTUP terlalu awal untuk outlet/date | Tampilkan warning admin; fase lanjutan bisa auto cancel jadwal sisa hari |
| Admin lupa alasan | Audit tidak jelas | Reason wajib minimal 5 karakter |
| Permission aktif ganda | State ambigu | Unique index active per attendance |
| Staff membuka halaman lama setelah permission dibatalkan | UI bisa stale | Server tetap validasi permission aktif saat checkout |
| Inventory belum selesai tetapi staff sudah diberi izin | Data stok tidak lengkap | Inventory check tetap wajib |
| Payroll dianggap harus dipotong | Salah ekspektasi | MVP tidak mengubah `final_salary`; tampilkan sebagai info operasional saja |

## 19. Rekomendasi MVP

MVP paling realistis:

1. Buat approval per attendance aktif.
2. Admin membuat/cancel approval dari `/admin/attendance`.
3. Staff melihat banner izin.
4. Permission membuat TUTUP bisa dikirim lebih awal.
5. Permission membuat checkout bisa dilakukan sebelum jam selesai shift.
6. TUTUP, GPS, selfie, dan inventory tetap wajib.
7. Simpan audit lengkap.
8. Jangan ubah payroll otomatis dulu.

Dengan MVP ini, admin dapat menangani kondisi seperti roti habis lebih cepat tanpa merusak disiplin laporan penutupan toko dan tanpa koreksi absensi manual setelah staff pulang.
