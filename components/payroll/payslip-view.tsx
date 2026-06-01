"use client";

import { useRef, useState } from "react";
import { FileImage, FileText, Printer } from "lucide-react";
import { formatDateID, formatDateWithDayID, hhmm, rupiah } from "@/lib/format";

export type PayslipShift = {
  id: string;
  date: string;
  shift: number;
  checkin_time: string | null;
  checkout_time: string | null;
  late_minutes: number;
  deduction: number;
  final_salary: number;
  flags: string | null;
};

export type PayslipData = {
  payment: {
    id: string;
    paid_at: string;
    amount: number;
    note: string | null;
    date_from: string | null;
    date_to: string | null;
    proof_url: string | null;
  };
  staff: {
    name: string;
    salary_per_shift: number;
    phone: string | null;
  };
  outlet: {
    name: string;
    shift1_start: string | null;
    shift1_end: string | null;
    shift2_start: string | null;
    shift2_end: string | null;
  } | null;
  shifts: PayslipShift[];
  summary: {
    totalEarned: number;
    totalPaid: number;
    balance: number;
    thisPaymentAmount: number;
    coveredShiftCount: number;
    paymentNumber: number;
    totalPayments: number;
  };
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function shiftName(shift: number) {
  if (shift === 0) return "Full Shift";
  return `Shift ${shift}`;
}

function slipNumber(paymentId: string, paymentNumber: number) {
  const shortId = paymentId.replace(/-/g, "").toUpperCase().slice(0, 8);
  return `RBN-${String(paymentNumber).padStart(3, "0")}-${shortId}`;
}

function periodLabel(dateFrom: string | null, dateTo: string | null) {
  if (!dateFrom && !dateTo) return "—";
  if (!dateTo || dateFrom === dateTo) return formatDateID(dateFrom);
  return `${formatDateID(dateFrom)} – ${formatDateID(dateTo)}`;
}

function noteClean(note: string | null) {
  if (!note) return null;
  return note
    .replace(/\[MODE:(?:nominal|tanggal)\]/g, "")
    .replace(/\[LEBIH_BAYAR:\d+\]/g, "")
    .trim() || null;
}

// Inline SVG bread logo — no external URL, zero CORS risk
function BreadLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="22" width="34" height="15" rx="7.5" fill="white" />
      <path d="M5 27 C7 18 13 16 20 16 C27 16 33 18 35 27" fill="white" />
      <path d="M10 29.5 L30 29.5" stroke="#F0681A" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" />
      <path d="M10 33.5 L30 33.5" stroke="#F0681A" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" opacity="0.5" />
    </svg>
  );
}

// ─── Document — 540 px wide (renders at 1080 px @2×) ─────────────────────────
// All colours are solid (no CSS gradient on containers with overlaid text).
// Gradient strips are decorative only (no text on top of them).

export function PayslipDocument({ data }: { data: PayslipData }) {
  const { payment, staff, outlet, shifts, summary } = data;
  const cleanNote = noteClean(payment.note);
  const font = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

  return (
    <div
      id="payslip-print"
      style={{
        fontFamily: font,
        background: "#FFF8F2",
        width: 540,
        borderRadius: 20,
        overflow: "hidden",
        border: "2px solid #EDD5C5",
      }}
    >

      {/* ── Gradient header band (decorative, no text on top of gradient) ── */}
      <div style={{ height: 8, background: "linear-gradient(90deg,#C8202B,#F0681A,#F6B800)" }} />

      {/* ── Header card ── */}
      <div
        style={{
          background: "#C8202B",
          padding: "24px 28px 20px",
        }}
      >
        {/* Logo + brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              border: "3px solid rgba(255,255,255,0.4)",
            }}
          >
            <BreadLogo size={36} />
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: 2 }}>
              Roti Bakar Ngeunah
            </p>
            <p style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF", letterSpacing: -0.3, lineHeight: 1 }}>
              Slip Gaji
            </p>
          </div>
        </div>

        {/* Slip metadata chips */}
        <div
          style={{
            background: "rgba(0,0,0,0.25)",
            borderRadius: 10,
            padding: "10px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.65)", marginBottom: 2 }}>
              Nomor Slip
            </p>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#FFFFFF", letterSpacing: 0.5, fontFamily: "monospace, sans-serif" }}>
              {slipNumber(payment.id, summary.paymentNumber)}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.65)", marginBottom: 2 }}>
              Pembayaran
            </p>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#FFFFFF" }}>
              ke-{summary.paymentNumber} / {summary.totalPayments}
            </p>
          </div>
        </div>
      </div>

      {/* ── Thin accent divider ── */}
      <div style={{ height: 4, background: "#F0681A" }} />

      {/* ── Info karyawan ── */}
      <div style={{ padding: "20px 24px 0" }}>
        <SectionLabel>Informasi Karyawan</SectionLabel>
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1.5px solid #EDD5C5" }}>
          <InfoTableRow label="Nama Karyawan" value={staff.name} first />
          <InfoTableRow label="Outlet" value={outlet?.name || "—"} />
          <InfoTableRow label="Periode Kerja" value={periodLabel(payment.date_from, payment.date_to)} />
          <InfoTableRow label="Tanggal Bayar" value={formatDateWithDayID(payment.paid_at?.slice(0, 10))} />
          <InfoTableRow label="Gaji per Shift" value={rupiah(staff.salary_per_shift)} />
          <InfoTableRow label="Jumlah Shift Dibayar" value={`${summary.coveredShiftCount} shift`} />
        </div>
      </div>

      {/* ── Rincian shift ── */}
      <div style={{ padding: "20px 24px 0" }}>
        <SectionLabel>Rincian Shift</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shifts.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", border: "1.5px solid #EDD5C5", textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "#9B7060" }}>Tidak ada data shift</p>
            </div>
          ) : (
            shifts.map((row, i) => {
              const is2x = String(row.flags || "").includes("FULL_SHIFT_2X");
              const isEven = i % 2 === 0;
              return (
                <div
                  key={row.id}
                  style={{
                    background: isEven ? "#fff" : "#FFFAF6",
                    borderRadius: 12,
                    border: "1.5px solid #EDD5C5",
                    overflow: "hidden",
                  }}
                >
                  {/* Row top: date + shift badge + status */}
                  <div
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 16px 8px",
                      borderBottom: "1px solid #F5EAE0",
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "#1C0A00" }}>{formatDateID(row.date)}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <span
                          style={{
                            fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20,
                            background: "#FEF0E8", color: "#C8202B", border: "1px solid #F5CDB4",
                          }}
                        >
                          {shiftName(row.shift)}
                        </span>
                        {is2x && (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 6, background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE" }}>
                            2× Bonus
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
                        background: "#E8F5ED", color: "#1A8A3C",
                        padding: "4px 10px", borderRadius: 20,
                        border: "1px solid #B8DFC6",
                      }}
                    >
                      Lunas
                    </span>
                  </div>

                  {/* Row bottom: jam + gaji */}
                  <div
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 16px 10px",
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#9B7060", marginBottom: 3 }}>
                        Jam Kerja
                      </p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#3D1A08" }}>
                        {hhmm(row.checkin_time)} → {row.checkout_time ? hhmm(row.checkout_time) : "—"}
                      </p>
                      {row.late_minutes > 0 && (
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#C8202B", marginTop: 2 }}>
                          Telat {row.late_minutes} menit · −{rupiah(row.deduction)}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#9B7060", marginBottom: 3 }}>
                        Gaji Shift
                      </p>
                      <p style={{ fontSize: 16, fontWeight: 900, color: "#1A8A3C" }}>
                        {rupiah(row.final_salary)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Ringkasan pembayaran ── */}
      <div style={{ padding: "20px 24px 0" }}>
        <SectionLabel>Ringkasan Pembayaran</SectionLabel>
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1.5px solid #EDD5C5" }}>
          <SummaryRow label="Nilai pembayaran ini" value={rupiah(summary.thisPaymentAmount)} accent="highlight" />
          <SummaryRow label="Total gaji kumulatif (semua periode)" value={rupiah(summary.totalEarned)} />
          <SummaryRow label="Total sudah dibayarkan" value={rupiah(summary.totalPaid)} />
          <div style={{ background: summary.balance > 0 ? "#FFF1F0" : "#F0FFF4", borderTop: "2px solid #EDD5C5" }}>
            <SummaryRow
              label="Saldo gaji tertahan"
              value={rupiah(summary.balance)}
              accent={summary.balance > 0 ? "danger" : "success"}
              bold
            />
          </div>
        </div>
      </div>

      {/* ── Catatan ── */}
      {cleanNote && (
        <div style={{ padding: "16px 24px 0" }}>
          <div
            style={{
              background: "#FEF8E0",
              border: "1.5px solid #F6B800",
              borderRadius: 12,
              padding: "12px 16px",
            }}
          >
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "#92400E", marginBottom: 5 }}>
              Catatan
            </p>
            <p style={{ fontSize: 13, color: "#78350F", fontWeight: 700 }}>{cleanNote}</p>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ padding: "20px 24px 24px" }}>
        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-end",
            gap: 12,
          }}
        >
          {/* Legal text */}
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 9, color: "#B08070", fontWeight: 600, lineHeight: 1.7, marginBottom: 6 }}>
              Slip gaji ini diterbitkan secara resmi oleh sistem Roti Bakar Ngeunah.
              Dokumen ini sah tanpa tanda tangan basah.
            </p>
            <p style={{ fontSize: 8, color: "#CCAAA0", fontFamily: "monospace, sans-serif", letterSpacing: 0.3 }}>
              ID: {payment.id}
            </p>
          </div>

          {/* Admin stamp — solid red background for reliable rendering */}
          <div
            style={{
              background: "#C8202B",
              borderRadius: 12,
              padding: "10px 18px",
              textAlign: "center",
              flexShrink: 0,
              border: "2px solid #A31B24",
            }}
          >
            <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.8)", marginBottom: 3 }}>
              Disetujui oleh
            </p>
            <p style={{ fontSize: 13, fontWeight: 900, color: "#FFFFFF" }}>
              Admin RBN
            </p>
            <p style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>
              Roti Bakar Ngeunah
            </p>
          </div>
        </div>
      </div>

      {/* ── Bottom accent band ── */}
      <div style={{ height: 8, background: "linear-gradient(90deg,#F6B800,#F0681A,#C8202B)" }} />
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 9, fontWeight: 800, letterSpacing: 2.5, textTransform: "uppercase",
        color: "#9B7060", marginBottom: 8, paddingLeft: 2,
      }}
    >
      {children}
    </p>
  );
}

function InfoTableRow({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        borderTop: first ? "none" : "1px solid #F5EAE0",
      }}
    >
      <div
        style={{
          width: 160, flexShrink: 0,
          padding: "10px 16px",
          background: "#FFF8F2",
          borderRight: "1px solid #F5EAE0",
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 700, color: "#9B7060" }}>{label}</p>
      </div>
      <div style={{ flex: 1, padding: "10px 16px" }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#1C0A00" }}>{value}</p>
      </div>
    </div>
  );
}

function SummaryRow({
  label, value, accent, bold
}: {
  label: string;
  value: string;
  accent?: "highlight" | "danger" | "success";
  bold?: boolean;
}) {
  const bgMap = { highlight: "#FEF0E8", danger: "transparent", success: "transparent" };
  const valColMap = { highlight: "#C8202B", danger: "#C8202B", success: "#1A8A3C" };
  const bg = accent ? bgMap[accent] : "transparent";
  const valColor = accent ? valColMap[accent] : "#1C0A00";

  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 20px",
        background: bg,
        borderBottom: "1px solid #F5EAE0",
      }}
    >
      <p style={{ fontSize: 12, fontWeight: bold ? 800 : 600, color: "#5C3A24" }}>{label}</p>
      <p style={{ fontSize: bold ? 16 : 13, fontWeight: 800, color: valColor }}>{value}</p>
    </div>
  );
}

// ─── PayslipView (with download buttons) ─────────────────────────────────────

export function PayslipView({ data }: { data: PayslipData }) {
  const slipRef = useRef<HTMLDivElement>(null);
  const [dl, setDl] = useState<"img" | "pdf" | null>(null);

  const filename = `slip-gaji-${data.staff.name.replace(/\s+/g, "-")}-${data.payment.paid_at?.slice(0, 10) || "slip"}`;

  async function captureCanvas() {
    if (!slipRef.current) throw new Error("Slip tidak ditemukan");
    const html2canvas = (await import("html2canvas")).default;
    return html2canvas(slipRef.current, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#FFF8F2",
      logging: false,
      imageTimeout: 0,
      removeContainer: true,
    });
  }

  async function downloadImage() {
    if (dl) return;
    setDl("img");
    try {
      const canvas = await captureCanvas();
      const url = canvas.toDataURL("image/png", 1.0);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download gambar gagal:", e);
    } finally {
      setDl(null);
    }
  }

  async function downloadPdf() {
    if (dl) return;
    setDl("pdf");
    try {
      const canvas = await captureCanvas();
      const { jsPDF } = await import("jspdf");

      // Use exact canvas dimensions → perfect portrait crop
      const pxW = canvas.width;
      const pxH = canvas.height;
      // 1px = 0.264583 mm
      const mmW = pxW * 0.264583;
      const mmH = pxH * 0.264583;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [mmW, mmH],
        compress: true,
      });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, mmW, mmH);
      pdf.save(`${filename}.pdf`);
    } catch (e) {
      console.error("Download PDF gagal:", e);
    } finally {
      setDl(null);
    }
  }

  return (
    <div>
      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <BtnAction
          onClick={downloadImage}
          disabled={!!dl}
          loading={dl === "img"}
          bg={dl === "img" ? "#aaa" : "#1A5FA8"}
          label="Unduh Gambar (PNG)"
          loadingLabel="Mengunduh..."
          icon={<FileImage size={16} />}
        />
        <BtnAction
          onClick={downloadPdf}
          disabled={!!dl}
          loading={dl === "pdf"}
          bg={dl === "pdf" ? "#aaa" : "#C8202B"}
          label="Unduh PDF"
          loadingLabel="Mengunduh..."
          icon={<FileText size={16} />}
        />
        <BtnAction
          onClick={() => window.print()}
          disabled={false}
          loading={false}
          bg="#F0681A"
          label="Cetak"
          loadingLabel=""
          icon={<Printer size={16} />}
        />
      </div>

      {/* Slip container — capped at 540 px, scrollable on small screens */}
      <div style={{ overflowX: "auto" }}>
        <div ref={slipRef} style={{ display: "inline-block" }}>
          <PayslipDocument data={data} />
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(#payslip-print-wrapper) { display: none !important; }
          #payslip-print { margin: 0; border: none !important; border-radius: 0 !important; width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

function BtnAction({
  onClick, disabled, loading, bg, label, loadingLabel, icon
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  bg: string;
  label: string;
  loadingLabel: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "11px 20px", borderRadius: 12, border: "none",
        background: bg, color: "#fff",
        fontSize: 13, fontWeight: 700, cursor: disabled ? "wait" : "pointer",
        opacity: disabled && !loading ? 0.5 : 1,
        transition: "opacity .2s",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {loading ? loadingLabel : label}
    </button>
  );
}

// ─── skeleton ─────────────────────────────────────────────────────────────────

export function PayslipSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 540 }}>
      {[100, 180, 260, 120].map((h, i) => (
        <div
          key={i}
          style={{
            height: h, borderRadius: 14,
            background: "#F0DDD0",
            animation: "skeleton-pulse 1.4s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}
