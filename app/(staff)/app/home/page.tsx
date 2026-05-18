"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageIcon, LogOut, RefreshCw, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch, compressDataUrl } from "@/lib/client-api";
import { ddmmyyyy, hhmm, rupiah } from "@/lib/format";
import { haversineDistance } from "@/lib/business";
import { StaffPage } from "@/components/staff/staff-page";
import { CameraCapture } from "@/components/staff/camera-capture";
import { useSessionStore } from "@/stores/session";

/* ─── Types ─── */
type Attendance = {
  id: string; date: string; shift: number;
  checkin_time: string | null; checkout_time: string | null;
  late_minutes: number; deduction: number; final_salary: number;
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

type ReportCfgItem = {
  id: string; label: string; required: boolean;
  example_photo_url: string | null; sort_order: number;
};

type GpsState = { dist: number | null; accuracy: number; status: "ok" | "bad" | "wait" };

/* ─── Camera slot descriptor ─── */
type CameraSlot = {
  facing: "user" | "environment";
  title: string;
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

export default function StaffHomePage() {
  const router = useRouter();
  const setStaffToken = useSessionStore((s) => s.setStaffToken);

  /* ─── Core status state ─── */
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  /* ─── GPS ─── */
  const [gps, setGps] = useState<GpsState>({ dist: null, accuracy: 0, status: "wait" });

  /* ─── Camera overlay ─── */
  const [camera, setCamera] = useState<CameraSlot | null>(null);

  /* ─── Report section state ─── */
  const [reportItems, setReportItems] = useState<ReportCfgItem[]>([]);
  const [reportItemsLoading, setReportItemsLoading] = useState(false);
  const [reportPhotos, setReportPhotos] = useState<Record<string, string>>({});
  const [reportSelfie, setReportSelfie] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState("");

  /* ─── Derived ─── */
  const reportTypes = useMemo(() => new Set((status?.reports || []).map((r) => r.type)), [status]);

  const nextState = useMemo<NextState>(() => {
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
      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ─── GPS watch ─── */
  useEffect(() => {
    if (!status?.outlet?.lat) return;
    const outlet = status.outlet;
    function onPos(pos: GeolocationPosition) {
      const dist = haversineDistance(pos.coords.latitude, pos.coords.longitude, outlet.lat, outlet.lng);
      const acc = Math.max(0, pos.coords.accuracy);
      const maxDist = outlet.radius_m + Math.min(acc, outlet.radius_m * 0.3);
      setGps({ dist: Math.round(dist), accuracy: Math.round(acc), status: dist <= maxDist ? "ok" : "bad" });
    }
    function onErr() { setGps({ dist: null, accuracy: 0, status: "wait" }); }
    const id = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(id);
  }, [status?.outlet]);

  /* ─── Load report config when entering report state ─── */
  useEffect(() => {
    if (nextState !== "report_buka" && nextState !== "report_tutup") return;
    const type = nextState === "report_buka" ? "BUKA" : "TUTUP";
    setReportItemsLoading(true);
    setReportPhotos({});
    setReportSelfie("");
    setReportError("");
    apiFetch<{ ok: true; items: ReportCfgItem[] }>("/api/reports/config", { role: "staff", body: { type } })
      .then((p) => setReportItems(p.items))
      .catch(() => setReportItems([]))
      .finally(() => setReportItemsLoading(false));
  }, [nextState]);

  /* ─── GPS position (one-shot for attendance) ─── */
  function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 12000, maximumAge: 20000
      })
    );
  }

  /* ─── Open camera helper ─── */
  function openCamera(slot: CameraSlot) { setCamera(slot); }
  function closeCamera() { setCamera(null); }

  /* ─── Checkin / Checkout ─── */
  async function runAttendance(action: "checkin" | "checkout", selfieDataUrl: string) {
    setBusy(action === "checkin" ? "Mengirim absen masuk..." : "Mengirim absen pulang...");
    setError("");
    try {
      const [position, selfie] = await Promise.all([
        getPosition(),
        compressDataUrl(selfieDataUrl)
      ]);
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
    }
  }

  /* ─── Submit report ─── */
  async function submitReport() {
    const type = nextState === "report_buka" ? "BUKA" : "TUTUP";
    if (!reportSelfie) { setReportError("Selfie wajib diambil terlebih dahulu"); return; }
    const missingRequired = reportItems.filter((item) => item.required && !reportPhotos[item.label]);
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
          selfie: reportSelfie,
          shiftDate: status?.date,
          shift: status?.shift,
          items: reportItems.map((item) => ({
            label: item.label,
            photo: reportPhotos[item.label] || "",
            required: item.required
          }))
        }
      });
      setReportPhotos({});
      setReportSelfie("");
      await load();
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Gagal mengirim laporan");
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

  return (
    <>
      {/* Camera overlay (full screen, above everything) */}
      {camera && (
        <CameraCapture
          facing={camera.facing}
          title={camera.title}
          onCapture={camera.onCapture}
          onCancel={closeCamera}
        />
      )}

      <StaffPage title="Sistem Absensi" subtitle={outlet ? `${outlet.name} · ${ddmmyyyy(status?.date)}` : undefined}>
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
            <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}>
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

        {/* ═══ MAIN FLOW (not report state) ═══ */}
        {!isReportState && (
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
                <p className="status-sub">{sc.sub}</p>
              </div>
            ) : null}

            {/* GPS bar */}
            <div className="gps-bar">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className={`gps-dot gps-${gps.status}`} />
                <div>
                  <p className="gps-label">GPS · Jarak ke Outlet</p>
                  <p style={{ fontSize: 10, color: "var(--muted-light)", marginTop: 1 }}>
                    {gps.status === "wait" ? "Mendeteksi lokasi..." : `Akurasi ±${gps.accuracy}m`}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className={`gps-dist ${gps.status}`}>
                  {gps.dist !== null ? `${gps.dist}m` : "—"}
                </p>
                {outlet && (
                  <p style={{ fontSize: 10, color: "var(--muted-light)", marginTop: 1 }}>
                    radius {outlet.radius_m}m
                  </p>
                )}
              </div>
            </div>

            {/* Time info panel (after checkin) */}
            {att?.checkin_time && (
              <div className="panel animate-slide-up" style={{ padding: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ textAlign: "center", padding: "10px 8px", background: "var(--surface-soft)", borderRadius: 12 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--muted-light)", marginBottom: 4 }}>MASUK</p>
                    <p style={{ fontFamily: "var(--font-nunito,sans-serif)", fontSize: 24, fontWeight: 900 }}>{hhmm(att.checkin_time)}</p>
                  </div>
                  <div style={{ textAlign: "center", padding: "10px 8px", background: "var(--surface-soft)", borderRadius: 12 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--muted-light)", marginBottom: 4 }}>PULANG</p>
                    <p style={{ fontFamily: "var(--font-nunito,sans-serif)", fontSize: 24, fontWeight: 900 }}>{hhmm(att.checkout_time) || "—"}</p>
                  </div>
                </div>
                {att.late_minutes > 0 && (
                  <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--warning)" }}>
                    ⚠️ Telat {att.late_minutes} mnt · Potongan {rupiah(att.deduction)}
                  </div>
                )}
                <div style={{ marginTop: 8, textAlign: "center", fontSize: 14, fontWeight: 900, color: "var(--success)", fontFamily: "var(--font-nunito,sans-serif)" }}>
                  Gaji hari ini: {rupiah(att.final_salary)}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {nextState === "checkin" && (
                <button
                  className={`btn btn-primary btn-action${!busy ? " btn-glow" : ""}`}
                  onClick={() => openCamera({
                    facing: "user",
                    title: "📸 Selfie Absen Masuk",
                    onCapture: (url) => { closeCamera(); runAttendance("checkin", url); }
                  })}
                  disabled={Boolean(busy)}
                >
                  <Camera size={20} /> Absen Masuk
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
            </div>
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
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{ddmmyyyy(status?.date)}</p>
                <p style={{ fontSize: 10, color: "var(--muted-light)", marginTop: 2 }}>
                  {status?.shift === 0 ? "Full shift" : `Shift ${status?.shift}`}
                </p>
              </div>
            </div>

            {/* GPS bar (compact) */}
            <div className="gps-bar" style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className={`gps-dot gps-${gps.status}`} />
                <p className="gps-label" style={{ fontSize: 11 }}>
                  {gps.status === "wait" ? "Mendeteksi GPS..." : `GPS · ±${gps.accuracy}m`}
                </p>
              </div>
              <p className={`gps-dist ${gps.status}`} style={{ fontSize: 16 }}>
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

            {/* Selfie slot */}
            <div className={`report-item-card${reportSelfie ? " done" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 800 }}>
                    Selfie Staff <span style={{ color: "var(--danger)" }}>*</span>
                  </h3>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Wajib · Kamera depan</p>
                </div>
                <button
                  onClick={() => openCamera({
                    facing: "user",
                    title: "📸 Selfie Laporan",
                    onCapture: (url) => { closeCamera(); setReportSelfie(url); }
                  })}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: reportSelfie ? "var(--success)" : reportTypeColor,
                    color: "#fff", border: "none", borderRadius: 10,
                    padding: "9px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer",
                    fontFamily: "var(--font-nunito,sans-serif)", flexShrink: 0
                  }}
                >
                  {reportSelfie ? <CheckCircle2 size={14} /> : <Camera size={14} />}
                  {reportSelfie ? "Ubah" : "Ambil"}
                </button>
              </div>
              {reportSelfie && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={reportSelfie} alt="Selfie" className="report-photo-thumb" />
              )}
            </div>

            {/* Report items */}
            {reportItemsLoading ? (
              <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "12px 0" }}>
                Memuat konfigurasi...
              </p>
            ) : null}

            {!reportItemsLoading && reportItems.length === 0 && (
              <div className="panel" style={{ padding: 14, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                Tidak ada item foto tambahan. Selfie tetap wajib.
              </div>
            )}

            {reportItems.map((item) => {
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

                  {/* Example photo */}
                  {item.example_photo_url && !done && (
                    <div style={{
                      marginTop: 10, borderRadius: 10, overflow: "hidden",
                      border: `1.5px solid ${reportTypeColor}22`,
                      background: `${reportTypeColor}06`
                    }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
                        background: `${reportTypeColor}10`, borderBottom: `1px solid ${reportTypeColor}15`
                      }}>
                        <ImageIcon size={11} style={{ color: reportTypeColor }} />
                        <span style={{ fontSize: 9, fontWeight: 800, color: reportTypeColor, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                          Contoh Foto
                        </span>
                      </div>
                      <a href={item.example_photo_url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.example_photo_url}
                          alt={`Contoh ${item.label}`}
                          style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 160, background: "#f8fafc" }}
                        />
                      </a>
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
          </div>
        )}
      </StaffPage>
    </>
  );
}
