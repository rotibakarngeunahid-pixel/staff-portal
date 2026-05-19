"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarMinus, ChevronRight, RefreshCw, X } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateWithDayID } from "@/lib/format";
type SlotStatus = "single" | "open" | "off" | "claimed" | string;

type Slot = {
  shift: number;
  scheduleId: string | null;
  staffName: string | null;
  status: SlotStatus;
  isMe: boolean;
};

type Day = {
  date: string;
  slots: Slot[];
  leaves: Array<{ id: string; staff_name: string; status: string; reason: string | null; isMe: boolean }>;
};

type SchedulePayload = { ok: true; weekStart: string; days: Day[] };

type LeaveModalState = { date: string; reason: string } | null;

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}


function SlotBadge({ status, isMe }: { status: SlotStatus; isMe: boolean }) {
  if (status === "off") return (
    <span className="status-pill status-danger">Libur</span>
  );
  if (status === "single") return (
    <span className="status-pill" style={{ background: "var(--surface-soft)", color: "var(--muted)", border: "1px solid var(--border)" }}>Full Day</span>
  );
  if (status === "claimed" && isMe) return (
    <span className="status-pill status-ok">Shift Saya</span>
  );
  if (status === "claimed") return (
    <span className="status-pill status-warn">Diambil</span>
  );
  return (
    <span className="status-pill" style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>Tersedia</span>
  );
}

export default function StaffSchedulePage() {
  const [weekStart, setWeekStart] = useState(isoToday());
  const [data, setData] = useState<SchedulePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [leaveModal, setLeaveModal] = useState<LeaveModalState>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<SchedulePayload>("/api/schedule/weekly", { role: "staff", body: { weekStart } }));
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const nextWeek = useMemo(() => {
    const date = new Date(`${weekStart}T00:00:00`);
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  }, [weekStart]);

  async function claim(date: string, shift: number) {
    setBusy("Mengambil shift...");
    setError("");
    try {
      await apiFetch("/api/schedule/claim", { method: "POST", role: "staff", body: { date, shift } });
      await load();
    } catch (err) {
      setError(humanError(err));
      setBusy("");
    }
  }

  async function cancel(scheduleId: string) {
    setBusy("Membatalkan shift...");
    setError("");
    try {
      await apiFetch("/api/schedule/cancel", { method: "POST", role: "staff", body: { scheduleId } });
      await load();
    } catch (err) {
      setError(humanError(err));
      setBusy("");
    }
  }

  async function submitLeave() {
    if (!leaveModal) return;
    setBusy("Mengajukan libur...");
    setError("");
    const { date, reason } = leaveModal;
    setLeaveModal(null);
    try {
      await apiFetch("/api/schedule/leave", { method: "POST", role: "staff", body: { date, reason: reason || null } });
      await load();
    } catch (err) {
      setError(humanError(err));
      setBusy("");
    }
  }

  return (
    <>
      {/* Leave modal */}
      {leaveModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "flex-end", justifyContent: "center"
        }}>
          <div style={{
            background: "#fff", borderRadius: "24px 24px 0 0",
            padding: "24px 20px 32px", width: "min(100%, 480px)",
            boxShadow: "0 -8px 40px rgba(15,23,42,0.18)"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 900, fontFamily: "var(--font-nunito,sans-serif)" }}>
                Ajukan Libur
              </h2>
              <button
                onClick={() => setLeaveModal(null)}
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
              Tanggal: <strong>{formatDateWithDayID(leaveModal.date)}</strong>
            </p>
            <label className="label">Alasan libur (opsional)</label>
            <textarea
              className="field"
              rows={3}
              placeholder="Contoh: keperluan keluarga, sakit, dll."
              value={leaveModal.reason}
              onChange={(e) => setLeaveModal((prev) => prev ? { ...prev, reason: e.target.value } : null)}
              style={{ resize: "none", marginBottom: 14 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={submitLeave}>
                <CalendarMinus size={16} /> Ajukan Libur
              </button>
              <button className="btn btn-soft" style={{ flex: 1 }} onClick={() => setLeaveModal(null)}>
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      <StaffPage title="Jadwal" subtitle="Claim shift dan request libur">
        {/* Week selector */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <input
            className="field"
            type="date"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
          />
          <button className="btn btn-soft" style={{ padding: "0 14px" }} onClick={load} disabled={loading || Boolean(busy)}>
            <RefreshCw size={16} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>

        <button
          className="btn btn-soft"
          style={{ width: "100%", fontSize: 13 }}
          onClick={() => setWeekStart(nextWeek)}
          disabled={loading || Boolean(busy)}
        >
          Minggu Berikutnya <ChevronRight size={15} />
        </button>

        {/* Banners */}
        {error && (
          <div style={{
            background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
            borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--danger)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8
          }}>
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>
        )}
        {busy && (
          <div style={{
            background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
            borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--warning)"
          }}>
            ⏳ {busy}
          </div>
        )}

        {/* Loading skeleton */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="panel" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: "var(--surface-soft)", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ height: 16, width: 100, borderRadius: 6, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                </div>
                <div style={{ padding: "10px 14px" }}>
                  <div style={{ height: 44, borderRadius: 10, background: "var(--surface-soft)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Days */
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(data?.days || []).map((day) => {
              const today = new Date().toISOString().slice(0, 10);
              const isToday = day.date === today;
              return (
                <div
                  key={day.date}
                  className="panel"
                  style={{
                    padding: 0, overflow: "hidden",
                    border: isToday ? "2px solid var(--primary)" : undefined
                  }}
                >
                  {/* Day header */}
                  <div style={{
                    padding: "12px 16px",
                    background: isToday
                      ? "linear-gradient(135deg, rgba(192,57,43,0.08), rgba(192,57,43,0.04))"
                      : "var(--surface-soft)",
                    borderBottom: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h2 style={{
                        fontSize: 15, fontWeight: 900, fontFamily: "var(--font-nunito,sans-serif)",
                        color: isToday ? "var(--primary)" : "var(--ink)"
                      }}>
                        {formatDateWithDayID(day.date)}
                      </h2>
                      {isToday && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
                          background: "var(--primary)", color: "#fff",
                          borderRadius: 6, padding: "2px 7px", textTransform: "uppercase"
                        }}>
                          Hari ini
                        </span>
                      )}
                    </div>
                    <button
                      className="btn btn-soft"
                      style={{ fontSize: 11, padding: "6px 12px", minHeight: 0 }}
                      onClick={() => setLeaveModal({ date: day.date, reason: "" })}
                      disabled={Boolean(busy)}
                      title="Ajukan permintaan libur untuk tanggal ini"
                    >
                      <CalendarMinus size={13} /> Ajukan Libur
                    </button>
                  </div>

                  {/* Slots */}
                  <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {day.slots.map((slot) => (
                      <div
                        key={slot.shift}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                          padding: "10px 12px",
                          background: slot.isMe
                            ? "rgba(22,163,74,0.06)"
                            : slot.status === "off"
                            ? "rgba(220,38,38,0.04)"
                            : "#fafafa",
                          borderRadius: 12,
                          border: slot.isMe
                            ? "1.5px solid var(--success-border)"
                            : slot.status === "off"
                            ? "1.5px solid var(--danger-border)"
                            : "1px solid var(--border)"
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
                            {slot.shift === 0 ? "Full Shift" : `Shift ${slot.shift}`}
                          </p>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <SlotBadge status={slot.status} isMe={slot.isMe} />
                            {slot.status === "claimed" && slot.staffName && !slot.isMe && (
                              <span style={{ fontSize: 10, color: "var(--muted)" }}>{slot.staffName}</span>
                            )}
                          </div>
                        </div>
                        <div>
                          {slot.status === "open" ? (
                            <button
                              className="btn btn-primary"
                              style={{ fontSize: 12, padding: "8px 16px", minHeight: 0 }}
                              onClick={() => claim(day.date, slot.shift)}
                              disabled={Boolean(busy)}
                            >
                              Ambil
                            </button>
                          ) : slot.isMe && slot.scheduleId ? (
                            <button
                              className="btn btn-soft"
                              style={{ fontSize: 12, padding: "8px 14px", minHeight: 0, color: "var(--danger)", borderColor: "var(--danger-border)" }}
                              onClick={() => cancel(slot.scheduleId!)}
                              disabled={Boolean(busy)}
                            >
                              Batal
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Leaves */}
                  {day.leaves.length > 0 && (
                    <div style={{
                      padding: "8px 14px 12px",
                      display: "flex", alignItems: "center", gap: 6
                    }}>
                      <CalendarCheck size={13} style={{ color: "var(--warning)", flexShrink: 0 }} />
                      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)" }}>
                        Libur: {day.leaves.map((l) => l.staff_name + (l.isMe ? " (Saya)" : "")).join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

            {data && data.days.length === 0 && (
              <div className="panel" style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                Tidak ada jadwal untuk minggu ini.
              </div>
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
  if (msg.includes("500") || msg.includes("server"))
    return "Server sedang bermasalah. Coba beberapa saat lagi.";
  return msg || "Terjadi kesalahan. Coba lagi.";
}
