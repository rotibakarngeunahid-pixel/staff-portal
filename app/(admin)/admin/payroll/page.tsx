"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Loader2, RefreshCw, Save } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID, rupiah } from "@/lib/format";
import {
  allocatePaymentByAmount,
  allocatePaymentByDates,
  shiftLabel,
  type PayrollPaymentStatus
} from "@/lib/payroll";

const PHOTO_UPLOAD_ENDPOINT =
  process.env.NEXT_PUBLIC_PHOTO_UPLOAD_ENDPOINT ||
  "https://foto-laporan-area.rotibakarngeunah.my.id/api/upload-laporan-area.php";

type PaymentRecord = {
  id: string;
  paid_at: string;
  amount: number;
  note: string | null;
  proof_url: string | null;
  date_from: string | null;
  date_to: string | null;
};

type PayrollSummary = {
  totalEarned: number;
  totalPaid: number;
  balance: number;
  status: PayrollPaymentStatus;
  statusLabel: string;
  paidShiftCount: number;
  unpaidShiftCount: number;
};

type PayrollStaff = {
  id: string;
  name: string;
  active: boolean;
  totalEarned: number;
  totalPaid: number;
  balance: number;
  summary?: PayrollSummary;
  attendance: Array<{ id: string; date: string; shift: number; final_salary: number; paid_status: boolean }>;
  payments: PaymentRecord[];
};

type PayMode = "amount" | "dates";

const STATUS_STYLE: Record<PayrollPaymentStatus, { bg: string; color: string; border: string }> = {
  lunas: { bg: "#EAFAF1", color: "#27AE60", border: "#A9DFBF" },
  sebagian: { bg: "#FEF9E7", color: "#D68910", border: "#F9E79F" },
  belum_lunas: { bg: "rgba(192,57,43,.06)", color: "var(--primary)", border: "rgba(192,57,43,.2)" }
};

function PreviewPanel({
  mode,
  allocation,
  payAmount
}: {
  mode: PayMode;
  payAmount: number;
  allocation: ReturnType<typeof allocatePaymentByAmount> | null;
}) {
  if (!allocation || !allocation.covered.length) {
    return (
      <div style={{
        background: "#F8F9FA", border: "1px dashed var(--border)", borderRadius: 12,
        padding: 16, fontSize: 13, color: "var(--muted)"
      }}>
        {mode === "amount"
          ? "Masukkan nominal untuk melihat shift yang akan ditandai lunas (urut tanggal terlama)."
          : "Centang tanggal kerja untuk melihat total yang harus dibayar."}
      </div>
    );
  }

  return (
    <div style={{ background: "#F0F7FF", border: "1px solid #AED6F1", borderRadius: 12, padding: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 900, color: "#2980B9", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.3px" }}>
        Pratinjau Pembayaran
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 10, color: "var(--muted-light)", fontWeight: 700, marginBottom: 2 }}>Shift terbayar</p>
          <p style={{ fontSize: 16, fontWeight: 900 }}>{allocation.paidShiftCount} hari</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--muted-light)", fontWeight: 700, marginBottom: 2 }}>
            {mode === "amount" ? "Nominal dibayar" : "Total dibayar"}
          </p>
          <p style={{ fontSize: 16, fontWeight: 900, color: "#2980B9" }}>{rupiah(mode === "amount" ? payAmount : allocation.totalCovered)}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--muted-light)", fontWeight: 700, marginBottom: 2 }}>Gaji shift terpilih</p>
          <p style={{ fontSize: 16, fontWeight: 900, color: "#27AE60" }}>{rupiah(allocation.totalCovered)}</p>
        </div>
        {allocation.overpayment > 0 && (
          <div>
            <p style={{ fontSize: 10, color: "var(--muted-light)", fontWeight: 700, marginBottom: 2 }}>Lebih bayar</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: "#D68910" }}>{rupiah(allocation.overpayment)}</p>
          </div>
        )}
        {allocation.remainingUnpaidSalary > 0 && (
          <div>
            <p style={{ fontSize: 10, color: "var(--muted-light)", fontWeight: 700, marginBottom: 2 }}>Sisa belum dibayar</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: "var(--primary)" }}>{rupiah(allocation.remainingUnpaidSalary)}</p>
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, fontWeight: 800, color: "var(--ink)", marginBottom: 6 }}>Tanggal kerja yang akan ditandai lunas:</p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--muted)", lineHeight: 1.8 }}>
        {allocation.covered.map((row) => (
          <li key={row.id}>
            {formatDateID(row.date)} · {shiftLabel(row.shift)} · {rupiah(row.final_salary)}
          </li>
        ))}
      </ul>
      {allocation.uncovered.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 800, color: "var(--warning)", margin: "12px 0 6px" }}>
            Masih belum dibayar ({allocation.unpaidShiftCount} shift):
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--muted)", lineHeight: 1.8 }}>
            {allocation.uncovered.slice(0, 8).map((row) => (
              <li key={row.id}>
                {formatDateID(row.date)} · {shiftLabel(row.shift)} · {rupiah(row.final_salary)}
              </li>
            ))}
            {allocation.uncovered.length > 8 && (
              <li style={{ fontStyle: "italic" }}>+{allocation.uncovered.length - 8} shift lainnya</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

export default function AdminPayrollPage() {
  const [payroll, setPayroll] = useState<PayrollStaff[]>([]);
  const [selected, setSelected] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("amount");
  const [amountInput, setAmountInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
  }, [selected, payMode]);

  const current = useMemo(() => payroll.find((item) => item.id === selected) || null, [payroll, selected]);
  const summary = current?.summary;
  const unpaid = useMemo(
    () => (current?.attendance.filter((row) => !row.paid_status) || []).sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.shift - b.shift;
    }),
    [current]
  );
  const paid = useMemo(
    () => (current?.attendance.filter((row) => row.paid_status) || []).sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.shift - b.shift;
    }),
    [current]
  );
  const payments = current?.payments || [];

  const payAmount = Number(amountInput) || 0;
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

  function onProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofName(file.name);
    setProofUploading(true);
    setMessage("Mengunggah bukti pembayaran..."); setMsgType("info");
    const fd = new FormData();
    fd.append("foto", file, file.name);
    fetch(PHOTO_UPLOAD_ENDPOINT, { method: "POST", body: fd })
      .then((res) => res.json())
      .then((result: { success?: boolean; foto_url?: string; error?: string }) => {
        if (result?.success && result.foto_url) {
          setProof(result.foto_url);
          setMessage("Bukti berhasil diunggah ✓"); setMsgType("ok");
        } else {
          throw new Error(result?.error || "Upload bukti gagal");
        }
      })
      .catch((err: unknown) => {
        setProof(""); setProofName("");
        if (fileRef.current) fileRef.current.value = "";
        setMessage(err instanceof Error ? err.message : "Upload bukti gagal. Coba lagi."); setMsgType("err");
      })
      .finally(() => setProofUploading(false));
  }

  function toggleShift(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAllUnpaid() {
    setSelectedIds(unpaid.map((row) => row.id));
  }

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !previewAllocation?.covered.length) return;
    setSubmitting(true);
    setMessage("Memproses pembayaran..."); setMsgType("info");
    try {
      const body: Record<string, unknown> = {
        staffId: selected,
        mode: payMode,
        note: note.trim() || undefined
      };
      if (payMode === "amount") {
        body.amount = payAmount;
      } else {
        body.attendanceIds = selectedIds;
      }
      if (proof) body.proof = proof;

      const payload = await apiFetch<{
        ok: true;
        overpayment: number;
        allocation?: { coveredShiftCount: number; remainingUnpaidSalary: number };
      }>("/api/admin/payroll", { method: "POST", role: "admin", body });

      setAmountInput("");
      setSelectedIds([]);
      setNote("");
      setProof(""); setProofName("");
      if (fileRef.current) fileRef.current.value = "";
      await load();

      const covered = payload.allocation?.coveredShiftCount ?? previewAllocation.paidShiftCount;
      const sisa = payload.allocation?.remainingUnpaidSalary ?? previewAllocation.remainingUnpaidSalary;
      let msg = `Pembayaran tersimpan ✓ ${covered} shift ditandai lunas.`;
      if (payload.overpayment > 0) {
        msg += ` Lebih bayar ${rupiah(payload.overpayment)} (dicatat di catatan).`;
      } else if (sisa > 0) {
        msg += ` Sisa gaji belum dibayar: ${rupiah(sisa)}.`;
      }
      setMessage(msg);
      setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memproses pembayaran"); setMsgType("err");
    } finally {
      setSubmitting(false);
    }
  }

  const status = summary?.status || "belum_lunas";
  const statusStyle = STATUS_STYLE[status];

  const SUMMARY = [
    { label: "Total Gaji", value: rupiah(summary?.totalEarned ?? current?.totalEarned ?? 0), color: "#2980B9", bg: "#EBF5FB" },
    { label: "Sudah Dibayar", value: rupiah(summary?.totalPaid ?? current?.totalPaid ?? 0), color: "#27AE60", bg: "#EAFAF1" },
    { label: "Sisa Gaji", value: rupiah(summary?.balance ?? current?.balance ?? 0), color: (summary?.balance ?? current?.balance) ? "var(--primary)" : "var(--muted-light)", bg: (summary?.balance ?? current?.balance) ? "rgba(192,57,43,.05)" : "#F8F9FA" }
  ];

  return (
    <AdminPage
      title="Penggajian"
      subtitle="Bayar gaji per nominal atau pilih tanggal kerja — sistem hitung otomatis"
      action={
        <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={load} disabled={loading}>
          <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
        </button>
      }
    >
      <MsgBar message={message} type={msgType} />

      <AdminSection title="Pilih Staff & Ringkasan Gaji">
        <div style={{ marginBottom: 14 }}>
          <label className="label">Staff</label>
          <select className="field" style={{ maxWidth: 320 }} value={selected} onChange={(e) => setSelected(e.target.value)}>
            {loading
              ? <option>Memuat...</option>
              : payroll.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{!item.active ? " (nonaktif)" : ""}
                  </option>
                ))}
          </select>
        </div>

        {!loading && summary && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14,
            padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800,
            background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}`
          }}>
            Status: {summary.statusLabel}
            <span style={{ opacity: 0.7, fontWeight: 600 }}>
              · {summary.paidShiftCount} shift lunas · {summary.unpaidShiftCount} belum
            </span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 16px", textAlign: "center" }}>
                <div style={{ height: 10, width: 70, borderRadius: 4, background: "var(--border)", margin: "0 auto 12px", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                <div style={{ height: 24, width: 100, borderRadius: 6, background: "var(--border)", margin: "0 auto", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
              </div>
            ))
          ) : SUMMARY.map((s) => (
            <div key={s.label} style={{ background: s.bg, border: "1px solid var(--border)", borderRadius: 14, padding: "18px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-light)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: "var(--font-nunito, sans-serif)" }}>{s.value}</div>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="Status Shift" subtitle="Shift yang sudah dan belum dibayar untuk staff ini">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "#fff", border: "1px solid var(--success-border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: "#EAFAF1", fontSize: 12, fontWeight: 800, color: "#27AE60" }}>
              Sudah Dibayar ({loading ? "..." : paid.length})
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", padding: "8px 14px" }}>
              {!loading && paid.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--muted-light)", padding: "8px 0" }}>Belum ada shift lunas</p>
              ) : paid.map((row) => (
                <p key={row.id} style={{ fontSize: 12, margin: "6px 0", color: "var(--muted)" }}>
                  {formatDateID(row.date)} · {shiftLabel(row.shift)} · <strong>{rupiah(row.final_salary)}</strong>
                </p>
              ))}
            </div>
          </div>
          <div style={{ background: "#fff", border: "1px solid var(--warning-border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: "var(--warning-bg)", fontSize: 12, fontWeight: 800, color: "var(--warning)" }}>
              Belum Dibayar ({loading ? "..." : unpaid.length})
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", padding: "8px 14px" }}>
              {!loading && unpaid.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--muted-light)", padding: "8px 0" }}>Semua shift sudah lunas 🎉</p>
              ) : unpaid.map((row) => (
                <p key={row.id} style={{ fontSize: 12, margin: "6px 0", color: "var(--muted)" }}>
                  {formatDateID(row.date)} · {shiftLabel(row.shift)} · <strong>{rupiah(row.final_salary)}</strong>
                </p>
              ))}
            </div>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Proses Pembayaran" subtitle="Pilih metode input, lihat pratinjau, lalu simpan dengan bukti transfer">
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {([
            { id: "amount" as const, label: "Input Nominal", desc: "Masukkan jumlah transfer — sistem tentukan shift yang lunas" },
            { id: "dates" as const, label: "Pilih Tanggal Kerja", desc: "Centang shift — sistem hitung total bayar" }
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPayMode(tab.id)}
              style={{
                flex: "1 1 200px", textAlign: "left", padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                border: payMode === tab.id ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: payMode === tab.id ? "rgba(192,57,43,.04)" : "#fff"
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{tab.label}</p>
              <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>{tab.desc}</p>
            </button>
          ))}
        </div>

        <form onSubmit={pay}>
          {payMode === "amount" ? (
            <div style={{ marginBottom: 14, maxWidth: 320 }}>
              <label className="label">Nominal Pembayaran (Rp)<span style={{ color: "var(--danger)" }}>*</span></label>
              <input
                className="field"
                type="number"
                min="1"
                placeholder="Contoh: 350000"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                required
              />
              <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                Shift ditandai lunas dari tanggal terlama. Satu shift hanya lunas jika nominal mencukupi gaji penuh shift itu.
              </p>
            </div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label className="label" style={{ margin: 0 }}>Pilih Shift Belum Dibayar<span style={{ color: "var(--danger)" }}>*</span></label>
                {unpaid.length > 0 && (
                  <button type="button" className="btn btn-soft" style={{ fontSize: 11, padding: "4px 10px" }} onClick={selectAllUnpaid}>
                    Pilih semua
                  </button>
                )}
              </div>
              <div style={{
                background: "#fff", border: "1px solid var(--border)", borderRadius: 12,
                maxHeight: 260, overflowY: "auto"
              }}>
                {unpaid.length === 0 ? (
                  <p style={{ padding: 16, fontSize: 13, color: "var(--muted-light)", textAlign: "center" }}>
                    Tidak ada shift yang perlu dibayar
                  </p>
                ) : unpaid.map((row) => (
                  <label
                    key={row.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                      borderBottom: "1px solid var(--border)", cursor: "pointer",
                      background: selectedIds.includes(row.id) ? "rgba(41,128,185,.06)" : "transparent"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleShift(row.id)}
                    />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{formatDateID(row.date)}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{shiftLabel(row.shift)}</span>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>{rupiah(row.final_salary)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <PreviewPanel
              mode={payMode}
              payAmount={payMode === "amount" ? payAmount : (previewAllocation?.totalCovered ?? 0)}
              allocation={previewAllocation}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 14, maxWidth: 480 }}>
            <div>
              <label className="label">Catatan</label>
              <input className="field" placeholder="Opsional" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Bukti Pembayaran (foto/screenshot transfer)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10, border: "1.5px dashed var(--border)",
                background: "var(--surface-soft)", fontSize: 12, fontWeight: 600, color: "var(--muted)",
                cursor: proofUploading ? "wait" : "pointer",
                opacity: proofUploading ? 0.6 : 1
              }}>
                {proofUploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <ImageIcon size={14} />}
                {proofUploading ? "Mengunggah..." : proofName || "Pilih gambar..."}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} disabled={proofUploading} onChange={onProofChange} />
              </label>
              {proof && !proofUploading && (
                <button
                  type="button"
                  onClick={() => { setProof(""); setProofName(""); if (fileRef.current) fileRef.current.value = ""; }}
                  style={{ fontSize: 11, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
                >
                  Hapus
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ fontSize: 13 }}
            disabled={proofUploading || submitting || !previewAllocation?.covered.length}
            title={!previewAllocation?.covered.length ? "Lengkapi input dan pastikan ada shift yang terpilih" : ""}
          >
            <Save size={15} /> {submitting ? "Memproses..." : "Proses Bayar"}
          </button>
        </form>
      </AdminSection>

      {!loading && payments.length > 0 && (
        <AdminSection title={`Riwayat Pembayaran (${payments.length})`} subtitle="Semua pembayaran yang sudah diproses untuk staff ini">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {payments.map((payment) => (
              <div key={payment.id} style={{
                background: "#fff", border: "1px solid var(--success-border)", borderRadius: 12,
                padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)", marginBottom: 2 }}>
                    {formatDateID(payment.paid_at.slice(0, 10))}
                  </p>
                  {payment.date_from && payment.date_to && (
                    <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>
                      Shift: {formatDateID(payment.date_from)}
                      {payment.date_from !== payment.date_to ? ` – ${formatDateID(payment.date_to)}` : ""}
                    </p>
                  )}
                  {payment.note && (
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>
                      {payment.note.replace(/\[LEBIH_BAYAR:\d+\]/g, "").replace(/\[MODE:\w+\]/g, "").trim() || null}
                    </p>
                  )}
                  {payment.proof_url && (
                    <a href={payment.proof_url} target="_blank" rel="noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--primary)", marginTop: 4 }}>
                      🧾 Lihat Bukti
                    </a>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontFamily: "var(--font-nunito,sans-serif)", fontSize: 18, fontWeight: 900, color: "var(--success)" }}>
                    {rupiah(payment.amount)}
                  </p>
                  <span className="status-pill status-ok" style={{ fontSize: 10 }}>Dibayar</span>
                </div>
              </div>
            ))}
          </div>
        </AdminSection>
      )}
    </AdminPage>
  );
}
