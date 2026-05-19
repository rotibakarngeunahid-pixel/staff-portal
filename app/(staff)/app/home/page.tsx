"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageIcon, LogOut, MapPin, RefreshCw, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch, compressDataUrl } from "@/lib/client-api";
import { formatDateID, hhmm, rupiah } from "@/lib/format";
import { haversineDistance } from "@/lib/business";
import { StaffPage } from "@/components/staff/staff-page";
import { CameraCapture } from "@/components/staff/camera-capture";
import { useSessionStore } from "@/stores/session";

/* ─── Types ─── */
type Attendance = {
  id: string; date: string; shift: number;
  checkin_time: string | null; checkout_time: string | null;
  late_minutes: number; deduction: number; final_salary: number;
  flags: string | null;
};

type StatusPayload = {
  ok: true;
  staff: { name: string };
  outlet: {
    name: string;
    radius_m: number;
    shift_mode: number;
    lat: number;
    lng: number;
    report_buka_start: string | null;
    report_buka_end: string | null;
    report_tutup_start: string | null;
    report_tutup_end: string | null;
  };
  date: string;
  shift: number;
  isFullShift?: boolean;
  offShift?: number | null;
  activeShift?: number | null;
  attendance: Attendance | null;
  reports: { type: "BUKA" | "TUTUP" }[];
  serverTime: string;
  // PRD §8.5 — schedule-based fields
  scheduleState?: string;
  nextStep?: string;
  requiredReports?: string[];
  assignment?: { id: string; shift_type: string; status: string } | null;
  staffDayoff?: { id: string; reason: string | null } | null;
  shift1WaitingInfo?: { staff_name: string; outlet_name: string; date: string } | null;
};

type ReportCfgItem = {
  id: string; label: string; required: boolean;
  example_photo_url: string | null; sort_order: number;
};

/* ─── GPS states ─── */
type GpsStatus =
  | "unsupported"
  | "permission_denied"
  | "locating"
  | "ready"
  | "outside_radius"
  | "low_accuracy"
  | "timeout";

type GpsState = {
  status: GpsStatus;
  dist: number | null;
  accuracy: number;
  lat: number | null;
  lng: number | null;
};

/* ─── Camera slot descriptor ─── */
type CameraSlot = {
  facing: "user" | "environment";
  title: string;
  allowTorch?: boolean;
  onCapture: (dataUrl: string) => void;
};

/* ─── Flow states ─── */
type NextState = "checkin" | "report_buka" | "report_tutup" | "checkout" | "done";

const STATE_CONFIG: Record<NextState, { emoji: string; title: string; sub: string; cls: string }> = {
  checkin:      { emoji: "👋", title: "Belum Absen Masuk",      sub: "Tap tombol di bawah untuk mulai shift",                cls: "sc-neutral" },
  report_buka:  { emoji: "🌅", title: "Laporan Buka Toko",      sub: "Isi laporan buka toko sebelum mulai bekerja",           cls: "sc-working" },
  report_tutup: { emoji: "🌙", title: "Laporan Tutup Toko",     sub: "Isi laporan tutup toko sebelum absen pulang",           cls: "sc-working" },
  checkout:     { emoji: "✅", title: "Siap Absen Pulang",      sub: "Semua laporan terkirim. Tap untuk absen pulang",        cls: "sc-ready"   },
  done:         { emoji: "🎉", title: "Shift Selesai!",         sub: "Terima kasih atas kerja kerasmu hari ini. Sampai jumpa!", cls: "sc-done"  }
};

const GPS_LABEL: Record<GpsStatus, string> = {
  unsupported:      "GPS tidak didukung browser ini",
  permission_denied: "Izin lokasi ditolak - buka pengaturan browser",
  locating:         "Mendeteksi lokasi...",
  ready:            "Lokasi terdeteksi",
  outside_radius:   "Di luar area outlet",
  low_accuracy:     "Akurasi GPS terlalu rendah",
  timeout:          "GPS timeout, mencoba ulang otomatis..."
};

function timeStringJakarta(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  return `${hour}:${minute}`;
}

function parseTimeMinutes(value?: string | null) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isWithinTimeWindow(current: string, start?: string | null, end?: string | null) {
  const c = parseTimeMinutes(current);
  const s = parseTimeMinutes(start);
  const e = parseTimeMinutes(end);
  if (c === null || s === null || e === null) return true;
  if (s <= e) return c >= s && c <= e;
  return c >= s || c <= e;
}

function reportWindowFor(outlet: StatusPayload["outlet"] | undefined, type: "BUKA" | "TUTUP", now: Date) {
  const start = type === "BUKA" ? outlet?.report_buka_start : outlet?.report_tutup_start;
  const end = type === "BUKA" ? outlet?.report_buka_end : outlet?.report_tutup_end;
  if (!start || !end) return { allowed: true, label: "" };
  const startLabel = start.slice(0, 5);
  const endLabel = end.slice(0, 5);
  return {
    allowed: isWithinTimeWindow(timeStringJakarta(now), start, end),
    label: `${startLabel} - ${endLabel}`
  };
}

export default function StaffHomePage() {
  const router = useRouter();
  const setStaffToken = useSessionStore((s) => s.setStaffToken);

  /* ─── Core status state ─── */
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  /* ─── GPS ─── */
  const [gps, setGps] = useState<GpsState>({ status: "locating", dist: null, accuracy: 0, lat: null, lng: null });
  const watchIdRef = useRef<number | null>(null);
  const gpsRetryTimerRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<GeolocationPosition | null>(null);
  const activeOutletRef = useRef<StatusPayload["outlet"] | null>(null);
  const gpsPrimedRef = useRef(false);
  const serverClockOffsetRef = useRef(0);

  /* ─── Camera overlay ─── */
  const [camera, setCamera] = useState<CameraSlot | null>(null);

  /* ─── Report section state ─── */
  const [reportItems, setReportItems] = useState<ReportCfgItem[]>([]);
  const [reportItemsLoading, setReportItemsLoading] = useState(false);
  const [reportPhotos, setReportPhotos] = useState<Record<string, string>>({});
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState("");
  const [clockNow, setClockNow] = useState(() => new Date());

  /* ─── Derived ─── */
  const reportTypes = useMemo(() => new Set((status?.reports || []).map((r) => r.type)), [status]);

  const nextState = useMemo<NextState>(() => {
    // PRD §8.5: Gunakan nextStep dari server jika tersedia (schedule-based)
    const serverNext = status?.nextStep;
    if (serverNext === "checkin") return "checkin";
    if (serverNext === "report_buka") return "report_buka";
    if (serverNext === "report_tutup") return "report_tutup";
    if (serverNext === "checkout") return "checkout";
    if (serverNext === "done") return "done";

    // Fallback ke logic lama (backward compat untuk outlet tanpa assignments)
    const att = status?.attendance;
    if (!att?.checkin_time) return "checkin";
    if (!reportTypes.has("BUKA") && (status?.shift === 0 || status?.shift === 1)) return "report_buka";
    if (!reportTypes.has("TUTUP") && (status?.shift === 0 || status?.shift === 2)) return "report_tutup";
    if (!att.checkout_time) return "checkout";
    return "done";
  }, [reportTypes, status]);

  /* ─── Load status ─── */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiFetch<StatusPayload>("/api/attendance/status", { role: "staff" });
      serverClockOffsetRef.current = new Date(payload.serverTime).getTime() - Date.now();
      setClockNow(new Date(Date.now() + serverClockOffsetRef.current));
      setStatus(payload);
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(new Date(Date.now() + serverClockOffsetRef.current));
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  /* ─── GPS watch ─── */
  const applyGpsPosition = useCallback((pos: GeolocationPosition, outlet: StatusPayload["outlet"]) => {
    const { latitude, longitude, accuracy } = pos.coords;
    const dist = Math.round(haversineDistance(latitude, longitude, outlet.lat, outlet.lng));
    const acc = Math.max(0, Math.round(accuracy));
    const maxDist = outlet.radius_m + Math.min(acc, outlet.radius_m * 0.3);

    let gpsStatus: GpsStatus;
    if (acc > outlet.radius_m * 3) {
      gpsStatus = "low_accuracy";
    } else if (dist > maxDist) {
      gpsStatus = "outside_radius";
    } else {
      gpsStatus = "ready";
    }
    setGps({ status: gpsStatus, dist, accuracy: acc, lat: latitude, lng: longitude });
  }, []);

  const scheduleGpsRetry = useCallback(() => {
    if (gpsRetryTimerRef.current !== null) window.clearTimeout(gpsRetryTimerRef.current);
    gpsRetryTimerRef.current = window.setTimeout(() => {
      const outlet = activeOutletRef.current;
      if (outlet) startGpsWatch(outlet);
    }, 3000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGpsError = useCallback((err: GeolocationPositionError, outlet?: StatusPayload["outlet"]) => {
    if (err.code === 1 /* PERMISSION_DENIED */) {
      setGps({ status: "permission_denied", dist: null, accuracy: 0, lat: null, lng: null });
      return;
    }
    if (err.code === 3 /* TIMEOUT */) {
      setGps((current) => ({
        ...current,
        status: current.lat !== null && current.lng !== null ? current.status : "timeout"
      }));
      if (outlet) scheduleGpsRetry();
      return;
    }
    setGps((current) => ({
      ...current,
      status: current.lat !== null && current.lng !== null ? current.status : "locating"
    }));
    if (outlet) scheduleGpsRetry();
  }, [scheduleGpsRetry]);

  function requestGpsFix(outlet?: StatusPayload["outlet"]) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pendingPositionRef.current = pos;
        if (outlet) applyGpsPosition(pos, outlet);
      },
      (err) => handleGpsError(err, outlet),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  }

  function startGpsWatch(outlet: StatusPayload["outlet"]) {
    if (!navigator.geolocation) {
      setGps({ status: "unsupported", dist: null, accuracy: 0, lat: null, lng: null });
      return;
    }

    activeOutletRef.current = outlet;
    if (gpsRetryTimerRef.current !== null) {
      window.clearTimeout(gpsRetryTimerRef.current);
      gpsRetryTimerRef.current = null;
    }
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);

    setGps((current) => ({
      status: current.lat !== null && current.lng !== null ? current.status : "locating",
      dist: current.dist,
      accuracy: current.accuracy,
      lat: current.lat,
      lng: current.lng
    }));

    if (pendingPositionRef.current) applyGpsPosition(pendingPositionRef.current, outlet);
    requestGpsFix(outlet);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        pendingPositionRef.current = pos;
        applyGpsPosition(pos, outlet);
      },
      (err) => handleGpsError(err, outlet),
      { enableHighAccuracy: true, timeout: 60000, maximumAge: 5000 }
    );
  }

  useEffect(() => {
    if (gpsPrimedRef.current || !navigator.geolocation) return;
    gpsPrimedRef.current = true;
    requestGpsFix(activeOutletRef.current || undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!status?.outlet || !Number.isFinite(Number(status.outlet.lat)) || !Number.isFinite(Number(status.outlet.lng))) return;
    startGpsWatch(status.outlet);
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (gpsRetryTimerRef.current !== null) {
        window.clearTimeout(gpsRetryTimerRef.current);
        gpsRetryTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.outlet]);

  function retryGps() {
    if (status?.outlet) startGpsWatch(status.outlet);
  }

  /* ─── Load report config when entering report state ─── */
  useEffect(() => {
    if (nextState !== "report_buka" && nextState !== "report_tutup") return;
    const type = nextState === "report_buka" ? "BUKA" : "TUTUP";
    setReportItemsLoading(true);
    setReportPhotos({});
    setReportError("");
    apiFetch<{ ok: true; items: ReportCfgItem[] }>("/api/reports/config", { role: "staff", body: { type } })
      .then((p) => setReportItems(p.items))
      .catch(() => { setReportItems([]); })
      .finally(() => setReportItemsLoading(false));
  }, [nextState]);

  /* ─── Open camera helper ─── */
  function openCamera(slot: CameraSlot) { setCamera(slot); }
  function closeCamera() { setCamera(null); }

  /* ─── Checkin / Checkout ─── */
  async function runAttendance(action: "checkin" | "checkout", selfieDataUrl: string) {
    setBusy(action === "checkin" ? "Mengirim absen masuk..." : "Mengirim absen pulang...");
    setError("");
    try {
      const selfie = await compressDataUrl(selfieDataUrl);

      // Checkin uses the cached GPS fix — no re-fetch needed
      // Checkout does not require GPS (only server validates reports)
      const body: Record<string, unknown> = {
        nonce: crypto.randomUUID(),
        selfie,
        shift: status?.shift,
        shiftDate: status?.date
      };
      if (action === "checkin") {
        if (gps.lat === null || gps.lng === null) {
          setError("Lokasi GPS belum siap. Tunggu hingga GPS ready lalu coba lagi.");
          setBusy("");
          return;
        }
        body.lat = gps.lat;
        body.lng = gps.lng;
        body.accuracy = gps.accuracy;
      }

      await apiFetch(`/api/attendance/${action}`, { method: "POST", role: "staff", body });
      await load();
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy("");
    }
  }

  /* ─── Submit report ─── */
  async function submitReport() {
    const type = nextState === "report_buka" ? "BUKA" : "TUTUP";
    const windowState = reportWindowFor(status?.outlet, type, clockNow);
    if (!windowState.allowed) {
      setReportError(`Laporan ${type} hanya bisa dikirim pukul ${windowState.label}`);
      return;
    }
    const missingRequired = effectiveReportItems.filter((item) => item.required && !reportPhotos[item.label]);
    if (missingRequired.length > 0) {
      setReportError(`Foto wajib belum lengkap: ${missingRequired.map((i) => i.label).join(", ")}`);
      return;
    }
    setReportBusy(true);
    setReportError("");
    try {
      await apiFetch("/api/reports/submit", {
        method: "POST",
        role: "staff",
        body: {
          nonce: crypto.randomUUID(),
          type,
          shiftDate: status?.date,
          shift: status?.shift,
          items: effectiveReportItems.map((item) => ({
            label: item.label,
            photo: reportPhotos[item.label] || "",
            required: item.required
          }))
        }
      });
      setReportPhotos({});
      await load();
    } catch (err) {
      setReportError(humanError(err));
    } finally {
      setReportBusy(false);
    }
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setStaffToken(null);
    router.replace("/app/login");
  }

  const att = status?.attendance;
  const outlet = status?.outlet;
  const sc = loading ? null : STATE_CONFIG[nextState];
  const isReportState = nextState === "report_buka" || nextState === "report_tutup";
  const reportType = nextState === "report_buka" ? "BUKA" : "TUTUP";
  const reportTypeColor = reportType === "BUKA" ? "#2563EB" : "#7C3AED";
  const reportWindow = reportWindowFor(outlet, reportType, clockNow);
  const effectiveReportItems = useMemo<ReportCfgItem[]>(() => {
    if (!isReportState || reportItemsLoading || reportItems.length > 0) return reportItems;
    return [{
      id: `default-${reportType}`,
      label: `Foto Laporan ${reportType}`,
      required: true,
      example_photo_url: null,
      sort_order: 0
    }];
  }, [isReportState, reportItems, reportItemsLoading, reportType]);
  const isFullShift = Boolean(status?.isFullShift);

  /* ─── Checkin button state ─── */
  const gpsReady = gps.status === "ready";
  const checkinDisabled = Boolean(busy) || !gpsReady;
  const checkinLabel = {
    unsupported:       "GPS tidak didukung",
    permission_denied: "Izin Lokasi Ditolak",
    locating:          "Menunggu GPS...",
    ready:             "Absen Masuk",
    outside_radius:    `Di Luar Area (${gps.dist ?? "—"}m)`,
    low_accuracy:      "Akurasi GPS Rendah",
    timeout:           "GPS Timeout"
  }[gps.status];

  return (
    <>
      {/* Camera overlay (full screen, above everything) */}
      {camera && (
        <CameraCapture
          facing={camera.facing}
          title={camera.title}
          allowTorch={camera.allowTorch}
          watermark={{ outletName: outlet?.name }}
          onCapture={camera.onCapture}
          onCancel={closeCamera}
        />
      )}

      <StaffPage title="Sistem Absensi" subtitle={outlet ? `${outlet.name} · ${formatDateID(status?.date)}` : undefined}>
        {/* Top action row */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-soft"
            style={{ flex: 1, fontSize: 12, padding: "9px 12px" }}
            onClick={load}
            disabled={loading || Boolean(busy)}
          >
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            {loading ? "Memuat..." : "Refresh"}
          </button>
          <button className="btn btn-soft" style={{ flex: 1, fontSize: 12, padding: "9px 12px" }} onClick={logout}>
            <LogOut size={14} /> Keluar
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
            borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 600,
            color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8
          }}>
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              aria-label="Tutup pesan error"
              style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Busy banner */}
        {busy && (
          <div style={{
            background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
            borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "var(--warning)"
          }}>
            ⏳ {busy}
          </div>
        )}

        {/* ═══ PRD §8.5 — State Dayoff ═══ */}
        {!loading && status?.scheduleState === "dayoff" && (
          <div className="status-card" style={{ background: "linear-gradient(135deg,#FEF2F2,#FECACA20)", border: "2px solid #FECACA" }}>
            <div className="status-icon">🏖️</div>
            <h2 className="status-title" style={{ color: "#DC2626" }}>Hari Ini Kamu Libur</h2>
            <p className="status-sub">
              {status?.staffDayoff?.reason ? `Alasan: ${status.staffDayoff.reason}` : "Kamu telah dijadwalkan libur hari ini."}
            </p>
            <p style={{ fontSize: 11, color: "#DC2626", marginTop: 8, fontWeight: 600 }}>
              Tombol absen tidak tersedia saat status libur.
            </p>
          </div>
        )}

        {/* ═══ PRD §8.5 — State Unassigned (outlet 2-shift, belum pilih jadwal) ═══ */}
        {!loading && status?.scheduleState === "unassigned" && (
          <div className="status-card sc-neutral">
            <div className="status-icon">📋</div>
            <h2 className="status-title">Belum Ada Jadwal</h2>
            <p className="status-sub">Kamu belum memilih jadwal kerja untuk hari ini. Pilih jadwal di menu Jadwal sebelum bisa absen.</p>
            <a
              href="/app/schedule"
              style={{
                display: "inline-block", marginTop: 12,
                background: "var(--primary)", color: "#fff",
                borderRadius: 12, padding: "10px 24px",
                fontSize: 13, fontWeight: 800, textDecoration: "none"
              }}
            >
              Pilih Jadwal →
            </a>
          </div>
        )}

        {/* ═══ PRD: State Menunggu Shift 1 Absen Keluar ═══ */}
        {!loading && status?.scheduleState === "waiting_shift1" && (
          <div className="status-card" style={{ background: "linear-gradient(135deg,#FFFBEB,#FEF3C720)", border: "2px solid #FDE68A" }}>
            <div className="status-icon">⏳</div>
            <h2 className="status-title" style={{ color: "#D97706" }}>Menunggu Shift 1 Selesai</h2>
            <p className="status-sub">
              Belum bisa absen masuk. Shift 1 di <strong>{status?.shift1WaitingInfo?.outlet_name || outlet?.name}</strong> masih aktif dan belum absen keluar.
            </p>
            {status?.shift1WaitingInfo?.staff_name && (
              <p style={{ fontSize: 13, color: "#92400E", marginTop: 8, fontWeight: 700 }}>
                Staff Shift 1: {status.shift1WaitingInfo.staff_name}
              </p>
            )}
            <div style={{
              marginTop: 12, padding: "10px 14px",
              background: "#FEF3C7", borderRadius: 10,
              border: "1px solid #FDE68A"
            }}>
              <p style={{ fontSize: 12, color: "#78350F", fontWeight: 600, lineHeight: 1.6 }}>
                Silakan tunggu staff Shift 1 menyelesaikan absen keluar terlebih dahulu.
              </p>
            </div>
            <button
              className="btn btn-soft"
              style={{ marginTop: 12, fontSize: 12, padding: "9px 16px", width: "100%" }}
              onClick={load}
              disabled={loading || Boolean(busy)}
            >
              <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
              {loading ? "Memuat..." : "Cek Status Terbaru"}
            </button>
          </div>
        )}

        {/* ═══ MAIN FLOW (not report state, not dayoff, not unassigned, not waiting_shift1) ═══ */}
        {!isReportState && status?.scheduleState !== "dayoff" && status?.scheduleState !== "unassigned" && status?.scheduleState !== "waiting_shift1" && (
          <>
            {/* Status card */}
            {loading ? (
              <div className="status-card sc-neutral">
                <div className="status-icon">⏳</div>
                <h2 className="status-title">Memuat data...</h2>
                <p className="status-sub">Mengambil status absensi</p>
              </div>
            ) : sc ? (
              <div key={nextState} className={`status-card ${sc.cls} animate-slide-up`}>
                <div className="status-icon">{sc.emoji}</div>
                <h2 className="status-title">{sc.title}</h2>
                {isFullShift && nextState === "checkin" && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{
                      display: "inline-block", background: "var(--primary)", color: "#fff",
                      fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "3px 10px", letterSpacing: "0.4px"
                    }}>
                      FULL SHIFT
                    </span>
                  </div>
                )}
                <p className="status-sub">{sc.sub}</p>
              </div>
            ) : null}

            {/* Full shift info banner */}
            {isFullShift && !loading && (
              <div style={{
                background: "var(--primary-bg, #EEF2FF)", border: "1.5px solid var(--primary-border, #C7D2FE)",
                borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--primary)"
              }}>
                🌟 Full Shift aktif — Shift {status?.offShift} libur. Gaji 2x hari ini!
              </div>
            )}

            {/* GPS bar */}
            <div className="gps-bar">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className={`gps-dot gps-${gps.status === "ready" ? "ok" : gps.status === "locating" ? "wait" : "bad"}`} />
                <div>
                  <p className="gps-label">GPS · Jarak ke Outlet</p>
                  <p style={{ fontSize: 10, color: "var(--muted-light)", marginTop: 1 }}>
                    {GPS_LABEL[gps.status]}
                    {gps.accuracy > 0 && gps.status !== "locating" ? ` · ±${gps.accuracy}m` : ""}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className={`gps-dist ${gps.status === "ready" ? "ok" : gps.status === "locating" ? "wait" : "bad"}`}>
                  {gps.dist !== null ? `${gps.dist}m` : "—"}
                </p>
                {outlet && (
                  <p style={{ fontSize: 10, color: "var(--muted-light)", marginTop: 1 }}>
                    radius {outlet.radius_m}m
                  </p>
                )}
              </div>
            </div>

            {/* GPS status messages — only after initial load */}
            {!loading && gps.status === "permission_denied" && nextState === "checkin" && (
              <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>
                🔒 Izin lokasi ditolak. Buka pengaturan browser dan aktifkan izin lokasi untuk aplikasi ini, lalu refresh halaman.
              </div>
            )}
            {!loading && gps.status === "outside_radius" && nextState === "checkin" && (
              <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>
                📍 Kamu terlalu jauh dari outlet ({gps.dist}m, batas {outlet?.radius_m}m). Pindah lebih dekat untuk absen masuk.
              </div>
            )}
            {!loading && gps.status === "low_accuracy" && nextState === "checkin" && (
              <div style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--warning)" }}>
                📡 Akurasi GPS terlalu rendah (±{gps.accuracy}m). Pindah ke tempat terbuka atau tunggu GPS membaik.
              </div>
            )}
            {!loading && (gps.status === "timeout" || gps.status === "locating") && nextState === "checkin" && (
              <div style={{ background: "var(--surface-soft)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "var(--muted)", fontWeight: 600 }}>
                  {gps.status === "timeout" ? "GPS timeout, mencoba ulang..." : "Menunggu sinyal GPS..."}
                </span>
                <button className="btn btn-soft" style={{ fontSize: 11, padding: "5px 10px" }} onClick={retryGps}>
                  <MapPin size={12} /> Coba Sekarang
                </button>
              </div>
            )}

            {/* Time info panel (after checkin) */}
            {att?.checkin_time && (
              <div className="panel animate-slide-up" style={{ padding: 14, overflow: "hidden" }}>
                {/* Jam masuk & pulang */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div style={{ textAlign: "center", padding: "10px 6px", background: "var(--surface-soft)", borderRadius: 12 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--muted-light)", marginBottom: 4 }}>MASUK</p>
                    <p style={{ fontFamily: "var(--font-nunito,sans-serif)", fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{hhmm(att.checkin_time)}</p>
                  </div>
                  <div style={{ textAlign: "center", padding: "10px 6px", background: "var(--surface-soft)", borderRadius: 12 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--muted-light)", marginBottom: 4 }}>PULANG</p>
                    <p style={{ fontFamily: "var(--font-nunito,sans-serif)", fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{hhmm(att.checkout_time) || "—"}</p>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Full shift bonus */}
                  {String(att.flags || "").includes("FULL_SHIFT_2X") && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "rgba(79,70,229,0.07)", borderRadius: 10, padding: "7px 12px"
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#4338CA" }}>🌟 Full Shift · Gaji 2×</span>
                      <span className="status-pill" style={{ background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", fontSize: 10 }}>Bonus aktif</span>
                    </div>
                  )}

                  {/* Potongan telat */}
                  {att.late_minutes > 0 && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "var(--warning-bg)", borderRadius: 10, padding: "7px 12px"
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--warning)" }}>
                        ⚠️ Telat {att.late_minutes} mnt
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--danger)" }}>
                        -{rupiah(att.deduction)}
                      </span>
                    </div>
                  )}

                  {/* Total gaji */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "var(--success-bg)", borderRadius: 10, padding: "9px 12px",
                    border: "1px solid var(--success-border)"
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--success)" }}>Gaji hari ini</span>
                    <span style={{
                      fontFamily: "var(--font-nunito,sans-serif)", fontSize: 16, fontWeight: 900,
                      color: "var(--success)", letterSpacing: "-0.3px"
                    }}>
                      {rupiah(att.final_salary)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons — only after initial load */}
            {!loading && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {nextState === "checkin" && (
                <button
                  className={`btn btn-primary btn-action${gpsReady && !busy ? " btn-glow" : ""}`}
                  onClick={() => openCamera({
                    facing: "user",
                    title: "📸 Selfie Absen Masuk",
                    onCapture: (url) => { closeCamera(); runAttendance("checkin", url); }
                  })}
                  disabled={checkinDisabled}
                >
                  <Camera size={20} /> {busy ? busy : checkinLabel}
                </button>
              )}

              {nextState === "checkout" && (
                <button
                  className={`btn btn-danger btn-action${!busy ? " btn-glow" : ""}`}
                  onClick={() => openCamera({
                    facing: "user",
                    title: "📸 Selfie Absen Pulang",
                    onCapture: (url) => { closeCamera(); runAttendance("checkout", url); }
                  })}
                  disabled={Boolean(busy)}
                >
                  <Camera size={20} /> Absen Pulang
                </button>
              )}
            </div>}
          </>
        )}

        {/* ═══ REPORT SECTION (inline) ═══ */}
        {isReportState && !loading && (
          <div key={nextState} className="animate-slide-up" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Report header */}
            <div style={{
              background: `${reportTypeColor}0E`,
              border: `1.5px solid ${reportTypeColor}30`,
              borderRadius: 16,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.7px", color: reportTypeColor, textTransform: "uppercase", marginBottom: 3 }}>
                  {reportType === "BUKA" ? "🌅 Laporan" : "🌙 Laporan"}
                </p>
                <h2 style={{ fontSize: 17, fontWeight: 900, color: reportType === "BUKA" ? "#1D4ED8" : "#6D28D9", letterSpacing: "-0.3px" }}>
                  {reportType === "BUKA" ? "Buka Toko" : "Tutup Toko"}
                </h2>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{formatDateID(status?.date)}</p>
                <p style={{ fontSize: 10, color: "var(--muted-light)", marginTop: 2 }}>
                  {status?.shift === 0 ? "Full Shift" : `Shift ${status?.shift}`}
                </p>
              </div>
            </div>

            {/* GPS bar (compact) */}
            <div className="gps-bar" style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className={`gps-dot gps-${gps.status === "ready" ? "ok" : gps.status === "locating" ? "wait" : "bad"}`} />
                <p className="gps-label" style={{ fontSize: 11 }}>
                  {gps.status === "locating" ? "Mendeteksi GPS..." : `GPS · ±${gps.accuracy}m`}
                </p>
              </div>
              <p className={`gps-dist ${gps.status === "ready" ? "ok" : gps.status === "locating" ? "wait" : "bad"}`} style={{ fontSize: 16 }}>
                {gps.dist !== null ? `${gps.dist}m` : "—"}
              </p>
            </div>

            {/* Report error */}
            {reportError && (
              <div style={{
                background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
                borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "var(--danger)"
              }}>
                ⚠️ {reportError}
              </div>
            )}

            {!reportWindow.allowed ? (
              <div style={{
                background: "var(--warning-bg)", border: "1.5px solid var(--warning-border)",
                borderRadius: 14, padding: "18px 16px", textAlign: "center"
              }}>
                <p style={{ fontSize: 22, marginBottom: 8 }}>⏰</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: "var(--warning)", marginBottom: 4 }}>
                  Belum Waktunya
                </p>
                <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                  Laporan {reportType === "BUKA" ? "Buka Toko" : "Tutup Toko"} hanya bisa dikirim pada pukul{" "}
                  <strong style={{ color: "var(--ink)" }}>{reportWindow.label}</strong>.
                </p>
                <p style={{ fontSize: 11, color: "var(--muted-light)", marginTop: 8 }}>
                  Kembali ke halaman ini saat sudah waktunya.
                </p>
              </div>
            ) : (
              <>
                {/* Report items */}
                {reportItemsLoading ? (
                  <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "12px 0" }}>
                    Memuat konfigurasi...
                  </p>
                ) : null}

                {!reportItemsLoading && reportItems.length === 0 && (
                  <div className="panel" style={{ padding: 14, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                    Admin belum mengatur item foto. Gunakan foto laporan umum di bawah.
                  </div>
                )}

                {effectiveReportItems.map((item) => {
                  const done = Boolean(reportPhotos[item.label]);
                  return (
                    <div key={item.id} className={`report-item-card${done ? " done" : ""}`}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: 14, fontWeight: 800 }}>
                            {item.label}
                            {item.required ? <span style={{ color: "var(--danger)", marginLeft: 3 }}>*</span> : null}
                          </h3>
                          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                            {item.required ? "Wajib" : "Opsional"}
                          </p>
                        </div>
                        <button
                          onClick={() => openCamera({
                            facing: "environment",
                            title: `📷 ${item.label}`,
                            allowTorch: true,
                            onCapture: (url) => { closeCamera(); setReportPhotos((cur) => ({ ...cur, [item.label]: url })); }
                          })}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: done ? "var(--success)" : reportTypeColor,
                            color: "#fff", border: "none", borderRadius: 10,
                            padding: "9px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer",
                            fontFamily: "var(--font-nunito,sans-serif)", flexShrink: 0
                          }}
                        >
                          {done ? <CheckCircle2 size={14} /> : <Camera size={14} />}
                          {done ? "Ubah" : "Foto"}
                        </button>
                      </div>

                      {/* Example photo — clearly labeled, visually distinct from uploaded photo */}
                      {item.example_photo_url && !done && (
                        <div style={{
                          marginTop: 12,
                          border: "2.5px dashed #F59E0B",
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "#FFFBEB"
                        }}>
                          {/* Header banner — very prominent */}
                          <div style={{
                            background: "#F59E0B", padding: "7px 12px",
                            display: "flex", alignItems: "center", gap: 7
                          }}>
                            <ImageIcon size={13} color="#fff" />
                            <span style={{ fontSize: 11, fontWeight: 900, color: "#fff", letterSpacing: "0.6px", textTransform: "uppercase" }}>
                              Foto Contoh
                            </span>
                            <span style={{
                              marginLeft: "auto", background: "rgba(255,255,255,0.3)",
                              color: "#fff", fontSize: 9, fontWeight: 800,
                              borderRadius: 6, padding: "2px 7px", letterSpacing: "0.4px"
                            }}>
                              BUKAN FOTO ASLI
                            </span>
                          </div>
                          {/* Keterangan */}
                          <div style={{ padding: "7px 12px 4px", background: "#FEF3C7" }}>
                            <p style={{ fontSize: 11, color: "#92400E", fontWeight: 700, lineHeight: 1.4 }}>
                              Ini hanya contoh foto yang benar. Foto kamu harus sesuai kondisi toko yang sesungguhnya.
                            </p>
                          </div>
                          {/* Foto contoh */}
                          <a href={item.example_photo_url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.example_photo_url}
                              alt={`Contoh foto: ${item.label}`}
                              style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 180, background: "#f8fafc", opacity: 0.88 }}
                            />
                          </a>
                          <div style={{ padding: "5px 12px 8px", background: "#FEF3C7" }}>
                            <p style={{ fontSize: 10, color: "#B45309", textAlign: "center", fontWeight: 600 }}>
                              👆 Tap foto untuk memperbesar contoh
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Uploaded photo preview */}
                      {done && (
                        <div style={{ marginTop: 8 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={reportPhotos[item.label]} alt={item.label} className="report-photo-thumb" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Submit */}
                <button
                  className="btn btn-ok btn-action"
                  disabled={reportBusy}
                  onClick={submitReport}
                  style={{ marginTop: 4, fontSize: 15 }}
                >
                  <Send size={18} />
                  {reportBusy ? "Mengirim laporan..." : `Kirim Laporan ${reportType}`}
                </button>
              </>
            )}
          </div>
        )}
      </StaffPage>
    </>
  );
}

function humanError(err: unknown): string {
  if (!(err instanceof Error)) return "Terjadi kesalahan. Coba lagi.";
  const msg = err.message;
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch"))
    return "Data belum berhasil dimuat. Periksa koneksi internet lalu coba lagi.";
  if (msg.includes("401") || msg.includes("Sesi") || msg.includes("login"))
    return "Sesi berakhir. Silakan login ulang.";
  if (msg.includes("403") || msg.includes("ditolak") || msg.includes("izin"))
    return "Anda tidak memiliki izin untuk melakukan aksi ini.";
  if (msg.includes("nonce") || msg.includes("duplicate"))
    return "Permintaan duplikat terdeteksi. Coba lagi.";
  if (msg.includes("GPS") || msg.includes("lokasi") || msg.includes("radius"))
    return msg;
  if (msg.includes("500") || msg.includes("server"))
    return "Server sedang bermasalah. Coba beberapa saat lagi.";
  return msg || "Terjadi kesalahan. Coba lagi.";
}
