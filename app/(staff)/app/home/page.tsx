"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock, LogOut, MapPin, RefreshCw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch, compressDataUrl, dataUrlFromFile } from "@/lib/client-api";
import { ddmmyyyy, hhmm, rupiah } from "@/lib/format";
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
  outlet: { name: string; radius_m: number; shift_mode: number };
  date: string;
  shift: number;
  attendance: Attendance | null;
  reports: { type: "BUKA" | "TUTUP" }[];
  serverTime: string;
};

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

  useEffect(() => {
    load();
  }, []);

  const reportTypes = useMemo(() => new Set((status?.reports || []).map((report) => report.type)), [status]);
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

  const attendance = status?.attendance;

  return (
    <StaffPage title="Absensi" subtitle={status ? `${status.outlet.name} · ${ddmmyyyy(status.date)}` : "Status hari ini"}>
      <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFileChange} />

      <div className="mb-4 flex items-center justify-between gap-2">
        <button className="btn btn-soft text-sm" onClick={load} disabled={loading || Boolean(busy)}>
          <RefreshCw size={16} />
          Refresh
        </button>
        <button className="btn btn-soft text-sm" onClick={logout}>
          <LogOut size={16} />
          Keluar
        </button>
      </div>

      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      {busy ? <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800">{busy}</p> : null}

      <section className="panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase text-slate-500">Status Shift</p>
            <h2 className="mt-1 text-xl font-black">
              {loading ? "Memuat..." : nextState === "done" ? "Selesai" : `Shift ${status?.shift === 0 ? "Full" : status?.shift}`}
            </h2>
          </div>
          <span className={`status-pill ${attendance?.checkout_time ? "status-ok" : attendance?.checkin_time ? "status-warn" : "status-danger"}`}>
            {attendance?.checkout_time ? "Selesai" : attendance?.checkin_time ? "Bertugas" : "Belum absen"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3">
            <p className="font-extrabold text-slate-500">Masuk</p>
            <p className="mt-1 text-lg font-black">{hhmm(attendance?.checkin_time)}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3">
            <p className="font-extrabold text-slate-500">Pulang</p>
            <p className="mt-1 text-lg font-black">{hhmm(attendance?.checkout_time)}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm font-bold text-slate-600">
          <p className="flex items-center gap-2">
            <MapPin size={16} /> Radius outlet {status?.outlet.radius_m || 0} m
          </p>
          <p className="flex items-center gap-2">
            <Clock size={16} /> Telat {attendance?.late_minutes || 0} menit · Potongan {rupiah(attendance?.deduction || 0)}
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 size={16} /> Gaji final {rupiah(attendance?.final_salary || 0)}
          </p>
        </div>
      </section>

      <section className="mt-4 grid gap-3">
        {nextState === "checkin" ? (
          <button className="btn btn-primary min-h-14 text-base" onClick={() => choosePhoto("checkin")} disabled={Boolean(busy)}>
            <Camera size={20} />
            Absen Masuk
          </button>
        ) : null}
        {nextState === "report_buka" ? (
          <button className="btn btn-primary min-h-14 text-base" onClick={() => router.push(`/app/report?type=BUKA&date=${status?.date}&shift=${status?.shift}`)}>
            <Send size={20} />
            Laporan Buka Toko
          </button>
        ) : null}
        {nextState === "report_tutup" ? (
          <button className="btn btn-primary min-h-14 text-base" onClick={() => router.push(`/app/report?type=TUTUP&date=${status?.date}&shift=${status?.shift}`)}>
            <Send size={20} />
            Laporan Tutup Toko
          </button>
        ) : null}
        {nextState === "checkout" ? (
          <button className="btn btn-danger min-h-14 text-base" onClick={() => choosePhoto("checkout")} disabled={Boolean(busy)}>
            <Camera size={20} />
            Absen Pulang
          </button>
        ) : null}
      </section>
    </StaffPage>
  );
}
