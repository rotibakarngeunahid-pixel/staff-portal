"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ImageIcon, Loader2, RefreshCw, Send, ShieldAlert, XCircle } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID } from "@/lib/format";

type ResignationCaseStatus =
  | "draft" | "submitted" | "under_review"
  | "approved_compliant" | "approved_non_compliant" | "exempted"
  | "withdrawn" | "cancelled" | "final_payroll_approved" | "paid";

type ResignationCase = {
  id: string;
  status: ResignationCaseStatus;
  requested_last_working_date: string;
  approved_last_working_date: string | null;
  reason: string | null;
  written_notice_received: boolean;
  auto_compliance_status: "auto_compliant" | "auto_non_compliant" | "needs_review" | null;
  final_compliance_status: "compliant" | "non_compliant" | "exempted" | null;
  compliance_reason: string | null;
  notice_required_days: number;
  notice_given_days: number | null;
};

const STATUS_LABELS: Record<ResignationCaseStatus, string> = {
  draft: "Draft",
  submitted: "Diajukan — Menunggu Review",
  under_review: "Sedang Direview HR/Admin",
  approved_compliant: "Disetujui — Sesuai Prosedur",
  approved_non_compliant: "Disetujui — Tidak Sesuai Prosedur",
  exempted: "Dikecualikan (Tetap Dibayar Penuh)",
  withdrawn: "Ditarik",
  cancelled: "Dibatalkan Admin",
  final_payroll_approved: "Payroll Final Disetujui — Menunggu Pembayaran",
  paid: "Selesai — Sudah Dibayar"
};

const ACTIVE_STATUSES: ResignationCaseStatus[] = [
  "draft", "submitted", "under_review", "approved_compliant", "approved_non_compliant", "exempted", "final_payroll_approved"
];
const WITHDRAWABLE_STATUSES: ResignationCaseStatus[] = ["draft", "submitted", "under_review"];

const emptyForm = { requestedLastWorkingDate: "", reason: "", writtenNoticeReceived: false, isProbation: false };

export default function StaffResignationPage() {
  const [resignationCase, setResignationCase] = useState<ResignationCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [form, setForm] = useState(emptyForm);
  const [letterUrl, setLetterUrl] = useState("");
  const [letterName, setLetterName] = useState("");
  const [letterUploading, setLetterUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const payload = await apiFetch<{ ok: true; resignationCase: ResignationCase | null }>("/api/staff/resignation", { role: "staff" });
      setResignationCase(payload.resignationCase);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memuat status resign");
      setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function onLetterChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLetterName(file.name);
    setLetterUploading(true);
    setMessage("Mengunggah foto surat resign...");
    setMsgType("info");
    const fd = new FormData();
    fd.append("foto", file, file.name);
    fd.append("scope", "resignation/letter");
    apiFetch<{ ok: true; foto_url: string }>("/api/upload/photo", { method: "POST", role: "staff", body: fd })
      .then((result) => {
        setLetterUrl(result.foto_url);
        setMessage("Foto surat resign berhasil diunggah");
        setMsgType("ok");
      })
      .catch((err: unknown) => {
        setLetterUrl("");
        setLetterName("");
        if (fileRef.current) fileRef.current.value = "";
        setMessage(err instanceof Error ? err.message : "Upload foto gagal. Coba lagi.");
        setMsgType("err");
      })
      .finally(() => setLetterUploading(false));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.requestedLastWorkingDate) { setMessage("Tanggal terakhir kerja wajib diisi"); setMsgType("err"); return; }
    if (!form.reason.trim()) { setMessage("Alasan resign wajib diisi"); setMsgType("err"); return; }
    setSubmitting(true);
    setMessage("Mengirim pengajuan..."); setMsgType("info");
    try {
      const payload = await apiFetch<{ ok: true; resignationCase: ResignationCase }>("/api/staff/resignation", {
        method: "POST",
        role: "staff",
        body: {
          requestedLastWorkingDate: form.requestedLastWorkingDate,
          reason: form.reason.trim(),
          writtenNoticeReceived: form.writtenNoticeReceived,
          isProbation: form.isProbation,
          letterFile: letterUrl || undefined
        }
      });
      setResignationCase(payload.resignationCase);
      setForm(emptyForm);
      setLetterUrl(""); setLetterName("");
      setMessage("Pengajuan resign berhasil dikirim ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal mengirim pengajuan"); setMsgType("err");
    } finally {
      setSubmitting(false);
    }
  }

  async function withdraw() {
    if (!resignationCase) return;
    if (!window.confirm("Yakin tarik kembali pengajuan resign ini?")) return;
    setWithdrawing(true);
    setMessage("Menarik pengajuan..."); setMsgType("info");
    try {
      await apiFetch("/api/staff/resignation/withdraw", {
        method: "POST",
        role: "staff",
        body: { resignationCaseId: resignationCase.id }
      });
      await load();
      setMessage("Pengajuan resign ditarik ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menarik pengajuan"); setMsgType("err");
    } finally {
      setWithdrawing(false);
    }
  }

  const showForm = !resignationCase || !ACTIVE_STATUSES.includes(resignationCase.status);
  const canWithdraw = resignationCase && WITHDRAWABLE_STATUSES.includes(resignationCase.status);
  const isNonCompliant = resignationCase?.final_compliance_status === "non_compliant";

  return (
    <StaffPage title="Ajukan Resign" subtitle="Pengajuan pengunduran diri">
      {message ? (
        <div style={{
          background: msgType === "err" ? "var(--danger-bg)" : msgType === "ok" ? "var(--success-bg)" : "var(--surface-soft)",
          color: msgType === "err" ? "var(--danger)" : msgType === "ok" ? "#1E8449" : "var(--muted)",
          borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, marginBottom: 12
        }}>
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="prof-card">
          <div style={{ height: 16, width: 160, borderRadius: 6, background: "var(--border)", marginBottom: 10, animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
          <div style={{ height: 12, width: "100%", borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
        </div>
      ) : !showForm && resignationCase ? (
        <div className="prof-card" style={{ textAlign: "left" }}>
          <p style={{ fontSize: 11, color: "var(--muted-light)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Status Pengajuan</p>
          <span className={`status-pill ${resignationCase.status === "paid" ? "status-ok" : ["withdrawn", "cancelled"].includes(resignationCase.status) ? "status-danger" : "status-warn"}`}>
            {STATUS_LABELS[resignationCase.status]}
          </span>

          {isNonCompliant ? (
            <div style={{ marginTop: 14, background: "var(--danger-bg)", border: "1px solid var(--danger-border, #FCA5A5)", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 10 }}>
              <ShieldAlert size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "var(--danger)" }}>Resign Dinilai Tidak Sesuai Prosedur</p>
                <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 2 }}>
                  Gaji terakhir hanya dibayar sebagian sesuai kebijakan perusahaan. Lihat rincian di menu Gaji setelah payroll final diproses.
                </p>
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <Row label="Tanggal terakhir kerja diajukan" value={formatDateID(resignationCase.requested_last_working_date)} />
            {resignationCase.approved_last_working_date ? (
              <Row label="Tanggal terakhir kerja disetujui" value={formatDateID(resignationCase.approved_last_working_date)} />
            ) : null}
            <Row label="Notice period" value={`${resignationCase.notice_given_days ?? "-"} hari (min. ${resignationCase.notice_required_days} hari)`} />
            <Row label="Surat resign resmi" value={resignationCase.written_notice_received ? "Ada" : "Belum ada"} />
            {resignationCase.auto_compliance_status ? (
              <Row label="Rekomendasi sistem" value={
                resignationCase.auto_compliance_status === "auto_compliant" ? "Sesuai prosedur"
                : resignationCase.auto_compliance_status === "auto_non_compliant" ? "Tidak sesuai prosedur"
                : "Perlu review manual"
              } />
            ) : null}
            {resignationCase.final_compliance_status ? (
              <Row label="Keputusan final HR/Admin" value={
                resignationCase.final_compliance_status === "compliant" ? "Sesuai prosedur (gaji 100%)"
                : resignationCase.final_compliance_status === "exempted" ? "Dikecualikan (gaji 100%)"
                : "Tidak sesuai prosedur (gaji dipotong)"
              } />
            ) : null}
            {resignationCase.compliance_reason ? <Row label="Alasan keputusan" value={resignationCase.compliance_reason} /> : null}
            <Row label="Alasan resign" value={resignationCase.reason || "-"} />
          </div>

          {canWithdraw ? (
            <button className="btn btn-soft" style={{ marginTop: 16, fontSize: 12, color: "var(--danger)" }} onClick={withdraw} disabled={withdrawing}>
              <XCircle size={14} /> {withdrawing ? "Memproses..." : "Tarik Pengajuan"}
            </button>
          ) : null}

          <button className="btn btn-soft" style={{ marginTop: 8, fontSize: 12 }} onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="prof-card" style={{ textAlign: "left" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--surface-soft)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
            <AlertTriangle size={18} color="var(--muted)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: "var(--muted)" }}>
              Ajukan resign sesuai prosedur (notice period cukup + surat resmi) agar gaji terakhir dibayar 100%. Pengajuan mendadak tanpa notice period bisa dinilai tidak sesuai prosedur oleh HR/Admin.
            </p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="label">Tanggal Terakhir Kerja<span style={{ color: "var(--danger)" }}>*</span></label>
            <input className="field" type="date" value={form.requestedLastWorkingDate} onChange={(e) => setForm({ ...form, requestedLastWorkingDate: e.target.value })} required />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="label">Alasan Resign<span style={{ color: "var(--danger)" }}>*</span></label>
            <textarea className="field" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Contoh: pindah domisili, melanjutkan studi, dll." required />
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={form.writtenNoticeReceived} onChange={(e) => setForm({ ...form, writtenNoticeReceived: e.target.checked })} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 12, color: "var(--ink)" }}>Saya sudah menyerahkan surat resign tertulis ke admin/HR</span>
          </label>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={form.isProbation} onChange={(e) => setForm({ ...form, isProbation: e.target.checked })} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 12, color: "var(--ink)" }}>Saya masih dalam masa probation</span>
          </label>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Foto Surat Resign (opsional)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 16px", borderRadius: 12, border: "1.5px dashed var(--border)",
                background: "var(--surface-soft)", fontSize: 12, fontWeight: 600, color: "var(--muted)",
                cursor: letterUploading ? "wait" : "pointer", opacity: letterUploading ? 0.6 : 1
              }}>
                {letterUploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <ImageIcon size={14} />}
                {letterUploading ? "Mengunggah..." : letterName || "Pilih foto surat resign"}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} disabled={letterUploading} onChange={onLetterChange} />
              </label>
              {letterUrl && !letterUploading ? (
                <button type="button" onClick={() => { setLetterUrl(""); setLetterName(""); if (fileRef.current) fileRef.current.value = ""; }} style={{ fontSize: 11, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                  Hapus foto
                </button>
              ) : null}
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting || letterUploading}>
            <Send size={15} /> {submitting ? "Mengirim..." : "Kirim Pengajuan Resign"}
          </button>
        </form>
      )}
    </StaffPage>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="prof-row">
      <span className="prof-k">{label}</span>
      <span className="prof-v" style={{ textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}
