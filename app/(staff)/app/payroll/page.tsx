"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy, hhmm, rupiah } from "@/lib/format";

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
      {error ? (
        <div style={{ background: "var(--danger-bg)", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}

      <button className="btn btn-soft" style={{ fontSize: 12, padding: "9px 14px", alignSelf: "flex-start" }} onClick={load} disabled={loading}>
        <RefreshCw size={14} /> Refresh
      </button>

      {/* Summary cards */}
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
          <p className="pay-val" style={{ color: "var(--primary)" }}>{rupiah(data?.summary.balance || 0)}</p>
        </div>
      </div>

      {/* Attendance history */}
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 900, marginBottom: 10, marginTop: 4 }}>Rincian Shift</h2>
        {loading ? <p style={{ fontSize: 12, color: "var(--muted)" }}>Memuat...</p> : null}
        {(data?.attendance || []).map((row) => (
          <div key={row.id} className="hist-item">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p className="hist-date">{ddmmyyyy(row.date)} · Shift {row.shift === 0 ? "Full" : row.shift}</p>
                <p className="hist-meta">{hhmm(row.checkin_time)} – {hhmm(row.checkout_time)}</p>
                <p style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                  {rupiah(row.final_salary)}
                  {row.deduction ? <span style={{ color: "var(--danger)", marginLeft: 6 }}>-{rupiah(row.deduction)}</span> : null}
                </p>
              </div>
              <span className={`status-pill ${row.paid_status ? "status-ok" : "status-warn"}`}>
                {row.paid_status ? "Dibayar" : "Belum"}
              </span>
            </div>
          </div>
        ))}
        {!loading && !(data?.attendance || []).length ? (
          <p style={{ fontSize: 12, color: "var(--muted-light)", textAlign: "center", padding: "16px 0" }}>Belum ada data absensi</p>
        ) : null}
      </div>

      {/* Payments history */}
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 900, marginBottom: 10, marginTop: 4 }}>Riwayat Pembayaran</h2>
        {(data?.payments || []).map((payment) => (
          <div key={payment.id} className="hist-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="hist-date">{ddmmyyyy(payment.paid_at)}</p>
              <p className="hist-meta">{hhmm(payment.paid_at)} · {payment.note || "Tanpa catatan"}</p>
            </div>
            <p className="hist-amount">{rupiah(payment.amount)}</p>
          </div>
        ))}
        {!loading && !(data?.payments || []).length ? (
          <p style={{ fontSize: 12, color: "var(--muted-light)", textAlign: "center", padding: "16px 0" }}>Belum ada pembayaran</p>
        ) : null}
      </div>
    </StaffPage>
  );
}
