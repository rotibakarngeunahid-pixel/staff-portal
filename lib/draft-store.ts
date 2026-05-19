/**
 * Draft Store — IndexedDB wrapper untuk menyimpan draft foto secara lokal.
 * PRD §8.2: Draft foto tidak hilang saat refresh atau koneksi putus.
 *
 * Gunakan hanya di client-side (browser). Jangan import di server/API.
 */

import type { UploadDraft, DraftFlow, ShiftType } from "@/types/domain";

const DB_NAME = "rbn_draft_store";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

// TTL per flow (milidetik)
const TTL_MS: Record<DraftFlow, number> = {
  attendance_checkin:  12 * 60 * 60 * 1000,  // 12 jam
  attendance_checkout: 12 * 60 * 60 * 1000,  // 12 jam
  report_buka:         24 * 60 * 60 * 1000,  // 24 jam
  report_tutup:        24 * 60 * 60 * 1000,  // 24 jam
  report_cfg:           7 * 24 * 60 * 60 * 1000, // 7 hari
  payroll_payment:      7 * 24 * 60 * 60 * 1000, // 7 hari
  staff_profile:        7 * 24 * 60 * 60 * 1000, // 7 hari
};

// ─── Key builders ─────────────────────────────────────────────────────────

export function draftKeyCheckin(staffId: string, outletId: string, date: string, shiftType: ShiftType) {
  return `staff:${staffId}:checkin:${outletId}:${date}:${shiftType}`;
}

export function draftKeyCheckout(staffId: string, outletId: string, date: string, shiftType: ShiftType) {
  return `staff:${staffId}:checkout:${outletId}:${date}:${shiftType}`;
}

export function draftKeyReport(
  staffId: string,
  outletId: string,
  date: string,
  shiftType: ShiftType,
  reportType: "BUKA" | "TUTUP"
) {
  return `staff:${staffId}:report:${outletId}:${date}:${shiftType}:${reportType}`;
}

export function draftKeyPayroll(staffId: string, dateFrom: string, dateTo: string) {
  return `admin:payroll:${staffId}:${dateFrom}:${dateTo}`;
}

export function draftKeyReportCfg(outletId: string, type: "BUKA" | "TUTUP") {
  return `admin:report_cfg:${outletId}:${type}`;
}

export function draftKeyStaffProfile(staffId: string) {
  return `admin:staff_profile:${staffId}`;
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by_status", "status");
        store.createIndex("by_expires", "expiresAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode) {
  const tx = db.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Simpan atau update draft. Key adalah id draft. */
export async function saveDraft(draft: UploadDraft): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const req = txStore(db, "readwrite").put({ ...draft, updatedAt: new Date().toISOString() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/** Ambil draft berdasarkan id (key). Null jika tidak ada atau sudah expired. */
export async function getDraft(draftId: string): Promise<UploadDraft | null> {
  const db = await openDb();
  const draft = await new Promise<UploadDraft | null>((resolve, reject) => {
    const req = txStore(db, "readonly").get(draftId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!draft) return null;
  if (draft.status === "deleted" || draft.status === "submitted") return null;
  if (new Date(draft.expiresAt) < new Date()) {
    await deleteDraft(draftId);
    return null;
  }
  return draft;
}

/** Hapus draft. */
export async function deleteDraft(draftId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const req = txStore(db, "readwrite").delete(draftId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/** Tandai draft sebagai submitted (lalu hapus blob foto untuk hemat storage). */
export async function markDraftSubmitted(draftId: string): Promise<void> {
  const db = await openDb();
  const draft = await new Promise<UploadDraft | null>((resolve, reject) => {
    const req = txStore(db, "readonly").get(draftId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  if (!draft) { db.close(); return; }
  const updated: UploadDraft = {
    ...draft,
    status: "submitted",
    photos: [],                        // hapus blob setelah submit
    updatedAt: new Date().toISOString()
  };
  await new Promise<void>((resolve, reject) => {
    const req = txStore(db, "readwrite").put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/** Hapus semua draft yang sudah expired atau submitted. */
export async function cleanExpiredDrafts(): Promise<void> {
  const db = await openDb();
  const all = await new Promise<UploadDraft[]>((resolve, reject) => {
    const req = txStore(db, "readonly").getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  const now = new Date();
  const toDelete = all
    .filter((d) => d.status === "submitted" || d.status === "deleted" || new Date(d.expiresAt) < now)
    .map((d) => d.id);
  if (toDelete.length > 0) {
    const store = txStore(db, "readwrite");
    for (const id of toDelete) {
      store.delete(id);
    }
  }
  db.close();
}

// ─── Draft builder ────────────────────────────────────────────────────────

export function createDraft(
  params: Pick<UploadDraft, "id" | "role" | "flow" | "ownerId"> &
    Partial<Pick<UploadDraft, "outletId" | "staffId" | "date" | "shiftType" | "reportType">>
): UploadDraft {
  const now = new Date();
  const ttl = TTL_MS[params.flow] ?? 24 * 60 * 60 * 1000;
  return {
    schemaVersion: 1,
    formData: {},
    photos: [],
    clientRequestId: crypto.randomUUID(),
    status: "draft",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    ...params
  };
}

// ─── React hook helper ─────────────────────────────────────────────────────
// Gunakan di komponen untuk mendeteksi dan memanage draft.

export type DraftHookResult = {
  draft: UploadDraft | null;
  hasDraft: boolean;
  loadDraft: () => Promise<void>;
  clearDraft: () => Promise<void>;
};

/** Buat key-based hook state untuk satu draft. Gunakan di useEffect. */
export async function loadOrNull(draftId: string): Promise<UploadDraft | null> {
  try {
    return await getDraft(draftId);
  } catch {
    return null;
  }
}
