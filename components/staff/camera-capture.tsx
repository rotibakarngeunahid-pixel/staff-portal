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
  };
  onCapture: (photo: CapturedPhoto) => void;
  onCancel: () => void;
}

type Phase = "starting" | "live" | "processing" | "preview" | "error";

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

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth || !line) {
      line = testLine;
      return;
    }
    lines.push(line);
    line = word;
  });

  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  outletName?: string | null
) {
  const padding = Math.max(18, Math.round(width * 0.024));
  const maxTextWidth = width - padding * 2;
  const brand = `Roti Bakar Ngeunah - Outlet ${outletName || "-"}`;
  const brandFont = Math.min(34, Math.max(18, Math.round(width * 0.025)));
  const timeFont = Math.min(28, Math.max(15, Math.round(width * 0.02)));

  ctx.save();
  ctx.font = `800 ${brandFont}px Arial, sans-serif`;
  const brandLines = wrapCanvasText(ctx, brand, maxTextWidth);
  const lineGap = Math.max(8, Math.round(width * 0.008));
  const blockHeight = padding * 1.25 + brandLines.length * brandFont + lineGap + timeFont + padding * 0.85;
  const top = height - blockHeight;

  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, Math.max(0, top), width, blockHeight);

  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 4;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${brandFont}px Arial, sans-serif`;

  let y = top + padding * 0.6;
  brandLines.forEach((line) => {
    ctx.fillText(line, padding, y, maxTextWidth);
    y += brandFont;
  });

  y += lineGap;
  ctx.font = `700 ${timeFont}px Arial, sans-serif`;
  ctx.fillText(formatWatermarkTime(new Date()), padding, y, maxTextWidth);
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
    setPhase("starting");
    setErrMsg("");
    setTorchInfo("");
    setConfirming(false);
    setTorchOn(false);
    setTorchSupported(false);
    try {
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
    } catch {
      setErrMsg("Kamera tidak dapat diakses.\nPastikan izin kamera sudah diberikan di browser.");
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
    drawWatermark(ctx, canvas.width, canvas.height, watermark?.outletName);
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

  return (
    <div className="camera-overlay">
      {/* Top bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        padding: "max(14px, env(safe-area-inset-top)) 16px 12px",
        background: "linear-gradient(rgba(0,0,0,0.6), transparent)",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>
          {title || (facing === "user" ? "📸 Selfie" : "📷 Foto")}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {torchSupported && phase === "live" && (
            <button
              onClick={toggleTorch}
              aria-label={torchOn ? "Matikan senter" : "Nyalakan senter"}
              title={torchOn ? "Matikan senter" : "Nyalakan senter"}
              style={{
                width: 34, height: 34, borderRadius: "50%", border: "none",
                background: torchOn ? "rgba(250,204,21,0.95)" : "rgba(255,255,255,0.18)",
                color: torchOn ? "#1f2937" : "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}
            >
              {torchOn ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
            </button>
          )}
          <button
            onClick={cancel}
            aria-label="Tutup kamera"
            style={{
              width: 34, height: 34, borderRadius: "50%", border: "none",
              background: "rgba(255,255,255,0.18)", color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            <X size={18} />
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
            <button className="camera-ghost-btn" onClick={startCamera}>
              Coba Lagi
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
