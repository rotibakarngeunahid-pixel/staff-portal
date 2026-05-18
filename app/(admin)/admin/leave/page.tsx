"use client";

import { useEffect, useState } from "react";
import { CheckCircle, RefreshCw, XCircle } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy } from "@/lib/format";

type Leave = { id: string; staff_name: string; date: string; status: string; reason: string | null };

const STATUS_COLORS: Record<string, string> = {
  pending: "status-warn",
  approved: "status-ok",
  cancelled: "status-danger"
};

export default function AdminLeavePage() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");

  async function load() {
    const payload = await apiFetch<{ ok: true; leaves: Leave[] }>("/api/admin/leave", { role: "admin", body: { status } });
    setLeaves(payload.leaves);
  }

  useEffect(() => {
    load().catch((err: Error) => { setMessage(err.message); setMsgType("err"); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function update(leaveId: string, nextStatus: string) {
    setMessage("Memperbarui status cuti..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/leave", { method: "PUT", role: "admin", body: { leaveId, status: nextStatus } });
      await load();
      setMessage("Status cuti diperbarui ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memperbarui status cuti"); setMsgType("err");
    }
  }

  const STATUS_LABELS: Record<string, string> = { "": "Semua", pending: "Pending", approved: "Approved", cancelled: "Cancelled" };

  return (
    <AdminPage title="Manajemen Cuti" subtitle="Approve atau cancel request libur staff">
      <MsgBar message={message} type={msgType} />

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
          <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px", marginLeft: "auto" }} onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </AdminSection>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)" }}>
          <h2 style={{ fontSize: 13, fontWeight: 800 }}>Daftar Cuti ({leaves.length})</h2>
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
            {leaves.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Tidak ada data</td></tr>
            ) : leaves.map((leave) => (
              <tr key={leave.id}>
                <td>{ddmmyyyy(leave.date)}</td>
                <td style={{ fontWeight: 700 }}>{leave.staff_name}</td>
                <td>
                  <span className={`status-pill ${STATUS_COLORS[leave.status] || "status-warn"}`}>
                    {leave.status}
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
                      >
                        <CheckCircle size={13} /> Approve
                      </button>
                    ) : null}
                    {leave.status !== "cancelled" ? (
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}
                        onClick={() => update(leave.id, "cancelled")}
                      >
                        <XCircle size={13} /> Cancel
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
