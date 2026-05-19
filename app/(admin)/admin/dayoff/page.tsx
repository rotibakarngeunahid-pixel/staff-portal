"use client";

import { useEffect, useState } from "react";
import { CalendarOff, Plus, RefreshCw, Trash2 } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID } from "@/lib/format";

type Outlet = { id: string; name: string; shift_mode: number };
type Staff = { id: string; name: string; outlet_id: string | null; active: boolean };

// Tipe baru: dayoff berbasis staff (PRD §8.4)
type StaffDayoff = {
  id: string;
  outlet_id: string;
  staff_id: string;
  staff_name: string;
  date: string;
  status: "active" | "cancelled";
  source: string;
  reason: string | null;
  created_at: string;
  coverage?: { action: string; staffName?: string };
};

// Tipe lama: dayoff berbasis shift (legacy)
type ShiftDayoff = { id: string; outlet_id: string; date: string; shift: number };

type Tab = "staff" | "shift";

export default function AdminDayoffPage() {
  const [tab, setTab] = useState<Tab>("staff");
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [staffDayoffs, setStaffDayoffs] = useState<StaffDayoff[]>([]);
  const [shiftDayoffs, setShiftDayoffs] = useState<ShiftDayoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");

  // Form libur staff (baru)
  const [staffForm, setStaffForm] = useState({ outletId: "", staffId: "", date: new Date().toISOString().slice(0, 10), reason: "" });

  // Form libur shift (legacy)
  const [shiftForm, setShiftForm] = useState({ outletId: "", dateFrom: new Date().toISOString().slice(0, 10), dateTo: "", shift: "1" });

  async function load() {
    setLoading(true);
    try {
      const [outletPayload, staffPayload, staffDayoffPayload, shiftDayoffPayload] = await Promise.all([
        apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" }),
        apiFetch<{ ok: true; staff: Staff[] }>("/api/admin/staff", { role: "admin" }),
        apiFetch<{ ok: true; dayoff: StaffDayoff[] }>("/api/admin/staff-dayoff", { role: "admin" }),
        apiFetch<{ ok: true; dayoff: ShiftDayoff[] }>("/api/admin/dayoff", { role: "admin" })
      ]);
      setOutlets(outletPayload.outlets);
      setStaffList(staffPayload.staff.filter((s) => s.active));
      setStaffDayoffs(staffDayoffPayload.dayoff);
      setShiftDayoffs(shiftDayoffPayload.dayoff);
      if (!staffForm.outletId && outletPayload.outlets[0]) {
        setStaffForm((f) => ({ ...f, outletId: outletPayload.outlets[0].id }));
      }
      const shiftOutlets = outletPayload.outlets.filter((o) => o.shift_mode === 2);
      if (!shiftForm.outletId && shiftOutlets[0]) {
        setShiftForm((f) => ({ ...f, outletId: shiftOutlets[0].id }));
      }
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Staff di outlet yang dipilih
  const outletStaff = staffList.filter((s) => s.outlet_id === staffForm.outletId);
  const shiftOutlets = outlets.filter((o) => o.shift_mode === 2);

  async function addStaffDayoff(event: React.FormEvent) {
    event.preventDefault();
    if (!staffForm.outletId || !staffForm.staffId || !staffForm.date) {
      setMessage("Outlet, staff, dan tanggal wajib diisi"); setMsgType("err"); return;
    }
    setMessage("Menyimpan libur staff..."); setMsgType("info");
    try {
      const result = await apiFetch<{ ok: true; dayoff: StaffDayoff; coverage: { action: string; staffName?: string; message?: string } }>(
        "/api/admin/staff-dayoff",
        { method: "POST", role: "admin", body: staffForm }
      );
      await load();
      const coverMsg = result.coverage?.action === "auto_assigned_full_shift" || result.coverage?.action === "upgraded_to_full_shift"
        ? ` — ${result.coverage.staffName} otomatis Full Shift sebagai pengganti.`
        : result.coverage?.action === "needs_assignment"
        ? " — Perlu assign pengganti manual."
        : "";
      setMessage(`Libur staff disimpan ✓${coverMsg}`); setMsgType("ok");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    }
  }

  async function cancelStaffDayoff(id: string, staffName: string) {
    if (!window.confirm(`Batalkan libur ${staffName}?`)) return;
    setMessage("Membatalkan libur..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/staff-dayoff", { method: "DELETE", role: "admin", body: { id } });
      await load();
      setMessage("Libur staff dibatalkan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    }
  }

  async function addShiftDayoff(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Menyimpan hari libur shift..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/dayoff", { method: "POST", role: "admin", body: shiftForm });
      await load();
      setMessage("Hari libur shift disimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    }
  }

  async function removeShiftDayoff(id: string) {
    if (!window.confirm("Hapus hari libur shift ini?")) return;
    setMessage("Menghapus..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/dayoff", { method: "DELETE", role: "admin", body: { id } });
      await load();
      setMessage("Hari libur shift dihapus ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    }
  }

  return (
    <AdminPage title="Libur Staff" subtitle="Atur hari libur berdasarkan nama staff atau shift">
      <MsgBar message={message} type={msgType} />

      {/* Tab selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
        {([["staff", "Libur Staff (Baru)"], ["shift", "Libur Shift (Legacy)"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, border: "1.5px solid",
              borderColor: tab === key ? "var(--primary)" : "var(--border)",
              background: tab === key ? "rgba(192,57,43,.06)" : "#fff",
              color: tab === key ? "var(--primary)" : "var(--muted)", cursor: "pointer"
            }}
          >
            {key === "staff" && <CalendarOff size={13} style={{ display: "inline", marginRight: 5 }} />}
            {label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Libur Staff (Baru) ─── */}
      {tab === "staff" && (
        <>
          <AdminSection title="Set Libur Staff" subtitle="Pilih staff dan tanggal libur. Sistem otomatis assign pengganti jika hanya 1 staff tersisa.">
            <form onSubmit={addStaffDayoff}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
                <div>
                  <label className="label">Outlet</label>
                  <select
                    className="field"
                    value={staffForm.outletId}
                    onChange={(e) => setStaffForm({ ...staffForm, outletId: e.target.value, staffId: "" })}
                  >
                    {outlets.length === 0 ? <option value="">Tidak ada outlet</option> : null}
                    {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Staff</label>
                  <select
                    className="field"
                    value={staffForm.staffId}
                    onChange={(e) => setStaffForm({ ...staffForm, staffId: e.target.value })}
                  >
                    <option value="">Pilih staff</option>
                    {outletStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Tanggal</label>
                  <input
                    className="field"
                    type="date"
                    value={staffForm.date}
                    onChange={(e) => setStaffForm({ ...staffForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Alasan (opsional)</label>
                  <input
                    className="field"
                    placeholder="Sakit, keperluan, dll."
                    value={staffForm.reason}
                    onChange={(e) => setStaffForm({ ...staffForm, reason: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}>
                  <Plus size={15} /> Set Libur
                </button>
              </div>
            </form>
          </AdminSection>

          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 13, fontWeight: 800 }}>Daftar Libur Staff ({loading ? "..." : staffDayoffs.length})</h2>
              <button className="btn btn-soft" style={{ fontSize: 11, padding: "6px 10px" }} onClick={load} disabled={loading}>
                <RefreshCw size={12} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
              </button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Outlet</th>
                  <th>Staff</th>
                  <th>Alasan</th>
                  <th>Sumber</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>
                    <RefreshCw size={16} style={{ display: "inline", animation: "spin 1s linear infinite", marginRight: 8 }} />Memuat...
                  </td></tr>
                ) : staffDayoffs.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Tidak ada data libur staff</td></tr>
                ) : staffDayoffs.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateID(row.date)}</td>
                    <td>{outlets.find((o) => o.id === row.outlet_id)?.name || "—"}</td>
                    <td style={{ fontWeight: 700 }}>{row.staff_name}</td>
                    <td>{row.reason || "—"}</td>
                    <td>
                      <span className={`status-pill ${row.source === "admin" ? "status-warn" : "status-ok"}`}>
                        {row.source === "admin" ? "Admin" : row.source === "staff_request" ? "Request Staff" : row.source}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}
                        onClick={() => cancelStaffDayoff(row.id, row.staff_name)}
                      >
                        <Trash2 size={13} /> Batalkan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Tab: Libur Shift (Legacy) ─── */}
      {tab === "shift" && (
        <>
          <AdminSection title="Hari Libur Shift (Legacy)" subtitle="Nonaktifkan shift tertentu untuk outlet 2-shift. Dipertahankan untuk kompatibilitas.">
            <form onSubmit={addShiftDayoff}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
                <div>
                  <label className="label">Outlet (2-shift)</label>
                  <select className="field" value={shiftForm.outletId} onChange={(e) => setShiftForm({ ...shiftForm, outletId: e.target.value })}>
                    {shiftOutlets.length === 0 ? <option value="">Tidak ada outlet 2-shift</option> : null}
                    {shiftOutlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Dari Tanggal</label>
                  <input className="field" type="date" value={shiftForm.dateFrom} onChange={(e) => setShiftForm({ ...shiftForm, dateFrom: e.target.value })} />
                </div>
                <div>
                  <label className="label">Sampai Tanggal (opsional)</label>
                  <input className="field" type="date" value={shiftForm.dateTo} onChange={(e) => setShiftForm({ ...shiftForm, dateTo: e.target.value })} />
                </div>
                <div>
                  <label className="label">Shift</label>
                  <select className="field" value={shiftForm.shift} onChange={(e) => setShiftForm({ ...shiftForm, shift: e.target.value })}>
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

          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 13, fontWeight: 800 }}>Daftar Libur Shift ({loading ? "..." : shiftDayoffs.length})</h2>
              <button className="btn btn-soft" style={{ fontSize: 11, padding: "6px 10px" }} onClick={load} disabled={loading}>
                <RefreshCw size={12} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
              </button>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>Tanggal</th><th>Outlet</th><th>Shift</th><th>Aksi</th></tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>
                    <RefreshCw size={16} style={{ display: "inline", animation: "spin 1s linear infinite", marginRight: 8 }} />Memuat...
                  </td></tr>
                ) : shiftDayoffs.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Tidak ada hari libur shift</td></tr>
                ) : shiftDayoffs.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateID(row.date)}</td>
                    <td>{outlets.find((o) => o.id === row.outlet_id)?.name || row.outlet_id}</td>
                    <td>Shift {row.shift}</td>
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}
                        onClick={() => removeShiftDayoff(row.id)}
                      >
                        <Trash2 size={13} /> Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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
  if (msg.includes("SCHEDULE_LOCKED") || msg.includes("sudah absen"))
    return msg;
  if (msg.includes("kedua shift"))
    return "Tidak bisa meliburkan kedua shift pada tanggal yang sama.";
  return msg || "Terjadi kesalahan. Coba lagi.";
}
