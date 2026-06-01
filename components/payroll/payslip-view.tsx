"use client";

import { useRef, useState } from "react";
import { Download, FileImage, FileText, Printer } from "lucide-react";
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

export function PayslipDocument({ data }: { data: PayslipData }) {
  const { payment, staff, outlet, shifts, summary } = data;
  const cleanNote = noteClean(payment.note);

  return (
    <div
      style={{
        fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
        background: "#FFF8F2",
        width: 680,
        padding: "0 0 32px",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(200,32,43,0.13)",
        border: "1.5px solid #F0DDD0"
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg,#C8202B 0%,#F0681A 60%,#F6B800 100%)",
          padding: "28px 32px 24px",
          display: "flex",
          alignItems: "center",
          gap: 20
        }}
      >
        <div
          style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "#fff", display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0,
            boxShadow: "0 0 0 3px rgba(255,255,255,0.35)"
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto,w_96/v1777572835/Untitled-2_tgjm4u.png"
            alt="Logo"
            width={56}
            height={56}
            style={{ borderRadius: "50%", objectFit: "contain" }}
            crossOrigin="anonymous"
          />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: 2 }}>
            Roti Bakar Ngeunah
          </p>
          <p style={{ fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: -0.5, lineHeight: 1.1 }}>
            Slip Gaji
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.65)", marginBottom: 3 }}>
            No. Slip
          </p>
          <p style={{ fontSize: 11, fontWeight: 800, color: "#fff", fontFamily: "monospace", letterSpacing: 0.5 }}>
            {slipNumber(payment.id, summary.paymentNumber)}
          </p>
          <p style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
            Pembayaran ke-{summary.paymentNumber} / {summary.totalPayments}
          </p>
        </div>
      </div>

      {/* Staff info */}
      <div style={{ padding: "20px 32px 0" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            background: "#fff",
            borderRadius: 14,
            padding: "16px 20px",
            border: "1.5px solid #F0DDD0"
          }}
        >
          <InfoRow label="Nama Karyawan" value={staff.name} />
          <InfoRow label="Outlet" value={outlet?.name || "—"} />
          <InfoRow label="Periode Kerja" value={periodLabel(payment.date_from, payment.date_to)} />
          <InfoRow label="Tanggal Bayar" value={formatDateWithDayID(payment.paid_at?.slice(0, 10))} />
          <InfoRow label="Gaji per Shift" value={rupiah(staff.salary_per_shift)} />
          <InfoRow label="Total Shift" value={`${summary.coveredShiftCount} shift`} />
        </div>
      </div>

      {/* Shift detail table */}
      <div style={{ padding: "20px 32px 0" }}>
        <p
          style={{
            fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
            color: "#9B7060", marginBottom: 10
          }}
        >
          Rincian Shift
        </p>
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            overflow: "hidden",
            border: "1.5px solid #F0DDD0"
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 90px 80px 80px 1fr 90px",
              background: "#FEF0E8",
              padding: "10px 16px",
              borderBottom: "1.5px solid #F0DDD0"
            }}
          >
            {["Tanggal", "Shift", "Masuk", "Pulang", "Gaji", "Status"].map((h) => (
              <p key={h} style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "#9B7060" }}>{h}</p>
            ))}
          </div>

          {/* Rows */}
          {shifts.length === 0 ? (
            <p style={{ padding: "16px", fontSize: 12, color: "#9B7060", textAlign: "center" }}>Tidak ada data shift</p>
          ) : (
            shifts.map((row, i) => {
              const isFullShift2x = String(row.flags || "").includes("FULL_SHIFT_2X");
              const isEven = i % 2 === 0;
              return (
                <div
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 90px 80px 80px 1fr 90px",
                    padding: "10px 16px",
                    background: isEven ? "#fff" : "#FFFAF7",
                    borderBottom: i < shifts.length - 1 ? "1px solid #F5EAE0" : "none",
                    alignItems: "center"
                  }}
                >
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#1C0A00" }}>{formatDateID(row.date)}</p>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#1C0A00" }}>{shiftName(row.shift)}</p>
                    {isFullShift2x && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#4338CA", background: "#EEF2FF", padding: "1px 5px", borderRadius: 4, letterSpacing: 0.5 }}>2×</span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: "#5C3A24" }}>{hhmm(row.checkin_time)}</p>
                  <p style={{ fontSize: 11, color: "#5C3A24" }}>{hhmm(row.checkout_time)}</p>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "#1A8A3C" }}>{rupiah(row.final_salary)}</p>
                    {row.deduction > 0 && (
                      <p style={{ fontSize: 9, color: "#C8202B", fontWeight: 700 }}>−{rupiah(row.deduction)} telat</p>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
                      background: "#E8F5ED", color: "#1A8A3C",
                      padding: "3px 8px", borderRadius: 20, display: "inline-block"
                    }}
                  >
                    Lunas
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Summary */}
      <div style={{ padding: "20px 32px 0" }}>
        <p
          style={{
            fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
            color: "#9B7060", marginBottom: 10
          }}
        >
          Ringkasan Pembayaran
        </p>
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            overflow: "hidden",
            border: "1.5px solid #F0DDD0"
          }}
        >
          <SummaryRow label="Nilai pembayaran ini" value={rupiah(summary.thisPaymentAmount)} highlight />
          <SummaryRow label="Total gaji kumulatif (semua shift)" value={rupiah(summary.totalEarned)} />
          <SummaryRow label="Total sudah dibayarkan" value={rupiah(summary.totalPaid)} />
          <div style={{ borderTop: "2px solid #F0DDD0" }}>
            <SummaryRow
              label="Saldo gaji tertahan"
              value={rupiah(summary.balance)}
              accent={summary.balance > 0 ? "warn" : "ok"}
              bold
            />
          </div>
        </div>
      </div>

      {/* Note */}
      {cleanNote && (
        <div style={{ padding: "16px 32px 0" }}>
          <div
            style={{
              background: "#FEF8E0",
              border: "1px solid #F6B800",
              borderRadius: 12,
              padding: "10px 14px"
            }}
          >
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "#B45309", marginBottom: 4 }}>Catatan</p>
            <p style={{ fontSize: 12, color: "#78350F", fontWeight: 600 }}>{cleanNote}</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          padding: "20px 32px 0",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16
        }}
      >
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 9, color: "#C8A898", fontWeight: 600, lineHeight: 1.6 }}>
            Slip gaji ini diterbitkan secara resmi oleh sistem Roti Bakar Ngeunah.
            <br />
            Dokumen ini sah tanpa tanda tangan basah.
          </p>
          <p style={{ fontSize: 8, color: "#D0B8A8", marginTop: 4 }}>
            ID: {payment.id}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              background: "linear-gradient(135deg,#C8202B,#F0681A)",
              borderRadius: 10,
              padding: "8px 16px",
              display: "inline-block"
            }}
          >
            <p style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.8)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 1 }}>Admin</p>
            <p style={{ fontSize: 11, fontWeight: 900, color: "#fff" }}>Roti Bakar Ngeunah</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#9B7060", marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#1C0A00" }}>{value}</p>
    </div>
  );
}

function SummaryRow({
  label, value, highlight, accent, bold
}: {
  label: string;
  value: string;
  highlight?: boolean;
  accent?: "warn" | "ok";
  bold?: boolean;
}) {
  const bg = highlight ? "linear-gradient(90deg,#FEF0E8,#fff)" : "transparent";
  const valueColor = accent === "warn" ? "#C8202B" : accent === "ok" ? "#1A8A3C" : "#1C0A00";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 20px",
        background: bg,
        borderBottom: "1px solid #F5EAE0"
      }}
    >
      <p style={{ fontSize: 12, fontWeight: bold ? 800 : 600, color: "#5C3A24" }}>{label}</p>
      <p style={{ fontSize: bold ? 15 : 13, fontWeight: 800, color: valueColor }}>{value}</p>
    </div>
  );
}

export function PayslipView({ data }: { data: PayslipData }) {
  const slipRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState<"img" | "pdf" | null>(null);

  async function downloadImage() {
    if (!slipRef.current || downloading) return;
    setDownloading("img");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(slipRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#FFF8F2",
        logging: false
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `slip-gaji-${data.staff.name.replace(/\s+/g, "-")}-${data.payment.paid_at?.slice(0, 10) || "slip"}.png`;
      a.click();
    } finally {
      setDownloading(null);
    }
  }

  async function downloadPdf() {
    if (!slipRef.current || downloading) return;
    setDownloading("pdf");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(slipRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#FFF8F2",
        logging: false
      });

      const imgData = canvas.toDataURL("image/png");
      const pxWidth = canvas.width;
      const pxHeight = canvas.height;
      const ptWidth = pxWidth * 0.75;
      const ptHeight = pxHeight * 0.75;

      const pdf = new jsPDF({
        orientation: ptWidth > ptHeight ? "landscape" : "portrait",
        unit: "pt",
        format: [ptWidth, ptHeight]
      });
      pdf.addImage(imgData, "PNG", 0, 0, ptWidth, ptHeight, undefined, "FAST");
      pdf.save(`slip-gaji-${data.staff.name.replace(/\s+/g, "-")}-${data.payment.paid_at?.slice(0, 10) || "slip"}.pdf`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      {/* Download buttons */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 20,
          flexWrap: "wrap"
        }}
      >
        <button
          onClick={downloadImage}
          disabled={!!downloading}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: 12,
            background: downloading === "img" ? "#ccc" : "linear-gradient(135deg,#1A5FA8,#1A8A3C)",
            border: "none", color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: downloading ? "wait" : "pointer",
            opacity: downloading && downloading !== "img" ? 0.5 : 1,
            transition: "opacity .2s"
          }}
        >
          <FileImage size={16} />
          {downloading === "img" ? "Mengunduh..." : "Unduh Gambar (PNG)"}
        </button>

        <button
          onClick={downloadPdf}
          disabled={!!downloading}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: 12,
            background: downloading === "pdf" ? "#ccc" : "linear-gradient(135deg,#C8202B,#F0681A)",
            border: "none", color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: downloading ? "wait" : "pointer",
            opacity: downloading && downloading !== "pdf" ? 0.5 : 1,
            transition: "opacity .2s"
          }}
        >
          <FileText size={16} />
          {downloading === "pdf" ? "Mengunduh..." : "Unduh PDF"}
        </button>

        <button
          onClick={() => window.print()}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: 12,
            background: "#FFF8F2", border: "1.5px solid #F0DDD0",
            color: "#5C3A24", fontSize: 13, fontWeight: 700, cursor: "pointer"
          }}
        >
          <Printer size={16} />
          Cetak
        </button>
      </div>

      {/* The slip document */}
      <div
        style={{
          maxWidth: 700,
          overflowX: "auto"
        }}
      >
        <div ref={slipRef}>
          <PayslipDocument data={data} />
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #payslip-print, #payslip-print * { visibility: visible !important; }
          #payslip-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

export function PayslipSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[180, 120, 220, 140].map((h, i) => (
        <div
          key={i}
          style={{
            height: h, borderRadius: 14,
            background: "var(--border, #F0DDD0)",
            animation: "skeleton-pulse 1.4s ease-in-out infinite"
          }}
        />
      ))}
    </div>
  );
}

export const DownloadIcon = Download;
