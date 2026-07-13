"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, Pencil, ImageIcon, MapPin, X, Clock, Ban, CheckCircle2 } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID, hhmm, rupiah } from "@/lib/format";
import { isIncompleteUnpaid } from "@/lib/payroll";

type EarlyCheckoutPermission = {
  id: string;
  attendance_id: string;
  status: "active" | "used" | "cancelled" | "expired";
  reason: string;
  note: string | null;
  created_at: string;
  used_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};
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
  early_checkout_permission?: EarlyCheckoutPermission | null;
};
type Staff = { id: string; name: string; outlet_id: string | null; active?: boolean };
type Outlet = {
  id: string;
  name: string;
  shift1_start?: string;
  shift1_end?: string;
  shift2_start?: string;
  shift2_end?: string;
  shift_mode?: number;
  active?: boolean;
};
type BulkEntry = { staffId: string; staffName: string; checked: boolean; checkin_time: string; checkout_time: string };
type BulkResult = { staffId: string; staffName: string; status: "success" | "error"; message?: string };
type InventoryOverride = { outletId: string | null; date: string | null; by: string; reason: string; at: string };

/** Tanggal hari ini menurut jam bisnis WITA — toISOString() (UTC) bisa mundur 1 hari sebelum 08:00 WITA */
function todayWita(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
}

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
  const [manual, setManual] = useState({ staffId: "", outletId: "", date: todayWita(), shift: "0", checkin_time: "09:00", checkout_time: "" });
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [showManual, setShowManual] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showBulk, setShowBulk] = useState(false);
  const [bulkDate, setBulkDate] = useState(todayWita());
  const [bulkOutletId, setBulkOutletId] = useState("");
  const [bulkShift, setBulkShift] = useState("0");
  const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);

  // Revise modal
  const [reviseTarget, setReviseTarget] = useState<Attendance | null>(null);
  const [reviseForm, setReviseForm] = useState({ revision_note: "", late_minutes: "", deduction: "", final_salary: "", shift: "", late_reason: "", checkin_time: "", checkout_time: "" });
  const [revising, setRevising] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Attendance | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Maafkan keterlambatan (one-click, hapus potongan + kembalikan gaji penuh)
  const [forgivingId, setForgivingId] = useState<string | null>(null);

  // Photo modal
  const [photoTarget, setPhotoTarget] = useState<Attendance | null>(null);

  // Izin pulang awal modal
  const [earlyTarget, setEarlyTarget] = useState<Attendance | null>(null);
  const [earlyForm, setEarlyForm] = useState({ reason: "", note: "" });
  const [earlySaving, setEarlySaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Attendance | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  // Izin darurat inventori (dipakai saat sistem inventori down/timeout)
  const [invOverrides, setInvOverrides] = useState<InventoryOverride[]>([]);
  const [invForm, setInvForm] = useState({ outletId: "", date: todayWita(), reason: "" });
  const [invSaving, setInvSaving] = useState(false);

  async function loadInventoryOverrides() {
    try {
      const res = await apiFetch<{ ok: true; overrides: InventoryOverride[] }>(
        "/api/admin/inventory-override", { role: "admin" }
      );
      setInvOverrides(res.overrides);
    } catch {
      // non-blocking: daftar izin gagal dimuat tidak menghentikan halaman
    }
  }

  async function grantInventoryOverride() {
    if (invSaving) return; // anti double-submit
    if (!invForm.outletId) { setMessage("Pilih outlet untuk izin darurat inventori"); setMsgType("err"); return; }
    if (invForm.reason.trim().length < 5) { setMessage("Alasan izin darurat wajib diisi minimal 5 karakter"); setMsgType("err"); return; }
    setInvSaving(true);
    setMessage("Menyimpan izin darurat inventori..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/inventory-override", {
        role: "admin", method: "POST",
        body: { outletId: invForm.outletId, date: invForm.date, reason: invForm.reason.trim() }
      });
      setMessage("Izin darurat inventori diberikan ✓ — staff outlet ini bisa tutup toko & absen keluar tanpa verifikasi inventori untuk tanggal tersebut"); setMsgType("ok");
      setInvForm({ ...invForm, reason: "" });
      await loadInventoryOverrides();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memberi izin darurat"); setMsgType("err");
    } finally {
      setInvSaving(false);
    }
  }

  async function revokeInventoryOverride(outletId: string, date: string) {
    if (invSaving) return; // anti double-submit
    setInvSaving(true);
    setMessage("Mencabut izin darurat inventori..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/inventory-override", {
        role: "admin", method: "DELETE", body: { outletId, date }
      });
      setMessage("Izin darurat inventori dicabut ✓"); setMsgType("ok");
      await loadInventoryOverrides();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal mencabut izin"); setMsgType("err");
    } finally {
      setInvSaving(false);
    }
  }

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
      await loadInventoryOverrides();
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
    if (manualSaving) return;
    setManualSaving(true);
    setMessage("Menyimpan absen manual..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/attendance", { method: "POST", role: "admin", body: manual });
      await load();
      setShowManual(false);
      setMessage("Absen manual tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal"); setMsgType("err");
    } finally {
      setManualSaving(false);
    }
  }

  async function submitBulk(event: React.FormEvent) {
    event.preventDefault();
    if (bulkLoading) return; // anti double-submit
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
      late_reason: row.late_reason || "",
      checkin_time: "",
      checkout_time: ""
    });
  }

  async function submitRevise(event: React.FormEvent) {
    event.preventDefault();
    if (!reviseTarget || revising) return; // anti double-submit
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
          }),
          ...(reviseForm.checkin_time ? { checkin_time: reviseForm.checkin_time } : {}),
          ...(reviseForm.checkout_time ? { checkout_time: reviseForm.checkout_time } : {})
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
    if (!deleteTarget || deleting) return; // anti double-submit
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

  /** Jam pulang default saat "Maafkan" mengisi checkout yang hilang — asumsikan staff
   * bekerja sampai jadwal jam pulang shift-nya. Backend menggeser +1 hari otomatis
   * kalau hasilnya jatuh sebelum/​sama dengan checkin (shift yang lewat tengah malam). */
  function scheduledCheckoutTime(row: Attendance): string | null {
    const outlet = outlets.find((o) => o.id === row.outlet_id);
    if (!outlet) return null;
    // Outlet 1-shift: shift selalu tersimpan sebagai 0 tapi itu satu-satunya shift
    // (bukan "full shift" 2x yang menutup shift1+shift2), jadi selalu pakai shift1_end.
    const end = outlet.shift_mode === 1
      ? outlet.shift1_end
      : (row.shift === 2 || row.shift === 0) ? outlet.shift2_end : outlet.shift1_end;
    return end ? end.slice(0, 5) : null;
  }

  /**
   * Maafkan sekali klik: menutup dua masalah absensi yang bikin gaji tidak dibayar—
   * (1) keterlambatan → hapus late_minutes & potongan, kembalikan gaji ke nominal
   * penuh; (2) absen keluar tidak tercatat → isi checkout sesuai jadwal jam pulang
   * shift. Kombinasi kedua kondisi ditangani sekaligus dalam satu klik. Dipakai saat
   * kendalanya bisa dimaafkan (mis. macet parah, lupa tap checkout) — tanpa perlu
   * buka modal Revisi.
   */
  async function forgiveLate(row: Attendance) {
    if (forgivingId) return; // anti double-submit
    const needsLateFix = row.late_minutes > 0;
    const needsCheckoutFix = Boolean(row.checkin_time) && !row.checkout_time;
    if (!needsLateFix && !needsCheckoutFix) return;

    const checkoutTime = needsCheckoutFix ? scheduledCheckoutTime(row) : null;
    if (needsCheckoutFix && !checkoutTime) {
      setMessage("Jam pulang outlet belum diatur — isi checkout lewat Revisi manual"); setMsgType("err");
      return;
    }

    const parts: string[] = [];
    if (needsLateFix) {
      parts.push(`Potongan ${rupiah(row.deduction)} (telat ${row.late_minutes} menit) dihapus, gaji kembali penuh menjadi ${rupiah(row.final_salary + row.deduction)}.`);
    }
    if (needsCheckoutFix && checkoutTime) {
      parts.push(`Absen keluar diisi otomatis pukul ${checkoutTime} (jadwal jam pulang shift) sehingga shift ini terhitung dibayar.`);
    }
    const ok = window.confirm(
      `Maafkan absen ${row.staff_name} pada ${formatDateID(row.date)}?\n\n${parts.join("\n")}`
    );
    if (!ok) return;

    setForgivingId(row.id);
    setMessage("Memaafkan absen..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/attendance", {
        method: "PUT",
        role: "admin",
        body: {
          attendanceId: row.id,
          revision_note: [
            needsLateFix ? "Keterlambatan dimaafkan — potongan dihapus, gaji dikembalikan penuh" : null,
            needsCheckoutFix ? "Absen keluar tidak tercatat — checkout diisi sesuai jadwal jam pulang shift" : null
          ].filter(Boolean).join(". "),
          ...(needsLateFix ? { late_minutes: "0", deduction: "0", final_salary: String(row.final_salary + row.deduction), status: "present" } : {}),
          ...(needsCheckoutFix && checkoutTime ? { checkout_time: checkoutTime } : {})
        }
      });
      await load();
      setMessage("Absen dimaafkan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memaafkan absen"); setMsgType("err");
    } finally {
      setForgivingId(null);
    }
  }

  function openEarly(row: Attendance) {
    setEarlyTarget(row);
    setEarlyForm({ reason: "", note: "" });
  }

  async function submitEarly(event: React.FormEvent) {
    event.preventDefault();
    if (!earlyTarget || earlySaving) return; // anti double-submit
    if (earlyForm.reason.trim().length < 5) {
      setMessage("Alasan izin wajib diisi minimal 5 karakter"); setMsgType("err"); return;
    }
    setEarlySaving(true);
    setMessage("Menyimpan izin pulang awal..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/early-checkout", {
        method: "POST",
        role: "admin",
        body: { attendanceId: earlyTarget.id, reason: earlyForm.reason.trim(), note: earlyForm.note.trim() }
      });
      await load();
      setEarlyTarget(null);
      setMessage("Izin pulang awal tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan izin"); setMsgType("err");
    } finally {
      setEarlySaving(false);
    }
  }

  function openCancel(row: Attendance) {
    setCancelTarget(row);
    setCancelReason("");
  }

  async function submitCancel(event: React.FormEvent) {
    event.preventDefault();
    if (!cancelTarget?.early_checkout_permission || cancelSaving) return; // anti double-submit
    if (cancelReason.trim().length < 5) {
      setMessage("Alasan pembatalan wajib diisi minimal 5 karakter"); setMsgType("err"); return;
    }
    setCancelSaving(true);
    setMessage("Membatalkan izin..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/early-checkout", {
        method: "PUT",
        role: "admin",
        body: { permissionId: cancelTarget.early_checkout_permission.id, action: "cancel", cancelReason: cancelReason.trim() }
      });
      await load();
      setCancelTarget(null);
      setMessage("Izin pulang awal dibatalkan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal membatalkan izin"); setMsgType("err");
    } finally {
      setCancelSaving(false);
    }
  }

  const selectedOutlet = outlets.find((o) => o.id === bulkOutletId);
  const activeStaff = staff.filter(isActiveStaff);
  const activeOutlets = outlets.filter(isActiveOutlet);
  const bulkShiftHint = selectedOutlet
    ? (Number(bulkShift) === 2 ? selectedOutlet.shift2_start : selectedOutlet.shift1_start) || "-"
    : null;

  const today = todayWita();
  const incompleteRows = rows.filter((row) => isIncompleteUnpaid(row, today));
  const incompleteCount = incompleteRows.length;
  const incompleteTotal = incompleteRows.reduce((sum, row) => sum + (row.final_salary || 0), 0);

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
              <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }} disabled={manualSaving}>
                <Plus size={15} /> {manualSaving ? "Menyimpan..." : "Tambah Absen"}
              </button>
              <button type="button" className="btn btn-soft" onClick={() => setShowManual(false)} disabled={manualSaving}>Batal</button>
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
                            <td data-label="Pilih">
                              <input type="checkbox" checked={entry.checked}
                                onChange={(e) => setBulkEntries((prev) => prev.map((x, i) => i === idx ? { ...x, checked: e.target.checked } : x))} />
                            </td>
                            <td data-label="Nama Staff" style={{ fontWeight: 700 }}>{entry.staffName}</td>
                            <td data-label="Jam Masuk">
                              <input className="field" type="time" value={entry.checkin_time} placeholder="Default shift"
                                onChange={(e) => setBulkEntries((prev) => prev.map((x, i) => i === idx ? { ...x, checkin_time: e.target.value } : x))}
                                style={{ minWidth: 110 }} />
                            </td>
                            <td data-label="Jam Pulang">
                              <input className="field" type="time" value={entry.checkout_time}
                                onChange={(e) => setBulkEntries((prev) => prev.map((x, i) => i === idx ? { ...x, checkout_time: e.target.value } : x))}
                                style={{ minWidth: 110 }} />
                            </td>
                            {bulkResults && (
                              <td data-label="Hasil" style={{ fontSize: 12, fontWeight: 600, color: result?.status === "success" ? "var(--success)" : "var(--danger)" }}>
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
          <button className="btn btn-primary" style={{ fontSize: 13, alignSelf: "flex-end" }} onClick={load} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> {loading ? "Memuat..." : "Filter"}
          </button>
        </div>
      </AdminSection>

      {/* Izin Darurat Inventori — dipakai HANYA saat sistem inventori benar-benar down/timeout */}
      <AdminSection title="🆘 Izin Darurat Inventori">
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.6 }}>
          Normalnya staff <strong>tidak bisa</strong> tutup toko / absen keluar sebelum laporan inventori selesai.
          Gunakan tombol ini <strong>hanya saat sistem inventori bermasalah</strong> (down / timeout) agar staff tetap
          bisa menutup toko. Izin berlaku per outlet untuk tanggal yang dipilih dan tercatat di audit log.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label className="label">Outlet<span style={{ color: "var(--danger)" }}>*</span></label>
            <select className="field" value={invForm.outletId} onChange={(e) => setInvForm({ ...invForm, outletId: e.target.value })}>
              <option value="">Pilih outlet</option>
              {activeOutlets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tanggal</label>
            <input className="field" type="date" value={invForm.date} onChange={(e) => setInvForm({ ...invForm, date: e.target.value })} />
          </div>
          <div>
            <label className="label">Alasan<span style={{ color: "var(--danger)" }}>*</span></label>
            <input className="field" type="text" placeholder="cth: API inventori down, sudah konfirmasi manual ke kasir" value={invForm.reason} onChange={(e) => setInvForm({ ...invForm, reason: e.target.value })} />
          </div>
          <button className="btn btn-danger" style={{ fontSize: 13, alignSelf: "flex-end" }} onClick={grantInventoryOverride} disabled={invSaving}>
            {invSaving ? "Menyimpan..." : "Beri Izin Darurat"}
          </button>
        </div>

        {invOverrides.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Izin Darurat Aktif</p>
            {invOverrides.map((ov, idx) => {
              const outletName = outlets.find((o) => o.id === ov.outletId)?.name ?? ov.outletId ?? "—";
              return (
                <div key={`${ov.outletId}-${ov.date}-${idx}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 1.5 }}>
                    <strong>{outletName}</strong> · {ov.date ? formatDateID(ov.date) : "—"}
                    <span style={{ color: "#991B1B" }}> — {ov.reason}</span>
                  </div>
                  <button className="btn btn-soft" style={{ fontSize: 12 }} onClick={() => ov.outletId && ov.date && revokeInventoryOverride(ov.outletId, ov.date)}>
                    Cabut
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </AdminSection>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800 }}>Hasil ({rows.length} data)</h2>
          {incompleteCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#B91C1C" }}>
              ⚠️ {incompleteCount} absen tidak lengkap (~{rupiah(incompleteTotal)}) dari data ini
            </span>
          )}
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
                const perm = row.early_checkout_permission;
                // Izin pulang awal hanya untuk staff yang bertugas hari ini (sudah check-in, belum pulang, belum dibayar)
                const createEligible =
                  Boolean(row.checkin_time) && !row.checkout_time && !row.paid_status && row.date === todayWita();
                return (
                  <tr key={row.id}>
                    <td data-label="Tanggal">{formatDateID(row.date)}</td>
                    <td data-label="Staff" style={{ fontWeight: 700 }}>{row.staff_name}</td>
                    <td data-label="Outlet">{row.outlet_name}</td>
                    <td data-label="Shift">{row.shift === 0 ? "Full" : `S${row.shift}`}</td>
                    <td data-label="Masuk">{hhmm(row.checkin_time)}</td>
                    <td data-label="Pulang">{hhmm(row.checkout_time)}</td>
                    <td data-label="Telat">{row.late_minutes} mnt</td>
                    <td data-label="Alasan Terlambat" style={{ maxWidth: 160 }}>
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
                    <td data-label="Gaji" style={{ fontWeight: 700 }}>{rupiah(row.final_salary)}</td>
                    <td data-label="Status Bayar">
                      {isIncompleteUnpaid(row, today) ? (
                        <span
                          className="status-pill status-danger"
                          style={{ borderRadius: 8, whiteSpace: "nowrap" }}
                          title={`Tidak dibayar — tidak checkout. Gaji ${rupiah(row.final_salary)} tidak dihitung.`}
                        >
                          Tidak Lengkap
                        </span>
                      ) : row.checkin_time && !row.checkout_time && row.date === today ? (
                        <span className="status-pill status-warn">Bertugas</span>
                      ) : (
                        <span className={`status-pill ${row.paid_status ? "status-ok" : "status-warn"}`}>{row.paid_status ? "Dibayar" : "Belum"}</span>
                      )}
                    </td>
                    <td data-label="Foto / GPS">
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
                    <td data-label="Aksi">
                      <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center" }}>
                        {perm?.status === "active" ? (
                          <button
                            type="button"
                            style={{
                              background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A",
                              borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "4px 9px",
                              whiteSpace: "nowrap", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3
                            }}
                            title={`Izin pulang awal aktif: ${perm.reason} — klik untuk batalkan`}
                            onClick={() => openCancel(row)}
                          >
                            <Ban size={12} /> Batalkan
                          </button>
                        ) : perm?.status === "used" ? (
                          <span
                            style={{
                              background: "#EDE9FE", color: "#6D28D9", border: "1px solid #DDD6FE",
                              borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "4px 9px", whiteSpace: "nowrap"
                            }}
                            title={perm.reason}
                          >
                            ✓ Dipakai
                          </span>
                        ) : createEligible ? (
                          <button
                            className="btn btn-soft"
                            style={{ fontSize: 12, padding: "6px 9px", color: "#B45309", whiteSpace: "nowrap" }}
                            title="Izinkan staff pulang lebih awal"
                            onClick={() => openEarly(row)}
                          >
                            <Clock size={13} /> Izinkan
                          </button>
                        ) : null}
                        {(row.late_minutes > 0 || (row.checkin_time && !row.checkout_time)) && !row.paid_status && (
                          <button
                            className="btn btn-soft"
                            style={{ fontSize: 12, padding: "6px 9px", color: "var(--success)" }}
                            title={
                              [
                                row.late_minutes > 0 ? `Maafkan keterlambatan — hapus potongan ${rupiah(row.deduction)}` : null,
                                !row.checkout_time ? "Isi absen keluar otomatis sesuai jadwal shift" : null
                              ].filter(Boolean).join(" & ")
                            }
                            onClick={() => forgiveLate(row)}
                            disabled={forgivingId === row.id}
                          >
                            {forgivingId === row.id
                              ? <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
                              : <CheckCircle2 size={13} />}
                          </button>
                        )}
                        <button
                          className="btn btn-soft"
                          style={{ fontSize: 12, padding: "6px 9px" }}
                          title="Revisi data absen"
                          onClick={() => openRevise(row)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn btn-soft"
                          style={{ fontSize: 12, padding: "6px 9px", color: "var(--danger)" }}
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="label">Jam Masuk (koreksi)</label>
                  <input
                    className="field"
                    type="time"
                    value={reviseForm.checkin_time}
                    onChange={(e) => setReviseForm({ ...reviseForm, checkin_time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Jam Pulang (koreksi)</label>
                  <input
                    className="field"
                    type="time"
                    value={reviseForm.checkout_time}
                    onChange={(e) => setReviseForm({ ...reviseForm, checkout_time: e.target.value })}
                  />
                </div>
              </div>
              {!reviseTarget.checkout_time && (
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: -6 }}>
                  Isi Jam Pulang jika staff lupa absen keluar — kosongkan kedua kolom di atas jika tidak ada koreksi jam.
                </p>
              )}
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

      {/* Izinkan Pulang Awal Modal */}
      {earlyTarget && (
        <Modal title="Izinkan Pulang Awal" onClose={() => setEarlyTarget(null)} width={500}>
          <div style={{ background: "var(--surface-soft)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <span><strong>Staff:</strong> {earlyTarget.staff_name}</span>
              <span><strong>Outlet:</strong> {earlyTarget.outlet_name}</span>
              <span><strong>Tanggal:</strong> {formatDateID(earlyTarget.date)}</span>
              <span><strong>Shift:</strong> {earlyTarget.shift === 0 ? "Full Shift" : `Shift ${earlyTarget.shift}`}</span>
              <span><strong>Masuk:</strong> {hhmm(earlyTarget.checkin_time) || "—"}</span>
            </div>
          </div>
          <form onSubmit={submitEarly}>
            <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
              <div>
                <label className="label">Alasan <span style={{ color: "var(--danger)" }}>*</span></label>
                <input
                  className="field"
                  placeholder="Mis. Roti habis lebih cepat (min. 5 karakter)"
                  value={earlyForm.reason}
                  onChange={(e) => setEarlyForm({ ...earlyForm, reason: e.target.value })}
                  required
                  minLength={5}
                />
              </div>
              <div>
                <label className="label">Catatan (opsional)</label>
                <input
                  className="field"
                  placeholder="Mis. Sisa stok kosong jam 15:20"
                  value={earlyForm.note}
                  onChange={(e) => setEarlyForm({ ...earlyForm, note: e.target.value })}
                />
              </div>
            </div>
            <div style={{
              background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10,
              padding: "10px 14px", fontSize: 12.5, color: "#92400E", marginBottom: 16, lineHeight: 1.6
            }}>
              ⚠️ Staff tetap wajib mengirim Laporan Tutup Toko sebelum absen pulang. Izin ini hanya membuka blokir jam checkout, bukan melewati alur penutupan toko (GPS, selfie, dan inventori tetap wajib).
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }} disabled={earlySaving}>
                {earlySaving ? "Menyimpan..." : "Simpan Izin"}
              </button>
              <button type="button" className="btn btn-soft" onClick={() => setEarlyTarget(null)}>Batal</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Batalkan Izin Modal */}
      {cancelTarget && (
        <Modal title="Batalkan Izin Pulang Awal" onClose={() => setCancelTarget(null)} width={460}>
          <p style={{ fontSize: 13.5, marginBottom: 12, lineHeight: 1.6 }}>
            Membatalkan izin pulang awal untuk <strong>{cancelTarget.staff_name}</strong> pada{" "}
            <strong>{formatDateID(cancelTarget.date)}</strong>. Setelah dibatalkan, staff kembali mengikuti aturan jam checkout normal.
          </p>
          {cancelTarget.early_checkout_permission?.reason && (
            <div style={{ background: "var(--surface-soft)", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 12.5 }}>
              <strong>Alasan izin awal:</strong> {cancelTarget.early_checkout_permission.reason}
            </div>
          )}
          <form onSubmit={submitCancel}>
            <div style={{ marginBottom: 16 }}>
              <label className="label">Alasan Pembatalan <span style={{ color: "var(--danger)" }}>*</span></label>
              <input
                className="field"
                placeholder="Mis. Toko lanjut buka karena stok datang lagi (min. 5 karakter)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                required
                minLength={5}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn btn-primary" style={{ fontSize: 13, background: "var(--danger)", borderColor: "var(--danger)" }} disabled={cancelSaving}>
                {cancelSaving ? "Membatalkan..." : "Batalkan Izin"}
              </button>
              <button type="button" className="btn btn-soft" onClick={() => setCancelTarget(null)}>Tutup</button>
            </div>
          </form>
        </Modal>
      )}
    </AdminPage>
  );
}
