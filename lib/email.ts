import { Resend } from "resend";

type DbClient = { from: (table: string) => any };
type EmailTone = "neutral" | "success" | "warning" | "danger" | "info";

export const EMAIL_NOTIFICATION_TYPES = [
  "attendance_in",
  "opening_report",
  "closing_report",
  "attendance_out",
  "late_attendance",
  "leave_request",
  "leave_approved",
  "leave_rejected",
  "full_shift",
  "report_late",
  "system_warning"
] as const;

export type EmailNotificationType = (typeof EMAIL_NOTIFICATION_TYPES)[number];

export const EMAIL_NOTIFICATION_LABELS: Record<EmailNotificationType, string> = {
  attendance_in: "Absen Masuk",
  opening_report: "Laporan Buka Toko",
  closing_report: "Laporan Tutup Toko",
  attendance_out: "Absen Keluar",
  late_attendance: "Staff Terlambat",
  leave_request: "Request Libur Staff",
  leave_approved: "Approval Libur",
  leave_rejected: "Penolakan Libur",
  full_shift: "Full Shift",
  report_late: "Laporan Terlambat",
  system_warning: "Error / Warning Sistem"
};

const BRAND_NAME = "Roti Bakar Ngeunah";
const DEFAULT_FROM = "Roti Bakar Ngeunah <noreply@rotibakarngeunah.my.id>";
const SAMPLE_PHOTO_URL =
  "https://owner-portal.rotibakarngeunah.my.id/wp-content/uploads/2026/05/cropped-Icon-Roti-Bakar-Ngeunah.webp";

const TONE_COLORS: Record<EmailTone, { bg: string; border: string; text: string }> = {
  neutral: { bg: "#F8FAFC", border: "#E2E8F0", text: "#334155" },
  success: { bg: "#ECFDF3", border: "#BBF7D0", text: "#15803D" },
  warning: { bg: "#FFFBEB", border: "#FDE68A", text: "#B45309" },
  danger: { bg: "#FEF2F2", border: "#FECACA", text: "#B91C1C" },
  info: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8" }
};

export type EmailPhoto = {
  label: string;
  url?: string | null;
  description?: string | null;
};

type InfoRow = {
  label: string;
  value?: string | number | boolean | null;
  tone?: EmailTone;
};

type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

type ReportEmailData = {
  staffName: string;
  outletName: string;
  date: string;
  submittedAt: string;
  statusLabel: string;
  statusTone: EmailTone;
  deadlineLabel?: string | null;
  lateMinutes?: number | null;
  items?: Array<{ label?: string | null; required?: boolean | null; submitted?: boolean | null; photo_url?: string | null }>;
  photos?: EmailPhoto[];
  note?: string | null;
};

type SendEmailNotificationInput = {
  type: EmailNotificationType;
  to?: string | null;
  template: EmailTemplate;
  activityType?: string | null;
  activityId?: string | null;
  idempotencyKey?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  outletId?: string | null;
  outletName?: string | null;
  payload?: Record<string, unknown>;
};

export type EmailLog = {
  id: string;
  notification_type: string;
  recipient: string;
  subject: string;
  status: "pending" | "sent" | "failed" | "skipped";
  activity_type: string | null;
  activity_id: string | null;
  idempotency_key: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  staff_id: string | null;
  staff_name: string | null;
  outlet_id: string | null;
  outlet_name: string | null;
  sent_at: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  payload_json?: Record<string, unknown> | null;
};

export type EmailListResult = {
  logs: EmailLog[];
  unavailable: boolean;
};

class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export function isEmailNotificationType(value: string): value is EmailNotificationType {
  return EMAIL_NOTIFICATION_TYPES.includes(value as EmailNotificationType);
}

export function parseEmailRecipients(value?: string | null) {
  return String(value || "")
    .split(/[,\s;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidEmailList(value?: string | null) {
  const list = parseEmailRecipients(value);
  return list.length > 0 && list.every(isValidEmail);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function publicHttpsUrl(value?: string | null) {
  const url = String(value || "").trim();
  if (!/^https:\/\/[^\s]+$/i.test(url)) return null;
  return url;
}

function appUrl(path = "/admin") {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatDateID(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatDateTimeID(value?: string | null, timeZone = "Asia/Jakarta", suffix = "WIB") {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  const formatted = new Intl.DateTimeFormat("id-ID", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(date)
    .replace(/\./g, ":");
  return `${formatted} ${suffix}`;
}

function formatTimeID(value?: string | null, timeZone = "Asia/Jakarta", suffix = "WIB") {
  if (!value) return "-";
  if (/^\d{1,2}:\d{2}/.test(value)) return `${value.slice(0, 5)} ${suffix}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  const formatted = new Intl.DateTimeFormat("id-ID", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(date)
    .replace(/\./g, ":");
  return `${formatted} ${suffix}`;
}

function formatMinutes(value?: number | null) {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  if (minutes <= 0) return "0 menit";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} menit`;
  return rest ? `${hours} jam ${rest} menit` : `${hours} jam`;
}

function formatCurrency(value?: number | string | null) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number.isFinite(amount) ? amount : 0);
}

function badge(label: string, tone: EmailTone) {
  const color = TONE_COLORS[tone];
  return `<span style="display:inline-block;background:${color.bg};border:1.5px solid ${color.border};color:${color.text};border-radius:999px;padding:6px 14px;font-size:13px;font-weight:800;line-height:1.2">${escapeHtml(label)}</span>`;
}

function infoTable(rows: InfoRow[]) {
  const visibleRows = rows.filter((row) => row.value !== undefined && row.value !== null && row.value !== "");
  if (!visibleRows.length) return "";
  return visibleRows
    .map((row, i) => {
      const isLast = i === visibleRows.length - 1;
      const color = row.tone ? TONE_COLORS[row.tone].text : "#0F172A";
      return `<div style="padding:10px 0${isLast ? "" : ";border-bottom:1px solid #F1F5F9"}"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8;margin-bottom:3px">${escapeHtml(row.label)}</div><div style="font-size:16px;font-weight:700;color:${color};line-height:1.4">${escapeHtml(row.value)}</div></div>`;
    })
    .join("");
}

function section(title: string, content: string) {
  if (!content.trim()) return "";
  return `
    <tr>
      <td style="padding:14px 20px 16px">
        <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#94A3B8">${escapeHtml(title)}</p>
        ${content}
      </td>
    </tr>
    <tr><td style="background:#F1F5F9;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr>
  `;
}

function actionButton(url: string | null, label: string) {
  if (!url) return "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px">
      <tr>
        <td style="background:#922B21;border-radius:10px">
          <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="display:inline-block;color:#FFFFFF;text-decoration:none;padding:12px 20px;font-size:14px;font-weight:800">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>
  `;
}

function photoGallery(photos: EmailPhoto[]) {
  const items = photos.map((photo) => ({ ...photo, url: publicHttpsUrl(photo.url) }));
  const validItems = items.filter((photo) => photo.url);
  if (!validItems.length) return "";
  return validItems
    .map((photo) => `
      <div style="margin-bottom:14px">
        <a href="${escapeHtml(photo.url!)}" target="_blank" rel="noreferrer" style="display:block;text-decoration:none">
          <img src="${escapeHtml(photo.url!)}" alt="${escapeHtml(photo.label)}" width="480" style="display:block;width:100%;max-width:480px;height:auto;border-radius:12px;border:1px solid #E2E8F0" />
        </a>
        <p style="margin:6px 0 0;font-size:13px;font-weight:700;color:#334155">${escapeHtml(photo.label)}</p>
        ${photo.description ? `<p style="margin:2px 0 0;font-size:12px;color:#64748B;line-height:1.5">${escapeHtml(photo.description)}</p>` : ""}
      </div>
    `)
    .join("");
}

function checklistSummary(items?: Array<{ label?: string | null; required?: boolean | null; submitted?: boolean | null; photo_url?: string | null }>) {
  const list = (items || []).filter((item) => item.label);
  if (!list.length) return "";
  return list
    .map((item, i) => {
      const isLast = i === list.length - 1;
      const done = Boolean(item.submitted || item.photo_url);
      return `<div style="display:table;width:100%;padding:10px 0${isLast ? "" : ";border-bottom:1px solid #F1F5F9"}"><div style="display:table-cell;font-size:15px;font-weight:700;color:#0F172A;vertical-align:middle">${escapeHtml(item.label)}</div><div style="display:table-cell;text-align:right;vertical-align:middle;white-space:nowrap">${badge(done ? "Selesai" : item.required ? "Wajib" : "Opsional", done ? "success" : item.required ? "warning" : "neutral")}</div></div>`;
    })
    .join("");
}

function emailLayout(input: {
  title: string;
  subtitle: string;
  statusLabel?: string;
  statusTone?: EmailTone;
  sections: string;
}) {
  const preheader = stripHtml(input.subtitle).slice(0, 150);
  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0F172A;-webkit-text-size-adjust:100%">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;border-collapse:collapse">
      <tr>
        <td align="center" style="padding:16px 10px 24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;border-collapse:separate;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
            <tr>
              <td style="background:#7B241C;padding:20px 20px 18px">
                <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#FCA5A5">${BRAND_NAME}</p>
                <h1 style="margin:0 0 7px;font-size:22px;line-height:1.2;font-weight:800;color:#FFFFFF">${escapeHtml(input.title)}</h1>
                <p style="margin:0;font-size:14px;line-height:1.5;color:#FFE4D6">${escapeHtml(input.subtitle)}</p>
                ${input.statusLabel ? `<div style="margin-top:12px">${badge(input.statusLabel, input.statusTone || "neutral")}</div>` : ""}
              </td>
            </tr>
            <tr><td style="background:#F1F5F9;height:1px;line-height:1px;font-size:1px">&nbsp;</td></tr>
            ${input.sections}
            <tr>
              <td style="padding:14px 20px 20px">
                <p style="margin:0;color:#94A3B8;font-size:11px;line-height:1.6;text-align:center">Email otomatis dari sistem ${BRAND_NAME}.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function textTemplate(title: string, rows: InfoRow[]) {
  return [
    `${BRAND_NAME} - ${title}`,
    "",
    ...rows
      .filter((row) => row.value !== undefined && row.value !== null && row.value !== "")
      .map((row) => `${row.label}: ${String(row.value)}`)
  ].join("\n");
}

export function buildAttendanceInEmail(data: {
  staffName: string;
  outletName: string;
  shiftLabel: string;
  date: string;
  scheduledStart?: string | null;
  checkinTime: string;
  lateMinutes?: number;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  selfieUrl?: string | null;
}) {
  const isLate = Number(data.lateMinutes || 0) > 0;
  const rows: InfoRow[] = [
    { label: "Nama staff", value: data.staffName },
    { label: "Outlet", value: data.outletName },
    { label: "Shift", value: data.shiftLabel },
    { label: "Tanggal operasional", value: formatDateID(data.date) },
    { label: "Jadwal masuk", value: data.scheduledStart ? formatTimeID(data.scheduledStart, "Asia/Makassar", "WITA") : "-" },
    { label: "Jam absen masuk", value: formatDateTimeID(data.checkinTime, "Asia/Makassar", "WITA") },
    { label: "Status keterlambatan", value: isLate ? `Terlambat ${formatMinutes(data.lateMinutes)}` : "Tepat waktu", tone: isLate ? "warning" : "success" },
    { label: "Lokasi/GPS", value: gpsText(data.lat, data.lng, data.accuracy) }
  ];

  const mapsUrl = mapUrl(data.lat, data.lng);
  const html = emailLayout({
    title: "Absen Masuk Staff",
    subtitle: `${data.staffName} berhasil absen masuk di ${data.outletName}.`,
    statusLabel: isLate ? "Terlambat" : "Tepat waktu",
    statusTone: isLate ? "warning" : "success",
    sections:
      section("Informasi Staff", infoTable(rows.slice(0, 4))) +
      section("Detail Waktu", infoTable(rows.slice(4, 7))) +
      section("Lokasi/GPS", infoTable(rows.slice(7)) + actionButton(mapsUrl, "Buka Lokasi GPS")) +
      section("Foto Dokumentasi", photoGallery([{ label: "Foto Selfie Absen Masuk", url: data.selfieUrl }]))
  });
  return { subject: `[RBN] Absen Masuk - ${data.staffName}`, html, text: textTemplate("Absen Masuk Staff", rows) };
}

export function buildLateAttendanceEmail(data: {
  staffName: string;
  outletName: string;
  shiftLabel: string;
  date: string;
  scheduledStart?: string | null;
  checkinTime: string;
  lateMinutes: number;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  selfieUrl?: string | null;
}) {
  const rows: InfoRow[] = [
    { label: "Nama staff", value: data.staffName },
    { label: "Outlet", value: data.outletName },
    { label: "Shift", value: data.shiftLabel },
    { label: "Tanggal operasional", value: formatDateID(data.date) },
    { label: "Jadwal masuk", value: data.scheduledStart ? formatTimeID(data.scheduledStart, "Asia/Makassar", "WITA") : "-" },
    { label: "Jam absen masuk", value: formatDateTimeID(data.checkinTime, "Asia/Makassar", "WITA") },
    { label: "Total terlambat", value: formatMinutes(data.lateMinutes), tone: "warning" },
    { label: "Lokasi/GPS", value: gpsText(data.lat, data.lng, data.accuracy) }
  ];

  const html = emailLayout({
    title: "Staff Terlambat",
    subtitle: `${data.staffName} terlambat ${formatMinutes(data.lateMinutes)} dari jadwal masuk.`,
    statusLabel: "Terlambat",
    statusTone: "warning",
    sections:
      section("Informasi Staff", infoTable(rows.slice(0, 4))) +
      section("Detail Keterlambatan", infoTable(rows.slice(4, 8)) + actionButton(mapUrl(data.lat, data.lng), "Buka Lokasi GPS")) +
      section("Foto Dokumentasi", photoGallery([{ label: "Foto Selfie Absen Masuk", url: data.selfieUrl }]))
  });
  return { subject: `[RBN] Staff Terlambat - ${data.staffName}`, html, text: textTemplate("Staff Terlambat", rows) };
}

function buildReportEmail(data: ReportEmailData & { reportTitle: string }) {
  const rows: InfoRow[] = [
    { label: "Nama staff", value: data.staffName },
    { label: "Outlet", value: data.outletName },
    { label: "Tanggal operasional", value: formatDateID(data.date) },
    { label: "Jam kirim laporan", value: formatDateTimeID(data.submittedAt, "Asia/Makassar", "WITA") },
    { label: "Status laporan", value: data.statusLabel, tone: data.statusTone },
    { label: "Batas kirim laporan", value: data.deadlineLabel || null },
    { label: "Selisih keterlambatan", value: data.lateMinutes ? formatMinutes(data.lateMinutes) : null, tone: "warning" }
  ];

  const html = emailLayout({
    title: data.reportTitle,
    subtitle: `${data.staffName} mengirim ${data.reportTitle.toLowerCase()} untuk ${data.outletName}.`,
    statusLabel: data.statusLabel,
    statusTone: data.statusTone,
    sections:
      section("Informasi Staff", infoTable(rows.slice(0, 3))) +
      section("Detail Waktu", infoTable(rows.slice(3))) +
      section("Detail Laporan", checklistSummary(data.items)) +
      section("Foto Dokumentasi", photoGallery(data.photos || [])) +
      section("Catatan", `<p style="margin:0;color:#334155;font-size:13px;line-height:1.6">${escapeHtml(data.note || "Tidak ada catatan staff.")}</p>`)
  });
  return { subject: `[RBN] ${data.reportTitle} - ${data.outletName}`, html, text: textTemplate(data.reportTitle, rows) };
}

export function buildOpeningReportEmail(data: ReportEmailData) {
  return buildReportEmail({ ...data, reportTitle: "Laporan Buka Toko" });
}

export function buildClosingReportEmail(data: ReportEmailData) {
  return buildReportEmail({ ...data, reportTitle: "Laporan Tutup Toko" });
}

export function buildAttendanceOutEmail(data: {
  staffName: string;
  outletName: string;
  shiftLabel: string;
  date: string;
  checkinTime?: string | null;
  checkoutTime: string;
  totalWorkMinutes?: number | null;
  taskStatus: string;
  payrollStatus?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  selfieUrl?: string | null;
}) {
  const rows: InfoRow[] = [
    { label: "Nama staff", value: data.staffName },
    { label: "Outlet", value: data.outletName },
    { label: "Shift", value: data.shiftLabel },
    { label: "Tanggal operasional", value: formatDateID(data.date) },
    { label: "Jam absen masuk", value: data.checkinTime ? formatDateTimeID(data.checkinTime, "Asia/Makassar", "WITA") : "-" },
    { label: "Jam absen keluar", value: formatDateTimeID(data.checkoutTime, "Asia/Makassar", "WITA") },
    { label: "Total jam kerja", value: formatMinutes(data.totalWorkMinutes) },
    { label: "Status tugas", value: data.taskStatus },
    { label: "Status payroll/gaji", value: data.payrollStatus || "Belum dibayar" },
    { label: "GPS absen keluar", value: gpsText(data.lat, data.lng, data.accuracy) }
  ];

  const html = emailLayout({
    title: "Absen Keluar Staff",
    subtitle: `${data.staffName} berhasil absen keluar dari ${data.outletName}.`,
    statusLabel: "Selesai",
    statusTone: "success",
    sections:
      section("Informasi Staff", infoTable(rows.slice(0, 4))) +
      section("Detail Waktu", infoTable(rows.slice(4, 7))) +
      section("Detail Tugas dan Payroll", infoTable(rows.slice(7, 9))) +
      section("Lokasi/GPS", infoTable(rows.slice(9)) + actionButton(mapUrl(data.lat, data.lng), "Buka Lokasi GPS")) +
      section("Foto Dokumentasi", photoGallery([{ label: "Foto Selfie Absen Keluar", url: data.selfieUrl }]))
  });
  return { subject: `[RBN] Absen Keluar - ${data.staffName}`, html, text: textTemplate("Absen Keluar Staff", rows) };
}

export function buildLeaveRequestEmail(data: {
  staffName: string;
  outletName: string;
  leaveDate: string;
  reason?: string | null;
  requestedAt: string;
  status: "pending" | "approved" | "cancelled";
  adminUrl?: string | null;
}) {
  const statusLabel = data.status === "approved" ? "Disetujui" : data.status === "cancelled" ? "Ditolak/Dibatalkan" : "Menunggu approval";
  const tone: EmailTone = data.status === "approved" ? "success" : data.status === "cancelled" ? "danger" : "warning";
  const rows: InfoRow[] = [
    { label: "Nama staff", value: data.staffName },
    { label: "Outlet", value: data.outletName },
    { label: "Tanggal libur", value: formatDateID(data.leaveDate) },
    { label: "Alasan libur", value: data.reason || "Tidak ada alasan tertulis" },
    { label: "Waktu request dibuat", value: formatDateTimeID(data.requestedAt, "Asia/Makassar", "WITA") },
    { label: "Status request", value: statusLabel, tone }
  ];

  const html = emailLayout({
    title: "Request Libur Staff",
    subtitle: `${data.staffName} mengajukan libur untuk ${formatDateID(data.leaveDate)}.`,
    statusLabel,
    statusTone: tone,
    sections:
      section("Informasi Staff", infoTable(rows.slice(0, 2))) +
      section("Detail Libur", infoTable(rows.slice(2)) + actionButton(data.adminUrl || appUrl("/admin/leave"), "Buka Halaman Admin"))
  });
  return { subject: `[RBN] Request Libur - ${data.staffName}`, html, text: textTemplate("Request Libur Staff", rows) };
}

export function buildLeaveDecisionEmail(data: {
  staffName: string;
  outletName: string;
  leaveDate: string;
  approved: boolean;
  adminNote?: string | null;
}) {
  const statusLabel = data.approved ? "Disetujui" : "Ditolak";
  const rows: InfoRow[] = [
    { label: "Nama staff", value: data.staffName },
    { label: "Outlet", value: data.outletName },
    { label: "Tanggal libur", value: formatDateID(data.leaveDate) },
    { label: "Status", value: statusLabel, tone: data.approved ? "success" : "danger" },
    { label: "Catatan admin", value: data.adminNote || "Tidak ada catatan admin" }
  ];

  const html = emailLayout({
    title: data.approved ? "Approval Libur Staff" : "Penolakan Libur Staff",
    subtitle: `Permintaan libur ${data.staffName} untuk ${formatDateID(data.leaveDate)} ${data.approved ? "disetujui" : "ditolak"}.`,
    statusLabel,
    statusTone: data.approved ? "success" : "danger",
    sections: section("Detail Keputusan", infoTable(rows))
  });
  return { subject: `[RBN] ${data.approved ? "Approval" : "Penolakan"} Libur - ${data.staffName}`, html, text: textTemplate("Keputusan Libur Staff", rows) };
}

export function buildFullShiftEmail(data: {
  staffName: string;
  outletName: string;
  date: string;
  shiftLabel: string;
  checkinTime?: string | null;
  note?: string | null;
}) {
  const rows: InfoRow[] = [
    { label: "Nama staff", value: data.staffName },
    { label: "Outlet", value: data.outletName },
    { label: "Tanggal operasional", value: formatDateID(data.date) },
    { label: "Shift", value: data.shiftLabel },
    { label: "Jam mulai", value: data.checkinTime ? formatDateTimeID(data.checkinTime, "Asia/Makassar", "WITA") : "-" },
    { label: "Catatan", value: data.note || "Staff menjalankan coverage full shift." }
  ];

  const html = emailLayout({
    title: "Full Shift Staff",
    subtitle: `${data.staffName} terdeteksi menjalankan full shift di ${data.outletName}.`,
    statusLabel: "Full Shift",
    statusTone: "info",
    sections: section("Detail Full Shift", infoTable(rows))
  });
  return { subject: `[RBN] Full Shift - ${data.staffName}`, html, text: textTemplate("Full Shift Staff", rows) };
}

export function buildSystemWarningEmail(data: {
  title: string;
  message: string;
  severity?: "info" | "warning" | "danger";
  createdAt?: string;
  context?: Record<string, string | number | boolean | null | undefined>;
}) {
  const tone: EmailTone = data.severity === "danger" ? "danger" : data.severity === "warning" ? "warning" : "info";
  const rows: InfoRow[] = [
    { label: "Judul", value: data.title },
    { label: "Pesan", value: data.message },
    { label: "Waktu", value: formatDateTimeID(data.createdAt || new Date().toISOString(), "Asia/Makassar", "WITA") },
    ...Object.entries(data.context || {}).map(([label, value]) => ({ label, value }))
  ];

  const html = emailLayout({
    title: "Warning Sistem",
    subtitle: data.message,
    statusLabel: data.severity === "danger" ? "Error" : data.severity === "warning" ? "Warning" : "Info",
    statusTone: tone,
    sections: section("Detail Sistem", infoTable(rows))
  });
  return { subject: `[RBN] Warning Sistem - ${data.title}`, html, text: textTemplate("Warning Sistem", rows) };
}

export async function sendAttendanceInEmail(db: DbClient | null, data: Parameters<typeof buildAttendanceInEmail>[0] & BaseActivityData & { to?: string | null }) {
  return sendEmailNotification(db, {
    type: "attendance_in",
    to: data.to,
    template: buildAttendanceInEmail(data),
    activityType: "attendance",
    activityId: data.attendanceId,
    idempotencyKey: data.attendanceId ? `attendance:${data.attendanceId}:checkin` : null,
    staffId: data.staffId,
    staffName: data.staffName,
    outletId: data.outletId,
    outletName: data.outletName,
    payload: data
  });
}

export async function sendLateAttendanceEmail(db: DbClient | null, data: Parameters<typeof buildLateAttendanceEmail>[0] & BaseActivityData & { to?: string | null }) {
  return sendEmailNotification(db, {
    type: "late_attendance",
    to: data.to,
    template: buildLateAttendanceEmail(data),
    activityType: "attendance",
    activityId: data.attendanceId,
    idempotencyKey: data.attendanceId ? `attendance:${data.attendanceId}:late` : null,
    staffId: data.staffId,
    staffName: data.staffName,
    outletId: data.outletId,
    outletName: data.outletName,
    payload: data
  });
}

export async function sendOpeningReportEmail(db: DbClient | null, data: Parameters<typeof buildOpeningReportEmail>[0] & BaseActivityData & { reportId?: string | null; to?: string | null; forceType?: EmailNotificationType }) {
  return sendEmailNotification(db, {
    type: data.forceType || "opening_report",
    to: data.to,
    template: buildOpeningReportEmail(data),
    activityType: "report",
    activityId: data.reportId,
    idempotencyKey: data.reportId ? `report:${data.reportId}:opening` : null,
    staffId: data.staffId,
    staffName: data.staffName,
    outletId: data.outletId,
    outletName: data.outletName,
    payload: data
  });
}

export async function sendClosingReportEmail(db: DbClient | null, data: Parameters<typeof buildClosingReportEmail>[0] & BaseActivityData & { reportId?: string | null; to?: string | null; forceType?: EmailNotificationType }) {
  return sendEmailNotification(db, {
    type: data.forceType || "closing_report",
    to: data.to,
    template: buildClosingReportEmail(data),
    activityType: "report",
    activityId: data.reportId,
    idempotencyKey: data.reportId ? `report:${data.reportId}:closing` : null,
    staffId: data.staffId,
    staffName: data.staffName,
    outletId: data.outletId,
    outletName: data.outletName,
    payload: data
  });
}

export async function sendAttendanceOutEmail(db: DbClient | null, data: Parameters<typeof buildAttendanceOutEmail>[0] & BaseActivityData & { to?: string | null }) {
  return sendEmailNotification(db, {
    type: "attendance_out",
    to: data.to,
    template: buildAttendanceOutEmail(data),
    activityType: "attendance",
    activityId: data.attendanceId,
    idempotencyKey: data.attendanceId ? `attendance:${data.attendanceId}:checkout` : null,
    staffId: data.staffId,
    staffName: data.staffName,
    outletId: data.outletId,
    outletName: data.outletName,
    payload: data
  });
}

export async function sendLeaveRequestEmail(db: DbClient | null, data: Parameters<typeof buildLeaveRequestEmail>[0] & BaseActivityData & { leaveId?: string | null; to?: string | null }) {
  return sendEmailNotification(db, {
    type: "leave_request",
    to: data.to,
    template: buildLeaveRequestEmail(data),
    activityType: "leave_request",
    activityId: data.leaveId,
    idempotencyKey: data.leaveId ? `leave:${data.leaveId}:request` : null,
    staffId: data.staffId,
    staffName: data.staffName,
    outletId: data.outletId,
    outletName: data.outletName,
    payload: data
  });
}

export async function sendLeaveDecisionEmail(db: DbClient | null, data: Parameters<typeof buildLeaveDecisionEmail>[0] & BaseActivityData & { leaveId?: string | null; to?: string | null }) {
  return sendEmailNotification(db, {
    type: data.approved ? "leave_approved" : "leave_rejected",
    to: data.to,
    template: buildLeaveDecisionEmail(data),
    activityType: "leave_request",
    activityId: data.leaveId,
    idempotencyKey: data.leaveId ? `leave:${data.leaveId}:decision:${data.approved ? "approved" : "rejected"}` : null,
    staffId: data.staffId,
    staffName: data.staffName,
    outletId: data.outletId,
    outletName: data.outletName,
    payload: data
  });
}

export async function sendFullShiftEmail(db: DbClient | null, data: Parameters<typeof buildFullShiftEmail>[0] & BaseActivityData & { to?: string | null }) {
  return sendEmailNotification(db, {
    type: "full_shift",
    to: data.to,
    template: buildFullShiftEmail(data),
    activityType: "attendance",
    activityId: data.attendanceId,
    idempotencyKey: data.attendanceId ? `attendance:${data.attendanceId}:full_shift` : null,
    staffId: data.staffId,
    staffName: data.staffName,
    outletId: data.outletId,
    outletName: data.outletName,
    payload: data
  });
}

export function buildOpeningCombinedEmail(data: {
  staffName: string;
  outletName: string;
  shiftLabel: string;
  date: string;
  scheduledStart?: string | null;
  checkinTime?: string | null;
  lateMinutes?: number | null;
  checkinLat?: number | null;
  checkinLng?: number | null;
  selfieInUrl?: string | null;
  submittedAt: string;
  reportStatusLabel: string;
  reportStatusTone: EmailTone;
  deadlineLabel?: string | null;
  reportLateMinutes?: number | null;
  items?: Array<{ label?: string | null; required?: boolean | null; submitted?: boolean | null; photo_url?: string | null }>;
  photos?: EmailPhoto[];
  note?: string | null;
}) {
  const isLate = Number(data.lateMinutes || 0) > 0;
  const checkinRows: InfoRow[] = [
    { label: "Tanggal", value: formatDateID(data.date) },
    { label: "Shift", value: data.shiftLabel },
    { label: "Jadwal masuk", value: data.scheduledStart ? formatTimeID(data.scheduledStart, "Asia/Makassar", "WITA") : null },
    { label: "Jam absen masuk", value: data.checkinTime ? formatDateTimeID(data.checkinTime, "Asia/Makassar", "WITA") : "Belum absen" },
    { label: "Status", value: isLate ? `Terlambat ${formatMinutes(data.lateMinutes)}` : "Tepat waktu", tone: isLate ? "warning" : "success" },
  ].filter((r) => r.value !== null && r.value !== undefined && r.value !== "") as InfoRow[];
  const reportRows: InfoRow[] = [
    { label: "Jam kirim laporan", value: formatDateTimeID(data.submittedAt, "Asia/Makassar", "WITA") },
    { label: "Status laporan", value: data.reportStatusLabel, tone: data.reportStatusTone },
    { label: "Batas kirim", value: data.deadlineLabel || null },
    { label: "Terlambat", value: data.reportLateMinutes ? formatMinutes(data.reportLateMinutes) : null, tone: "warning" },
  ].filter((r) => r.value !== null && r.value !== undefined && r.value !== "") as InfoRow[];
  const mapsUrl = mapUrl(data.checkinLat, data.checkinLng);
  const html = emailLayout({
    title: "Absen Masuk + Laporan Buka Toko",
    subtitle: `${data.staffName} absen masuk dan mengirim laporan buka di ${data.outletName}.`,
    statusLabel: data.reportStatusLabel,
    statusTone: data.reportStatusTone,
    sections:
      section("Info Staff", infoTable([
        { label: "Nama staff", value: data.staffName },
        { label: "Outlet", value: data.outletName },
      ])) +
      section("Absen Masuk", infoTable(checkinRows) + (mapsUrl ? actionButton(mapsUrl, "Buka Lokasi GPS") : "")) +
      section("Foto Selfie Masuk", photoGallery([{ label: "Selfie Absen Masuk", url: data.selfieInUrl }])) +
      section("Laporan Buka Toko", infoTable(reportRows)) +
      section("Checklist Laporan", checklistSummary(data.items)) +
      section("Foto Laporan", photoGallery(data.photos || [])) +
      (data.note ? section("Catatan Staff", `<p style="margin:0;padding:10px 0;color:#334155;font-size:15px;line-height:1.6">${escapeHtml(data.note)}</p>`) : "")
  });
  return {
    subject: `[RBN] Buka Toko - ${data.staffName} | ${data.outletName}`,
    html,
    text: textTemplate("Absen Masuk + Laporan Buka Toko", [...checkinRows, ...reportRows])
  };
}

export function buildClosingCombinedEmail(data: {
  staffName: string;
  outletName: string;
  shiftLabel: string;
  date: string;
  submittedAt: string;
  reportStatusLabel: string;
  reportStatusTone: EmailTone;
  deadlineLabel?: string | null;
  reportLateMinutes?: number | null;
  items?: Array<{ label?: string | null; required?: boolean | null; submitted?: boolean | null; photo_url?: string | null }>;
  photos?: EmailPhoto[];
  note?: string | null;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  totalWorkMinutes?: number | null;
  selfieOutUrl?: string | null;
  checkoutLat?: number | null;
  checkoutLng?: number | null;
  checkoutAcc?: number | null;
  payrollStatus?: string | null;
}) {
  const reportRows: InfoRow[] = [
    { label: "Tanggal", value: formatDateID(data.date) },
    { label: "Shift", value: data.shiftLabel },
    { label: "Jam kirim laporan", value: formatDateTimeID(data.submittedAt, "Asia/Makassar", "WITA") },
    { label: "Status laporan", value: data.reportStatusLabel, tone: data.reportStatusTone },
    { label: "Batas kirim", value: data.deadlineLabel || null },
    { label: "Terlambat", value: data.reportLateMinutes ? formatMinutes(data.reportLateMinutes) : null, tone: "warning" },
  ].filter((r) => r.value !== null && r.value !== undefined && r.value !== "") as InfoRow[];
  const checkoutRows: InfoRow[] = [
    { label: "Jam absen masuk", value: data.checkinTime ? formatDateTimeID(data.checkinTime, "Asia/Makassar", "WITA") : null },
    { label: "Jam absen keluar", value: data.checkoutTime ? formatDateTimeID(data.checkoutTime, "Asia/Makassar", "WITA") : "Belum absen keluar" },
    { label: "Total jam kerja", value: data.totalWorkMinutes ? formatMinutes(data.totalWorkMinutes) : null },
    { label: "Status gaji", value: data.payrollStatus || null },
  ].filter((r) => r.value !== null && r.value !== undefined && r.value !== "") as InfoRow[];
  const checkoutMapsUrl = mapUrl(data.checkoutLat, data.checkoutLng);
  const html = emailLayout({
    title: "Laporan Tutup Toko + Absen Keluar",
    subtitle: `${data.staffName} mengirim laporan tutup toko di ${data.outletName}.`,
    statusLabel: data.reportStatusLabel,
    statusTone: data.reportStatusTone,
    sections:
      section("Info Staff", infoTable([
        { label: "Nama staff", value: data.staffName },
        { label: "Outlet", value: data.outletName },
      ])) +
      section("Laporan Tutup Toko", infoTable(reportRows)) +
      section("Checklist Laporan", checklistSummary(data.items)) +
      section("Foto Laporan", photoGallery(data.photos || [])) +
      (data.note ? section("Catatan Staff", `<p style="margin:0;padding:10px 0;color:#334155;font-size:15px;line-height:1.6">${escapeHtml(data.note)}</p>`) : "") +
      section("Absen Keluar", infoTable(checkoutRows) + (checkoutMapsUrl ? actionButton(checkoutMapsUrl, "Buka Lokasi GPS") : "")) +
      section("Foto Selfie Keluar", photoGallery([{ label: "Selfie Absen Keluar", url: data.selfieOutUrl }]))
  });
  return {
    subject: `[RBN] Tutup Toko - ${data.staffName} | ${data.outletName}`,
    html,
    text: textTemplate("Laporan Tutup Toko + Absen Keluar", [...reportRows, ...checkoutRows])
  };
}

export async function sendOpeningCombinedEmail(db: DbClient | null, data: Parameters<typeof buildOpeningCombinedEmail>[0] & BaseActivityData & { reportId?: string | null; to?: string | null; forceType?: EmailNotificationType }) {
  return sendEmailNotification(db, {
    type: data.forceType || "opening_report",
    to: data.to,
    template: buildOpeningCombinedEmail(data),
    activityType: "report",
    activityId: data.reportId,
    idempotencyKey: data.reportId ? `report:${data.reportId}:opening_combined` : null,
    staffId: data.staffId,
    staffName: data.staffName,
    outletId: data.outletId,
    outletName: data.outletName,
    payload: data
  });
}

export async function sendClosingCombinedEmail(db: DbClient | null, data: Parameters<typeof buildClosingCombinedEmail>[0] & BaseActivityData & { reportId?: string | null; to?: string | null; forceType?: EmailNotificationType }) {
  return sendEmailNotification(db, {
    type: data.forceType || "closing_report",
    to: data.to,
    template: buildClosingCombinedEmail(data),
    activityType: "report",
    activityId: data.reportId,
    idempotencyKey: data.reportId ? `report:${data.reportId}:closing_combined` : null,
    staffId: data.staffId,
    staffName: data.staffName,
    outletId: data.outletId,
    outletName: data.outletName,
    payload: data
  });
}

export async function sendSystemWarningEmail(db: DbClient | null, data: Parameters<typeof buildSystemWarningEmail>[0] & { to?: string | null; idempotencyKey?: string | null }) {
  return sendEmailNotification(db, {
    type: "system_warning",
    to: data.to,
    template: buildSystemWarningEmail(data),
    activityType: "system",
    activityId: data.idempotencyKey || null,
    idempotencyKey: data.idempotencyKey || null,
    payload: data
  });
}

export async function sendTestEmailNotification(db: DbClient | null, type: EmailNotificationType, to: string) {
  if (!isValidEmailList(to)) throw new EmailDeliveryError("Email tujuan tidak valid.");
  const sample = buildTestTemplate(type);
  return sendEmailNotification(db, {
    type,
    to,
    template: sample.template,
    activityType: "test_email",
    activityId: sample.activityId,
    idempotencyKey: `test:${type}:${crypto.randomUUID()}`,
    staffName: sample.staffName,
    outletName: sample.outletName,
    payload: { test: true, type }
  });
}

type BaseActivityData = {
  attendanceId?: string | null;
  staffId?: string | null;
  outletId?: string | null;
};

async function sendEmailNotification(db: DbClient | null, input: SendEmailNotificationInput) {
  const recipientList = parseEmailRecipients(input.to || process.env.NOTIFICATION_EMAIL);
  if (!recipientList.length) {
    throw new EmailDeliveryError("Email penerima belum dikonfigurasi.");
  }
  if (!recipientList.every(isValidEmail)) {
    throw new EmailDeliveryError("Format email penerima tidak valid.");
  }

  const results = [];
  for (const recipient of recipientList) {
    results.push(await deliverOneEmail(db, input, recipient));
  }
  return {
    sent: results.some((result) => result.status === "sent"),
    skipped: results.every((result) => result.status === "skipped"),
    results
  };
}

async function deliverOneEmail(db: DbClient | null, input: SendEmailNotificationInput, recipient: string) {
  const logPayload = {
    notification_type: input.type,
    recipient,
    subject: input.template.subject,
    status: "pending",
    activity_type: input.activityType || null,
    activity_id: input.activityId || null,
    idempotency_key: input.idempotencyKey ? `${input.idempotencyKey}:${recipient.toLowerCase()}` : null,
    staff_id: input.staffId || null,
    staff_name: input.staffName || null,
    outlet_id: input.outletId || null,
    outlet_name: input.outletName || null,
    payload_json: {
      type: input.type,
      template: input.template,
      payload: input.payload || {}
    }
  };

  const created = await insertEmailLog(db, logPayload);
  if (created.duplicate) {
    return {
      status: "skipped" as const,
      recipient,
      log: created.log,
      reason: "Email untuk aktivitas ini sudah pernah dibuat."
    };
  }

  try {
    const providerMessageId = await sendRawEmail({
      to: recipient,
      subject: input.template.subject,
      html: input.template.html,
      text: input.template.text
    });
    await updateEmailLog(db, created.log?.id, {
      status: "sent",
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
      error_message: null
    });
    return { status: "sent" as const, recipient, log: created.log };
  } catch (error) {
    const message = cleanEmailError(error);
    await updateEmailLog(db, created.log?.id, {
      status: "failed",
      error_message: message
    });
    throw new EmailDeliveryError(message);
  }
}

async function sendRawEmail(input: { to: string; subject: string; html: string; text?: string | null }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new EmailDeliveryError("Konfigurasi RESEND_API_KEY belum tersedia.");
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM || DEFAULT_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text || stripHtml(input.html)
  });

  const maybeError = (result as any)?.error;
  if (maybeError) {
    throw new EmailDeliveryError(
      typeof maybeError?.message === "string" ? maybeError.message : "Provider email menolak pengiriman."
    );
  }
  return (result as any)?.data?.id || (result as any)?.id || null;
}

async function insertEmailLog(db: DbClient | null, payload: Record<string, unknown>): Promise<{ log: EmailLog | null; duplicate: boolean }> {
  if (!db) return { log: null, duplicate: false };
  const { data, error } = await db.from("email_logs").insert(payload).select("*").single();
  if (!error) return { log: data as EmailLog, duplicate: false };

  if (isDuplicateError(error) && payload.idempotency_key) {
    const { data: existing } = await db
      .from("email_logs")
      .select("*")
      .eq("idempotency_key", payload.idempotency_key)
      .maybeSingle();
    return { log: (existing as EmailLog) || null, duplicate: true };
  }

  if (isMissingEmailLogTable(error)) return { log: null, duplicate: false };
  throw error;
}

async function updateEmailLog(db: DbClient | null, id: string | null | undefined, updates: Record<string, unknown>) {
  if (!db || !id) return;
  const { error } = await db
    .from("email_logs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error && !isMissingEmailLogTable(error)) throw error;
}

export async function listEmailLogs(db: DbClient, limit = 50): Promise<EmailListResult> {
  const { data, error } = await db
    .from("email_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) {
    if (isMissingEmailLogTable(error)) return { logs: [], unavailable: true };
    throw error;
  }
  return { logs: (data || []) as EmailLog[], unavailable: false };
}

export async function retryEmailLog(db: DbClient, logId: string) {
  const { data: log, error } = await db.from("email_logs").select("*").eq("id", logId).maybeSingle();
  if (error) {
    if (isMissingEmailLogTable(error)) throw new EmailDeliveryError("Tabel log email belum tersedia. Jalankan migration database terlebih dahulu.");
    throw error;
  }
  if (!log) throw new EmailDeliveryError("Log email tidak ditemukan.");
  const template = (log.payload_json as any)?.template as EmailTemplate | undefined;
  if (!template?.subject || !template?.html) {
    throw new EmailDeliveryError("Data retry email tidak lengkap.");
  }

  const retryCount = Number(log.retry_count || 0) + 1;
  await updateEmailLog(db, log.id, {
    status: "pending",
    retry_count: retryCount,
    error_message: null
  });

  try {
    const providerMessageId = await sendRawEmail({
      to: log.recipient,
      subject: template.subject,
      html: template.html,
      text: template.text
    });
    await updateEmailLog(db, log.id, {
      status: "sent",
      retry_count: retryCount,
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
      error_message: null
    });
  } catch (error) {
    const message = cleanEmailError(error);
    await updateEmailLog(db, log.id, {
      status: "failed",
      retry_count: retryCount,
      error_message: message
    });
    throw new EmailDeliveryError(message);
  }

  const { data: updated } = await db.from("email_logs").select("*").eq("id", logId).maybeSingle();
  return updated as EmailLog;
}

function isDuplicateError(error: unknown) {
  return dbErrorCode(error) === "23505";
}

function isMissingEmailLogTable(error: unknown) {
  const code = dbErrorCode(error);
  const message = dbErrorMessage(error).toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("email_logs");
}

function dbErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : "";
}

function dbErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : String(error || "");
}

function cleanEmailError(error: unknown) {
  if (error instanceof EmailDeliveryError) return error.message;
  const raw = error instanceof Error ? error.message : String(error || "");
  const lower = raw.toLowerCase();
  if (!raw || lower.includes("undefined") || lower.includes("null")) {
    return "Email gagal dikirim. Periksa konfigurasi email atau koneksi server.";
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("econn") || lower.includes("timeout")) {
    return "Email gagal dikirim. Periksa koneksi server atau provider email.";
  }
  if (lower.includes("api key") || lower.includes("resend_api_key") || lower.includes("unauthorized")) {
    return "Email gagal dikirim. Periksa konfigurasi API key email.";
  }
  if (lower.includes("domain is not verified") || lower.includes("not verified")) {
    return "Email gagal dikirim karena domain pengirim belum diverifikasi di Resend. Verifikasi domain pengirim atau gunakan EMAIL_FROM dari domain yang sudah verified.";
  }
  if (lower.includes("only send testing emails") || lower.includes("your own email address")) {
    return "Email gagal dikirim karena akun Resend masih mode testing. Gunakan email pemilik akun Resend sebagai penerima test, atau verifikasi domain agar bisa kirim ke penerima lain.";
  }
  return raw.slice(0, 220);
}

function gpsText(lat?: number | null, lng?: number | null, accuracy?: number | null) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return "Tidak tersedia";
  const acc = accuracy === null || accuracy === undefined ? "" : `, akurasi ${Math.round(accuracy)}m`;
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}${acc}`;
}

function mapUrl(lat?: number | null, lng?: number | null) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function reportPhotosFromItems(items?: Array<{ label?: string | null; photo_url?: string | null }>) {
  return (items || [])
    .filter((item) => item.photo_url)
    .map((item) => ({
      label: item.label || "Foto laporan",
      url: item.photo_url
    }));
}

function buildTestTemplate(type: EmailNotificationType) {
  const now = new Date().toISOString();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const base = {
    staffName: "Siti Nurhaliza",
    outletName: "Outlet Antapani",
    staffId: null,
    outletId: null
  };
  const sampleItems = [
    { label: "Foto Area Depan", required: true, submitted: true, photo_url: SAMPLE_PHOTO_URL },
    { label: "Foto Meja Produksi", required: true, submitted: true, photo_url: SAMPLE_PHOTO_URL },
    { label: "Foto Stok Bahan", required: true, submitted: true, photo_url: SAMPLE_PHOTO_URL },
    { label: "Foto Kasir", required: false, submitted: true, photo_url: SAMPLE_PHOTO_URL }
  ];

  if (type === "attendance_in") {
    return {
      activityId: "test-attendance-in",
      staffName: base.staffName,
      outletName: base.outletName,
      template: buildAttendanceInEmail({
        ...base,
        shiftLabel: "Shift 1",
        date,
        scheduledStart: "09:00",
        checkinTime: now,
        lateMinutes: 0,
        lat: -6.914744,
        lng: 107.60981,
        accuracy: 14,
        selfieUrl: SAMPLE_PHOTO_URL
      })
    };
  }

  if (type === "late_attendance") {
    return {
      activityId: "test-late-attendance",
      staffName: base.staffName,
      outletName: base.outletName,
      template: buildLateAttendanceEmail({
        ...base,
        shiftLabel: "Shift 1",
        date,
        scheduledStart: "09:00",
        checkinTime: now,
        lateMinutes: 27,
        lat: -6.914744,
        lng: 107.60981,
        accuracy: 18,
        selfieUrl: SAMPLE_PHOTO_URL
      })
    };
  }

  if (type === "opening_report" || type === "report_late") {
    return {
      activityId: type === "report_late" ? "test-report-late" : "test-opening-report",
      staffName: base.staffName,
      outletName: base.outletName,
      template: buildOpeningCombinedEmail({
        ...base,
        shiftLabel: "Shift 1",
        date,
        scheduledStart: "09:00",
        checkinTime: now,
        lateMinutes: 0,
        checkinLat: -6.914744,
        checkinLng: 107.60981,
        selfieInUrl: SAMPLE_PHOTO_URL,
        submittedAt: now,
        reportStatusLabel: type === "report_late" ? "Laporan Terlambat" : "Tepat waktu",
        reportStatusTone: type === "report_late" ? "warning" : "success",
        deadlineLabel: "Maksimal 19:30 WITA",
        reportLateMinutes: type === "report_late" ? 30 : 0,
        items: sampleItems,
        photos: reportPhotosFromItems(sampleItems),
        note: type === "report_late" ? "Outlet ramai sehingga laporan baru sempat dikirim setelah jam batas." : "Semua area sudah siap operasional."
      })
    };
  }

  if (type === "closing_report") {
    return {
      activityId: "test-closing-report",
      staffName: base.staffName,
      outletName: base.outletName,
      template: buildClosingCombinedEmail({
        ...base,
        shiftLabel: "Shift 2",
        date,
        submittedAt: now,
        reportStatusLabel: "Tepat waktu",
        reportStatusTone: "success",
        deadlineLabel: "Maksimal 01:00 WITA",
        reportLateMinutes: 0,
        items: sampleItems,
        photos: reportPhotosFromItems(sampleItems),
        note: "Kasir sudah ditutup dan area produksi sudah dibersihkan.",
        checkinTime: now,
        checkoutTime: now,
        totalWorkMinutes: 485,
        selfieOutUrl: SAMPLE_PHOTO_URL,
        checkoutLat: -6.914744,
        checkoutLng: 107.60981,
        checkoutAcc: 16,
        payrollStatus: "Belum dibayar — estimasi Rp 85.000"
      })
    };
  }

  if (type === "attendance_out") {
    return {
      activityId: "test-attendance-out",
      staffName: base.staffName,
      outletName: base.outletName,
      template: buildAttendanceOutEmail({
        ...base,
        shiftLabel: "Shift 1",
        date,
        checkinTime: now,
        checkoutTime: now,
        totalWorkMinutes: 485,
        taskStatus: "Laporan buka selesai",
        payrollStatus: "Gaji harian sudah dihitung",
        lat: -6.914744,
        lng: 107.60981,
        accuracy: 16,
        selfieUrl: SAMPLE_PHOTO_URL
      })
    };
  }

  if (type === "leave_request") {
    return {
      activityId: "test-leave-request",
      staffName: base.staffName,
      outletName: base.outletName,
      template: buildLeaveRequestEmail({
        ...base,
        leaveDate: date,
        reason: "Keperluan keluarga yang sudah dijadwalkan.",
        requestedAt: now,
        status: "pending",
        adminUrl: appUrl("/admin/leave")
      })
    };
  }

  if (type === "leave_approved" || type === "leave_rejected") {
    return {
      activityId: `test-${type}`,
      staffName: base.staffName,
      outletName: base.outletName,
      template: buildLeaveDecisionEmail({
        ...base,
        leaveDate: date,
        approved: type === "leave_approved",
        adminNote: type === "leave_approved" ? "Libur disetujui, jadwal sudah disesuaikan." : "Tanggal tersebut masih membutuhkan coverage outlet."
      })
    };
  }

  if (type === "full_shift") {
    return {
      activityId: "test-full-shift",
      staffName: base.staffName,
      outletName: base.outletName,
      template: buildFullShiftEmail({
        ...base,
        date,
        shiftLabel: "Full Shift",
        checkinTime: now,
        note: "Staff menggantikan coverage dua shift karena shift lain libur."
      })
    };
  }

  return {
    activityId: "test-system-warning",
    staffName: null,
    outletName: null,
    template: buildSystemWarningEmail({
      title: "Test Warning Sistem",
      message: "Ini adalah contoh email warning untuk memastikan konfigurasi email aktif.",
      severity: "warning",
      createdAt: now,
      context: {
        environment: process.env.NODE_ENV || "development",
        module: "email-notification"
      }
    })
  };
}
