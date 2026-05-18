"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy } from "@/lib/format";

type Leave = { id: string; staff_name: string; date: string; status: string; reason: string | null };

export default function AdminLeavePage() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await apiFetch<{ ok: true; leaves: Leave[] }>("/api/admin/leave", { role: "admin", body: { status } });
    setLeaves(payload.leaves);
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function update(leaveId: string, nextStatus: string) {
    setMessage("Memperbarui status cuti...");
    try {
      await apiFetch("/api/admin/leave", { method: "PUT", role: "admin", body: { leaveId, status: nextStatus } });
      await load();
      setMessage("Status cuti diperbarui");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memperbarui status cuti");
    }
  }

  return (
    <AdminPage title="Manajemen Cuti" subtitle="Approve atau cancel request libur staff">
      <section className="panel mb-5 grid gap-3 p-4 md:grid-cols-3">
        <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="btn btn-primary" onClick={load}>Filter</button>
        <p className="self-center text-sm font-bold text-slate-500">{message}</p>
      </section>
      <section className="panel overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Tanggal</th><th>Staff</th><th>Status</th><th>Alasan</th><th>Aksi</th></tr></thead>
          <tbody>
            {leaves.map((leave) => (
              <tr key={leave.id}>
                <td>{ddmmyyyy(leave.date)}</td>
                <td className="font-bold">{leave.staff_name}</td>
                <td><span className="status-pill status-warn">{leave.status}</span></td>
                <td>{leave.reason || "-"}</td>
                <td className="space-x-2">
                  <button className="btn btn-primary min-h-9 px-3 text-xs" onClick={() => update(leave.id, "approved")}>Approve</button>
                  <button className="btn btn-danger min-h-9 px-3 text-xs" onClick={() => update(leave.id, "cancelled")}>Cancel</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminPage>
  );
}
