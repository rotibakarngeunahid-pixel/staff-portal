"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy } from "@/lib/format";

type Outlet = { id: string; name: string; shift_mode: number };
type Dayoff = { id: string; outlet_id: string; date: string; shift: number };

export default function AdminDayoffPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [dayoff, setDayoff] = useState<Dayoff[]>([]);
  const [form, setForm] = useState({ outletId: "", dateFrom: new Date().toISOString().slice(0, 10), dateTo: "", shift: "1" });
  const [message, setMessage] = useState("");

  async function load() {
    const [outletPayload, offPayload] = await Promise.all([
      apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" }),
      apiFetch<{ ok: true; dayoff: Dayoff[] }>("/api/admin/dayoff", { role: "admin", body: { outletId: form.outletId } })
    ]);
    const shiftOutlets = outletPayload.outlets.filter((outlet) => outlet.shift_mode === 2);
    setOutlets(shiftOutlets);
    setDayoff(offPayload.dayoff);
    if (!form.outletId && shiftOutlets[0]) setForm((current) => ({ ...current, outletId: shiftOutlets[0].id }));
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    await apiFetch("/api/admin/dayoff", { method: "POST", role: "admin", body: form });
    await load();
  }

  async function remove(id: string) {
    await apiFetch("/api/admin/dayoff", { method: "DELETE", role: "admin", body: { id } });
    await load();
  }

  return (
    <AdminPage title="Hari Libur Shift" subtitle="Toggle shift off untuk outlet 2-shift">
      <form className="panel mb-5 grid gap-3 p-4 md:grid-cols-5" onSubmit={add}>
        <select className="field" value={form.outletId} onChange={(e) => setForm({ ...form, outletId: e.target.value })}>
          {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
        </select>
        <input className="field" type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} />
        <input className="field" type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} />
        <select className="field" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
          <option value="1">Shift 1</option>
          <option value="2">Shift 2</option>
        </select>
        <button className="btn btn-primary">Set Off</button>
      </form>
      <p className="mb-3 text-sm font-bold text-slate-500">{message}</p>
      <section className="panel overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Tanggal</th><th>Outlet</th><th>Shift</th><th>Aksi</th></tr></thead>
          <tbody>
            {dayoff.map((row) => (
              <tr key={row.id}>
                <td>{ddmmyyyy(row.date)}</td>
                <td>{outlets.find((outlet) => outlet.id === row.outlet_id)?.name || row.outlet_id}</td>
                <td>{row.shift}</td>
                <td><button className="btn btn-danger min-h-9 px-3 text-xs" onClick={() => remove(row.id)}>Hapus</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminPage>
  );
}
