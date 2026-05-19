"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID } from "@/lib/format";

type Outlet = { id: string; name: string; shift_mode: number };
type Dayoff = { id: string; outlet_id: string; date: string; shift: number };

export default function AdminDayoffPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [dayoff, setDayoff] = useState<Dayoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ outletId: "", dateFrom: new Date().toISOString().slice(0, 10), dateTo: "", shift: "1" });
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");

  async function load() {
    setLoading(true);
    try {
      const [outletPayload, offPayload] = await Promise.all([
        apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" }),
        apiFetch<{ ok: true; dayoff: Dayoff[] }>("/api/admin/dayoff", { role: "admin", body: { outletId: form.outletId } })
      ]);
      const shiftOutlets = outletPayload.outlets.filter((outlet) => outlet.shift_mode === 2);
      setOutlets(shiftOutlets);
      setDayoff(offPayload.dayoff);
      if (!form.outletId && shiftOutlets[0]) setForm((current) => ({ ...current, outletId: shiftOutlets[0].id }));
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Menyimpan hari libur..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/dayoff", { method: "POST", role: "admin", body: form });
      await load();
      setMessage("Hari libur disimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Hapus hari libur ini?")) return;
    setMessage("Menghapus..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/dayoff", { method: "DELETE", role: "admin", body: { id } });
      await load();
      setMessage("Hari libur dihapus ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    }
  }

  return (
    <AdminPage title="Hari Libur Shift" subtitle="Toggle shift off untuk outlet 2-shift">
      <MsgBar message={message} type={msgType} />

      {/* Add form */}
      <AdminSection title="Tambah Hari Libur" subtitle="Nonaktifkan shift tertentu pada rentang tanggal">
        <form onSubmit={add}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
            <div>
              <label className="label">Outlet</label>
              <select className="field" value={form.outletId} onChange={(e) => setForm({ ...form, outletId: e.target.value })}>
                {outlets.length === 0 ? <option value="">Tidak ada outlet 2-shift</option> : null}
                {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Dari Tanggal</label>
              <input className="field" type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} />
            </div>
            <div>
              <label className="label">Sampai Tanggal (opsional)</label>
              <input className="field" type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} />
            </div>
            <div>
              <label className="label">Shift</label>
              <select className="field" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
                <option value="1">Shift 1</option>
                <option value="2">Shift 2</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}>
              <Plus size={15} /> Set Off
            </button>
          </div>
        </form>
      </AdminSection>

      {/* List */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 13, fontWeight: 800 }}>Daftar Hari Libur ({loading ? "..." : dayoff.length})</h2>
          <button className="btn btn-soft" style={{ fontSize: 11, padding: "6px 10px" }} onClick={load} disabled={loading}>
            <RefreshCw size={12} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Outlet</th>
              <th>Shift</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>
                <RefreshCw size={16} style={{ display: "inline", animation: "spin 1s linear infinite", marginRight: 8 }} />
                Memuat data...
              </td></tr>
            ) : dayoff.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Tidak ada hari libur terdaftar</td></tr>
            ) : dayoff.map((row) => (
              <tr key={row.id}>
                <td>{formatDateID(row.date)}</td>
                <td>{outlets.find((outlet) => outlet.id === row.outlet_id)?.name || row.outlet_id}</td>
                <td>Shift {row.shift}</td>
                <td>
                  <button
                    className="btn btn-danger"
                    style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}
                    onClick={() => remove(row.id)}
                  >
                    <Trash2 size={13} /> Hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}

function humanError(err: unknown): string {
  if (!(err instanceof Error)) return "Terjadi kesalahan. Coba lagi.";
  const msg = err.message;
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch"))
    return "Koneksi bermasalah. Periksa internet lalu coba lagi.";
  if (msg.includes("401") || msg.includes("Sesi") || msg.includes("login"))
    return "Sesi berakhir. Silakan login ulang.";
  if (msg.includes("403") || msg.includes("ditolak") || msg.includes("izin"))
    return "Anda tidak memiliki izin untuk melakukan aksi ini.";
  if (msg.includes("500") || msg.includes("server"))
    return "Server sedang bermasalah. Coba beberapa saat lagi.";
  if (msg.includes("kedua shift"))
    return "Tidak bisa meliburkan kedua shift pada tanggal yang sama.";
  return msg || "Terjadi kesalahan. Coba lagi.";
}
