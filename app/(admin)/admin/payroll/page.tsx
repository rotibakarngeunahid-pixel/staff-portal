"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
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
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");

  async function load() {
    const payload = await apiFetch<{ ok: true; payroll: PayrollStaff[] }>("/api/admin/payroll", { role: "admin" });
    setPayroll(payload.payroll);
    if (!selected && payload.payroll[0]) setSelected(payload.payroll[0].id);
  }

  useEffect(() => {
    load().catch((err: Error) => { setMessage(err.message); setMsgType("err"); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = useMemo(() => payroll.find((item) => item.id === selected) || null, [payroll, selected]);
  const unpaid = current?.attendance.filter((row) => !row.paid_status) || [];

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setMessage("Memproses pembayaran..."); setMsgType("info");
    try {
      const payload = await apiFetch<{ ok: true; overpayment: number }>("/api/admin/payroll", {
        method: "POST",
        role: "admin",
        body: { staffId: selected, ...form }
      });
      await load();
      setMessage(payload.overpayment ? `Tersimpan. Lebih bayar ${rupiah(payload.overpayment)}` : "Pembayaran tersimpan ✓");
      setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memproses pembayaran"); setMsgType("err");
    }
  }

  const SUMMARY = [
    { label: "Total Earned", value: rupiah(current?.totalEarned || 0), color: "#2980B9" },
    { label: "Sudah Dibayar", value: rupiah(current?.totalPaid || 0), color: "#27AE60" },
    { label: "Saldo Tersisa", value: rupiah(current?.balance || 0), color: "var(--primary)" }
  ];

  return (
    <AdminPage
      title="Penggajian"
      subtitle="Ringkasan saldo dan proses pembayaran"
      action={
        <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      }
    >
      <MsgBar message={message} type={msgType} />

      {/* Staff selector + summary cards */}
      <AdminSection title="Pilih Staff & Ringkasan Gaji">
        <div style={{ marginBottom: 14 }}>
          <label className="label">Staff</label>
          <select className="field" style={{ maxWidth: 300 }} value={selected} onChange={(e) => setSelected(e.target.value)}>
            {payroll.map((item) => <option key={item.id} value={item.id}>{item.name}{!item.active ? " (nonaktif)" : ""}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {SUMMARY.map((s) => (
            <div key={s.label} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-light)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: "var(--font-nunito, sans-serif)" }}>{s.value}</div>
            </div>
          ))}
        </div>
      </AdminSection>

      {/* Payment form */}
      <AdminSection title="Proses Pembayaran" subtitle="Tandai gaji sebagai sudah dibayarkan">
        <form onSubmit={pay}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label className="label">Dari Tanggal</label>
              <input className="field" type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} required />
            </div>
            <div>
              <label className="label">Sampai Tanggal</label>
              <input className="field" type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} required />
            </div>
            <div>
              <label className="label">Jumlah Bayar (Rp)</label>
              <input className="field" type="number" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <div>
              <label className="label">Catatan</label>
              <input className="field" placeholder="Opsional" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}>
            <Save size={15} /> Proses Bayar
          </button>
        </form>
      </AdminSection>

      {/* Unpaid attendance */}
      <AdminSection title={`Shift Belum Dibayar (${unpaid.length})`} subtitle="Daftar shift yang belum ditandai lunas untuk staff ini">
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Shift</th>
                <th>Gaji Final</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>
                  {current ? "Semua shift sudah dibayar 🎉" : "Pilih staff terlebih dahulu"}
                </td></tr>
              ) : unpaid.map((row) => (
                <tr key={row.id}>
                  <td>{ddmmyyyy(row.date)}</td>
                  <td>{row.shift === 0 ? "Full" : `S${row.shift}`}</td>
                  <td style={{ fontWeight: 700 }}>{rupiah(row.final_salary)}</td>
                  <td><span className="status-pill status-warn">Belum dibayar</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>
    </AdminPage>
  );
}
