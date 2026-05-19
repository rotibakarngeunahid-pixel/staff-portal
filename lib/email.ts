import { Resend } from "resend";
import type { Report } from "@/types/domain";

type ReportEmailData = Pick<Report, "type" | "outlet_name" | "staff_name" | "date" | "submitted_at"> & {
  itemCount: number;
  selfieUrl?: string | null;
  items?: Array<{
    label?: string | null;
    photo_url?: string | null;
    submitted?: boolean;
  }>;
  to?: string | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function recipients(value?: string | null) {
  return String(value || "")
    .split(/[,\s;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function formatJakartaDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  const dayDate = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
  const time = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date).replace(/\./g, ":");
  return `${dayDate}, ${time} WIB`;
}

function photoBlock(label: string, url: string) {
  const safeLabel = escapeHtml(label);
  const safeUrl = escapeHtml(url);
  return `
    <div style="margin:0 0 18px">
      <p style="margin:0 0 6px;font-weight:700">${safeLabel}</p>
      <a href="${safeUrl}" target="_blank" rel="noreferrer" style="display:block">
        <img src="${safeUrl}" alt="${safeLabel}" style="display:block;max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:8px" />
      </a>
      <p style="margin:6px 0 0;font-size:12px"><a href="${safeUrl}" target="_blank" rel="noreferrer">Buka foto asli</a></p>
    </div>
  `;
}

export async function sendReportNotification(data: ReportEmailData) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = recipients(data.to || process.env.NOTIFICATION_EMAIL);
  if (!apiKey || to.length === 0) return false;

  const resend = new Resend(apiKey);
  const photos = [
    ...(data.selfieUrl ? [photoBlock("Selfie absen masuk", data.selfieUrl)] : []),
    ...(data.items || [])
      .filter((item) => item.photo_url)
      .map((item) => photoBlock(item.label || "Foto laporan", String(item.photo_url)))
  ].join("");

  await resend.emails.send({
    from: process.env.EMAIL_FROM || "Sistem Absensi <absensi@rotibakarngeunah.com>",
    to,
    subject: `[${data.type}] Laporan ${data.outlet_name} - ${data.date}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Laporan ${escapeHtml(data.type)}</h2>
        <p><strong>Outlet:</strong> ${escapeHtml(data.outlet_name)}</p>
        <p><strong>Staff:</strong> ${escapeHtml(data.staff_name)}</p>
        <p><strong>Tanggal:</strong> ${escapeHtml(data.date)}</p>
        <p><strong>Jumlah foto item:</strong> ${data.itemCount}</p>
        <p><strong>Submit:</strong> ${formatJakartaDateTime(data.submitted_at)}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0" />
        ${photos || "<p>Tidak ada foto laporan.</p>"}
      </div>
    `
  });
  return true;
}
