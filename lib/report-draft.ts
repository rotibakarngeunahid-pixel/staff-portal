"use client";

/**
 * Helper auto-save draft untuk form Laporan Buka/Tutup Toko.
 *
 * Foto disimpan sebagai base64 data URL di localStorage agar tetap ada
 * saat halaman di-refresh atau tab ditutup lalu dibuka lagi.
 * Draft divalidasi berdasarkan tanggal + shift; otomatis dihapus jika berbeda.
 *
 * Key localStorage:
 *   draft_laporan_buka_toko  — laporan BUKA
 *   draft_laporan_tutup_toko — laporan TUTUP
 */

/** Satu entri foto yang tersimpan di localStorage */
export type DraftPhotoEntry = {
  dataUrl: string;   // base64 data URL (dari FileReader)
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  size: number;
};

type ReportDraft = {
  date: string;   // "YYYY-MM-DD" — untuk validasi hari
  shift: number;  // 0 = full, 1 = shift 1, 2 = shift 2
  photos: Record<string, DraftPhotoEntry>; // key = item.label
};

const DRAFT_KEY: Record<"BUKA" | "TUTUP", string> = {
  BUKA: "draft_laporan_buka_toko",
  TUTUP: "draft_laporan_tutup_toko",
};

/* ─── Konversi internal ─── */

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  const header = commaIdx >= 0 ? dataUrl.slice(0, commaIdx) : "";
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/* ─── API publik ─── */

/** Foto yang sudah dipulihkan — kompatibel dengan tipe ReportPhoto di home/page.tsx */
export type RestoredPhoto = {
  blob: Blob;
  previewUrl: string; // object URL, harus di-revoke saat tidak dipakai
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  size: number;
  label: string;
};

/**
 * Simpan draft foto laporan ke localStorage secara async.
 * Jika `photos` kosong, draft yang ada akan dihapus.
 * Errors (quota exceeded, dll.) diabaikan — tidak memblokir alur utama.
 */
export async function saveDraft(
  type: "BUKA" | "TUTUP",
  photos: Record<
    string,
    { blob: Blob; mimeType: string; fileName: string; width: number; height: number; size: number }
  >,
  date: string,
  shift: number
): Promise<void> {
  if (typeof window === "undefined") return;
  const key = DRAFT_KEY[type];

  if (Object.keys(photos).length === 0) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return;
  }

  const draftPhotos: Record<string, DraftPhotoEntry> = {};
  for (const [label, photo] of Object.entries(photos)) {
    try {
      draftPhotos[label] = {
        dataUrl: await blobToDataUrl(photo.blob),
        mimeType: photo.mimeType,
        fileName: photo.fileName,
        width: photo.width,
        height: photo.height,
        size: photo.size,
      };
    } catch {
      // Lewati foto yang gagal dikonversi
    }
  }

  if (Object.keys(draftPhotos).length === 0) return;

  try {
    const payload: ReportDraft = { date, shift, photos: draftPhotos };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Abaikan jika localStorage penuh (quota exceeded)
  }
}

/**
 * Muat draft dari localStorage.
 * Mengembalikan null jika tidak ada draft, draft sudah kedaluwarsa
 * (tanggal/shift berbeda), atau terjadi error parsing.
 *
 * Caller bertanggung jawab me-revoke object URL dari `previewUrl`
 * saat komponen unmount atau foto diganti.
 */
export function loadDraft(
  type: "BUKA" | "TUTUP",
  currentDate: string,
  currentShift: number
): Record<string, RestoredPhoto> | null {
  if (typeof window === "undefined") return null;
  const key = DRAFT_KEY[type];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const draft = JSON.parse(raw) as ReportDraft;

    // Invalidasi draft jika tanggal atau shift sudah berbeda
    if (draft.date !== currentDate || draft.shift !== currentShift) {
      localStorage.removeItem(key);
      return null;
    }
    if (!draft.photos || Object.keys(draft.photos).length === 0) return null;

    const result: Record<string, RestoredPhoto> = {};
    for (const [label, entry] of Object.entries(draft.photos)) {
      const blob = dataUrlToBlob(entry.dataUrl);
      result[label] = {
        blob,
        previewUrl: URL.createObjectURL(blob),
        mimeType: entry.mimeType,
        fileName: entry.fileName,
        width: entry.width,
        height: entry.height,
        size: entry.size,
        label,
      };
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Hapus draft setelah form berhasil di-submit.
 */
export function clearDraft(type: "BUKA" | "TUTUP"): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(DRAFT_KEY[type]); } catch { /* ignore */ }
}

/** Periksa keberadaan draft tanpa memuat datanya (ringan, sync) */
export function hasDraft(type: "BUKA" | "TUTUP"): boolean {
  if (typeof window === "undefined") return false;
  try { return Boolean(localStorage.getItem(DRAFT_KEY[type])); } catch { return false; }
}
