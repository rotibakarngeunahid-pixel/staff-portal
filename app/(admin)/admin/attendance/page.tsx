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
type Outlet = { id: string; name: string; shift1_start?: string; shift2_start?: string; shift_mode?: number };
type BulkEntry = { staffId: string; staffName: string; checked: boolean; checkin_time: string; checkout_time: string };
type BulkResult = { staffId: string; staffName: string; status: "success" | "error"; message?: string };

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

  const [showBulk, setShowBulk] = useState(false);
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkOutletId, setBulkOutletId] = useState("");
  const [bulkShift, setBulkShift] = useState("0");
  const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);

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

  // Rebuild bulk entry list whenever outlet selection or staff list changes
  useEffect(() => {
    if (!bulkOutletId) { setBulkEntries([]); return; }
    const filtered = staff.filter((s) => s.outlet_id === bulkOutletId);
    setBulkEntries(filtered.map((s) => ({ staffId: s.id, staffName: s.name, checked: true, checkin_time: "", checkout_time: "" })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkOutletId, staff]);

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

  async function submitBulk(event: React.FormEvent) {
    event.preventDefault();
    if (!bulkOutletId) { setMessage("Pilih outlet terlebih dahulu"); setMsgType("err"); return; }
    const selected = bulkEntries.filter((e) => e.checked);
    if (selected.length === 0) { setMessage("Pilih minimal 1 staff"); setMsgType("err"); return; }
    setBulkLoading(true);
    setMessage("Menyimpan absen bulk..."); setMsgType("info");
    try {
      const entries = selected.map((e) => ({
        staffId: e.staffId,
        outletId: bulkOutletId,
        date: bulkDate,
        shift: Number(bulkShift),
        ...(e.checkin_time ? { checkin_time: e.checkin_time } : {}),
        ...(e.checkout_time ? { checkout_time: e.checkout_time } : {})
      }));
      const result = await apiFetch<{ ok: true; results: BulkResult[]; successCount: number; errorCount: number }>(
        "/api/admin/attendance/bulk",
        { method: "POST", role: "admin", body: { entries } }
      );
      setBulkResults(result.results);
      await load();
      setMessage(`Berhasil disimpan: ${result.successCount} absen${result.errorCount > 0 ? ` | Gagal: ${result.errorCount}` : ""}`);
      setMsgType(result.errorCount > 0 ? "err" : "ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal"); setMsgType("err");
    } finally {
      setBulkLoading(false);
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

  const selectedOutlet = outlets.find((o) => o.id === bulkOutletId);
  const bulkShiftHint = selectedOutlet
    ? (Number(bulkShift) === 2 ? selectedOutlet.shift2_start : selectedOutlet.shift1_start) || "-"
    : null;

  return (
    <AdminPage
      title="Data Absensi"
      subtitle="Filter, absen manual, dan revisi gaji"
      action={
        !showManual && !showBulk ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowManual(true)}>
              <Plus size={15} /> Absen Manual
            </button>
            <button className="btn btn-soft" style={{ fontSize: 13 }} onClick={() => { setShowBulk(true); setBulkResults(null); }}>
              <Plus size={15} /> Absen Bulk
            </button>
          </div>
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

      {/* Bulk entry form */}
      {showBulk ? (
        <AdminSection title="Absen Manual Bulk">
          <form onSubmit={submitBulk}>
            {/* Common settings */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label">Tanggal<span style={{ color: "var(--danger)" }}>*</span></label>
                <input className="field" type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} required />
              </div>
              <div>
                <label className="label">Outlet<span style={{ color: "var(--danger)" }}>*</span></label>
                <select className="field" value={bulkOutletId} onChange={(e) => { setBulkOutletId(e.target.value); setBulkResults(null); }} required>
                  <option value="">Pilih outlet</option>
                  {outlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Shift</label>
                <select className="field" value={bulkShift} onChange={(e) => setBulkShift(e.target.value)}>
                  <option value="0">Full</option>
                  <option value="1">Shift 1</option>
                  <option value="2">Shift 2</option>
                </select>
              </div>
            </div>

            {/* Hint */}
            {bulkShiftHint && (
              <p style={{ fontSize: 12, color: "var(--muted-light)", marginBottom: 10 }}>
                Jam mulai shift: <strong>{bulkShiftHint}</strong> — kosongkan kolom jam masuk untuk pakai jam ini secara otomatis.
              </p>
            )}

            {/* Placeholder when no outlet selected */}
            {!bulkOutletId && (
              <p style={{ fontSize: 13, color: "var(--muted-light)", padding: "12px 0" }}>Pilih outlet untuk melihat daftar staff.</p>
            )}

            {/* Empty outlet */}
            {bulkOutletId && bulkEntries.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--muted-light)", padding: "12px 0" }}>Tidak ada staff aktif di outlet ini.</p>
            )}

            {/* Staff table */}
            {bulkEntries.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button
                    type="button" className="btn btn-soft" style={{ fontSize: 12 }}
                    onClick={() => setBulkEntries((prev) => prev.map((e) => ({ ...e, checked: true })))}
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button" className="btn btn-soft" style={{ fontSize: 12 }}
                    onClick={() => setBulkEntries((prev) => prev.map((e) => ({ ...e, checked: false })))}
                  >
                    Batalkan Semua
                  </button>
                  <span style={{ fontSize: 12, color: "var(--muted-light)", marginLeft: 4, alignSelf: "center" }}>
                    {bulkEntries.filter((e) => e.checked).length} dari {bulkEntries.length} staff dipilih
                  </span>
                </div>
                <div style={{ overflowX: "auto", marginBottom: 14 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}></th>
                        <th>Nama Staff</th>
                        <th>Jam Masuk</th>
                        <th>Jam Pulang</th>
                        {bulkResults && <th>Hasil</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {bulkEntries.map((entry, idx) => {
                        const result = bulkResults?.find((r) => r.staffId === entry.staffId);
                        return (
                          <tr
                            key={entry.staffId}
                            style={
                              result
                                ? { background: result.status === "success" ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)" }
                                : undefined
                            }
                          >
                            <td>
                              <input
                                type="checkbox"
                                checked={entry.checked}
                                onChange={(e) =>
                                  setBulkEntries((prev) => prev.map((x, i) => i === idx ? { ...x, checked: e.target.checked } : x))
                                }
                              />
                            </td>
                            <td style={{ fontWeight: 700 }}>{entry.staffName}</td>
                            <td>
                              <input
                                className="field"
                                type="time"
                                value={entry.checkin_time}
                                placeholder="Default shift"
                                onChange={(e) =>
                                  setBulkEntries((prev) => prev.map((x, i) => i === idx ? { ...x, checkin_time: e.target.value } : x))
                                }
                                style={{ minWidth: 110 }}
                              />
                            </td>
                            <td>
                              <input
                                className="field"
                                type="time"
                                value={entry.checkout_time}
                                onChange={(e) =>
                                  setBulkEntries((prev) => prev.map((x, i) => i === idx ? { ...x, checkout_time: e.target.value } : x))
                                }
                                style={{ minWidth: 110 }}
                              />
                            </td>
                            {bulkResults && (
                              <td style={{ fontSize: 12, fontWeight: 600, color: result?.status === "success" ? "var(--success)" : "var(--danger)" }}>
                                {result ? (result.status === "success" ? "✓ Tersimpan" : `✗ ${result.message || "Gagal"}`) : "-"}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ fontSize: 13 }}
                disabled={bulkLoading || !bulkOutletId || bulkEntries.filter((e) => e.checked).length === 0}
              >
                <Plus size={15} />
                {bulkLoading ? "Menyimpan..." : `Simpan ${bulkEntries.filter((e) => e.checked).length} Absen`}
              </button>
              <button type="button" className="btn btn-soft" onClick={() => { setShowBulk(false); setBulkResults(null); }}>
                Batal
              </button>
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
