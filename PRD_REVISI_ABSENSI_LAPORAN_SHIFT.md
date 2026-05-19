# PRD Revisi Absensi, Laporan, Icon, dan Shift

## Ringkasan

Dokumen ini mendefinisikan revisi untuk Staff Portal Roti Bakar Ngeunah berdasarkan pembacaan kode Next.js, API route, schema Supabase, dan halaman admin/staff. Fokus revisi:

1. Tombol absen masuk tidak boleh bisa dipakai sebelum koordinat GPS valid, dan proses GPS harus terasa lebih cepat serta jelas statusnya.
2. Konfigurasi laporan tidak boleh sukses palsu saat label kosong atau data yang dikirim tidak valid.
3. Icon aplikasi/flaticon harus tersedia sebagai asset lokal dan terdaftar di metadata/manifest.
4. Outlet 2 shift tidak boleh memiliki dua shift libur di tanggal yang sama. Jika satu shift libur, shift lainnya otomatis menjadi full shift dengan gaji 2x dan wajib menjalankan alur kerja dua shift.

## Source Code Yang Ditinjau

- `app/(staff)/app/home/page.tsx`
- `app/(staff)/app/schedule/page.tsx`
- `app/(admin)/admin/report-cfg/page.tsx`
- `app/(admin)/admin/schedule/page.tsx`
- `app/(admin)/admin/dayoff/page.tsx`
- `app/(admin)/admin/reports/page.tsx`
- `app/(admin)/admin/attendance/page.tsx`
- `app/api/[[...path]]/route.ts`
- `lib/business.ts`
- `app/manifest.ts`
- `app/layout.tsx`
- `components/staff/staff-page.tsx`
- `supabase/migrations/0001_initial_schema.sql`

## Masalah Saat Ini

### 1. GPS dan tombol absen masuk

Temuan kode:

- `app/(staff)/app/home/page.tsx` menginisialisasi GPS dengan status `wait`.
- Tombol `Absen Masuk` hanya disabled saat `gps.status === "bad"`, sehingga saat status masih `wait` tombol tetap bisa dibuka.
- `watchPosition` berjalan di background, tetapi saat absen dikirim fungsi `runAttendance` tetap memanggil `getCurrentPosition` ulang setelah selfie diambil. Ini membuat user merasa GPS lama karena menunggu lagi setelah kamera selesai.
- `watchPosition` tidak diberi `timeout` dan `maximumAge`, sehingga tidak ada batas tunggu dan tidak ada strategi memakai fix terakhir.
- `checkout` juga menunggu `getCurrentPosition`, padahal endpoint `checkout` saat ini tidak membaca atau memvalidasi `lat/lng`.
- Server `checkin` sudah menolak `lat/lng` kosong, tetapi UX masih membiarkan user masuk ke flow kamera sebelum GPS valid.

### 2. Konfigurasi laporan sukses tetapi data tidak muncul/berubah

Temuan kode:

- UI `app/(admin)/admin/report-cfg/page.tsx` mengirim `items` tanpa validasi label.
- Server `adminReportCfg` menyaring item dengan label kosong. Jika semua label kosong, server menghapus konfigurasi lama lalu mengembalikan `ok` dengan `items: []`.
- Jika UI mengirim `items: []`, server masuk ke jalur single insert dan dapat menyimpan label kosong karena `label` hanya `TEXT NOT NULL`, bukan `trim(label) <> ''`.
- Update konfigurasi juga dapat mengubah label menjadi kosong.
- Tidak ada validasi label duplikat. Padahal staff report memakai `reportPhotos[item.label]`, sehingga label duplikat saling menimpa.
- Operasi replace konfigurasi tidak transaksional: konfigurasi lama dihapus sebelum insert selesai.

### 3. Flaticon/icon aplikasi tidak ada

Temuan kode:

- Tidak ada file icon di `public/` selain `sw.js`.
- `app/manifest.ts` memakai URL icon remote Cloudinary.
- `app/layout.tsx` hanya mendaftarkan manifest, belum mendaftarkan `favicon`, `apple-touch-icon`, atau metadata `icons`.
- `components/staff/staff-page.tsx` memakai logo remote dari owner portal.
- Tidak ada package/CSS Flaticon. Navigasi memakai `lucide-react`; beberapa status memakai emoji.

Catatan: Jika yang dimaksud adalah favicon/PWA icon, asset memang belum tersedia lokal. Jika yang dimaksud adalah library Flaticon, library tersebut belum diinstal atau diload.

### 4. Dua shift bisa sama-sama libur dan full shift belum konsisten

Temuan kode:

- Table `shift_dayoff` hanya punya unique index per `outlet_id,date,shift`. Tidak ada constraint yang mencegah shift 1 dan shift 2 sama-sama libur pada outlet/tanggal yang sama.
- `adminSchedule` dapat menyimpan `status: "off"` tanpa cek shift lain sudah off.
- `adminDayoff` dapat insert/upsert dayoff tanpa cek shift lain sudah off.
- `weeklySchedule` menampilkan tiap slot apa adanya, sehingga dua slot bisa tampil `Libur`.
- `checkin` hanya mengecek apakah shift lain libur untuk menghitung gaji 2x. Kode belum mengecek apakah shift yang sedang dipakai justru sedang libur.
- Saat full shift karena shift lain libur, attendance tetap disimpan sebagai shift 1 atau shift 2, bukan shift 0/full.
- Flow staff memakai `status.shift`:
  - shift 1 hanya wajib laporan BUKA.
  - shift 2 hanya wajib laporan TUTUP.
  - shift 0 wajib BUKA dan TUTUP.
- Karena full shift 2x tetap disimpan sebagai shift 1/2, staff tidak otomatis menjalankan dua laporan.
- `submitReport` hanya mengizinkan:
  - BUKA jika ada attendance shift 0 atau 1.
  - TUTUP jika ada attendance shift 0 atau 2.
  Jadi attendance shift 1 dengan flag full shift tidak bisa submit TUTUP.
- Perhitungan telat full shift masih memakai start time shift aktif, bukan start time full-day.

## Tujuan Produk

- Staff hanya dapat mulai absen saat GPS sudah siap, akurat, dan berada dalam radius outlet.
- Admin tidak mendapat status sukses palsu untuk konfigurasi laporan yang tidak valid.
- Icon aplikasi muncul konsisten di browser tab, install PWA, dan header.
- Sistem shift 2 outlet menjaga minimal satu shift aktif per hari.
- Jika satu shift libur, shift lain otomatis menjadi full shift dengan konsekuensi operasional lengkap: absen masuk, laporan buka toko, laporan tutup toko, absen keluar, dan gaji 2x.

## Non-Goal

- Tidak mengubah provider database dari Supabase.
- Tidak mengubah sistem upload foto eksternal.
- Tidak mengubah perhitungan dasar potongan telat selain penyesuaian start time full shift.
- Tidak membuat ulang desain UI dari nol.

## Requirement Fungsional

### A. GPS dan absensi

1. Staff home harus memiliki state GPS eksplisit:
   - `unsupported`
   - `permission_pending`
   - `permission_denied`
   - `locating`
   - `ready`
   - `outside_radius`
   - `low_accuracy`
   - `timeout`
2. Tombol `Absen Masuk` disabled sampai:
   - browser mendukung geolocation,
   - izin lokasi diberikan,
   - koordinat tersedia,
   - jarak berada dalam radius outlet,
   - fix GPS belum kedaluwarsa,
   - akurasi memenuhi batas minimal.
3. Saat GPS masih mencari lokasi, tombol menampilkan teks seperti `Menunggu GPS...` dan tidak membuka kamera.
4. Kamera absen masuk baru boleh dibuka setelah GPS valid.
5. `runAttendance("checkin")` harus memakai GPS fix terakhir yang valid. Jangan selalu memanggil `getCurrentPosition` ulang jika fix masih valid.
6. Jika fix terakhir lebih tua dari batas yang ditentukan, aplikasi boleh melakukan refresh lokasi cepat dengan timeout jelas.
7. Checkout tidak boleh menunggu GPS jika business rule tidak mewajibkan geofence checkout. Jika checkout tetap diwajibkan memakai GPS, server endpoint `checkout` juga harus memvalidasi `lat/lng`.
8. Server tetap menjadi source of truth:
   - `checkin` menolak lat/lng kosong.
   - `checkin` menolak lokasi di luar radius.
   - `checkin` menolak check-in ke shift yang sedang libur.
9. Tambahkan pesan error yang spesifik:
   - GPS ditolak oleh user.
   - GPS timeout.
   - GPS terlalu jauh.
   - Akurasi GPS terlalu rendah.

Acceptance criteria:

- Pada status GPS `locating`, tombol absen masuk tidak bisa diklik.
- Pada status GPS `outside_radius`, tombol absen masuk tidak bisa diklik dan menampilkan jarak.
- Pada status GPS `ready`, tombol absen masuk bisa membuka kamera.
- Setelah selfie dikonfirmasi, request checkin memakai koordinat yang sudah siap tanpa tunggu ulang yang panjang.
- Jika server menerima request tanpa lat/lng, response tetap gagal.

### B. Konfigurasi laporan

1. Save konfigurasi laporan harus memvalidasi di client dan server.
2. Label item wajib:
   - trim whitespace,
   - panjang minimal 2 karakter,
   - panjang maksimal 80 karakter,
   - unik dalam kombinasi outlet + tipe laporan.
3. Save tidak boleh sukses jika ada item label kosong.
4. Save tidak boleh diam-diam menghapus konfigurasi lama hanya karena semua label kosong.
5. Jika admin ingin menghapus semua item laporan, harus ada aksi terpisah `Kosongkan Konfigurasi` dengan confirmation dialog.
6. API batch replace harus memvalidasi seluruh payload sebelum delete/insert.
7. Replace konfigurasi harus atomic. Rekomendasi:
   - buat RPC Supabase `replace_report_cfg(outlet_id, type, items_json)` dengan transaction, atau
   - insert data baru setelah validasi/upload sukses, lalu hapus data lama dalam operasi yang aman.
8. Endpoint single insert/update juga wajib menolak label kosong.
9. Tambahkan unique constraint/index untuk mencegah duplikat label normalized:
   - `outlet_id`
   - `type`
   - `lower(trim(label))`
10. UI menampilkan error per baris dan tidak hanya `MsgBar` global.
11. Setelah save berhasil, UI harus reload dan menampilkan jumlah item tersimpan.

Acceptance criteria:

- Menekan save dengan satu item label kosong menampilkan error dan tidak mengirim perubahan.
- Mengirim payload label kosong langsung ke API menghasilkan response error.
- Konfigurasi lama tidak hilang jika payload baru tidak valid.
- Label duplikat ditolak di UI dan API.
- Setelah save valid, list item yang muncul sama dengan data dari server.

### C. Icon aplikasi/flaticon

1. Tambahkan asset icon lokal:
   - `public/icons/favicon.ico`
   - `public/icons/icon-192.png`
   - `public/icons/icon-512.png`
   - `public/icons/apple-touch-icon.png`
   - opsional `public/icons/maskable-512.png`
2. Update `app/layout.tsx` metadata:
   - `icons.icon`
   - `icons.apple`
3. Update `app/manifest.ts` agar memakai path lokal, bukan URL remote.
4. Header staff boleh tetap memakai brand logo, tetapi sebaiknya memakai asset lokal agar tidak hilang saat domain remote bermasalah.
5. Jika benar-benar ingin Flaticon, tambahkan dependency/CSS resmi dan daftar icon yang dipakai. Jika tidak, standar aplikasi adalah `lucide-react` + asset brand lokal.

Acceptance criteria:

- Browser tab menampilkan favicon.
- Manifest PWA memiliki icon 192 dan 512 dari origin aplikasi.
- Install PWA di mobile menampilkan icon yang benar.
- Tidak ada request 404 untuk icon.

### D. Aturan libur shift dan full shift

1. Outlet 2 shift tidak boleh memiliki shift 1 dan shift 2 sama-sama off pada tanggal yang sama.
2. Aturan ini wajib diterapkan di:
   - `adminSchedule`
   - `adminDayoff`
   - database trigger/constraint
   - UI admin schedule
   - UI admin dayoff
3. Saat admin mencoba off shift terakhir yang masih aktif, tampilkan error:
   - `Tidak bisa meliburkan kedua shift pada tanggal yang sama. Minimal satu shift harus aktif.`
4. Jika satu shift off, shift lain menjadi full shift otomatis.
5. Full shift harus tampak di jadwal:
   - shift off tampil disabled sebagai `Libur`.
   - shift aktif tampil `Full Shift`.
   - tombol assign/claim pada shift aktif tetap tersedia.
   - tombol off untuk shift aktif disabled jika shift lain sudah off.
6. Attendance full shift harus konsisten. Rekomendasi implementasi:
   - simpan attendance sebagai `shift = 0` saat satu shift lain off,
   - set flag `FULL_SHIFT_2X`,
   - final salary memakai `salary_per_shift * 2`,
   - shift start memakai `shift1_start`,
   - shift end memakai `shift2_end`.
7. Staff home untuk full shift harus memakai alur:
   - absen masuk,
   - laporan BUKA,
   - laporan TUTUP,
   - absen keluar.
8. `submitReport` harus mengizinkan BUKA dan TUTUP untuk attendance full shift.
9. `checkout` full shift harus menolak checkout sebelum laporan BUKA dan TUTUP lengkap.
10. `checkin` harus menolak check-in ke shift yang sedang off.
11. Jika staff mencoba check-in pada tanggal outlet yang dua shift-nya sudah off akibat data lama, server harus menolak dan meminta admin memperbaiki jadwal.
12. Payroll harus menampilkan full shift sebagai satu baris dengan gaji 2x, bukan dua baris duplikat.

Acceptance criteria:

- Admin tidak bisa membuat Shift 1 dan Shift 2 sama-sama libur untuk outlet/tanggal yang sama.
- Jika Shift 2 libur, Shift 1 muncul sebagai Full Shift.
- Jika Shift 1 libur, Shift 2 muncul sebagai Full Shift.
- Staff yang masuk full shift mendapat final salary 2x sebelum potongan telat.
- Staff full shift wajib submit laporan BUKA dan TUTUP sebelum checkout.
- Staff tidak bisa checkin pada shift yang statusnya Libur.
- Data payroll menampilkan full shift dengan label `Full` dan nominal 2x.

## Requirement Teknis

### API

Endpoint yang perlu direvisi:

- `GET /api/attendance/status`
  - Return status shift efektif:
    - `shift`
    - `effectiveShift`
    - `isFullShift`
    - `offShift`
    - `activeShift`
    - `scheduleStatus`
- `POST /api/attendance/checkin`
  - Validasi current shift tidak off.
  - Resolve full shift sebelum insert attendance.
  - Insert `shift = 0` untuk full shift.
  - Hitung salary 2x dan start time full-day.
- `POST /api/attendance/checkout`
  - Untuk `shift = 0`, wajib BUKA dan TUTUP.
- `POST /api/reports/submit`
  - Full shift boleh submit BUKA dan TUTUP.
- `POST /api/admin/report-cfg`
  - Validasi label.
  - Tolak payload kosong tidak eksplisit.
  - Jangan delete sebelum payload valid.
- `PUT /api/admin/report-cfg`
  - Tolak label kosong/duplikat.
- `POST /api/admin/schedule`
  - Cegah off kedua shift.
  - Cegah assign ke shift off.
- `POST /api/admin/dayoff`
  - Cegah off kedua shift dalam range tanggal.
  - Jika sebagian tanggal invalid, kembalikan daftar tanggal yang gagal.

### Database

Migration baru disarankan:

1. Constraint/trigger untuk `report_cfg`:
   - label tidak blank setelah trim.
   - unique normalized label per outlet dan type.
2. Trigger untuk `shift_dayoff`:
   - sebelum insert/update, cek tidak ada shift lain off untuk outlet/tanggal yang sama.
3. Data cleanup:
   - cari `report_cfg` label kosong.
   - cari `shift_dayoff` outlet/tanggal dengan count > 1.
   - hasil cleanup harus dilaporkan sebelum migration constraint dijalankan.

### UI

Staff home:

- Tombol absen masuk mengikuti state GPS.
- Tampilkan instruksi ringkas saat izin lokasi belum diberikan.
- Tampilkan retry GPS.
- Full shift menampilkan badge `Full Shift`.
- Full shift menampilkan progress BUKA dan TUTUP.

Admin report config:

- Error per row untuk label kosong/duplikat.
- Save disabled saat data invalid.
- Tambah tombol eksplisit untuk menghapus semua item.
- Success message harus memuat jumlah item tersimpan.

Admin schedule/dayoff:

- Disable tombol off saat shift lain sudah libur.
- Tampilkan shift aktif sebagai `Full Shift`.
- Jika API menolak, tampilkan pesan error dari server.

## Edge Case

- User menolak permission GPS.
- GPS siap tetapi akurasi terlalu besar.
- GPS fix lama masih ada tetapi sudah melebihi TTL.
- Admin membuka konfigurasi laporan yang sudah memiliki label kosong dari data lama.
- Admin menyimpan report config bersamaan dari dua tab.
- Outlet 2 shift sudah punya dua dayoff dari data lama.
- Shift 1 off lalu staff Shift 2 checkin sebelum jam Shift 2 lama. Untuk full shift, jam mulai harus ikut `shift1_start`.
- Checkout full shift dilakukan sebelum laporan TUTUP.

## Prioritas Implementasi

P0:

- Blok tombol absen masuk sampai GPS valid.
- Validasi report config label di client dan server.
- Cegah dua shift off di API.
- Full shift wajib BUKA dan TUTUP.

P1:

- Tambah constraint/trigger database.
- Perbaiki GPS retry/timeout/cached fix.
- Icon lokal dan metadata/manifest.
- UI full shift di admin/staff schedule.

P2:

- Audit log lebih detail untuk GPS dan full shift.
- Cleanup data lama dengan laporan admin.
- Configurable GPS accuracy/timeout.

## QA Checklist

- Jalankan typecheck dan build.
- Test manual staff home di browser mobile:
  - GPS denied.
  - GPS locating.
  - GPS outside radius.
  - GPS ready.
- Test API langsung:
  - checkin tanpa lat/lng gagal.
  - report config label kosong gagal.
  - dayoff shift kedua gagal jika shift lain sudah off.
- Test full shift:
  - buat shift 2 off.
  - assign/claim shift 1.
  - staff checkin.
  - cek attendance shift full dan gaji 2x.
  - submit laporan BUKA.
  - checkout sebelum TUTUP harus gagal.
  - submit TUTUP.
  - checkout berhasil.
- Test icon:
  - `/favicon.ico` atau metadata icon tidak 404.
  - manifest icon path lokal bisa dibuka.

## Risiko

- Mengubah penyimpanan full shift menjadi `shift = 0` perlu kompatibilitas dengan laporan/payroll lama.
- Database trigger perlu cleanup data existing sebelum aktif.
- GPS behavior sangat tergantung browser dan device, sehingga UX harus tetap memberi retry manual dan pesan jelas.
- Replace report config atomic mungkin butuh RPC Supabase agar benar-benar transaksional.

## Open Questions

- Apakah full shift selalu mulai dari `shift1_start` dan selesai di `shift2_end`, termasuk saat Shift 1 libur dan Shift 2 yang bekerja?
- Apakah checkout juga harus divalidasi geofence GPS, atau hanya checkin?
- Apakah konfigurasi laporan boleh benar-benar kosong, atau minimal harus ada satu item selain selfie?
- Apakah yang dimaksud "flaticon" adalah favicon/app icon, atau icon dari library Flaticon?
