"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { rupiah } from "@/lib/format";

type Staff = {
  id: string;
  name: string;
  outlet_id: string | null;
  salary_per_shift: number;
  active: boolean;
  phone: string | null;
  deleted_at?: string | null;
};
type Outlet = { id: string; name: string; active?: boolean };

type DeletePreview = {
  staffId: string;
  staffName: string;
  attendanceCount: number;
  reportCount: number;
  paymentCount: number;
  scheduleCount: number;
  leaveCount: number;
  totalDependencies: number;
  canHardDelete: boolean;
};

type DeleteModal = {
  preview: DeletePreview;
  confirmName: string;
  mode: "deactivate" | "archive" | "hard";
  deleteReason: string;
};

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<DeleteModal | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [sp, op] = await Promise.all([
        apiFetch<{ ok: true; staff: Staff[] }>("/api/admin/staff", { role: "admin" }),
        apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" })
      ]);
      setStaff(sp.staff);
      setOutlets(op.outlets);
    } catch (err) {
      setMessage((err as Error).message);
      setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

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
    if (form.outlet_id && outlets.find((outlet) => outlet.id === form.outlet_id)?.active === false) {
      setMessage("Outlet yang dipilih sudah nonaktif. Pilih outlet aktif."); setMsgType("err"); return;
    }
    if (form.pin && !/^\d+$/.test(form.pin)) { setMessage("PIN hanya boleh angka dan maksimal 4 digit"); setMsgType("err"); return; }
    if (form.pin && form.pin.length > 4) { setMessage("PIN hanya boleh angka dan maksimal 4 digit"); setMsgType("err"); return; }
    if (!editing && form.pin.length < 4) { setMessage("PIN wajib diisi 4 digit angka untuk staff baru"); setMsgType("err"); return; }
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  }

  async function openDeleteModal(id: string) {
    setMessage("Mengecek data staff..."); setMsgType("info");
    try {
      const result = await apiFetch<{ ok: true } & DeletePreview>(
        "/api/admin/staff",
        { role: "admin", body: { staffId: id, deletePreview: "1" } }
      );
      setDeleteModal({
        preview: result,
        confirmName: "",
        mode: result.totalDependencies > 0 ? "archive" : "hard",
        deleteReason: ""
      });
      setMessage(""); setMsgType("info");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memuat info staff"); setMsgType("err");
    }
  }

  async function executeDelete() {
    if (!deleteModal) return;
    const { preview, mode, confirmName, deleteReason } = deleteModal;

    if (mode === "hard" && confirmName !== preview.staffName) {
      setMessage("Nama konfirmasi tidak cocok"); setMsgType("err"); return;
    }

    setDeleteLoading(true);
    setMessage("Memproses..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/staff", {
        method: "DELETE",
        role: "admin",
        body: { staffId: preview.staffId, mode, confirmName, deleteReason }
      });
      setDeleteModal(null);
      await load();
      const modeLabel = mode === "hard" ? "dihapus permanen" : mode === "archive" ? "diarsipkan" : "dinonaktifkan";
      setMessage(`${preview.staffName} berhasil ${modeLabel} ✓`); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memproses"); setMsgType("err");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function deactivate(id: string, name: string) {
    if (saving) return;
    if (!window.confirm(`Nonaktifkan ${name}?`)) return;
    setSaving(true);
    setMessage("Menonaktifkan..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/staff", { method: "DELETE", role: "admin", body: { staffId: id, mode: "deactivate" } });
      await load();
      setMessage(`${name} dinonaktifkan ✓`); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menonaktifkan"); setMsgType("err");
    } finally {
      setSaving(false);
    }
  }

  const filtered = staff.filter((s) => filter === "all" ? true : filter === "active" ? s.active : !s.active);
  const activeOutlets = outlets.filter(isActiveOutlet);
  const selectedInactiveOutlet = form.outlet_id
    ? outlets.find((outlet) => outlet.id === form.outlet_id && !isActiveOutlet(outlet))
    : null;

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

      {/* ─── Modal Delete ─── */}
      {deleteModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(15,23,42,0.65)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px"
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, width: "min(100%, 500px)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden"
          }}>
            {/* Header */}
            <div style={{ padding: "20px 24px", background: "#FEF2F2", borderBottom: "1px solid #FECACA", display: "flex", alignItems: "center", gap: 12 }}>
              <AlertTriangle size={22} color="#DC2626" />
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 900, color: "#DC2626" }}>Hapus / Arsipkan Staff</h2>
                <p style={{ fontSize: 12, color: "#991B1B" }}>{deleteModal.preview.staffName}</p>
              </div>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Dependency summary */}
              <div style={{ background: "var(--surface-soft)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: "var(--ink)", marginBottom: 8 }}>Data historis staff ini:</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    ["Absensi", deleteModal.preview.attendanceCount],
                    ["Laporan", deleteModal.preview.reportCount],
                    ["Pembayaran", deleteModal.preview.paymentCount],
                    ["Jadwal", deleteModal.preview.scheduleCount],
                    ["Request Libur", deleteModal.preview.leaveCount]
                  ].map(([label, count]) => (
                    <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: Number(count) > 0 ? "var(--danger)" : "var(--success)" }}>
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
                {deleteModal.preview.totalDependencies > 0 && (
                  <p style={{ marginTop: 10, fontSize: 11, color: "var(--danger)", fontWeight: 700 }}>
                    ⚠️ Total {deleteModal.preview.totalDependencies} data historis. Hapus permanen tidak tersedia.
                  </p>
                )}
              </div>

              {/* Pilih aksi */}
              <label className="label">Pilih aksi</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${deleteModal.mode === "deactivate" ? "var(--primary)" : "var(--border)"}`, cursor: "pointer", background: deleteModal.mode === "deactivate" ? "rgba(192,57,43,.04)" : "#fff" }}>
                  <input type="radio" name="deleteMode" checked={deleteModal.mode === "deactivate"} onChange={() => setDeleteModal((m) => m ? { ...m, mode: "deactivate" } : null)} style={{ marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 800 }}>Nonaktifkan</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>Staff tidak bisa login. Data historis tetap ada. Bisa diaktifkan kembali.</p>
                  </div>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${deleteModal.mode === "archive" ? "var(--primary)" : "var(--border)"}`, cursor: "pointer", background: deleteModal.mode === "archive" ? "rgba(192,57,43,.04)" : "#fff" }}>
                  <input type="radio" name="deleteMode" checked={deleteModal.mode === "archive"} onChange={() => setDeleteModal((m) => m ? { ...m, mode: "archive" } : null)} style={{ marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 800 }}>Arsipkan Staff</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>Hapus akses operasional, tandai sebagai arsip. Data historis tetap ada. Direkomendasikan jika ada data historis.</p>
                  </div>
                </label>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${deleteModal.mode === "hard" ? "#DC2626" : "var(--border)"}`, cursor: deleteModal.preview.canHardDelete ? "pointer" : "not-allowed", background: deleteModal.mode === "hard" ? "#FEF2F2" : "#fff", opacity: deleteModal.preview.canHardDelete ? 1 : 0.45 }}>
                  <input type="radio" name="deleteMode" checked={deleteModal.mode === "hard"} disabled={!deleteModal.preview.canHardDelete} onChange={() => deleteModal.preview.canHardDelete && setDeleteModal((m) => m ? { ...m, mode: "hard" } : null)} style={{ marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: "#DC2626" }}>Hapus Permanen</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>
                      {deleteModal.preview.canHardDelete
                        ? "Staff tidak memiliki data historis. Hapus permanen tersedia."
                        : "Tidak tersedia — staff memiliki data historis."}
                    </p>
                  </div>
                </label>
              </div>

              {/* Alasan (archive mode) */}
              {deleteModal.mode === "archive" && (
                <div style={{ marginBottom: 14 }}>
                  <label className="label">Alasan arsip (opsional)</label>
                  <input
                    className="field"
                    placeholder="Contoh: mengundurkan diri, kontrak selesai"
                    value={deleteModal.deleteReason}
                    onChange={(e) => setDeleteModal((m) => m ? { ...m, deleteReason: e.target.value } : null)}
                  />
                </div>
              )}

              {/* Konfirmasi nama (hard delete) */}
              {deleteModal.mode === "hard" && deleteModal.preview.canHardDelete && (
                <div style={{ marginBottom: 14 }}>
                  <label className="label">Ketik nama staff untuk konfirmasi</label>
                  <input
                    className="field"
                    placeholder={deleteModal.preview.staffName}
                    value={deleteModal.confirmName}
                    onChange={(e) => setDeleteModal((m) => m ? { ...m, confirmName: e.target.value } : null)}
                    style={{ borderColor: deleteModal.confirmName && deleteModal.confirmName !== deleteModal.preview.staffName ? "var(--danger)" : undefined }}
                  />
                </div>
              )}

              {/* Tombol aksi */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className={deleteModal.mode === "hard" ? "btn btn-danger" : "btn btn-primary"}
                  style={{ flex: 1 }}
                  disabled={deleteLoading || (deleteModal.mode === "hard" && deleteModal.confirmName !== deleteModal.preview.staffName)}
                  onClick={executeDelete}
                >
                  <Trash2 size={15} />
                  {deleteLoading ? "Memproses..." : deleteModal.mode === "hard" ? "Hapus Permanen" : deleteModal.mode === "archive" ? "Arsipkan Staff" : "Nonaktifkan"}
                </button>
                <button className="btn btn-soft" style={{ flex: 1 }} onClick={() => setDeleteModal(null)} disabled={deleteLoading}>
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Form tambah/edit staff ─── */}
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
                <input
                  className="field"
                  type="password"
                  inputMode="numeric"
                  placeholder={editing ? "Kosongkan jika tidak ubah" : "4 digit angka"}
                  value={form.pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setForm({ ...form, pin: val });
                  }}
                  minLength={editing ? 0 : 4}
                  maxLength={4}
                  style={{ borderColor: form.pin && (form.pin.length < 4 || !/^\d+$/.test(form.pin)) ? "var(--danger)" : undefined }}
                />
                <p style={{ fontSize: 11, color: "var(--muted-light)", marginTop: 4 }}>
                  Hanya angka · tepat 4 digit
                  {form.pin.length > 0 && form.pin.length < 4 && (
                    <span style={{ color: "var(--danger)", marginLeft: 6, fontWeight: 700 }}>
                      ({form.pin.length}/4)
                    </span>
                  )}
                  {form.pin.length === 4 && (
                    <span style={{ color: "var(--success)", marginLeft: 6, fontWeight: 700 }}>✓</span>
                  )}
                </p>
              </div>
              <div>
                <label className="label">Outlet</label>
                <select className="field" value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}>
                  <option value="">Belum ditentukan</option>
                  {selectedInactiveOutlet ? (
                    <option value={selectedInactiveOutlet.id} disabled>{selectedInactiveOutlet.name} (nonaktif)</option>
                  ) : null}
                  {activeOutlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
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
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? null : (editing ? <Save size={15} /> : <Plus size={15} />)}
                {saving ? "Menyimpan..." : (editing ? "Update Staff" : "Tambah Staff")}
              </button>
              <button type="button" className="btn btn-soft" onClick={cancelEdit} disabled={saving}>Batal</button>
            </div>
          </AdminSection>
        </form>
      ) : null}

      {/* ─── Daftar staff ─── */}
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
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      {[100, 80, 70, 80, 50, 60].map((w, j) => (
                        <td key={j}><div style={{ height: 12, width: w, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>Tidak ada data</td></tr>
                ) : filtered.map((row) => (
                  <tr key={row.id} style={{ opacity: row.deleted_at ? 0.6 : 1 }}>
                    <td style={{ fontWeight: 700 }}>
                      {row.name}
                      {row.deleted_at && <span className="status-pill status-danger" style={{ fontSize: 9, marginLeft: 6 }}>Arsip</span>}
                    </td>
                    <td>{outletLabel(outlets.find((o) => o.id === row.outlet_id))}</td>
                    <td>{rupiah(row.salary_per_shift)}</td>
                    <td>{row.phone || "—"}</td>
                    <td>
                      <span className={`status-pill ${row.active ? "status-ok" : "status-danger"}`}>
                        {row.active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="btn btn-soft" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => startEdit(row)}>Edit</button>
                        {row.active && (
                          <button className="btn btn-soft" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => deactivate(row.id, row.name)}>
                            Nonaktif
                          </button>
                        )}
                        <button
                          className="btn btn-danger"
                          style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 4 }}
                          onClick={() => openDeleteModal(row.id)}
                          title="Hapus atau arsipkan staff"
                        >
                          <Trash2 size={12} /> Hapus
                        </button>
                      </div>
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

function isActiveOutlet(outlet: Outlet): boolean {
  return outlet.active !== false;
}

function outletLabel(outlet?: Outlet): string {
  if (!outlet) return "—";
  return isActiveOutlet(outlet) ? outlet.name : `${outlet.name} (nonaktif)`;
}
