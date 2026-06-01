"use client";

import { useRef, useState } from "react";
import { FileImage, FileText, Printer } from "lucide-react";
import { formatDateID, formatDateWithDayID, hhmm, rupiah } from "@/lib/format";

// ─── types ───────────────────────────────────────────────────────────────────

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

function shiftName(s: number) { return s === 0 ? "Full Shift" : `Shift ${s}`; }

function slipNumber(id: string, n: number) {
  return `RBN-${String(n).padStart(3, "0")}-${id.replace(/-/g, "").toUpperCase().slice(0, 8)}`;
}

function periodLabel(from: string | null, to: string | null) {
  if (!from && !to) return "—";
  if (!to || from === to) return formatDateID(from);
  return `${formatDateID(from)} – ${formatDateID(to)}`;
}

function noteClean(note: string | null) {
  return note
    ?.replace(/\[MODE:(?:nominal|tanggal)\]/g, "")
    .replace(/\[LEBIH_BAYAR:\d+\]/g, "")
    .trim() || null;
}

// ─── Inline brand logo — coloured on white, zero CORS ────────────────────────
// Red/orange toast icon so it's always visible on white background.
function RbnLogo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* crust arch */}
      <path d="M6 30 C7 18 14 14 24 14 C34 14 41 18 42 30" fill="#C8202B" />
      {/* toast body */}
      <rect x="5" y="27" width="38" height="16" rx="8" fill="#F0681A" />
      {/* grill lines */}
      <line x1="12" y1="33" x2="36" y2="33" stroke="#FFF8F2" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 4" />
      <line x1="12" y1="38" x2="30" y2="38" stroke="#FFF8F2" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 4" opacity="0.5" />
    </svg>
  );
}

// ─── PayslipDocument — 540 px wide (→ 1080 px @2×) ──────────────────────────
// Compact layout: each shift row ≈ 24 px → 26 shifts ≈ 624 px.
// Full slip for 26 shifts ≈ 1050 px DOM → 2100 px @2×.
// The download logic auto-fits everything into exactly 1080×1920 px output.

export function PayslipDocument({ data }: { data: PayslipData }) {
  const { payment, staff, outlet, shifts, summary } = data;
  const cleanNote = noteClean(payment.note);
  const font = "'Segoe UI','Helvetica Neue',Arial,sans-serif";
  const W = 540;

  // ── Shift table column widths
  const COL = { date: 138, shift: 80, time: 130, salary: "1fr" };

  return (
    <div
      id="payslip-doc"
      style={{
        fontFamily: font,
        background: "#FFF8F2",
        width: W,
        borderRadius: 18,
        overflow: "hidden",
        border: "2px solid #EDD5C5",
      }}
    >
      {/* ── top band ── */}
      <div style={{ height: 6, background: "linear-gradient(90deg,#C8202B,#F0681A,#F6B800)" }} />

      {/* ── Header (solid red — safe for html2canvas text rendering) ── */}
      <div style={{ background: "#C8202B", padding: "18px 22px 14px" }}>

        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          {/* Logo circle */}
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "#FFFFFF",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 0 0 2px rgba(255,255,255,0.4)",
          }}>
            <RbnLogo size={36} />
          </div>
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: 2 }}>
              Roti Bakar Ngeunah
            </p>
            <p style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF", letterSpacing: -0.3, lineHeight: 1.05 }}>
              Slip Gaji
            </p>
          </div>
          {/* Slip number — right */}
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.65)", marginBottom: 3 }}>
              No. Slip
            </p>
            <p style={{ fontSize: 10, fontWeight: 800, color: "#FFFFFF", fontFamily: "monospace,sans-serif", letterSpacing: 0.5 }}>
              {slipNumber(payment.id, summary.paymentNumber)}
            </p>
            <p style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              Ke-{summary.paymentNumber} dari {summary.totalPayments}
            </p>
          </div>
        </div>

        {/* Tanggal bayar chip */}
        <div style={{
          background: "rgba(0,0,0,0.22)",
          borderRadius: 8,
          padding: "7px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
            Dibayar pada <strong style={{ color: "#FFFFFF" }}>{formatDateWithDayID(payment.paid_at?.slice(0, 10))}</strong>
          </p>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#FFFFFF" }}>
            {summary.coveredShiftCount} shift
          </p>
        </div>
      </div>

      {/* ── divider ── */}
      <div style={{ height: 4, background: "#F0681A" }} />

      {/* ── Info Karyawan ── */}
      <Block>
        <Label>Informasi Karyawan</Label>
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1.5px solid #EDD5C5" }}>
          {[
            ["Nama Karyawan", staff.name],
            ["Outlet", outlet?.name || "—"],
            ["Periode Kerja", periodLabel(payment.date_from, payment.date_to)],
            ["Tanggal Bayar", formatDateWithDayID(payment.paid_at?.slice(0, 10))],
            ["Gaji per Shift", rupiah(staff.salary_per_shift)],
            ["Total Shift Dibayar", `${summary.coveredShiftCount} shift`],
          ].map(([lbl, val], i) => (
            <div key={lbl} style={{
              display: "flex", alignItems: "center",
              borderTop: i === 0 ? "none" : "1px solid #F2E8E0",
            }}>
              <p style={{
                width: 148, flexShrink: 0, padding: "8px 12px",
                fontSize: 10, fontWeight: 600, color: "#9B7060",
                background: "#FFF8F2", borderRight: "1px solid #F2E8E0",
              }}>
                {lbl}
              </p>
              <p style={{ flex: 1, padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#1C0A00" }}>
                {val}
              </p>
            </div>
          ))}
        </div>
      </Block>

      {/* ── Rincian Shift ── */}
      <Block>
        <Label>Rincian Shift</Label>
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1.5px solid #EDD5C5" }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: `${COL.date}px ${COL.shift}px ${COL.time}px ${COL.salary}`,
            background: "#FEF0E8",
            padding: "8px 12px",
            borderBottom: "1.5px solid #EDD5C5",
          }}>
            {["Tanggal", "Shift", "Jam Kerja", "Gaji"].map(h => (
              <p key={h} style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "#9B7060" }}>
                {h}
              </p>
            ))}
          </div>

          {/* Rows */}
          {shifts.length === 0 ? (
            <p style={{ padding: 16, fontSize: 12, color: "#9B7060", textAlign: "center" }}>
              Tidak ada data shift
            </p>
          ) : shifts.map((row, i) => {
            const is2x = String(row.flags || "").includes("FULL_SHIFT_2X");
            return (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: `${COL.date}px ${COL.shift}px ${COL.time}px ${COL.salary}`,
                  padding: "6px 12px",
                  background: i % 2 === 0 ? "#fff" : "#FFFAF6",
                  borderBottom: i < shifts.length - 1 ? "1px solid #F2E8E0" : "none",
                  alignItems: "center",
                }}
              >
                {/* Date */}
                <p style={{ fontSize: 10, fontWeight: 700, color: "#1C0A00", lineHeight: 1.3 }}>
                  {formatDateID(row.date)}
                </p>
                {/* Shift badge */}
                <div>
                  <span style={{
                    fontSize: 9, fontWeight: 800,
                    background: "#FEF0E8", color: "#C8202B",
                    padding: "2px 6px", borderRadius: 20,
                    border: "1px solid #F5CDB4",
                    display: "inline-block",
                  }}>
                    {shiftName(row.shift)}
                  </span>
                  {is2x && (
                    <span style={{
                      fontSize: 8, fontWeight: 800,
                      background: "#EEF2FF", color: "#4338CA",
                      padding: "1px 4px", borderRadius: 4,
                      marginLeft: 3, display: "inline-block",
                    }}>
                      2×
                    </span>
                  )}
                </div>
                {/* Time */}
                <div>
                  <p style={{ fontSize: 10, color: "#3D1A08", fontWeight: 600 }}>
                    {hhmm(row.checkin_time)} → {row.checkout_time ? hhmm(row.checkout_time) : "—"}
                  </p>
                  {row.late_minutes > 0 && (
                    <p style={{ fontSize: 9, color: "#C8202B", fontWeight: 700, marginTop: 1 }}>
                      Telat {row.late_minutes}m
                    </p>
                  )}
                </div>
                {/* Salary */}
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 12, fontWeight: 900, color: "#1A8A3C" }}>
                    {rupiah(row.final_salary)}
                  </p>
                  {row.deduction > 0 && (
                    <p style={{ fontSize: 9, color: "#C8202B", fontWeight: 700 }}>
                      −{rupiah(row.deduction)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Block>

      {/* ── Ringkasan Pembayaran ── */}
      <Block>
        <Label>Ringkasan Pembayaran</Label>
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: "1.5px solid #EDD5C5" }}>
          {/* Highlight row */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "11px 16px", background: "#FEF0E8",
            borderBottom: "1px solid #F2E8E0",
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#5C3A24" }}>Nilai pembayaran ini</p>
            <p style={{ fontSize: 15, fontWeight: 900, color: "#C8202B" }}>{rupiah(summary.thisPaymentAmount)}</p>
          </div>
          <SumRow label="Total gaji kumulatif" value={rupiah(summary.totalEarned)} />
          <SumRow label="Total sudah dibayarkan" value={rupiah(summary.totalPaid)} />
          {/* Balance */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "11px 16px",
            background: summary.balance > 0 ? "#FFF1F0" : "#F0FFF4",
            borderTop: "2px solid #EDD5C5",
          }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#5C3A24" }}>Saldo gaji tertahan</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: summary.balance > 0 ? "#C8202B" : "#1A8A3C" }}>
              {rupiah(summary.balance)}
            </p>
          </div>
        </div>
      </Block>

      {/* ── Catatan ── */}
      {cleanNote && (
        <Block noPadBottom>
          <div style={{
            background: "#FEF8E0", border: "1.5px solid #F6B800",
            borderRadius: 12, padding: "10px 14px",
          }}>
            <p style={{ fontSize: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "#92400E", marginBottom: 4 }}>
              Catatan
            </p>
            <p style={{ fontSize: 12, color: "#78350F", fontWeight: 700 }}>{cleanNote}</p>
          </div>
        </Block>
      )}

      {/* ── Footer ── */}
      <div style={{ padding: "14px 22px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 9, color: "#B08070", fontWeight: 600, lineHeight: 1.7 }}>
            Slip ini diterbitkan resmi oleh sistem Roti Bakar Ngeunah.<br />
            Dokumen sah tanpa tanda tangan basah.
          </p>
          <p style={{ fontSize: 8, color: "#CCAAA0", fontFamily: "monospace,sans-serif", marginTop: 4, letterSpacing: 0.2 }}>
            {payment.id}
          </p>
        </div>
        {/* Solid stamp — no gradient, guaranteed visible text */}
        <div style={{
          background: "#C8202B",
          borderRadius: 10,
          padding: "9px 16px",
          textAlign: "center",
          flexShrink: 0,
          border: "2px solid #A31B24",
        }}>
          <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>
            Disetujui
          </p>
          <p style={{ fontSize: 13, fontWeight: 900, color: "#FFFFFF" }}>Admin RBN</p>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.8)", marginTop: 1 }}>Roti Bakar Ngeunah</p>
        </div>
      </div>

      {/* ── bottom band ── */}
      <div style={{ height: 6, background: "linear-gradient(90deg,#F6B800,#F0681A,#C8202B)" }} />
    </div>
  );
}

// ─── layout helpers ───────────────────────────────────────────────────────────

function Block({ children, noPadBottom }: { children: React.ReactNode; noPadBottom?: boolean }) {
  return (
    <div style={{ padding: noPadBottom ? "14px 18px 0" : "14px 18px" }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 8, fontWeight: 800, letterSpacing: 2.5, textTransform: "uppercase",
      color: "#9B7060", marginBottom: 7, paddingLeft: 2,
    }}>
      {children}
    </p>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 16px", borderBottom: "1px solid #F2E8E0",
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#5C3A24" }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 800, color: "#1C0A00" }}>{value}</p>
    </div>
  );
}

// ─── PayslipView ──────────────────────────────────────────────────────────────

export function PayslipView({ data }: { data: PayslipData }) {
  const slipRef = useRef<HTMLDivElement>(null);
  const [dl, setDl] = useState<"img" | "pdf" | null>(null);

  const safeName = data.staff.name.replace(/\s+/g, "-");
  const safeDate = data.payment.paid_at?.slice(0, 10) || "slip";
  const filename = `slip-gaji-${safeName}-${safeDate}`;

  // Capture the slip to canvas at 2× scale
  async function capture() {
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

  // PNG download: always output exactly 1080 × 1920 px
  async function downloadImage() {
    if (dl) return;
    setDl("img");
    try {
      const src = await capture();

      const OUT_W = 1080;
      const OUT_H = 1920;

      const out = document.createElement("canvas");
      out.width = OUT_W;
      out.height = OUT_H;
      const ctx = out.getContext("2d")!;

      // Warm brand background fill
      ctx.fillStyle = "#FFF8F2";
      ctx.fillRect(0, 0, OUT_W, OUT_H);

      // Subtle bottom decorative gradient strip
      const grad = ctx.createLinearGradient(0, OUT_H - 120, 0, OUT_H);
      grad.addColorStop(0, "rgba(240,104,26,0)");
      grad.addColorStop(1, "rgba(240,104,26,0.08)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, OUT_H - 120, OUT_W, 120);

      // Scale slip to fit exactly 1080 wide, max 1860 tall (leave 60px margin bottom)
      const SLIP_MAX_H = OUT_H - 60;
      const scaleX = OUT_W / src.width;       // always 2× since src is 1080px
      const scaleY = SLIP_MAX_H / src.height; // shrink if needed
      const s = Math.min(scaleX, scaleY);

      const drawW = Math.round(src.width * s);
      const drawH = Math.round(src.height * s);
      const offsetX = Math.round((OUT_W - drawW) / 2);

      ctx.drawImage(src, offsetX, 0, drawW, drawH);

      // Small watermark
      ctx.font = "600 13px 'Segoe UI',sans-serif";
      ctx.fillStyle = "rgba(176,128,112,0.55)";
      ctx.textAlign = "center";
      ctx.fillText("Staff Portal · Roti Bakar Ngeunah", OUT_W / 2, OUT_H - 22);

      const link = document.createElement("a");
      link.href = out.toDataURL("image/png", 1.0);
      link.download = `${filename}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Download gagal:", e);
    } finally {
      setDl(null);
    }
  }

  // PDF: A4 portrait, multi-page if needed
  async function downloadPdf() {
    if (dl) return;
    setDl("pdf");
    try {
      const src = await capture();
      const { jsPDF } = await import("jspdf");

      const A4_W_MM = 210;
      const A4_H_MM = 297;
      const MARGIN_MM = 10;
      const contentW = A4_W_MM - MARGIN_MM * 2;

      // mm per pixel
      const mmPerPx = contentW / src.width;
      const totalH_mm = src.height * mmPerPx;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageContentH = A4_H_MM - MARGIN_MM * 2;

      if (totalH_mm <= pageContentH) {
        // Single page
        pdf.addImage(src.toDataURL("image/jpeg", 0.96), "JPEG", MARGIN_MM, MARGIN_MM, contentW, totalH_mm);
      } else {
        // Multi-page: slice canvas into A4-height chunks
        const pxPerPage = Math.floor(pageContentH / mmPerPx);
        let yPx = 0;
        let page = 0;

        while (yPx < src.height) {
          if (page > 0) pdf.addPage();

          const sliceH = Math.min(pxPerPage, src.height - yPx);
          const slice = document.createElement("canvas");
          slice.width = src.width;
          slice.height = sliceH;
          const sctx = slice.getContext("2d")!;
          sctx.fillStyle = "#FFF8F2";
          sctx.fillRect(0, 0, src.width, sliceH);
          sctx.drawImage(src, 0, -yPx);

          const sliceH_mm = sliceH * mmPerPx;
          pdf.addImage(slice.toDataURL("image/jpeg", 0.96), "JPEG", MARGIN_MM, MARGIN_MM, contentW, sliceH_mm);

          yPx += pxPerPage;
          page++;
        }
      }

      pdf.save(`${filename}.pdf`);
    } catch (e) {
      console.error("PDF gagal:", e);
    } finally {
      setDl(null);
    }
  }

  return (
    <div>
      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <Btn onClick={downloadImage} disabled={!!dl} active={dl === "img"} color="#1A5FA8"
          icon={<FileImage size={15} />} label="Unduh Gambar (1080×1920)" loading="Mengunduh..." />
        <Btn onClick={downloadPdf} disabled={!!dl} active={dl === "pdf"} color="#C8202B"
          icon={<FileText size={15} />} label="Unduh PDF" loading="Mengunduh..." />
        <Btn onClick={() => window.print()} disabled={false} active={false} color="#F0681A"
          icon={<Printer size={15} />} label="Cetak" loading="" />
      </div>

      {/* Scrollable wrapper (slip is 540 px wide) */}
      <div style={{ overflowX: "auto" }}>
        <div ref={slipRef} style={{ display: "inline-block" }}>
          <PayslipDocument data={data} />
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(#payslip-doc) { display: none !important; }
          #payslip-doc { border: none !important; border-radius: 0 !important; width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

function Btn({
  onClick, disabled, active, color, icon, label, loading
}: {
  onClick: () => void; disabled: boolean; active: boolean;
  color: string; icon: React.ReactNode; label: string; loading: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "10px 18px", borderRadius: 12, border: "none",
        background: disabled && !active ? "#bbb" : color,
        color: "#fff", fontSize: 13, fontWeight: 700,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled && !active ? 0.6 : 1,
        whiteSpace: "nowrap",
        transition: "opacity .15s",
      }}
    >
      {icon}
      {active ? loading : label}
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function PayslipSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 540 }}>
      {[90, 160, 300, 120].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: 14,
          background: "#F0DDD0",
          animation: "skeleton-pulse 1.4s ease-in-out infinite",
        }} />
      ))}
    </div>
  );
}
