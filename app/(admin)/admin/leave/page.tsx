"use client";

import { useEffect, useState } from "react";
import { CheckCircle, RefreshCw, X, XCircle } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID } from "@/lib/format";

type Leave = {
  id: string;
  outlet_name: string;
  staff_name: string;
  date: string;
  status: string;
  reason: string | null;
  admin_note: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "status-warn",
  approved: "status-ok",
  cancelled: "status-danger",
  rejected: "status-danger"
};

const STATUS_ID: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  cancelled: "Dibatalkan",
  rejected: "Ditolak"
};

type RejectModalState = { leaveId: string; staffName: string; date: string } | null;

export default function AdminLeavePage() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<RejectModalState>(null);
  const [rejectNote, setRejectNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [leavePayload, configPayload] = await Promise.all([
        apiFetch<{ ok: true; leaves: Leave[] }>("/api/admin/leave", { role: "admin", body: { status } }),
        apiFetch<{ ok: true; config: Record<string, string> }>("/api/admin/config", { role: "admin" })
      ]);
      setLeaves(leavePayload.leaves);
      setAutoApprove(configPayload.config["leave_auto_approve"] !== "false");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function update(leaveId: string, nextStatus: string, note?: string) {
    if (updatingId) return;
    setUpdatingId(leaveId);
    setMessage("Memperbarui status libur..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/leave", {
        method: "PUT",
        role: "admin",
        body: { leaveId, status: nextStatus, note: note || null }
      });
      await load();
      const label = nextStatus === "approved" ? "disetujui ✓"
        : nextStatus === "rejected" ? "ditolak ✓"
        : "diperbarui ✓";
      setMessage(`Status libur ${label}`); setMsgType("ok");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    } finally {
      setUpdatingId(null);
    }
  }

  function openRejectModal(leave: Leave) {
    setRejectNote("");
    setRejectModal({ leaveId: leave.id, staffName: leave.staff_name, date: leave.date });
  }

  async function submitReject() {
    if (!rejectModal) return;
    setRejectModal(null);
    await update(rejectModal.leaveId, "rejected", rejectNote);
    setRejectNote("");
  }

  const STATUS_LABELS: Record<string, string> = {
    "": "Semua",
    pending: "Menunggu",
    approved: "Disetujui",
    rejected: "Ditolak",
    cancelled: "Dibatalkan"
  };

  function formatDateTime(iso: string) {
    try {
      return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  return (
    <>
      {/* Modal tolak dengan alasan */}
      {rejectModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }}>
          <div style={{
            background: "#fff", borderRadius: 20,
            padding: "24px 22px", width: "min(100%, 440px)",
            boxShadow: "0 8px 40px rgba(15,23,42,0.22)"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900 }}>Tolak Request Libur</h2>
              <button
                onClick={() => setRejectModal(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
              <strong>{rejectModal.staffName}</strong> — {formatDateID(rejectModal.date)}
            </p>
            <label className="label" htmlFor="rejectNote">
              Alasan penolakan (opsional, akan dikirim ke staff)
            </label>
            <textarea
              id="rejectNote"
              className="field"
              rows={3}
              placeholder="Contoh: Stok terbatas, butuh kehadiran, dll."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              style={{ resize: "none", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-danger"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                onClick={submitReject}
                disabled={Boolean(updatingId)}
              >
                <XCircle size={15} /> Tolak Request
              </button>
              <button
                className="btn btn-soft"
                style={{ flex: 1 }}
                onClick={() => setRejectModal(null)}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminPage title="Manajemen Libur" subtitle="Approve atau tolak permintaan libur staff">
        <MsgBar message={message} type={msgType} />

        {/* Info banner auto-approve */}
        {autoApprove !== null && (
          <div style={{
            background: autoApprove ? "var(--success-bg)" : "var(--warning-bg)",
            border: `1.5px solid ${autoApprove ? "var(--success-border)" : "var(--warning-border)"}`,
            borderRadius: 12, padding: "10px 16px",
            display: "flex", alignItems: "center", gap: 10
          }}>
            <span style={{ fontSize: 18 }}>{autoApprove ? "✅" : "⏳"}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: autoApprove ? "var(--success)" : "var(--warning)", marginBottom: 2 }}>
                Auto Approve {autoApprove ? "Aktif" : "Nonaktif"}
              </p>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                {autoApprove
                  ? "Permintaan libur dari staff langsung disetujui otomatis. Ubah di menu Pengaturan."
                  : "Permintaan libur masuk dengan status Menunggu dan harus disetujui secara manual."}
              </p>
            </div>
            <a
              href="/admin/config"
              style={{
                marginLeft: "auto", flexShrink: 0, fontSize: 12, fontWeight: 700,
                color: "var(--primary)", textDecoration: "none",
                background: "var(--primary-bg, #EEF2FF)", borderRadius: 8,
                padding: "5px 12px", border: "1px solid var(--primary-border, #C7D2FE)"
              }}
            >
              Ubah Pengaturan
            </a>
          </div>
        )}

        {/* Filter */}
        <AdminSection title="Filter Status">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
            {(["", "pending", "approved", "rejected", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  padding: "7px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, border: "1.5px solid",
                  borderColor: status === s ? "var(--primary)" : "var(--border)",
                  background: status === s ? "rgba(192,57,43,.06)" : "#fff",
                  color: status === s ? "var(--primary)" : "var(--muted)", cursor: "pointer"
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
            <button
              className="btn btn-soft"
              style={{ fontSize: 12, padding: "8px 12px", marginLeft: "auto" }}
              onClick={load}
              disabled={loading}
            >
              <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
            </button>
          </div>
        </AdminSection>

        {/* Tabel leave requests */}
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)" }}>
            <h2 style={{ fontSize: 13, fontWeight: 800 }}>
              Daftar Request Libur ({loading ? "..." : leaves.length})
            </h2>
          </div>

          {/* Desktop table — scrollable */}
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tanggal Libur</th>
                  <th>Staff</th>
                  <th>Outlet</th>
                  <th>Status</th>
                  <th>Alasan Staff</th>
                  <th>Catatan Admin</th>
                  <th>Waktu Request</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>
                      <RefreshCw size={16} style={{ display: "inline", animation: "spin 1s linear infinite", marginRight: 8 }} />
                      Memuat data...
                    </td>
                  </tr>
                ) : leaves.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>
                      Tidak ada data libur
                    </td>
                  </tr>
                ) : leaves.map((leave) => (
                  <tr key={leave.id}>
                    <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatDateID(leave.date)}</td>
                    <td style={{ fontWeight: 700 }}>{leave.staff_name}</td>
                    <td style={{ color: "var(--muted)", fontSize: 13 }}>{leave.outlet_name || "—"}</td>
                    <td>
                      <span className={`status-pill ${STATUS_COLORS[leave.status] || "status-warn"}`}>
                        {STATUS_ID[leave.status] || leave.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: 13, maxWidth: 180 }}>
                      {leave.reason || <span style={{ color: "var(--border)" }}>—</span>}
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: 12, maxWidth: 180, fontStyle: leave.admin_note ? "normal" : "italic" }}>
                      {leave.admin_note || <span style={{ color: "var(--border)" }}>—</span>}
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {leave.created_at ? formatDateTime(leave.created_at) : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {/* Setujui — hanya jika belum approved */}
                        {leave.status !== "approved" && (
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}
                            onClick={() => update(leave.id, "approved")}
                            disabled={updatingId !== null}
                          >
                            <CheckCircle size={13} />
                            {updatingId === leave.id ? "..." : "Setujui"}
                          </button>
                        )}

                        {/* Tolak — hanya untuk leave yang masih pending */}
                        {leave.status === "pending" && (
                          <button
                            className="btn btn-danger"
                            style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}
                            onClick={() => openRejectModal(leave)}
                            disabled={updatingId !== null}
                          >
                            <XCircle size={13} />
                            {updatingId === leave.id ? "..." : "Tolak"}
                          </button>
                        )}

                        {/* Batalkan — untuk approved/rejected, ubah ke cancelled */}
                        {(leave.status === "approved" || leave.status === "rejected") && (
                          <button
                            className="btn btn-soft"
                            style={{
                              fontSize: 12, padding: "6px 12px",
                              display: "flex", alignItems: "center", gap: 5,
                              color: "var(--muted)", borderColor: "var(--border)"
                            }}
                            onClick={() => {
                              if (window.confirm(`Batalkan keputusan libur ${leave.staff_name} pada ${formatDateID(leave.date)}?`)) {
                                update(leave.id, "cancelled");
                              }
                            }}
                            disabled={updatingId !== null}
                          >
                            {updatingId === leave.id ? "..." : "Batalkan"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div style={{
          background: "var(--surface-soft)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "var(--muted)"
        }}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Keterangan status:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
            <span><span className="status-pill status-warn" style={{ fontSize: 10 }}>Menunggu</span> — Belum ada keputusan</span>
            <span><span className="status-pill status-ok" style={{ fontSize: 10 }}>Disetujui</span> — Staff tidak perlu absen</span>
            <span><span className="status-pill status-danger" style={{ fontSize: 10 }}>Ditolak</span> — Staff tetap harus masuk</span>
            <span><span className="status-pill status-danger" style={{ fontSize: 10 }}>Dibatalkan</span> — Dibatalkan staff atau admin</span>
          </div>
        </div>
      </AdminPage>
    </>
  );
}

function humanError(err: unknown): string {
  if (!(err instanceof Error)) return "Terjadi kesalahan. Coba lagi.";
  const msg = err.message;
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch"))
    return "Koneksi bermasalah. Periksa internet lalu coba lagi.";
  if (msg.includes("401") || msg.includes("Sesi") || msg.includes("login"))
    return "Sesi berakhir. Silakan login ulang.";
  if (msg.includes("403") || msg.includes("ditolak") || msg.includes("izin"))
    return "Anda tidak memiliki izin untuk melakukan aksi ini.";
  if (msg.includes("500") || msg.includes("server"))
    return "Server sedang bermasalah. Coba beberapa saat lagi.";
  return msg || "Terjadi kesalahan. Coba lagi.";
}
