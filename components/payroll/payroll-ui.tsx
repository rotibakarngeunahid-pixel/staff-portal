"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Banknote,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  ExternalLink,
  FileText,
  ImageIcon,
  Maximize2,
  Sparkles,
  Wallet,
  X
} from "lucide-react";
import { formatDateID, formatDateWithDayID, rupiah } from "@/lib/format";
import { shiftLabel, type PayrollPaymentStatus } from "@/lib/payroll";

export type ShiftItem = {
  id: string;
  date: string;
  shift: number;
  final_salary: number;
};

export type PayrollSummaryView = {
  totalEarned: number;
  totalPaid: number;
  balance: number;
  status: PayrollPaymentStatus;
  statusLabel: string;
  paidShiftCount: number;
  unpaidShiftCount: number;
  paidShifts: ShiftItem[];
  unpaidShifts: ShiftItem[];
};

const STATUS_ICON = {
  lunas: CheckCircle2,
  sebagian: CircleDollarSign,
  belum_lunas: AlertCircle
} as const;

export function PayrollHero({ summary, compact }: { summary: PayrollSummaryView; compact?: boolean }) {
  const Icon = STATUS_ICON[summary.status];
  const progress = summary.totalEarned > 0
    ? Math.min(100, Math.round((summary.totalPaid / summary.totalEarned) * 100))
    : 0;

  return (
    <div className="payroll-hero">
      <div className="payroll-hero-top">
        <div>
          <p className="payroll-hero-title">Total Gaji Diperoleh</p>
          <p className="payroll-hero-amount">{rupiah(summary.totalEarned)}</p>
        </div>
        <span className={`payroll-status-badge ${summary.status}`}>
          <Icon size={14} strokeWidth={2.5} />
          {summary.statusLabel}
        </span>
      </div>

      <div className="payroll-progress-wrap">
        <div className="payroll-progress-meta">
          <span>Progres pembayaran</span>
          <span>{progress}%</span>
        </div>
        <div className="payroll-progress-track">
          <div className="payroll-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {!compact && (
        <div className="payroll-stat-row">
          <div className="payroll-stat-item paid">
            <p className="label">Sudah dibayar</p>
            <p className="value">{rupiah(summary.totalPaid)}</p>
          </div>
          <div className={`payroll-stat-item balance ${summary.balance <= 0 ? "zero" : ""}`}>
            <p className="label">Sisa gaji</p>
            <p className="value">{rupiah(summary.balance)}</p>
          </div>
          <div className="payroll-stat-item">
            <p className="label">Shift</p>
            <p className="value">{summary.paidShiftCount}/{summary.paidShiftCount + summary.unpaidShiftCount}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function PayrollShiftPanel({
  title,
  shifts,
  variant,
  emptyText
}: {
  title: string;
  shifts: ShiftItem[];
  variant: "paid" | "unpaid";
  emptyText?: string;
}) {
  const HeadIcon = variant === "paid" ? CheckCircle2 : Clock;

  return (
    <div className={`payroll-shift-panel ${variant}`}>
      <div className="payroll-shift-panel-head">
        <div className="title">
          <HeadIcon size={16} strokeWidth={2.5} />
          {title}
        </div>
        <span className="count">{shifts.length}</span>
      </div>
      <div className="payroll-shift-panel-body">
        {shifts.length === 0 ? (
          <p className="payroll-empty" style={{ padding: "16px 8px" }}>{emptyText || "Tidak ada data"}</p>
        ) : (
          shifts.map((row) => (
            <div key={row.id} className="payroll-shift-row">
              <span className="payroll-shift-row-dot" />
              <div className="payroll-shift-row-main">
                <p className="payroll-shift-row-date">{formatDateWithDayID(row.date)}</p>
                <div className="payroll-shift-row-meta">
                  <span className="payroll-shift-badge">{shiftLabel(row.shift)}</span>
                </div>
              </div>
              <span className="payroll-shift-row-amount">{rupiah(row.final_salary)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function PayrollWorkDaySummary({ summary }: { summary: PayrollSummaryView }) {
  if (!summary.paidShifts.length && !summary.unpaidShifts.length) return null;

  const hint =
    summary.status === "sebagian"
      ? "Sebagian gaji sudah ditransfer. Shift di panel hijau sudah lunas; panel kuning menunggu pembayaran berikutnya."
      : summary.status === "lunas"
        ? "Seluruh gaji shift Anda sudah dibayar. Terima kasih!"
        : "Belum ada pembayaran yang dicatat. Gaji akan diperbarui setelah admin memproses transfer.";

  return (
    <section>
      <h2 className="payroll-section-title">
        <span className="icon"><CalendarDays size={15} /></span>
        Ringkasan Hari Kerja
      </h2>
      <PayrollShiftPanel
        title="Sudah dibayar"
        shifts={summary.paidShifts}
        variant="paid"
        emptyText="Belum ada shift yang lunas"
      />
      <PayrollShiftPanel
        title="Belum dibayar"
        shifts={summary.unpaidShifts}
        variant="unpaid"
        emptyText="Semua shift sudah lunas"
      />
      <p className="payroll-hint">{hint}</p>
    </section>
  );
}

export type PaymentProofItem = {
  id: string;
  paid_at: string;
  amount: number;
  proof_url: string | null;
  date_from?: string | null;
  date_to?: string | null;
};

function ProofImageModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="payroll-proof-modal-backdrop" onClick={onClose} role="presentation">
      <div className="payroll-proof-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="payroll-proof-modal-close" onClick={onClose} aria-label="Tutup">
          <X size={18} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Bukti pembayaran" />
      </div>
    </div>
  );
}

/** Panel bukti di atas halaman — pratinjau + tab tanpa scroll ke riwayat */
export function PayrollProofPanel({ payments }: { payments: PaymentProofItem[] }) {
  const withProof = payments.filter((p) => p.proof_url);
  const [activeId, setActiveId] = useState("");
  const [modalUrl, setModalUrl] = useState<string | null>(null);

  useEffect(() => {
    const list = payments.filter((p) => p.proof_url);
    if (!list.length) return;
    setActiveId((prev) => (list.some((p) => p.id === prev) ? prev : list[0].id));
  }, [payments]);

  if (!withProof.length) return null;

  const active = withProof.find((p) => p.id === activeId) ?? withProof[0];

  return (
    <section className="payroll-proof-panel">
      <div className="payroll-proof-panel-head">
        <div className="title">
          <ImageIcon size={16} strokeWidth={2.5} />
          Bukti Pembayaran
        </div>
        <span className="status-pill status-ok" style={{ fontSize: 10 }}>{withProof.length} bukti</span>
      </div>

      {withProof.length > 1 && (
        <div className="payroll-proof-tabs">
          {withProof.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`payroll-proof-tab ${p.id === active.id ? "active" : ""}`}
              onClick={() => setActiveId(p.id)}
            >
              <p className="date">{formatDateID(p.paid_at.slice(0, 10))}</p>
              <p className="amt">{rupiah(p.amount)}</p>
            </button>
          ))}
        </div>
      )}

      <div className="payroll-proof-preview">
        {active.date_from && active.date_to && (
          <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <CalendarCheck size={12} />
            Periode shift: {formatDateID(active.date_from)}
            {active.date_from !== active.date_to ? ` – ${formatDateID(active.date_to)}` : ""}
            <span style={{ marginLeft: "auto", fontWeight: 800, color: "var(--success)" }}>{rupiah(active.amount)}</span>
          </p>
        )}
        <div className="payroll-proof-image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={active.proof_url!} alt={`Bukti transfer ${formatDateID(active.paid_at.slice(0, 10))}`} />
        </div>
        <div className="payroll-proof-actions">
          <button type="button" className="btn-proof btn-proof-primary" onClick={() => setModalUrl(active.proof_url!)}>
            <Maximize2 size={14} />
            Perbesar
          </button>
          <a href={active.proof_url!} target="_blank" rel="noreferrer" className="btn-proof btn-proof-soft">
            <ExternalLink size={14} />
            Buka tab baru
          </a>
        </div>
      </div>

      {modalUrl && <ProofImageModal url={modalUrl} onClose={() => setModalUrl(null)} />}
    </section>
  );
}

export function PayrollPaymentCard({
  paidAt,
  amount,
  bonus = 0,
  bonusNote,
  dateFrom,
  dateTo,
  note,
  proofUrl,
  compact,
  slipHref
}: {
  paidAt: string;
  amount: number;
  bonus?: number;
  bonusNote?: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  note: string | null;
  proofUrl: string | null;
  compact?: boolean;
  slipHref?: string;
}) {
  const [modalUrl, setModalUrl] = useState<string | null>(null);
  const cleanNote = note
    ?.replace(/\[LEBIH_BAYAR:\d+\]/g, "")
    .replace(/\[MODE:\w+\]/g, "")
    .trim();

  return (
    <div className="payroll-payment-card">
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)", marginBottom: 3 }}>
            Transfer {formatDateID(paidAt.slice(0, 10))}
          </p>
          {dateFrom && dateTo && (
            <p style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
              <CalendarCheck size={12} />
              {formatDateID(dateFrom)}
              {dateFrom !== dateTo ? ` – ${formatDateID(dateTo)}` : ""}
            </p>
          )}
          {!compact && cleanNote ? (
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, display: "flex", gap: 5, alignItems: "flex-start" }}>
              <FileText size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              {cleanNote}
            </p>
          ) : null}
          <p className="payroll-payment-amount">{rupiah(amount)}</p>
          {bonus > 0 && (
            <p style={{ fontSize: 11, fontWeight: 700, color: "#B45309", marginTop: 3, display: "flex", gap: 5, alignItems: "center" }}>
              <Sparkles size={11} style={{ flexShrink: 0 }} />
              + Bonus {rupiah(bonus)}{bonusNote ? ` — ${bonusNote}` : ""}
            </p>
          )}
        </div>
        {proofUrl && (
          <button
            type="button"
            onClick={() => setModalUrl(proofUrl)}
            aria-label="Lihat bukti transfer"
            style={{
              flexShrink: 0, width: 60, height: 60, borderRadius: 10,
              overflow: "hidden", border: "1.5px solid var(--border)",
              cursor: "pointer", padding: 0, background: "#f8fafc"
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proofUrl} alt="Bukti" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </button>
        )}
      </div>
      {slipHref && (
        <Link
          href={slipHref}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            marginTop: 10, padding: "9px 0", borderRadius: 10,
            background: "linear-gradient(135deg,#F0681A,#F6B800)",
            color: "#fff", fontSize: 12, fontWeight: 800,
            textDecoration: "none", letterSpacing: 0.3
          }}
        >
          <ExternalLink size={13} />
          Lihat Slip Gaji
        </Link>
      )}
      {modalUrl && <ProofImageModal url={modalUrl} onClose={() => setModalUrl(null)} />}
    </div>
  );
}

export function PayrollSectionHeader({
  icon: Icon,
  title
}: {
  icon: typeof Wallet;
  title: string;
}) {
  return (
    <h2 className="payroll-section-title">
      <span className="icon"><Icon size={15} /></span>
      {title}
    </h2>
  );
}

export function PayrollAdminSummaryCards({
  totalEarned,
  totalPaid,
  balance
}: {
  totalEarned: number;
  totalPaid: number;
  balance: number;
}) {
  const cards = [
    { label: "Total Gaji", value: rupiah(totalEarned), bg: "#EBF5FB", color: "#2980B9" },
    { label: "Sudah Dibayar", value: rupiah(totalPaid), bg: "#EAFAF1", color: "#27AE60" },
    { label: "Sisa Gaji", value: rupiah(balance), bg: balance > 0 ? "rgba(192,57,43,.05)" : "#F8F9FA", color: balance > 0 ? "var(--primary)" : "var(--muted-light)" }
  ];

  return (
    <div className="payroll-admin-summary-grid">
      {cards.map((c) => (
        <div key={c.label} className="payroll-admin-summary-card" style={{ background: c.bg }}>
          <p className="label">{c.label}</p>
          <p className="value" style={{ color: c.color }}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

export function PayrollModeTabs({
  mode,
  onChange
}: {
  mode: "amount" | "dates";
  onChange: (m: "amount" | "dates") => void;
}) {
  return (
    <div className="payroll-mode-tabs">
      <button
        type="button"
        className={`payroll-mode-tab ${mode === "amount" ? "active" : ""}`}
        onClick={() => onChange("amount")}
      >
        <div className="tab-icon"><Banknote size={18} /></div>
        <p className="tab-label">Input Nominal</p>
        <p className="tab-desc">Masukkan jumlah transfer — sistem tentukan shift yang lunas (FIFO)</p>
      </button>
      <button
        type="button"
        className={`payroll-mode-tab ${mode === "dates" ? "active" : ""}`}
        onClick={() => onChange("dates")}
      >
        <div className="tab-icon"><CalendarCheck size={18} /></div>
        <p className="tab-label">Pilih Tanggal Kerja</p>
        <p className="tab-desc">Centang shift — sistem hitung total yang harus dibayar</p>
      </button>
    </div>
  );
}

export type AllocationPreview = {
  covered: ShiftItem[];
  uncovered: ShiftItem[];
  totalCovered: number;
  overpayment: number;
  remainingUnpaidSalary: number;
  paidShiftCount: number;
  unpaidShiftCount: number;
};

export function PayrollPreviewPanel({
  mode,
  payAmount,
  allocation,
  currentBalance,
  bonus = 0,
  bonusNote
}: {
  mode: "amount" | "dates";
  payAmount: number;
  allocation: AllocationPreview | null;
  currentBalance?: number;
  bonus?: number;
  bonusNote?: string;
}) {
  if (!allocation?.covered.length) {
    return (
      <div className="payroll-preview empty">
        <Sparkles size={20} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
        {mode === "amount"
          ? "Masukkan nominal untuk melihat shift yang akan ditandai lunas (urut tanggal terlama)."
          : "Centang tanggal kerja untuk melihat total yang harus dibayar."}
      </div>
    );
  }

  return (
    <div className="payroll-preview">
      <p className="payroll-preview-title">
        <Sparkles size={14} />
        Pratinjau Pembayaran
      </p>
      <div className="payroll-preview-stats">
        <div className="payroll-preview-stat">
          <p className="k">Shift lunas</p>
          <p className="v">{allocation.paidShiftCount}</p>
        </div>
        <div className="payroll-preview-stat">
          <p className="k">{mode === "amount" ? "Nominal" : "Total bayar"}</p>
          <p className="v" style={{ color: "#2980B9" }}>{rupiah(mode === "amount" ? payAmount : allocation.totalCovered)}</p>
        </div>
        <div className="payroll-preview-stat">
          <p className="k">Gaji shift</p>
          <p className="v" style={{ color: "#16A34A" }}>{rupiah(allocation.totalCovered)}</p>
        </div>
        {bonus > 0 && (
          <div className="payroll-preview-stat">
            <p className="k">Bonus</p>
            <p className="v" style={{ color: "#D97706" }}>{rupiah(bonus)}</p>
          </div>
        )}
        {bonus > 0 && (
          <div className="payroll-preview-stat">
            <p className="k">Total transfer</p>
            <p className="v" style={{ color: "#C8202B" }}>
              {rupiah((mode === "amount" ? payAmount : allocation.totalCovered) + bonus)}
            </p>
          </div>
        )}
        {allocation.overpayment > 0 && (
          <div className="payroll-preview-stat">
            <p className="k">Lebih bayar</p>
            <p className="v" style={{ color: "#D97706" }}>{rupiah(allocation.overpayment)}</p>
          </div>
        )}
        {(() => {
          const afterBalance = currentBalance !== undefined
            ? Math.max(0, currentBalance - payAmount)
            : allocation.remainingUnpaidSalary;
          return afterBalance > 0 ? (
            <div className="payroll-preview-stat">
              <p className="k">Sisa belum bayar</p>
              <p className="v" style={{ color: "var(--primary)" }}>{rupiah(afterBalance)}</p>
            </div>
          ) : null;
        })()}
      </div>

      {bonus > 0 && bonusNote ? (
        <p className="payroll-hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Keterangan bonus: {bonusNote}
        </p>
      ) : null}

      <div className="payroll-split-grid" style={{ gap: 10 }}>
        <PayrollShiftPanel title="Akan ditandai lunas" shifts={allocation.covered} variant="paid" />
        {allocation.uncovered.length > 0 && (
          <PayrollShiftPanel
            title="Masih belum dibayar"
            shifts={allocation.uncovered.slice(0, 12)}
            variant="unpaid"
          />
        )}
      </div>
      {allocation.uncovered.length > 12 && (
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
          +{allocation.uncovered.length - 12} shift lainnya belum dibayar
        </p>
      )}
    </div>
  );
}

export function PayrollCheckList({
  rows,
  selectedIds,
  onToggle,
  onSelectAll,
  showSelectAll
}: {
  rows: ShiftItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  showSelectAll: boolean;
}) {
  if (!rows.length) {
    return <p className="payroll-empty">Tidak ada shift yang perlu dibayar</p>;
  }

  return (
    <>
      {showSelectAll && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button type="button" className="btn btn-soft" style={{ fontSize: 11, padding: "5px 12px" }} onClick={onSelectAll}>
            Pilih semua ({rows.length})
          </button>
        </div>
      )}
      <div className="payroll-check-list">
        {rows.map((row) => {
          const selected = selectedIds.includes(row.id);
          return (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              className={`payroll-check-row ${selected ? "selected" : ""}`}
              onClick={() => onToggle(row.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(row.id); }}
            >
              <span className="payroll-check-box">{selected ? <Check size={12} strokeWidth={3} /> : null}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700 }}>{formatDateWithDayID(row.date)}</p>
                <span className="payroll-shift-badge">{shiftLabel(row.shift)}</span>
              </div>
              <span style={{ fontFamily: "var(--font-nunito,sans-serif)", fontSize: 14, fontWeight: 900 }}>{rupiah(row.final_salary)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
