"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
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
  incompleteAttendance: Array<{
    id: string;
    staff_name: string;
    outlet_name: string;
    date: string;
    shift: number;
    final_salary: number;
  }>;
};

type ProjectionSummary = {
  formedSalary: number;
  projectedNormal: number;
  estimatedCashNeed: number;
  averageConfidence: number;
  staffCount: number;
  insufficientDataCount: number;
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
  const [projection, setProjection] = useState<ProjectionSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [dashRes, projRes] = await Promise.allSettled([
        apiFetch<DashboardPayload>("/api/admin/dashboard", { role: "admin" }),
        apiFetch<{ ok: true; summary: ProjectionSummary }>("/api/admin/payroll-projection", { role: "admin" })
      ]);
      if (dashRes.status === "fulfilled") setData(dashRes.value);
      else setError(dashRes.reason instanceof Error ? dashRes.reason.message : "Gagal memuat dashboard");
      if (projRes.status === "fulfilled") setProjection(projRes.value.summary);
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
          <RefreshCw size={15} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> {loading ? "Memuat..." : "Refresh"}
        </button>
      }
    >
      {error ? (
        <div style={{ background: "var(--danger-bg)", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--danger)", marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      {/* Metric cards */}
      <div className="dash-metric-grid">
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

      {/* Payroll projection widget */}
      {(loading || projection) && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, marginBottom: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 13, fontWeight: 800 }}>Proyeksi Gaji Berikutnya</h2>
            <Link href="/admin/payroll-projection" style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              Detail <ArrowRight size={13} />
            </Link>
          </div>
          <div style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} style={{ height: 60, borderRadius: 10, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
              ))
            ) : projection ? (
              <>
                <div style={{ background: "#F2F3F4", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: "#7F8C8D" }}>{rupiah(projection.formedSalary)}</div>
                  <div style={{ fontSize: 10, color: "#95A5A6", fontWeight: 700, marginTop: 2, textTransform: "uppercase" }}>Sudah Terbentuk</div>
                </div>
                <div style={{ background: "#E8F8F0", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: "#27AE60" }}>{rupiah(projection.projectedNormal)}</div>
                  <div style={{ fontSize: 10, color: "#27AE60", fontWeight: 700, marginTop: 2, textTransform: "uppercase" }}>Proyeksi Normal</div>
                </div>
                <div style={{ background: "#EBF5FB", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: "#2980B9" }}>{rupiah(projection.estimatedCashNeed)}</div>
                  <div style={{ fontSize: 10, color: "#2980B9", fontWeight: 700, marginTop: 2, textTransform: "uppercase" }}>Cash Perlu Disiapkan</div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Perlu Tindakan — shift lampau yang checkin tapi tidak pernah checkout (sudah pasti tidak dibayar) */}
      {!loading && (data?.incompleteAttendance || []).length > 0 && (
        <div style={{ background: "#fff", border: "1px solid var(--danger-border)", borderRadius: 16, marginBottom: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--danger-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--danger)" }}>⚠️ Perlu Tindakan — Absen Tidak Lengkap</h2>
            <Link href="/admin/attendance" style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              Lihat &amp; Revisi <ArrowRight size={13} />
            </Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Staff</th>
                  <th>Outlet</th>
                  <th>Shift</th>
                  <th>Gaji Hilang</th>
                </tr>
              </thead>
              <tbody>
                {(data?.incompleteAttendance || []).map((row) => (
                  <tr key={row.id}>
                    <td data-label="Tanggal">{formatDateID(row.date)}</td>
                    <td data-label="Staff" style={{ fontWeight: 700 }}>{row.staff_name}</td>
                    <td data-label="Outlet">{row.outlet_name}</td>
                    <td data-label="Shift">{row.shift === 0 ? "Full" : `S${row.shift}`}</td>
                    <td data-label="Gaji Hilang" style={{ fontWeight: 700, color: "var(--danger)" }}>{rupiah(row.final_salary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  <td data-label="Staff" style={{ fontWeight: 700 }}>{row.staff_name}</td>
                  <td data-label="Outlet">{row.outlet_name}</td>
                  <td data-label="Shift">{row.shift === 0 ? "Full" : `S${row.shift}`}</td>
                  <td data-label="Masuk">{hhmm(row.checkin_time)}</td>
                  <td data-label="Pulang">{hhmm(row.checkout_time)}</td>
                  <td data-label="Status">
                    <span className={`status-pill ${row.checkout_time ? "status-ok" : "status-warn"}`}>
                      {row.checkout_time ? "Selesai" : "Bertugas"}
                    </span>
                  </td>
                  <td data-label="Gaji" style={{ fontWeight: 700 }}>{rupiah(row.final_salary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPage>
  );
}
