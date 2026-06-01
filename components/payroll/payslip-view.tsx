"use client";

import { useEffect, useRef, useState } from "react";
import { FileImage, FileText, Printer } from "lucide-react";
import { formatDateID, formatDateWithDayID, hhmm, rupiah } from "@/lib/format";

// ─── constants ────────────────────────────────────────────────────────────────

// Cloudinary logo — served with CORS headers (Access-Control-Allow-Origin: *)
// We pre-fetch as base64 so html2canvas can render it without any CORS issue.
const LOGO_URL =
  "https://res.cloudinary.com/dckzmg6c3/image/upload/f_png,q_auto,w_120/v1777572835/Untitled-2_tgjm4u.png";

// ─── types ────────────────────────────────────────────────────────────────────

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

// ─── logo helpers ─────────────────────────────────────────────────────────────

/** Fetch any URL and return a base64 data-URI. Returns null on failure. */
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

/** Fallback SVG logo (coloured bread icon on white circle) */
function SvgLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M6 30C7 18 14 14 24 14C34 14 41 18 42 30" fill="#C8202B" />
      <rect x="5" y="27" width="38" height="16" rx="8" fill="#F0681A" />
      <line x1="12" y1="33" x2="36" y2="33" stroke="#FFF8F2" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 4" />
      <line x1="12" y1="38" x2="30" y2="38" stroke="#FFF8F2" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 4" opacity="0.55" />
    </svg>
  );
}

// ─── misc helpers ─────────────────────────────────────────────────────────────

function shiftName(s: number) { return s === 0 ? "Full Shift" : `Shift ${s}`; }

function slipNo(id: string, n: number) {
  return `RBN-${String(n).padStart(3, "0")}-${id.replace(/-/g, "").toUpperCase().slice(0, 8)}`;
}

function period(from: string | null, to: string | null) {
  if (!from && !to) return "—";
  if (!to || from === to) return formatDateID(from);
  return `${formatDateID(from)} – ${formatDateID(to)}`;
}

function cleanNote(note: string | null) {
  return note
    ?.replace(/\[MODE:(?:nominal|tanggal)\]/g, "")
    .replace(/\[LEBIH_BAYAR:\d+\]/g, "")
    .trim() || null;
}

// ─── Document component ───────────────────────────────────────────────────────
// Fixed width 540 px → html2canvas @2× → 1080 px wide output.
// All text containers use solid backgrounds + explicit colours for reliable
// html2canvas rendering. No CSS gradients on boxes that contain text.

export function PayslipDocument({
  data,
  logoSrc,           // base64 data-URI or null → falls back to SVG
}: {
  data: PayslipData;
  logoSrc: string | null;
}) {
  const { payment, staff, outlet, shifts, summary } = data;
  const note = cleanNote(payment.note);
  const font = "'Segoe UI','Helvetica Neue',Arial,sans-serif";

  // Shift-table column widths (must sum ≤ 516 = 540-24 side-pad)
  const C = { date: 130, shift: 78, time: 120, sal: 188 }; // total = 516 ✓

  return (
    <div
      id="payslip-doc"
      style={{
        fontFamily: font,
        background: "#FFF8F2",
        width: 540,
        borderRadius: 18,
        overflow: "hidden",
        border: "2px solid #EDD5C5",
        boxSizing: "border-box",
      }}
    >
      {/* ── top rainbow band ── */}
      <div style={{ height: 6, background: "linear-gradient(90deg,#C8202B,#F0681A,#F6B800)" }} />

      {/* ── Header — solid red so text is guaranteed white-on-red ── */}
      <div style={{ background: "#C8202B", padding: "18px 22px 14px" }}>

        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>

          {/* Logo circle */}
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "#FFFFFF",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, overflow: "hidden",
            boxShadow: "0 0 0 3px rgba(255,255,255,0.35)",
          }}>
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc}
                alt="Logo"
                width={44}
                height={44}
                style={{ width: 44, height: 44, objectFit: "contain", borderRadius: "50%", display: "block" }}
              />
            ) : (
              <SvgLogo size={38} />
            )}
          </div>

          {/* Brand + title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 3,
              textTransform: "uppercase", color: "rgba(255,255,255,0.78)",
              marginBottom: 3, whiteSpace: "nowrap",
            }}>
              Roti Bakar Ngeunah
            </p>
            <p style={{
              fontSize: 24, fontWeight: 900, color: "#FFFFFF",
              letterSpacing: -0.5, lineHeight: 1,
            }}>
              Slip Gaji
            </p>
          </div>

          {/* Slip number */}
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <p style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 2,
              textTransform: "uppercase", color: "rgba(255,255,255,0.65)",
              marginBottom: 3,
            }}>
              No. Slip
            </p>
            <p style={{
              fontSize: 10, fontWeight: 800, color: "#FFFFFF",
              fontFamily: "monospace,sans-serif", letterSpacing: 0.5,
              whiteSpace: "nowrap",
            }}>
              {slipNo(payment.id, summary.paymentNumber)}
            </p>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.72)", marginTop: 2 }}>
              Ke-{summary.paymentNumber} dari {summary.totalPayments}
            </p>
          </div>
        </div>

        {/* Date chip */}
        <div style={{
          background: "rgba(0,0,0,0.22)", borderRadius: 8,
          padding: "8px 14px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 600, margin: 0 }}>
            Dibayar pada&nbsp;
            <strong style={{ color: "#FFFFFF", fontWeight: 800 }}>
              {formatDateWithDayID(payment.paid_at?.slice(0, 10))}
            </strong>
          </p>
          <p style={{
            fontSize: 11, fontWeight: 800, color: "#FFFFFF",
            background: "rgba(255,255,255,0.18)", borderRadius: 20,
            padding: "2px 10px", flexShrink: 0, marginLeft: 8,
          }}>
            {summary.coveredShiftCount} shift
          </p>
        </div>
      </div>

      {/* ── orange divider ── */}
      <div style={{ height: 4, background: "#F0681A" }} />

      {/* ── Info Karyawan ── */}
      <Sect>
        <SecLabel>Informasi Karyawan</SecLabel>
        <div style={{
          background: "#fff", borderRadius: 12, overflow: "hidden",
          border: "1.5px solid #EDD5C5",
        }}>
          {([
            ["Nama Karyawan", staff.name],
            ["Outlet", outlet?.name ?? "—"],
            ["Periode Kerja", period(payment.date_from, payment.date_to)],
            ["Tanggal Bayar", formatDateWithDayID(payment.paid_at?.slice(0, 10))],
            ["Gaji per Shift", rupiah(staff.salary_per_shift)],
            ["Shift Dibayar", `${summary.coveredShiftCount} shift`],
          ] as [string, string][]).map(([lbl, val], i) => (
            <div key={lbl} style={{
              display: "flex",
              borderTop: i === 0 ? "none" : "1px solid #F2E8E0",
              minHeight: 36,
            }}>
              <div style={{
                width: 148, flexShrink: 0,
                padding: "9px 12px",
                background: "#FFF8F2",
                borderRight: "1px solid #F2E8E0",
                display: "flex", alignItems: "center",
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 600, color: "#9B7060",
                  margin: 0, lineHeight: 1.3,
                }}>
                  {lbl}
                </p>
              </div>
              <div style={{
                flex: 1, minWidth: 0,
                padding: "9px 12px",
                display: "flex", alignItems: "center",
              }}>
                <p style={{
                  fontSize: 12, fontWeight: 700, color: "#1C0A00",
                  margin: 0, lineHeight: 1.3,
                  wordBreak: "break-word",
                }}>
                  {val}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Sect>

      {/* ── Rincian Shift ── */}
      <Sect>
        <SecLabel>Rincian Shift</SecLabel>
        <div style={{
          background: "#fff", borderRadius: 12, overflow: "hidden",
          border: "1.5px solid #EDD5C5",
        }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: `${C.date}px ${C.shift}px ${C.time}px ${C.sal}px`,
            background: "#FEF0E8",
            padding: "7px 12px",
            borderBottom: "1.5px solid #EDD5C5",
          }}>
            {(["Tanggal", "Shift", "Jam Kerja", "Gaji"] as const).map(h => (
              <p key={h} style={{
                fontSize: 8, fontWeight: 800, letterSpacing: 1.5,
                textTransform: "uppercase", color: "#9B7060",
                margin: 0, overflow: "hidden",
              }}>
                {h}
              </p>
            ))}
          </div>

          {shifts.length === 0 ? (
            <p style={{ padding: "16px 12px", fontSize: 12, color: "#9B7060", textAlign: "center" }}>
              Tidak ada data shift
            </p>
          ) : shifts.map((row, i) => {
            const is2x = String(row.flags ?? "").includes("FULL_SHIFT_2X");
            return (
              <div key={row.id} style={{
                display: "grid",
                gridTemplateColumns: `${C.date}px ${C.shift}px ${C.time}px ${C.sal}px`,
                padding: "6px 12px",
                background: i % 2 === 0 ? "#fff" : "#FFFAF6",
                borderBottom: i < shifts.length - 1 ? "1px solid #F2E8E0" : "none",
                alignItems: "center",
                minHeight: 34,
              }}>
                {/* Date — "1 Jun 2026" */}
                <p style={{
                  fontSize: 10, fontWeight: 700, color: "#1C0A00",
                  margin: 0, overflow: "hidden", lineHeight: 1.35,
                }}>
                  {formatDateID(row.date)}
                </p>

                {/* Shift badge */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800,
                    background: "#FEF0E8", color: "#C8202B",
                    padding: "2px 6px", borderRadius: 20,
                    border: "1px solid #F5CDB4",
                    display: "inline-block", whiteSpace: "nowrap",
                  }}>
                    {shiftName(row.shift)}
                  </span>
                  {is2x && (
                    <span style={{
                      fontSize: 8, fontWeight: 800,
                      background: "#EEF2FF", color: "#4338CA",
                      padding: "1px 5px", borderRadius: 4,
                      display: "inline-block",
                    }}>
                      2×
                    </span>
                  )}
                </div>

                {/* Time + late */}
                <div>
                  <p style={{
                    fontSize: 10, fontWeight: 600, color: "#3D1A08",
                    margin: 0, whiteSpace: "nowrap", overflow: "hidden",
                  }}>
                    {hhmm(row.checkin_time)} → {row.checkout_time ? hhmm(row.checkout_time) : "—"}
                  </p>
                  {row.late_minutes > 0 && (
                    <p style={{
                      fontSize: 9, fontWeight: 700, color: "#C8202B",
                      margin: "2px 0 0", whiteSpace: "nowrap",
                    }}>
                      Telat {row.late_minutes}m
                    </p>
                  )}
                </div>

                {/* Salary */}
                <div style={{ textAlign: "right" }}>
                  <p style={{
                    fontSize: 12, fontWeight: 900, color: "#1A8A3C",
                    margin: 0, whiteSpace: "nowrap",
                  }}>
                    {rupiah(row.final_salary)}
                  </p>
                  {row.deduction > 0 && (
                    <p style={{
                      fontSize: 9, fontWeight: 700, color: "#C8202B",
                      margin: "2px 0 0", whiteSpace: "nowrap",
                    }}>
                      −{rupiah(row.deduction)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Sect>

      {/* ── Ringkasan Pembayaran ── */}
      <Sect>
        <SecLabel>Ringkasan Pembayaran</SecLabel>
        <div style={{
          background: "#fff", borderRadius: 12, overflow: "hidden",
          border: "1.5px solid #EDD5C5",
        }}>
          {/* Highlight: nilai pembayaran ini */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "11px 16px", background: "#FEF0E8",
            borderBottom: "1px solid #F2E8E0",
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#5C3A24", margin: 0 }}>
              Nilai pembayaran ini
            </p>
            <p style={{ fontSize: 15, fontWeight: 900, color: "#C8202B", margin: 0, whiteSpace: "nowrap" }}>
              {rupiah(summary.thisPaymentAmount)}
            </p>
          </div>

          <SumRow label="Total gaji kumulatif (semua shift)" value={rupiah(summary.totalEarned)} />
          <SumRow label="Total sudah dibayarkan" value={rupiah(summary.totalPaid)} />

          {/* Saldo tertahan */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "11px 16px",
            background: summary.balance > 0 ? "#FFF1F0" : "#F0FFF4",
            borderTop: "2px solid #EDD5C5",
          }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#5C3A24", margin: 0 }}>
              Saldo gaji tertahan
            </p>
            <p style={{
              fontSize: 16, fontWeight: 900, margin: 0, whiteSpace: "nowrap",
              color: summary.balance > 0 ? "#C8202B" : "#1A8A3C",
            }}>
              {rupiah(summary.balance)}
            </p>
          </div>
        </div>
      </Sect>

      {/* ── Catatan (optional) ── */}
      {note && (
        <div style={{ padding: "0 18px 14px" }}>
          <div style={{
            background: "#FEF8E0", border: "1.5px solid #F6B800",
            borderRadius: 12, padding: "10px 14px",
          }}>
            <p style={{
              fontSize: 8, fontWeight: 800, letterSpacing: 2,
              textTransform: "uppercase", color: "#92400E", marginBottom: 4,
            }}>
              Catatan
            </p>
            <p style={{
              fontSize: 12, color: "#78350F", fontWeight: 700,
              margin: 0, wordBreak: "break-word",
            }}>
              {note}
            </p>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        padding: "12px 22px 18px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 12, borderTop: "1px solid #F2E8E0",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 9, color: "#B08070", fontWeight: 600,
            lineHeight: 1.7, margin: 0,
          }}>
            Slip ini diterbitkan resmi oleh sistem Roti Bakar Ngeunah.<br />
            Dokumen sah tanpa tanda tangan basah.
          </p>
          <p style={{
            fontSize: 8, color: "#CCAAA0", fontFamily: "monospace,sans-serif",
            marginTop: 5, wordBreak: "break-all",
          }}>
            {payment.id}
          </p>
        </div>

        {/* Stamp — solid colour only (no gradient text overlap) */}
        <div style={{
          background: "#C8202B",
          borderRadius: 10,
          padding: "10px 16px",
          textAlign: "center",
          flexShrink: 0,
          border: "2px solid #A31B24",
          minWidth: 110,
        }}>
          <p style={{
            fontSize: 8, fontWeight: 700, letterSpacing: 2,
            textTransform: "uppercase", color: "rgba(255,255,255,0.82)",
            marginBottom: 3,
          }}>
            Disetujui
          </p>
          <p style={{ fontSize: 13, fontWeight: 900, color: "#FFFFFF", margin: 0 }}>
            Admin RBN
          </p>
          <p style={{
            fontSize: 9, color: "rgba(255,255,255,0.8)",
            marginTop: 2,
          }}>
            Roti Bakar Ngeunah
          </p>
        </div>
      </div>

      {/* ── bottom rainbow band ── */}
      <div style={{ height: 6, background: "linear-gradient(90deg,#F6B800,#F0681A,#C8202B)" }} />
    </div>
  );
}

// ─── Section wrappers ─────────────────────────────────────────────────────────

function Sect({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "14px 18px" }}>{children}</div>;
}

function SecLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 8, fontWeight: 800, letterSpacing: 2.5,
      textTransform: "uppercase", color: "#9B7060",
      margin: "0 0 7px 2px",
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
      gap: 8,
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#5C3A24", margin: 0, flex: 1, minWidth: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 800, color: "#1C0A00", margin: 0, whiteSpace: "nowrap" }}>
        {value}
      </p>
    </div>
  );
}

// ─── PayslipView ──────────────────────────────────────────────────────────────

export function PayslipView({ data }: { data: PayslipData }) {
  const slipRef = useRef<HTMLDivElement>(null);
  const [dl, setDl] = useState<"img" | "pdf" | null>(null);
  // Pre-load logo as base64 on mount so html2canvas always gets it
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    toBase64(LOGO_URL).then(setLogoSrc);
  }, []);

  const safeName = data.staff.name.replace(/\s+/g, "-");
  const safeDate = data.payment.paid_at?.slice(0, 10) ?? "slip";
  const filename = `slip-gaji-${safeName}-${safeDate}`;

  async function capture() {
    if (!slipRef.current) throw new Error("Ref not found");
    const html2canvas = (await import("html2canvas")).default;
    return html2canvas(slipRef.current, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#FFF8F2",
      logging: false,
      imageTimeout: 15000,
      removeContainer: true,
    });
  }

  // PNG — always 1080 × 1920 px output
  async function downloadImage() {
    if (dl) return;
    setDl("img");
    try {
      const src = await capture();
      const OW = 1080, OH = 1920;

      const out = document.createElement("canvas");
      out.width = OW; out.height = OH;
      const ctx = out.getContext("2d")!;

      // Background
      ctx.fillStyle = "#FFF8F2";
      ctx.fillRect(0, 0, OW, OH);

      // Soft gradient footer area
      const grd = ctx.createLinearGradient(0, OH - 160, 0, OH);
      grd.addColorStop(0, "rgba(240,104,26,0)");
      grd.addColorStop(1, "rgba(240,104,26,0.07)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, OH - 160, OW, 160);

      // Scale slip: full width (×2 because src is already @2×), cap height at OH-60
      const MAX_SLIP_H = OH - 60;
      const s = Math.min(OW / src.width, MAX_SLIP_H / src.height);
      const dw = Math.round(src.width * s);
      const dh = Math.round(src.height * s);
      const dx = Math.round((OW - dw) / 2);

      ctx.drawImage(src, dx, 0, dw, dh);

      // Watermark
      ctx.font = "600 13px 'Segoe UI',sans-serif";
      ctx.fillStyle = "rgba(176,128,112,0.5)";
      ctx.textAlign = "center";
      ctx.fillText("Staff Portal · Roti Bakar Ngeunah", OW / 2, OH - 24);

      const link = document.createElement("a");
      link.href = out.toDataURL("image/png", 1.0);
      link.download = `${filename}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) { console.error(e); }
    finally { setDl(null); }
  }

  // PDF — A4, multi-page if needed
  async function downloadPdf() {
    if (dl) return;
    setDl("pdf");
    try {
      const src = await capture();
      const { jsPDF } = await import("jspdf");

      const A4W = 210, A4H = 297, M = 10;
      const cw = A4W - M * 2;
      const mmPerPx = cw / src.width;
      const totalH = src.height * mmPerPx;
      const pageH = A4H - M * 2;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

      if (totalH <= pageH) {
        pdf.addImage(src.toDataURL("image/jpeg", 0.96), "JPEG", M, M, cw, totalH);
      } else {
        const pxPerPage = Math.floor(pageH / mmPerPx);
        let yPx = 0, page = 0;
        while (yPx < src.height) {
          if (page > 0) pdf.addPage();
          const h = Math.min(pxPerPage, src.height - yPx);
          const slice = document.createElement("canvas");
          slice.width = src.width; slice.height = h;
          const sc = slice.getContext("2d")!;
          sc.fillStyle = "#FFF8F2"; sc.fillRect(0, 0, src.width, h);
          sc.drawImage(src, 0, -yPx);
          pdf.addImage(slice.toDataURL("image/jpeg", 0.96), "JPEG", M, M, cw, h * mmPerPx);
          yPx += pxPerPage; page++;
        }
      }
      pdf.save(`${filename}.pdf`);
    } catch (e) { console.error(e); }
    finally { setDl(null); }
  }

  return (
    <div>
      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <ActionBtn onClick={downloadImage} disabled={!!dl} active={dl === "img"}
          color="#1A5FA8" icon={<FileImage size={15} />}
          label="Unduh PNG (1080×1920)" loadingLabel="Mengunduh…" />
        <ActionBtn onClick={downloadPdf} disabled={!!dl} active={dl === "pdf"}
          color="#C8202B" icon={<FileText size={15} />}
          label="Unduh PDF" loadingLabel="Mengunduh…" />
        <ActionBtn onClick={() => window.print()} disabled={false} active={false}
          color="#F0681A" icon={<Printer size={15} />}
          label="Cetak" loadingLabel="" />
      </div>

      {/* Logo loading indicator */}
      {logoSrc === null && (
        <p style={{
          fontSize: 11, color: "#9B7060", marginBottom: 10, fontStyle: "italic",
        }}>
          Memuat logo…
        </p>
      )}

      {/* Slip preview */}
      <div style={{ overflowX: "auto" }}>
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
  onClick, disabled, active, color, icon, label, loadingLabel,
}: {
  onClick: () => void; disabled: boolean; active: boolean; color: string;
  icon: React.ReactNode; label: string; loadingLabel: string;
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
        opacity: disabled && !active ? 0.55 : 1,
        transition: "opacity .15s",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {active ? loadingLabel : label}
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function PayslipSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 540 }}>
      {[90, 160, 300, 120].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: 14, background: "#F0DDD0",
          animation: "skeleton-pulse 1.4s ease-in-out infinite",
        }} />
      ))}
    </div>
  );
}
