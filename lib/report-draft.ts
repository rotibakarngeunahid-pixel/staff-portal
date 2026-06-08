"use client";

/**
 * Helper auto-save draft untuk form Laporan Buka/Tutup Toko.
 *
 * Foto disimpan sebagai base64 data URL di localStorage agar tetap ada
 * saat halaman di-refresh atau tab ditutup lalu dibuka lagi.
 * Draft divalidasi berdasarkan tanggal + shift + 24 jam TTL.
 *
 * Key localStorage:
 *   draft_laporan_buka_{staffId}_{date}  — laporan BUKA
 *   draft_laporan_tutup_{staffId}_{date} — laporan TUTUP
 */

export type DraftPhotoEntry = {
  dataUrl: string;
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  size: number;
};

type ReportDraft = {
  date: string;
  shift: number;
  savedAt: string; // ISO timestamp
  photos: Record<string, DraftPhotoEntry>;
};

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

const TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

function draftKey(type: "BUKA" | "TUTUP", staffId: string, date: string): string {
  return `draft_laporan_${type === "BUKA" ? "buka" : "tutup"}_${staffId}_${date}`;
}

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

/**
 * Simpan draft foto laporan ke localStorage secara async.
 * Jika `photos` kosong, draft yang ada akan dihapus.
 * Errors (quota exceeded, dll.) diabaikan — tidak memblokir alur utama.
 */
export async function saveDraft(
  type: "BUKA" | "TUTUP",
  staffId: string,
  photos: Record<
    string,
    { blob: Blob; mimeType: string; fileName: string; width: number; height: number; size: number }
  >,
  date: string,
  shift: number
): Promise<void> {
  if (typeof window === "undefined") return;
  const key = draftKey(type, staffId, date);

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
    const payload: ReportDraft = {
      date,
      shift,
      savedAt: new Date().toISOString(),
      photos: draftPhotos,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Abaikan jika localStorage penuh (quota exceeded)
  }
}

/**
 * Muat draft dari localStorage.
 * Mengembalikan null jika tidak ada draft, draft sudah kedaluwarsa
 * (tanggal/shift berbeda atau > 24 jam), atau terjadi error parsing.
 *
 * Caller bertanggung jawab me-revoke object URL dari `previewUrl`
 * saat komponen unmount atau foto diganti.
 */
export function loadDraft(
  type: "BUKA" | "TUTUP",
  staffId: string,
  currentDate: string,
  currentShift: number
): { photos: Record<string, RestoredPhoto>; savedAt: string } | null {
  if (typeof window === "undefined") return null;
  const key = draftKey(type, staffId, currentDate);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const draft = JSON.parse(raw) as ReportDraft;

    // Invalidasi draft jika tanggal atau shift sudah berbeda
    if (draft.date !== currentDate || draft.shift !== currentShift) {
      localStorage.removeItem(key);
      return null;
    }

    // Invalidasi draft jika sudah lebih dari 24 jam
    if (draft.savedAt && Date.now() - new Date(draft.savedAt).getTime() > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }

    if (!draft.photos || Object.keys(draft.photos).length === 0) return null;

    const photos: Record<string, RestoredPhoto> = {};
    for (const [label, entry] of Object.entries(draft.photos)) {
      const blob = dataUrlToBlob(entry.dataUrl);
      photos[label] = {
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
    return Object.keys(photos).length > 0
      ? { photos, savedAt: draft.savedAt || new Date().toISOString() }
      : null;
  } catch {
    return null;
  }
}

/**
 * Hapus draft setelah form berhasil di-submit.
 */
export function clearDraft(type: "BUKA" | "TUTUP", staffId: string, date: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(draftKey(type, staffId, date)); } catch { /* ignore */ }
}

/** Periksa keberadaan draft tanpa memuat datanya (ringan, sync) */
export function hasDraft(type: "BUKA" | "TUTUP", staffId: string, date: string): boolean {
  if (typeof window === "undefined") return false;
  try { return Boolean(localStorage.getItem(draftKey(type, staffId, date))); } catch { return false; }
}
