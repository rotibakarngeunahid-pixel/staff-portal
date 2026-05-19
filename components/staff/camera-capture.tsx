"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Flashlight, FlashlightOff, RefreshCw, X } from "lucide-react";

interface CameraCaptureProps {
  facing?: "user" | "environment";
  title?: string;
  allowTorch?: boolean;
  watermark?: {
    outletName?: string | null;
  };
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}

type Phase = "starting" | "live" | "preview" | "error";
type TorchTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
};

async function compress(dataUrl: string, maxDim = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.max(img.width, img.height) > maxDim
        ? maxDim / Math.max(img.width, img.height) : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function formatWatermarkTime(date: Date) {
  const dayDate = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
  const time = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date).replace(/\./g, ":");
  return `${dayDate}, ${time} WIB`;
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
  const [phase, setPhase] = useState<Phase>("starting");
  const [preview, setPreview] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    setPhase("starting");
    setErrMsg("");
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
      const track = stream.getVideoTracks()[0] as TorchTrack | undefined;
      const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchSupported(Boolean(allowTorch && facing === "environment" && capabilities?.torch));
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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0] as TorchTrack | undefined;
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setErrMsg("Senter tidak dapat diaktifkan di perangkat ini.");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || phase !== "live") return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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
    const raw = canvas.toDataURL("image/jpeg", 0.9);
    setPreview(raw);
    setPhase("preview");
    stopCamera();
  }

  function retake() {
    setPreview("");
    setConfirming(false);
    startCamera();
  }

  async function confirm() {
    if (!preview || confirming) return;
    setConfirming(true);
    const compressed = await compress(preview);
    onCapture(compressed);
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
            onClick={onCancel}
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
              objectFit: "cover",
              transform: isMirrored ? "scaleX(-1)" : "none",
              opacity: phase === "live" ? 1 : 0,
              transition: "opacity 0.3s"
            }}
          />
        )}

        {phase === "preview" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview}
            alt="preview"
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          />
        )}

        {phase === "starting" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: "#fff", opacity: 0.6, fontSize: 13, fontWeight: 600 }}>
              Membuka kamera...
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
      </div>

      {/* Controls */}
      <div className="camera-controls">
        {phase === "live" && (
          <>
            <button className="camera-ghost-btn" onClick={onCancel}>Batal</button>
            <button className="camera-shutter" onClick={capture} aria-label="Ambil foto">
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
