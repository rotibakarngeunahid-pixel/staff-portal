"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, ImageIcon, Send } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";
import { apiFetch, compressDataUrl, dataUrlFromFile } from "@/lib/client-api";

type ReportCfg = { id: string; label: string; required: boolean; example_photo_url: string | null; sort_order: number };

export default function StaffReportPage() {
  const router = useRouter();
  const selfieRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<"BUKA" | "TUTUP">("BUKA");
  const [shiftDate, setShiftDate] = useState("");
  const [shift, setShift] = useState<number | null>(null);
  const [typeLocked, setTypeLocked] = useState(false);
  const [items, setItems] = useState<ReportCfg[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [selfie, setSelfie] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incoming = params.get("type");
    const incomingDate = params.get("date");
    const incomingShift = params.get("shift");
    if (incoming === "TUTUP") setType("TUTUP");
    if (incomingDate) setShiftDate(incomingDate);
    if (incomingShift !== null) setShift(Number(incomingShift));
    if (incoming === "BUKA" || incoming === "TUTUP") setTypeLocked(true);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    setPhotos({});
    apiFetch<{ ok: true; items: ReportCfg[] }>("/api/reports/config", { role: "staff", body: { type } })
      .then((payload) => setItems(payload.items))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [type]);

  const requiredDone = useMemo(
    () => items.every((item) => !item.required || Boolean(photos[item.label])) && Boolean(selfie),
    [items, photos, selfie]
  );

  async function setItemPhoto(label: string, file?: File) {
    if (!file) return;
    const dataUrl = await compressDataUrl(await dataUrlFromFile(file));
    setPhotos((cur) => ({ ...cur, [label]: dataUrl }));
  }

  async function setSelfieFile(file?: File) {
    if (!file) return;
    setSelfie(await compressDataUrl(await dataUrlFromFile(file)));
  }

  async function submit() {
    if (!requiredDone || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/reports/submit", {
        method: "POST",
        role: "staff",
        body: {
          nonce: crypto.randomUUID(),
          type,
          selfie,
          shiftDate: shiftDate || undefined,
          shift: shift !== null ? shift : undefined,
          items: items.map((item) => ({
            label: item.label,
            photo: photos[item.label] || "",
            required: item.required
          }))
        }
      });
      router.replace("/app/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal submit laporan");
    } finally {
      setBusy(false);
    }
  }

  const typeColor = type === "BUKA" ? "#2980B9" : "#8E44AD";

  return (
    <StaffPage title={`Laporan ${type}`} subtitle="Upload foto sesuai konfigurasi outlet">
      {/* Type toggle (only when not locked) */}
      {!typeLocked && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(["BUKA", "TUTUP"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setType(value)}
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                fontWeight: 800,
                fontSize: 14,
                fontFamily: "var(--font-nunito, sans-serif)",
                cursor: "pointer",
                background: type === value ? (value === "BUKA" ? "#2980B9" : "#8E44AD") : "var(--surface-soft)",
                color: type === value ? "#fff" : "var(--muted)"
              }}
            >
              {value === "BUKA" ? "🌅 BUKA" : "🌙 TUTUP"}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div style={{ background: "var(--danger-bg)", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}

      {/* Selfie section */}
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 900 }}>Selfie Staff</h2>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Wajib untuk validasi laporan</p>
          </div>
          <button
            onClick={() => selfieRef.current?.click()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: selfie ? "var(--success)" : "var(--surface-soft)",
              color: selfie ? "#fff" : "var(--muted)",
              border: "none", borderRadius: 10, padding: "9px 14px",
              fontSize: 12, fontWeight: 800, cursor: "pointer",
              fontFamily: "var(--font-nunito, sans-serif)"
            }}
          >
            {selfie ? <CheckCircle2 size={15} /> : <Camera size={15} />}
            {selfie ? "Ubah" : "Ambil"}
          </button>
          <input
            ref={selfieRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => setSelfieFile(e.target.files?.[0])}
          />
        </div>
        {selfie ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={selfie} alt="Selfie" style={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 10, marginTop: 10 }} />
        ) : null}
      </div>

      {/* Report items */}
      {loading ? <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "12px 0" }}>Memuat konfigurasi...</p> : null}
      {!loading && items.length === 0 ? (
        <div className="panel" style={{ padding: 16, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
          Belum ada item foto untuk tipe ini. Selfie tetap wajib.
        </div>
      ) : null}

      {items.map((item) => {
        const done = Boolean(photos[item.label]);
        return (
          <div
            key={item.id}
            className="panel"
            style={{ padding: 14, border: done ? `2px solid var(--success)` : "1px solid var(--border)", background: done ? "var(--success-bg)" : "#fff" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h3 style={{ fontWeight: 900, fontSize: 14 }}>
                  {item.label}
                  {item.required ? <span style={{ color: "var(--danger)", marginLeft: 3 }}>*</span> : null}
                </h3>
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{item.required ? "Wajib" : "Opsional"}</p>
              </div>
              <label style={{
                display: "flex", alignItems: "center", gap: 6,
                background: done ? "var(--success)" : typeColor,
                color: "#fff",
                border: "none", borderRadius: 10, padding: "9px 14px",
                fontSize: 12, fontWeight: 800, cursor: "pointer",
                fontFamily: "var(--font-nunito, sans-serif)"
              }}>
                {done ? <CheckCircle2 size={15} /> : <Camera size={15} />}
                {done ? "Ubah" : "Foto"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setItemPhoto(item.label, e.target.files?.[0])}
                />
              </label>
            </div>

            {/* Example photo */}
            {item.example_photo_url ? (
              <div style={{ marginTop: 10, borderRadius: 10, overflow: "hidden", border: "1.5px solid rgba(41,128,185,.2)", background: "rgba(41,128,185,.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "rgba(41,128,185,.08)", borderBottom: "1px solid rgba(41,128,185,.12)" }}>
                  <ImageIcon size={12} style={{ color: "#2980B9" }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#1a6fa0", letterSpacing: "0.4px" }}>CONTOH FOTO</span>
                </div>
                <a href={item.example_photo_url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.example_photo_url} alt={`Contoh ${item.label}`} style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 180, background: "#f0f6fc" }} />
                </a>
              </div>
            ) : null}

            {/* Uploaded preview */}
            {photos[item.label] ? (
              <div style={{ marginTop: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photos[item.label]} alt={item.label} style={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 8 }} />
                <button
                  style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "var(--danger)", background: "none", border: "none", cursor: "pointer" }}
                  onClick={() => setPhotos((cur) => ({ ...cur, [item.label]: "" }))}
                >
                  Hapus foto
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Submit button */}
      <button
        className="btn btn-ok btn-action"
        disabled={!requiredDone || busy}
        onClick={submit}
        style={{ marginTop: 4 }}
      >
        <Send size={18} />
        {busy ? "Mengirim..." : "Kirim Laporan ✓"}
      </button>
    </StaffPage>
  );
}
