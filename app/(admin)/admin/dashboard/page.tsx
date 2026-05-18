"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy, hhmm, rupiah } from "@/lib/format";

type DashboardPayload = {
  ok: true;
  date: string;
  metrics: { activeStaff: number; presentStaff: number; activeOutlets: number; reportBuka: number; reportTutup: number };
  attendance: Array<{
    id: string;
    staff_name: string;
    outlet_name: string;
    shift: number;
    checkin_time: string | null;
    checkout_time: string | null;
    final_salary: number;
    flags: string | null;
  }>;
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<DashboardPayload>("/api/admin/dashboard", { role: "admin" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const metrics = data?.metrics;

  return (
    <AdminPage title="Dashboard" subtitle={data ? ddmmyyyy(data.date) : "Overview operasional hari ini"}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button className="btn btn-soft text-sm" onClick={load} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
        {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
      </div>

      <section className="grid gap-3 md:grid-cols-5">
        {[
          ["Staff Hadir", `${metrics?.presentStaff || 0}/${metrics?.activeStaff || 0}`],
          ["Outlet Aktif", metrics?.activeOutlets || 0],
          ["Laporan Buka", metrics?.reportBuka || 0],
          ["Laporan Tutup", metrics?.reportTutup || 0],
          ["On Duty", data?.attendance.filter((row) => row.checkin_time && !row.checkout_time).length || 0]
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
          </div>
        ))}
      </section>

      <section className="panel mt-5 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Outlet</th>
              <th>Shift</th>
              <th>Masuk</th>
              <th>Pulang</th>
              <th>Status</th>
              <th>Gaji</th>
            </tr>
          </thead>
          <tbody>
            {(data?.attendance || []).map((row) => (
              <tr key={row.id}>
                <td className="font-bold">{row.staff_name}</td>
                <td>{row.outlet_name}</td>
                <td>{row.shift === 0 ? "Full" : row.shift}</td>
                <td>{hhmm(row.checkin_time)}</td>
                <td>{hhmm(row.checkout_time)}</td>
                <td>
                  <span className={`status-pill ${row.checkout_time ? "status-ok" : "status-warn"}`}>
                    {row.checkout_time ? "Selesai" : "Bertugas"}
                  </span>
                </td>
                <td>{rupiah(row.final_salary)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminPage>
  );
}
