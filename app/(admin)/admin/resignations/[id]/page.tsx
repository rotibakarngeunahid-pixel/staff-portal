"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ImageIcon, Loader2, RefreshCw, XCircle } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID, rupiah } from "@/lib/format";

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
  submitted_at: string | null;
  letter_received_at: string | null;
  requested_last_working_date: string;
  approved_last_working_date: string | null;
  notice_required_days: number;
  notice_given_days: number | null;
  written_notice_received: boolean;
  resignation_letter_url: string | null;
  reason: string | null;
  auto_compliance_status: "auto_compliant" | "auto_non_compliant" | "needs_review" | null;
  final_compliance_status: "compliant" | "non_compliant" | "exempted" | null;
  compliance_reason: string | null;
  final_payroll_payment_id: string | null;
};

type PayrollPreview = {
  eligibleShifts: Array<{ id: string; date: string; shift: number; final_salary: number }>;
  excludedShifts: Array<{ id: string; date: string; shift: number; reason: string }>;
  eligibleBase: number;
  payoutRatePercent: number;
  resignationPolicyDeduction: number;
  manualDeduction: number;
  bonus: number;
  netTransferAmount: number;
};

const STATUS_LABELS: Record<ResignationCaseStatus, string> = {
  draft: "Draft", submitted: "Diajukan", under_review: "Sedang Direview",
  approved_compliant: "Disetujui — Sesuai Prosedur", approved_non_compliant: "Disetujui — Tidak Sesuai Prosedur",
  exempted: "Dikecualikan", withdrawn: "Ditarik Staff", cancelled: "Dibatalkan Admin",
  final_payroll_approved: "Payroll Final Disetujui", paid: "Selesai (Dibayar)"
};

const REVIEWABLE = ["submitted", "under_review"];
const DECIDED = ["approved_compliant", "approved_non_compliant", "exempted"];
const CANCELLABLE = ["draft", "submitted", "under_review", "approved_compliant", "approved_non_compliant", "exempted"];

export default function AdminResignationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [caseId, setCaseId] = useState("");
  const [data, setData] = useState<ResignationCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");

  const [finalComplianceStatus, setFinalComplianceStatus] = useState<"compliant" | "non_compliant" | "exempted" | "">("");
  const [approvedLastWorkingDate, setApprovedLastWorkingDate] = useState("");
  const [complianceReason, setComplianceReason] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const [manualDeduction, setManualDeduction] = useState("0");
  const [manualDeductionNote, setManualDeductionNote] = useState("");
  const [bonus, setBonus] = useState("0");
  const [bonusNote, setBonusNote] = useState("");
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [approving, setApproving] = useState(false);

  const [proof, setProof] = useState("");
  const [proofName, setProofName] = useState("");
  const [proofUploading, setProofUploading] = useState(false);
  const [confirmZero, setConfirmZero] = useState(false);
  const [note, setNote] = useState("");
  const [paying, setPaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { params.then((p) => setCaseId(p.id)); }, [params]);

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const payload = await apiFetch<{ ok: true; resignationCases: ResignationCase[] }>("/api/admin/resignations", {
        role: "admin",
        body: { resignationCaseId: caseId }
      });
      const found = payload.resignationCases[0] || null;
      setData(found);
      if (found) setApprovedLastWorkingDate(found.approved_last_working_date || found.requested_last_working_date);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memuat data resign");
      setMsgType("err");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  async function submitReview() {
    if (!data) return;
    if (!finalComplianceStatus) { setMessage("Pilih keputusan final terlebih dahulu"); setMsgType("err"); return; }
    setReviewing(true);
    setMessage("Menyimpan keputusan..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/resignations/review", {
        method: "POST",
        role: "admin",
        body: {
          resignationCaseId: data.id,
          finalComplianceStatus,
          approvedLastWorkingDate,
          complianceReason: complianceReason.trim() || undefined
        }
      });
      await load();
      setMessage("Keputusan compliance tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan keputusan"); setMsgType("err");
    } finally {
      setReviewing(false);
    }
  }

  async function runPreview() {
    if (!data) return;
    setPreviewing(true);
    setMessage("Menghitung payroll final..."); setMsgType("info");
    try {
      const result = await apiFetch<{ ok: true } & PayrollPreview>("/api/admin/resignations/final-payroll-preview", {
        method: "POST",
        role: "admin",
        body: {
          resignationCaseId: data.id,
          manualDeduction: Number(manualDeduction) || 0,
          bonus: Number(bonus) || 0
        }
      });
      setPreview(result);
      setMessage(""); setMsgType("info");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menghitung payroll final"); setMsgType("err");
    } finally {
      setPreviewing(false);
    }
  }

  async function approveFinalPayroll() {
    if (!data) return;
    setApproving(true);
    setMessage("Mengunci payroll final..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/resignations/final-payroll-approve", { method: "POST", role: "admin", body: { resignationCaseId: data.id } });
      await load();
      setMessage("Payroll final disetujui ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyetujui payroll final"); setMsgType("err");
    } finally {
      setApproving(false);
    }
  }

  function onProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofName(file.name);
    setProofUploading(true);
    setMessage("Mengunggah bukti pembayaran..."); setMsgType("info");
    const fd = new FormData();
    fd.append("foto", file, file.name);
    fd.append("scope", "payroll/proof");
    apiFetch<{ ok: true; foto_url: string }>("/api/upload/photo", { method: "POST", role: "admin", body: fd })
      .then((result) => { setProof(result.foto_url); setMessage("Bukti berhasil diunggah"); setMsgType("ok"); })
      .catch((err: unknown) => {
        setProof(""); setProofName("");
        if (fileRef.current) fileRef.current.value = "";
        setMessage(err instanceof Error ? err.message : "Upload bukti gagal. Coba lagi."); setMsgType("err");
      })
      .finally(() => setProofUploading(false));
  }

  async function payFinalPayroll() {
    if (!data) return;
    setPaying(true);
    setMessage("Memproses pembayaran..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/resignations/final-payroll-pay", {
        method: "POST",
        role: "admin",
        body: {
          resignationCaseId: data.id,
          manualDeduction: Number(manualDeduction) || 0,
          manualDeductionNote: manualDeductionNote.trim() || undefined,
          bonus: Number(bonus) || 0,
          bonusNote: bonusNote.trim() || undefined,
          proof: proof || undefined,
          note: note.trim() || undefined,
          confirmZero
        }
      });
      await load();
      setMessage("Pembayaran final resign berhasil dicatat ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memproses pembayaran"); setMsgType("err");
    } finally {
      setPaying(false);
    }
  }

  async function cancelCase() {
    if (!data) return;
    if (!window.confirm(`Batalkan kasus resign ${data.staff_name}?`)) return;
    try {
      await apiFetch("/api/admin/resignations", { method: "PUT", role: "admin", body: { resignationCaseId: data.id, status: "cancelled" } });
      await load();
      setMessage("Kasus resign dibatalkan"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal membatalkan kasus"); setMsgType("err");
    }
  }

  return (
    <AdminPage
      title={data ? `Resign — ${data.staff_name}` : "Detail Resign"}
      subtitle={data ? data.outlet_name || undefined : undefined}
      action={
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/resignations" className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px", textDecoration: "none" }}>
            <ArrowLeft size={14} /> Kembali
          </Link>
          <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={load} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
          </button>
        </div>
      }
    >
      <MsgBar message={message} type={msgType} />

      {loading || !data ? (
        <AdminSection><p style={{ fontSize: 13, color: "var(--muted-light)" }}>Memuat...</p></AdminSection>
      ) : (
        <>
          <AdminSection title="Ringkasan Kasus">
            <span className={`status-pill ${data.status === "paid" ? "status-ok" : ["withdrawn", "cancelled"].includes(data.status) ? "status-danger" : "status-warn"}`} style={{ marginBottom: 12 }}>
              {STATUS_LABELS[data.status]}
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <Row label="Sumber" value={data.source === "staff_portal" ? "Staff Portal" : data.source === "admin_entry" ? "Input Admin" : "Abandonment"} />
              <Row label="Tanggal diajukan" value={formatDateID(data.requested_last_working_date)} />
              <Row label="Tanggal disetujui" value={data.approved_last_working_date ? formatDateID(data.approved_last_working_date) : "—"} />
              <Row label="Notice diberikan" value={`${data.notice_given_days ?? "-"} / ${data.notice_required_days} hari`} />
              <Row label="Surat resign resmi" value={data.written_notice_received ? "Ada" : "Tidak ada"} />
              <Row label="Rekomendasi sistem" value={
                data.auto_compliance_status === "auto_compliant" ? "Compliant"
                : data.auto_compliance_status === "auto_non_compliant" ? "Non-Compliant"
                : data.auto_compliance_status === "needs_review" ? "Perlu Review"
                : "—"
              } />
              <Row label="Keputusan final" value={
                data.final_compliance_status === "compliant" ? "Compliant (100%)"
                : data.final_compliance_status === "non_compliant" ? "Non-Compliant"
                : data.final_compliance_status === "exempted" ? "Exempted (100%)"
                : "Belum ditetapkan"
              } />
              <Row label="Alasan resign" value={data.reason || "—"} />
              {data.compliance_reason ? <Row label="Alasan keputusan" value={data.compliance_reason} /> : null}
            </div>
            {data.resignation_letter_url ? (
              <a href={data.resignation_letter_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>
                <ImageIcon size={14} /> Lihat foto surat resign
              </a>
            ) : null}
            {CANCELLABLE.includes(data.status) ? (
              <button className="btn btn-soft" style={{ marginTop: 14, fontSize: 12, color: "var(--danger)" }} onClick={cancelCase}>
                <XCircle size={14} /> Batalkan Case
              </button>
            ) : null}
          </AdminSection>

          {REVIEWABLE.includes(data.status) ? (
            <AdminSection title="Tetapkan Keputusan Compliance" subtitle="Wajib mengisi alasan jika berbeda dari rekomendasi sistem">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="label">Keputusan Final<span style={{ color: "var(--danger)" }}>*</span></label>
                  <select className="field" value={finalComplianceStatus} onChange={(e) => setFinalComplianceStatus(e.target.value as typeof finalComplianceStatus)}>
                    <option value="">Pilih keputusan</option>
                    <option value="compliant">Sesuai Prosedur (100%)</option>
                    <option value="non_compliant">Tidak Sesuai Prosedur (payout rate konfigurasi)</option>
                    <option value="exempted">Dikecualikan / Exempted (100%)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Tanggal Terakhir Kerja Disetujui</label>
                  <input className="field" type="date" value={approvedLastWorkingDate} onChange={(e) => setApprovedLastWorkingDate(e.target.value)} />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label className="label">Alasan Keputusan {data.auto_compliance_status ? "(wajib jika berbeda dari rekomendasi sistem)" : ""}</label>
                  <textarea className="field" rows={2} value={complianceReason} onChange={(e) => setComplianceReason(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={submitReview} disabled={reviewing}>
                <CheckCircle2 size={15} /> {reviewing ? "Menyimpan..." : "Simpan Keputusan"}
              </button>
            </AdminSection>
          ) : null}

          {DECIDED.includes(data.status) || data.status === "final_payroll_approved" ? (
            <AdminSection title="Payroll Final" subtitle="Hitung gaji final sebelum dibayar">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="label">Potongan Manual (mis. kasbon)</label>
                  <input className="field" type="number" min={0} value={manualDeduction} onChange={(e) => setManualDeduction(e.target.value)} />
                </div>
                <div>
                  <label className="label">Catatan Potongan Manual</label>
                  <input className="field" value={manualDeductionNote} onChange={(e) => setManualDeductionNote(e.target.value)} />
                </div>
                <div>
                  <label className="label">Bonus</label>
                  <input className="field" type="number" min={0} value={bonus} onChange={(e) => setBonus(e.target.value)} />
                </div>
                <div>
                  <label className="label">Catatan Bonus</label>
                  <input className="field" value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-soft" onClick={runPreview} disabled={previewing} style={{ marginBottom: 16 }}>
                {previewing ? "Menghitung..." : "Hitung Preview"}
              </button>

              {preview ? (
                <div style={{ background: "var(--surface-soft)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <Row label="Gaji final eligible" value={rupiah(preview.eligibleBase)} />
                    <Row label="Payout rate" value={`${preview.payoutRatePercent}%`} />
                    <Row label="Potongan resign" value={rupiah(preview.resignationPolicyDeduction)} />
                    <Row label="Potongan manual" value={rupiah(preview.manualDeduction)} />
                    <Row label="Bonus" value={rupiah(preview.bonus)} />
                    <Row label="Total diterima (net transfer)" value={rupiah(preview.netTransferAmount)} />
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{preview.eligibleShifts.length} shift eligible</p>
                  {preview.excludedShifts.length > 0 ? (
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>{preview.excludedShifts.length} shift dikecualikan (shift tidak lengkap)</p>
                  ) : null}

                  {data.status !== "final_payroll_approved" ? (
                    <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={approveFinalPayroll} disabled={approving}>
                      {approving ? "Memproses..." : "Setujui Payroll Final"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {data.status === "final_payroll_approved" ? (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <label className="label">Catatan Pembayaran</label>
                    <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label className="label">Bukti Transfer</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <label style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 16px", borderRadius: 12, border: "1.5px dashed var(--border)",
                        background: "var(--surface-soft)", fontSize: 12, fontWeight: 600, color: "var(--muted)",
                        cursor: proofUploading ? "wait" : "pointer", opacity: proofUploading ? 0.6 : 1
                      }}>
                        {proofUploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <ImageIcon size={14} />}
                        {proofUploading ? "Mengunggah..." : proofName || "Pilih foto bukti transfer"}
                        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} disabled={proofUploading} onChange={onProofChange} />
                      </label>
                    </div>
                  </div>
                  {preview && preview.eligibleBase === 0 ? (
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={confirmZero} onChange={(e) => setConfirmZero(e.target.checked)} style={{ marginTop: 3 }} />
                      <span style={{ fontSize: 12 }}>Saya konfirmasi gaji final Rp0 dan tetap ingin memproses payroll final ini.</span>
                    </label>
                  ) : null}
                  <button className="btn btn-primary" onClick={payFinalPayroll} disabled={paying || proofUploading}>
                    {paying ? "Memproses..." : "Bayar Sekarang"}
                  </button>
                </div>
              ) : null}
            </AdminSection>
          ) : null}

          {data.status === "paid" && data.final_payroll_payment_id ? (
            <AdminSection title="Selesai">
              <p style={{ fontSize: 13, marginBottom: 10 }}>Payroll final sudah dibayar. Staff otomatis dinonaktifkan.</p>
              <Link href={`/admin/payslip/${data.final_payroll_payment_id}`} className="btn btn-primary" style={{ textDecoration: "none", display: "inline-flex" }}>
                Lihat Slip Gaji
              </Link>
            </AdminSection>
          ) : null}
        </>
      )}
    </AdminPage>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, color: "var(--muted-light)", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{value}</span>
    </div>
  );
}
