"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarMinus, ChevronRight, RefreshCw, X } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateWithDayID } from "@/lib/format";

type ShiftType = "SHIFT_1" | "SHIFT_2" | "FULL_SHIFT";

type Assignment = {
  id: string;
  shift_type: ShiftType;
  status: string;
  staff_name: string;
  staff_id: string;
};

type Slot = {
  shift: number;
  scheduleId: string | null;
  assignmentId: string | null;
  staffId: string | null;
  staffName: string | null;
  shiftType: ShiftType;
  status: string;
  isMe: boolean;
  isDayoff: boolean;
  hasPendingLeave?: boolean;
};

type Leave = {
  id: string;
  staff_name: string;
  status: string;
  reason: string | null;
  admin_note?: string | null;
  isMe: boolean;
};

type MyLeave = {
  id: string;
  status: string;
  reason: string | null;
  admin_note?: string | null;
};

type Day = {
  date: string;
  slots: Slot[];
  assignments: Assignment[];
  myAssignment: Assignment | null;
  myDayoff: { id: string; reason: string | null } | null;
  myLeave: MyLeave | null;
  leaves: Leave[];
};

type SchedulePayload = { ok: true; weekStart: string; days: Day[] };
type LeaveModalState = { date: string; reason: string } | null;

function isoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function shiftLabel(type: ShiftType) {
  if (type === "SHIFT_1") return "Shift 1";
  if (type === "SHIFT_2") return "Shift 2";
  return "Full Shift";
}

function StatusBadge({ status, isMe, shiftType }: { status: string; isMe: boolean; shiftType: ShiftType }) {
  if (status === "dayoff") return <span className="status-pill status-danger">Libur</span>;
  if (status === "off") return <span className="status-pill status-danger">Libur Outlet</span>;
  if (status === "single") return (
    <span className="status-pill" style={{ background: "var(--surface-soft)", color: "var(--muted)", border: "1px solid var(--border)" }}>
      Full Day
    </span>
  );
  if ((status === "confirmed" || status === "claimed" || status === "auto_cover" || status === "admin_override") && isMe) return (
    <span className="status-pill status-ok">
      {shiftLabel(shiftType)} Saya
      {status === "auto_cover" && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.8 }}>(auto)</span>}
    </span>
  );
  if (status === "confirmed" || status === "claimed" || status === "auto_cover" || status === "admin_override") return (
    <span className="status-pill status-warn">Diambil</span>
  );
  if (status === "locked") return (
    <span className="status-pill" style={{ background: "#FEF9C3", color: "#92400E", border: "1px solid #FDE68A" }}>Dikunci</span>
  );
  return (
    <span className="status-pill" style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>Tersedia</span>
  );
}

/** Banner full-width untuk leave yang sudah approved */
function ApprovedLeaveBanner({ leave, dayoff }: { leave: MyLeave | null; dayoff: { id: string; reason: string | null } | null }) {
  const reason = leave?.reason || dayoff?.reason;
  return (
    <div style={{
      padding: "14px 16px",
      background: "rgba(220,38,38,0.06)",
      borderTop: "1px solid var(--danger-border)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🏖️</span>
        <div>
          <p style={{ fontSize: 14, fontWeight: 900, color: "var(--danger)", marginBottom: 2 }}>
            Libur — Disetujui
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            {leave
              ? "Permintaan liburmu untuk hari ini sudah disetujui."
              : "Kamu terdaftar libur untuk hari ini."}
          </p>
          {reason && (
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>
              Alasan: {reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Banner menonjol untuk leave yang masih pending */
function PendingLeaveBanner({
  leave,
  originalShift,
  isActionable,
  busy,
  onCancel
}: {
  leave: Leave;
  originalShift: ShiftType | null;
  isActionable: boolean;
  busy: string;
  onCancel: (id: string) => void;
}) {
  return (
    <div style={{
      padding: "14px 16px",
      background: "rgba(234,179,8,0.07)",
      borderTop: "1px solid var(--warning-border)"
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 20, marginTop: 1 }}>📋</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <p style={{ fontSize: 14, fontWeight: 900, color: "var(--warning)" }}>
              Request Libur
            </p>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.4px",
              background: "var(--warning-bg)", color: "var(--warning)",
              border: "1.5px solid var(--warning-border)", borderRadius: 6,
              padding: "2px 8px", textTransform: "uppercase"
            }}>
              Menunggu Persetujuan
            </span>
          </div>
          {leave.reason && (
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, fontStyle: "italic" }}>
              Alasan: {leave.reason}
            </p>
          )}
          {originalShift && (
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
              Shift awal: <strong>{shiftLabel(originalShift)}</strong>
            </p>
          )}
          <p style={{ fontSize: 11, color: "var(--muted)" }}>
            ⏳ Menunggu keputusan admin. Jika disetujui, kamu tidak perlu absen di hari ini.
          </p>
        </div>
        {isActionable && (
          <button
            className="btn btn-soft"
            style={{ fontSize: 11, padding: "6px 12px", minHeight: 0, color: "var(--danger)", borderColor: "var(--danger-border)", flexShrink: 0 }}
            onClick={() => onCancel(leave.id)}
            disabled={Boolean(busy)}
          >
            Batalkan
          </button>
        )}
      </div>
    </div>
  );
}

/** Banner untuk leave yang ditolak admin */
function RejectedLeaveBanner({ leave }: { leave: Leave }) {
  return (
    <div style={{
      padding: "10px 14px",
      background: "rgba(100,116,139,0.06)",
      borderTop: "1px solid var(--border)",
      display: "flex", alignItems: "flex-start", gap: 8
    }}>
      <span style={{ fontSize: 16, marginTop: 1 }}>❌</span>
      <div>
        <p style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", marginBottom: 2 }}>
          Request Libur Ditolak
        </p>
        {(leave as any).admin_note && (
          <p style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
            Alasan admin: {(leave as any).admin_note}
          </p>
        )}
        {!((leave as any).admin_note) && (
          <p style={{ fontSize: 11, color: "var(--muted)" }}>
            Jadwal shift kamu tetap berlaku. Hubungi admin jika ada pertanyaan.
          </p>
        )}
      </div>
    </div>
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
    setBusy("");
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

  async function selectShift(date: string, shiftType: ShiftType) {
    setBusy(`Mengambil ${shiftLabel(shiftType)}...`);
    setError("");
    try {
      await apiFetch("/api/schedule/select", { method: "POST", role: "staff", body: { date, shiftType } });
      await load();
    } catch (err) {
      setError(humanError(err));
      setBusy("");
    }
  }

  async function cancelAssignment(assignmentId: string) {
    setBusy("Membatalkan shift...");
    setError("");
    try {
      await apiFetch("/api/schedule/cancel-assignment", {
        method: "POST",
        role: "staff",
        body: { assignmentId }
      });
      await load();
    } catch (err) {
      setError(humanError(err));
      setBusy("");
    }
  }

  async function cancelOldShift(scheduleId: string) {
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

  async function cancelLeaveRequest(leaveId: string) {
    if (!window.confirm("Batalkan permintaan libur ini?")) return;
    setBusy("Membatalkan permintaan libur...");
    setError("");
    try {
      await apiFetch("/api/schedule/leave", { method: "DELETE", role: "staff", body: { leaveId } });
      await load();
    } catch (err) {
      setError(humanError(err));
      setBusy("");
    }
  }

  return (
    <>
      {/* Modal ajukan libur */}
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
                aria-label="Tutup form libur"
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
              Tanggal: <strong>{formatDateWithDayID(leaveModal.date)}</strong>
            </p>
            <label className="label" htmlFor="leaveReason">Alasan libur (opsional)</label>
            <textarea
              id="leaveReason"
              className="field"
              rows={3}
              placeholder="Contoh: keperluan keluarga, sakit, dll."
              value={leaveModal.reason}
              onChange={(e) => setLeaveModal((prev) => prev ? { ...prev, reason: e.target.value } : null)}
              style={{ resize: "none", marginBottom: 14 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={submitLeave} disabled={Boolean(busy)}>
                <CalendarMinus size={16} /> {busy ? "Memproses..." : "Ajukan Libur"}
              </button>
              <button className="btn btn-soft" style={{ flex: 1 }} onClick={() => setLeaveModal(null)}>Batal</button>
            </div>
          </div>
        </div>
      )}

      <StaffPage title="Jadwal" subtitle="Pilih shift dan ajukan libur">
        {/* Info H-1 */}
        <div style={{
          background: "rgba(37,99,235,0.06)", border: "1.5px solid rgba(37,99,235,0.18)",
          borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#1D4ED8", lineHeight: 1.55
        }}>
          <strong>📅 Aturan H-1:</strong> Pilih atau batalkan shift, dan ajukan/batalkan libur hanya bisa dilakukan <strong>sehari sebelum</strong> tanggal yang dimaksud.
          Untuk keperluan mendadak di hari yang sama, hubungi admin langsung.
        </div>

        {/* Pemilih minggu */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <input
            className="field"
            type="date"
            aria-label="Pilih awal minggu"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
          />
          <button
            className="btn btn-soft"
            style={{ padding: "0 14px" }}
            onClick={load}
            disabled={loading || Boolean(busy)}
            aria-label="Refresh jadwal"
          >
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
            <button
              onClick={() => setError("")}
              aria-label="Tutup pesan error"
              style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}
            >
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(data?.days || []).map((day) => {
              const today = isoToday();
              const isToday = day.date === today;
              const isPast = day.date < today;
              const isActionable = day.date > today;
              const hasMyAssignment = Boolean(day.myAssignment);
              const isMyDayoff = Boolean(day.myDayoff);

              // ── Prioritas status leave ──────────────────────────────────────
              // 1. Approved leave (dari leave_requests → myLeave)
              // 2. Pending leave (menunggu persetujuan)
              // 3. Rejected leave (sudah ditolak admin)
              // 4. Normal shift
              const myLeave = day.myLeave;
              const isLeaveApproved = myLeave?.status === "approved";
              const isLeavePending = myLeave?.status === "pending";
              const isLeaveRejected = myLeave?.status === "rejected";

              // Untuk pending leave: cari dari array leaves (sudah di-map dengan isMe)
              const myPendingLeaveFromList = day.leaves.find((l) => l.isMe && l.status === "pending");
              const myRejectedLeaveFromList = day.leaves.find((l) => l.isMe && (l.status === "rejected"));

              // Shift awal (sebelum leave) untuk ditampilkan di pending banner
              const myOriginalShiftType = day.myAssignment?.shift_type || null;

              // Apakah hari ini libur (dayoff atau leave approved)
              const isEffectiveDayoff = isMyDayoff || isLeaveApproved;

              // Opacity card: dayoff / approved leave → sedikit pudar
              const cardOpacity = isPast ? 0.65 : isEffectiveDayoff ? 0.85 : 1;

              // Warna border card
              let cardBorder: string | undefined;
              if (isToday) cardBorder = "2px solid var(--primary)";
              else if (isLeavePending) cardBorder = "2px solid var(--warning-border)";
              else if (isLeaveApproved || isEffectiveDayoff) cardBorder = "2px solid var(--danger-border)";

              return (
                <div
                  key={day.date}
                  className="panel"
                  style={{
                    padding: 0, overflow: "hidden",
                    border: cardBorder,
                    opacity: cardOpacity
                  }}
                >
                  {/* ── Header hari ─────────────────────────────────────── */}
                  <div style={{
                    padding: "12px 16px",
                    background: isToday
                      ? "linear-gradient(135deg, rgba(192,57,43,0.08), rgba(192,57,43,0.04))"
                      : isLeavePending
                      ? "rgba(234,179,8,0.06)"
                      : isEffectiveDayoff
                      ? "rgba(220,38,38,0.05)"
                      : "var(--surface-soft)",
                    borderBottom: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
                      {/* Badge status leave di header */}
                      {isLeaveApproved && (
                        <span className="status-pill status-danger" style={{ fontSize: 9 }}>Libur Disetujui</span>
                      )}
                      {isLeavePending && !isLeaveApproved && (
                        <span className="status-pill status-warn" style={{ fontSize: 9 }}>Request Libur</span>
                      )}
                      {isLeaveRejected && !isLeavePending && !isLeaveApproved && (
                        <span className="status-pill" style={{ fontSize: 9, background: "#F1F5F9", color: "var(--muted)", border: "1px solid var(--border)" }}>
                          Libur Ditolak
                        </span>
                      )}
                      {isMyDayoff && !isLeaveApproved && (
                        <span className="status-pill status-danger" style={{ fontSize: 9 }}>Libur</span>
                      )}
                    </div>

                    {/* Tombol ajukan libur — hanya jika bisa diaksi dan belum ada leave aktif */}
                    {isActionable && !isEffectiveDayoff && !isMyDayoff && !isLeavePending && !isLeaveApproved && (
                      <button
                        className="btn btn-soft"
                        style={{ fontSize: 11, padding: "6px 12px", minHeight: 0 }}
                        onClick={() => setLeaveModal({ date: day.date, reason: "" })}
                        disabled={Boolean(busy)}
                        title="Ajukan permintaan libur untuk tanggal ini"
                      >
                        <CalendarMinus size={13} /> Ajukan Libur
                      </button>
                    )}
                  </div>

                  {/* ── Notice H-1 (hari ini atau sudah lewat, bukan libur) ── */}
                  {(isToday || isPast) && !isEffectiveDayoff && !isMyDayoff && (
                    <div style={{
                      padding: "7px 14px",
                      background: "rgba(100,116,139,0.06)",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6
                    }}>
                      🔒 {isToday
                        ? "Sudah melewati batas H-1 — untuk perubahan mendadak, hubungi admin."
                        : "Tanggal sudah lewat."}
                    </div>
                  )}

                  {/* ── Approved leave atau dayoff banner ───────────────── */}
                  {(isLeaveApproved || isMyDayoff) && (
                    <ApprovedLeaveBanner
                      leave={isLeaveApproved ? myLeave : null}
                      dayoff={day.myDayoff}
                    />
                  )}

                  {/* ── Pending leave banner (menonjol) ─────────────────── */}
                  {isLeavePending && myPendingLeaveFromList && (
                    <PendingLeaveBanner
                      leave={myPendingLeaveFromList}
                      originalShift={myOriginalShiftType}
                      isActionable={isActionable}
                      busy={busy}
                      onCancel={cancelLeaveRequest}
                    />
                  )}

                  {/* ── Rejected leave notice ────────────────────────────── */}
                  {isLeaveRejected && !isLeavePending && !isLeaveApproved && myRejectedLeaveFromList && (
                    <RejectedLeaveBanner leave={myRejectedLeaveFromList} />
                  )}

                  {/* ── Slot & shift section (hanya jika bukan libur approved/dayoff) ── */}
                  {!isEffectiveDayoff && !isMyDayoff && (
                    <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {day.slots.map((slot) => {
                        const isOpen = slot.status === "open" || (!slot.assignmentId && !slot.scheduleId && slot.status !== "off" && slot.status !== "single" && slot.status !== "dayoff");
                        const canCancel = isActionable && slot.isMe && (slot.assignmentId || slot.scheduleId) && slot.status !== "locked" && slot.status !== "completed";

                        return (
                          <div
                            key={slot.shift}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                              padding: "10px 12px",
                              background: slot.isMe
                                ? "rgba(22,163,74,0.06)"
                                : slot.status === "off" || slot.status === "dayoff"
                                ? "rgba(220,38,38,0.04)"
                                : "#fafafa",
                              borderRadius: 12,
                              border: slot.isMe
                                ? "1.5px solid var(--success-border)"
                                : slot.status === "off" || slot.status === "dayoff"
                                ? "1.5px solid var(--danger-border)"
                                : "1px solid var(--border)"
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
                                {slot.shift === 0 ? "Full Shift" : `Shift ${slot.shift}`}
                              </p>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <StatusBadge status={slot.status} isMe={slot.isMe} shiftType={slot.shiftType} />
                                {(slot.status === "confirmed" || slot.status === "claimed" || slot.status === "auto_cover") && slot.staffName && !slot.isMe && (
                                  <span style={{ fontSize: 10, color: "var(--muted)" }}>{slot.staffName}</span>
                                )}
                                {/* Indikator jika ada pending leave untuk slot ini */}
                                {slot.isMe && isLeavePending && (
                                  <span style={{ fontSize: 10, color: "var(--warning)", fontWeight: 700 }}>
                                    ⚠️ Ada request libur pending
                                  </span>
                                )}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {/* Tombol ambil shift hanya jika isActionable dan tidak ada pending/approved leave */}
                              {isActionable && isOpen && !hasMyAssignment && !isLeavePending && !isLeaveApproved && (
                                <>
                                  {slot.shift === 1 && (
                                    <button
                                      className="btn btn-primary"
                                      style={{ fontSize: 11, padding: "7px 12px", minHeight: 0 }}
                                      onClick={() => selectShift(day.date, "SHIFT_1")}
                                      disabled={Boolean(busy)}
                                    >
                                      Ambil Shift 1
                                    </button>
                                  )}
                                  {slot.shift === 2 && (
                                    <button
                                      className="btn btn-primary"
                                      style={{ fontSize: 11, padding: "7px 12px", minHeight: 0 }}
                                      onClick={() => selectShift(day.date, "SHIFT_2")}
                                      disabled={Boolean(busy)}
                                    >
                                      Ambil Shift 2
                                    </button>
                                  )}
                                  {slot.shift === 0 && (
                                    <button
                                      className="btn btn-primary"
                                      style={{ fontSize: 11, padding: "7px 12px", minHeight: 0 }}
                                      onClick={() => selectShift(day.date, "FULL_SHIFT")}
                                      disabled={Boolean(busy)}
                                    >
                                      Ambil Full Shift
                                    </button>
                                  )}
                                </>
                              )}

                              {/* Tombol ambil Full Shift untuk outlet 2 shift */}
                              {isActionable && slot.shift === 1 && isOpen && !hasMyAssignment && !isLeavePending && !isLeaveApproved &&
                                day.slots.every((s) => s.status === "open" || (!s.assignmentId && !s.scheduleId)) && (
                                <button
                                  className="btn btn-soft"
                                  style={{ fontSize: 11, padding: "7px 12px", minHeight: 0, fontWeight: 800 }}
                                  onClick={() => selectShift(day.date, "FULL_SHIFT")}
                                  disabled={Boolean(busy)}
                                >
                                  Ambil Full
                                </button>
                              )}

                              {/* Tombol batalkan */}
                              {canCancel && !isLeavePending && (
                                <button
                                  className="btn btn-soft"
                                  style={{ fontSize: 11, padding: "7px 12px", minHeight: 0, color: "var(--danger)", borderColor: "var(--danger-border)" }}
                                  onClick={() => {
                                    if (slot.assignmentId) cancelAssignment(slot.assignmentId);
                                    else if (slot.scheduleId) cancelOldShift(slot.scheduleId);
                                  }}
                                  disabled={Boolean(busy)}
                                >
                                  Batal
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Jadwal saya — hanya tampil jika tidak ada approved leave */}
                      {day.myAssignment && !isLeaveApproved && (
                        <div style={{
                          padding: "8px 12px",
                          background: "rgba(22,163,74,0.08)",
                          borderRadius: 10,
                          border: "1.5px solid var(--success-border)",
                          display: "flex", alignItems: "center", gap: 8
                        }}>
                          <span style={{ fontSize: 13 }}>✅</span>
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 800, color: "var(--success)" }}>
                              Jadwal Saya: {shiftLabel(day.myAssignment.shift_type)}
                            </p>
                            <p style={{ fontSize: 10, color: "var(--muted)" }}>
                              Status:{" "}
                              {day.myAssignment.status === "confirmed" ? "Terkonfirmasi"
                                : day.myAssignment.status === "auto_cover" ? "Auto Cover"
                                : day.myAssignment.status}
                              {isLeavePending && (
                                <span style={{ color: "var(--warning)", marginLeft: 6 }}>
                                  · Request libur sedang menunggu persetujuan
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Info leaves dari staff lain (bukan milik sendiri, bukan cancelled) ── */}
                  {(() => {
                    const otherLeaves = day.leaves.filter(
                      (l) => !l.isMe && (l.status === "approved" || l.status === "pending")
                    );
                    if (!otherLeaves.length) return null;
                    return (
                      <div style={{ padding: "6px 14px 10px", borderTop: "1px solid var(--border)" }}>
                        {otherLeaves.map((leave) => (
                          <div key={leave.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <CalendarCheck size={12} style={{ color: "var(--muted)", flexShrink: 0 }} />
                            <p style={{ fontSize: 11, color: "var(--muted)" }}>
                              {leave.staff_name} — Libur
                              {leave.status === "pending" && (
                                <span style={{ marginLeft: 4, fontStyle: "italic" }}>(menunggu)</span>
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
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
  if (msg.includes("DEADLINE_PASSED") || msg.includes("H-1") || msg.includes("sehari sebelumnya"))
    return msg;
  if (msg.includes("SHIFT_TAKEN") || msg.includes("diambil"))
    return msg;
  if (msg.includes("ALREADY_SCHEDULED") || msg.includes("sudah memiliki jadwal"))
    return msg;
  return msg || "Terjadi kesalahan. Coba lagi.";
}
