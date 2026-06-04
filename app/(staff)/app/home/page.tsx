"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock, ImageIcon, LogOut, MapPin, RefreshCw, Send, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";
import { formatDateID, hhmm, rupiah } from "@/lib/format";
import { haversineDistance, isCheckoutTimeReached, reportSubmissionStatus, shiftEndTime } from "@/lib/business";
import { CapturedPhoto, isValidImageFile, photoFromFile, revokePhoto } from "@/lib/client-image";
import { drawWatermark } from "@/components/staff/camera-capture";
import { StaffPage } from "@/components/staff/staff-page";
import { CameraCapture } from "@/components/staff/camera-capture";
import { useSessionStore } from "@/stores/session";
import { saveDraft, loadDraft, clearDraft } from "@/lib/report-draft";

/* ─── Types ─── */
type Attendance = {
  id: string; date: string; shift: number;
  checkin_time: string | null; checkout_time: string | null;
  late_minutes: number; deduction: number; final_salary: number;
  flags: string | null;
};

type OutletInfo = {
  name: string;
  radius_m: number;
  shift_mode: number;
  lat: number;
  lng: number;
  shift1_start: string | null;
  shift1_end: string | null;
  shift2_start: string | null;
  shift2_end: string | null;
  report_buka_start: string | null;
  report_buka_end: string | null;
  report_tutup_start: string | null;
  report_tutup_end: string | null;
};

type StatusPayload = {
  ok: true;
  staff: { name: string };
  outlet: OutletInfo;
  date: string;
  shift: number;
  isFullShift?: boolean;
  offShift?: number | null;
  activeShift?: number | null;
  attendance: Attendance | null;
  reports: { type: "BUKA" | "TUTUP" }[];
  serverTime: string;
  scheduleState?: string;
  nextStep?: string;
  requiredReports?: string[];
  assignment?: { id: string; shift_type: string; status: string } | null;
  staffDayoff?: { id: string; reason: string | null } | null;
  approvedLeave?: { id: string; reason: string | null } | null;
  shift1WaitingInfo?: { staff_name: string; outlet_name: string; date: string } | null;
  checkinTooEarly?: { tooEarly: boolean; windowOpensAt: string | null } | null;
};

type ReportCfgItem = {
  id: string; label: string; required: boolean;
  example_photo_url: string | null; sort_order: number;
  photo_mode?: "realtime" | "upload";
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

type CameraSlot = {
  facing: "user" | "environment";
  title: string;
  allowTorch?: boolean;
  watermarkOverride?: {
    outletName?: string | null;
    staffName?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  onCapture: (photo: CapturedPhoto) => void;
};

type ReportPhoto = CapturedPhoto & { label: string };
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
  permission_denied: "Izin lokasi ditolak — buka pengaturan browser",
  locating:         "Mendeteksi lokasi...",
  ready:            "Lokasi terdeteksi",
  outside_radius:   "Di luar area outlet",
  low_accuracy:     "Akurasi GPS terlalu rendah",
  timeout:          "GPS timeout, mencoba ulang otomatis..."
};

/* ─── Realtime Guide ─── */
function RealtimeGuide({
  status, nextState, checkoutAllowed, checkoutBlockedMsg, reportWindow, clockNow
}: {
  status: StatusPayload | null;
  nextState: NextState;
  checkoutAllowed: boolean;
  checkoutBlockedMsg: string;
  reportWindow: { canSubmit: boolean; isLate: boolean; lateMinutes: number; label: string; start: string; end: string };
  clockNow: Date;
}) {
  if (!status) return null;

  const shift = status.shift;
  const shiftLabel = shift === 0 ? "Full Shift" : `Shift ${shift}`;
  const assignment = status.assignment;
  const shiftType = assignment?.shift_type || (shift === 0 ? "FULL_SHIFT" : shift === 1 ? "SHIFT_1" : "SHIFT_2");
  const isFullShift = shiftType === "FULL_SHIFT" || shift === 0;

  // Panduan berdasarkan kondisi saat ini
  let icon = "ℹ️";
  let color = "var(--primary)";
  let bg = "var(--primary-bg, #EEF2FF)";
  let border = "var(--primary-border, #C7D2FE)";
  let message = "";

  if (nextState === "checkin") {
    icon = "👋";
    color = "#2563EB";
    bg = "#EFF6FF";
    border = "#BFDBFE";
    if (isFullShift) {
      message = `Anda bertugas Full Shift hari ini. Urutan tugas: Absen Masuk → Laporan Buka Toko → Laporan Tutup Toko → Absen Keluar.`;
    } else if (shiftType === "SHIFT_1") {
      const endMsg = status.outlet?.shift1_end ? ` Shift selesai pukul ${status.outlet.shift1_end.slice(0,5)}.` : "";
      message = `Anda bertugas Shift 1.${endMsg} Setelah absen masuk, isi Laporan Buka Toko, lalu absen keluar.`;
    } else if (shiftType === "SHIFT_2") {
      const endMsg = status.outlet?.shift2_end ? ` Shift selesai pukul ${status.outlet.shift2_end.slice(0,5)}.` : "";
      message = `Anda bertugas Shift 2.${endMsg} Setelah absen masuk, isi Laporan Tutup Toko, lalu absen keluar.`;
    } else {
      message = "Silakan absen masuk terlebih dahulu untuk memulai shift.";
    }
  } else if (nextState === "report_buka") {
    icon = "🌅";
    color = "#1D4ED8";
    bg = "#EFF6FF";
    border = "#BFDBFE";
    if (!reportWindow.canSubmit) {
      message = `Laporan Buka Toko belum bisa diisi. Tersedia mulai pukul ${reportWindow.start.slice(0,5)}.`;
      icon = "⏰";
      color = "#D97706";
      bg = "#FFFBEB";
      border = "#FDE68A";
    } else {
      message = "Anda sudah absen masuk. Langkah berikutnya: isi Laporan Buka Toko.";
    }
  } else if (nextState === "report_tutup") {
    icon = "🌙";
    color = "#6D28D9";
    bg = "#F5F3FF";
    border = "#DDD6FE";
    if (!reportWindow.canSubmit) {
      message = `Laporan Tutup Toko belum bisa diisi. Tersedia mulai pukul ${reportWindow.start.slice(0,5)}.`;
      icon = "⏰";
      color = "#D97706";
      bg = "#FFFBEB";
      border = "#FDE68A";
    } else if (isFullShift) {
      message = "Laporan Buka Toko sudah terkirim. Sekarang isi Laporan Tutup Toko sebelum absen keluar.";
    } else {
      message = "Anda sudah absen masuk. Langkah berikutnya: isi Laporan Tutup Toko.";
    }
  } else if (nextState === "checkout") {
    if (!checkoutAllowed) {
      icon = "⏰";
      color = "#D97706";
      bg = "#FFFBEB";
      border = "#FDE68A";
      message = checkoutBlockedMsg || "Absen keluar belum tersedia. Tunggu hingga jam shift selesai.";
    } else {
      icon = "✅";
      color = "#16A34A";
      bg = "#F0FDF4";
      border = "#BBF7D0";
      message = "Semua laporan sudah terkirim. Silakan lakukan absen keluar saat GPS siap.";
    }
  } else if (nextState === "done") {
    return null; // Done state tidak perlu guide
  }

  if (!message) return null;

  return (
    <div style={{
      background: bg, border: `1.5px solid ${border}`,
      borderRadius: 12, padding: "10px 14px",
      display: "flex", alignItems: "flex-start", gap: 10
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.4 }}>{icon}</span>
      <p style={{ fontSize: 12, fontWeight: 600, color, lineHeight: 1.6, margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

export default function StaffHomePage() {
  const router = useRouter();
  const setStaffToken = useSessionStore((s) => s.setStaffToken);

  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  /* ─── GPS ─── */
  const [gps, setGps] = useState<GpsState>({ status: "locating", dist: null, accuracy: 0, lat: null, lng: null });
  const watchIdRef = useRef<number | null>(null);
  const gpsRetryTimerRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<GeolocationPosition | null>(null);
  const activeOutletRef = useRef<OutletInfo | null>(null);
  const gpsPrimedRef = useRef(false);
  const serverClockOffsetRef = useRef(0);

  const [camera, setCamera] = useState<CameraSlot | null>(null);
  const attendanceBusyRef = useRef(false);
  const [praiseMessage, setPraiseMessage] = useState("");

  /* ─── Report section state ─── */
  const [reportItems, setReportItems] = useState<ReportCfgItem[]>([]);
  const [reportItemsLoading, setReportItemsLoading] = useState(false);
  const [reportPhotos, setReportPhotos] = useState<Record<string, ReportPhoto>>({});
  const [reportBusy, setReportBusy] = useState(false);
  const reportBusyRef = useRef(false);
  const [reportBusyLabel, setReportBusyLabel] = useState("");
  const [reportError, setReportError] = useState("");
  const [invCheck, setInvCheck] = useState<"idle" | "loading" | "ok" | "blocked">("idle");
  const [invBlockMsg, setInvBlockMsg] = useState("");
  const [clockNow, setClockNow] = useState(() => new Date());
  const reportPhotosRef = useRef<Record<string, ReportPhoto>>({});
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadingItemRef = useRef<ReportCfgItem | null>(null);

  /* ─── Draft auto-save ─── */
  const [draftSavedVisible, setDraftSavedVisible] = useState(false);
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftHideTimerRef = useRef<number | null>(null);

  useEffect(() => { reportPhotosRef.current = reportPhotos; }, [reportPhotos]);
  useEffect(() => {
    return () => {
      Object.values(reportPhotosRef.current).forEach(revokePhoto);
      reportPhotosRef.current = {};
    };
  }, []);

  /* ─── Auto-save draft saat foto berubah (debounce 400 ms) ─── */
  useEffect(() => {
    // Hanya simpan jika sedang dalam state laporan dan ada minimal 1 foto
    if (!isReportState) return;
    if (Object.keys(reportPhotos).length === 0) return;

    const type = reportType as "BUKA" | "TUTUP";
    const date = status?.date;
    const shift = status?.shift;
    if (!date || shift === undefined) return;

    if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(async () => {
      await saveDraft(type, reportPhotos, date, shift);
      setDraftSavedVisible(true);
      if (draftHideTimerRef.current !== null) window.clearTimeout(draftHideTimerRef.current);
      draftHideTimerRef.current = window.setTimeout(() => setDraftSavedVisible(false), 4000);
    }, 400);

    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportPhotos]);

  /* ─── Derived ─── */
  const reportTypes = useMemo(() => new Set((status?.reports || []).map((r) => r.type)), [status]);

  const nextState = useMemo<NextState>(() => {
    const serverNext = status?.nextStep;
    if (serverNext === "checkin") return "checkin";
    if (serverNext === "report_buka") return "report_buka";
    if (serverNext === "report_tutup") return "report_tutup";
    if (serverNext === "checkout") return "checkout";
    if (serverNext === "done") return "done";
    const att = status?.attendance;
    if (!att?.checkin_time) return "checkin";
    if (!reportTypes.has("BUKA") && (status?.shift === 0 || status?.shift === 1)) return "report_buka";
    if (!reportTypes.has("TUTUP") && (status?.shift === 0 || status?.shift === 2)) return "report_tutup";
    if (!att.checkout_time) return "checkout";
    return "done";
  }, [reportTypes, status]);

  /* ─── Checkout time validation ─── */
  const checkoutAllowed = useMemo(() => {
    if (!status?.outlet) return true;
    const outlet = status.outlet;
    const shift = status.shift as 0 | 1 | 2;
    const endTime = shiftEndTime(
      { shift1_end: outlet.shift1_end, shift2_end: outlet.shift2_end },
      shift
    );
    return isCheckoutTimeReached(endTime, clockNow);
  }, [status, clockNow]);

  const checkoutBlockedMsg = useMemo(() => {
    if (!status?.outlet) return "";
    const outlet = status.outlet;
    const shift = status.shift as 0 | 1 | 2;
    const endTime = shiftEndTime(
      { shift1_end: outlet.shift1_end, shift2_end: outlet.shift2_end },
      shift
    );
    if (!endTime) return "";
    return `Absen keluar belum tersedia. Anda dapat absen keluar mulai pukul ${String(endTime).slice(0, 5)}.`;
  }, [status]);

  /* ─── Report window (dipakai sebelum render dan di useEffect inventori) ─── */
  const reportTypeEarly = nextState === "report_buka" ? "BUKA" : "TUTUP";
  const reportWindowEarly = reportSubmissionStatus(status?.outlet, reportTypeEarly, clockNow);

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
  const applyGpsPosition = useCallback((pos: GeolocationPosition, outlet: OutletInfo) => {
    const { latitude, longitude, accuracy } = pos.coords;
    const dist = Math.round(haversineDistance(latitude, longitude, outlet.lat, outlet.lng));
    const acc = Math.max(0, Math.round(accuracy));
    const maxDist = outlet.radius_m + Math.min(acc, outlet.radius_m * 0.3);
    let gpsStatus: GpsStatus;
    if (acc > outlet.radius_m * 3) gpsStatus = "low_accuracy";
    else if (dist > maxDist) gpsStatus = "outside_radius";
    else gpsStatus = "ready";
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

  const handleGpsError = useCallback((err: GeolocationPositionError, outlet?: OutletInfo) => {
    if (err.code === 1) { setGps({ status: "permission_denied", dist: null, accuracy: 0, lat: null, lng: null }); return; }
    if (err.code === 3) {
      setGps((c) => ({ ...c, status: c.lat !== null ? c.status : "timeout" }));
      if (outlet) scheduleGpsRetry(); return;
    }
    setGps((c) => ({ ...c, status: c.lat !== null ? c.status : "locating" }));
    if (outlet) scheduleGpsRetry();
  }, [scheduleGpsRetry]);

  function requestGpsFix(outlet?: OutletInfo) {
    navigator.geolocation.getCurrentPosition(
      (pos) => { pendingPositionRef.current = pos; if (outlet) applyGpsPosition(pos, outlet); },
      (err) => handleGpsError(err, outlet),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  }

  function startGpsWatch(outlet: OutletInfo) {
    if (!navigator.geolocation) { setGps({ status: "unsupported", dist: null, accuracy: 0, lat: null, lng: null }); return; }
    activeOutletRef.current = outlet;
    if (gpsRetryTimerRef.current !== null) { window.clearTimeout(gpsRetryTimerRef.current); gpsRetryTimerRef.current = null; }
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    setGps((c) => ({ status: c.lat !== null ? c.status : "locating", dist: c.dist, accuracy: c.accuracy, lat: c.lat, lng: c.lng }));
    if (pendingPositionRef.current) applyGpsPosition(pendingPositionRef.current, outlet);
    requestGpsFix(outlet);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => { pendingPositionRef.current = pos; applyGpsPosition(pos, outlet); },
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
      if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      if (gpsRetryTimerRef.current !== null) { window.clearTimeout(gpsRetryTimerRef.current); gpsRetryTimerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.outlet]);

  function retryGps() { if (status?.outlet) startGpsWatch(status.outlet); }

  function clearReportPhotos() {
    setReportPhotos((current) => {
      Object.values(current).forEach(revokePhoto);
      reportPhotosRef.current = {};
      return {};
    });
  }

  function saveReportPhoto(label: string, photo: CapturedPhoto) {
    setReportPhotos((current) => {
      if (current[label]) revokePhoto(current[label]);
      const next = { ...current, [label]: { ...photo, label } };
      reportPhotosRef.current = next;
      return next;
    });
  }

  /* ─── Load report config when entering report state ─── */
  useEffect(() => {
    if (nextState !== "report_buka" && nextState !== "report_tutup") return;
    const type = nextState === "report_buka" ? "BUKA" : "TUTUP";
    setReportItemsLoading(true);
    clearReportPhotos();
    setReportError("");

    // Pulihkan draft jika ada dan masih valid untuk shift hari ini
    // (status selalu tersedia saat nextState menjadi report karena nextState diturunkan dari status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const s = status;
    if (s?.date && s?.shift !== undefined) {
      const draft = loadDraft(type, s.date, s.shift);
      if (draft && Object.keys(draft).length > 0) {
        setReportPhotos(draft);
        reportPhotosRef.current = draft;
        setDraftSavedVisible(true);
        if (draftHideTimerRef.current !== null) window.clearTimeout(draftHideTimerRef.current);
        draftHideTimerRef.current = window.setTimeout(() => setDraftSavedVisible(false), 5000);
      }
    }

    apiFetch<{ ok: true; items: ReportCfgItem[] }>("/api/reports/config", { role: "staff", body: { type } })
      .then((p) => setReportItems(p.items))
      .catch(() => setReportItems([]))
      .finally(() => setReportItemsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextState]);

  /* ─── Inventory check: reset saat keluar dari state report_tutup ─── */
  useEffect(() => {
    if (nextState !== "report_tutup") {
      setInvCheck("idle");
      setInvBlockMsg("");
    }
  }, [nextState]);

  const checkInventory = useCallback(async () => {
    setInvCheck("loading");
    setInvBlockMsg("");
    try {
      const res = await apiFetch<{ can_proceed: boolean; has_mapping: boolean; message: string }>(
        "/api/reports/inventory-status", { role: "staff" }
      );
      if (!res.has_mapping || res.can_proceed) {
        setInvCheck("ok");
      } else {
        setInvCheck("blocked");
        setInvBlockMsg(res.message || "");
      }
    } catch {
      setInvCheck("ok"); // fail-open: jangan blokir jika API error
    }
  }, []);

  /* ─── Auto-check inventori saat masuk state report_tutup dan window terbuka ─── */
  useEffect(() => {
    if (nextState !== "report_tutup" || invCheck !== "idle") return;
    if (!reportWindowEarly.canSubmit) return;
    checkInventory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextState, invCheck, reportWindowEarly.canSubmit]);

  function openCamera(slot: CameraSlot) { setCamera(slot); }
  function closeCamera() { setCamera(null); }

  /* ─── Checkin / Checkout ─── */
  async function runAttendance(action: "checkin" | "checkout", selfie: CapturedPhoto) {
    if (attendanceBusyRef.current) return; // anti double-submit
    setError("");
    if (action === "checkin" && (gps.lat === null || gps.lng === null)) {
      setError("Lokasi GPS belum siap. Tunggu hingga GPS ready lalu coba lagi.");
      return;
    }
    if (action === "checkout") {
      if (gps.lat === null || gps.lng === null) {
        setError("GPS belum siap untuk absen keluar. Tunggu hingga lokasi terdeteksi.");
        return;
      }
      if (!checkoutAllowed) {
        setError(checkoutBlockedMsg || "Absen keluar belum tersedia.");
        return;
      }
    }
    attendanceBusyRef.current = true;
    setBusy(action === "checkin" ? "Mengompres & mengunggah selfie..." : "Mengompres & mengunggah selfie...");
    try {
      const body = new FormData();
      body.append("nonce", crypto.randomUUID());
      body.append("selfie", selfie.blob, selfie.fileName);
      if (status?.shift !== undefined) body.append("shift", String(status.shift));
      if (status?.date) body.append("shiftDate", status.date);
      // GPS selalu dikirim untuk checkin dan checkout
      body.append("lat", String(gps.lat));
      body.append("lng", String(gps.lng));
      body.append("accuracy", String(gps.accuracy));
      setBusy(action === "checkin" ? "Menyimpan absen masuk..." : "Menyimpan absen pulang...");
      const result = await apiFetch<{ ok: true; praise_message?: string | null }>(`/api/attendance/${action}`, { method: "POST", role: "staff", body });
      if (action === "checkin" && result.praise_message) setPraiseMessage(result.praise_message);
      await load();
    } catch (err) {
      setError(humanError(err));
    } finally {
      attendanceBusyRef.current = false;
      setBusy("");
    }
  }

  /* ─── Submit report ─── */
  async function submitReport() {
    if (reportBusyRef.current || loading || reportItemsLoading) return;
    const type = nextState === "report_buka" ? "BUKA" : "TUTUP";
    const windowState = reportSubmissionStatus(status?.outlet, type, new Date(Date.now() + serverClockOffsetRef.current));
    if (!windowState.canSubmit) {
      setReportError(`Laporan ${type === "BUKA" ? "Buka Toko" : "Tutup Toko"} belum bisa dikirim. Tersedia mulai pukul ${windowState.start.slice(0, 5)}.`);
      return;
    }
    const missingRequired = effectiveReportItems.filter((item) => item.required && !reportPhotos[item.label]);
    if (missingRequired.length > 0) {
      setReportError(`Foto wajib belum lengkap: ${missingRequired.map((i) => i.label).join(", ")}`);
      return;
    }
    if (effectiveReportItems.length === 0) {
      setReportError("Konfigurasi laporan belum siap. Tunggu sebentar lalu coba lagi.");
      return;
    }
    reportBusyRef.current = true;
    setReportBusy(true);
    setReportError("");
    try {
      // Upload setiap foto langsung ke PHP server (bypass Vercel payload limit).
      // Payload ke API route hanya berisi URL kecil, bukan blob besar.
      const uploadEndpoint =
        process.env.NEXT_PUBLIC_PHOTO_UPLOAD_ENDPOINT ||
        "https://foto-laporan-area.rotibakarngeunah.my.id/api/upload-laporan-area.php";

      const itemsWithPhoto = effectiveReportItems.filter((item) => reportPhotos[item.label]);
      const photoUrls: Record<string, string> = {};

      for (let i = 0; i < itemsWithPhoto.length; i++) {
        const item = itemsWithPhoto[i];
        const photo = reportPhotos[item.label];
        setReportBusyLabel(`Mengunggah foto ${i + 1} dari ${itemsWithPhoto.length}...`);

        const fd = new FormData();
        fd.append("foto", photo.blob, photo.fileName);

        let uploadRes: Response;
        try {
          uploadRes = await fetch(uploadEndpoint, { method: "POST", body: fd });
        } catch {
          throw new Error("Upload foto gagal. Pastikan koneksi internet stabil lalu coba lagi.");
        }

        let result: { success?: boolean; foto_url?: string; error?: string } | null = null;
        try { result = await uploadRes.json(); } catch { /* ignore parse error */ }

        if (!uploadRes.ok || !result?.success || !result.foto_url) {
          const serverMsg = result?.error || "";
          if (serverMsg.includes("10MB") || serverMsg.includes("besar") || uploadRes.status === 413) {
            throw new Error("Foto terlalu besar meski sudah dikompres. Coba ambil foto ulang dengan pencahayaan lebih baik.");
          }
          throw new Error("Upload foto gagal. Pastikan koneksi stabil lalu coba lagi.");
        }

        photoUrls[item.label] = result.foto_url;
      }

      // Kirim laporan ke API dengan URL foto saja (payload kecil, tidak ada blob)
      setReportBusyLabel("Menyimpan laporan...");
      const items = effectiveReportItems.map((item) => ({
        label: item.label,
        required: item.required,
        photo_url: photoUrls[item.label] || "",
      }));

      await apiFetch("/api/reports/submit", {
        method: "POST",
        role: "staff",
        body: {
          nonce: crypto.randomUUID(),
          type,
          shiftDate: status?.date,
          shift: status?.shift,
          items,
        },
      });

      clearReportPhotos();
      clearDraft(type); // hapus draft setelah laporan berhasil dikirim
      setDraftSavedVisible(false);
      setReportBusyLabel("Memuat ulang status...");
      await load();
    } catch (err) {
      setReportError(humanError(err));
    } finally {
      reportBusyRef.current = false;
      setReportBusy(false);
      setReportBusyLabel("");
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
  const reportWindow = reportSubmissionStatus(outlet, reportType, clockNow);
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
  const requiresScheduleSelection = status?.scheduleState === "unassigned" && status?.nextStep !== "checkin";

  /* ─── Checkin button state ─── */
  const gpsReady = gps.status === "ready";
  const tooEarlyForCheckin = Boolean(status?.checkinTooEarly?.tooEarly);
  const checkinWindowOpensAt = status?.checkinTooEarly?.windowOpensAt ?? null;
  const checkinDisabled = Boolean(busy) || !gpsReady || tooEarlyForCheckin;
  const checkinLabel = tooEarlyForCheckin
    ? `Belum Waktunya (mulai ${checkinWindowOpensAt ?? "1 jam sebelum shift"})`
    : ({
        unsupported:       "GPS tidak didukung",
        permission_denied: "Izin Lokasi Ditolak",
        locating:          "Menunggu GPS...",
        ready:             "Absen Masuk",
        outside_radius:    `Di Luar Area (${gps.dist ?? "—"}m)`,
        low_accuracy:      "Akurasi GPS Rendah",
        timeout:           "GPS Timeout"
      }[gps.status]);

  // Checkout: perlu GPS dan validasi waktu
  const checkoutDisabled = Boolean(busy) || !gpsReady || !checkoutAllowed;
  const checkoutLabel = !checkoutAllowed
    ? "Belum Waktunya"
    : !gpsReady
    ? checkinLabel
    : "Absen Pulang";

  const requiredReportPhotosComplete = effectiveReportItems.every((item) => !item.required || Boolean(reportPhotos[item.label]));
  const reportPhotoDisabled = loading || reportItemsLoading || reportBusy || !reportWindow.canSubmit;
  const reportSubmitDisabled =
    loading || reportItemsLoading || reportBusy || !reportWindow.canSubmit ||
    !requiredReportPhotosComplete || effectiveReportItems.length === 0 ||
    (nextState === "report_tutup" && invCheck !== "ok");

  function openReportCamera(item: ReportCfgItem) {
    if (!reportWindow.canSubmit) {
      setReportError(`Laporan ${reportType === "BUKA" ? "Buka Toko" : "Tutup Toko"} belum bisa dikirim. Tersedia mulai pukul ${reportWindow.start.slice(0, 5)}.`);
      return;
    }
    if (reportPhotoDisabled) return;
    openCamera({
      facing: "environment",
      title: `Foto ${item.label}`,
      allowTorch: true,
      watermarkOverride: {
        outletName: outlet?.name,
        staffName: status?.staff?.name,
        lat: gps.lat,
        lng: gps.lng
      },
      onCapture: (photo) => {
        const latestWindow = reportSubmissionStatus(status?.outlet, reportType, new Date(Date.now() + serverClockOffsetRef.current));
        if (!latestWindow.canSubmit) {
          revokePhoto(photo);
          setReportError(`Laporan ${reportType === "BUKA" ? "Buka Toko" : "Tutup Toko"} belum bisa dikirim. Tersedia mulai pukul ${latestWindow.start.slice(0, 5)}.`);
          return;
        }
        saveReportPhoto(item.label, photo);
      }
    });
  }

  function openUploadForItem(item: ReportCfgItem) {
    if (!reportWindow.canSubmit) {
      setReportError(`Laporan ${reportType === "BUKA" ? "Buka Toko" : "Tutup Toko"} belum bisa dikirim. Tersedia mulai pukul ${reportWindow.start.slice(0, 5)}.`);
      return;
    }
    if (reportPhotoDisabled) return;
    uploadingItemRef.current = item;
    uploadInputRef.current?.click();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset input agar file yang sama bisa dipilih ulang
    e.target.value = "";
    if (!file || !uploadingItemRef.current) return;
    const item = uploadingItemRef.current;
    uploadingItemRef.current = null;

    if (!isValidImageFile(file)) {
      setReportError("File tidak valid. Harap upload file foto/gambar saja (JPG, PNG, WEBP, HEIC).");
      return;
    }

    const latestWindow = reportSubmissionStatus(status?.outlet, reportType, new Date(Date.now() + serverClockOffsetRef.current));
    if (!latestWindow.canSubmit) {
      setReportError(`Laporan ${reportType === "BUKA" ? "Buka Toko" : "Tutup Toko"} belum bisa dikirim. Tersedia mulai pukul ${latestWindow.start.slice(0, 5)}.`);
      return;
    }

    setReportBusy(true);
    setReportBusyLabel("Memproses foto...");
    setReportError("");
    try {
      const watermarkOpts = {
        outletName: outlet?.name,
        staffName: status?.staff?.name,
        lat: gps.lat,
        lng: gps.lng
      };
      const safe = item.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 42);
      const baseName = `${safe || "foto"}-${Date.now()}`;
      const photo = await photoFromFile(file, {
        baseName,
        maxDimension: 1600,
        quality: 0.8,
        preferredType: "image/webp",
        onDraw: (ctx, w, h) => drawWatermark(ctx, w, h, watermarkOpts)
      });
      saveReportPhoto(item.label, photo);
    } catch {
      setReportError("Gagal memproses foto. Pastikan file gambar valid lalu coba lagi.");
    } finally {
      setReportBusy(false);
      setReportBusyLabel("");
    }
  }

  return (
    <>
      {/* Hidden file input untuk mode upload foto */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />

      {camera && (
        <CameraCapture
          facing={camera.facing}
          title={camera.title}
          allowTorch={camera.allowTorch}
          watermark={camera.watermarkOverride ?? {
            outletName: outlet?.name,
            staffName: status?.staff?.name,
            lat: gps.lat,
            lng: gps.lng
          }}
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
            disabled={loading || Boolean(busy) || reportBusy}
          >
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            {loading ? "Memuat..." : "Refresh"}
          </button>
          <button className="btn btn-soft" style={{ flex: 1, fontSize: 12, padding: "9px 12px" }} onClick={logout} disabled={reportBusy}>
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
            <button onClick={() => setError("")} aria-label="Tutup" style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Busy banner */}
        {busy && (
          <div style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "var(--warning)" }}>
            ⏳ {busy}
          </div>
        )}

        {/* ═══ State: Libur / Cuti ═══ */}
        {!loading && status?.scheduleState === "dayoff" && (
          <div className="status-card" style={{ background: "linear-gradient(135deg,#FEF2F2,#FECACA20)", border: "2px solid #FECACA" }}>
            <div className="status-icon">{status?.approvedLeave ? "🌴" : "🏖️"}</div>
            <h2 className="status-title" style={{ color: "#DC2626" }}>
              {status?.approvedLeave ? "Cuti Disetujui" : "Hari Ini Kamu Libur"}
            </h2>
            <p className="status-sub">
              {status?.approvedLeave
                ? (status.approvedLeave.reason ? `Alasan cuti: ${status.approvedLeave.reason}` : "Pengajuan cutimu telah disetujui untuk hari ini.")
                : (status?.staffDayoff?.reason ? `Alasan: ${status.staffDayoff.reason}` : "Kamu telah dijadwalkan libur hari ini.")}
            </p>
            <p style={{ fontSize: 11, color: "#DC2626", marginTop: 8, fontWeight: 600 }}>Tombol absen tidak tersedia saat status libur/cuti.</p>
          </div>
        )}

        {/* ═══ State: Belum pilih jadwal (legacy untuk outlet yang belum migrasi) ═══ */}
        {!loading && requiresScheduleSelection && (
          <div className="status-card sc-neutral">
            <div className="status-icon">📋</div>
            <h2 className="status-title">Belum Ada Jadwal</h2>
            <p className="status-sub">Kamu belum memilih jadwal kerja untuk hari ini. Pilih jadwal di menu Jadwal sebelum bisa absen.</p>
            <a href="/app/schedule" style={{ display: "inline-block", marginTop: 12, background: "var(--primary)", color: "#fff", borderRadius: 12, padding: "10px 24px", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
              Pilih Jadwal →
            </a>
          </div>
        )}

        {/* ═══ ALUR UTAMA ═══ */}
        {!isReportState && status?.scheduleState !== "dayoff" && !requiresScheduleSelection && (
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
                    <span style={{ display: "inline-block", background: "var(--primary)", color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "3px 10px", letterSpacing: "0.4px" }}>
                      FULL SHIFT
                    </span>
                  </div>
                )}
                <p className="status-sub">{sc.sub}</p>
              </div>
            ) : null}

            {/* Banner pujian masuk lebih awal */}
            {!loading && praiseMessage && (
              <div style={{
                background: "linear-gradient(135deg,#F0FDF4,#DCFCE7)",
                border: "1.5px solid #86EFAC",
                borderRadius: 12, padding: "12px 14px",
                display: "flex", alignItems: "center", gap: 10
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>🎉</span>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#15803D", margin: 0, lineHeight: 1.5 }}>
                  {praiseMessage}
                </p>
                <button
                  onClick={() => setPraiseMessage("")}
                  style={{ marginLeft: "auto", background: "none", border: "none", color: "#15803D", cursor: "pointer", flexShrink: 0, padding: 4 }}
                  aria-label="Tutup"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Full shift info banner */}
            {isFullShift && !loading && (
              <div style={{ background: "var(--primary-bg, #EEF2FF)", border: "1.5px solid var(--primary-border, #C7D2FE)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>
                🌟 Full Shift aktif — Shift {status?.offShift} libur. Gaji 2x hari ini!
              </div>
            )}

            {/* Panduan realtime */}
            {!loading && (
              <RealtimeGuide
                status={status}
                nextState={nextState}
                checkoutAllowed={checkoutAllowed}
                checkoutBlockedMsg={checkoutBlockedMsg}
                reportWindow={reportWindow}
                clockNow={clockNow}
              />
            )}

            {/* Banner: absen terlalu awal */}
            {!loading && tooEarlyForCheckin && nextState === "checkin" && (
              <div style={{ background: "#FFFBEB", border: "1.5px solid #FDE68A", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "#92400E" }}>
                ⏰ Terlalu awal untuk absen masuk. Jadwal shift kamu dimulai lebih siang — absen baru bisa dilakukan mulai pukul <strong>{checkinWindowOpensAt ?? "1 jam sebelum shift"}</strong>.
              </div>
            )}

            {/* GPS bar */}
            <div className="gps-bar">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className={`gps-dot gps-${gps.status === "ready" ? "ok" : gps.status === "locating" ? "wait" : "bad"}`} />
                <div>
                  <p className="gps-label">GPS · Jarak ke Outlet</p>
                  <p style={{ fontSize: 10, color: "var(--muted-light)", marginTop: 1 }}>
                    {GPS_LABEL[gps.status]}{gps.accuracy > 0 && gps.status !== "locating" ? ` · ±${gps.accuracy}m` : ""}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className={`gps-dist ${gps.status === "ready" ? "ok" : gps.status === "locating" ? "wait" : "bad"}`}>
                  {gps.dist !== null ? `${gps.dist}m` : "—"}
                </p>
                {outlet && <p style={{ fontSize: 10, color: "var(--muted-light)", marginTop: 1 }}>radius {outlet.radius_m}m</p>}
              </div>
            </div>

            {/* GPS status messages */}
            {!loading && gps.status === "permission_denied" && (nextState === "checkin" || nextState === "checkout") && (
              <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>
                🔒 Izin lokasi ditolak. Buka pengaturan browser dan aktifkan izin lokasi untuk aplikasi ini, lalu refresh halaman.
              </div>
            )}
            {!loading && gps.status === "outside_radius" && (nextState === "checkin" || nextState === "checkout") && (
              <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>
                📍 Kamu terlalu jauh dari outlet ({gps.dist}m, batas {outlet?.radius_m}m). Pindah lebih dekat untuk absen.
              </div>
            )}
            {!loading && gps.status === "low_accuracy" && (nextState === "checkin" || nextState === "checkout") && (
              <div style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--warning)" }}>
                📡 Akurasi GPS terlalu rendah (±{gps.accuracy}m). Pindah ke tempat terbuka atau tunggu GPS membaik.
              </div>
            )}
            {!loading && (gps.status === "timeout" || gps.status === "locating") && (nextState === "checkin" || nextState === "checkout") && (
              <div style={{ background: "var(--surface-soft)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "var(--muted)", fontWeight: 600 }}>
                  {gps.status === "timeout" ? "GPS timeout, mencoba ulang..." : "Menunggu sinyal GPS..."}
                </span>
                <button className="btn btn-soft" style={{ fontSize: 11, padding: "5px 10px" }} onClick={retryGps}>
                  <MapPin size={12} /> Coba Sekarang
                </button>
              </div>
            )}

            {/* Informasi absen keluar belum tersedia */}
            {!loading && nextState === "checkout" && !checkoutAllowed && (
              <div style={{ background: "#FFFBEB", border: "1.5px solid #FDE68A", borderRadius: 14, padding: "16px", textAlign: "center" }}>
                <Clock size={28} color="#D97706" style={{ margin: "0 auto 8px" }} />
                <p style={{ fontSize: 14, fontWeight: 800, color: "#D97706", marginBottom: 4 }}>Belum Waktunya Absen Keluar</p>
                <p style={{ fontSize: 12, color: "#78350F", lineHeight: 1.6 }}>{checkoutBlockedMsg}</p>
              </div>
            )}

            {/* Time info panel (after checkin) */}
            {att?.checkin_time && (
              <div className="panel animate-slide-up" style={{ padding: 14, overflow: "hidden" }}>
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
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {String(att.flags || "").includes("FULL_SHIFT_2X") && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(79,70,229,0.07)", borderRadius: 10, padding: "7px 12px" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#4338CA" }}>🌟 Full Shift · Gaji 2×</span>
                      <span className="status-pill" style={{ background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", fontSize: 10 }}>Bonus aktif</span>
                    </div>
                  )}
                  {att.late_minutes > 0 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--warning-bg)", borderRadius: 10, padding: "7px 12px" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--warning)" }}>⚠️ Telat {att.late_minutes} mnt</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--danger)" }}>-{rupiah(att.deduction)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--success-bg)", borderRadius: 10, padding: "9px 12px", border: "1px solid var(--success-border)" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--success)" }}>Gaji hari ini</span>
                    <span style={{ fontFamily: "var(--font-nunito,sans-serif)", fontSize: 16, fontWeight: 900, color: "var(--success)", letterSpacing: "-0.3px" }}>
                      {rupiah(att.final_salary)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {!loading && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {nextState === "checkin" && (
                <button
                  className={`btn btn-primary btn-action${gpsReady && !busy ? " btn-glow" : ""}`}
                  onClick={() => openCamera({
                    facing: "user",
                    title: "📸 Selfie Absen Masuk",
                    watermarkOverride: {
                      outletName: outlet?.name,
                      staffName: status?.staff?.name,
                      lat: gps.lat,
                      lng: gps.lng
                    },
                    onCapture: (photo) => runAttendance("checkin", photo)
                  })}
                  disabled={checkinDisabled}
                >
                  <Camera size={20} /> {busy ? busy : checkinLabel}
                </button>
              )}

              {nextState === "checkout" && (
                <button
                  className={`btn btn-danger btn-action${gpsReady && checkoutAllowed && !busy ? " btn-glow" : ""}`}
                  onClick={() => {
                    if (!checkoutAllowed) { setError(checkoutBlockedMsg || "Absen keluar belum tersedia."); return; }
                    if (!gpsReady) { setError("GPS belum siap. Tunggu hingga lokasi terdeteksi untuk absen keluar."); return; }
                    openCamera({
                      facing: "user",
                      title: "📸 Selfie Absen Pulang",
                      watermarkOverride: {
                        outletName: outlet?.name,
                        staffName: status?.staff?.name,
                        lat: gps.lat,
                        lng: gps.lng
                      },
                      onCapture: (photo) => runAttendance("checkout", photo)
                    });
                  }}
                  disabled={checkoutDisabled}
                >
                  <Camera size={20} /> {busy ? busy : checkoutLabel}
                </button>
              )}
            </div>}
          </>
        )}

        {/* ═══ LAPORAN ═══ */}
        {isReportState && !loading && (
          <div key={nextState} className="animate-slide-up" style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* ═══ BLOKIR INVENTORI: tampil sebagai pengganti form saat inventori belum selesai ═══ */}
            {nextState === "report_tutup" && invCheck !== "ok" && reportWindowEarly.canSubmit ? (
              <>
                {/* Header minimal */}
                <div style={{
                  background: "#F5F3FF", border: "1.5px solid #DDD6FE",
                  borderRadius: 16, padding: "14px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between"
                }}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.7px", color: "#7C3AED", textTransform: "uppercase", marginBottom: 3 }}>🌙 Laporan</p>
                    <h2 style={{ fontSize: 17, fontWeight: 900, color: "#6D28D9", letterSpacing: "-0.3px" }}>Tutup Toko</h2>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{formatDateID(status?.date)}</p>
                    <p style={{ fontSize: 10, color: "var(--muted-light)", marginTop: 2 }}>
                      {status?.shift === 0 ? "Full Shift" : `Shift ${status?.shift}`}
                    </p>
                  </div>
                </div>

                {/* Sedang mengecek inventori */}
                {(invCheck === "idle" || invCheck === "loading") && (
                  <div style={{ borderRadius: 20, overflow: "hidden", border: "2px solid #DDD6FE", boxShadow: "0 4px 20px rgba(109,40,217,0.10)" }}>
                    <div style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)", padding: "36px 24px", textAlign: "center" }}>
                      <div style={{ width: 52, height: 52, border: "4px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.9s linear infinite", margin: "0 auto 18px" }} />
                      <h3 style={{ fontSize: 18, fontWeight: 900, color: "#fff", margin: "0 0 10px", letterSpacing: "-0.3px" }}>Memeriksa Laporan Inventori...</h3>
                      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.7 }}>
                        Laporan Tutup Toko hanya bisa diisi setelah laporan inventori selesai dikerjakan.
                      </p>
                    </div>
                    <div style={{ background: "#F5F3FF", padding: "16px 20px", textAlign: "center" }}>
                      <p style={{ fontSize: 12, color: "#6D28D9", fontWeight: 600, margin: 0 }}>
                        Harap tunggu, sistem sedang memeriksa status inventori cabang ini...
                      </p>
                    </div>
                  </div>
                )}

                {/* Inventori belum selesai — blokir total */}
                {invCheck === "blocked" && (
                  <div style={{ borderRadius: 20, overflow: "hidden", border: "2.5px solid #FCA5A5", boxShadow: "0 6px 28px rgba(220,38,38,0.18)" }}>
                    <div style={{ background: "linear-gradient(135deg,#DC2626,#B91C1C)", padding: "36px 24px", textAlign: "center" }}>
                      <div style={{ fontSize: 56, marginBottom: 14, lineHeight: 1 }}>🚫</div>
                      <h3 style={{ fontSize: 21, fontWeight: 900, color: "#fff", margin: "0 0 12px", letterSpacing: "-0.4px" }}>
                        Laporan Inventori Belum Selesai!
                      </h3>
                      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.92)", margin: 0, lineHeight: 1.75 }}>
                        {invBlockMsg || "Laporan inventori cabang ini belum dikerjakan hari ini."}
                      </p>
                    </div>
                    <div style={{ background: "#FEF2F2", padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ background: "#fff", borderRadius: 14, padding: "16px", border: "1.5px solid #FECACA" }}>
                        <p style={{ fontSize: 14, fontWeight: 900, color: "#7F1D1D", margin: "0 0 8px" }}>⚠️ Laporan Tutup Toko DIKUNCI</p>
                        <p style={{ fontSize: 13, color: "#991B1B", margin: 0, lineHeight: 1.75 }}>
                          Kamu <strong>tidak bisa mengisi</strong> Laporan Tutup Toko sebelum laporan inventori selesai.
                          Buka sistem inventori, selesaikan laporan hari ini, lalu kembali ke sini untuk mengisi laporan tutup toko.
                        </p>
                      </div>
                      <button
                        className="btn btn-danger btn-action"
                        style={{ fontSize: 14, fontWeight: 900 }}
                        onClick={checkInventory}
                      >
                        🔄 Sudah Selesai — Cek Ulang Status Inventori
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Report header */}
                <div style={{
                  background: `${reportTypeColor}0E`, border: `1.5px solid ${reportTypeColor}30`,
                  borderRadius: 16, padding: "14px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between"
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

                {/* Indikator draft tersimpan */}
                {draftSavedVisible && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "#F0FDF4", border: "1px solid #BBF7D0",
                    borderRadius: 8, padding: "6px 12px",
                    fontSize: 11, fontWeight: 700, color: "#16A34A",
                    alignSelf: "flex-start"
                  }}>
                    <CheckCircle2 size={12} />
                    Draft tersimpan
                  </div>
                )}

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
                  <div style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "var(--danger)" }}>
                    ⚠️ {reportError}
                  </div>
                )}

                {reportBusy && (
                  <div style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--warning)" }}>
                    {reportBusyLabel || "Memproses laporan..."}
                  </div>
                )}

                {/* Di luar window waktu laporan — sembunyikan form sepenuhnya */}
                {!reportWindow.canSubmit ? (
                  <div style={{ background: "#FFFBEB", border: "1.5px solid #FDE68A", borderRadius: 16, padding: "24px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>⏰</div>
                    <h3 style={{ fontSize: 16, fontWeight: 900, color: "#D97706", marginBottom: 8 }}>
                      Belum Waktunya {reportType === "BUKA" ? "Laporan Buka Toko" : "Laporan Tutup Toko"}
                    </h3>
                    <p style={{ fontSize: 13, color: "#78350F", lineHeight: 1.6, marginBottom: 8 }}>
                      Laporan {reportType === "BUKA" ? "Buka Toko" : "Tutup Toko"} dapat diisi mulai pukul{" "}
                      <strong style={{ color: "#92400E" }}>{reportWindow.start.slice(0, 5)}</strong> hingga{" "}
                      <strong style={{ color: "#92400E" }}>{reportWindow.end.slice(0, 5)}</strong>.
                    </p>
                    <p style={{ fontSize: 12, color: "#B45309", marginTop: 4 }}>
                      {reportType === "BUKA"
                        ? "Silakan kembali ke halaman ini saat sudah waktunya."
                        : "Selesaikan tugas lain terlebih dahulu dan kembali saat sudah waktunya."}
                    </p>
                  </div>
                ) : (
                  <>
                    {reportWindow.isLate && (
                      <div style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--warning)" }}>
                        Laporan sudah melewati batas {reportWindow.end.slice(0, 5)} dan akan tercatat sebagai laporan terlambat.
                      </div>
                    )}

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
                      const isUploadMode = item.photo_mode === "upload";
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
                                {" · "}
                                {isUploadMode ? "Upload foto" : "Foto langsung"}
                              </p>
                            </div>
                            <button
                              onClick={() => isUploadMode ? openUploadForItem(item) : openReportCamera(item)}
                              disabled={reportPhotoDisabled}
                              style={{
                                display: "flex", alignItems: "center", gap: 6,
                                background: done ? "var(--success)" : reportTypeColor,
                                color: "#fff", border: "none", borderRadius: 10,
                                padding: "9px 14px", fontSize: 12, fontWeight: 800,
                                cursor: reportPhotoDisabled ? "not-allowed" : "pointer",
                                fontFamily: "var(--font-nunito,sans-serif)", flexShrink: 0,
                                opacity: reportPhotoDisabled ? 0.48 : 1
                              }}
                            >
                              {done ? <CheckCircle2 size={14} /> : isUploadMode ? <Upload size={14} /> : <Camera size={14} />}
                              {done ? "Ubah" : isUploadMode ? "Upload" : "Foto"}
                            </button>
                          </div>

                          {item.example_photo_url && !done && (
                            <div style={{ marginTop: 12, border: "2.5px dashed #F59E0B", borderRadius: 12, overflow: "hidden", background: "#FFFBEB" }}>
                              <div style={{ background: "#F59E0B", padding: "7px 12px", display: "flex", alignItems: "center", gap: 7 }}>
                                <ImageIcon size={13} color="#fff" />
                                <span style={{ fontSize: 11, fontWeight: 900, color: "#fff", letterSpacing: "0.6px", textTransform: "uppercase" }}>Foto Contoh</span>
                                <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.3)", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 6, padding: "2px 7px", letterSpacing: "0.4px" }}>BUKAN FOTO ASLI</span>
                              </div>
                              <div style={{ padding: "7px 12px 4px", background: "#FEF3C7" }}>
                                <p style={{ fontSize: 11, color: "#92400E", fontWeight: 700, lineHeight: 1.4 }}>
                                  Ini hanya contoh foto yang benar. Foto kamu harus sesuai kondisi toko yang sesungguhnya.
                                </p>
                              </div>
                              <a href={item.example_photo_url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={item.example_photo_url} alt={`Contoh: ${item.label}`} style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 180, background: "#f8fafc", opacity: 0.88 }} />
                              </a>
                              <div style={{ padding: "5px 12px 8px", background: "#FEF3C7" }}>
                                <p style={{ fontSize: 10, color: "#B45309", textAlign: "center", fontWeight: 600 }}>👆 Tap foto untuk memperbesar contoh</p>
                              </div>
                            </div>
                          )}

                          {done && (
                            <div style={{ marginTop: 8 }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={reportPhotos[item.label]?.previewUrl} alt={item.label} className="report-photo-thumb" />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button
                      className="btn btn-ok btn-action"
                      disabled={reportSubmitDisabled}
                      onClick={submitReport}
                      style={{ marginTop: 4, fontSize: 15 }}
                    >
                      <Send size={18} />
                      {reportBusy ? (reportBusyLabel || "Mengirim laporan...") : `Kirim Laporan ${reportType === "BUKA" ? "Buka Toko" : "Tutup Toko"}`}
                    </button>
                  </>
                )}
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
  if (msg.includes("PAYLOAD_TOO_LARGE") || msg.includes("Too Large") || msg.includes("413") || msg.includes("Entity Too Large"))
    return "Upload gagal karena foto terlalu besar. Coba ambil foto ulang lalu kirim lagi.";
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch"))
    return "Data belum berhasil dimuat. Periksa koneksi internet lalu coba lagi.";
  if (msg.includes("401") || msg.includes("Sesi") || msg.includes("login"))
    return "Sesi berakhir. Silakan login ulang.";
  if (msg.includes("403") || msg.includes("ditolak") || msg.includes("izin"))
    return "Anda tidak memiliki izin untuk melakukan aksi ini.";
  if (msg.includes("nonce") || msg.includes("duplicate"))
    return "Permintaan duplikat terdeteksi. Coba lagi.";
  if (msg.includes("GPS") || msg.includes("lokasi") || msg.includes("radius") || msg.includes("area"))
    return msg;
  if (msg.includes("500") || msg.includes("server"))
    return "Server sedang bermasalah. Coba beberapa saat lagi.";
  if (msg.includes("Belum") || msg.includes("shift") || msg.includes("Laporan") || msg.includes("Shift"))
    return msg;
  return msg || "Terjadi kesalahan. Coba lagi.";
}
