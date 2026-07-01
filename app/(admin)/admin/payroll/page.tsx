"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, ImageIcon, Loader2, RefreshCw, Save, Users } from "lucide-react";
import Link from "next/link";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import {
  PayrollAdminSummaryCards,
  PayrollCheckList,
  PayrollHero,
  PayrollModeTabs,
  PayrollPaymentCard,
  PayrollProofPanel,
  PayrollPreviewPanel,
  PayrollShiftPanel,
  type PayrollSummaryView
} from "@/components/payroll/payroll-ui";
import { apiFetch } from "@/lib/client-api";
import { rupiah } from "@/lib/format";
import {
  allocatePaymentByAmount,
  allocatePaymentByDates,
  isShiftCounted
} from "@/lib/payroll";

type PaymentRecord = {
  id: string;
  paid_at: string;
  amount: number;
  bonus?: number;
  bonus_note?: string | null;
  deduction?: number;
  deduction_note?: string | null;
  note: string | null;
  proof_url: string | null;
  date_from: string | null;
  date_to: string | null;
  payment_kind?: "regular" | "final_resignation";
  payout_rate?: number;
  resignation_policy_deduction?: number;
  manual_deduction?: number;
};

type PayrollStaff = {
  id: string;
  name: string;
  active: boolean;
  totalEarned: number;
  totalPaid: number;
  balance: number;
  summary?: PayrollSummaryView;
  attendance: Array<{ id: string; date: string; shift: number; final_salary: number; paid_status: boolean; checkin_time?: string | null; checkout_time?: string | null }>;
  payments: PaymentRecord[];
};

type PayMode = "amount" | "dates";

export default function AdminPayrollPage() {
  const [payroll, setPayroll] = useState<PayrollStaff[]>([]);
  const [selected, setSelected] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("amount");
  const [amountInput, setAmountInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bonusInput, setBonusInput] = useState("");
  const [bonusNote, setBonusNote] = useState("");
  const [deductionInput, setDeductionInput] = useState("");
  const [deductionNote, setDeductionNote] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<string>("");
  const [proofName, setProofName] = useState("");
  const [proofUploading, setProofUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const payload = await apiFetch<{ ok: true; payroll: PayrollStaff[] }>("/api/admin/payroll", { role: "admin" });
      setPayroll(payload.payroll);
      if (!selected && payload.payroll[0]) setSelected(payload.payroll[0].id);
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
    setSelectedIds([]);
    setAmountInput("");
    setBonusInput("");
    setBonusNote("");
    setDeductionInput("");
    setDeductionNote("");
  }, [selected, payMode]);

  const current = useMemo(() => payroll.find((item) => item.id === selected) || null, [payroll, selected]);
  const summary = current?.summary;

  // Hanya shift dengan absen masuk+keluar lengkap yang bisa dibayar (selaras server).
  const unpaid = useMemo(
    () => (current?.attendance.filter((row) => !row.paid_status && isShiftCounted(row)) || []).sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.shift - b.shift;
    }),
    [current]
  );

  const paidShifts = useMemo(
    () => (current?.attendance.filter((row) => row.paid_status) || []).sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.shift - b.shift;
    }),
    [current]
  );

  const payments = current?.payments || [];
  const payAmount = Number(amountInput) || 0;
  const bonusAmount = Math.max(0, Number(bonusInput) || 0);
  const deductionAmount = Math.max(0, Number(deductionInput) || 0);

  const previewAllocation = useMemo(() => {
    if (!unpaid.length) return null;
    if (payMode === "amount") {
      if (payAmount <= 0) return null;
      return allocatePaymentByAmount(unpaid, payAmount);
    }
    if (!selectedIds.length) return null;
    const result = allocatePaymentByDates(unpaid, selectedIds);
    if (!result.covered.length) return null;
    return result;
  }, [payMode, payAmount, selectedIds, unpaid]);

  // Potongan tidak boleh melebihi total yang ditransfer (gaji shift + bonus).
  const transferShiftAmount = payMode === "amount" ? payAmount : (previewAllocation?.totalCovered ?? 0);
  const maxDeduction = transferShiftAmount + bonusAmount;
  const deductionExceeds = deductionAmount > maxDeduction;

  function onProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofName(file.name);
    setProofUploading(true);
    setMessage("Mengunggah bukti pembayaran...");
    setMsgType("info");
    const fd = new FormData();
    fd.append("foto", file, file.name);
    fd.append("scope", "payroll/proof");
    apiFetch<{ ok: true; foto_url: string }>("/api/upload/photo", {
      method: "POST",
      role: "admin",
      body: fd
    })
      .then((result) => {
        setProof(result.foto_url);
        setMessage("Bukti berhasil diunggah");
        setMsgType("ok");
      })
      .catch((err: unknown) => {
        setProof("");
        setProofName("");
        if (fileRef.current) fileRef.current.value = "";
        setMessage(err instanceof Error ? err.message : "Upload bukti gagal. Coba lagi.");
        setMsgType("err");
      })
      .finally(() => setProofUploading(false));
  }

  function toggleShift(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !previewAllocation?.covered.length) return;
    const rawBonus = Number(bonusInput);
    if (bonusInput.trim() && (!Number.isFinite(rawBonus) || rawBonus < 0)) {
      setMessage("Bonus tidak valid. Masukkan angka 0 atau lebih.");
      setMsgType("err");
      return;
    }
    if (bonusInput.trim() && !Number.isInteger(rawBonus)) {
      setMessage("Bonus harus berupa angka bulat (rupiah tanpa desimal).");
      setMsgType("err");
      return;
    }
    const rawDeduction = Number(deductionInput);
    if (deductionInput.trim() && (!Number.isFinite(rawDeduction) || rawDeduction < 0)) {
      setMessage("Potongan tidak valid. Masukkan angka 0 atau lebih.");
      setMsgType("err");
      return;
    }
    if (deductionInput.trim() && !Number.isInteger(rawDeduction)) {
      setMessage("Potongan harus berupa angka bulat (rupiah tanpa desimal).");
      setMsgType("err");
      return;
    }
    if (deductionExceeds) {
      setMessage("Potongan tidak boleh melebihi total (gaji shift + bonus).");
      setMsgType("err");
      return;
    }
    setSubmitting(true);
    setMessage("Memproses pembayaran...");
    setMsgType("info");
    try {
      const body: Record<string, unknown> = {
        staffId: selected,
        mode: payMode,
        note: note.trim() || undefined
      };
      if (payMode === "amount") body.amount = payAmount;
      else body.attendanceIds = selectedIds;
      if (bonusAmount > 0) {
        body.bonus = bonusAmount;
        if (bonusNote.trim()) body.bonusNote = bonusNote.trim();
      }
      if (deductionAmount > 0) {
        body.deduction = deductionAmount;
        if (deductionNote.trim()) body.deductionNote = deductionNote.trim();
      }
      if (proof) body.proof = proof;

      const payload = await apiFetch<{
        ok: true;
        overpayment: number;
        allocation?: { coveredShiftCount: number; remainingUnpaidSalary: number };
      }>("/api/admin/payroll", { method: "POST", role: "admin", body });

      setAmountInput("");
      setSelectedIds([]);
      setBonusInput("");
      setBonusNote("");
      setDeductionInput("");
      setDeductionNote("");
      setNote("");
      setProof("");
      setProofName("");
      if (fileRef.current) fileRef.current.value = "";
      await load();

      const covered = payload.allocation?.coveredShiftCount ?? previewAllocation.paidShiftCount;
      const sisa = payload.allocation?.remainingUnpaidSalary ?? previewAllocation.remainingUnpaidSalary;
      let msg = `Pembayaran tersimpan. ${covered} shift ditandai lunas.`;
      if (bonusAmount > 0) msg += ` Bonus ${rupiah(bonusAmount)} ditambahkan.`;
      if (deductionAmount > 0) msg += ` Potongan ${rupiah(deductionAmount)} diterapkan.`;
      if (payload.overpayment > 0) msg += ` Lebih bayar ${rupiah(payload.overpayment)}.`;
      else if (sisa > 0) msg += ` Sisa ${rupiah(sisa)}.`;
      setMessage(msg);
      setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memproses pembayaran");
      setMsgType("err");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminPage
      title="Penggajian"
      subtitle="Kelola pembayaran gaji dengan tampilan ringkas dan pratinjau otomatis"
      action={
        <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={load} disabled={loading}>
          <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          Refresh
        </button>
      }
    >
      <MsgBar message={message} type={msgType} />

      <AdminSection title="Staff & Ringkasan" subtitle="Pilih staff untuk melihat saldo dan memproses pembayaran">
        <div className="payroll-admin-staff-select">
          <label className="label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Users size={14} />
            Pilih Staff
          </label>
          <select className="field" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={loading}>
            {loading ? (
              <option>Memuat...</option>
            ) : (
              payroll.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{!item.active ? " (nonaktif)" : ""}
                </option>
              ))
            )}
          </select>
        </div>

        {loading ? (
          <div style={{ height: 160, borderRadius: 18, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
        ) : summary ? (
          <div className="payroll-stack">
            <PayrollHero summary={summary} compact />
            <PayrollAdminSummaryCards
              totalEarned={summary.totalEarned}
              totalPaid={summary.totalPaid}
              balance={summary.balance}
            />
            {payments.some((p) => p.proof_url) && <PayrollProofPanel payments={payments} />}
          </div>
        ) : (
          <p className="payroll-empty">Pilih staff untuk melihat ringkasan gaji</p>
        )}
      </AdminSection>

      {!loading && current && (
        <AdminSection title="Status Shift" subtitle="Daftar shift yang sudah dan belum dibayar">
          <div className="payroll-split-grid">
            <PayrollShiftPanel
              title="Sudah dibayar"
              shifts={paidShifts}
              variant="paid"
              emptyText="Belum ada shift lunas"
            />
            <PayrollShiftPanel
              title="Belum dibayar"
              shifts={unpaid}
              variant="unpaid"
              emptyText="Semua shift sudah lunas"
            />
          </div>
        </AdminSection>
      )}

      <AdminSection title="Proses Pembayaran" subtitle="Dua metode input — nominal otomatis (FIFO) atau pilih tanggal kerja">
        <PayrollModeTabs mode={payMode} onChange={setPayMode} />

        <form onSubmit={pay}>
          {payMode === "amount" ? (
            <div className="payroll-amount-input-wrap">
              <label className="label">Nominal Pembayaran<span style={{ color: "var(--danger)" }}> *</span></label>
              <span className="payroll-amount-prefix">Rp</span>
              <input
                className="payroll-amount-input"
                type="number"
                min="1"
                placeholder="350000"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                required
              />
              <p className="payroll-hint" style={{ marginTop: 8 }}>
                Shift ditandai lunas dari tanggal terlama. Satu shift hanya lunas jika nominal mencukupi gaji penuh shift tersebut.
              </p>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <label className="label">Pilih Shift Belum Dibayar<span style={{ color: "var(--danger)" }}> *</span></label>
              <PayrollCheckList
                rows={unpaid}
                selectedIds={selectedIds}
                onToggle={toggleShift}
                onSelectAll={() => setSelectedIds(unpaid.map((r) => r.id))}
                showSelectAll={unpaid.length > 0}
              />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label className="label">Bonus (opsional)</label>
            <div className="payroll-amount-input-wrap" style={{ maxWidth: 480 }}>
              <span className="payroll-amount-prefix">Rp</span>
              <input
                className="payroll-amount-input"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={bonusInput}
                onChange={(e) => setBonusInput(e.target.value)}
              />
            </div>
            <input
              className="field"
              style={{ maxWidth: 480, marginTop: 8 }}
              placeholder="Keterangan bonus (mis. Lembur proyek X)"
              value={bonusNote}
              onChange={(e) => setBonusNote(e.target.value)}
              disabled={bonusAmount <= 0}
            />
            <p className="payroll-hint" style={{ marginTop: 8 }}>
              Bonus adalah tambahan di atas gaji shift — tidak mengurangi saldo gaji tertahan, dan muncul terpisah di slip gaji.
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Potongan (opsional)</label>
            <div className="payroll-amount-input-wrap" style={{ maxWidth: 480 }}>
              <span className="payroll-amount-prefix">Rp</span>
              <input
                className="payroll-amount-input"
                type="number"
                min="0"
                max={maxDeduction || undefined}
                step="1"
                placeholder="0"
                value={deductionInput}
                onChange={(e) => setDeductionInput(e.target.value)}
              />
            </div>
            <input
              className="field"
              style={{ maxWidth: 480, marginTop: 8 }}
              placeholder="Alasan potongan (mis. Kasbon, ganti barang) — terlihat oleh staff"
              value={deductionNote}
              onChange={(e) => setDeductionNote(e.target.value)}
              disabled={deductionAmount <= 0}
            />
            {deductionExceeds ? (
              <p className="payroll-hint" style={{ marginTop: 8, color: "var(--danger)", fontWeight: 700 }}>
                Potongan melebihi total transfer (gaji shift + bonus = {rupiah(maxDeduction)}).
              </p>
            ) : (
              <p className="payroll-hint" style={{ marginTop: 8 }}>
                Potongan mengurangi nominal yang ditransfer (tidak mengubah saldo gaji shift). Alasan akan tampil di slip gaji & riwayat staff.
              </p>
            )}
          </div>

          <PayrollPreviewPanel
            mode={payMode}
            payAmount={payMode === "amount" ? payAmount : (previewAllocation?.totalCovered ?? 0)}
            allocation={previewAllocation}
            currentBalance={current?.balance}
            bonus={bonusAmount}
            bonusNote={bonusNote.trim() || undefined}
            deduction={deductionAmount}
            deductionNote={deductionNote.trim() || undefined}
          />

          <div style={{ maxWidth: 480, marginBottom: 16 }}>
            <label className="label">Catatan (opsional)</label>
            <input className="field" placeholder="Contoh: Transfer BCA batch 1" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">Bukti Pembayaran</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 16px", borderRadius: 12, border: "1.5px dashed var(--border)",
                background: "var(--surface-soft)", fontSize: 12, fontWeight: 600, color: "var(--muted)",
                cursor: proofUploading ? "wait" : "pointer",
                opacity: proofUploading ? 0.6 : 1
              }}>
                {proofUploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <ImageIcon size={14} />}
                {proofUploading ? "Mengunggah..." : proofName || "Pilih foto bukti transfer"}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} disabled={proofUploading} onChange={onProofChange} />
              </label>
              {proof && !proofUploading && (
                <button
                  type="button"
                  onClick={() => { setProof(""); setProofName(""); if (fileRef.current) fileRef.current.value = ""; }}
                  style={{ fontSize: 11, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
                >
                  Hapus bukti
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ fontSize: 14, padding: "12px 20px" }}
            disabled={proofUploading || submitting || !previewAllocation?.covered.length || deductionExceeds}
          >
            <Save size={16} />
            {submitting ? "Memproses..." : "Simpan Pembayaran"}
          </button>
        </form>
      </AdminSection>

      {!loading && payments.length > 0 && (
        <AdminSection
          title={`Riwayat Pembayaran (${payments.length})`}
          subtitle="Bukti transfer utama ada di panel hijau di atas — bagian ini untuk detail lengkap"
        >
          <div className="payroll-stack">
            {payments.map((payment) => (
              <div key={payment.id}>
                <PayrollPaymentCard
                  paidAt={payment.paid_at}
                  amount={payment.amount}
                  bonus={payment.bonus}
                  bonusNote={payment.bonus_note}
                  deduction={payment.deduction}
                  deductionNote={payment.deduction_note}
                  dateFrom={payment.date_from}
                  dateTo={payment.date_to}
                  note={payment.note}
                  proofUrl={payment.proof_url}
                  paymentKind={payment.payment_kind}
                  payoutRate={payment.payout_rate}
                  resignationPolicyDeduction={payment.resignation_policy_deduction}
                  manualDeduction={payment.manual_deduction}
                  compact
                />
                <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                  <Link
                    href={`/admin/payslip/${payment.id}`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "7px 14px", borderRadius: 10,
                      background: "linear-gradient(135deg,#F0681A,#F6B800)",
                      color: "#fff", fontSize: 12, fontWeight: 800,
                      textDecoration: "none", letterSpacing: 0.3
                    }}
                  >
                    <ExternalLink size={13} />
                    Slip Gaji
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </AdminSection>
      )}
    </AdminPage>
  );
}
