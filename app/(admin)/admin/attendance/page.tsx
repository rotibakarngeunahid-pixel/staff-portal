"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, Pencil, ImageIcon, MapPin, X } from "lucide-react";
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
  selfie_in?: string | null;
  selfie_out?: string | null;
  flags?: string | null;
  revision_note?: string | null;
  late_reason?: string | null;
};
type Staff = { id: string; name: string; outlet_id: string | null; active?: boolean };
type Outlet = { id: string; name: string; shift1_start?: string; shift2_start?: string; shift_mode?: number; active?: boolean };
type BulkEntry = { staffId: string; staffName: string; checked: boolean; checkin_time: string; checkout_time: string };
type BulkResult = { staffId: string; staffName: string; status: "success" | "error"; message?: string };

function parseCheckoutGps(flags?: string | null): { lat: string; lng: string; acc: string } | null {
  if (!flags) return null;
  const seg = flags.split(",").find((f) => f.startsWith("CHECKOUT_GPS:"));
  if (!seg) return null;
  const parts = seg.split(":");
  if (parts.length < 4) return null;
  return { lat: parts[1], lng: parts[2], acc: parts[3] };
}

// ----- Modals ----------------------------------------------------------------

function Overlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
        zIndex: 900, backdropFilter: "blur(2px)"
      }}
    />
  );
}

function isActiveStaff(staff: Staff): boolean {
  return staff.active !== false;
}

function isActiveOutlet(outlet: Outlet): boolean {
  return outlet.active !== false;
}

function staffOptionLabel(staff: Staff): string {
  return isActiveStaff(staff) ? staff.name : `${staff.name} (nonaktif)`;
}

function outletOptionLabel(outlet: Outlet): string {
  return isActiveOutlet(outlet) ? outlet.name : `${outlet.name} (nonaktif)`;
}

function Modal({ title, onClose, children, width = 480 }: {
  title: string; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  return (
    <>
      <Overlay onClose={onClose} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width, maxWidth: "calc(100vw - 32px)", background: "#fff",
        borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,.25)", zIndex: 901,
        maxHeight: "calc(100vh - 48px)", overflowY: "auto"
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border)"
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{title}</h2>
          <button className="btn btn-soft" style={{ padding: "4px 8px" }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </>
  );
}

// ----- Main page -------------------------------------------------------------

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

  // Revise modal
  const [reviseTarget, setReviseTarget] = useState<Attendance | null>(null);
  const [reviseForm, setReviseForm] = useState({ revision_note: "", late_minutes: "", deduction: "", final_salary: "", shift: "", late_reason: "" });
  const [revising, setRevising] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Attendance | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Photo modal
  const [photoTarget, setPhotoTarget] = useState<Attendance | null>(null);

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

  useEffect(() => {
    if (!bulkOutletId) { setBulkEntries([]); return; }
    const filtered = staff.filter((s) => isActiveStaff(s) && s.outlet_id === bulkOutletId);
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

  function openRevise(row: Attendance) {
    setReviseTarget(row);
    setReviseForm({
      revision_note: row.revision_note || "",
      late_minutes: String(row.late_minutes),
      deduction: String(row.deduction),
      final_salary: String(row.final_salary),
      shift: String(row.shift),
      late_reason: row.late_reason || ""
    });
  }

  async function submitRevise(event: React.FormEvent) {
    event.preventDefault();
    if (!reviseTarget) return;
    if (!reviseForm.revision_note.trim()) {
      setMessage("Catatan revisi wajib diisi"); setMsgType("err"); return;
    }
    setRevising(true);
    setMessage("Menyimpan revisi..."); setMsgType("info");
    try {
      const shiftChanged = reviseForm.shift !== "" && Number(reviseForm.shift) !== reviseTarget.shift;
      await apiFetch("/api/admin/attendance", {
        method: "PUT",
        role: "admin",
        body: {
          attendanceId: reviseTarget.id,
          revision_note: reviseForm.revision_note,
          late_reason: reviseForm.late_reason,
          ...(shiftChanged ? { shift: reviseForm.shift } : {
            late_minutes: reviseForm.late_minutes,
            deduction: reviseForm.deduction,
            final_salary: reviseForm.final_salary
          })
        }
      });
      await load();
      setReviseTarget(null);
      setMessage("Revisi tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan revisi"); setMsgType("err");
    } finally {
      setRevising(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setMessage("Menghapus data absen..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/attendance", {
        method: "DELETE",
        role: "admin",
        body: { attendanceId: deleteTarget.id }
      });
      await load();
      setDeleteTarget(null);
      setMessage("Data absen berhasil dihapus ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menghapus"); setMsgType("err");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const selectedOutlet = outlets.find((o) => o.id === bulkOutletId);
  const activeStaff = staff.filter(isActiveStaff);
  const activeOutlets = outlets.filter(isActiveOutlet);
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
                  {activeStaff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Outlet<span style={{ color: "var(--danger)" }}>*</span></label>
                <select className="field" value={manual.outletId} onChange={(e) => setManual({ ...manual, outletId: e.target.value })} required>
                  <option value="">Pilih outlet</option>
                  {activeOutlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label">Tanggal<span style={{ color: "var(--danger)" }}>*</span></label>
                <input className="field" type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} required />
              </div>
              <div>
                <label className="label">Outlet<span style={{ color: "var(--danger)" }}>*</span></label>
                <select className="field" value={bulkOutletId} onChange={(e) => { setBulkOutletId(e.target.value); setBulkResults(null); }} required>
                  <option value="">Pilih outlet</option>
                  {activeOutlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
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

            {bulkShiftHint && (
              <p style={{ fontSize: 12, color: "var(--muted-light)", marginBottom: 10 }}>
                Jam mulai shift: <strong>{bulkShiftHint}</strong> — kosongkan kolom jam masuk untuk pakai jam ini secara otomatis.
              </p>
            )}
            {!bulkOutletId && (
              <p style={{ fontSize: 13, color: "var(--muted-light)", padding: "12px 0" }}>Pilih outlet untuk melihat daftar staff.</p>
            )}
            {bulkOutletId && bulkEntries.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--muted-light)", padding: "12px 0" }}>Tidak ada staff aktif di outlet ini.</p>
            )}

            {bulkEntries.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button type="button" className="btn btn-soft" style={{ fontSize: 12 }}
                    onClick={() => setBulkEntries((prev) => prev.map((e) => ({ ...e, checked: true })))}>
                    Pilih Semua
                  </button>
                  <button type="button" className="btn btn-soft" style={{ fontSize: 12 }}
                    onClick={() => setBulkEntries((prev) => prev.map((e) => ({ ...e, checked: false })))}>
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
                          <tr key={entry.staffId}
                            style={result ? { background: result.status === "success" ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)" } : undefined}>
                            <td>
                              <input type="checkbox" checked={entry.checked}
                                onChange={(e) => setBulkEntries((prev) => prev.map((x, i) => i === idx ? { ...x, checked: e.target.checked } : x))} />
                            </td>
                            <td style={{ fontWeight: 700 }}>{entry.staffName}</td>
                            <td>
                              <input className="field" type="time" value={entry.checkin_time} placeholder="Default shift"
                                onChange={(e) => setBulkEntries((prev) => prev.map((x, i) => i === idx ? { ...x, checkin_time: e.target.value } : x))}
                                style={{ minWidth: 110 }} />
                            </td>
                            <td>
                              <input className="field" type="time" value={entry.checkout_time}
                                onChange={(e) => setBulkEntries((prev) => prev.map((x, i) => i === idx ? { ...x, checkout_time: e.target.value } : x))}
                                style={{ minWidth: 110 }} />
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
              <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}
                disabled={bulkLoading || !bulkOutletId || bulkEntries.filter((e) => e.checked).length === 0}>
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
              {staff.map((item) => <option key={item.id} value={item.id}>{staffOptionLabel(item)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Outlet</label>
            <select className="field" value={filters.outletId} onChange={(e) => setFilters({ ...filters, outletId: e.target.value })}>
              <option value="">Semua outlet</option>
              {outlets.map((item) => <option key={item.id} value={item.id}>{outletOptionLabel(item)}</option>)}
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
                <th>Alasan Terlambat</th>
                <th>Gaji</th>
                <th>Status Bayar</th>
                <th>Foto / GPS</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    {[60, 90, 80, 40, 40, 40, 40, 100, 60, 55, 50, 80].map((w, j) => (
                      <td key={j}><div style={{ height: 12, width: w, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Tidak ada data</td></tr>
              ) : rows.map((row) => {
                const gps = parseCheckoutGps(row.flags);
                const hasSelfie = row.selfie_in || row.selfie_out;
                return (
                  <tr key={row.id}>
                    <td>{formatDateID(row.date)}</td>
                    <td style={{ fontWeight: 700 }}>{row.staff_name}</td>
                    <td>{row.outlet_name}</td>
                    <td>{row.shift === 0 ? "Full" : `S${row.shift}`}</td>
                    <td>{hhmm(row.checkin_time)}</td>
                    <td>{hhmm(row.checkout_time)}</td>
                    <td>{row.late_minutes} mnt</td>
                    <td style={{ maxWidth: 160 }}>
                      {row.status === "late" && row.late_reason ? (
                        <span title={row.late_reason} style={{
                          fontSize: 12, display: "block",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          color: "var(--warning)", fontWeight: 600
                        }}>
                          {row.late_reason}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted-light)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 700 }}>{rupiah(row.final_salary)}</td>
                    <td><span className={`status-pill ${row.paid_status ? "status-ok" : "status-warn"}`}>{row.paid_status ? "Dibayar" : "Belum"}</span></td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {hasSelfie && (
                          <button
                            className="btn btn-soft"
                            style={{ fontSize: 11, padding: "4px 8px", display: "flex", alignItems: "center", gap: 3 }}
                            title="Lihat selfie"
                            onClick={() => setPhotoTarget(row)}
                          >
                            <ImageIcon size={13} /> Foto
                          </button>
                        )}
                        {gps && (
                          <a
                            href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-soft"
                            style={{ fontSize: 11, padding: "4px 8px", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}
                            title={`Akurasi GPS: ±${Number(gps.acc).toFixed(0)}m`}
                          >
                            <MapPin size={13} /> GPS
                          </a>
                        )}
                        {!hasSelfie && !gps && (
                          <span style={{ fontSize: 11, color: "var(--muted-light)" }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-soft"
                          style={{ fontSize: 12, padding: "6px 10px" }}
                          title="Revisi data absen"
                          onClick={() => openRevise(row)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn btn-soft"
                          style={{ fontSize: 12, padding: "6px 10px", color: "var(--danger)" }}
                          title="Hapus absen"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revise Modal */}
      {reviseTarget && (
        <Modal title={`Revisi Absen — ${reviseTarget.staff_name}`} onClose={() => setReviseTarget(null)} width={520}>
          <div style={{ background: "var(--surface-soft)", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <span><strong>Tanggal:</strong> {formatDateID(reviseTarget.date)}</span>
              <span><strong>Shift:</strong> {reviseTarget.shift === 0 ? "Full" : `Shift ${reviseTarget.shift}`}</span>
              <span><strong>Masuk:</strong> {hhmm(reviseTarget.checkin_time) || "—"}</span>
              <span><strong>Pulang:</strong> {hhmm(reviseTarget.checkout_time) || "—"}</span>
            </div>
          </div>
          <form onSubmit={submitRevise}>
            <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label">Catatan Revisi <span style={{ color: "var(--danger)" }}>*</span></label>
                <input
                  className="field"
                  placeholder="Tulis alasan revisi (wajib)"
                  value={reviseForm.revision_note}
                  onChange={(e) => setReviseForm({ ...reviseForm, revision_note: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Koreksi Shift</label>
                <select
                  className="field"
                  value={reviseForm.shift}
                  onChange={(e) => setReviseForm({ ...reviseForm, shift: e.target.value })}
                >
                  <option value="0">Full Shift</option>
                  <option value="1">Shift 1</option>
                  <option value="2">Shift 2</option>
                </select>
                {reviseForm.shift !== "" && Number(reviseForm.shift) !== reviseTarget.shift && (
                  <p style={{ fontSize: 12, color: "#D97706", fontWeight: 600, marginTop: 4 }}>
                    ⚡ Shift akan diubah dari{" "}
                    {reviseTarget.shift === 0 ? "Full" : `Shift ${reviseTarget.shift}`} ke{" "}
                    {Number(reviseForm.shift) === 0 ? "Full" : `Shift ${reviseForm.shift}`}.
                    Menit telat, potongan, dan gaji dihitung ulang otomatis.
                  </p>
                )}
              </div>
              {(reviseForm.shift === "" || Number(reviseForm.shift) === reviseTarget.shift) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="label">Menit Telat</label>
                    <input className="field" type="number" min="0" value={reviseForm.late_minutes}
                      onChange={(e) => setReviseForm({ ...reviseForm, late_minutes: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Potongan (Rp)</label>
                    <input className="field" type="number" min="0" value={reviseForm.deduction}
                      onChange={(e) => setReviseForm({ ...reviseForm, deduction: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Gaji Final (Rp)</label>
                    <input className="field" type="number" min="0" value={reviseForm.final_salary}
                      onChange={(e) => setReviseForm({ ...reviseForm, final_salary: e.target.value })} />
                  </div>
                </div>
              )}
              {(reviseTarget.status === "late" || reviseForm.late_reason) && (
                <div>
                  <label className="label">Alasan Terlambat</label>
                  <input
                    className="field"
                    placeholder="Alasan keterlambatan (opsional untuk admin)"
                    value={reviseForm.late_reason}
                    onChange={(e) => setReviseForm({ ...reviseForm, late_reason: e.target.value })}
                    maxLength={500}
                  />
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }} disabled={revising}>
                {revising ? "Menyimpan..." : "Simpan Revisi"}
              </button>
              <button type="button" className="btn btn-soft" onClick={() => setReviseTarget(null)}>Batal</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <Modal title="Hapus Data Absen?" onClose={() => setDeleteTarget(null)} width={440}>
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 14, marginBottom: 10 }}>
              Anda akan menghapus absen <strong>{deleteTarget.staff_name}</strong> pada{" "}
              <strong>{formatDateID(deleteTarget.date)}</strong> (Shift {deleteTarget.shift === 0 ? "Full" : deleteTarget.shift}).
            </p>
            <div style={{
              background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.25)",
              borderRadius: 10, padding: "12px 14px", fontSize: 13
            }}>
              <strong style={{ color: "var(--danger)" }}>Perhatian:</strong>
              <ul style={{ margin: "6px 0 0 16px", padding: 0, lineHeight: 1.7 }}>
                <li>Data absen akan hilang permanen dan tidak bisa dikembalikan.</li>
                <li>Rekap gaji untuk tanggal ini akan berubah.</li>
                {deleteTarget.paid_status && (
                  <li style={{ color: "var(--danger)", fontWeight: 700 }}>
                    Absen ini sudah ditandai DIBAYAR — hapus dapat menyebabkan selisih pembayaran.
                  </li>
                )}
              </ul>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 13, background: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Menghapus..." : "Ya, Hapus"}
            </button>
            <button className="btn btn-soft" onClick={() => setDeleteTarget(null)}>Batal</button>
          </div>
        </Modal>
      )}

      {/* Photo Preview Modal */}
      {photoTarget && (
        <Modal title={`Selfie — ${photoTarget.staff_name}`} onClose={() => setPhotoTarget(null)} width={600}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-light)", marginBottom: 8 }}>SELFIE MASUK</p>
              {photoTarget.selfie_in ? (
                <a href={photoTarget.selfie_in} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoTarget.selfie_in}
                    alt="Selfie masuk"
                    style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer" }}
                  />
                </a>
              ) : (
                <div style={{ background: "var(--surface-soft)", borderRadius: 10, padding: 32, textAlign: "center", fontSize: 12, color: "var(--muted-light)" }}>
                  Tidak ada foto
                </div>
              )}
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-light)", marginBottom: 8 }}>SELFIE PULANG</p>
              {photoTarget.selfie_out ? (
                <a href={photoTarget.selfie_out} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoTarget.selfie_out}
                    alt="Selfie pulang"
                    style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer" }}
                  />
                </a>
              ) : (
                <div style={{ background: "var(--surface-soft)", borderRadius: 10, padding: 32, textAlign: "center", fontSize: 12, color: "var(--muted-light)" }}>
                  Tidak ada foto
                </div>
              )}
            </div>
          </div>
          {(() => {
            const gps = parseCheckoutGps(photoTarget.flags);
            if (!gps) return null;
            return (
              <div style={{ marginTop: 16, padding: "10px 14px", background: "var(--surface-soft)", borderRadius: 10, fontSize: 13 }}>
                <strong>GPS Pulang:</strong> {gps.lat}, {gps.lng}{" "}
                <span style={{ color: "var(--muted-light)" }}>(akurasi ±{Number(gps.acc).toFixed(0)}m)</span>{" "}
                <a
                  href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "var(--primary)", marginLeft: 6 }}
                >
                  Buka di Maps ↗
                </a>
              </div>
            );
          })()}
        </Modal>
      )}
    </AdminPage>
  );
}
