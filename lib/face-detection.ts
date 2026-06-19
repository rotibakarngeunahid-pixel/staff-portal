"use client";

/* ════════════════════════════════════════════════════════════════════════
 *  MediaPipe Face Detector — loader client-side, 100% GRATIS, via CDN.
 *
 *  Tujuan: memastikan foto selfie absensi benar-benar memuat WAJAH MANUSIA
 *  (bukan foto kosong / layar / objek). Ini BUKAN pengenalan identitas —
 *  cukup mendeteksi "ada wajah valid di frame".
 *
 *  Catatan:
 *  - Model (.tflite) & WASM di-load dari CDN publik, TIDAK disimpan di server kita.
 *  - Tidak butuh API key, tidak ada biaya server.
 *  - Instance detector di-cache (singleton) supaya tidak re-init tiap buka kamera.
 *  Dipakai oleh: components/staff/camera-capture.tsx
 * ════════════════════════════════════════════════════════════════════════ */

// ── Konstanta CDN (gampang di-tuning / dinaikkan versinya) ───────────────────
// Versi stabil terverifikasi: @mediapipe/tasks-vision@0.10.35 (per Juni 2026).
const TASKS_VISION_VERSION = "0.10.35";
const VISION_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/vision_bundle.mjs`;
const WASM_FILESET_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
// Model BlazeFace short-range (≈224 KB) dari hosting model Google (bukan server kita).
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

// ── Tipe minimal (kita TIDAK meng-install paket; semua dimuat via CDN runtime) ─
export interface FaceDetectionResult {
  detections?: Array<{
    categories?: Array<{ score?: number }>;
    boundingBox?: { originX: number; originY: number; width: number; height: number };
  }>;
}

export interface FaceDetectorInstance {
  detectForVideo(
    frame: HTMLVideoElement | HTMLCanvasElement,
    timestampMs: number
  ): FaceDetectionResult;
  close(): void;
}

interface FilesetResolverHandle {
  __brand?: "fileset";
}

interface VisionModule {
  FilesetResolver: { forVisionTasks(wasmBase: string): Promise<FilesetResolverHandle> };
  FaceDetector: {
    createFromOptions(
      fileset: FilesetResolverHandle,
      options: unknown
    ): Promise<FaceDetectorInstance>;
  };
}

// Import ESM eksternal dari URL tanpa diutak-atik bundler (webpack/turbopack).
//
// CATATAN CSP (penting kalau nanti menambah Content-Security-Policy):
// `new Function("u","return import(u)")` dipakai supaya bundler TIDAK mencoba
// me-resolve/membundel URL CDN saat build (kalau ditulis `import("https://…")`
// literal, webpack/turbopack akan ikut campur). Konsekuensinya, ini butuh CSP
// `script-src` yang mengizinkan `'unsafe-eval'`. Project ini SAAT INI belum punya
// CSP (lihat next.config.ts → headers()), jadi aman apa adanya.
// Jika nanti menambah CSP ketat, ADA DUA PILIHAN di sinilah yang harus diubah:
//   (a) tambahkan `'unsafe-eval'` ke `script-src`, ATAU
//   (b) ganti baris di bawah menjadi:
//         await import(/* webpackIgnore: true */ url)
//       (tidak butuh unsafe-eval, tapi `url` harus literal & terikat ke webpack).
// Selain itu, CSP juga perlu mengizinkan domain CDN di `script-src`/`connect-src`:
//   https://cdn.jsdelivr.net  dan  https://storage.googleapis.com
function importExternalModule(url: string): Promise<VisionModule> {
  const nativeImport = new Function("u", "return import(u);") as (u: string) => Promise<VisionModule>;
  return nativeImport(url);
}

let detectorPromise: Promise<FaceDetectorInstance> | null = null;

/**
 * Muat (sekali) MediaPipe Face Detector dalam runningMode "VIDEO".
 * Hasilnya di-cache; pemanggilan berikutnya mengembalikan instance yang sama.
 * Jika gagal (CDN down / device tidak support), promise reject dan cache di-reset
 * supaya bisa dicoba lagi nanti.
 */
export function loadFaceDetector(minConfidence: number): Promise<FaceDetectorInstance> {
  if (detectorPromise) return detectorPromise;

  const promise = (async () => {
    const vision = await importExternalModule(VISION_BUNDLE_URL);
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_FILESET_URL);

    const optionsFor = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
      runningMode: "VIDEO",
      minDetectionConfidence: minConfidence,
    });

    try {
      // GPU lebih mulus di HP mampu; sebagian device low-end tidak support.
      return await vision.FaceDetector.createFromOptions(fileset, optionsFor("GPU"));
    } catch {
      return await vision.FaceDetector.createFromOptions(fileset, optionsFor("CPU"));
    }
  })();

  // Kalau gagal load, jangan kunci selamanya — reset agar bisa retry.
  promise.catch(() => {
    if (detectorPromise === promise) detectorPromise = null;
  });

  detectorPromise = promise;
  return promise;
}

/** Hitung jumlah wajah yang confidence-nya di atas threshold. */
export function countFaces(
  result: FaceDetectionResult | null | undefined,
  minConfidence: number
): number {
  const detections = result?.detections;
  if (!detections?.length) return 0;
  return detections.filter((d) => (d.categories?.[0]?.score ?? 1) >= minConfidence).length;
}

/**
 * Skor confidence tertinggi di antara semua deteksi (0..1), atau null jika tidak
 * ada deteksi sama sekali. Dipakai untuk audit/tuning threshold — BUKAN identitas.
 */
export function topFaceScore(result: FaceDetectionResult | null | undefined): number | null {
  const detections = result?.detections;
  if (!detections?.length) return null;
  let max = 0;
  for (const d of detections) {
    const score = d.categories?.[0]?.score ?? 0;
    if (score > max) max = score;
  }
  return max;
}
