"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Save } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { rupiah } from "@/lib/format";

type Staff = { id: string; name: string; outlet_id: string | null; salary_per_shift: number; active: boolean; phone: string | null };
type Outlet = { id: string; name: string };

const emptyForm = { name: "", pin: "", outlet_id: "", salary_per_shift: "0", phone: "", ktp_no: "", address: "" };

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const [staffPayload, outletPayload] = await Promise.all([
      apiFetch<{ ok: true; staff: Staff[] }>("/api/admin/staff", { role: "admin" }),
      apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" })
    ]);
    setStaff(staffPayload.staff);
    setOutlets(outletPayload.outlets);
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  }, []);

  function edit(row: Staff) {
    setEditing(row.id);
    setForm({
      ...emptyForm,
      name: row.name,
      outlet_id: row.outlet_id || "",
      salary_per_shift: String(row.salary_per_shift || 0),
      phone: row.phone || ""
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Menyimpan...");
    try {
      await apiFetch("/api/admin/staff", {
        method: editing ? "PUT" : "POST",
        role: "admin",
        body: { ...form, staffId: editing || undefined, outlet_id: form.outlet_id || null }
      });
      setForm(emptyForm);
      setEditing(null);
      await load();
      setMessage("Tersimpan");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan");
    }
  }

  async function deactivate(id: string) {
    if (!window.confirm("Nonaktifkan staff ini?")) return;
    setMessage("Menonaktifkan staff...");
    try {
      await apiFetch("/api/admin/staff", { method: "DELETE", role: "admin", body: { staffId: id } });
      await load();
      setMessage("Staff dinonaktifkan");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menonaktifkan staff");
    }
  }

  return (
    <AdminPage title="Manajemen Staff" subtitle="Tambah, edit, dan nonaktifkan staff">
      <form className="panel mb-5 grid gap-3 p-4 md:grid-cols-4" onSubmit={submit}>
        <div>
          <label className="label">Nama</label>
          <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="label">PIN {editing ? "baru" : ""}</label>
          <input className="field" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} minLength={editing ? 0 : 4} />
        </div>
        <div>
          <label className="label">Outlet</label>
          <select className="field" value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}>
            <option value="">Belum ditentukan</option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Gaji / shift</label>
          <input className="field" type="number" value={form.salary_per_shift} onChange={(e) => setForm({ ...form, salary_per_shift: e.target.value })} />
        </div>
        <div>
          <label className="label">Telepon</label>
          <input className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">KTP</label>
          <input className="field" value={form.ktp_no} onChange={(e) => setForm({ ...form, ktp_no: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="label">Alamat</label>
          <input className="field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="flex items-end gap-2 md:col-span-4">
          <button className="btn btn-primary">
            {editing ? <Save size={17} /> : <Plus size={17} />}
            {editing ? "Update Staff" : "Tambah Staff"}
          </button>
          {editing ? <button type="button" className="btn btn-soft" onClick={() => { setEditing(null); setForm(emptyForm); }}>Batal</button> : null}
          <button type="button" className="btn btn-soft" onClick={load}><RefreshCw size={16} />Refresh</button>
          <span className="text-sm font-bold text-slate-500">{message}</span>
        </div>
      </form>

      <section className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Nama</th><th>Outlet</th><th>Gaji</th><th>Status</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {staff.map((row) => (
              <tr key={row.id}>
                <td className="font-bold">{row.name}</td>
                <td>{outlets.find((o) => o.id === row.outlet_id)?.name || "-"}</td>
                <td>{rupiah(row.salary_per_shift)}</td>
                <td><span className={`status-pill ${row.active ? "status-ok" : "status-danger"}`}>{row.active ? "Aktif" : "Nonaktif"}</span></td>
                <td className="space-x-2">
                  <button className="btn btn-soft min-h-9 px-3 text-xs" onClick={() => edit(row)}>Edit</button>
                  <button className="btn btn-danger min-h-9 px-3 text-xs" onClick={() => deactivate(row.id)}>Nonaktif</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminPage>
  );
}
