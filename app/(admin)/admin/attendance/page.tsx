"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy, hhmm, rupiah } from "@/lib/format";

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

  async function load() {
    const [attPayload, staffPayload, outletPayload] = await Promise.all([
      apiFetch<{ ok: true; attendance: Attendance[] }>("/api/admin/attendance", { role: "admin", body: filters }),
      apiFetch<{ ok: true; staff: Staff[] }>("/api/admin/staff", { role: "admin" }),
      apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" })
    ]);
    setRows(attPayload.attendance);
    setStaff(staffPayload.staff);
    setOutlets(outletPayload.outlets);
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addManual(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Menyimpan absen manual...");
    try {
      await apiFetch("/api/admin/attendance", { method: "POST", role: "admin", body: manual });
      await load();
      setMessage("Absen manual tersimpan");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal");
    }
  }

  async function revise(row: Attendance) {
    const note = window.prompt("Catatan revisi wajib diisi");
    if (!note) return;
    const late = window.prompt("Menit terlambat", String(row.late_minutes));
    const deduction = window.prompt("Potongan", String(row.deduction));
    const finalSalary = window.prompt("Gaji final", String(row.final_salary));
    await apiFetch("/api/admin/attendance", {
      method: "PUT",
      role: "admin",
      body: {
        attendanceId: row.id,
        revision_note: note,
        late_minutes: late,
        deduction,
        final_salary: finalSalary
      }
    });
    await load();
  }

  return (
    <AdminPage title="Data Absensi" subtitle="Filter, absen manual, dan revisi gaji">
      <section className="panel mb-5 grid gap-3 p-4 md:grid-cols-6">
        <input className="field" type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
        <input className="field" type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
        <select className="field" value={filters.staffId} onChange={(e) => setFilters({ ...filters, staffId: e.target.value })}>
          <option value="">Semua staff</option>
          {staff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="field" value={filters.outletId} onChange={(e) => setFilters({ ...filters, outletId: e.target.value })}>
          <option value="">Semua outlet</option>
          {outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Semua status</option>
          <option value="present">Hadir</option>
          <option value="late">Terlambat</option>
          <option value="absent">Absen</option>
          <option value="off">Off</option>
        </select>
        <button className="btn btn-primary" onClick={load}>Filter</button>
      </section>

      <form className="panel mb-5 grid gap-3 p-4 md:grid-cols-6" onSubmit={addManual}>
        <select className="field" value={manual.staffId} onChange={(e) => setManual({ ...manual, staffId: e.target.value })} required>
          <option value="">Staff</option>
          {staff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="field" value={manual.outletId} onChange={(e) => setManual({ ...manual, outletId: e.target.value })} required>
          <option value="">Outlet</option>
          {outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <input className="field" type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
        <select className="field" value={manual.shift} onChange={(e) => setManual({ ...manual, shift: e.target.value })}>
          <option value="0">Full</option>
          <option value="1">Shift 1</option>
          <option value="2">Shift 2</option>
        </select>
        <input className="field" type="time" value={manual.checkin_time} onChange={(e) => setManual({ ...manual, checkin_time: e.target.value })} />
        <button className="btn btn-primary">Tambah Manual</button>
      </form>
      <p className="mb-3 text-sm font-bold text-slate-500">{message}</p>

      <section className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Tanggal</th><th>Staff</th><th>Outlet</th><th>Shift</th><th>Masuk</th><th>Pulang</th><th>Telat</th><th>Gaji</th><th>Status Bayar</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{ddmmyyyy(row.date)}</td>
                <td className="font-bold">{row.staff_name}</td>
                <td>{row.outlet_name}</td>
                <td>{row.shift === 0 ? "Full" : row.shift}</td>
                <td>{hhmm(row.checkin_time)}</td>
                <td>{hhmm(row.checkout_time)}</td>
                <td>{row.late_minutes} mnt</td>
                <td>{rupiah(row.final_salary)}</td>
                <td><span className={`status-pill ${row.paid_status ? "status-ok" : "status-warn"}`}>{row.paid_status ? "Dibayar" : "Belum"}</span></td>
                <td><button className="btn btn-soft min-h-9 px-3 text-xs" onClick={() => revise(row)}>Revisi</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminPage>
  );
}
