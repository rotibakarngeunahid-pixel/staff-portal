"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID, hhmm, rupiah } from "@/lib/format";

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

const METRICS = [
  { key: "hadir", label: "Hadir", emoji: "👥", color: "#2980B9", bg: "#EBF5FB" },
  { key: "outlets", label: "Outlet Aktif", emoji: "🏪", color: "#8E44AD", bg: "#F5EEF8" },
  { key: "buka", label: "Laporan Buka", emoji: "🌅", color: "#27AE60", bg: "#E8F8F0" },
  { key: "tutup", label: "Laporan Tutup", emoji: "🌙", color: "#E67E22", bg: "#FEF9E7" },
  { key: "onduty", label: "On Duty", emoji: "⚡", color: "#C0392B", bg: "#FDEDEC" }
];

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

  useEffect(() => { load(); }, []);

  const m = data?.metrics;
  const metricValues = [
    `${m?.presentStaff ?? "—"}/${m?.activeStaff ?? "—"}`,
    m?.activeOutlets ?? "—",
    m?.reportBuka ?? "—",
    m?.reportTutup ?? "—",
    data?.attendance.filter((r) => r.checkin_time && !r.checkout_time).length ?? "—"
  ];

  return (
    <AdminPage
      title="Dashboard"
      subtitle={data ? `Hari ini · ${formatDateID(data.date)}` : "Overview operasional hari ini"}
      action={
        <button className="btn btn-soft" style={{ fontSize: 13 }} onClick={load} disabled={loading}>
          <RefreshCw size={15} /> Refresh
        </button>
      }
    >
      {error ? (
        <div style={{ background: "var(--danger-bg)", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--danger)", marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {METRICS.map((metric, i) => (
          <div
            key={metric.key}
            style={{
              background: "#fff",
              border: `1px solid ${metric.color}22`,
              borderRadius: 14,
              padding: "14px 12px",
              textAlign: "center",
              boxShadow: "0 2px 10px rgba(0,0,0,.05)"
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 6 }}>{metric.emoji}</div>
            <div style={{ fontFamily: "var(--font-nunito, sans-serif)", fontSize: 22, fontWeight: 900, color: metric.color }}>
              {metricValues[i]}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-light)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {metric.label}
            </div>
          </div>
        ))}
      </div>

      {/* Attendance table */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)" }}>
          <h2 style={{ fontSize: 13, fontWeight: 800 }}>Absensi Hari Ini</h2>
        </div>
        <div style={{ overflowX: "auto" }}>
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
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13 }}>Memuat...</td></tr>
              ) : (data?.attendance || []).length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Belum ada absensi hari ini</td></tr>
              ) : (data?.attendance || []).map((row) => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 700 }}>{row.staff_name}</td>
                  <td>{row.outlet_name}</td>
                  <td>{row.shift === 0 ? "Full" : `S${row.shift}`}</td>
                  <td>{hhmm(row.checkin_time)}</td>
                  <td>{hhmm(row.checkout_time)}</td>
                  <td>
                    <span className={`status-pill ${row.checkout_time ? "status-ok" : "status-warn"}`}>
                      {row.checkout_time ? "Selesai" : "Bertugas"}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{rupiah(row.final_salary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPage>
  );
}
