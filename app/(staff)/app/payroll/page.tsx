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
      setError(err instanceof Error ? err.message : "Gagal memuat payroll");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <StaffPage title="Gaji" subtitle="Ringkasan gaji dan pembayaran">
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      <button className="btn btn-soft mb-4 text-sm" onClick={load} disabled={loading}>
        <RefreshCw size={16} />
        Refresh
      </button>

      <section className="grid gap-3">
        <div className="metric">
          <p className="text-xs font-extrabold uppercase text-slate-500">Gaji Diperoleh</p>
          <p className="mt-1 text-2xl font-black">{rupiah(data?.summary.totalEarned || 0)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="metric">
            <p className="text-xs font-extrabold uppercase text-slate-500">Dibayar</p>
            <p className="mt-1 text-lg font-black text-green-700">{rupiah(data?.summary.totalPaid || 0)}</p>
          </div>
          <div className="metric">
            <p className="text-xs font-extrabold uppercase text-slate-500">Saldo</p>
            <p className="mt-1 text-lg font-black text-[var(--primary)]">{rupiah(data?.summary.balance || 0)}</p>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-base font-black">Rincian Shift</h2>
        <div className="space-y-2">
          {(data?.attendance || []).map((row) => (
            <article key={row.id} className="panel p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">{ddmmyyyy(row.date)} · Shift {row.shift === 0 ? "Full" : row.shift}</p>
                  <p className="text-sm font-semibold text-slate-500">
                    {hhmm(row.checkin_time)} - {hhmm(row.checkout_time)}
                  </p>
                </div>
                <span className={`status-pill ${row.paid_status ? "status-ok" : "status-warn"}`}>
                  {row.paid_status ? "Dibayar" : "Belum"}
                </span>
              </div>
              <p className="mt-2 text-sm font-bold">
                Final {rupiah(row.final_salary)} {row.deduction ? `· Potongan ${rupiah(row.deduction)}` : ""}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-base font-black">Riwayat Pembayaran</h2>
        <div className="space-y-2">
          {(data?.payments || []).map((payment) => (
            <article key={payment.id} className="panel p-3">
              <p className="font-black">{rupiah(payment.amount)}</p>
              <p className="text-sm font-semibold text-slate-500">{ddmmyyyy(payment.paid_at)} {hhmm(payment.paid_at)} · {payment.note || "Tanpa catatan"}</p>
            </article>
          ))}
        </div>
      </section>
    </StaffPage>
  );
}
