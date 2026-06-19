"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, Check, Flashlight, FlashlightOff, RefreshCw, X } from "lucide-react";
import { getVideoTrack, setTorch, stopMediaStream, supportsTorch } from "@/lib/camera";
import { CapturedPhoto, photoFromCanvas, revokePhoto } from "@/lib/client-image";
// ── BARU: deteksi keberadaan wajah (MediaPipe, client-side via CDN) ──
import { loadFaceDetector, countFaces, topFaceScore, type FaceDetectorInstance } from "@/lib/face-detection";

/* ═══════════════════════════════════════════════════════════════════════════
 *  KONSTANTA DETEKSI WAJAH — gampang di-tuning (kode BARU)
 *  Hanya berlaku saat prop `requireFace` = true (mis. selfie absensi).
 * ═══════════════════════════════════════════════════════════════════════════ */
// Ambang confidence minimal sebuah deteksi dianggap "wajah valid" (0..1).
// Naikkan biar lebih ketat (mis. 0.6), turunkan biar lebih longgar.
// DI-EXPORT agar halaman home bisa pre-load detector dengan threshold yang sama.
export const FACE_CONFIDENCE_THRESHOLD = 0.5;
// Jeda minimal antar-deteksi pada live stream (ms) — hemat baterai HP low-end.
const FACE_DETECTION_INTERVAL_MS = 120;
// Ukuran kotak panduan wajah (oval) relatif terhadap lebar area kamera.
const FACE_GUIDE_BOX = {
  widthPct: 62, // lebar kotak = 62% lebar area kamera
  aspect: 1.32, // tinggi = lebar × aspect (lebih tinggi dari lebar, bentuk wajah)
  maxWidth: 300, // batas atas lebar (px) agar tidak kebesaran di tablet
};
// Berapa kali error inferensi beruntun sebelum kita menyerah dan fallback
// tanpa gate (mis. delegate GPU bermasalah di runtime).
const FACE_MAX_CONSEC_ERRORS = 8;
// Berapa kali hasil capture boleh GAGAL re-validasi sebelum diizinkan lewat
// (escape hatch): mencegah staff terkunci di kondisi sulit. Capture ke-N yang
// gagal akan tetap diloloskan TAPI ditandai sebagai bypass di audit trail.
const FACE_MAX_RECAPTURE_RETRIES = 3;
// Ambang luminance rata-rata (0..255) untuk membedakan "cahaya kurang" dari
// sekadar "posisi wajah salah" saat tidak ada wajah terdeteksi.
const LOW_LIGHT_LUMA_THRESHOLD = 55;
/* ═══════════════════════════════════════════════════════════════════════════ */

// Status audit verifikasi wajah yang ikut disimpan bersama record absensi.
export type FaceVerificationStatus =
  | "passed" // wajah terverifikasi normal
  | "bypassed_model_error" // model gagal load / GPU error → diloloskan (fallback)
  | "bypassed_low_confidence_retry_exhausted"; // re-validasi gagal berulang → diloloskan
export type FaceVerification = {
  status: FaceVerificationStatus;
  confidence: number | null; // skor confidence foto final (0..1), null jika tak terdeteksi
};

interface CameraCaptureProps {
  facing?: "user" | "environment";
  title?: string;
  allowTorch?: boolean;
  /** BARU: jika true, foto wajib memuat tepat 1 wajah sebelum boleh diambil/disubmit. */
  requireFace?: boolean;
  watermark?: {
    outletName?: string | null;
    staffName?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  /** BARU: faceMeta hanya terisi saat requireFace=true (selfie absensi). */
  onCapture: (photo: CapturedPhoto, faceMeta?: FaceVerification) => void;
  onCancel: () => void;
}

type Phase = "starting" | "live" | "processing" | "preview" | "error";
type CameraErrorKind = "permission" | "not-found" | "unsupported" | "unknown";
type CameraPermissionState = PermissionState | "unknown";

function getDomErrorName(error: unknown) {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name?: unknown }).name || "");
  }
  return "";
}

function getCameraErrorKind(error: unknown): CameraErrorKind {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
  const name = getDomErrorName(error);
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "permission";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "not-found";
  return "unknown";
}

async function getCameraPermissionState(): Promise<CameraPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "camera" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

function getCameraErrorMessage(kind: CameraErrorKind, permissionState: CameraPermissionState) {
  if (kind === "permission") {
    if (permissionState === "denied") {
      return "Izin kamera masih diblokir browser.\nBuka pengaturan situs, ubah Kamera menjadi Izinkan, lalu tekan tombol di bawah.";
    }
    return "Browser belum memberi akses kamera.\nTekan Izinkan Kamera untuk menampilkan permintaan izin lagi.";
  }
  if (kind === "not-found") {
    return "Kamera tidak ditemukan.\nPastikan perangkat memiliki kamera dan tidak sedang dipakai aplikasi lain.";
  }
  if (kind === "unsupported") {
    return "Browser ini tidak mendukung akses kamera.\nBuka aplikasi dengan browser modern dan pastikan memakai HTTPS.";
  }
  return "Kamera tidak dapat diakses.\nPastikan izin kamera sudah diberikan di browser.";
}

function formatWatermarkTime(date: Date) {
  const dayDate = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
  const time = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date).replace(/\./g, ":");
  return `${dayDate}, ${time} WITA`;
}

function formatCoords(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null) return "-";
  const latStr = lat.toFixed(6);
  const lngStr = lng.toFixed(6);
  return `${latStr}, ${lngStr}`;
}

export type WatermarkOpts = {
  outletName?: string | null;
  staffName?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts?: WatermarkOpts
) {
  const padding = Math.max(14, Math.round(width * 0.018));
  const maxTextWidth = width - padding * 2;

  // Font sizes — scale with image width, capped untuk keterbacaan
  const titleFont = Math.min(30, Math.max(16, Math.round(width * 0.022)));
  const lineFont  = Math.min(24, Math.max(14, Math.round(width * 0.018)));
  const timeFont  = Math.min(20, Math.max(12, Math.round(width * 0.015)));

  const lineGap = Math.max(5, Math.round(width * 0.006));
  const sectionGap = Math.max(3, Math.round(width * 0.004));

  // Susun baris watermark
  const lines: Array<{ text: string; font: string; isBold: boolean }> = [
    { text: "Roti Bakar Ngeunah",                                    font: `${titleFont}px`, isBold: true  },
    { text: `Outlet - ${opts?.outletName || "-"}`,                   font: `${lineFont}px`,  isBold: true  },
    { text: `Nama Staff: ${opts?.staffName || "-"}`,                 font: `${lineFont}px`,  isBold: false },
    { text: `Koordinat GPS: ${formatCoords(opts?.lat, opts?.lng)}`,  font: `${lineFont}px`,  isBold: false },
    { text: formatWatermarkTime(new Date()),                         font: `${timeFont}px`,  isBold: false }
  ];

  // Hitung tinggi blok watermark
  const fontHeights = [titleFont, lineFont, lineFont, lineFont, timeFont];
  const totalTextHeight = fontHeights.reduce((s, h) => s + h, 0)
    + lineGap * (lines.length - 2)  // antar baris teks biasa
    + sectionGap;                   // extra gap sebelum timestamp

  const blockHeight = padding + totalTextHeight + padding * 0.8;
  const top = Math.max(0, height - blockHeight);

  ctx.save();

  // Background semi-transparan
  ctx.fillStyle = "rgba(0,0,0,0.68)";
  ctx.fillRect(0, top, width, blockHeight);

  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 3;
  ctx.textBaseline = "top";

  let y = top + padding * 0.75;

  lines.forEach((line, idx) => {
    const isTimestamp = idx === lines.length - 1;
    const weight = line.isBold ? "800" : "600";
    ctx.font = `${weight} ${line.font} Arial, sans-serif`;
    ctx.fillStyle = isTimestamp ? "rgba(255,255,255,0.82)" : "#fff";

    // Truncate teks jika terlalu panjang untuk lebar canvas
    let text = line.text;
    while (ctx.measureText(text).width > maxTextWidth && text.length > 4) {
      text = text.slice(0, -1);
    }
    if (text !== line.text) text = text.trimEnd() + "…";

    ctx.fillText(text, padding, y, maxTextWidth);

    const fh = fontHeights[idx];
    y += fh + (isTimestamp ? 0 : idx === lines.length - 2 ? sectionGap : lineGap);
  });

  ctx.restore();
}

function photoFileBaseName(value: string) {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `${safe || "foto"}-${Date.now()}`;
}

export function CameraCapture({
  facing = "user",
  title,
  allowTorch = false,
  requireFace = false,
  watermark,
  onCapture,
  onCancel
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<CapturedPhoto | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [preview, setPreview] = useState<CapturedPhoto | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [errKind, setErrKind] = useState<CameraErrorKind>("unknown");
  const [permissionState, setPermissionState] = useState<CameraPermissionState>("unknown");
  const [torchInfo, setTorchInfo] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // ── BARU: state deteksi wajah ──
  const detectorRef = useRef<FaceDetectorInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastDetectTsRef = useRef(0);
  const faceErrorCountRef = useRef(0);
  const recaptureFailRef = useRef(0);                   // hitung kegagalan re-validasi berturut
  const captureFaceMetaRef = useRef<FaceVerification | null>(null); // status verifikasi foto yg sedang dipreview
  const lumaCanvasRef = useRef<HTMLCanvasElement | null>(null);     // canvas kecil untuk ukur cahaya
  const [faceReady, setFaceReady] = useState(false);    // detektor selesai dimuat
  const [faceFailed, setFaceFailed] = useState(false);  // gagal muat → fallback tanpa gate
  const [faceCount, setFaceCount] = useState(0);        // jumlah wajah pada frame live
  const [lowLight, setLowLight] = useState(false);      // frame terlalu gelap (saat tak ada wajah)
  const [recheckMsg, setRecheckMsg] = useState("");     // pesan jika re-validasi hasil capture gagal

  useEffect(() => {
    startCamera();
    return () => {
      stopFaceLoop();
      stopCamera();
      if (previewRef.current) {
        revokePhoto(previewRef.current);
        previewRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── BARU: muat MediaPipe Face Detector sekali saat butuh gate wajah ──
  useEffect(() => {
    if (!requireFace) return;
    let cancelled = false;
    loadFaceDetector(FACE_CONFIDENCE_THRESHOLD)
      .then((detector) => {
        if (cancelled) return;
        detectorRef.current = detector;
        setFaceReady(true);
      })
      .catch(() => {
        // CDN down / device tidak support → jangan kunci absensi, lanjut tanpa gate.
        if (!cancelled) setFaceFailed(true);
      });
    return () => { cancelled = true; };
  }, [requireFace]);

  // ── BARU: jalankan loop deteksi hanya saat live + detektor siap ──
  useEffect(() => {
    if (phase !== "live" || !requireFace || !faceReady || faceFailed) {
      stopFaceLoop();
      return;
    }
    startFaceLoop();
    return stopFaceLoop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, requireFace, faceReady, faceFailed]);

  // Timestamp monotonic-naik untuk detectForVideo (syarat MediaPipe).
  function nextDetectTs() {
    const ts = Math.max(performance.now(), lastDetectTsRef.current + 1);
    lastDetectTsRef.current = ts;
    return ts;
  }

  // BARU: estimasi cahaya — gambar frame ke canvas kecil (32×24) lalu rata-rata luma.
  // Murah, hanya dipanggil saat tidak ada wajah, untuk membedakan pesan ke user.
  function isFrameTooDark(video: HTMLVideoElement): boolean {
    try {
      let canvas = lumaCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 24;
        lumaCanvasRef.current = canvas;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return false;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Rec. 601 luma
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      const meanLuma = sum / (data.length / 4);
      return meanLuma < LOW_LIGHT_LUMA_THRESHOLD;
    } catch {
      return false; // mis. tainted canvas — jangan paksa, anggap cahaya cukup
    }
  }

  // BARU: dev-only logging confidence untuk tuning threshold.
  // TIDAK menyimpan gambar/embedding wajah — hanya angka + status + waktu.
  function logFaceCapture(meta: FaceVerification) {
    if (process.env.NODE_ENV === "production") return;
    // eslint-disable-next-line no-console
    console.log("[face-gate]", {
      status: meta.status,
      confidence: meta.confidence,
      threshold: FACE_CONFIDENCE_THRESHOLD,
      pass: meta.status === "passed",
      at: new Date().toISOString()
    });
  }

  function startFaceLoop() {
    stopFaceLoop();
    const tick = () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (video && detector && video.readyState >= 2) {
        const now = performance.now();
        const newFrame = video.currentTime !== lastVideoTimeRef.current;
        const dueByInterval = now - lastDetectTsRef.current >= FACE_DETECTION_INTERVAL_MS;
        if (newFrame && dueByInterval) {
          lastVideoTimeRef.current = video.currentTime;
          try {
            const result = detector.detectForVideo(video, nextDetectTs());
            const count = countFaces(result, FACE_CONFIDENCE_THRESHOLD);
            setFaceCount(count);
            // Hanya cek cahaya saat tak ada wajah (untuk bedakan pesan ke user).
            setLowLight(count === 0 ? isFrameTooDark(video) : false);
            faceErrorCountRef.current = 0;
          } catch {
            // Inferensi gagal berulang (mis. GPU delegate bermasalah) → fallback.
            faceErrorCountRef.current += 1;
            if (faceErrorCountRef.current >= FACE_MAX_CONSEC_ERRORS) {
              setFaceFailed(true);
              return; // hentikan loop; effect cleanup mengurus cancel
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopFaceLoop() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  async function startCamera() {
    stopCamera();
    setPhase("starting");
    setErrMsg("");
    setErrKind("unknown");
    setTorchInfo("");
    setConfirming(false);
    setTorchOn(false);
    setTorchSupported(false);
    // ── BARU: reset state deteksi tiap buka/ulang kamera ──
    setFaceCount(0);
    setLowLight(false);
    setRecheckMsg("");
    lastVideoTimeRef.current = -1;
    faceErrorCountRef.current = 0;
    recaptureFailRef.current = 0;
    captureFaceMetaRef.current = null;
    try {
      setPermissionState(await getCameraPermissionState());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 960 }
        },
        audio: false
      });
      streamRef.current = stream;
      const torchAvailable = facing === "environment" && supportsTorch(getVideoTrack(stream), allowTorch);
      setTorchSupported(torchAvailable);
      if (allowTorch && facing === "environment" && !torchAvailable) {
        setTorchInfo("Senter tidak didukung di perangkat ini.");
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => setPhase("live")).catch(() => setPhase("live"));
        };
      }
    } catch (err) {
      const kind = getCameraErrorKind(err);
      const nextPermissionState = await getCameraPermissionState();
      setErrKind(kind);
      setPermissionState(nextPermissionState);
      setErrMsg(getCameraErrorMessage(kind, nextPermissionState));
      setPhase("error");
    }
  }

  function stopCamera() {
    const track = getVideoTrack(streamRef.current);
    if (track && torchOn) setTorch(track, false).catch(() => undefined);
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    // BARU (device dipakai bergantian): lepas frame dari <video> agar tidak ada
    // echo/sisa frame dari staff sebelumnya saat staff berikutnya buka kamera.
    const video = videoRef.current;
    if (video) {
      try { video.pause(); } catch { /* mungkin belum play */ }
      video.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }

  async function toggleTorch() {
    const track = getVideoTrack(streamRef.current);
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await setTorch(track, next);
      setTorchOn(next);
      setTorchInfo("");
    } catch {
      setTorchInfo("Senter tidak dapat diaktifkan di perangkat ini.");
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || phase !== "live") return;
    // ── BARU: jangan lanjut jika gate wajah aktif tapi belum ada tepat 1 wajah ──
    if (!captureAllowed) return;
    stopFaceLoop(); // hentikan loop live sebelum proses capture
    setPhase("processing");
    setErrMsg("");
    setRecheckMsg("");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setErrMsg("Gagal mengambil foto. Coba ulangi.");
      setPhase("live");
      return;
    }
    if (facing === "user") {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0);
    }

    // ── BARU: re-validasi 1x pada hasil capture + tentukan status audit ──
    // Dilakukan SEBELUM watermark & konversi WebP.
    let faceMeta: FaceVerification | null = null;
    if (requireFace) {
      if (faceFailed || !faceReady || !detectorRef.current) {
        // Model gagal/ belum siap → tetap izinkan (fallback permisif) + tandai audit.
        faceMeta = { status: "bypassed_model_error", confidence: null };
      } else {
        let count = 0;
        let score: number | null = null;
        let inferenceFailed = false;
        try {
          const result = detectorRef.current.detectForVideo(canvas, nextDetectTs());
          count = countFaces(result, FACE_CONFIDENCE_THRESHOLD);
          score = topFaceScore(result);
        } catch {
          inferenceFailed = true; // error saat recheck → jangan kunci user
        }
        if (inferenceFailed) {
          faceMeta = { status: "bypassed_model_error", confidence: null };
        } else if (count === 1) {
          recaptureFailRef.current = 0;
          faceMeta = { status: "passed", confidence: score };
        } else {
          // Tidak ada / >1 wajah pada foto final → minta ulang, sampai batas retry.
          recaptureFailRef.current += 1;
          if (recaptureFailRef.current >= FACE_MAX_RECAPTURE_RETRIES) {
            // Escape hatch: jangan kunci staff selamanya, loloskan tapi ditandai.
            faceMeta = { status: "bypassed_low_confidence_retry_exhausted", confidence: score };
          } else {
            setRecheckMsg("Wajah tidak terdeteksi pada foto. Coba ambil ulang.");
            setFaceCount(0);
            setPhase("live");
            return;
          }
        }
      }
      logFaceCapture(faceMeta);
    }

    // Gambar watermark dengan data lengkap (kode LAMA)
    drawWatermark(ctx, canvas.width, canvas.height, watermark);
    try {
      const photo = await photoFromCanvas(canvas, {
        baseName: photoFileBaseName(title || (facing === "user" ? "selfie" : "foto")),
        maxDimension: facing === "user" ? 1440 : 2048,
        quality: 0.85,
        preferredType: "image/webp"
      });
      if (previewRef.current) revokePhoto(previewRef.current);
      previewRef.current = photo;
      captureFaceMetaRef.current = faceMeta; // BARU: simpan utk dikirim saat confirm()
      setPreview(photo);
      setPhase("preview");
      stopCamera();
    } catch {
      setErrMsg("Gagal memproses foto. Coba ambil ulang.");
      setPhase("live");
    }
  }

  function retake() {
    if (previewRef.current) revokePhoto(previewRef.current);
    previewRef.current = null;
    setPreview(null);
    setConfirming(false);
    startCamera();
  }

  function confirm() {
    if (!preview || confirming) return;
    setConfirming(true);
    previewRef.current = null;
    // BARU: sertakan status verifikasi wajah (undefined utk foto non-absensi).
    onCapture(preview, captureFaceMetaRef.current ?? undefined);
    onCancel();
  }

  function cancel() {
    if (previewRef.current) {
      revokePhoto(previewRef.current);
      previewRef.current = null;
    }
    stopFaceLoop();
    stopCamera();
    onCancel();
  }

  const isMirrored = facing === "user";
  const isPermissionError = errKind === "permission";
  const retryLabel = isPermissionError ? "Izinkan Kamera" : "Coba Lagi";
  const permissionHelp = permissionState === "denied"
    ? "Jika prompt izin tidak muncul, buka ikon gembok atau pengaturan situs di browser, ubah Kamera ke Izinkan, lalu tekan tombol ini lagi."
    : "Pilih Izinkan saat browser menampilkan permintaan akses kamera.";

  // ── BARU: status & gating deteksi wajah ──
  const faceLoading = requireFace && !faceReady && !faceFailed;
  const faceGateActive = requireFace && faceReady && !faceFailed;
  const faceOk = faceCount === 1;
  const faceMultiple = faceCount > 1;
  // Shutter aktif jika: tidak butuh wajah, ATAU gate gagal (fallback), ATAU gate siap & tepat 1 wajah.
  const captureAllowed =
    phase === "live" && (!requireFace || faceFailed || (faceReady && faceOk));

  // Indikator visual (warna border + teks) sesuai kondisi deteksi.
  // Teks selalu jelas (tidak hanya mengandalkan warna) demi aksesibilitas.
  const faceStatus: { color: string; text: string } = faceLoading
    ? { color: "#9CA3AF", text: "Menyiapkan deteksi wajah..." }
    : faceMultiple
    ? { color: "#F59E0B", text: "Pastikan hanya 1 orang di frame" }
    : faceOk
    ? { color: "#22C55E", text: "Wajah terdeteksi, silakan ambil foto" }
    : lowLight
    ? { color: "#F59E0B", text: "Cahaya kurang — cari tempat lebih terang" }
    : { color: "#EF4444", text: "Posisikan wajah di dalam kotak" };

  const showFaceGate = requireFace && !faceFailed && phase === "live";

  const guideBoxStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -54%)",
    width: `min(${FACE_GUIDE_BOX.widthPct}%, ${FACE_GUIDE_BOX.maxWidth}px)`,
    aspectRatio: String(1 / FACE_GUIDE_BOX.aspect),
    border: `3px solid ${faceStatus.color}`,
    borderRadius: "47% 47% 46% 46% / 58% 58% 42% 42%",
    boxShadow: `0 0 0 9999px rgba(0,0,0,0.25)`,
    transition: "border-color 0.18s ease",
    pointerEvents: "none"
  };

  return (
    <div className="camera-overlay">
      {/* Top bar — senter di kiri, judul di tengah, close di kanan */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        padding: "max(14px, env(safe-area-inset-top)) 16px 12px",
        background: "linear-gradient(rgba(0,0,0,0.6), transparent)",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        {/* Kiri: tombol senter (atau spacer agar judul tetap tengah) */}
        <div style={{ width: 44, display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
          {torchSupported && phase === "live" && (
            <button
              onClick={toggleTorch}
              aria-label={torchOn ? "Matikan senter" : "Nyalakan senter"}
              title={torchOn ? "Matikan senter" : "Nyalakan senter"}
              style={{
                width: 44, height: 44, borderRadius: "50%", border: "none",
                background: torchOn ? "rgba(250,204,21,0.95)" : "rgba(255,255,255,0.18)",
                color: torchOn ? "#1f2937" : "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                touchAction: "manipulation"
              }}
            >
              {torchOn ? <FlashlightOff size={20} /> : <Flashlight size={20} />}
            </button>
          )}
        </div>

        {/* Tengah: judul */}
        <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, textAlign: "center", flex: 1, paddingInline: 8 }}>
          {title || (facing === "user" ? "📸 Selfie" : "📷 Foto")}
        </span>

        {/* Kanan: tombol close */}
        <div style={{ width: 44, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <button
            onClick={cancel}
            aria-label="Tutup kamera"
            style={{
              width: 44, height: 44, borderRadius: "50%", border: "none",
              background: "rgba(255,255,255,0.18)", color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              touchAction: "manipulation"
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Camera / Preview area */}
      <div className="camera-video-wrap">
        {phase !== "preview" && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: isMirrored ? "scaleX(-1)" : "none",
              opacity: phase === "live" || phase === "processing" ? 1 : 0,
              transition: "opacity 0.3s"
            }}
          />
        )}

        {/* ── BARU: overlay panduan wajah + indikator (hanya selfie absensi) ── */}
        {showFaceGate && (
          <>
            <div style={guideBoxStyle} />
            <div style={{
              position: "absolute", left: 16, right: 16, bottom: 18,
              display: "flex", justifyContent: "center", pointerEvents: "none"
            }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "rgba(15,23,42,0.74)", color: "#fff",
                border: `1px solid ${faceStatus.color}`, borderRadius: 999,
                padding: "8px 14px", fontSize: 12.5, fontWeight: 700,
                maxWidth: "100%", textAlign: "center", lineHeight: 1.3
              }}>
                <span style={{
                  width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                  background: faceStatus.color, boxShadow: `0 0 8px ${faceStatus.color}`
                }} />
                {faceStatus.text}
              </span>
            </div>
          </>
        )}

        {/* ── BARU: badge fallback bila detektor wajah gagal dimuat (audit-aware) ── */}
        {requireFace && faceFailed && phase === "live" && (
          <div style={{
            position: "absolute", left: 16, right: 16, top: 70,
            display: "flex", justifyContent: "center", pointerEvents: "none"
          }}>
            <span style={{
              background: "rgba(180,83,9,0.92)", color: "#fff",
              border: "1px solid rgba(245,158,11,0.7)", borderRadius: 999,
              padding: "6px 12px", fontSize: 11.5, fontWeight: 700, textAlign: "center"
            }}>
              ⚠ Verifikasi wajah dilewati — lanjut tanpa cek
            </span>
          </div>
        )}

        {/* ── BARU: badge di preview bila foto lolos lewat jalur bypass (audit) ── */}
        {phase === "preview" && captureFaceMetaRef.current && captureFaceMetaRef.current.status !== "passed" && (
          <div style={{
            position: "absolute", left: 16, right: 16, top: 16,
            display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 5
          }}>
            <span style={{
              background: "rgba(180,83,9,0.92)", color: "#fff",
              border: "1px solid rgba(245,158,11,0.7)", borderRadius: 999,
              padding: "7px 14px", fontSize: 12, fontWeight: 700, textAlign: "center"
            }}>
              ⚠ Verifikasi wajah dilewati
            </span>
          </div>
        )}

        {/* ── BARU: pesan jika hasil capture ditolak (tidak ada wajah) ── */}
        {recheckMsg && phase === "live" && (
          <div style={{
            position: "absolute", left: 16, right: 16, top: 70,
            display: "flex", justifyContent: "center", pointerEvents: "none"
          }}>
            <span style={{
              background: "rgba(127,29,29,0.92)", color: "#fff",
              border: "1px solid rgba(239,68,68,0.6)", borderRadius: 12,
              padding: "9px 14px", fontSize: 12.5, fontWeight: 700, textAlign: "center"
            }}>
              ⚠️ {recheckMsg}
            </span>
          </div>
        )}

        {phase === "preview" && preview && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview.previewUrl}
            alt="preview"
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          />
        )}

        {(phase === "starting" || phase === "processing") && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: "#fff", opacity: 0.6, fontSize: 13, fontWeight: 600 }}>
              {phase === "starting" ? "Membuka kamera..." : "Memproses foto..."}
            </div>
          </div>
        )}

        {phase === "error" && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", flexDirection: "column", gap: 16, padding: 32
          }}>
            <Camera size={48} style={{ color: "rgba(255,255,255,0.4)" }} />
            <p style={{ color: "#fff", fontSize: 14, fontWeight: 600, textAlign: "center", lineHeight: 1.6, whiteSpace: "pre-line" }}>
              {errMsg}
            </p>
            {isPermissionError && (
              <p style={{
                color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: 600,
                textAlign: "center", lineHeight: 1.6, margin: "-6px 0 0", maxWidth: 320
              }}>
                {permissionHelp}
              </p>
            )}
            <button className="camera-ghost-btn" onClick={startCamera}>
              {retryLabel}
            </button>
          </div>
        )}

        {torchInfo && phase === "live" && (
          <div style={{
            position: "absolute", left: 16, right: 16, bottom: 14,
            color: "#fff", background: "rgba(15,23,42,0.62)", border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 12, padding: "8px 10px", fontSize: 12, fontWeight: 600, textAlign: "center"
          }}>
            {torchInfo}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="camera-controls">
        {(phase === "live" || phase === "processing") && (
          <>
            <button className="camera-ghost-btn" onClick={cancel} disabled={phase === "processing"}>Batal</button>
            <button
              className="camera-shutter"
              onClick={capture}
              aria-label="Ambil foto"
              /* BARU: shutter ikut terkunci jika gate wajah aktif & belum ada 1 wajah */
              disabled={phase === "processing" || !captureAllowed}
              style={{ opacity: phase === "processing" || !captureAllowed ? 0.45 : 1 }}
              title={faceGateActive && !faceOk && phase === "live" ? faceStatus.text : undefined}
            >
              <Camera size={28} color="#C0392B" />
            </button>
            <div style={{ width: 80 }} />
          </>
        )}

        {phase === "preview" && (
          <>
            <button className="camera-ghost-btn" onClick={retake} disabled={confirming}>
              <RefreshCw size={14} style={{ display: "inline", marginRight: 6 }} />
              Ulangi
            </button>
            <button className="camera-confirm-btn" onClick={confirm} disabled={confirming}>
              <Check size={14} style={{ display: "inline", marginRight: 6 }} />
              {confirming ? "Memproses..." : "Gunakan Foto"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
