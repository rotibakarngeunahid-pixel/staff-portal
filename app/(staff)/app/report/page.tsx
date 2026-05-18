"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageIcon, Send } from "lucide-react";
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
    setPhotos((current) => ({ ...current, [label]: dataUrl }));
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

  return (
    <StaffPage title={`Laporan ${type}`} subtitle="Upload foto sesuai konfigurasi outlet">
      {!typeLocked && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["BUKA", "TUTUP"] as const).map((value) => (
            <button key={value} className={`btn ${type === value ? "btn-primary" : "btn-soft"}`} onClick={() => setType(value)}>
              {value}
            </button>
          ))}
        </div>
      )}

      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

      <section className="panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">Selfie Staff</h2>
            <p className="text-sm font-semibold text-slate-500">Wajib untuk validasi laporan</p>
          </div>
          <button className={`btn ${selfie ? "btn-primary" : "btn-soft"} text-sm`} onClick={() => selfieRef.current?.click()}>
            <Camera size={17} />
            {selfie ? "Ubah" : "Ambil"}
          </button>
          <input
            ref={selfieRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(event) => setSelfieFile(event.target.files?.[0])}
          />
        </div>
      </section>

      <section className="mt-4 space-y-3">
        {loading ? <p className="text-sm font-bold text-slate-500">Memuat konfigurasi...</p> : null}
        {!loading && items.length === 0 ? (
          <div className="panel p-4 text-sm font-semibold text-slate-600">
            Belum ada item foto untuk tipe laporan ini. Selfie tetap wajib.
          </div>
        ) : null}
        {items.map((item) => (
          <article key={item.id} className="panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black">{item.label}</h3>
                <p className="text-sm font-semibold text-slate-500">{item.required ? "Wajib diisi" : "Opsional"}</p>
              </div>
              <label className={`btn ${photos[item.label] ? "btn-primary" : "btn-soft"} text-sm`}>
                <Camera size={17} />
                {photos[item.label] ? "Ubah" : "Foto"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => setItemPhoto(item.label, event.target.files?.[0])}
                />
              </label>
            </div>
            {item.example_photo_url ? (
              <a
                href={item.example_photo_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 grid grid-cols-[4rem_1fr] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-2"
              >
                <span className="block h-16 w-16 overflow-hidden rounded-lg bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.example_photo_url} alt={`Contoh ${item.label}`} className="h-full w-full object-cover" />
                </span>
                <span className="flex items-center gap-2 text-sm font-extrabold text-[var(--muted)]">
                  <ImageIcon size={16} />
                  Contoh foto yang benar
                </span>
              </a>
            ) : null}
            {photos[item.label] ? (
              <button
                className="mt-3 text-xs font-extrabold text-red-700"
                onClick={() => setPhotos((current) => ({ ...current, [item.label]: "" }))}
              >
                Hapus foto
              </button>
            ) : null}
          </article>
        ))}
      </section>

      <button className="btn btn-primary mt-5 w-full" disabled={!requiredDone || busy} onClick={submit}>
        <Send size={18} />
        {busy ? "Mengirim..." : "Kirim Laporan"}
      </button>
    </StaffPage>
  );
}
