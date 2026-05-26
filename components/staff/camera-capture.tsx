"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Flashlight, FlashlightOff, RefreshCw, X } from "lucide-react";
import { getVideoTrack, setTorch, stopMediaStream, supportsTorch } from "@/lib/camera";
import { CapturedPhoto, photoFromCanvas, revokePhoto } from "@/lib/client-image";

interface CameraCaptureProps {
  facing?: "user" | "environment";
  title?: string;
  allowTorch?: boolean;
  watermark?: {
    outletName?: string | null;
    staffName?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  onCapture: (photo: CapturedPhoto) => void;
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

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (previewRef.current) {
        revokePhoto(previewRef.current);
        previewRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    stopCamera();
    setPhase("starting");
    setErrMsg("");
    setErrKind("unknown");
    setTorchInfo("");
    setConfirming(false);
    setTorchOn(false);
    setTorchSupported(false);
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
    setPhase("processing");
    setErrMsg("");
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
    // Gambar watermark dengan data lengkap
    drawWatermark(ctx, canvas.width, canvas.height, watermark);
    try {
      const photo = await photoFromCanvas(canvas, {
        baseName: photoFileBaseName(title || (facing === "user" ? "selfie" : "foto")),
        maxDimension: facing === "user" ? 1280 : 1600,
        quality: facing === "user" ? 0.78 : 0.8,
        preferredType: "image/webp"
      });
      if (previewRef.current) revokePhoto(previewRef.current);
      previewRef.current = photo;
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
    onCapture(preview);
    onCancel();
  }

  function cancel() {
    if (previewRef.current) {
      revokePhoto(previewRef.current);
      previewRef.current = null;
    }
    stopCamera();
    onCancel();
  }

  const isMirrored = facing === "user";
  const isPermissionError = errKind === "permission";
  const retryLabel = isPermissionError ? "Izinkan Kamera" : "Coba Lagi";
  const permissionHelp = permissionState === "denied"
    ? "Jika prompt izin tidak muncul, buka ikon gembok atau pengaturan situs di browser, ubah Kamera ke Izinkan, lalu tekan tombol ini lagi."
    : "Pilih Izinkan saat browser menampilkan permintaan akses kamera.";

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
            <button className="camera-shutter" onClick={capture} aria-label="Ambil foto" disabled={phase === "processing"}>
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
