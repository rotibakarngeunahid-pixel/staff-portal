"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID, formatDateWithDayID, hhmm, rupiah } from "@/lib/format";
import { shiftLabel, type PayrollPaymentStatus } from "@/lib/payroll";

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

type PayrollSummary = {
  totalEarned: number;
  totalPaid: number;
  balance: number;
  status: PayrollPaymentStatus;
  statusLabel: string;
  paidShiftCount: number;
  unpaidShiftCount: number;
  paidShifts: Array<{ id: string; date: string; shift: number; final_salary: number }>;
  unpaidShifts: Array<{ id: string; date: string; shift: number; final_salary: number }>;
};

type PayrollPayload = {
  ok: true;
  summary: PayrollSummary;
  attendance: AttendanceRow[];
  payments: Array<{
    id: string;
    paid_at: string;
    amount: number;
    note: string | null;
    proof_url: string | null;
    date_from: string | null;
    date_to: string | null;
  }>;
  outlet: { shift1_start: string | null; shift2_start: string | null } | null;
  config: { lateToleranceMinutes: number; deductionPerMinute: number };
};

const STATUS_STYLE: Record<PayrollPaymentStatus, { bg: string; color: string; border: string }> = {
  lunas: { bg: "var(--success-bg)", color: "var(--success)", border: "var(--success-border)" },
  sebagian: { bg: "var(--warning-bg)", color: "var(--warning)", border: "var(--warning-border)" },
  belum_lunas: { bg: "rgba(192,57,43,.06)", color: "var(--primary)", border: "rgba(192,57,43,.2)" }
};

function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  return hhmm(isoString) || "—";
}

function shiftStartLabel(row: AttendanceRow, outlet: PayrollPayload["outlet"]): string | null {
  if (!outlet) return null;
  const start = row.shift === 2 ? outlet.shift2_start : outlet.shift1_start;
  if (!start) return null;
  return start.slice(0, 5);
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

  const dateLabel = formatDateWithDayID(row.date);
  const shiftLbl = row.shift === 0 ? "Full Shift" : `Shift ${row.shift}`;
  const jadwalMasuk = shiftStartLabel(row, outlet);
  const actualMasuk = formatTime(row.checkin_time);
  const lateMin = row.late_minutes;
  const deductPer = config.deductionPerMinute;
  const totalPotongan = row.deduction;

  return (
    <div style={{
      background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
      borderRadius: 10, padding: "10px 12px", marginBottom: 8
    }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: "var(--warning)", marginBottom: 6 }}>
        ⚠️ Detail Keterlambatan
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "#78350F", lineHeight: 1.6 }}>
        <p>
          Pada tanggal <strong>{dateLabel}</strong> ({shiftLbl}), Anda terlambat{" "}
          <strong>{lateMin} menit</strong>.
        </p>
        {jadwalMasuk && (
          <p>
            Jadwal masuk seharusnya pukul <strong>{jadwalMasuk} WITA</strong>,
            tetapi Anda absen masuk pada pukul <strong>{actualMasuk} WITA</strong>.
          </p>
        )}
        {!jadwalMasuk && (
          <p>
            Jam absen masuk: <strong>{actualMasuk} WITA</strong>.
          </p>
        )}
        <p>
          Berdasarkan aturan potongan{" "}
          <strong>{rupiah(deductPer)} per menit</strong>, maka potongan keterlambatan adalah:
        </p>
        <p style={{ fontWeight: 800, color: "var(--danger)" }}>
          {lateMin} menit × {rupiah(deductPer)} = {rupiah(totalPotongan)}
        </p>
      </div>
    </div>
  );
}

function ShiftDateList({
  title,
  shifts,
  variant
}: {
  title: string;
  shifts: PayrollSummary["paidShifts"];
  variant: "paid" | "unpaid";
}) {
  if (!shifts.length) return null;
  const isPaid = variant === "paid";
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${isPaid ? "var(--success-border)" : "var(--warning-border)"}`,
      borderRadius: 12, padding: "12px 14px", marginBottom: 8
    }}>
      <p style={{
        fontSize: 12, fontWeight: 800, marginBottom: 8,
        color: isPaid ? "var(--success)" : "var(--warning)"
      }}>
        {title} ({shifts.length})
      </p>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
        {shifts.map((row) => (
          <li key={row.id}>
            {formatDateWithDayID(row.date)} · {shiftLabel(row.shift)} · {rupiah(row.final_salary)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StaffPayrollPage() {
  const [data, setData] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const summary = data?.summary;
  const status = summary?.status || "belum_lunas";
  const statusStyle = STATUS_STYLE[status];

  return (
    <StaffPage title="Info Gaji" subtitle="Ringkasan gaji, status pembayaran, dan rincian per shift">
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
          ⚠️ {error}
        </div>
      ) : null}

      {loading ? (
        <div className="pay-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className={i === 1 ? "pay-card-full" : "pay-card"}>
              <div style={{ height: 10, width: 80, borderRadius: 4, background: "var(--border)", margin: "0 auto 10px", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
              <div style={{ height: 22, width: 110, borderRadius: 6, background: "var(--border)", margin: "0 auto", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "10px 16px", borderRadius: 12, marginBottom: 4,
            background: statusStyle.bg, border: `1px solid ${statusStyle.border}`,
            fontSize: 14, fontWeight: 900, color: statusStyle.color
          }}>
            Status Pembayaran: {summary?.statusLabel || "Belum Lunas"}
          </div>

          <div className="pay-grid">
            <div className="pay-card-full">
              <p className="pay-label">Total Gaji</p>
              <p className="pay-val">{rupiah(summary?.totalEarned || 0)}</p>
            </div>
            <div className="pay-card">
              <p className="pay-label">Sudah Dibayar</p>
              <p className="pay-val" style={{ color: "var(--success)" }}>{rupiah(summary?.totalPaid || 0)}</p>
            </div>
            <div className="pay-card">
              <p className="pay-label">Sisa Gaji</p>
              <p className="pay-val" style={{ color: summary?.balance ? "var(--primary)" : "var(--muted-light)" }}>
                {rupiah(summary?.balance || 0)}
              </p>
            </div>
          </div>

          {!loading && summary && (summary.paidShifts.length > 0 || summary.unpaidShifts.length > 0) && (
            <div style={{ marginTop: 4, marginBottom: 8 }}>
              <h2 style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>Ringkasan Hari Kerja</h2>
              <ShiftDateList title="Sudah dibayar" shifts={summary.paidShifts} variant="paid" />
              <ShiftDateList title="Belum dibayar" shifts={summary.unpaidShifts} variant="unpaid" />
              <p style={{ fontSize: 11, color: "var(--muted-light)", lineHeight: 1.5, padding: "0 4px" }}>
                {summary.status === "sebagian"
                  ? "Sebagian gaji sudah ditransfer. Shift di bawah \"Sudah dibayar\" sudah lunas; sisanya menunggu pembayaran berikutnya."
                  : summary.status === "lunas"
                    ? "Seluruh gaji shift Anda sudah dibayar."
                    : "Belum ada pembayaran yang dicatat. Gaji akan diperbarui setelah admin memproses transfer."}
              </p>
            </div>
          )}
        </>
      )}

      <div>
        <h2 style={{ fontSize: 14, fontWeight: 900, marginBottom: 10, marginTop: 4 }}>Rincian Shift</h2>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 14, padding: "14px",
                border: "1px solid var(--border)", boxShadow: "var(--shadow-xs)"
              }}>
                <div style={{ height: 13, width: 140, borderRadius: 4, background: "var(--border)", marginBottom: 8, animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                <div style={{ height: 11, width: 100, borderRadius: 4, background: "var(--border)", marginBottom: 10, animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                <div style={{ height: 16, width: 90, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
              </div>
            ))}
          </div>
        ) : (data?.attendance || []).length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted-light)", textAlign: "center", padding: "20px 0" }}>
            Belum ada data absensi
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data?.attendance || []).map((row) => (
              <div
                key={row.id}
                style={{
                  background: "#fff",
                  border: `1px solid ${row.paid_status ? "var(--success-border)" : "var(--warning-border)"}`,
                  borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "var(--shadow-xs)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>
                      {formatDateWithDayID(row.date)}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.3px",
                      background: "var(--surface-soft)", color: "var(--muted)",
                      border: "1px solid var(--border)", borderRadius: 6, padding: "2px 7px"
                    }}>
                      {row.shift === 0 ? "Full Shift" : `Shift ${row.shift}`}
                    </span>
                  </div>
                  <span className={`status-pill ${row.paid_status ? "status-ok" : "status-warn"}`}
                    style={{ flexShrink: 0, fontSize: 11 }}>
                    {row.paid_status ? "Lunas" : "Belum dibayar"}
                  </span>
                </div>

                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                  🕐 {hhmm(row.checkin_time) || "—"} → {hhmm(row.checkout_time) || "Belum pulang"}
                </p>

                {row.late_minutes > 0 && data && (
                  <LateDetail row={row} outlet={data.outlet} config={data.config} />
                )}

                {row.deduction > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "var(--warning-bg)", borderRadius: 8, padding: "5px 10px",
                    marginBottom: 6
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)" }}>
                      ⚠️ Telat {row.late_minutes} menit
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--danger)" }}>-{rupiah(row.deduction)}</span>
                  </div>
                )}

                {String(row.flags || "").includes("FULL_SHIFT_2X") && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "rgba(79,70,229,0.07)", borderRadius: 8, padding: "5px 10px",
                    marginBottom: 6, border: "1px solid rgba(79,70,229,0.15)"
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#4338CA" }}>🌟 Full Shift · Gaji 2×</span>
                    <span className="status-pill" style={{ background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", fontSize: 10 }}>Bonus aktif</span>
                  </div>
                )}

                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: row.paid_status ? "var(--success-bg)" : "var(--warning-bg)",
                  borderRadius: 8, padding: "7px 10px",
                  border: `1px solid ${row.paid_status ? "var(--success-border)" : "var(--warning-border)"}`
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: row.paid_status ? "var(--success)" : "var(--warning)" }}>
                    Gaji shift ini
                  </span>
                  <span style={{
                    fontFamily: "var(--font-nunito,sans-serif)", fontSize: 15, fontWeight: 900,
                    color: row.final_salary > 0 ? (row.paid_status ? "var(--success)" : "var(--warning)") : "var(--muted)"
                  }}>
                    {rupiah(row.final_salary)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: 14, fontWeight: 900, marginBottom: 10, marginTop: 4 }}>Riwayat Pembayaran</h2>

        {loading ? (
          <div style={{ height: 14, width: 120, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
        ) : (data?.payments || []).length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted-light)", textAlign: "center", padding: "20px 0" }}>
            Belum ada pembayaran
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data?.payments || []).map((payment) => (
              <div
                key={payment.id}
                style={{
                  background: "#fff", border: "1px solid var(--success-border)", borderRadius: 14,
                  padding: "12px 14px", boxShadow: "var(--shadow-xs)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: payment.date_from ? 6 : 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 2 }}>
                      Dibayar {formatDateID(payment.paid_at.slice(0, 10))}
                    </p>
                    {payment.date_from && payment.date_to && (
                      <p style={{ fontSize: 11, color: "var(--muted)" }}>
                        Shift: {formatDateID(payment.date_from)}
                        {payment.date_from !== payment.date_to ? ` – ${formatDateID(payment.date_to)}` : ""}
                      </p>
                    )}
                    {payment.note && (
                      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {payment.note.replace(/\[LEBIH_BAYAR:\d+\]/g, "").replace(/\[MODE:\w+\]/g, "").trim() || null}
                      </p>
                    )}
                  </div>
                  <p style={{
                    fontFamily: "var(--font-nunito,sans-serif)", fontSize: 16, fontWeight: 900,
                    color: "var(--success)", flexShrink: 0
                  }}>
                    {rupiah(payment.amount)}
                  </p>
                </div>
                {payment.proof_url && (
                  <a
                    href={payment.proof_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11,
                      fontWeight: 700, color: "var(--primary)", textDecoration: "none",
                      background: "var(--primary-bg, #EEF2FF)", borderRadius: 8, padding: "4px 10px",
                      border: "1px solid var(--primary-border, #C7D2FE)"
                    }}
                  >
                    🧾 Lihat Bukti Pembayaran
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </StaffPage>
  );
}
