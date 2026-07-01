"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID } from "@/lib/format";

type ResignationCaseStatus =
  | "draft" | "submitted" | "under_review"
  | "approved_compliant" | "approved_non_compliant" | "exempted"
  | "withdrawn" | "cancelled" | "final_payroll_approved" | "paid";

type ResignationCase = {
  id: string;
  staff_id: string;
  staff_name: string;
  outlet_name: string | null;
  source: "staff_portal" | "admin_entry" | "abandonment";
  status: ResignationCaseStatus;
  requested_last_working_date: string;
  approved_last_working_date: string | null;
  auto_compliance_status: "auto_compliant" | "auto_non_compliant" | "needs_review" | null;
  final_compliance_status: "compliant" | "non_compliant" | "exempted" | null;
  created_at: string;
};

type StaffOption = { id: string; name: string; active: boolean };

const STATUS_LABELS: Record<ResignationCaseStatus, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  under_review: "Direview",
  approved_compliant: "Compliant",
  approved_non_compliant: "Non-Compliant",
  exempted: "Exempted",
  withdrawn: "Ditarik",
  cancelled: "Dibatalkan",
  final_payroll_approved: "Payroll Final Disetujui",
  paid: "Selesai (Dibayar)"
};

const FILTERS = [
  { key: "review", label: "Perlu Review", statuses: ["submitted", "under_review"] },
  { key: "decided", label: "Sudah Diputuskan", statuses: ["approved_compliant", "approved_non_compliant", "exempted", "final_payroll_approved"] },
  { key: "done", label: "Selesai", statuses: ["paid"] },
  { key: "closed", label: "Ditutup", statuses: ["withdrawn", "cancelled"] },
  { key: "all", label: "Semua", statuses: [] as string[] }
] as const;

const emptyForm = {
  staffId: "", requestedLastWorkingDate: "", reason: "",
  writtenNoticeReceived: false, isProbation: false, source: "admin_entry" as "admin_entry" | "abandonment"
};

export default function AdminResignationsPage() {
  const [cases, setCases] = useState<ResignationCase[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("review");
  const [staffFilter, setStaffFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [cp, sp] = await Promise.all([
        apiFetch<{ ok: true; resignationCases: ResignationCase[] }>("/api/admin/resignations", { role: "admin" }),
        apiFetch<{ ok: true; staff: StaffOption[] }>("/api/admin/staff", { role: "admin" })
      ]);
      setCases(cp.resignationCases);
      setStaffOptions(sp.staff);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memuat data resign");
      setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const staffId = params.get("staffId");
      if (staffId) setStaffFilter(staffId);
    }
  }, []);

  async function submitCase(event: React.FormEvent) {
    event.preventDefault();
    if (!form.staffId) { setMessage("Staff wajib dipilih"); setMsgType("err"); return; }
    if (!form.requestedLastWorkingDate) { setMessage("Tanggal terakhir kerja wajib diisi"); setMsgType("err"); return; }
    if (!form.reason.trim()) { setMessage("Alasan resign wajib diisi"); setMsgType("err"); return; }
    setSaving(true);
    setMessage("Menyimpan..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/resignations", {
        method: "POST",
        role: "admin",
        body: {
          staffId: form.staffId,
          requestedLastWorkingDate: form.requestedLastWorkingDate,
          reason: form.reason.trim(),
          writtenNoticeReceived: form.writtenNoticeReceived,
          isProbation: form.isProbation,
          source: form.source
        }
      });
      setForm(emptyForm);
      setShowForm(false);
      await load();
      setMessage("Kasus resign berhasil dibuat ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal membuat kasus resign"); setMsgType("err");
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const activeFilter = FILTERS.find((f) => f.key === filter);
    return cases.filter((c) => {
      if (staffFilter && c.staff_id !== staffFilter) return false;
      if (activeFilter && activeFilter.statuses.length > 0 && !(activeFilter.statuses as string[]).includes(c.status)) return false;
      return true;
    });
  }, [cases, filter, staffFilter]);

  return (
    <AdminPage
      title="Resignasi"
      subtitle="Kelola pengajuan resign & payroll final"
      action={
        !showForm ? (
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowForm(true)}>
            <Plus size={15} /> Buat Case
          </button>
        ) : null
      }
    >
      <MsgBar message={message} type={msgType} />

      {showForm ? (
        <form onSubmit={submitCase}>
          <AdminSection title="Buat Kasus Resign (Atas Nama Staff)" subtitle="Untuk pengajuan offline, resign mendadak, atau abandonment">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="label">Staff<span style={{ color: "var(--danger)" }}>*</span></label>
                <select className="field" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
                  <option value="">Pilih staff</option>
                  {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Sumber</label>
                <select className="field" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as typeof form.source })}>
                  <option value="admin_entry">Input Admin (pengajuan offline)</option>
                  <option value="abandonment">Abandonment (menghilang tanpa kabar)</option>
                </select>
              </div>
              <div>
                <label className="label">Tanggal Terakhir Kerja<span style={{ color: "var(--danger)" }}>*</span></label>
                <input className="field" type="date" value={form.requestedLastWorkingDate} onChange={(e) => setForm({ ...form, requestedLastWorkingDate: e.target.value })} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 16, paddingBottom: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.writtenNoticeReceived} onChange={(e) => setForm({ ...form, writtenNoticeReceived: e.target.checked })} />
                  Ada surat resign resmi
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.isProbation} onChange={(e) => setForm({ ...form, isProbation: e.target.checked })} />
                  Masa probation
                </label>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label className="label">Alasan<span style={{ color: "var(--danger)" }}>*</span></label>
                <textarea className="field" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Plus size={15} /> {saving ? "Menyimpan..." : "Buat Case"}
              </button>
              <button type="button" className="btn btn-soft" onClick={() => { setShowForm(false); setForm(emptyForm); }} disabled={saving}>Batal</button>
            </div>
          </AdminSection>
        </form>
      ) : null}

      {!showForm ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700, border: "1.5px solid",
                    borderColor: filter === f.key ? "var(--primary)" : "var(--border)",
                    background: filter === f.key ? "rgba(192,57,43,.06)" : "#fff",
                    color: filter === f.key ? "var(--primary)" : "var(--muted)", cursor: "pointer"
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {staffFilter ? (
                <button className="btn btn-soft" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => setStaffFilter("")}>
                  Hapus filter staff
                </button>
              ) : null}
              <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={load}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Outlet</th>
                  <th>Sumber</th>
                  <th>Tgl Terakhir Kerja</th>
                  <th>Rekomendasi</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      {[100, 80, 70, 90, 90, 80, 60].map((w, j) => (
                        <td key={j}><div style={{ height: 12, width: w, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Tidak ada data</td></tr>
                ) : filtered.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Staff" style={{ fontWeight: 700 }}>{row.staff_name}</td>
                    <td data-label="Outlet">{row.outlet_name || "—"}</td>
                    <td data-label="Sumber">{row.source === "staff_portal" ? "Staff Portal" : row.source === "admin_entry" ? "Admin" : "Abandonment"}</td>
                    <td data-label="Tgl Terakhir Kerja">{formatDateID(row.approved_last_working_date || row.requested_last_working_date)}</td>
                    <td data-label="Rekomendasi">
                      {row.final_compliance_status ? (
                        <span className={`status-pill ${row.final_compliance_status === "non_compliant" ? "status-danger" : "status-ok"}`}>
                          {row.final_compliance_status === "compliant" ? "Compliant" : row.final_compliance_status === "exempted" ? "Exempted" : "Non-Compliant"}
                        </span>
                      ) : row.auto_compliance_status ? (
                        <span className={`status-pill ${row.auto_compliance_status === "auto_non_compliant" ? "status-danger" : row.auto_compliance_status === "auto_compliant" ? "status-ok" : "status-warn"}`}>
                          {row.auto_compliance_status === "auto_compliant" ? "Auto: Compliant" : row.auto_compliance_status === "auto_non_compliant" ? "Auto: Non-Compliant" : "Perlu Review"}
                        </span>
                      ) : "—"}
                    </td>
                    <td data-label="Status">
                      <span className={`status-pill ${row.status === "paid" ? "status-ok" : ["withdrawn", "cancelled"].includes(row.status) ? "status-danger" : "status-warn"}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td data-label="Aksi">
                      <Link href={`/admin/resignations/${row.id}`} className="btn btn-soft" style={{ fontSize: 12, padding: "6px 12px", textDecoration: "none" }}>
                        Detail
                      </Link>
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
