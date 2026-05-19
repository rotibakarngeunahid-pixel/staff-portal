"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";
import { apiFetch } from "@/lib/client-api";
import { hhmm, rupiah } from "@/lib/format";

type PayrollPayload = {
  ok: true;
  summary: { totalEarned: number; totalPaid: number; balance: number };
  attendance: Array<{
    id: string;
    date: string;
    shift: number;
    checkin_time: string | null;
    checkout_time: string | null;
    status: string;
    deduction: number;
    final_salary: number;
    paid_status: boolean;
  }>;
  payments: Array<{ id: string; paid_at: string; amount: number; note: string | null }>;
};

function formatDateId(isoDate: string): string {
  const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const d = new Date(`${isoDate}T00:00:00`);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function StaffPayrollPage() {
  const [data, setData] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<PayrollPayload>("/api/staff/payroll", { role: "staff" }));
    } catch (err) {
      setError(err instanceof Error
        ? (err.message.includes("fetch") || err.message.includes("Failed to fetch")
            ? "Data belum berhasil dimuat. Periksa koneksi internet lalu coba lagi."
            : err.message)
        : "Gagal memuat data gaji. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <StaffPage title="Info Gaji" subtitle="Ringkasan gaji dan pembayaran">
      {/* Refresh button */}
      <button
        className="btn btn-soft"
        style={{ fontSize: 12, padding: "9px 14px", alignSelf: "flex-start" }}
        onClick={load}
        disabled={loading}
      >
        <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
        {loading ? "Memuat..." : "Refresh"}
      </button>

      {/* Error */}
      {error ? (
        <div style={{
          background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
          borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "var(--danger)"
        }}>
          ⚠️ {error}
        </div>
      ) : null}

      {/* Summary cards */}
      {loading ? (
        <div className="pay-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className={i === 1 ? "pay-card-full" : "pay-card"}>
              <div style={{ height: 10, width: 80, borderRadius: 4, background: "var(--border)", margin: "0 auto 10px", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
              <div style={{ height: 22, width: 110, borderRadius: 6, background: "var(--border)", margin: "0 auto", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="pay-grid">
          <div className="pay-card-full">
            <p className="pay-label">Total Gaji Diperoleh</p>
            <p className="pay-val">{rupiah(data?.summary.totalEarned || 0)}</p>
          </div>
          <div className="pay-card">
            <p className="pay-label">Sudah Dibayar</p>
            <p className="pay-val" style={{ color: "var(--success)" }}>{rupiah(data?.summary.totalPaid || 0)}</p>
          </div>
          <div className="pay-card">
            <p className="pay-label">Belum Dibayar</p>
            <p className="pay-val" style={{ color: data?.summary.balance ? "var(--primary)" : "var(--muted-light)" }}>
              {rupiah(data?.summary.balance || 0)}
            </p>
          </div>
        </div>
      )}

      {/* Attendance history */}
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 900, marginBottom: 10, marginTop: 4 }}>Rincian Shift</h2>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 14, padding: "14px",
                border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)"
              }}>
                <div style={{ height: 13, width: 140, borderRadius: 4, background: "var(--border)", marginBottom: 8, animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                <div style={{ height: 11, width: 100, borderRadius: 4, background: "var(--border)", marginBottom: 10, animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                <div style={{ height: 16, width: 90, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
              </div>
            ))}
          </div>
        ) : (data?.attendance || []).length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted-light)", textAlign: "center", padding: "20px 0" }}>
            Belum ada data absensi
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data?.attendance || []).map((row) => (
              <div
                key={row.id}
                style={{
                  background: "#fff",
                  border: `1px solid ${row.paid_status ? "var(--border)" : "var(--warning-border)"}`,
                  borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "var(--shadow-xs)"
                }}
              >
                {/* Row 1: date + shift + status */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>
                      {formatDateId(row.date)}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.3px",
                      background: "var(--surface-soft)", color: "var(--muted)",
                      border: "1px solid var(--border)", borderRadius: 6, padding: "2px 7px"
                    }}>
                      {row.shift === 0 ? "Full Shift" : `Shift ${row.shift}`}
                    </span>
                  </div>
                  <span className={`status-pill ${row.paid_status ? "status-ok" : "status-warn"}`}
                    style={{ flexShrink: 0, fontSize: 11 }}>
                    {row.paid_status ? "Dibayar" : "Belum dibayar"}
                  </span>
                </div>

                {/* Row 2: jam masuk - jam pulang */}
                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                  🕐 {hhmm(row.checkin_time) || "—"} → {hhmm(row.checkout_time) || "Belum pulang"}
                </p>

                {/* Row 3: deduction if any */}
                {row.deduction > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "var(--warning-bg)", borderRadius: 8, padding: "5px 10px",
                    marginBottom: 6
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)" }}>⚠️ Potongan keterlambatan</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--danger)" }}>-{rupiah(row.deduction)}</span>
                  </div>
                )}

                {/* Row 4: final salary */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "var(--success-bg)", borderRadius: 8, padding: "7px 10px",
                  border: "1px solid var(--success-border)"
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--success)" }}>Gaji shift ini</span>
                  <span style={{
                    fontFamily: "var(--font-nunito,sans-serif)", fontSize: 15, fontWeight: 900,
                    color: row.final_salary > 0 ? "var(--success)" : "var(--muted)"
                  }}>
                    {rupiah(row.final_salary)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payments history */}
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 900, marginBottom: 10, marginTop: 4 }}>Riwayat Pembayaran</h2>

        {loading ? (
          <div style={{ height: 14, width: 120, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
        ) : (data?.payments || []).length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted-light)", textAlign: "center", padding: "20px 0" }}>
            Belum ada pembayaran
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data?.payments || []).map((payment) => (
              <div
                key={payment.id}
                style={{
                  background: "#fff", border: "1px solid var(--success-border)", borderRadius: 14,
                  padding: "12px 14px", boxShadow: "var(--shadow-xs)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 2 }}>
                    {formatDateId(payment.paid_at.slice(0, 10))}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>
                    {payment.note || "Tanpa catatan"}
                  </p>
                </div>
                <p style={{
                  fontFamily: "var(--font-nunito,sans-serif)", fontSize: 16, fontWeight: 900,
                  color: "var(--success)", flexShrink: 0
                }}>
                  {rupiah(payment.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </StaffPage>
  );
}
