"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Clock, Receipt, RefreshCw, Sparkles } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";
import {
  PayrollHero,
  PayrollPaymentCard,
  PayrollSectionHeader,
  PayrollWorkDaySummary,
  type PayrollSummaryView
} from "@/components/payroll/payroll-ui";
import { SaldoTertahanPopup, hasSaldoAck } from "@/components/payroll/saldo-tertahan-popup";
import { apiFetch } from "@/lib/client-api";
import { formatDateWithDayID, hhmm, rupiah } from "@/lib/format";
import { isShiftCounted, shiftLabel } from "@/lib/payroll";

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

/** Label periode gaji berikutnya berdasarkan bulan pembayaran terakhir. */
function nextPeriodLabel(lastPaidAt: string | null): string {
  const base = lastPaidAt ? new Date(`${lastPaidAt.slice(0, 10)}T00:00:00`) : null;
  if (!base || Number.isNaN(base.getTime())) return "periode gaji berikutnya";
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return `periode gaji berikutnya (${MONTHS_ID[next.getMonth()]} ${next.getFullYear()})`;
}

type AttendanceRow = {
  id: string;
  date: string;
  shift: number;
  checkin_time: string | null;
  checkout_time: string | null;
  status: string;
  late_minutes: number;
  deduction: number;
  final_salary: number;
  paid_status: boolean;
  flags: string | null;
};

type PayrollPayload = {
  ok: true;
  summary: PayrollSummaryView;
  staff: { id: string; name: string };
  attendance: AttendanceRow[];
  payments: Array<{
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
  }>;
  outlet: { shift1_start: string | null; shift2_start: string | null } | null;
  config: { lateToleranceMinutes: number; deductionPerMinute: number };
};

type SaldoPopupState = {
  staffId: string;
  staffName: string;
  saldo: number;
  periodKey: string;
  nextLabel: string;
};

function shiftStartLabel(row: AttendanceRow, outlet: PayrollPayload["outlet"]): string | null {
  if (!outlet) return null;
  const start = row.shift === 2 ? outlet.shift2_start : outlet.shift1_start;
  return start ? start.slice(0, 5) : null;
}

function LateDetail({
  row,
  outlet,
  config
}: {
  row: AttendanceRow;
  outlet: PayrollPayload["outlet"];
  config: PayrollPayload["config"];
}) {
  if (!row.late_minutes || row.late_minutes <= 0) return null;
  const shiftLbl = row.shift === 0 ? "Full Shift" : `Shift ${row.shift}`;
  const jadwalMasuk = shiftStartLabel(row, outlet);

  return (
    <div style={{
      background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
      borderRadius: 10, padding: "10px 12px", marginBottom: 8
    }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: "var(--warning)", marginBottom: 6 }}>
        Detail keterlambatan
      </p>
      <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.6 }}>
        <p>
          <strong>{formatDateWithDayID(row.date)}</strong> ({shiftLbl}) — telat{" "}
          <strong>{row.late_minutes} menit</strong>
          {jadwalMasuk && (
            <> · jadwal masuk <strong>{jadwalMasuk} WITA</strong>, absen <strong>{hhmm(row.checkin_time) || "—"} WITA</strong></>
          )}
        </p>
        <p style={{ fontWeight: 800, color: "var(--danger)", marginTop: 4 }}>
          {row.late_minutes} × {rupiah(config.deductionPerMinute)} = −{rupiah(row.deduction)}
        </p>
      </div>
    </div>
  );
}

/**
 * Indikator transparansi per shift: apakah shift dihitung ke gaji.
 * Gaji hanya dihitung jika absen masuk + absen keluar lengkap.
 */
function CountedBadge({ row }: { row: AttendanceRow }) {
  let label: string;
  let tone: "ok" | "danger";
  if (!row.checkin_time) {
    label = "Absen Masuk Tidak Tercatat";
    tone = "danger";
  } else if (!row.checkout_time) {
    label = "Tidak Terhitung";
    tone = "danger";
  } else {
    label = "Terhitung";
    tone = "ok";
  }

  const colors = tone === "ok"
    ? { bg: "var(--success-bg)", border: "var(--success-border)", text: "var(--success)" }
    : { bg: "var(--danger-bg)", border: "var(--danger-border)", text: "var(--danger)" };

  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 9px", borderRadius: 999, marginBottom: 8,
        background: colors.bg, border: `1px solid ${colors.border}`,
        fontSize: 11, fontWeight: 800, color: colors.text
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.text, display: "inline-block" }} />
      {label}
    </span>
  );
}

function PayrollSkeleton() {
  return (
    <div className="payroll-stack">
      <div className="payroll-hero" style={{ minHeight: 140 }}>
        <div style={{ height: 12, width: 100, borderRadius: 4, background: "var(--border)", marginBottom: 12, animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
        <div style={{ height: 28, width: 160, borderRadius: 6, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
      </div>
      {[1, 2].map((i) => (
        <div key={i} style={{ height: 120, borderRadius: 16, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

export default function StaffPayrollPage() {
  const [data, setData] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [saldoPopup, setSaldoPopup] = useState<SaldoPopupState | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<PayrollPayload>("/api/staff/payroll", { role: "staff" }));
    } catch (err) {
      setError(err instanceof Error
        ? (err.message.includes("fetch") || err.message.includes("Failed to fetch")
            ? "Data belum berhasil dimuat. Periksa koneksi internet lalu coba lagi."
            : err.message)
        : "Gagal memuat data gaji. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Popup saldo tertahan: tampil sekali per periode setelah gaji dibayar,
  // hanya jika masih ada saldo tertahan (> 0) dan belum di-acknowledge.
  useEffect(() => {
    if (!data) return;
    const saldo = data.summary?.balance ?? 0;
    if (saldo <= 0) return;                       // tidak ada saldo tertahan
    const lastPayment = data.payments?.[0];       // sudah terurut paid_at desc
    if (!lastPayment) return;                     // gaji belum pernah dibayar

    const staffId = data.staff?.id;
    const staffName = data.staff?.name;
    if (!staffId || !staffName) {
      console.warn("[SaldoTertahan] data staff tidak lengkap, popup dilewati");
      return;
    }
    const periodKey = (lastPayment.paid_at || "").slice(0, 7); // YYYY-MM
    if (!periodKey) {
      console.warn("[SaldoTertahan] periode pembayaran tidak valid, popup dilewati");
      return;
    }
    if (hasSaldoAck(staffId, periodKey)) return;  // sudah dilihat untuk periode ini

    setSaldoPopup({
      staffId,
      staffName,
      saldo,
      periodKey,
      nextLabel: nextPeriodLabel(lastPayment.paid_at)
    });
  }, [data]);

  const summary = data?.summary;

  return (
    <StaffPage title="Info Gaji" subtitle="Ringkasan pembayaran dan rincian per shift">
      <button
        className="btn btn-soft"
        style={{ fontSize: 12, padding: "9px 14px", alignSelf: "flex-start" }}
        onClick={load}
        disabled={loading}
      >
        <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
        {loading ? "Memuat..." : "Refresh"}
      </button>

      {error ? (
        <div style={{
          background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
          borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "var(--danger)"
        }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <PayrollSkeleton />
      ) : summary ? (
        <div className="payroll-stack">
          {/* 1. Ringkasan gaji */}
          <PayrollHero summary={summary} />

          {/* 2. Riwayat Pembayaran — ditaruh di atas agar slip gaji langsung terlihat */}
          <section>
            <PayrollSectionHeader icon={Receipt} title="Riwayat Pembayaran" />
            {(data!.payments).length === 0 ? (
              <p className="payroll-empty">Belum ada pembayaran tercatat</p>
            ) : (
              <div className="payroll-stack">
                {data!.payments.map((payment) => (
                  <PayrollPaymentCard
                    key={payment.id}
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
                    slipHref={`/app/payslip/${payment.id}`}
                    showNetAmount
                  />
                ))}
              </div>
            )}
          </section>

          {/* 3. Ringkasan hari kerja (paid vs unpaid) */}
          <PayrollWorkDaySummary summary={summary} />

          {/* 4. Rincian per shift — collapsed by default */}
          <section>
            <button
              type="button"
              className="payroll-detail-toggle"
              onClick={() => setShowDetails((v) => !v)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={15} color="var(--primary)" />
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>Rincian per Shift</span>
                {data!.attendance.length > 0 && (
                  <span className="status-pill" style={{ fontSize: 10 }}>
                    {data!.attendance.length} shift
                  </span>
                )}
              </div>
              {showDetails
                ? <ChevronUp size={16} color="var(--muted)" />
                : <ChevronDown size={16} color="var(--muted)" />}
            </button>

            {showDetails && (
              <div className="payroll-stack" style={{ marginTop: 10 }}>
                {data!.attendance.length === 0 ? (
                  <p className="payroll-empty">Belum ada data absensi</p>
                ) : (
                  data!.attendance.map((row) => (
                    <article
                      key={row.id}
                      className={`payroll-detail-card ${row.paid_status ? "paid" : "unpaid"}`}
                    >
                      <div className="payroll-detail-card-head">
                        <div>
                          <p className="payroll-detail-date">{formatDateWithDayID(row.date)}</p>
                          <span className="payroll-shift-badge" style={{ marginTop: 6, display: "inline-block" }}>
                            {shiftLabel(row.shift)}
                          </span>
                        </div>
                        <span className={`status-pill ${row.paid_status ? "status-ok" : "status-warn"}`}>
                          {row.paid_status ? "Lunas" : "Belum dibayar"}
                        </span>
                      </div>

                      <p className="payroll-detail-time">
                        <Clock size={13} />
                        {hhmm(row.checkin_time) || "—"} → {hhmm(row.checkout_time) || "Belum pulang"}
                      </p>

                      <div>
                        <CountedBadge row={row} />
                      </div>

                      {row.late_minutes > 0 && (
                        <LateDetail row={row} outlet={data!.outlet} config={data!.config} />
                      )}

                      {row.deduction > 0 && (
                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "6px 10px", borderRadius: 8, marginBottom: 6,
                          background: "var(--warning-bg)", fontSize: 11, fontWeight: 700, color: "var(--warning)"
                        }}>
                          <span>Telat {row.late_minutes} menit</span>
                          <span style={{ color: "var(--danger)" }}>−{rupiah(row.deduction)}</span>
                        </div>
                      )}

                      {String(row.flags || "").includes("FULL_SHIFT_2X") && (
                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "6px 10px", borderRadius: 8, marginBottom: 6,
                          background: "rgba(79,70,229,0.07)", border: "1px solid rgba(79,70,229,0.15)",
                          fontSize: 11, fontWeight: 700, color: "#4338CA"
                        }}>
                          Full Shift · Gaji 2×
                          <span className="status-pill" style={{ background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", fontSize: 10 }}>
                            Bonus
                          </span>
                        </div>
                      )}

                      <div className="payroll-salary-bar">
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Gaji shift</span>
                        {isShiftCounted(row) ? (
                          <span style={{
                            fontFamily: "var(--font-nunito,sans-serif)", fontSize: 16, fontWeight: 900,
                            color: row.paid_status ? "var(--success)" : "var(--warning)"
                          }}>
                            {rupiah(row.final_salary)}
                          </span>
                        ) : (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            fontSize: 13, fontWeight: 800, color: "var(--danger)"
                          }}>
                            <s style={{ color: "var(--muted)", fontWeight: 700 }}>{rupiah(row.final_salary)}</s>
                            Tidak dihitung
                          </span>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {saldoPopup && (
        <SaldoTertahanPopup
          staffId={saldoPopup.staffId}
          staffName={saldoPopup.staffName}
          saldoTertahan={saldoPopup.saldo}
          periodKey={saldoPopup.periodKey}
          nextPeriodLabel={saldoPopup.nextLabel}
          onClose={() => setSaldoPopup(null)}
        />
      )}
    </StaffPage>
  );
}
