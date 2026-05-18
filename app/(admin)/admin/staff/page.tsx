"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Save } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
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
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");

  async function load() {
    const [sp, op] = await Promise.all([
      apiFetch<{ ok: true; staff: Staff[] }>("/api/admin/staff", { role: "admin" }),
      apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" })
    ]);
    setStaff(sp.staff);
    setOutlets(op.outlets);
  }

  useEffect(() => { load().catch((err: Error) => setMessage(err.message)); }, []);

  function startEdit(row: Staff) {
    setEditing(row.id);
    setForm({ ...emptyForm, name: row.name, outlet_id: row.outlet_id || "", salary_per_shift: String(row.salary_per_shift || 0), phone: row.phone || "" });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) { setMessage("Nama staff wajib diisi"); setMsgType("err"); return; }
    if (!editing && form.pin.length < 4) { setMessage("PIN minimal 4 digit"); setMsgType("err"); return; }
    setMessage("Menyimpan..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/staff", {
        method: editing ? "PUT" : "POST",
        role: "admin",
        body: { ...form, staffId: editing || undefined, outlet_id: form.outlet_id || null }
      });
      cancelEdit();
      await load();
      setMessage("Staff tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan"); setMsgType("err");
    }
  }

  async function deactivate(id: string, name: string) {
    if (!window.confirm(`Nonaktifkan ${name}?`)) return;
    setMessage("Menonaktifkan..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/staff", { method: "DELETE", role: "admin", body: { staffId: id } });
      await load();
      setMessage(`${name} dinonaktifkan`); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menonaktifkan"); setMsgType("err");
    }
  }

  const filtered = staff.filter((s) => filter === "all" ? true : filter === "active" ? s.active : !s.active);

  return (
    <AdminPage
      title="Manajemen Staff"
      subtitle="Tambah, edit, dan kelola karyawan"
      action={
        !showForm ? (
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => { cancelEdit(); setShowForm(true); }}>
            <Plus size={15} /> Tambah Staff
          </button>
        ) : null
      }
    >
      <MsgBar message={message} type={msgType} />

      {/* Form */}
      {showForm ? (
        <form onSubmit={submit}>
          <AdminSection title={editing ? "Edit Data Staff" : "Tambah Staff Baru"}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="label">Nama<span style={{ color: "var(--danger)" }}>*</span></label>
                <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label">PIN {editing ? "(kosongkan jika tidak ubah)" : <span style={{ color: "var(--danger)" }}>*</span>}</label>
                <input className="field" type="password" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} minLength={editing ? 0 : 4} maxLength={6} />
              </div>
              <div>
                <label className="label">Outlet</label>
                <select className="field" value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}>
                  <option value="">Belum ditentukan</option>
                  {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Gaji per Shift (Rp)</label>
                <input className="field" type="number" value={form.salary_per_shift} onChange={(e) => setForm({ ...form, salary_per_shift: e.target.value })} />
              </div>
              <div>
                <label className="label">Telepon</label>
                <input className="field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xxxxxxxxxx" />
              </div>
              <div>
                <label className="label">No. KTP</label>
                <input className="field" value={form.ktp_no} onChange={(e) => setForm({ ...form, ktp_no: e.target.value })} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label className="label">Alamat</label>
                <input className="field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn btn-primary">
                {editing ? <Save size={15} /> : <Plus size={15} />}
                {editing ? "Update Staff" : "Tambah Staff"}
              </button>
              <button type="button" className="btn btn-soft" onClick={cancelEdit}>Batal</button>
            </div>
          </AdminSection>
        </form>
      ) : null}

      {/* Staff list */}
      {!showForm ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {(["active", "inactive", "all"] as const).map((f) => {
                const labels = { active: "Aktif", inactive: "Nonaktif", all: "Semua" };
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700, border: "1.5px solid",
                      borderColor: filter === f ? "var(--primary)" : "var(--border)",
                      background: filter === f ? "rgba(192,57,43,.06)" : "#fff",
                      color: filter === f ? "var(--primary)" : "var(--muted)", cursor: "pointer"
                    }}
                  >
                    {labels[f]}
                  </button>
                );
              })}
            </div>
            <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={load}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Outlet</th>
                  <th>Gaji/Shift</th>
                  <th>Telepon</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Tidak ada data</td></tr>
                ) : filtered.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 700 }}>{row.name}</td>
                    <td>{outlets.find((o) => o.id === row.outlet_id)?.name || "—"}</td>
                    <td>{rupiah(row.salary_per_shift)}</td>
                    <td>{row.phone || "—"}</td>
                    <td>
                      <span className={`status-pill ${row.active ? "status-ok" : "status-danger"}`}>
                        {row.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-soft" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => startEdit(row)}>Edit</button>
                      {row.active ? (
                        <button className="btn btn-danger" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => deactivate(row.id, row.name)}>Nonaktif</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}
