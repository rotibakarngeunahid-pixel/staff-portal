"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, RefreshCw, X } from "lucide-react";

interface CameraCaptureProps {
  facing?: "user" | "environment";
  title?: string;
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}

type Phase = "starting" | "live" | "preview" | "error";

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

export function CameraCapture({ facing = "user", title, onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [preview, setPreview] = useState("");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    setPhase("starting");
    setErrMsg("");
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
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    const raw = canvas.toDataURL("image/jpeg", 0.9);
    setPreview(raw);
    setPhase("preview");
    stopCamera();
  }

  function retake() {
    setPreview("");
    startCamera();
  }

  async function confirm() {
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
        <button
          onClick={onCancel}
          style={{
            width: 34, height: 34, borderRadius: "50%", border: "none",
            background: "rgba(255,255,255,0.18)", color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
        >
          <X size={18} />
        </button>
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
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
            <button className="camera-shutter" onClick={capture}>
              <Camera size={28} color="#C0392B" />
            </button>
            <div style={{ width: 80 }} />
          </>
        )}

        {phase === "preview" && (
          <>
            <button className="camera-ghost-btn" onClick={retake}>
              <RefreshCw size={14} style={{ display: "inline", marginRight: 6 }} />
              Ulangi
            </button>
            <button className="camera-confirm-btn" onClick={confirm}>
              <Check size={14} style={{ display: "inline", marginRight: 6 }} />
              Gunakan Foto
            </button>
          </>
        )}
      </div>
    </div>
  );
}
