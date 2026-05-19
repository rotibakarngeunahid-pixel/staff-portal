# PRD Revisi Manajemen Staff, Jadwal Shift, Draft Foto, Hari Libur, Absensi, dan Laporan

Versi: 1.0  
Tanggal: 2026-05-19  
Basis kode: Next.js 15, Supabase, endpoint API `app/api/[[...path]]/route.ts`, UI admin `app/(admin)/admin/*`, UI staff `app/(staff)/app/*`.

## 1. Ringkasan Masalah

Sistem saat ini sudah memiliki pondasi absensi, laporan foto, payroll, staff, outlet, claim shift, request libur, dan hari libur shift. Namun beberapa konsep masih bercampur sehingga rawan salah operasional.

Kondisi kode saat ini:

- Jadwal staff memakai tabel `shift_schedule` dengan slot `shift=1|2`, status `open|claimed|cancelled|off`. Staff dapat mengambil Shift 1 atau Shift 2 lewat `/app/schedule`, tetapi belum dapat memilih `Full Shift` sebagai pilihan normal.
- Absensi staff di `/app/home` masih menentukan shift dari jam berjalan (`detectShift`) dan `shift_dayoff`, bukan murni dari jadwal staff yang sudah disepakati.
- Full shift saat ini hanya muncul sebagai efek samping ketika salah satu `shift_dayoff` aktif. Ini belum cocok dengan kebutuhan staff memilih full shift sendiri atau admin mengatur libur berdasarkan nama staff.
- Fitur hari libur admin di `/admin/dayoff` masih berdasarkan nama shift, bukan nama staff. Tabel yang dipakai adalah `shift_dayoff(outlet_id,date,shift)`.
- Upload foto laporan, selfie absensi, contoh foto konfigurasi laporan, bukti payroll, foto staff, dan KTP staff belum memiliki draft otomatis. Foto disimpan sementara di React state/base64 sebelum submit, sehingga hilang saat refresh atau koneksi putus.
- Endpoint admin staff `DELETE /api/admin/staff` saat ini hanya menonaktifkan staff (`active=false`) tetapi UI menamai aksi sebagai nonaktif. Belum ada delete staff yang eksplisit dan aman.
- Data historis penting menyimpan `staff_id` plus snapshot `staff_name`, sehingga hard delete staff berisiko merusak referensi absensi, laporan, payroll, jadwal, dan request libur.

Masalah produk:

- Staff dan admin tidak punya satu sumber kebenaran jadwal yang jelas.
- Admin sulit melihat siapa libur berdasarkan nama staff.
- Staff bisa bingung tombol mana yang harus dikerjakan karena alur absensi/laporan belum sepenuhnya dikunci oleh jadwal.
- Foto laporan bisa hilang sebelum terkirim.
- Delete staff berisiko disalahpahami sebagai hapus permanen padahal saat ini hanya nonaktif.

## 2. Tujuan Revisi

1. Staff bisa memilih jadwal sendiri: `Shift 1`, `Shift 2`, atau `Full Shift`.
2. Jadwal staff langsung muncul di UI Admin dan dapat dipantau/dioverride admin.
3. Absensi dan laporan staff mengikuti jadwal yang tersimpan, bukan tebakan jam.
4. Set hari libur admin berbasis nama staff, bukan shift.
5. Jika hanya satu staff tersedia pada tanggal outlet tertentu, sistem otomatis menjadikan staff tersebut `Full Shift` sesuai rules.
6. Semua proses upload foto yang berisiko hilang wajib memiliki draft lokal otomatis.
7. Admin memiliki dua aksi berbeda: `Nonaktifkan Staff` dan `Hapus Staff`.
8. Delete staff aman terhadap data historis dan tidak merusak foreign key.
9. Sistem tetap kompatibel dengan tabel lama selama migrasi.
10. UI staff dan admin memberi state yang jelas: loading, empty, blocked, error, success.

## 3. Scope Fitur

In-scope:

- Revisi data model jadwal menjadi berbasis assignment staff per tanggal.
- Staff self-scheduling untuk `Shift 1`, `Shift 2`, `Full Shift`.
- Admin schedule monitor dan override jadwal.
- Admin set libur staff berdasarkan nama staff.
- Auto full shift untuk staff pengganti sesuai rules.
- Absensi/laporan berdasarkan `shift_type` jadwal.
- Draft foto otomatis untuk staff dan admin upload.
- UI delete staff dengan proteksi.
- API validation server-side untuk semua rules jadwal, libur, absensi, laporan, dan delete.
- Migration plan tanpa menghapus data lama.

Out-of-scope untuk dokumen ini:

- Mengganti Supabase.
- Mengganti domain hosting foto.
- Membuat sistem payroll baru di luar attendance/payments yang sudah ada.
- Mengubah desain brand besar-besaran.
- Membuat approval multi-level HR.
- Mengubah perhitungan gaji selain penyesuaian `Full Shift = salary_per_shift * 2`.

## 4. Non-Scope

- Tidak perlu membuat chat/notification real-time wajib pada fase pertama. Refresh atau polling ringan cukup.
- Tidak perlu menyimpan draft foto server-side lintas device pada fase pertama.
- Tidak perlu menghapus file foto lama dari hosting saat staff dihapus, kecuali ada requirement compliance terpisah.
- Tidak perlu mengubah login PIN pada PRD ini, walaupun ada PRD security terpisah.
- Tidak perlu mengubah `reports` menjadi multi laporan per outlet per tipe jika business tetap satu laporan BUKA dan satu laporan TUTUP per outlet per tanggal.

## 5. User Role

### Admin

Kewenangan:

- Melihat semua staff, outlet, jadwal, hari libur, absensi, laporan, dan payroll.
- Menetapkan atau mengubah jadwal staff.
- Menyetujui/membatalkan libur staff.
- Mengatur libur langsung berdasarkan nama staff.
- Mengubah jadwal staff sebelum absensi dimulai.
- Melakukan override terbatas setelah absensi dimulai dengan catatan audit.
- Menonaktifkan staff.
- Menghapus/arsipkan staff secara aman.

Batasan:

- Tidak boleh hard delete staff yang masih memiliki data historis.
- Tidak boleh mengubah shift aktif staff yang sudah check-in tanpa flow revisi eksplisit.
- Tidak boleh membuat semua staff outlet libur tanpa menandai outlet/tanggal sebagai `closed`.

### Staff

Kewenangan:

- Login dan melihat outlet sendiri.
- Memilih jadwal `Shift 1`, `Shift 2`, atau `Full Shift` untuk tanggal yang tersedia.
- Membatalkan jadwal sendiri sebelum batas waktu dan sebelum check-in.
- Mengajukan libur.
- Melihat jadwal, libur, dan status assignment sendiri.
- Absen masuk/keluar sesuai jadwal.
- Mengirim laporan BUKA/TUTUP sesuai jadwal.
- Melanjutkan atau menghapus draft foto miliknya.

Batasan:

- Tidak boleh mengambil shift yang sudah dipakai staff lain.
- Tidak boleh mengambil shift saat status dirinya libur pada tanggal tersebut.
- Tidak boleh mengambil `Full Shift` jika salah satu slot hari itu sudah diklaim staff lain, kecuali admin override.
- Tidak boleh check-in jika belum punya jadwal confirmed untuk tanggal efektif.
- Tidak boleh mengirim laporan yang tidak sesuai jadwal.

## 6. User Flow Admin

### 6.1 Melihat Jadwal

1. Admin buka `/admin/schedule`.
2. Admin pilih outlet dan minggu.
3. Sistem menampilkan kalender/list per tanggal:
   - `Jayak - Shift 1`
   - `Evi - Shift 2`
   - `Dinda - Full Shift`
   - `Kosong - Shift 1`
   - `Libur - Jayak`
   - `Tutup Outlet` jika semua staff diliburkan dengan override resmi.
4. Admin dapat filter:
   - outlet,
   - tanggal,
   - status jadwal,
   - staff,
   - konflik/belum lengkap.
5. Admin melihat badge sumber:
   - `Dipilih staff`,
   - `Diatur admin`,
   - `Auto pengganti`,
   - `Dikunci karena sudah absen`.

### 6.2 Mengubah Jadwal Staff

1. Admin klik slot/tanggal.
2. Admin pilih staff dan shift type:
   - `Shift 1`,
   - `Shift 2`,
   - `Full Shift`.
3. Sistem melakukan preflight:
   - staff aktif,
   - outlet staff cocok,
   - staff tidak libur,
   - staff belum punya jadwal aktif lain tanggal itu,
   - slot belum dipakai,
   - belum ada attendance terkunci.
4. Jika valid, simpan assignment dengan `source=admin`.
5. Jika slot/staff bentrok, UI menampilkan pilihan:
   - batal,
   - override assignment lama dengan alasan wajib.
6. Jika staff sudah check-in, default block. Override hanya melalui flow revisi absensi dengan catatan.

### 6.3 Set Hari Libur Berdasarkan Staff

1. Admin buka `/admin/dayoff` atau tab `Libur Staff`.
2. Admin pilih outlet, tanggal/range, dan nama staff.
3. Admin klik `Set Libur`.
4. Sistem preflight:
   - staff aktif dan berada di outlet itu,
   - tanggal valid,
   - staff belum check-in pada tanggal itu,
   - jika staff sudah punya jadwal, jadwal bisa dibatalkan atau diganti.
5. Sistem membuat `staff_dayoff` untuk staff tersebut.
6. Sistem menjalankan auto coverage:
   - jika hanya satu staff tersedia, assign staff tersebut `Full Shift`;
   - jika ada satu staff non-libur yang sudah terjadwal di salah satu shift, convert ke `Full Shift`;
   - jika banyak kandidat dan belum jelas, set status outlet/tanggal `needs_assignment`.
7. Admin melihat hasil:
   - `Jayak - Libur`,
   - `Evi - Full Shift (auto)`,
   - atau `Butuh assignment pengganti`.

### 6.4 Menghapus Data Staff

1. Admin buka `/admin/staff`.
2. Pada staff row, admin melihat dua aksi:
   - `Nonaktifkan`,
   - `Hapus`.
3. Klik `Hapus` membuka modal danger.
4. Modal menampilkan ringkasan dependency:
   - jumlah absensi,
   - jumlah laporan,
   - jumlah payment,
   - jumlah jadwal,
   - jumlah request/libur.
5. Jika dependency > 0:
   - default aksi adalah `Arsipkan/Hapus Akses`,
   - hard delete disabled.
6. Jika dependency = 0:
   - hard delete boleh, tetapi harus mengetik nama staff persis.
7. Semua aksi wajib masuk `audit_log`.

## 7. User Flow Staff

### 7.1 Memilih Jadwal

1. Staff login lalu buka `/app/schedule`.
2. Staff pilih tanggal.
3. Untuk outlet 2 shift, staff melihat tiga opsi:
   - `Ambil Shift 1`,
   - `Ambil Shift 2`,
   - `Ambil Full Shift`.
4. Jika outlet 1 shift, tampilkan hanya `Full Shift`/`Full Day`.
5. Staff klik opsi.
6. Sistem validasi server-side.
7. Jika berhasil:
   - UI menampilkan `Jadwal Saya`,
   - admin langsung melihat assignment tersebut,
   - slot lain otomatis berubah sesuai rules.
8. Jika gagal:
   - UI menampilkan alasan spesifik, misalnya `Shift sudah diambil Evi`.

### 7.2 Staff Belum Memilih Jadwal

1. Staff buka `/app/home`.
2. Jika tidak ada jadwal confirmed untuk tanggal efektif:
   - tombol absen disembunyikan,
   - tampil empty state `Belum ada jadwal kerja hari ini`,
   - CTA `Pilih Jadwal`,
   - jika admin belum membuka slot, tampil `Hubungi admin`.
3. Staff tidak bisa check-in tanpa jadwal, kecuali admin membuat attendance manual.

### 7.3 Alur Absensi Berdasarkan Jadwal

Shift 1:

1. Absen masuk.
2. Laporan buka toko.
3. Absen keluar.

Shift 2:

1. Absen masuk.
2. Laporan tutup toko.
3. Absen keluar.

Full Shift:

1. Absen masuk.
2. Laporan buka toko.
3. Laporan tutup toko.
4. Absen keluar.

### 7.4 Draft Foto

1. Staff mengambil foto laporan/selfie.
2. Setelah foto dikonfirmasi, sistem menyimpan draft otomatis di IndexedDB sebelum request upload/API.
3. Jika refresh/koneksi putus:
   - saat halaman dibuka lagi, sistem mendeteksi draft,
   - UI menampilkan `Draft ditemukan`,
   - tombol `Lanjutkan Draft` dan `Hapus Draft`.
4. Setelah submit sukses dan server mengembalikan data valid, draft dihapus/ditandai `submitted`.
5. Jika submit gagal, draft tetap ada untuk retry.

## 8. Detail Fitur

### 8.1 Staff Bisa Mengatur Jadwal Shift Sendiri

Definisi shift type:

- `SHIFT_1`: mencakup jam outlet `shift1_start` sampai `shift1_end`; wajib laporan BUKA.
- `SHIFT_2`: mencakup jam outlet `shift2_start` sampai `shift2_end`; wajib laporan TUTUP.
- `FULL_SHIFT`: mencakup operasional penuh; wajib laporan BUKA dan TUTUP; gaji 2x.

Status jadwal:

- `open`: slot belum diambil. Bisa berupa virtual state, tidak harus row DB.
- `confirmed`: jadwal aktif dan dapat dipakai absensi.
- `cancelled`: jadwal dibatalkan staff/admin.
- `admin_override`: jadwal aktif hasil perubahan admin.
- `auto_cover`: jadwal aktif hasil auto coverage karena staff lain libur.
- `locked`: staff sudah check-in, jadwal tidak boleh diubah biasa.
- `completed`: attendance sudah checkout.
- `dayoff`: staff libur pada tanggal itu.
- `conflict`: data lama/hasil migrasi tidak valid dan perlu admin perbaiki.

API yang disarankan:

- `GET /api/schedule/weekly` untuk staff: return jadwal staff, slot outlet, dayoff, dan conflicts.
- `POST /api/schedule/select`: staff memilih `shift_type`.
- `POST /api/schedule/cancel`: staff cancel assignment sendiri sebelum cutoff.
- `GET /api/admin/schedule`: admin monitor semua assignment.
- `POST /api/admin/schedule/assign`: admin assign/override.
- `POST /api/admin/schedule/cancel`: admin cancel dengan alasan.

Validasi bentrok:

- `SHIFT_1` bentrok dengan assignment aktif `SHIFT_1` atau `FULL_SHIFT` pada outlet/tanggal yang sama.
- `SHIFT_2` bentrok dengan assignment aktif `SHIFT_2` atau `FULL_SHIFT` pada outlet/tanggal yang sama.
- `FULL_SHIFT` bentrok dengan assignment aktif `SHIFT_1`, `SHIFT_2`, atau `FULL_SHIFT` pada outlet/tanggal yang sama.
- Satu staff tidak boleh punya lebih dari satu assignment aktif pada tanggal yang sama.
- Staff yang masuk `staff_dayoff` aktif tidak boleh punya assignment kerja.
- Staff inactive/deleted tidak boleh dipilih.

Rules jika staff belum memilih jadwal:

- Staff home tidak menampilkan tombol absen.
- Staff schedule menampilkan slot yang masih tersedia.
- Admin schedule menampilkan status `Kosong`.
- Dashboard admin menampilkan indikator `Belum lengkap` jika outlet/tanggal belum punya coverage minimum.

Rules jika admin mengubah jadwal staff:

- Sebelum check-in: boleh ubah/cancel dengan alasan opsional; sistem audit.
- Setelah check-in: jadwal menjadi `locked`; perubahan shift type diblokir.
- Jika admin harus koreksi setelah check-in, gunakan revisi attendance dengan catatan wajib, bukan edit jadwal biasa.
- Jika jadwal diubah, staff home wajib reload status dan menampilkan jadwal terbaru.

### 8.2 Fitur Draft untuk Upload Foto

Foto yang wajib memiliki draft:

- Selfie absen masuk (`attendance.selfie_in`).
- Selfie absen keluar (`attendance.selfie_out`).
- Foto item laporan BUKA/TUTUP (`reports.items_json[].photo_url`).
- Selfie laporan jika dipakai eksplisit, atau selfie check-in yang dipakai sebagai fallback.
- Foto contoh konfigurasi laporan admin (`report_cfg.example_photo_url`).
- Bukti pembayaran payroll admin (`payments.proof_url`).
- Foto staff dan foto KTP staff jika field upload diaktifkan di UI admin (`staff.photo_url`, `staff.ktp_photo_url`).

Media penyimpanan draft:

- Gunakan IndexedDB untuk foto/blob/base64 karena ukuran bisa besar.
- Jangan menyimpan foto di `localStorage`.
- `localStorage` hanya boleh menyimpan metadata ringan seperti `hasDraft=true` jika perlu.
- Jangan upload draft sementara ke hosting foto pada fase pertama, karena dapat membuat file yatim jika draft dibatalkan.

Struktur draft client:

```ts
type UploadDraft = {
  id: string;
  schemaVersion: 1;
  role: "staff" | "admin";
  flow:
    | "attendance_checkin"
    | "attendance_checkout"
    | "report_buka"
    | "report_tutup"
    | "report_cfg"
    | "payroll_payment"
    | "staff_profile";
  ownerId: string;
  outletId?: string;
  staffId?: string;
  date?: string;
  shiftType?: "SHIFT_1" | "SHIFT_2" | "FULL_SHIFT";
  reportType?: "BUKA" | "TUTUP";
  formData: Record<string, unknown>;
  photos: Array<{ key: string; label: string; blob: Blob; mime: string; size: number }>;
  clientRequestId: string;
  submitHash?: string;
  status: "draft" | "saving" | "submitting" | "submitted" | "deleted";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};
```

Draft key:

- Staff report: `staff:{staffId}:report:{outletId}:{date}:{shiftType}:{reportType}`.
- Check-in: `staff:{staffId}:checkin:{outletId}:{date}:{shiftType}`.
- Checkout: `staff:{staffId}:checkout:{outletId}:{date}:{shiftType}`.
- Admin payroll: `admin:payroll:{staffId}:{dateFrom}:{dateTo}`.
- Admin report config: `admin:report_cfg:{outletId}:{type}`.
- Admin staff profile: `admin:staff_profile:{staffId|new}`.

Auto-save:

- Simpan draft setiap ada perubahan form/foto dengan debounce 500-1000 ms.
- Simpan draft segera setelah kamera/file picker menghasilkan foto.
- Kompres foto sebelum masuk draft agar ukuran stabil.
- Tampilkan status kecil:
  - `Draft tersimpan otomatis, 14:32`,
  - `Menyimpan draft...`,
  - `Draft belum tersimpan, koneksi/perangkat bermasalah`.

Restore:

- Saat halaman load, hitung context (`staffId`, `outletId`, `date`, `shiftType`, `reportType`).
- Cari draft aktif di IndexedDB.
- Jika ada:
  - jangan auto-submit,
  - tampilkan banner/modal `Draft ditemukan`,
  - tombol `Lanjutkan Draft`,
  - tombol `Hapus Draft`.
- Jika draft sudah expired, tampilkan opsi `Hapus Draft Lama`.

Anti double submit:

- Setiap draft memiliki `clientRequestId`.
- API mutasi menerima `clientRequestId`/`idempotencyKey`.
- Server menyimpan idempotency key per scope agar retry tidak membuat data ganda.
- Setelah submit sukses, tandai draft `submitted`, lalu hapus foto dari IndexedDB.
- Jika API mengembalikan duplicate request, client fetch status terbaru:
  - jika data sudah tersimpan, tampilkan success dan hapus draft;
  - jika tidak ada data, izinkan retry dengan key baru setelah konfirmasi.

TTL:

- Selfie check-in/checkout: expired 12 jam atau saat tanggal efektif berubah.
- Laporan BUKA/TUTUP: expired 24 jam.
- Admin report config: expired 7 hari.
- Payroll proof: expired 7 hari.
- Staff profile/KTP: expired 7 hari.

### 8.3 Admin Bisa Menghapus Data Staff

Perbedaan aksi:

- `Nonaktifkan Staff`: staff tidak bisa login, tidak muncul di default active list, data histori tetap utuh, staff bisa diaktifkan lagi.
- `Hapus Staff`: staff dihapus dari operasi aktif. Rekomendasi default adalah soft delete/arsip aman, bukan hard delete jika ada histori.

Rekomendasi teknis:

- Gunakan soft delete operasional:
  - `active=false`,
  - `deleted_at=now()`,
  - `deleted_by='Admin'`,
  - `delete_reason`,
  - `pin_hash` di-randomize atau null jika schema diubah,
  - future schedule dibatalkan.
- Hard delete hanya boleh jika preflight dependency count semuanya 0.

Risiko hard delete jika staff punya data:

- `attendance.staff_id` FK akan gagal atau histori absensi hilang jika cascade dipaksa.
- `reports.staff_id` dan `staff_name` akan kehilangan attribution.
- `payments.staff_id` akan merusak payroll audit.
- `shift_schedule`/jadwal akan kehilangan owner.
- `leave_requests`/`staff_dayoff` akan kehilangan histori libur.

UI/UX:

- Tombol `Nonaktifkan` tetap ada untuk staff aktif.
- Tombol `Hapus` berada di danger zone, tidak sejajar sebagai aksi utama.
- Modal hapus menampilkan dependency count.
- Admin wajib mengetik nama staff untuk lanjut.
- Jika dependency > 0, label tombol final: `Arsipkan Staff`.
- Jika dependency = 0, label tombol final: `Hapus Permanen`.

API:

- `POST /api/admin/staff/deactivate` atau `DELETE /api/admin/staff` dengan `mode="deactivate"` untuk nonaktif.
- `DELETE /api/admin/staff` dengan `mode="archive"` untuk soft delete.
- `DELETE /api/admin/staff` dengan `mode="hard"` hanya jika dependency 0 dan `confirmName` cocok.
- `GET /api/admin/staff/:id/delete-preview` atau body preflight untuk dependency count.

### 8.4 Hari Libur Berdasarkan Nama Staff

Sumber data baru:

- Gunakan tabel `staff_dayoff` sebagai sumber utama libur staff.
- `leave_requests` tetap untuk request libur dari staff.
- Saat request libur disetujui, buat/aktifkan `staff_dayoff`.
- `shift_dayoff` menjadi legacy untuk migrasi; UI baru tidak membuat row `shift_dayoff`.

Flow admin:

1. Pilih outlet.
2. Pilih tanggal/range.
3. Pilih staff berdasarkan nama.
4. Isi alasan opsional.
5. Klik `Set Libur`.
6. Sistem menampilkan dampak coverage sebelum commit.
7. Setelah commit, jadwal pengganti dibuat/diperbarui.

Rules:

- Jika satu staff libur dan hanya satu staff lain tersedia, staff lain otomatis `FULL_SHIFT`.
- Jika satu staff libur dan slot yang ditinggalkan sudah ada pengganti valid, tidak perlu auto full.
- Jika hanya tersisa satu staff aktif di outlet/tanggal, staff tersebut wajib `FULL_SHIFT`.
- Jika semua staff libur, sistem default menolak dan memberi pesan `Minimal satu staff aktif atau tandai outlet tutup`.
- Admin boleh memilih `Tutup Outlet Hari Ini` dengan konfirmasi dan alasan; attendance tidak diharapkan untuk tanggal itu.
- Staff yang sedang libur tidak melihat tombol absen dan tidak bisa memilih shift.
- Jika staff sudah check-in, admin tidak bisa set libur staff tersebut untuk tanggal itu tanpa revisi manual.

UI Admin:

- Kalender/list menampilkan nama staff:
  - `Jayak - Libur`,
  - `Evi - Full Shift`,
  - `Dinda - Shift 1`.
- Tabel libur berkolom:
  - tanggal,
  - outlet,
  - staff,
  - alasan,
  - sumber (`admin`, `request staff`),
  - pengganti,
  - aksi.

UI Staff:

- Pada `/app/schedule`, tanggal libur tampil sebagai card disabled `Libur oleh admin` atau `Libur disetujui`.
- Pada `/app/home`, tampil blocked state `Hari ini kamu libur`.
- Tombol absen dan laporan disembunyikan.

### 8.5 Alur Absensi dan Laporan Berdasarkan Jadwal Shift

Source of truth:

- `attendance/status` harus resolve jadwal aktif dari `staff_shift_assignments`.
- Jika tidak ada jadwal dan tidak ada status outlet closed, return `scheduleState="unassigned"`.
- Jika staff libur, return `scheduleState="dayoff"`.
- Jika ada jadwal, return:
  - `scheduleId`,
  - `shiftType`,
  - `requiredReports`,
  - `nextStep`,
  - `locked`.

Mapping:

- `SHIFT_1` -> `attendance.shift=1`, `requiredReports=["BUKA"]`.
- `SHIFT_2` -> `attendance.shift=2`, `requiredReports=["TUTUP"]`.
- `FULL_SHIFT` -> `attendance.shift=0`, `requiredReports=["BUKA","TUTUP"]`.

Tombol yang muncul:

- Belum ada jadwal: `Pilih Jadwal`, `Refresh`.
- Dayoff: hanya `Refresh`.
- Belum check-in: `Absen Masuk`.
- Setelah check-in Shift 1: `Laporan Buka Toko`.
- Setelah check-in Shift 2: `Laporan Tutup Toko`.
- Setelah check-in Full Shift dan belum BUKA: `Laporan Buka Toko`.
- Setelah Full Shift sudah BUKA dan belum TUTUP: `Laporan Tutup Toko`.
- Setelah laporan wajib lengkap: `Absen Pulang`.
- Setelah checkout: `Selesai`.

Tombol yang disembunyikan:

- Shift 1 tidak pernah melihat tombol laporan TUTUP.
- Shift 2 tidak pernah melihat tombol laporan BUKA.
- Staff tanpa jadwal tidak melihat tombol absen.
- Staff libur tidak melihat tombol absen/laporan.
- Checkout disembunyikan sampai semua laporan wajib selesai.

Validasi urutan:

- Check-in wajib sebelum laporan.
- Laporan wajib sebelum checkout.
- Checkout tidak boleh dua kali.
- Report BUKA/TUTUP hanya boleh jika report type ada di `requiredReports`.
- Full Shift wajib menyelesaikan BUKA dan TUTUP.
- Server menolak request yang tidak sesuai walaupun UI dimanipulasi.

Rules tambahan:

- Jadwal belum tersedia: block absen, arahkan ke jadwal.
- Admin mengubah jadwal setelah staff absen: jadwal locked; perubahan biasa ditolak.
- Staff terlambat absen: tetap bisa check-in, status `late`, potongan dihitung dari start jadwal.
- Staff lupa absen keluar:
  - Staff home menampilkan `Absen pulang belum selesai` sampai cutoff.
  - Setelah cutoff, admin dashboard menandai `MISSING_CHECKOUT`.
  - Admin bisa revisi checkout manual dengan catatan.

## 9. Business Rules

Jadwal:

- Satu outlet/tanggal hanya boleh punya satu coverage Shift 1 dan satu coverage Shift 2.
- `FULL_SHIFT` meng-cover Shift 1 dan Shift 2 sekaligus.
- Satu staff hanya boleh punya satu assignment aktif per tanggal.
- Staff hanya boleh memilih jadwal di outlet miliknya, kecuali admin mengizinkan staff tanpa outlet sebagai floater.
- Staff inactive/deleted tidak dapat dipilih atau login.
- Assignment staff otomatis visible di admin setelah sukses simpan.

Cutoff:

- Default staff boleh memilih/cancel jadwal sampai sebelum jam mulai shift.
- Rekomendasi config baru:
  - `schedule_self_select_cutoff_minutes`, default `0`.
  - `schedule_cancel_cutoff_minutes`, default `60`.
- Admin dapat override cutoff sebelum check-in.

Hari libur:

- `staff_dayoff` aktif menang atas self-schedule.
- Staff libur tidak boleh check-in.
- Jika dayoff disetujui, assignment staff pada tanggal itu dibatalkan jika belum locked.
- Jika dayoff membuat coverage outlet tidak lengkap, sistem membuat auto cover atau status `needs_assignment`.

Absensi:

- Check-in hanya boleh untuk jadwal confirmed/admin_override/auto_cover.
- Check-in memakai geofence outlet yang sudah ada.
- Full shift memakai start time `shift1_start`.
- Shift 2 memakai `shift2_start`.
- Gaji Full Shift = `salary_per_shift * 2`.
- Attendance historis tidak boleh dihitung ulang otomatis kecuali admin revisi.

Laporan:

- Laporan BUKA unique per outlet/date/type.
- Laporan TUTUP unique per outlet/date/type.
- Staff hanya dapat submit tipe laporan yang diwajibkan jadwalnya.
- Jika laporan sudah ada dari staff yang benar, retry draft tidak boleh membuat duplikat.
- Jika laporan sudah ada dari staff lain karena admin mengubah jadwal, server return conflict dan UI minta admin review.

Delete staff:

- Nonaktif tidak menghapus histori.
- Archive/soft delete menghapus akses operasional tetapi menjaga FK.
- Hard delete hanya untuk staff tanpa histori.
- Semua delete/cancel/override harus audit.

Draft:

- Draft hanya milik user/device yang membuat.
- Draft foto tidak boleh dikirim otomatis tanpa aksi user.
- Draft harus dihapus setelah sukses submit.
- Draft expired harus dibersihkan berkala.

## 10. Validasi Sistem

Client-side:

- Disable tombol berdasarkan `scheduleState`, `nextStep`, `gps.status`, `busy`, dan draft/submission state.
- Validasi foto wajib lengkap sebelum submit.
- Validasi pilihan shift sebelum panggil API.
- Validasi typed confirmation pada delete staff.
- Validasi date range hari libur.

Server-side:

- Semua client-side validation wajib diulang di API.
- `POST /api/schedule/select` harus atomic.
- `POST /api/admin/schedule/assign` harus atomic.
- `POST /api/admin/dayoff` harus atomic dengan auto coverage.
- `POST /api/attendance/checkin` harus resolve `scheduleId` dan menolak jadwal invalid.
- `POST /api/reports/submit` harus check `requiredReports`.
- `POST /api/attendance/checkout` harus check laporan wajib.
- `DELETE /api/admin/staff` harus dependency preflight.
- Idempotency key harus unik per action/scope.

Database:

- Constraint/unique partial index untuk mencegah double booking.
- FK `attendance.schedule_id` ke jadwal baru jika memungkinkan.
- FK delete staff tetap restrict untuk histori.
- Trigger atau RPC transaction untuk assignment conflict.

## 11. Struktur Database yang Direkomendasikan

### 11.1 Tabel Jadwal Baru

```sql
CREATE TYPE shift_type AS ENUM ('SHIFT_1','SHIFT_2','FULL_SHIFT');
CREATE TYPE schedule_status AS ENUM (
  'confirmed','cancelled','admin_override','auto_cover','locked','completed','conflict'
);
CREATE TYPE schedule_source AS ENUM ('staff','admin','auto_dayoff','migration','checkin');

CREATE TABLE staff_shift_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  date DATE NOT NULL,
  shift_type shift_type NOT NULL,
  status schedule_status NOT NULL DEFAULT 'confirmed',
  source schedule_source NOT NULL DEFAULT 'staff',
  requested_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  overridden_from_id UUID REFERENCES staff_shift_assignments(id),
  note TEXT,
  cancel_reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_schedule_staff_active_day
  ON staff_shift_assignments(staff_id, date)
  WHERE status IN ('confirmed','admin_override','auto_cover','locked','completed');

CREATE UNIQUE INDEX ux_schedule_outlet_shift1_active
  ON staff_shift_assignments(outlet_id, date)
  WHERE status IN ('confirmed','admin_override','auto_cover','locked','completed')
    AND shift_type IN ('SHIFT_1','FULL_SHIFT');

CREATE UNIQUE INDEX ux_schedule_outlet_shift2_active
  ON staff_shift_assignments(outlet_id, date)
  WHERE status IN ('confirmed','admin_override','auto_cover','locked','completed')
    AND shift_type IN ('SHIFT_2','FULL_SHIFT');
```

Catatan migrasi:

- Migrasikan row `shift_schedule.status='claimed'` menjadi `staff_shift_assignments`.
- `shift_schedule.shift=1` -> `SHIFT_1`, `shift=2` -> `SHIFT_2`.
- Jika data lama memiliki staff yang sama di shift 1 dan 2 pada tanggal sama, migrasikan menjadi satu row `FULL_SHIFT`.
- Pertahankan `shift_schedule` sebagai legacy read selama satu rilis, atau buat compatibility view bila diperlukan.

### 11.2 Tabel Libur Staff

```sql
CREATE TYPE dayoff_status AS ENUM ('active','cancelled');
CREATE TYPE dayoff_source AS ENUM ('admin','staff_request','migration');

CREATE TABLE staff_dayoff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  date DATE NOT NULL,
  status dayoff_status NOT NULL DEFAULT 'active',
  source dayoff_source NOT NULL DEFAULT 'admin',
  leave_request_id UUID REFERENCES leave_requests(id),
  replacement_schedule_id UUID REFERENCES staff_shift_assignments(id),
  reason TEXT,
  created_by TEXT,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_staff_dayoff_active
  ON staff_dayoff(staff_id, date)
  WHERE status = 'active';
```

### 11.3 Perubahan Attendance

```sql
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES staff_shift_assignments(id),
  ADD COLUMN IF NOT EXISTS shift_type TEXT,
  ADD COLUMN IF NOT EXISTS client_request_id TEXT,
  ADD COLUMN IF NOT EXISTS missing_checkout_flag BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_client_request
  ON attendance(client_request_id)
  WHERE client_request_id IS NOT NULL;
```

Mapping lama:

- `attendance.shift=0` dianggap `FULL_SHIFT`.
- `attendance.shift=1` dianggap `SHIFT_1`.
- `attendance.shift=2` dianggap `SHIFT_2`.

### 11.4 Perubahan Reports

```sql
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS attendance_id UUID REFERENCES attendance(id),
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES staff_shift_assignments(id),
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_reports_client_request
  ON reports(client_request_id)
  WHERE client_request_id IS NOT NULL;
```

Unique lama `idx_reports_outlet_date_type` tetap dipertahankan.

### 11.5 Perubahan Staff untuk Delete Aman

```sql
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_staff_deleted_at ON staff(deleted_at);
```

Query default staff aktif:

```sql
WHERE active = true AND deleted_at IS NULL
```

### 11.6 Idempotency

```sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed')),
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
```

`nonces` lama bisa dipertahankan sementara, tetapi flow draft lebih aman memakai idempotency key yang dapat mengembalikan response sukses hasil retry.

## 12. Perubahan UI/UX

### Staff Schedule

- Tambahkan segmented control atau tombol jelas per tanggal:
  - `Shift 1`,
  - `Shift 2`,
  - `Full Shift`.
- Slot disabled jika sudah diambil staff lain.
- Full Shift disabled jika salah satu slot sudah terisi.
- Tampilkan `Jadwal Saya` di atas daftar tanggal.
- Tampilkan badge `Libur`, `Dipilih`, `Full Shift`, `Dikunci`.

### Staff Home

- Header status utama berdasarkan `scheduleState` dan `nextStep`.
- Empty state:
  - `Belum ada jadwal kerja hari ini`,
  - CTA `Pilih Jadwal`.
- Dayoff state:
  - `Hari ini kamu libur`.
- Flow action hanya menampilkan satu aksi utama yang relevan.
- Draft banner:
  - `Draft ditemukan untuk Laporan Buka Toko`,
  - `Lanjutkan Draft`,
  - `Hapus Draft`.

### Admin Schedule

- Tampilan per tanggal harus berbasis nama staff.
- Card/table minimal:
  - tanggal,
  - Shift 1,
  - Shift 2,
  - Full Shift,
  - staff libur,
  - warning coverage.
- Admin bisa klik `Assign`, `Ubah`, `Batalkan`, `Set Libur`.
- Jika jadwal locked, tampilkan icon/badge `Sudah absen`.

### Admin Dayoff

- Rename dari `Hari Libur Shift` menjadi `Libur Staff`.
- Form:
  - outlet,
  - tanggal/range,
  - staff multi-select,
  - alasan,
  - preview dampak.
- List menampilkan staff name, bukan shift number.

### Admin Staff

- Tombol row:
  - `Edit`,
  - `Nonaktifkan`,
  - menu/danger `Hapus`.
- Modal delete wajib menampilkan dependency count dan typed confirmation.
- Staff archived/deleted tampil di filter `Terhapus/Arsip` jika admin memilih.

### Draft UX

- Jangan mengganggu flow dengan toast besar setiap detik.
- Gunakan status kecil setelah perubahan:
  - `Draft tersimpan`,
  - `Menyimpan draft`,
  - `Gagal menyimpan draft`.
- Saat draft ditemukan, gunakan modal/bottom sheet karena staff mobile-first.

## 13. State Management

Staff home state yang disarankan:

```ts
type ScheduleState = "loading" | "unassigned" | "dayoff" | "ready" | "locked" | "completed" | "error";
type NextStep = "checkin" | "report_buka" | "report_tutup" | "checkout" | "done" | "blocked";
type ShiftType = "SHIFT_1" | "SHIFT_2" | "FULL_SHIFT";
type DraftState = "none" | "found" | "saving" | "saved" | "submit_pending" | "submitted" | "error";
```

Derived state:

- `requiredReports` dari `shiftType`.
- `hasBuka` dan `hasTutup` dari server reports.
- `nextStep` dihitung dari attendance + required reports.
- `canCheckin` true hanya jika jadwal ready + GPS ready + belum check-in.
- `canSubmitReport` true hanya jika report ada di requiredReports dan check-in sudah ada.
- `canCheckout` true hanya jika laporan wajib lengkap.

State storage:

- Session tetap mengikuti implementasi saat ini sampai PRD security dikerjakan.
- Draft foto memakai IndexedDB wrapper, misalnya `lib/draft-store.ts`.
- Data jadwal/attendance tetap di-load dari API, jangan hanya percaya cache client.
- Setelah mutasi sukses, selalu `load()` ulang status dari server.

## 14. Error Handling

Error code yang disarankan:

- `NO_SCHEDULE`: staff belum punya jadwal.
- `STAFF_DAYOFF`: staff sedang libur.
- `SHIFT_TAKEN`: slot sudah diambil staff lain.
- `FULL_SHIFT_CONFLICT`: full shift bentrok dengan slot terisi.
- `SCHEDULE_LOCKED`: staff sudah check-in, jadwal tidak bisa diubah.
- `OUTLET_CLOSED`: outlet ditutup pada tanggal itu.
- `NO_CHECKIN`: laporan/checkout dilakukan sebelum check-in.
- `REPORT_NOT_REQUIRED`: staff tidak wajib/berhak mengirim tipe laporan itu.
- `REQUIRED_REPORT_MISSING`: checkout ditolak karena laporan wajib belum lengkap.
- `DUPLICATE_SUBMIT`: idempotency key sudah dipakai.
- `DRAFT_SAVE_FAILED`: browser gagal menyimpan draft.
- `STAFF_HAS_HISTORY`: hard delete ditolak karena dependency ada.
- `CONFIRMATION_MISMATCH`: nama staff konfirmasi tidak cocok.

Pesan UX:

- Gunakan pesan pendek dan actionable.
- Untuk staff, jangan tampilkan istilah teknis DB.
- Untuk admin, tampilkan alasan dan data yang perlu diperbaiki.

Contoh:

- `Jadwal hari ini belum dipilih. Pilih jadwal dulu sebelum absen.`
- `Shift 1 sudah diambil Evi. Pilih shift lain atau hubungi admin.`
- `Jayak sudah punya absensi pada 19 Mei 2026. Jadwal tidak bisa diubah biasa.`
- `Data staff ini punya 24 absensi dan 3 pembayaran. Gunakan Arsipkan Staff, bukan Hapus Permanen.`

## 15. Edge Cases

- Dua staff mengambil shift yang sama bersamaan: hanya satu sukses; yang lain menerima `SHIFT_TAKEN`.
- Staff mengambil Full Shift saat Shift 1 sudah diambil staff lain: ditolak.
- Staff mengambil Shift 2 saat sudah punya Shift 1 tanggal yang sama: ditolak atau diarahkan upgrade ke Full Shift jika slot tersedia.
- Admin set Jayak libur saat Jayak sudah mengambil Shift 1: jadwal Jayak dibatalkan jika belum check-in.
- Admin set Jayak libur saat Jayak sudah check-in: ditolak dengan `SCHEDULE_LOCKED`.
- Semua staff outlet libur: ditolak kecuali admin memilih `Tutup Outlet`.
- Hanya tersisa satu staff tersedia: auto Full Shift.
- Staff refresh setelah mengambil 4 foto laporan: draft muncul dan bisa dilanjutkan.
- Staff submit laporan, koneksi putus setelah server sukses: retry dengan idempotency key membaca status dan tidak membuat duplikat.
- Admin mengganti konfigurasi laporan saat staff punya draft lama: saat restore, validasi ulang item config; foto yang labelnya masih ada dipertahankan, item yang hilang ditandai orphan dan tidak dikirim.
- Staff lupa checkout sampai lewat tengah malam: effective date mengikuti `getEffectiveDate`; dashboard memberi flag missing checkout.
- Outlet shift 1 mode: staff schedule hanya menampilkan Full Day, absensi memakai `shift=0` atau tetap `shift=0` untuk konsistensi full-day.
- Legacy `shift_dayoff` masih ada: API schedule baru harus membaca dan menandai sebagai `legacy conflict` sampai dimigrasi.
- Staff deleted/archived masih ada di laporan lama: admin viewer tetap menampilkan snapshot `staff_name`.

## 16. Acceptance Criteria

### Jadwal Staff

- Staff dapat memilih `Shift 1`, `Shift 2`, dan `Full Shift`.
- Pilihan staff langsung tampil di `/admin/schedule`.
- Full Shift mengunci coverage Shift 1 dan Shift 2 pada outlet/tanggal yang sama.
- Staff tidak bisa mengambil shift yang bentrok.
- Admin bisa override jadwal sebelum check-in.
- Admin tidak bisa mengubah jadwal locked tanpa flow revisi.

### Draft Foto

- Foto laporan tidak hilang setelah refresh sebelum submit.
- Selfie check-in/checkout yang gagal submit bisa diretry dari draft.
- Draft ditemukan menampilkan `Lanjutkan Draft` dan `Hapus Draft`.
- Submit sukses menghapus draft.
- Retry submit tidak membuat laporan/attendance dobel.

### Delete Staff

- UI membedakan `Nonaktifkan` dan `Hapus`.
- Nonaktif membuat staff tidak bisa login tetapi histori tetap ada.
- Hapus dengan dependency > 0 melakukan archive/soft delete atau diblokir dari hard delete.
- Hard delete hanya aktif jika dependency 0 dan konfirmasi nama cocok.
- Audit log mencatat semua aksi.

### Libur Staff

- Admin set libur berdasarkan nama staff.
- UI admin menampilkan staff libur berdasarkan nama.
- Jika hanya satu staff tersedia, sistem auto assign Full Shift.
- Jika semua staff libur, sistem menolak kecuali outlet ditutup.
- Staff yang libur tidak bisa absen.

### Absensi dan Laporan

- Shift 1 hanya meminta laporan BUKA.
- Shift 2 hanya meminta laporan TUTUP.
- Full Shift meminta laporan BUKA dan TUTUP.
- Staff tidak bisa checkout sebelum laporan wajib lengkap.
- Staff tanpa jadwal tidak bisa absen.
- Late calculation memakai start time jadwal.

## 17. Checklist Implementasi untuk Developer

1. Buat migration `staff_shift_assignments`, `staff_dayoff`, kolom tambahan attendance/reports/staff, dan `idempotency_keys`.
2. Tulis migration data dari `shift_schedule` ke `staff_shift_assignments`.
3. Update `types/domain.ts` dengan `ShiftType`, `StaffShiftAssignment`, `StaffDayoff`, draft-related types.
4. Buat helper business rules:
   - resolve schedule,
   - required reports by shift,
   - conflict detection,
   - auto coverage dayoff,
   - delete dependency preview.
5. Update API schedule staff:
   - weekly read,
   - select shift,
   - cancel shift.
6. Update API admin schedule:
   - list by outlet/week,
   - assign/override,
   - cancel,
   - lock checks.
7. Update API admin dayoff agar berbasis staff, bukan shift.
8. Update `attendance/status` agar schedule-based.
9. Update `checkin` agar wajib `scheduleId` valid dan menyimpan `shift_type`.
10. Update `submitReport` agar validasi `requiredReports`.
11. Update `checkout` agar validasi laporan wajib berdasarkan `shift_type`.
12. Buat `lib/draft-store.ts` IndexedDB wrapper.
13. Integrasikan draft di staff home untuk check-in, checkout, BUKA, TUTUP.
14. Integrasikan draft di admin report config, payroll proof, dan staff photo/KTP bila UI upload tersedia.
15. Update `/app/schedule` untuk opsi Full Shift dan status libur.
16. Update `/admin/schedule` untuk tampilan nama staff dan full shift.
17. Update `/admin/dayoff` menjadi `Libur Staff`.
18. Update `/admin/staff` dengan delete preview dan modal konfirmasi.
19. Tambahkan audit log untuk assign, override, dayoff, delete, draft submit success/failure jika relevan.
20. Tambahkan test manual/otomatis untuk race condition shift claim, full shift, dayoff, draft restore, dan delete staff.

## 18. Rekomendasi Teknis agar Minim Bug

- Jadikan `staff_shift_assignments` sebagai satu-satunya sumber kebenaran jadwal baru. Jangan membuat logic baru bergantung pada `detectShift` kecuali fallback legacy.
- Implementasikan operasi schedule/dayoff lewat RPC/transaction database agar partial unique index dan auto coverage konsisten.
- Pertahankan `attendance.shift` 0/1/2 untuk kompatibilitas, tetapi tambahkan `shift_type`/`schedule_id` untuk logic baru.
- Jangan hard delete staff dengan histori. Gunakan archive/soft delete sebagai default operasional.
- Jangan simpan foto draft di `localStorage`; gunakan IndexedDB dan TTL.
- Gunakan idempotency key, bukan nonce sekali pakai sederhana, untuk flow draft dan retry.
- Semua button visibility di UI harus berasal dari state server (`scheduleState`, `nextStep`, `requiredReports`), bukan tebakan client saja.
- Setelah setiap mutasi, reload status dari API agar UI tidak menyimpan state usang.
- Buat migration bertahap:
  - fase 1 tambah tabel/kolom,
  - fase 2 dual-read legacy + new,
  - fase 3 UI/API pakai new,
  - fase 4 legacy cleanup setelah data tervalidasi.
- Tambahkan halaman admin atau script audit data:
  - jadwal bentrok,
  - staff dayoff tetapi masih punya schedule,
  - full shift yang tidak punya attendance shift 0,
  - report yang tidak cocok dengan schedule,
  - staff deleted tetapi masih active.
- Simpan snapshot nama (`staff_name`) tetap dipertahankan di histori untuk menjaga laporan lama bisa dibaca walau staff diarsipkan.
- Gunakan timezone bisnis `Asia/Jakarta` secara konsisten karena `lib/business.ts` saat ini memakai `APP_TIME_ZONE = "Asia/Jakarta"`.
