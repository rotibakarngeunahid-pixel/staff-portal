"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, LogOut, RefreshCw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch, compressDataUrl, dataUrlFromFile } from "@/lib/client-api";
import { ddmmyyyy, hhmm, rupiah } from "@/lib/format";
import { haversineDistance } from "@/lib/business";
import { StaffPage } from "@/components/staff/staff-page";
import { useSessionStore } from "@/stores/session";

type Attendance = {
  id: string;
  date: string;
  shift: number;
  checkin_time: string | null;
  checkout_time: string | null;
  late_minutes: number;
  deduction: number;
  final_salary: number;
  flags: string | null;
};

type StatusPayload = {
  ok: true;
  staff: { name: string };
  outlet: { name: string; radius_m: number; shift_mode: number; lat: number; lng: number };
  date: string;
  shift: number;
  attendance: Attendance | null;
  reports: { type: "BUKA" | "TUTUP" }[];
  serverTime: string;
};

type GpsState = { dist: number | null; accuracy: number; status: "ok" | "bad" | "wait" };

function getLocation() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000
    });
  });
}

export default function StaffHomePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const setStaffToken = useSessionStore((state) => state.setStaffToken);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [selectedAction, setSelectedAction] = useState<"checkin" | "checkout" | null>(null);
  const [gps, setGps] = useState<GpsState>({ dist: null, accuracy: 0, status: "wait" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const payload = await apiFetch<StatusPayload>("/api/attendance/status", { role: "staff" });
      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Real-time GPS watch
  useEffect(() => {
    if (!status?.outlet?.lat) return;
    const outlet = status.outlet;
    function onPos(pos: GeolocationPosition) {
      const dist = haversineDistance(pos.coords.latitude, pos.coords.longitude, outlet.lat, outlet.lng);
      const accuracy = Math.max(0, pos.coords.accuracy);
      const maxDist = outlet.radius_m + Math.min(accuracy, outlet.radius_m * 0.3);
      setGps({ dist: Math.round(dist), accuracy: Math.round(accuracy), status: dist <= maxDist ? "ok" : "bad" });
    }
    function onErr() { setGps({ dist: null, accuracy: 0, status: "wait" }); }
    const id = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(id);
  }, [status?.outlet]);

  const reportTypes = useMemo(() => new Set((status?.reports || []).map((r) => r.type)), [status]);

  const nextState = useMemo(() => {
    const att = status?.attendance;
    if (!att?.checkin_time) return "checkin";
    if (!reportTypes.has("BUKA") && (status?.shift === 0 || status?.shift === 1)) return "report_buka";
    if (!reportTypes.has("TUTUP") && (status?.shift === 0 || status?.shift === 2)) return "report_tutup";
    if (!att.checkout_time) return "checkout";
    return "done";
  }, [reportTypes, status]);

  async function runAttendance(action: "checkin" | "checkout", file: File) {
    setBusy(action === "checkin" ? "Mengirim absen masuk..." : "Mengirim absen pulang...");
    setError("");
    try {
      const [position, rawSelfie] = await Promise.all([getLocation(), dataUrlFromFile(file)]);
      const selfie = await compressDataUrl(rawSelfie);
      await apiFetch(`/api/attendance/${action}`, {
        method: "POST",
        role: "staff",
        body: {
          nonce: crypto.randomUUID(),
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          selfie,
          shift: status?.shift,
          shiftDate: status?.date
        }
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi gagal");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function choosePhoto(action: "checkin" | "checkout") {
    setSelectedAction(action);
    fileRef.current?.click();
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedAction) return;
    await runAttendance(selectedAction, file);
    setSelectedAction(null);
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setStaffToken(null);
    router.replace("/app/login");
  }

  const att = status?.attendance;
  const outlet = status?.outlet;

  // Status card config
  const stateConfig = {
    checkin: { emoji: "👋", title: "Belum Absen Masuk", sub: "Tap tombol di bawah untuk mulai shift", cls: "sc-neutral" },
    report_buka: { emoji: "📋", title: "Laporan Buka Toko", sub: "Absen masuk tercatat. Kirim laporan buka toko sekarang", cls: "sc-working" },
    report_tutup: { emoji: "📋", title: "Laporan Tutup Toko", sub: "Kirim laporan tutup toko sebelum absen pulang", cls: "sc-working" },
    checkout: { emoji: "✅", title: "Siap Absen Pulang", sub: "Semua laporan sudah terkirim. Tap untuk absen pulang", cls: "sc-ready" },
    done: { emoji: "🎉", title: "Shift Selesai!", sub: "Terima kasih. Sampai jumpa besok!", cls: "sc-done" }
  };
  const sc = loading ? null : stateConfig[nextState as keyof typeof stateConfig];

  return (
    <StaffPage title="Sistem Absensi" subtitle={outlet ? `${outlet.name} · ${ddmmyyyy(status?.date)}` : undefined}>
      <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFileChange} />

      {/* Top action row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
        <button className="btn btn-soft" style={{ flex: 1, fontSize: 12, padding: "9px 12px" }} onClick={load} disabled={loading || Boolean(busy)}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button className="btn btn-soft" style={{ flex: 1, fontSize: 12, padding: "9px 12px" }} onClick={logout}>
          <LogOut size={14} /> Keluar
        </button>
      </div>

      {/* Error / busy banners */}
      {error ? (
        <div style={{ background: "var(--danger-bg)", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}
      {busy ? (
        <div style={{ background: "var(--warning-bg)", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#7B5E00" }}>
          {busy}
        </div>
      ) : null}

      {/* Status card */}
      {loading ? (
        <div className="status-card sc-neutral">
          <div className="status-icon">⏳</div>
          <h2 className="status-title">Memuat...</h2>
          <p className="status-sub">Mengambil data absensi</p>
        </div>
      ) : sc ? (
        <div className={`status-card ${sc.cls}`}>
          <div className="status-icon">{sc.emoji}</div>
          <h2 className="status-title">{sc.title}</h2>
          <p className="status-sub">{sc.sub}</p>
        </div>
      ) : null}

      {/* GPS bar */}
      <div className="gps-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className={`gps-dot gps-${gps.status}`} />
          <div>
            <p className="gps-label">Jarak ke Outlet</p>
            <p style={{ fontSize: 10, color: "var(--muted-light)", marginTop: 1 }}>
              {gps.status === "wait" ? "Mendeteksi GPS..." : `Akurasi ±${gps.accuracy}m`}
            </p>
          </div>
        </div>
        <div>
          <p className={`gps-dist ${gps.status}`} style={{ textAlign: "right" }}>
            {gps.dist !== null ? `${gps.dist}m` : "—"}
          </p>
          <p style={{ fontSize: 10, color: "var(--muted-light)", textAlign: "right", marginTop: 1 }}>
            {outlet ? `radius ${outlet.radius_m}m` : ""}
          </p>
        </div>
      </div>

      {/* Time info panel */}
      {att?.checkin_time ? (
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted-light)", letterSpacing: "0.5px" }}>Masuk</p>
              <p style={{ fontFamily: "var(--font-nunito, sans-serif)", fontSize: 22, fontWeight: 900, marginTop: 4 }}>{hhmm(att.checkin_time)}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted-light)", letterSpacing: "0.5px" }}>Pulang</p>
              <p style={{ fontFamily: "var(--font-nunito, sans-serif)", fontSize: 22, fontWeight: 900, marginTop: 4 }}>{hhmm(att.checkout_time) || "—"}</p>
            </div>
          </div>
          {att.late_minutes > 0 ? (
            <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--warning)" }}>
              ⚠️ Telat {att.late_minutes} menit · Potongan {rupiah(att.deduction)}
            </div>
          ) : null}
          <div style={{ marginTop: 8, textAlign: "center", fontSize: 13, fontWeight: 800, color: "var(--success)" }}>
            Gaji {rupiah(att.final_salary)}
          </div>
        </div>
      ) : null}

      {/* Action buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {nextState === "checkin" ? (
          <button
            className={`btn btn-primary btn-action${!busy ? " btn-glow" : ""}`}
            onClick={() => choosePhoto("checkin")}
            disabled={Boolean(busy)}
          >
            <Camera size={20} /> Absen Masuk
          </button>
        ) : null}
        {nextState === "report_buka" ? (
          <button
            className="btn btn-action"
            style={{ background: "#2980B9", color: "#fff", boxShadow: "0 6px 24px rgba(41,128,185,.32)" }}
            onClick={() => router.push(`/app/report?type=BUKA&date=${status?.date}&shift=${status?.shift}`)}
          >
            <Send size={20} /> Laporan Buka Toko
          </button>
        ) : null}
        {nextState === "report_tutup" ? (
          <button
            className="btn btn-action"
            style={{ background: "#2980B9", color: "#fff", boxShadow: "0 6px 24px rgba(41,128,185,.32)" }}
            onClick={() => router.push(`/app/report?type=TUTUP&date=${status?.date}&shift=${status?.shift}`)}
          >
            <Send size={20} /> Laporan Tutup Toko
          </button>
        ) : null}
        {nextState === "checkout" ? (
          <button
            className={`btn btn-danger btn-action${!busy ? " btn-glow" : ""}`}
            onClick={() => choosePhoto("checkout")}
            disabled={Boolean(busy)}
          >
            <Camera size={20} /> Absen Pulang
          </button>
        ) : null}
      </div>
    </StaffPage>
  );
}
