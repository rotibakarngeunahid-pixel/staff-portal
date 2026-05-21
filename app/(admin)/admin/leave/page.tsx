"use client";

import { useEffect, useState } from "react";
import { CheckCircle, RefreshCw, XCircle } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID } from "@/lib/format";

type Leave = { id: string; staff_name: string; date: string; status: string; reason: string | null };

const STATUS_COLORS: Record<string, string> = {
  pending: "status-warn",
  approved: "status-ok",
  cancelled: "status-danger"
};

const STATUS_ID: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  cancelled: "Dibatalkan"
};

export default function AdminLeavePage() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  async function update(leaveId: string, nextStatus: string) {
    if (updatingId) return; // anti double-click
    setUpdatingId(leaveId);
    setMessage("Memperbarui status libur..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/leave", { method: "PUT", role: "admin", body: { leaveId, status: nextStatus } });
      await load();
      setMessage("Status libur diperbarui ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    } finally {
      setUpdatingId(null);
    }
  }

  const STATUS_LABELS: Record<string, string> = { "": "Semua", pending: "Menunggu", approved: "Disetujui", cancelled: "Dibatalkan" };

  return (
    <AdminPage title="Manajemen Libur" subtitle="Approve atau batalkan permintaan libur staff">
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
          {(["", "pending", "approved", "cancelled"] as const).map((s) => (
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
          <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px", marginLeft: "auto" }} onClick={load} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
          </button>
        </div>
      </AdminSection>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)" }}>
          <h2 style={{ fontSize: 13, fontWeight: 800 }}>Daftar Libur ({loading ? "..." : leaves.length})</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Staff</th>
              <th>Status</th>
              <th>Alasan</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>
                <RefreshCw size={16} style={{ display: "inline", animation: "spin 1s linear infinite", marginRight: 8 }} />
                Memuat data...
              </td></tr>
            ) : leaves.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Tidak ada data libur</td></tr>
            ) : leaves.map((leave) => (
              <tr key={leave.id}>
                <td>{formatDateID(leave.date)}</td>
                <td style={{ fontWeight: 700 }}>{leave.staff_name}</td>
                <td>
                  <span className={`status-pill ${STATUS_COLORS[leave.status] || "status-warn"}`}>
                    {STATUS_ID[leave.status] || leave.status}
                  </span>
                </td>
                <td style={{ color: "var(--muted)", fontSize: 13 }}>{leave.reason || "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {leave.status !== "approved" ? (
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}
                        onClick={() => update(leave.id, "approved")}
                        disabled={updatingId !== null}
                      >
                        <CheckCircle size={13} /> {updatingId === leave.id ? "..." : "Setujui"}
                      </button>
                    ) : null}
                    {leave.status !== "cancelled" ? (
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}
                        onClick={() => update(leave.id, "cancelled")}
                        disabled={updatingId !== null}
                      >
                        <XCircle size={13} /> {updatingId === leave.id ? "..." : "Batalkan"}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPage>
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
