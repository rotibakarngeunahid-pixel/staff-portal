"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FileImage, FileText, Printer } from "lucide-react";
import { formatDateID, formatDateWithDayID, hhmm, rupiah } from "@/lib/format";

const LOGO_URL =
  "https://res.cloudinary.com/dckzmg6c3/image/upload/f_png,q_auto,w_120/v1777572835/Untitled-2_tgjm4u.png";

const MONTHS_SHORT_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

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

async function toBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function SvgLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M6 30C7 18 14 14 24 14C34 14 41 18 42 30" fill="#C8202B" />
      <rect x="5" y="27" width="38" height="16" rx="8" fill="#F0681A" />
      <line x1="12" y1="33" x2="36" y2="33" stroke="#FFF8F2" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 4" />
      <line x1="12" y1="38" x2="30" y2="38" stroke="#FFF8F2" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 4" opacity="0.55" />
    </svg>
  );
}

function shiftName(s: number) {
  return s === 0 ? "Full Shift" : `Shift ${s}`;
}

function slipNo(id: string, n: number) {
  return `RBN-${String(n).padStart(3, "0")}-${id.replace(/-/g, "").toUpperCase().slice(0, 8)}`;
}

function compactDateID(value?: string | null) {
  if (!value) return "-";
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getDate()} ${MONTHS_SHORT_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function period(from: string | null, to: string | null) {
  if (!from && !to) return "-";
  if (!to || from === to) return formatDateID(from);
  return `${formatDateID(from)} - ${formatDateID(to)}`;
}

function cleanNote(note: string | null) {
  return note
    ?.replace(/\[MODE:(?:nominal|tanggal)\]/g, "")
    .replace(/\[LEBIH_BAYAR:\d+\]/g, "")
    .trim() || null;
}

export function PayslipDocument({
  data,
  logoSrc,
}: {
  data: PayslipData;
  logoSrc: string | null;
}) {
  const { payment, staff, outlet, shifts, summary } = data;
  const note = cleanNote(payment.note);
  const denseRows = shifts.length >= 20;
  const font = "'Segoe UI','Helvetica Neue',Arial,sans-serif";
  const grid = "95px 76px 112px minmax(0,1fr)";
  const paidDate = payment.paid_at?.slice(0, 10);
  const infoItems: Array<[string, string]> = [
    ["Nama", staff.name],
    ["Outlet", outlet?.name ?? "-"],
    ["Periode", period(payment.date_from, payment.date_to)],
    ["Bayar", formatDateWithDayID(paidDate)],
    ["Gaji/Shift", rupiah(staff.salary_per_shift)],
    ["Shift Dibayar", `${summary.coveredShiftCount} shift`],
  ];

  return (
    <div
      id="payslip-doc"
      style={{
        fontFamily: font,
        background: "#FFF8F2",
        width: 540,
        borderRadius: 16,
        overflow: "hidden",
        border: "2px solid #E9CDB9",
        boxSizing: "border-box",
        color: "#1C0A00",
      }}
    >
      <div style={{ height: 5, background: "linear-gradient(90deg,#C8202B,#F0681A,#F6B800)" }} />

      <header style={{ background: "#C8202B", color: "#FFFFFF", padding: "12px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
              boxShadow: "0 0 0 3px rgba(255,255,255,0.32)",
            }}
          >
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc}
                alt="Logo Roti Bakar Ngeunah"
                width={39}
                height={39}
                style={{ width: 39, height: 39, objectFit: "contain", borderRadius: "50%", display: "block" }}
              />
            ) : (
              <SvgLogo size={36} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: 2.3,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.78)",
                margin: 0,
                lineHeight: 1.25,
                whiteSpace: "nowrap",
              }}
            >
              Roti Bakar Ngeunah
            </p>
            <p style={{ fontSize: 23, fontWeight: 900, color: "#FFFFFF", margin: "3px 0 0", lineHeight: 1.05 }}>
              Slip Gaji
            </p>
          </div>

          <div style={{ flexShrink: 0, textAlign: "right", maxWidth: 178 }}>
            <p
              style={{
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: 1.8,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.66)",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              No. Slip
            </p>
            <p
              style={{
                fontSize: 10,
                fontWeight: 900,
                color: "#FFFFFF",
                fontFamily: "Consolas,'Courier New',monospace",
                margin: "3px 0 0",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              {slipNo(payment.id, summary.paymentNumber)}
            </p>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.76)", margin: "3px 0 0", lineHeight: 1.2 }}>
              Ke-{summary.paymentNumber} dari {summary.totalPayments}
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: 8,
            background: "rgba(0,0,0,0.22)",
            borderRadius: 8,
            padding: "6px 11px",
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) auto",
            gap: 10,
            alignItems: "center",
          }}
        >
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.86)", fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            Dibayar pada <strong style={{ color: "#FFFFFF", fontWeight: 900 }}>{formatDateWithDayID(paidDate)}</strong>
          </p>
          <span
            style={{
              fontSize: 10,
              fontWeight: 900,
              color: "#FFFFFF",
              background: "rgba(255,255,255,0.18)",
              borderRadius: 20,
              padding: "3px 9px",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {summary.coveredShiftCount} shift
          </span>
        </div>
      </header>

      <div style={{ height: 3, background: "#F0681A" }} />

      <Sect first>
        <SecLabel>Informasi Karyawan</SecLabel>
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 11,
            overflow: "hidden",
            border: "1.5px solid #E9CDB9",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          {infoItems.map(([label, value], index) => (
            <div
              key={label}
              style={{
                minHeight: 32,
                padding: "6px 9px",
                borderTop: index > 1 ? "1px solid #F1E3D9" : "none",
                borderLeft: index % 2 === 1 ? "1px solid #F1E3D9" : "none",
                background: index % 4 < 2 ? "#FFFFFF" : "#FFFBF7",
              }}
            >
              <p
                style={{
                  fontSize: 7.5,
                  fontWeight: 800,
                  letterSpacing: 1.1,
                  textTransform: "uppercase",
                  color: "#9B7060",
                  margin: 0,
                  lineHeight: 1.15,
                }}
              >
                {label}
              </p>
              <p
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: "#1C0A00",
                  margin: "3px 0 0",
                  lineHeight: 1.25,
                  overflowWrap: "anywhere",
                }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      </Sect>

      <Sect>
        <SecLabel>Rincian Shift</SecLabel>
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 11,
            overflow: "hidden",
            border: "1.5px solid #E9CDB9",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: grid,
              background: "#FEF0E8",
              padding: "5px 9px",
              borderBottom: "1.5px solid #E9CDB9",
              columnGap: 6,
              alignItems: "center",
            }}
          >
            {(["Tanggal", "Shift", "Jam Kerja", "Gaji"] as const).map((heading, index) => (
              <p
                key={heading}
                style={{
                  fontSize: 7.5,
                  fontWeight: 900,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "#9B7060",
                  margin: 0,
                  lineHeight: 1.1,
                  textAlign: index === 3 ? "right" : "left",
                }}
              >
                {heading}
              </p>
            ))}
          </div>

          {shifts.length === 0 ? (
            <p style={{ padding: "14px 12px", fontSize: 11, color: "#9B7060", textAlign: "center", margin: 0 }}>
              Tidak ada data shift
            </p>
          ) : (
            shifts.map((row, index) => {
              const is2x = String(row.flags ?? "").includes("FULL_SHIFT_2X");
              const hasDetail = row.late_minutes > 0 || row.deduction > 0 || is2x;
              return (
                <div
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: grid,
                    columnGap: 6,
                    padding: denseRows ? "2px 9px" : "4px 10px",
                    background: index % 2 === 0 ? "#FFFFFF" : "#FFFBF7",
                    borderBottom: index < shifts.length - 1 ? "1px solid #F1E3D9" : "none",
                    alignItems: "center",
                    minHeight: denseRows ? 17 : 21,
                  }}
                >
                  <p
                    style={{
                      fontSize: denseRows ? 8.4 : 9.4,
                      fontWeight: 800,
                      color: "#1C0A00",
                      margin: 0,
                      lineHeight: 1.25,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {compactDateID(row.date)}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: denseRows ? 7.4 : 8.3,
                        fontWeight: 900,
                        background: "#FEF0E8",
                        color: "#C8202B",
                        padding: denseRows ? "2px 5px" : "2.5px 6px",
                        borderRadius: 20,
                        border: "1px solid #F5CDB4",
                        lineHeight: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {shiftName(row.shift)}
                    </span>
                    {is2x && (
                      <span
                        style={{
                          fontSize: 7.3,
                          fontWeight: 900,
                          background: "#EEF2FF",
                          color: "#4338CA",
                          padding: "2px 4px",
                          borderRadius: 4,
                          lineHeight: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        2x
                      </span>
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: denseRows ? 8.4 : 9.4,
                        fontWeight: 700,
                        color: "#3D1A08",
                        margin: 0,
                        lineHeight: 1.25,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {hhmm(row.checkin_time)} - {row.checkout_time ? hhmm(row.checkout_time) : "-"}
                    </p>
                    {row.late_minutes > 0 && (
                      <p
                        style={{
                          fontSize: 7.7,
                          fontWeight: 800,
                          color: "#C8202B",
                          margin: "1px 0 0",
                          lineHeight: 1.15,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Telat {row.late_minutes}m
                      </p>
                    )}
                  </div>

                  <div style={{ textAlign: "right", minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: denseRows ? 9.3 : 10.5,
                        fontWeight: 900,
                        color: "#13803A",
                        margin: 0,
                        lineHeight: 1.2,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {rupiah(row.final_salary)}
                    </p>
                    {row.deduction > 0 && (
                      <p
                        style={{
                          fontSize: 7.7,
                          fontWeight: 800,
                          color: "#C8202B",
                          margin: "1px 0 0",
                          lineHeight: 1.15,
                          whiteSpace: "nowrap",
                        }}
                      >
                        -{rupiah(row.deduction)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Sect>

      <Sect>
        <SecLabel>Ringkasan Pembayaran</SecLabel>
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 11,
            overflow: "hidden",
            border: "1.5px solid #E9CDB9",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <Metric label="Nilai pembayaran ini" value={rupiah(summary.thisPaymentAmount)} tone="primary" />
          <Metric label="Total gaji kumulatif" value={rupiah(summary.totalEarned)} />
          <Metric label="Total sudah dibayarkan" value={rupiah(summary.totalPaid)} borderTop />
          <Metric
            label="Saldo gaji tertahan"
            value={rupiah(summary.balance)}
            tone={summary.balance > 0 ? "danger" : "success"}
            borderTop
          />
        </div>
      </Sect>

      {note && (
        <div style={{ padding: "0 16px 8px" }}>
          <div
            style={{
              background: "#FEF8E0",
              border: "1.5px solid #F6B800",
              borderRadius: 11,
              padding: "7px 10px",
            }}
          >
            <p
              style={{
                fontSize: 7.5,
                fontWeight: 900,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: "#92400E",
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              Catatan
            </p>
            <p style={{ fontSize: 10.2, color: "#78350F", fontWeight: 800, margin: "3px 0 0", lineHeight: 1.25, overflowWrap: "anywhere" }}>
              {note}
            </p>
          </div>
        </div>
      )}

      <footer
        style={{
          padding: "8px 16px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          borderTop: "1px solid #F1E3D9",
          background: "#FFF8F2",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 8, color: "#A97868", fontWeight: 700, lineHeight: 1.45, margin: 0 }}>
            Slip ini diterbitkan resmi oleh sistem Roti Bakar Ngeunah.
            <br />
            Dokumen sah tanpa tanda tangan basah.
          </p>
          <p
            style={{
              fontSize: 7.2,
              color: "#C7A293",
              fontFamily: "Consolas,'Courier New',monospace",
              margin: "3px 0 0",
              lineHeight: 1.2,
              overflowWrap: "anywhere",
            }}
          >
            {payment.id}
          </p>
        </div>

        <div
          style={{
            background: "#C8202B",
            borderRadius: 10,
            padding: "7px 11px",
            textAlign: "center",
            flexShrink: 0,
            border: "2px solid #A31B24",
            minWidth: 100,
          }}
        >
          <p
            style={{
              fontSize: 7.5,
              fontWeight: 900,
              letterSpacing: 1.7,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.82)",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Disetujui
          </p>
          <p style={{ fontSize: 12, fontWeight: 900, color: "#FFFFFF", margin: "3px 0 0", lineHeight: 1.1 }}>
            Admin RBN
          </p>
          <p style={{ fontSize: 7.6, color: "rgba(255,255,255,0.8)", margin: "2px 0 0", lineHeight: 1.1 }}>
            Roti Bakar Ngeunah
          </p>
        </div>
      </footer>

      <div style={{ height: 5, background: "linear-gradient(90deg,#F6B800,#F0681A,#C8202B)" }} />
    </div>
  );
}

function Sect({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return <section style={{ padding: `${first ? 9 : 7}px 16px 0` }}>{children}</section>;
}

function SecLabel({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontSize: 7.2,
        fontWeight: 900,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: "#9B7060",
        margin: "0 0 5px 2px",
        lineHeight: 1.1,
      }}
    >
      {children}
    </p>
  );
}

function Metric({
  label,
  value,
  tone = "default",
  borderTop = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "danger" | "success";
  borderTop?: boolean;
}) {
  const valueColor =
    tone === "primary" ? "#C8202B" : tone === "danger" ? "#C8202B" : tone === "success" ? "#13803A" : "#1C0A00";

  return (
    <div
      style={{
        padding: "7px 10px",
        minHeight: 42,
        borderTop: borderTop ? "1px solid #F1E3D9" : "none",
        borderLeft: label === "Total gaji kumulatif" || label === "Saldo gaji tertahan" ? "1px solid #F1E3D9" : "none",
        background: tone === "primary" ? "#FEF0E8" : tone === "danger" ? "#FFF1F0" : "#FFFFFF",
      }}
    >
      <p
        style={{
          fontSize: 7.5,
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "#8F6758",
          margin: 0,
          lineHeight: 1.15,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: tone === "primary" || tone === "danger" ? 13 : 12,
          fontWeight: 900,
          color: valueColor,
          margin: "4px 0 0",
          lineHeight: 1.1,
          whiteSpace: "nowrap",
          textAlign: "right",
        }}
      >
        {value}
      </p>
    </div>
  );
}

export function PayslipView({ data }: { data: PayslipData }) {
  const slipRef = useRef<HTMLDivElement>(null);
  const [dl, setDl] = useState<"img" | "pdf" | null>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    toBase64(LOGO_URL).then((src) => {
      if (!mounted) return;
      setLogoSrc(src);
      setLogoLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const safeName = data.staff.name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  const safeDate = data.payment.paid_at?.slice(0, 10) ?? "slip";
  const filename = `slip-gaji-${safeName || "staff"}-${safeDate}`;

  async function capture() {
    if (!slipRef.current) throw new Error("Ref not found");
    const html2canvas = (await import("html2canvas")).default;
    const rect = slipRef.current.getBoundingClientRect();

    return html2canvas(slipRef.current, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#FFF8F2",
      logging: false,
      imageTimeout: 15000,
      removeContainer: true,
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      windowWidth: Math.ceil(rect.width),
      windowHeight: Math.ceil(rect.height),
    });
  }

  async function downloadImage() {
    if (dl) return;
    setDl("img");
    try {
      const src = await capture();
      const outputWidth = 1080;
      const outputHeight = 1920;
      const pagePadding = 34;
      const watermarkReserve = 42;
      const maxSlipWidth = outputWidth - pagePadding * 2;
      const maxSlipHeight = outputHeight - pagePadding * 2 - watermarkReserve;

      const out = document.createElement("canvas");
      out.width = outputWidth;
      out.height = outputHeight;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");

      ctx.fillStyle = "#FFF8F2";
      ctx.fillRect(0, 0, outputWidth, outputHeight);

      const gradient = ctx.createLinearGradient(0, outputHeight - 210, 0, outputHeight);
      gradient.addColorStop(0, "rgba(240,104,26,0)");
      gradient.addColorStop(1, "rgba(240,104,26,0.075)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, outputHeight - 210, outputWidth, 210);

      const scale = Math.min(maxSlipWidth / src.width, maxSlipHeight / src.height, 1);
      const drawWidth = Math.round(src.width * scale);
      const drawHeight = Math.round(src.height * scale);
      const dx = Math.round((outputWidth - drawWidth) / 2);
      const dy = Math.max(pagePadding, Math.round((outputHeight - watermarkReserve - drawHeight) / 2));

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, dx, dy, drawWidth, drawHeight);

      ctx.font = "700 13px 'Segoe UI', Arial, sans-serif";
      ctx.fillStyle = "rgba(176,128,112,0.58)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Staff Portal - Roti Bakar Ngeunah", outputWidth / 2, outputHeight - 24);

      const link = document.createElement("a");
      link.href = out.toDataURL("image/png", 1.0);
      link.download = `${filename}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error(error);
    } finally {
      setDl(null);
    }
  }

  async function downloadPdf() {
    if (dl) return;
    setDl("pdf");
    try {
      const src = await capture();
      const { jsPDF } = await import("jspdf");

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;
      const mmPerPx = contentWidth / src.width;
      const totalHeight = src.height * mmPerPx;
      const contentHeight = pageHeight - margin * 2;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

      if (totalHeight <= contentHeight) {
        pdf.addImage(src.toDataURL("image/jpeg", 0.96), "JPEG", margin, margin, contentWidth, totalHeight);
      } else {
        const pxPerPage = Math.floor(contentHeight / mmPerPx);
        let yPx = 0;
        let page = 0;
        while (yPx < src.height) {
          if (page > 0) pdf.addPage();
          const sliceHeight = Math.min(pxPerPage, src.height - yPx);
          const slice = document.createElement("canvas");
          slice.width = src.width;
          slice.height = sliceHeight;
          const sliceCtx = slice.getContext("2d");
          if (!sliceCtx) throw new Error("Canvas context unavailable");
          sliceCtx.fillStyle = "#FFF8F2";
          sliceCtx.fillRect(0, 0, src.width, sliceHeight);
          sliceCtx.drawImage(src, 0, -yPx);
          pdf.addImage(slice.toDataURL("image/jpeg", 0.96), "JPEG", margin, margin, contentWidth, sliceHeight * mmPerPx);
          yPx += pxPerPage;
          page += 1;
        }
      }
      pdf.save(`${filename}.pdf`);
    } catch (error) {
      console.error(error);
    } finally {
      setDl(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <ActionBtn
          onClick={downloadImage}
          disabled={!!dl}
          active={dl === "img"}
          color="#1A5FA8"
          icon={<FileImage size={15} />}
          label="Unduh PNG (1080x1920)"
          loadingLabel="Mengunduh..."
        />
        <ActionBtn
          onClick={downloadPdf}
          disabled={!!dl}
          active={dl === "pdf"}
          color="#C8202B"
          icon={<FileText size={15} />}
          label="Unduh PDF"
          loadingLabel="Mengunduh..."
        />
        <ActionBtn
          onClick={() => window.print()}
          disabled={false}
          active={false}
          color="#F0681A"
          icon={<Printer size={15} />}
          label="Cetak"
          loadingLabel=""
        />
      </div>

      {!logoLoaded && (
        <p style={{ fontSize: 11, color: "#9B7060", marginBottom: 10, fontStyle: "italic" }}>
          Memuat logo...
        </p>
      )}

      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div ref={slipRef} style={{ display: "inline-block" }}>
          <PayslipDocument data={data} logoSrc={logoSrc} />
        </div>
      </div>

      <style>{`
        @media print {
          body > *:not(#payslip-doc) { display:none!important; }
          #payslip-doc {
            position:absolute; top:0; left:0;
            width:100%!important;
            border:none!important; border-radius:0!important;
          }
        }
      `}</style>
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  active,
  color,
  icon,
  label,
  loadingLabel,
}: {
  onClick: () => void;
  disabled: boolean;
  active: boolean;
  color: string;
  icon: ReactNode;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        minHeight: 38,
        padding: "10px 16px",
        borderRadius: 10,
        border: "none",
        background: disabled && !active ? "#A8A8A8" : color,
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled && !active ? 0.55 : 1,
        transition: "opacity .15s",
        whiteSpace: "nowrap",
        lineHeight: 1,
      }}
    >
      {icon}
      {active ? loadingLabel : label}
    </button>
  );
}

export function PayslipSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 540 }}>
      {[90, 120, 300, 100].map((height, index) => (
        <div
          key={index}
          style={{
            height,
            borderRadius: 14,
            background: "#F0DDD0",
            animation: "skeleton-pulse 1.4s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}
