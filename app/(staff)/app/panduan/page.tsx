"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";

type Section = {
  id: string;
  emoji: string;
  title: string;
  steps: Array<{ icon: string; title: string; desc: string }>;
  tips?: string[];
};

const SECTIONS: Section[] = [
  {
    id: "alur",
    emoji: "🗓️",
    title: "Alur Kerja Harian",
    steps: [
      { icon: "1️⃣", title: "Pilih Jadwal (H-1)", desc: "Buka menu Jadwal → pilih Shift 1, Shift 2, atau Full Shift SEHARI SEBELUM tanggal shift. Lewat dari itu hanya admin yang bisa ubah." },
      { icon: "2️⃣", title: "Absen Masuk", desc: "Buka Home → izinkan GPS → tunggu GPS siap → ambil selfie → tap Absen Masuk." },
      { icon: "3️⃣", title: "Laporan Buka Toko", desc: "Setelah absen masuk, isi laporan buka toko dengan foto yang diminta admin." },
      { icon: "4️⃣", title: "Laporan Tutup Toko", desc: "Sebelum pulang, isi laporan tutup toko dengan foto kondisi toko saat penutupan." },
      { icon: "5️⃣", title: "Absen Pulang", desc: "Setelah semua laporan terkirim, tap Absen Pulang dengan selfie." }
    ],
    tips: ["Selesaikan setiap langkah secara berurutan", "Jangan keluar dari app saat sedang mengisi laporan"]
  },
  {
    id: "absen",
    emoji: "📍",
    title: "Cara Absen Masuk & Pulang",
    steps: [
      { icon: "📍", title: "Aktifkan GPS", desc: "Saat buka halaman Home, izinkan akses lokasi ketika browser meminta. Pastikan GPS HP aktif." },
      { icon: "⏳", title: "Tunggu GPS Siap", desc: "Indikator GPS di layar harus berwarna hijau dan menunjukkan jarak ke outlet. Jika masih abu-abu, tunggu beberapa detik." },
      { icon: "📸", title: "Ambil Selfie", desc: "Tap tombol Absen Masuk → arahkan kamera ke wajah → pastikan wajah jelas dan tidak gelap → tap Ambil." },
      { icon: "✅", title: "Absen Terkirim", desc: "Layar akan berubah ke status berikutnya (Laporan Buka) jika absen berhasil." }
    ],
    tips: [
      "Harus berada dalam radius outlet (tertera di layar)",
      "Jika GPS 'Di Luar Area', pindah lebih dekat ke toko",
      "Absen pulang tidak perlu GPS — cukup selfie"
    ]
  },
  {
    id: "laporan",
    emoji: "📝",
    title: "Cara Mengisi Laporan",
    steps: [
      { icon: "🌅", title: "Laporan Buka Toko", desc: "Dilakukan setelah absen masuk. Foto kondisi toko saat buka: kasir, display produk, area bersih." },
      { icon: "🌙", title: "Laporan Tutup Toko", desc: "Dilakukan sebelum absen pulang. Foto kondisi toko saat tutup: kasir dimatikan, toko bersih, pintu terkunci." },
      { icon: "⏰", title: "Jam Laporan", desc: "Laporan hanya bisa dikirim pada jam yang ditentukan admin. Jika belum waktunya, muncul pesan 'Belum Waktunya'." },
      { icon: "📤", title: "Submit Laporan", desc: "Setelah semua foto wajib (bertanda *) terisi, tap tombol Kirim Laporan." }
    ],
    tips: [
      "Foto bertanda * wajib diisi sebelum bisa kirim",
      "Foto opsional (tidak berbintang) bisa dilewati",
      "Lihat FOTO CONTOH sebagai panduan standar foto yang benar"
    ]
  },
  {
    id: "foto",
    emoji: "📷",
    title: "Cara Upload Foto Laporan",
    steps: [
      { icon: "📷", title: "Tap Tombol Foto", desc: "Pada setiap item laporan, tap tombol biru 'Foto' untuk membuka kamera." },
      { icon: "🔦", title: "Aktifkan Senter (opsional)", desc: "Jika tempat gelap, tap ikon senter di pojok kamera untuk menyalakan flash." },
      { icon: "🎯", title: "Arahkan Kamera", desc: "Arahkan ke area yang sesuai item laporan. Lihat FOTO CONTOH sebagai panduan. Pastikan objek terlihat jelas." },
      { icon: "✅", title: "Tap Ambil / Gunakan Foto", desc: "Setelah foto bagus, konfirmasi untuk menggunakan foto. Foto preview akan muncul di kartu laporan." },
      { icon: "🔄", title: "Ubah Foto", desc: "Jika foto kurang bagus, tap tombol 'Ubah' (hijau) untuk mengambil ulang." }
    ],
    tips: [
      "Foto harus terang dan tidak blur",
      "Jangan foto terlalu jauh atau terlalu dekat",
      "Watermark nama outlet ditambahkan otomatis"
    ]
  },
  {
    id: "jadwal",
    emoji: "📅",
    title: "Cara Memilih Jadwal Shift",
    steps: [
      { icon: "📅", title: "Buka Menu Jadwal", desc: "Tap ikon Jadwal di menu bawah layar." },
      { icon: "👀", title: "Lihat Jadwal Minggu Ini", desc: "Akan muncul daftar hari dalam seminggu beserta slot shift yang tersedia." },
      { icon: "⏰", title: "Aturan H-1", desc: "Pilih shift hanya bisa dilakukan SEHARI SEBELUM tanggal shift. Contoh: shift Selasa harus dipilih paling lambat hari Senin. Hari yang sudah lewat atau hari ini terkunci otomatis." },
      { icon: "👆", title: "Pilih Shift", desc: "Tap tombol 'Ambil Shift 1', 'Ambil Shift 2', atau 'Ambil Full Shift' pada hari yang diinginkan." },
      { icon: "✅", title: "Jadwal Tersimpan", desc: "Kartu 'Jadwal Saya' akan muncul dengan detail shift yang dipilih." },
      { icon: "❌", title: "Batalkan Shift", desc: "Tap tombol 'Batal' jika perlu membatalkan. Hanya bisa dilakukan H-1 (sehari sebelum). Setelah absen masuk, jadwal terkunci dan tidak bisa dibatalkan sendiri." },
      { icon: "🆘", title: "Perubahan Mendadak", desc: "Jika ada keperluan mendadak di hari yang sama (hari H), hubungi admin langsung. Hanya admin yang bisa mengubah jadwal di hari yang sama." }
    ],
    tips: [
      "Full Shift = kerja dua shift sekaligus (gaji 2x)",
      "Satu outlet hanya boleh 1 orang per slot shift",
      "Pilih jadwal sebelum hari H (sehari sebelumnya)",
      "Hari ini dan hari lalu sudah terkunci — hubungi admin untuk koreksi"
    ]
  },
  {
    id: "libur",
    emoji: "🏖️",
    title: "Cara Mengajukan Libur",
    steps: [
      { icon: "⏰", title: "Aturan H-1", desc: "Pengajuan libur hanya bisa dilakukan SEHARI SEBELUM tanggal libur. Contoh: libur Selasa harus diajukan paling lambat hari Senin." },
      { icon: "📋", title: "Ajukan via Jadwal", desc: "Buka menu Jadwal → cari tanggal yang diinginkan → tap tombol 'Ajukan Libur'. Permintaan akan menunggu persetujuan admin." },
      { icon: "❌", title: "Batalkan Permintaan Libur", desc: "Jika sudah mengajukan libur tapi ingin membatalkan, tap tombol 'Batalkan' di samping permintaan libur. Hanya bisa dibatalkan sebelum admin menyetujui dan masih H-1." },
      { icon: "🔔", title: "Status Libur Muncul di Home", desc: "Jika sudah disetujui admin, halaman Home akan menampilkan kartu 'Hari Ini Kamu Libur' dengan keterangan alasan." },
      { icon: "🚫", title: "Tidak Bisa Absen Saat Libur", desc: "Tombol absen tidak tersedia ketika status libur aktif. Ini normal — tidak perlu panik." },
      { icon: "🆘", title: "Libur Mendadak", desc: "Jika ada keperluan mendadak di hari yang sama, hubungi admin langsung. Hanya admin yang bisa menginput libur mendadak." }
    ],
    tips: [
      "Ajukan libur jauh hari sebelum tanggal yang diinginkan",
      "H-1 = sehari sebelumnya adalah batas terakhir pengajuan mandiri",
      "Libur mendadak hari ini: hubungi admin secara langsung",
      "Cek status di halaman Jadwal untuk memastikan libur sudah tercatat"
    ]
  },
  {
    id: "status",
    emoji: "🚦",
    title: "Penjelasan Status & Notifikasi",
    steps: [
      { icon: "👋", title: "Belum Absen Masuk", desc: "Kamu belum melakukan absen masuk hari ini. Lakukan absen masuk terlebih dahulu." },
      { icon: "🌅", title: "Laporan Buka Toko", desc: "Absen masuk sudah tercatat. Sekarang isi laporan buka toko." },
      { icon: "🌙", title: "Laporan Tutup Toko", desc: "Laporan buka sudah terkirim. Sekarang isi laporan tutup toko." },
      { icon: "✅", title: "Siap Absen Pulang", desc: "Semua laporan selesai. Tap tombol Absen Pulang untuk menyelesaikan shift." },
      { icon: "🎉", title: "Shift Selesai", desc: "Absen pulang berhasil. Gaji hari ini sudah dihitung. Kerja bagus!" },
      { icon: "🏖️", title: "Hari Ini Libur", desc: "Kamu dijadwalkan libur hari ini. Absen tidak diperlukan." },
      { icon: "📋", title: "Belum Ada Jadwal", desc: "Kamu belum memilih jadwal untuk hari ini. Buka menu Jadwal dan pilih shift." }
    ],
    tips: [
      "Jika status tidak berubah setelah aksi, tap Refresh",
      "Jika ada error, coba tutup dan buka ulang app",
      "Hubungi admin jika status salah atau tidak sesuai"
    ]
  },
  {
    id: "gaji",
    emoji: "💰",
    title: "Informasi Gaji & Potongan",
    steps: [
      { icon: "💵", title: "Gaji Per Shift", desc: "Gaji dihitung per shift sesuai ketentuan yang ditetapkan admin." },
      { icon: "⏰", title: "Potongan Keterlambatan", desc: "Jika absen masuk melebihi jam yang ditentukan, akan ada potongan berdasarkan menit keterlambatan." },
      { icon: "🌟", title: "Bonus Full Shift", desc: "Jika mengambil Full Shift (menggantikan rekan yang libur), gaji dihitung 2x lipat untuk hari itu." },
      { icon: "📊", title: "Lihat Riwayat Gaji", desc: "Buka menu Gaji (ikon kartu kredit di navbar) untuk melihat riwayat pembayaran dan total gaji." }
    ],
    tips: [
      "Pastikan absen masuk tepat waktu untuk menghindari potongan",
      "Full Shift hanya aktif jika disetujui sistem (ditampilkan di Home)"
    ]
  }
];

function GuideCard({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      background: "#fff",
      border: "1.5px solid var(--border)",
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 1px 6px rgba(0,0,0,.04)"
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", gap: 12
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>{section.emoji}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)", textAlign: "left" }}>
            {section.title}
          </span>
        </div>
        {open ? <ChevronUp size={18} color="var(--muted)" /> : <ChevronDown size={18} color="var(--muted)" />}
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
            {section.steps.map((step, i) => (
              <div key={i} style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                padding: "10px 12px",
                background: "var(--surface-soft)",
                borderRadius: 12
              }}>
                <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>{step.icon}</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)", marginBottom: 3 }}>{step.title}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {section.tips && section.tips.length > 0 && (
            <div style={{
              marginTop: 10, padding: "10px 12px",
              background: "rgba(192,57,43,.05)",
              border: "1.5px solid rgba(192,57,43,.15)",
              borderRadius: 12
            }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: "var(--primary)", marginBottom: 6, letterSpacing: "0.3px" }}>
                💡 TIPS
              </p>
              {section.tips.map((tip, i) => (
                <p key={i} style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: i < section.tips!.length - 1 ? 4 : 0 }}>
                  · {tip}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PanduanPage() {
  return (
    <StaffPage title="Panduan" subtitle="Panduan Penggunaan Sistem">
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, var(--primary) 0%, #E05A2B 100%)",
        borderRadius: 16, padding: "16px 18px", color: "#fff"
      }}>
        <h2 style={{ fontSize: 17, fontWeight: 900, marginBottom: 4 }}>📖 Panduan Staff</h2>
        <p style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.5 }}>
          Tap setiap bagian untuk melihat langkah-langkah penggunaan sistem absensi.
        </p>
      </div>

      {/* Quick guide bar */}
      <div style={{
        background: "var(--surface-soft)", borderRadius: 12, padding: "10px 14px",
        fontSize: 12, color: "var(--muted)", lineHeight: 1.6
      }}>
        <strong style={{ color: "var(--ink)" }}>Alur singkat:</strong>{" "}
        Pilih Jadwal (H-1) → Absen Masuk → Laporan Buka → Laporan Tutup → Absen Pulang
      </div>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <GuideCard key={section.id} section={section} />
      ))}

      {/* Bantuan */}
      <div style={{
        background: "#EFF6FF", border: "1.5px solid #BFDBFE",
        borderRadius: 14, padding: "14px 16px", textAlign: "center"
      }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#1D4ED8", marginBottom: 4 }}>
          Masih bingung? 🤔
        </p>
        <p style={{ fontSize: 12, color: "#3B82F6", lineHeight: 1.5 }}>
          Hubungi pemilik toko atau admin untuk bantuan langsung.
        </p>
      </div>
    </StaffPage>
  );
}
