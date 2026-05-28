"use client";

import {
  AlertCircle,
  Banknote,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  FileText,
  Sparkles,
  Wallet
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

export function PayrollPaymentCard({
  paidAt,
  amount,
  dateFrom,
  dateTo,
  note,
  proofUrl
}: {
  paidAt: string;
  amount: number;
  dateFrom: string | null;
  dateTo: string | null;
  note: string | null;
  proofUrl: string | null;
}) {
  const cleanNote = note
    ?.replace(/\[LEBIH_BAYAR:\d+\]/g, "")
    .replace(/\[MODE:\w+\]/g, "")
    .trim();

  return (
    <div className="payroll-payment-card">
      <div className="payroll-payment-card-top">
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)", marginBottom: 4 }}>
            Transfer {formatDateID(paidAt.slice(0, 10))}
          </p>
          {dateFrom && dateTo && (
            <p style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>
              <CalendarCheck size={12} />
              {formatDateID(dateFrom)}
              {dateFrom !== dateTo ? ` – ${formatDateID(dateTo)}` : ""}
            </p>
          )}
          {cleanNote ? (
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, display: "flex", gap: 5, alignItems: "flex-start" }}>
              <FileText size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              {cleanNote}
            </p>
          ) : null}
        </div>
        <span className="payroll-payment-amount">{rupiah(amount)}</span>
      </div>
      {proofUrl && (
        <a href={proofUrl} target="_blank" rel="noreferrer" className="payroll-proof-link">
          🧾 Lihat bukti pembayaran
        </a>
      )}
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
  allocation
}: {
  mode: "amount" | "dates";
  payAmount: number;
  allocation: AllocationPreview | null;
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
        {allocation.overpayment > 0 && (
          <div className="payroll-preview-stat">
            <p className="k">Lebih bayar</p>
            <p className="v" style={{ color: "#D97706" }}>{rupiah(allocation.overpayment)}</p>
          </div>
        )}
        {allocation.remainingUnpaidSalary > 0 && (
          <div className="payroll-preview-stat">
            <p className="k">Sisa belum bayar</p>
            <p className="v" style={{ color: "var(--primary)" }}>{rupiah(allocation.remainingUnpaidSalary)}</p>
          </div>
        )}
      </div>

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
