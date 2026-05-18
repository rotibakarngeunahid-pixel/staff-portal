"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy, rupiah } from "@/lib/format";

type PayrollStaff = {
  id: string;
  name: string;
  active: boolean;
  totalEarned: number;
  totalPaid: number;
  balance: number;
  attendance: Array<{ id: string; date: string; shift: number; final_salary: number; paid_status: boolean }>;
};

export default function AdminPayrollPage() {
  const [payroll, setPayroll] = useState<PayrollStaff[]>([]);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({ dateFrom: "", dateTo: "", amount: "", note: "" });
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await apiFetch<{ ok: true; payroll: PayrollStaff[] }>("/api/admin/payroll", { role: "admin" });
    setPayroll(payload.payroll);
    if (!selected && payload.payroll[0]) setSelected(payload.payroll[0].id);
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = useMemo(() => payroll.find((item) => item.id === selected) || null, [payroll, selected]);
  const unpaid = current?.attendance.filter((row) => !row.paid_status) || [];

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setMessage("Memproses pembayaran...");
    try {
      const payload = await apiFetch<{ ok: true; overpayment: number }>("/api/admin/payroll", {
        method: "POST",
        role: "admin",
        body: { staffId: selected, ...form }
      });
      await load();
      setMessage(payload.overpayment ? `Tersimpan. Lebih bayar ${rupiah(payload.overpayment)}` : "Pembayaran tersimpan");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memproses pembayaran");
    }
  }

  return (
    <AdminPage title="Penggajian" subtitle="Ringkasan saldo dan proses pembayaran">
      <section className="panel mb-5 grid gap-3 p-4 md:grid-cols-5">
        <select className="field" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {payroll.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div className="metric"><p className="text-xs font-black uppercase text-slate-500">Earned</p><p className="font-black">{rupiah(current?.totalEarned || 0)}</p></div>
        <div className="metric"><p className="text-xs font-black uppercase text-slate-500">Paid</p><p className="font-black">{rupiah(current?.totalPaid || 0)}</p></div>
        <div className="metric"><p className="text-xs font-black uppercase text-slate-500">Saldo</p><p className="font-black text-[var(--primary)]">{rupiah(current?.balance || 0)}</p></div>
        <button className="btn btn-soft" onClick={load}>Refresh</button>
      </section>

      <form className="panel mb-5 grid gap-3 p-4 md:grid-cols-5" onSubmit={pay}>
        <input className="field" type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} required />
        <input className="field" type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} required />
        <input className="field" type="number" placeholder="Jumlah bayar" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        <input className="field" placeholder="Catatan" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="btn btn-primary">Proses Bayar</button>
      </form>
      <p className="mb-3 text-sm font-bold text-slate-500">{message}</p>

      <section className="panel overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Tanggal</th><th>Shift</th><th>Gaji Final</th><th>Status</th></tr></thead>
          <tbody>
            {unpaid.map((row) => (
              <tr key={row.id}>
                <td>{ddmmyyyy(row.date)}</td>
                <td>{row.shift === 0 ? "Full" : row.shift}</td>
                <td>{rupiah(row.final_salary)}</td>
                <td><span className="status-pill status-warn">Belum dibayar</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminPage>
  );
}
