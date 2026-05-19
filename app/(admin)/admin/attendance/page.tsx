"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID, hhmm, rupiah } from "@/lib/format";

type Attendance = {
  id: string;
  staff_id: string;
  staff_name: string;
  outlet_id: string;
  outlet_name: string;
  date: string;
  shift: number;
  checkin_time: string | null;
  checkout_time: string | null;
  late_minutes: number;
  deduction: number;
  final_salary: number;
  paid_status: boolean;
  status: string;
};
type Staff = { id: string; name: string; outlet_id: string | null };
type Outlet = { id: string; name: string };

export default function AdminAttendancePage() {
  const [rows, setRows] = useState<Attendance[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", staffId: "", outletId: "", status: "" });
  const [manual, setManual] = useState({ staffId: "", outletId: "", date: new Date().toISOString().slice(0, 10), shift: "0", checkin_time: "09:00", checkout_time: "" });
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [showManual, setShowManual] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [attPayload, staffPayload, outletPayload] = await Promise.all([
        apiFetch<{ ok: true; attendance: Attendance[] }>("/api/admin/attendance", { role: "admin", body: filters }),
        apiFetch<{ ok: true; staff: Staff[] }>("/api/admin/staff", { role: "admin" }),
        apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" })
      ]);
      setRows(attPayload.attendance);
      setStaff(staffPayload.staff);
      setOutlets(outletPayload.outlets);
    } catch (err) {
      setMessage((err as Error).message);
      setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addManual(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Menyimpan absen manual..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/attendance", { method: "POST", role: "admin", body: manual });
      await load();
      setShowManual(false);
      setMessage("Absen manual tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal"); setMsgType("err");
    }
  }

  async function revise(row: Attendance) {
    const note = window.prompt("Catatan revisi wajib diisi");
    if (!note) return;
    const late = window.prompt("Menit terlambat", String(row.late_minutes));
    const deduction = window.prompt("Potongan", String(row.deduction));
    const finalSalary = window.prompt("Gaji final", String(row.final_salary));
    setMessage("Menyimpan revisi..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/attendance", {
        method: "PUT",
        role: "admin",
        body: { attendanceId: row.id, revision_note: note, late_minutes: late, deduction, final_salary: finalSalary }
      });
      await load();
      setMessage("Revisi tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan revisi"); setMsgType("err");
    }
  }

  return (
    <AdminPage
      title="Data Absensi"
      subtitle="Filter, absen manual, dan revisi gaji"
      action={
        !showManual ? (
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowManual(true)}>
            <Plus size={15} /> Absen Manual
          </button>
        ) : null
      }
    >
      <MsgBar message={message} type={msgType} />

      {/* Manual entry form */}
      {showManual ? (
        <AdminSection title="Tambah Absen Manual">
          <form onSubmit={addManual}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label className="label">Staff<span style={{ color: "var(--danger)" }}>*</span></label>
                <select className="field" value={manual.staffId} onChange={(e) => setManual({ ...manual, staffId: e.target.value })} required>
                  <option value="">Pilih staff</option>
                  {staff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Outlet<span style={{ color: "var(--danger)" }}>*</span></label>
                <select className="field" value={manual.outletId} onChange={(e) => setManual({ ...manual, outletId: e.target.value })} required>
                  <option value="">Pilih outlet</option>
                  {outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Tanggal</label>
                <input className="field" type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
              </div>
              <div>
                <label className="label">Shift</label>
                <select className="field" value={manual.shift} onChange={(e) => setManual({ ...manual, shift: e.target.value })}>
                  <option value="0">Full</option>
                  <option value="1">Shift 1</option>
                  <option value="2">Shift 2</option>
                </select>
              </div>
              <div>
                <label className="label">Jam Masuk</label>
                <input className="field" type="time" value={manual.checkin_time} onChange={(e) => setManual({ ...manual, checkin_time: e.target.value })} />
              </div>
              <div>
                <label className="label">Jam Pulang (opsional)</label>
                <input className="field" type="time" value={manual.checkout_time} onChange={(e) => setManual({ ...manual, checkout_time: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}>
                <Plus size={15} /> Tambah Absen
              </button>
              <button type="button" className="btn btn-soft" onClick={() => setShowManual(false)}>Batal</button>
            </div>
          </form>
        </AdminSection>
      ) : null}

      {/* Filters */}
      <AdminSection title="Filter Data">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label className="label">Dari Tanggal</label>
            <input className="field" type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
          </div>
          <div>
            <label className="label">Sampai Tanggal</label>
            <input className="field" type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
          </div>
          <div>
            <label className="label">Staff</label>
            <select className="field" value={filters.staffId} onChange={(e) => setFilters({ ...filters, staffId: e.target.value })}>
              <option value="">Semua staff</option>
              {staff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Outlet</label>
            <select className="field" value={filters.outletId} onChange={(e) => setFilters({ ...filters, outletId: e.target.value })}>
              <option value="">Semua outlet</option>
              {outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Semua status</option>
              <option value="present">Hadir</option>
              <option value="late">Terlambat</option>
              <option value="absent">Absen</option>
              <option value="off">Off</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 13, alignSelf: "flex-end" }} onClick={load}>
            <RefreshCw size={14} /> Filter
          </button>
        </div>
      </AdminSection>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)" }}>
          <h2 style={{ fontSize: 13, fontWeight: 800 }}>Hasil ({rows.length} data)</h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Staff</th>
                <th>Outlet</th>
                <th>Shift</th>
                <th>Masuk</th>
                <th>Pulang</th>
                <th>Telat</th>
                <th>Gaji</th>
                <th>Status Bayar</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    {[60, 90, 80, 40, 40, 40, 40, 60, 55, 40].map((w, j) => (
                      <td key={j}><div style={{ height: 12, width: w, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Tidak ada data</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateID(row.date)}</td>
                  <td style={{ fontWeight: 700 }}>{row.staff_name}</td>
                  <td>{row.outlet_name}</td>
                  <td>{row.shift === 0 ? "Full" : `S${row.shift}`}</td>
                  <td>{hhmm(row.checkin_time)}</td>
                  <td>{hhmm(row.checkout_time)}</td>
                  <td>{row.late_minutes} mnt</td>
                  <td style={{ fontWeight: 700 }}>{rupiah(row.final_salary)}</td>
                  <td><span className={`status-pill ${row.paid_status ? "status-ok" : "status-warn"}`}>{row.paid_status ? "Dibayar" : "Belum"}</span></td>
                  <td>
                    <button className="btn btn-soft" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => revise(row)}>Revisi</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPage>
  );
}
