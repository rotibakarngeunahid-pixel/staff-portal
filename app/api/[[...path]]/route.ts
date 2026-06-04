import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPin, createSessionToken, publicStaff, verifySessionToken } from "@/lib/auth";
import {
  addDays,
  calculateSalary,
  dateTimeUtc,
  detectShift,
  getWorkingDate,
  haversineDistance,
  isCheckinTooEarly,
  isCheckoutTimeReached,
  normalizeCurrency,
  reportSubmissionStatus,
  sanitizePathSegment,
  shiftEndTime,
  shiftStartTime,
  timeMakassar,
  todayJakarta
} from "@/lib/business";
import {
  EMAIL_NOTIFICATION_TYPES,
  isEmailNotificationType,
  isValidEmailList,
  listEmailLogs,
  retryEmailLog,
  sendAttendanceInEmail,
  sendClosingCombinedEmail,
  sendFullShiftEmail,
  sendLateAttendanceEmail,
  sendLeaveDecisionEmail,
  sendLeaveRequestEmail,
  sendOpeningCombinedEmail,
  sendTestEmailNotification
} from "@/lib/email";
import {
  importAttendanceCsv,
  isCsvUpload,
  parseMapping,
  previewAttendanceImport
} from "@/lib/attendance-import";
import { photoStorageBaseUrl } from "@/lib/env";
import {
  allocatePaymentByAmount,
  allocatePaymentByDates,
  buildPayrollSummary,
  compareAttendanceChronological
} from "@/lib/payroll";
import { supabaseAdmin } from "@/lib/supabase/server";
import { uploadImage } from "@/lib/storage";
import type { ConfigMap, Outlet, SessionPayload, Staff } from "@/types/domain";
import {
  addDateDays,
  buildHistoricalPeriods,
  buildProjectionDetail,
  calculatePayrollProjection,
  makeInsufficientDataProjection,
  resolvePayrollPeriod,
  summarizeAttendancePeriod
} from "@/lib/payroll-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Db = ReturnType<typeof supabaseAdmin>;
type Body = Record<string, any>;
type RouteContext = { params: Promise<{ path?: string[] }> };
type SavedReportItem = { label: string; required: boolean; photo_url: string; submitted: boolean };
type ShiftTypeValue = "SHIFT_1" | "SHIFT_2" | "FULL_SHIFT";

const ACTIVE_ASSIGNMENT_STATUSES = ["confirmed", "admin_override", "auto_cover", "locked", "completed"] as const;
const MUTABLE_ASSIGNMENT_STATUSES = ["confirmed", "admin_override", "auto_cover"] as const;

class HttpError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function ok<T extends Body>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, init);
}

function fail(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, error: "Data request tidak valid", errorCode: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const message = error instanceof Error ? error.message : "Terjadi kesalahan";
  const status = error instanceof HttpError ? error.status : 500;
  const errorCode = error instanceof HttpError ? error.code : "SERVER_ERROR";
  return NextResponse.json({ ok: false, error: message, errorCode }, { status });
}

async function readBody(request: NextRequest): Promise<Body> {
  if (request.method === "GET") {
    return Object.fromEntries(request.nextUrl.searchParams.entries());
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const body: Body = {};
    form.forEach((value, key) => {
      body[key] = value;
    });
    return body;
  }

  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Body;
  } catch {
    throw new HttpError("Format request tidak valid", 400, "INVALID_JSON");
  }
}

async function paramsFrom(context: RouteContext) {
  return context.params;
}

async function configMap(db: Db): Promise<ConfigMap> {
  const { data, error } = await db.from("config").select("key,value");
  if (error) throw error;
  return Object.fromEntries((data || []).map((row) => [row.key, row.value]));
}

function configNumber(cfg: ConfigMap, key: string, fallback: number) {
  const value = Number(cfg[key]);
  return Number.isFinite(value) ? value : fallback;
}

function tokenFromRequest(request: NextRequest, role?: "staff" | "admin") {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  if (role === "admin") return request.cookies.get("rbn_admin_token")?.value;
  if (role === "staff") return request.cookies.get("rbn_staff_token")?.value;
  return request.cookies.get("rbn_staff_token")?.value || request.cookies.get("rbn_admin_token")?.value;
}

async function requireSession(request: NextRequest, role?: "staff" | "admin") {
  const token = tokenFromRequest(request, role);
  if (!token) throw new HttpError("Sesi tidak ditemukan, silakan login ulang", 401, "NO_SESSION");
  try {
    const session = await verifySessionToken(token);
    if (role && session.role !== role) throw new HttpError("Akses ditolak", 403, "FORBIDDEN");
    return session;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Catch all jose JWT errors (expired, invalid signature, bad claims, etc.)
    throw new HttpError("Sesi sudah kedaluwarsa, silakan login ulang", 401, "SESSION_EXPIRED");
  }
}

function setSessionCookie(response: NextResponse, role: "staff" | "admin", token: string, hours: number) {
  response.cookies.set(role === "admin" ? "rbn_admin_token" : "rbn_staff_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: hours * 3600,
    path: "/"
  });
}

function toOutlet(raw: any): Outlet {
  return {
    ...raw,
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    radius_m: Number(raw.radius_m || 100),
    shift_mode: Number(raw.shift_mode || 1) === 2 ? 2 : 1
  };
}

function assertOperationalOutlet(raw: any, message = "Outlet tidak aktif. Pilih outlet aktif.") {
  if (raw?.active === false) {
    throw new HttpError(message, 400, "OUTLET_INACTIVE");
  }
}

function assertOperationalStaff(raw: any, message = "Staff tidak aktif. Pilih staff aktif.") {
  if (raw?.active === false || raw?.deleted_at) {
    throw new HttpError(message, 400, "STAFF_INACTIVE");
  }
}

async function assertUniqueActiveOutletName(db: Db, name: string, excludeOutletId?: string) {
  let query = db
    .from("outlets")
    .select("id")
    .eq("active", true)
    .ilike("name", name)
    .limit(1);
  if (excludeOutletId) query = query.neq("id", excludeOutletId);
  const { data, error } = await query;
  if (error) throw error;
  if ((data || []).length > 0) {
    throw new HttpError("Outlet aktif dengan nama ini sudah ada. Gunakan nama lain atau edit outlet yang sudah ada.", 400, "DUPLICATE_OUTLET_NAME");
  }
}

async function getStaffWithOutlet(db: Db, staffId: string) {
  const { data, error } = await db.from("staff").select("*, outlets(*)").eq("id", staffId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError("Karyawan tidak ditemukan", 404, "STAFF_NOT_FOUND");
  if (data.active === false || data.deleted_at) {
    throw new HttpError("Akun staff sudah nonaktif. Hubungi admin.", 403, "STAFF_INACTIVE");
  }
  if (data.outlets?.active === false) {
    throw new HttpError("Outlet staff sudah nonaktif. Hubungi admin.", 403, "OUTLET_INACTIVE");
  }
  const outlet = data.outlets ? toOutlet(data.outlets) : null;
  return { staff: data as Staff, outlet };
}

async function logAudit(db: Db, action: string, userName: string, detail: unknown) {
  const value = typeof detail === "string" ? detail : JSON.stringify(detail);
  await db
    .from("audit_log")
    .insert({ action, user_name: userName || "system", detail: value.slice(0, 500) });
}

function cleanEmailError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const lower = raw.toLowerCase();
  if (!raw || lower.includes("undefined") || lower.includes("null") || lower.includes("stack")) {
    return "Email gagal dikirim. Periksa konfigurasi email atau koneksi server.";
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("timeout")) {
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

async function notifySafely(db: Db, auditAction: string, userName: string, send: () => Promise<unknown>) {
  try {
    await send();
    return true;
  } catch (emailError) {
    await logAudit(db, auditAction, userName, { error: cleanEmailError(emailError) }).catch(() => undefined);
    return false;
  }
}

function shiftLabel(shift: 0 | 1 | 2) {
  if (shift === 0) return "Full Shift";
  return `Shift ${shift}`;
}

function shiftTypeFromShift(shift: 0 | 1 | 2): ShiftTypeValue {
  if (shift === 1) return "SHIFT_1";
  if (shift === 2) return "SHIFT_2";
  return "FULL_SHIFT";
}

function shiftFromShiftType(shiftType?: string | null): 0 | 1 | 2 | null {
  if (shiftType === "SHIFT_1") return 1;
  if (shiftType === "SHIFT_2") return 2;
  if (shiftType === "FULL_SHIFT") return 0;
  return null;
}

function isMutableAssignment(row: Body) {
  return (MUTABLE_ASSIGNMENT_STATUSES as readonly string[]).includes(String(row.status || ""));
}

async function resolveStaffShiftAssignment(db: Db, staffId: string, outletId: string, date: string) {
  const { data: assignments, error: assignmentError } = await db
    .from("staff_shift_assignments")
    .select("*")
    .eq("staff_id", staffId)
    .eq("outlet_id", outletId)
    .eq("date", date)
    .in("status", [...ACTIVE_ASSIGNMENT_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(1);
  if (assignmentError) throw assignmentError;
  const assignment = (assignments || [])[0];
  if (assignment) return { ...assignment, source_table: "staff_shift_assignments" };

  // Legacy fallback: admin schedule used to write only shift_schedule.
  // Keep respecting those rows so check-in does not fall back to time-based shift detection.
  const { data: legacyRows, error: legacyError } = await db
    .from("shift_schedule")
    .select("*")
    .eq("staff_id", staffId)
    .eq("outlet_id", outletId)
    .eq("date", date)
    .eq("status", "claimed")
    .order("requested_at", { ascending: false })
    .limit(1);
  if (legacyError) throw legacyError;
  const legacy = (legacyRows || [])[0];
  if (!legacy) return null;
  return {
    id: legacy.id,
    outlet_id: legacy.outlet_id,
    staff_id: legacy.staff_id,
    staff_name: legacy.staff_name,
    date: legacy.date,
    shift_type: Number(legacy.shift) === 2 ? "SHIFT_2" : "SHIFT_1",
    status: "confirmed",
    source: "legacy_shift_schedule",
    source_table: "shift_schedule"
  };
}

function formatCurrencyForEmail(value: unknown) {
  const numeric = normalizeCurrency(value);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(numeric);
}

function reportDeadlineLabel(outlet: Outlet, type: "BUKA" | "TUTUP") {
  const end = type === "BUKA" ? outlet.report_buka_end : outlet.report_tutup_end;
  return end ? `Maksimal ${String(end).slice(0, 5)}` : null;
}

function reportPhotoItems(items: SavedReportItem[]) {
  return items
    .filter((item) => item.photo_url)
    .map((item) => ({
      label: item.label || "Foto laporan",
      url: item.photo_url
    }));
}

function trustedHttpsPhotoUrl(input: unknown) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }

  if (url.protocol !== "https:") return "";

  let configuredHost = "";
  try {
    configuredHost = new URL(photoStorageBaseUrl()).hostname.toLowerCase();
  } catch {
    configuredHost = "";
  }

  const host = url.hostname.toLowerCase();
  const allowed =
    (configuredHost && host === configuredHost) ||
    host === "foto-laporan-area.rotibakarngeunah.my.id" ||
    host === "res.cloudinary.com" ||
    host.endsWith(".supabase.co");

  return allowed ? url.toString() : "";
}

async function resolveShiftDayoffState(
  db: Db,
  outlet: Outlet,
  date: string,
  preferredShift: 0 | 1 | 2
) {
  if (outlet.shift_mode !== 2) {
    return { shift: preferredShift, isFullShift: false, offShift: null as number | null, activeShift: null as number | null };
  }

  const { data, error } = await db
    .from("shift_dayoff")
    .select("shift")
    .eq("outlet_id", outlet.id)
    .eq("date", date);
  if (error) throw error;

  const offSet = new Set((data || []).map((row: any) => Number(row.shift)));
  const shift1Off = offSet.has(1);
  const shift2Off = offSet.has(2);

  if (shift1Off && !shift2Off) {
    return { shift: 0 as const, isFullShift: true, offShift: 1, activeShift: 2 };
  }
  if (shift2Off && !shift1Off) {
    return { shift: 0 as const, isFullShift: true, offShift: 2, activeShift: 1 };
  }

  return { shift: preferredShift, isFullShift: false, offShift: null as number | null, activeShift: null as number | null };
}

function checkoutGpsFromFlags(flags?: string | null) {
  const match = String(flags || "").match(/CHECKOUT_GPS:(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?):(\d+)/);
  return {
    lat: match ? Number(match[1]) : null,
    lng: match ? Number(match[2]) : null,
    accuracy: match ? Number(match[3]) : null
  };
}

function isClosingShift(shift: 0 | 1 | 2, flags?: string | null) {
  return shift === 0 || shift === 2 || String(flags || "").includes("FULL_SHIFT_2X");
}

function workMinutes(checkinTime?: string | null, checkoutTime?: string | null) {
  if (!checkinTime || !checkoutTime) return null;
  const checkinMs = new Date(checkinTime).getTime();
  const checkoutMs = new Date(checkoutTime).getTime();
  if (!Number.isFinite(checkinMs) || !Number.isFinite(checkoutMs)) return null;
  return Math.max(0, Math.round((checkoutMs - checkinMs) / 60000));
}

function payrollStatusLabel(attendance: Body) {
  if (attendance.paid_status) return "Sudah dibayar";
  const finalSalary = normalizeCurrency(attendance.final_salary);
  return finalSalary ? `Belum dibayar - estimasi ${formatCurrencyForEmail(finalSalary)}` : "Belum dibayar";
}

async function sendClosingReportAfterCheckout(
  db: Db,
  staff: Staff,
  outlet: Outlet,
  date: string,
  attendance: Body
) {
  try {
    const { data: report, error } = await db
      .from("reports")
      .select("*")
      .eq("outlet_id", outlet.id)
      .eq("date", date)
      .eq("type", "TUTUP")
      .maybeSingle();
    if (error) throw error;
    if (!report) return false;

    const cfg = await configMap(db);
    const submittedAt = typeof report.submitted_at === "string" ? report.submitted_at : new Date().toISOString();
    const submissionStatus = reportSubmissionStatus(outlet, "TUTUP", new Date(submittedAt));
    const items = Array.isArray(report.items_json) ? (report.items_json as SavedReportItem[]) : [];
    const flags = String(attendance.flags || "");
    const gps = checkoutGpsFromFlags(flags);
    const attShift = Number(attendance.shift || 2) as 0 | 1 | 2;
    const isFullShiftAttendance = attShift === 0 || flags.includes("FULL_SHIFT_2X");

    return await notifySafely(db, "report_email_failed", staff.name, () =>
      sendClosingCombinedEmail(db, {
        reportId: report.id,
        staffId: staff.id,
        staffName: staff.name,
        outletId: outlet.id,
        outletName: outlet.name,
        date,
        submittedAt,
        reportStatusLabel: submissionStatus.isLate ? "Laporan Terlambat" : "Tepat waktu",
        reportStatusTone: submissionStatus.isLate ? "warning" as const : "success" as const,
        deadlineLabel: reportDeadlineLabel(outlet, "TUTUP"),
        reportLateMinutes: submissionStatus.lateMinutes,
        items,
        photos: reportPhotoItems(items),
        note: null,
        shiftLabel: isFullShiftAttendance ? "Full Shift" : shiftLabel(attShift),
        checkinTime: typeof attendance.checkin_time === "string" ? attendance.checkin_time : null,
        checkoutTime: typeof attendance.checkout_time === "string" ? attendance.checkout_time : null,
        totalWorkMinutes: workMinutes(
          typeof attendance.checkin_time === "string" ? attendance.checkin_time : null,
          typeof attendance.checkout_time === "string" ? attendance.checkout_time : null
        ),
        selfieOutUrl: typeof attendance.selfie_out === "string" ? attendance.selfie_out : null,
        checkoutLat: gps.lat,
        checkoutLng: gps.lng,
        checkoutAcc: gps.accuracy,
        payrollStatus: payrollStatusLabel(attendance),
        to: cfg.notification_email || process.env.NOTIFICATION_EMAIL || "",
        forceType: submissionStatus.isLate ? "report_late" as const : undefined
      })
    );
  } catch (error) {
    await logAudit(db, "report_email_failed", staff.name, { error: cleanEmailError(error), stage: "checkout" }).catch(() => undefined);
    return false;
  }
}

async function consumeNonce(db: Db, nonce?: string) {
  if (!nonce) return;
  const { error } = await db.from("nonces").insert({ nonce });
  if (error) throw new HttpError("Request duplikat terdeteksi", 409, "DUPLICATE_NONCE");
}

function numberBody(body: Body, key: string, fallback = 0) {
  const value = Number(body[key]);
  return Number.isFinite(value) ? value : fallback;
}

function stringBody(body: Body, key: string, fallback = "") {
  const value = body[key];
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function reportType(body: Body) {
  const type = String(body.type || "").toUpperCase();
  if (type !== "BUKA" && type !== "TUTUP") throw new HttpError("Tipe laporan tidak valid");
  return type as "BUKA" | "TUTUP";
}

function isLegacySelfieReportItem(label: unknown) {
  return /\bselfie\b/i.test(String(label || ""));
}

function parseItems(input: unknown): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function photoInputForItem(body: Body, item: any) {
  const field = String(item?.photoField || item?.photo_field || "");
  if (field && body[field]) return body[field];
  return item?.photo;
}

async function dispatch(request: NextRequest, context: RouteContext) {
  try {
    const params = await paramsFrom(context);
    const path = `/${(params.path || []).join("/")}`;
    const body = await readBody(request);
    const db = supabaseAdmin();

    if (request.method === "GET" && path === "/staff/list") return await getStaffList(db);
    if (request.method === "POST" && path === "/auth/login") return await staffLogin(db, body);
    if (request.method === "POST" && path === "/auth/admin-login") return await adminLogin(db, request, body);
    if (request.method === "POST" && path === "/auth/logout") return logout();

    if (request.method === "GET" && path === "/attendance/status") return await staffAttendanceStatus(db, request, body);
    if (request.method === "POST" && path === "/attendance/checkin") return await checkin(db, request, body);
    if (request.method === "POST" && path === "/attendance/checkout") return await checkout(db, request, body);
    if (request.method === "GET" && path === "/reports/config") return await reportsConfig(db, request, body);
    if (request.method === "POST" && path === "/reports/submit") return await submitReport(db, request, body);
    if (request.method === "GET" && path === "/reports/inventory-status") return await staffInventoryStatus(db, request);
    if (request.method === "GET" && path === "/staff/payroll") return await staffPayroll(db, request);
    if (request.method === "GET" && path === "/staff/profile") return await staffProfile(db, request);
    if (request.method === "GET" && path === "/schedule/weekly") return await staffWeeklySchedule(db, request, body);
    if (request.method === "POST" && path === "/schedule/claim") return await claimShift(db, request, body);
    if (request.method === "POST" && path === "/schedule/cancel") return await cancelShift(db, request, body);
    if (request.method === "POST" && path === "/schedule/select") return await selectShift(db, request, body);
    if (request.method === "POST" && path === "/schedule/cancel-assignment") return await cancelAssignment(db, request, body);
    if (request.method === "POST" && path === "/schedule/leave") return await requestLeave(db, request, body);
    if (request.method === "DELETE" && path === "/schedule/leave") return await cancelLeave(db, request, body);

    if (request.method === "GET" && path === "/payslip") return await getPayslip(db, request, body);

    if (path.startsWith("/admin/")) {
      await requireSession(request, "admin");
      return await adminDispatch(db, request.method, path, body);
    }

    throw new HttpError("Endpoint tidak ditemukan", 404, "NOT_FOUND");
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return dispatch(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return dispatch(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return dispatch(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return dispatch(request, context);
}

async function getStaffList(db: Db) {
  const { data, error } = await db
    .from("staff")
    .select("id,name,outlet_id,active,outlets(active)")
    .eq("active", true)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  const staff = (data || [])
    .filter((item: any) => !item.outlet_id || item.outlets?.active !== false)
    .map(({ outlets: _outlets, ...item }: any) => item);
  return ok({ staff });
}

async function staffLogin(db: Db, body: Body) {
  const schema = z
    .object({
      staffId: z.string().uuid().optional(),
      name: z.string().min(1).optional(),
      pin: z.string().min(4).max(12)
    })
    .refine((value) => Boolean(value.staffId || value.name), {
      message: "Pilih nama staff"
    });
  const parsed = schema.parse(body);

  let query = db
    .from("staff")
    .select("*, outlets(*)")
    .eq("active", true);

  query = parsed.staffId ? query.eq("id", parsed.staffId) : query.ilike("name", parsed.name || "");

  const { data, error } = await query.limit(2);
  if (error) throw error;
  const staff = data && data.length === 1 ? data[0] : null;
  if (!staff || staff.pin_hash !== hashPin(parsed.pin)) {
    throw new HttpError("Nama atau PIN tidak sesuai", 401, "INVALID_STAFF_LOGIN");
  }
  if (staff.deleted_at || staff.outlets?.active === false) {
    throw new HttpError("Akun atau outlet staff sudah nonaktif. Hubungi admin.", 403, "STAFF_INACTIVE");
  }

  const cfg = await configMap(db);
  const hours = configNumber(cfg, "token_hours", 8);
  const token = await createSessionToken(
    { sub: staff.id, role: "staff", name: staff.name, outlet_id: staff.outlet_id },
    hours
  );
  await logAudit(db, "staff_login", staff.name, { staffId: staff.id });
  const response = ok({ token, staff: publicStaff(staff), outlet: staff.outlets ? toOutlet(staff.outlets) : null });
  setSessionCookie(response, "staff", token, hours);
  return response;
}

async function countAdminFailedAttempts(db: Db, since: string) {
  const { data: successRows, error: successError } = await db
    .from("admin_login_attempts")
    .select("attempt_at")
    .eq("success", true)
    .gte("attempt_at", since)
    .order("attempt_at", { ascending: false })
    .limit(1);

  const effectiveSince = !successError && successRows?.[0]?.attempt_at ? successRows[0].attempt_at : since;
  const { data, error } = await db
    .from("admin_login_attempts")
    .select("id")
    .eq("success", false)
    .gte("attempt_at", effectiveSince);

  if (error) return 0;
  return (data || []).length;
}

async function recordAdminLoginAttempt(db: Db, request: NextRequest, success: boolean) {
  await db.from("admin_login_attempts").insert({
    success,
    ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "local"
  });
}

function initialAdminPin() {
  const value = process.env.ADMIN_INITIAL_PIN?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new HttpError(
      "Password admin awal belum dikonfigurasi. Set ADMIN_INITIAL_PIN di environment atau isi admin_pin_hash di tabel config.",
      503,
      "ADMIN_PIN_NOT_CONFIGURED"
    );
  }
  return "admin1234";
}

async function adminLogin(db: Db, request: NextRequest, body: Body) {
  const pin = stringBody(body, "pin");
  if (pin.length < 4) throw new HttpError("Password admin minimal 4 karakter");
  const cfg = await configMap(db);
  const maxAttempts = configNumber(cfg, "max_login_attempts", 5);
  const lockoutMinutes = configNumber(cfg, "lockout_minutes", 15);
  const since = new Date(Date.now() - lockoutMinutes * 60000).toISOString();
  const failedAttempts = await countAdminFailedAttempts(db, since);
  if (failedAttempts >= maxAttempts) {
    throw new HttpError(`Terlalu banyak percobaan. Coba lagi ${lockoutMinutes} menit lagi.`, 429, "LOCKED");
  }

  const configuredAdminHash = cfg.admin_pin_hash?.trim();
  const expected = configuredAdminHash || hashPin(initialAdminPin());
  const success = expected === hashPin(pin);
  await recordAdminLoginAttempt(db, request, success).catch(() => undefined);
  if (!success) throw new HttpError("Password salah, silakan coba lagi.", 401, "INVALID_ADMIN_PASSWORD");

  if (!configuredAdminHash) {
    await db.from("config").upsert({ key: "admin_pin_hash", value: expected });
  }
  const hours = configNumber(cfg, "token_hours", 8);
  const token = await createSessionToken({ sub: "admin", role: "admin", name: "Admin" }, hours);
  await logAudit(db, "admin_login", "Admin", "Login admin berhasil");
  const response = ok({ token });
  setSessionCookie(response, "admin", token, hours);
  return response;
}

function logout() {
  const response = ok({ loggedOut: true });
  response.cookies.delete("rbn_staff_token");
  response.cookies.delete("rbn_admin_token");
  return response;
}

async function staffAttendanceStatus(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan untuk staff ini", 400, "NO_OUTLET");

  const effective = stringBody(body, "date") || getWorkingDate().date;
  const cfg = await configMap(db);

  const dayoffShift = await resolveShiftDayoffState(db, outlet, effective, detectShift(outlet));
  let effectiveShift: 0 | 1 | 2 = dayoffShift.shift;
  const isFullShift = dayoffShift.isFullShift;
  const offShift = dayoffShift.offShift;
  const activeShift = dayoffShift.activeShift;

  // PRD §8.5 — resolve jadwal lebih awal agar shift bisa dikoreksi sebelum query attendance
  // Staff Shift 2 yang datang lebih awal bisa salah dideteksi sebagai Shift 1 jika tidak dikoreksi di sini
  const assignment = await resolveStaffShiftAssignment(db, staff.id, outlet.id, effective);

  // Override effectiveShift berdasarkan assignment (lebih akurat dari deteksi berbasis jam)
  if (assignment && !isFullShift) {
    const assignedShift = shiftFromShiftType((assignment as any).shift_type);
    if (assignedShift === 1 || assignedShift === 2) effectiveShift = assignedShift;
  }

  // Smart fallback overlap-shift: jika shift=1 terdeteksi (time-based, tanpa assignment aktif)
  // tetapi slot shift 1 sudah diisi staff lain di outlet ini, switch ke shift 2.
  // Kasus nyata: Shift 2 mulai 20:00 tapi staff datang jam 19:50 → detectShift salah return 1.
  // Dengan fallback ini, status API tetap mengembalikan shift 2 ke frontend sehingga absen tetap benar.
  if (outlet.shift_mode === 2 && effectiveShift === 1 && !assignment && !isFullShift) {
    const { data: shift1Occupant } = await db
      .from("attendance")
      .select("id")
      .eq("outlet_id", outlet.id)
      .eq("date", effective)
      .eq("shift", 1)
      .neq("staff_id", staff.id)
      .not("checkin_time", "is", null)
      .limit(1);
    if (shift1Occupant && shift1Occupant.length > 0) {
      effectiveShift = 2;
    }
  }

  // Cek apakah staff sudah checkin hari ini (tanpa filter shift)
  // Penting: admin bisa koreksi shift setelah checkin, sehingga attendance.shift bisa berbeda dari assignment.shift_type
  // Gunakan array fetch (bukan maybeSingle) agar aman saat ada lebih dari satu baris per tanggal
  const { data: attRows, error: attError } = await db
    .from("attendance")
    .select("*")
    .eq("staff_id", staff.id)
    .eq("date", effective)
    .not("checkin_time", "is", null);
  if (attError) throw attError;

  // Prioritas: cari attendance yang shiftnya cocok dengan effectiveShift, fallback ke baris pertama
  const attendance =
    (attRows || []).find((r: any) => r.shift === effectiveShift) ?? (attRows || [])[0] ?? null;

  // Jika sudah ada attendance dengan checkin, gunakan shift dari attendance (respek koreksi admin)
  if (attendance && !isFullShift) {
    effectiveShift = (attendance as any).shift as 0 | 1 | 2;
  }

  const { data: reports, error: reportsError } = await db
    .from("reports")
    .select("type")
    .eq("outlet_id", outlet.id)
    .eq("date", effective);
  if (reportsError) throw reportsError;

  const scheduleShift = isFullShift ? (activeShift ?? 1) : (effectiveShift || 1);
  const { data: schedule } = outlet.shift_mode === 2
    ? await db
        .from("shift_schedule")
        .select("*")
        .eq("outlet_id", outlet.id)
        .eq("date", effective)
        .eq("shift", scheduleShift)
        .maybeSingle()
    : { data: null };

  // PRD §8.4 — cek staff_dayoff
  const { data: staffDayoffRow } = await db
    .from("staff_dayoff")
    .select("id,reason")
    .eq("staff_id", staff.id)
    .eq("date", effective)
    .eq("status", "active")
    .maybeSingle();

  // Cek leave_requests yang sudah disetujui (cuti staff)
  const { data: approvedLeaveRow } = await db
    .from("leave_requests")
    .select("id,reason")
    .eq("staff_id", staff.id)
    .eq("date", effective)
    .eq("status", "approved")
    .maybeSingle();

  // Cek shift 2 menunggu shift 1 absen keluar (hanya jika ada assignment SHIFT_2 dan belum checkin)
  let shift1WaitingInfo: { staff_name: string; outlet_name: string; date: string } | null = null;
  if (
    outlet.shift_mode === 2 &&
    !isFullShift &&
    !staffDayoffRow &&
    !attendance?.checkin_time &&
    assignment != null &&
    (assignment as any).shift_type === "SHIFT_2"
  ) {
    const { data: s1Row } = await db
      .from("attendance")
      .select("staff_name,checkout_time")
      .eq("outlet_id", outlet.id)
      .eq("date", effective)
      .eq("shift", 1)
      .not("checkin_time", "is", null)
      .maybeSingle();
    if (s1Row && !(s1Row as any).checkout_time) {
      shift1WaitingInfo = {
        staff_name: (s1Row as any).staff_name || "Staff Shift 1",
        outlet_name: outlet.name,
        date: effective
      };
    }
  }

  // Compute scheduleState dan nextStep
  const hasBuka = (reports || []).some((r: any) => r.type === "BUKA");
  const hasTutup = (reports || []).some((r: any) => r.type === "TUTUP");

  let scheduleState: string;
  let nextStep: string;
  let requiredReports: string[] = [];

  if (staffDayoffRow || approvedLeaveRow) {
    scheduleState = "dayoff";
    nextStep = "blocked";
  } else if (assignment) {
    // Gunakan effectiveShift (sudah dikoreksi dari attendance jika admin mengubah shift)
    // bukan assignment.shift_type agar requiredReports selalu sesuai shift yang aktual
    requiredReports = effectiveShift === 1 ? ["BUKA"] : effectiveShift === 2 ? ["TUTUP"] : ["BUKA", "TUTUP"];
    const isLocked = assignment.status === "locked" || assignment.status === "completed";

    if (!attendance?.checkin_time) {
      scheduleState = isLocked ? "locked" : "ready";
      nextStep = "checkin";
    } else if (!attendance.checkout_time) {
      scheduleState = "ready";
      if (requiredReports.includes("BUKA") && !hasBuka) {
        nextStep = "report_buka";
      } else if (requiredReports.includes("TUTUP") && !hasTutup) {
        nextStep = "report_tutup";
      } else {
        nextStep = "checkout";
      }
    } else {
      scheduleState = "completed";
      nextStep = "done";
    }
  } else {
    // Fallback / auto-detect (untuk outlet yang belum pakai assignments, atau staff lupa pilih jadwal)
    if (!attendance?.checkin_time) {
      scheduleState = "ready";
      nextStep = "checkin";
    } else if (!attendance.checkout_time) {
      scheduleState = "ready";
      if ((effectiveShift === 0 || effectiveShift === 1) && !hasBuka) {
        nextStep = "report_buka";
      } else if ((effectiveShift === 0 || effectiveShift === 2) && !hasTutup) {
        nextStep = "report_tutup";
      } else {
        nextStep = "checkout";
      }
    } else {
      scheduleState = "completed";
      nextStep = "done";
    }
    if (effectiveShift === 0) requiredReports = ["BUKA", "TUTUP"];
    else if (effectiveShift === 1) requiredReports = ["BUKA"];
    else if (effectiveShift === 2) requiredReports = ["TUTUP"];
  }

  // Cek apakah staff datang terlalu awal (sebelum window H-1 jam dari jadwal shift)
  const checkinTooEarly = !attendance?.checkin_time && !isFullShift && (effectiveShift === 1 || effectiveShift === 2)
    ? isCheckinTooEarly(outlet, effectiveShift)
    : { tooEarly: false, windowOpensAt: null };

  return ok({
    staff: publicStaff(staff),
    outlet,
    config: cfg,
    date: effective,
    shift: effectiveShift,
    isFullShift,
    offShift,
    activeShift,
    attendance,
    reports: reports || [],
    schedule,
    // PRD: schedule-based fields
    assignment,
    staffDayoff: staffDayoffRow || null,
    approvedLeave: approvedLeaveRow || null,
    scheduleState,
    nextStep,
    requiredReports,
    shift1WaitingInfo,
    checkinTooEarly,
    serverTime: new Date().toISOString()
  });
}

const INVENTORY_API_URL = "https://script.google.com/macros/s/AKfycbxEqwArPOXtQbAOoMSWoYRiUAUHZK3cCRecxxH39_SKpixUEy90WL20q5HqGf6hgFi4/exec";

async function checkInventoryCheckoutStatus(branchId: string, date: string): Promise<{ can_checkout: boolean; message: string }> {
  const apiKey = process.env.INVENTORY_API_KEY;
  if (!apiKey) {
    console.warn("[inventory] INVENTORY_API_KEY tidak dikonfigurasi — melewati pengecekan inventori");
    return { can_checkout: true, message: "" };
  }
  const params = new URLSearchParams({
    action: "api.v1.integration.checkout-status",
    api_key: apiKey,
    branch_id: branchId,
    date
  });
  try {
    const res = await fetch(`${INVENTORY_API_URL}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      console.error(`[inventory] API error HTTP ${res.status} — melewati pengecekan`);
      return { can_checkout: true, message: "" };
    }
    const json = await res.json() as { success?: boolean; can_checkout_attendance?: boolean; message?: string };
    if (json.success === false) {
      console.error("[inventory] API mengembalikan success=false:", json.message);
      return { can_checkout: true, message: "" };
    }
    return {
      can_checkout: json.can_checkout_attendance !== false,
      message: json.message || ""
    };
  } catch (err) {
    console.error("[inventory] Gagal menghubungi sistem inventori — melewati pengecekan:", err instanceof Error ? err.message : err);
    return { can_checkout: true, message: "" };
  }
}

async function checkin(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");

  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan", 400, "NO_OUTLET");

  const date = stringBody(body, "shiftDate") || stringBody(body, "date") || getWorkingDate().date;
  // Use nullish coalescing to allow shift=0 (full shift) to pass through correctly
  const shiftFromBody = body.shift !== undefined && body.shift !== null && body.shift !== "" ? Number(body.shift) : -1;
  let shift = ([0, 1, 2].includes(shiftFromBody) ? shiftFromBody : detectShift(outlet)) as 0 | 1 | 2;
  const now = new Date();
  const dayoffShift = await resolveShiftDayoffState(db, outlet, date, shift);
  shift = dayoffShift.shift;

  // Override shift berdasarkan assignment jika ada (mencegah deteksi shift salah saat datang lebih awal)
  // Contoh: staff punya assignment SHIFT_2 tapi absen sebelum shift2_start → shift tetap 2 bukan 1
  let checkinAssignment: Awaited<ReturnType<typeof resolveStaffShiftAssignment>> | null = null;
  if (outlet.shift_mode === 2 && (shift === 1 || shift === 2)) {
    checkinAssignment = await resolveStaffShiftAssignment(db, staff.id, outlet.id, date);
    if (checkinAssignment) {
      const assignedShiftNum = shiftFromShiftType((checkinAssignment as any).shift_type) || shift;
      if (assignedShiftNum !== shift) shift = assignedShiftNum as 1 | 2;
    }
  }

  // Smart fallback overlap-shift: jika shift=1 (time-based, tanpa assignment) dan slot shift 1
  // sudah diisi staff lain di outlet ini, switch ke shift 2.
  // Defense in depth — status API melakukan hal yang sama, tapi ini mencegah edge case
  // di mana status cache stale saat staff langsung memanggil endpoint checkin.
  if (outlet.shift_mode === 2 && shift === 1 && !checkinAssignment) {
    const { data: shift1Occupant } = await db
      .from("attendance")
      .select("id")
      .eq("outlet_id", outlet.id)
      .eq("date", date)
      .eq("shift", 1)
      .neq("staff_id", staff.id)
      .not("checkin_time", "is", null)
      .limit(1);
    if (shift1Occupant && shift1Occupant.length > 0) {
      shift = 2;
    }
  }

  // Validasi: cek apakah absen masuk terlalu awal (sebelum window H-1 jam dari jadwal shift)
  if (outlet.shift_mode === 2 && (shift === 1 || shift === 2)) {
    const { tooEarly, windowOpensAt } = isCheckinTooEarly(outlet, shift, now);
    if (tooEarly) {
      const shiftLabel = shift === 2 ? "Shift 2" : "Shift 1";
      const startTime = shiftStartTime(outlet, shift);
      const startLabel = startTime ? String(startTime).slice(0, 5) : "?";
      const windowLabel = windowOpensAt ?? "1 jam sebelum jadwal";
      throw new HttpError(
        `Absen belum bisa dilakukan. Jadwal ${shiftLabel} dimulai pukul ${startLabel}. Absen baru bisa dilakukan mulai pukul ${windowLabel}.`,
        400,
        "TOO_EARLY"
      );
    }
  }

  const lat = numberBody(body, "lat", NaN);
  const lng = numberBody(body, "lng", NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError("Lokasi GPS wajib dikirim");

  // Reject checkin if the target shift is marked as off
  if (outlet.shift_mode === 2 && (shift === 1 || shift === 2)) {
    const { data: thisOff } = await db
      .from("shift_dayoff")
      .select("id")
      .eq("outlet_id", outlet.id)
      .eq("date", date)
      .eq("shift", shift)
      .maybeSingle();
    if (thisOff) throw new HttpError("Shift ini sedang libur, tidak bisa absen masuk", 400, "SHIFT_OFF");
  }

  let existingQuery = db
    .from("attendance")
    .select("id")
    .eq("staff_id", staff.id)
    .eq("date", date);
  if (shift !== 0) existingQuery = existingQuery.eq("shift", shift);
  const { data: existingRows, error: existingError } = await existingQuery.limit(1);
  if (existingError) throw existingError;
  if ((existingRows || []).length > 0) throw new HttpError("Absen masuk untuk shift ini sudah tercatat", 409, "ALREADY_CHECKED_IN");

  // Blokir checkin jika shift ini sudah diisi staff lain di outlet yang sama
  if (outlet.shift_mode === 2) {
    // Shift 0 (full) menempati slot 1 dan 2; shift 1/2 menempati slot masing-masing + berpotensi bentrok dengan shift 0
    const conflictingShifts = shift === 0 ? [0, 1, 2] : [0, shift];
    const { data: shiftTaken } = await db
      .from("attendance")
      .select("id, staff_name, shift")
      .eq("outlet_id", outlet.id)
      .eq("date", date)
      .neq("staff_id", staff.id)
      .in("shift", conflictingShifts)
      .not("checkin_time", "is", null)
      .limit(1);
    if (shiftTaken && shiftTaken.length > 0) {
      const taken = shiftTaken[0] as { staff_name?: string; shift?: number };
      const takenShiftLabel = taken.shift === 0 ? "Full Shift" : `Shift ${taken.shift}`;
      const thisShiftLabel = shift === 0 ? "Full Shift" : `Shift ${shift}`;
      throw new HttpError(
        `${thisShiftLabel} pada ${date} sudah diisi oleh ${taken.staff_name || "staff lain"} (${takenShiftLabel}). Setiap shift hanya boleh diisi 1 orang.`,
        409,
        "SHIFT_ALREADY_TAKEN"
      );
    }
  }

  // Blokir checkin jika ada cuti yang disetujui untuk tanggal ini
  const { data: approvedLeave } = await db
    .from("leave_requests")
    .select("id")
    .eq("staff_id", staff.id)
    .eq("date", date)
    .eq("status", "approved")
    .maybeSingle();
  if (approvedLeave) {
    throw new HttpError(
      "Kamu memiliki cuti yang sudah disetujui untuk hari ini. Tidak bisa absen masuk. Hubungi admin jika ini keliru.",
      400,
      "ON_APPROVED_LEAVE"
    );
  }

  const accuracy = Math.max(0, numberBody(body, "accuracy", 0));
  const distance = haversineDistance(lat, lng, outlet.lat, outlet.lng);
  const radius = outlet.radius_m;
  const maxDist = radius + Math.min(accuracy, radius * 0.3);
  if (distance > maxDist) {
    throw new HttpError(`Kamu di luar area outlet (${Math.round(distance)}m dari pusat)`, 400, "OUTSIDE_RADIUS");
  }
  const gpsLowAccuracy = accuracy > radius * 3;
  const selfie = body.selfie || body.photo;
  const selfieUrl = await uploadImage(db, `selfies/checkin/${staff.id}/${date}_${shift}.jpg`, selfie);
  if (!selfieUrl) throw new HttpError("Selfie absen masuk wajib diupload");
  await consumeNonce(db, stringBody(body, "nonce"));

  const cfg = await configMap(db);
  // Full shift always starts at shift1_start; shiftStartTime(outlet, 0) already returns shift1_start
  const start = dateTimeUtc(date, shiftStartTime(outlet, shift));

  // Full shift: shift=0 for 2-shift outlet means one person covers both shifts.
  const isFullShift2x = outlet.shift_mode === 2 && shift === 0;

  const effectiveSalary = normalizeCurrency(staff.salary_per_shift) * (isFullShift2x ? 2 : 1);
  const salary = calculateSalary(
    now,
    start,
    effectiveSalary,
    configNumber(cfg, "late_tolerance_minutes", 10),
    configNumber(cfg, "deduction_per_minute", configNumber(cfg, "late_deduction_per_minute", 1000))
  );

  const flags = [
    gpsLowAccuracy ? "GPS_LOW_ACCURACY" : "",
    salary.lateMinutes > 0 ? "TELAT" : "",
    isFullShift2x ? "FULL_SHIFT_2X" : ""
  ]
    .filter(Boolean)
    .join(",");

  const { data: inserted, error } = await db
    .from("attendance")
    .insert({
      staff_id: staff.id,
      staff_name: staff.name,
      outlet_id: outlet.id,
      outlet_name: outlet.name,
      date,
      shift,
      checkin_time: now.toISOString(),
      final_checkin_time: now.toISOString(),
      status: salary.lateMinutes > 0 ? "late" : "present",
      late_minutes: salary.lateMinutes,
      deduction: salary.deduction,
      final_salary: salary.finalSalary,
      flags,
      selfie_in: selfieUrl,
      lat,
      lng
    })
    .select("*")
    .single();
  if (error) throw error;

  if (outlet.shift_mode === 2 && shift !== 0) {
    await db.from("shift_schedule").upsert(
      {
        outlet_id: outlet.id,
        date,
        shift,
        staff_id: staff.id,
        staff_name: staff.name,
        status: "claimed",
        requested_at: now.toISOString(),
        created_by: "checkin"
      },
      { onConflict: "outlet_id,date,shift" }
    );
  }

  // Kunci assignment agar tidak bisa dibatalkan setelah absen masuk
  const assignmentLockUpdates: Body = {
    status: "locked",
    locked_at: now.toISOString(),
    updated_at: now.toISOString()
  };
  if (shift === 0) assignmentLockUpdates.shift_type = "FULL_SHIFT";
  await db
    .from("staff_shift_assignments")
    .update(assignmentLockUpdates)
    .eq("staff_id", staff.id)
    .eq("date", date)
    .in("status", ["confirmed", "admin_override", "auto_cover"]);

  // Auto-create assignment jika tidak ada (staff lupa pilih jadwal H-1)
  if (outlet.shift_mode === 2 && (shift === 1 || shift === 2)) {
    const { data: existingAss } = await db
      .from("staff_shift_assignments")
      .select("id")
      .eq("staff_id", staff.id)
      .eq("date", date)
      .in("status", ["confirmed", "admin_override", "auto_cover", "locked", "completed"])
      .maybeSingle();
    if (!existingAss) {
      const shiftType = shift === 1 ? "SHIFT_1" : "SHIFT_2";
      try {
        await db.from("staff_shift_assignments").insert({
          outlet_id: outlet.id,
          staff_id: staff.id,
          staff_name: staff.name,
          date,
          shift_type: shiftType,
          status: "locked",
          source: "checkin",
          requested_at: now.toISOString(),
          confirmed_at: now.toISOString(),
          locked_at: now.toISOString(),
          created_by: "auto_checkin"
        });
      } catch { /* abaikan jika race condition */ }
    }
  } else if (shift === 0) {
    const { data: existingAss } = await db
      .from("staff_shift_assignments")
      .select("id")
      .eq("staff_id", staff.id)
      .eq("date", date)
      .in("status", ["confirmed", "admin_override", "auto_cover", "locked", "completed"])
      .maybeSingle();
    if (!existingAss) {
      try {
        await db.from("staff_shift_assignments").insert({
          outlet_id: outlet.id,
          staff_id: staff.id,
          staff_name: staff.name,
          date,
          shift_type: "FULL_SHIFT",
          status: "locked",
          source: "checkin",
          requested_at: now.toISOString(),
          confirmed_at: now.toISOString(),
          locked_at: now.toISOString(),
          created_by: "auto_checkin"
        });
      } catch { /* abaikan jika race condition */ }
    }
  }

  await logAudit(db, "checkin", staff.name, { date, shift, distance: Math.round(distance), gpsLowAccuracy });

  const notificationEmail = cfg.notification_email || process.env.NOTIFICATION_EMAIL || "";
  const attendanceEmailBase = {
    attendanceId: inserted.id,
    staffId: staff.id,
    staffName: staff.name,
    outletId: outlet.id,
    outletName: outlet.name,
    shiftLabel: shiftLabel(shift),
    date,
    scheduledStart: shiftStartTime(outlet, shift),
    checkinTime: now.toISOString(),
    lateMinutes: salary.lateMinutes,
    lat,
    lng,
    accuracy,
    selfieUrl,
    to: notificationEmail
  };
  // Shift 2 (sore): kirim email absen masuk langsung karena tidak ada laporan buka toko
  // Shift 1 / full shift: email dikirim saat laporan buka toko disubmit (combined email)
  const emailSent = shift === 2
    ? await notifySafely(db, "email_attendance_in_failed", staff.name, () =>
        sendAttendanceInEmail(db, attendanceEmailBase)
      )
    : false;
  const lateEmailSent = salary.lateMinutes > 0
    ? await notifySafely(db, "email_late_attendance_failed", staff.name, () =>
        sendLateAttendanceEmail(db, {
          ...attendanceEmailBase,
          lateMinutes: salary.lateMinutes
        })
      )
    : false;
  const fullShiftEmailSent = isFullShift2x
    ? await notifySafely(db, "email_full_shift_failed", staff.name, () =>
        sendFullShiftEmail(db, {
          attendanceId: inserted.id,
          staffId: staff.id,
          staffName: staff.name,
          outletId: outlet.id,
          outletName: outlet.name,
          date,
          shiftLabel: shiftLabel(shift),
          checkinTime: now.toISOString(),
          note: "Full shift terdeteksi karena outlet dua shift hanya memiliki satu shift aktif.",
          to: notificationEmail
        })
      )
    : false;
  const earlyMinutes = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60000));
  const praiseMessage = earlyMinutes >= 30
    ? `Wow, kamu datang ${earlyMinutes} menit lebih awal! Rajin banget, semangat terus ya! 🌟`
    : earlyMinutes >= 1
    ? `Keren! Kamu datang ${earlyMinutes} menit lebih awal. Tetap semangat! 👍`
    : null;

  return ok({
    attendance: inserted,
    checkin_time: now.toISOString(),
    late_minutes: salary.lateMinutes,
    deduction: salary.deduction,
    final_salary: salary.finalSalary,
    gps_low_accuracy: gpsLowAccuracy,
    distance_m: Math.round(distance),
    early_minutes: earlyMinutes,
    praise_message: praiseMessage,
    emailSent,
    lateEmailSent,
    fullShiftEmailSent
  });
}

async function checkout(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");

  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan", 400, "NO_OUTLET");
  const date = stringBody(body, "shiftDate") || stringBody(body, "date") || getWorkingDate().date;
  const shiftFromBody = body.shift !== undefined && body.shift !== null && body.shift !== "" ? Number(body.shift) : -1;
  let shift = ([0, 1, 2].includes(shiftFromBody) ? shiftFromBody : detectShift(outlet)) as 0 | 1 | 2;
  const dayoffShift = await resolveShiftDayoffState(db, outlet, date, shift);
  shift = dayoffShift.shift;

  let attendanceQuery = db
    .from("attendance")
    .select("*")
    .eq("staff_id", staff.id)
    .eq("date", date);
  if (shift !== 0) attendanceQuery = attendanceQuery.eq("shift", shift);
  const { data: attendanceRows, error: attendanceError } = await attendanceQuery
    .not("checkin_time", "is", null)
    .order("shift", { ascending: true });
  if (attendanceError) throw attendanceError;
  const attendance = shift === 0
    ? (attendanceRows || []).find((row) => row.shift === 0 || String(row.flags || "").includes("FULL_SHIFT_2X")) ?? (attendanceRows || [])[0]
    : (attendanceRows || [])[0];
  if (!attendance?.checkin_time) throw new HttpError("Belum ada absen masuk untuk shift ini", 400, "NO_CHECKIN");
  if (attendance.checkout_time) throw new HttpError("Absen pulang sudah tercatat", 409, "ALREADY_CHECKED_OUT");

  // Validasi waktu: jangan boleh absen keluar sebelum jam selesai shift
  const now = new Date();
  const endTime = shiftEndTime(outlet, shift);
  if (endTime && !isCheckoutTimeReached(endTime, now)) {
    const formattedEnd = String(endTime).slice(0, 5);
    throw new HttpError(
      `Absen keluar belum tersedia. Shift selesai pukul ${formattedEnd}. Silakan tunggu hingga waktu shift selesai.`,
      400,
      "CHECKOUT_TOO_EARLY"
    );
  }

  // Validasi GPS wajib untuk absen keluar
  const checkoutLat = numberBody(body, "lat", NaN);
  const checkoutLng = numberBody(body, "lng", NaN);
  const checkoutAcc = Math.max(0, numberBody(body, "accuracy", 0));
  if (!Number.isFinite(checkoutLat) || !Number.isFinite(checkoutLng)) {
    throw new HttpError(
      "GPS wajib diaktifkan untuk absen keluar. Mohon aktifkan lokasi pada browser Anda dan coba lagi.",
      400,
      "GPS_REQUIRED_CHECKOUT"
    );
  }
  const checkoutDist = haversineDistance(checkoutLat, checkoutLng, outlet.lat, outlet.lng);
  const checkoutRadius = outlet.radius_m + Math.min(checkoutAcc, outlet.radius_m * 0.3);
  if (checkoutDist > checkoutRadius) {
    throw new HttpError(
      `Lokasi Anda berada di luar area outlet (${Math.round(checkoutDist)}m dari pusat outlet). Silakan lakukan absen keluar di area outlet.`,
      400,
      "OUTSIDE_RADIUS"
    );
  }
  const checkoutGpsLowAccuracy = checkoutAcc > outlet.radius_m * 3;

  const { data: reports, error: reportsError } = await db
    .from("reports")
    .select("type")
    .eq("outlet_id", outlet.id)
    .eq("date", date);
  if (reportsError) throw reportsError;
  const hasBuka = (reports || []).some((report) => report.type === "BUKA");
  const hasTutup = (reports || []).some((report) => report.type === "TUTUP");
  if ((shift === 0 || shift === 1) && !hasBuka) throw new HttpError("Laporan Buka Toko wajib dikirim sebelum absen keluar", 400, "MISSING_REPORT_BUKA");
  if ((shift === 0 || shift === 2) && !hasTutup) throw new HttpError("Laporan Tutup Toko wajib dikirim sebelum absen keluar", 400, "MISSING_REPORT_TUTUP");

  // Inventori hanya mengunci alur tutup toko: Shift 2 atau Full Shift.
  if (outlet.inventory_branch_id && isClosingShift(shift, attendance.flags)) {
    const inventoryStatus = await checkInventoryCheckoutStatus(outlet.inventory_branch_id, date);
    if (!inventoryStatus.can_checkout) {
      throw new HttpError(inventoryStatus.message || "Laporan inventori belum selesai. Selesaikan laporan inventori sebelum absen keluar.", 400, "INVENTORY_NOT_COMPLETE");
    }
  }

  const selfieUrl = await uploadImage(db, `selfies/checkout/${staff.id}/${date}_${shift}.jpg`, body.selfie || body.photo);
  if (!selfieUrl) throw new HttpError("Selfie absen pulang wajib diupload");
  await consumeNonce(db, stringBody(body, "nonce"));

  const durationMin = Math.min(
    18 * 60,
    Math.max(0, Math.round((now.getTime() - new Date(attendance.checkin_time).getTime()) / 60000))
  );

  // Simpan GPS checkout di flags agar admin bisa melihatnya
  const existingFlags = (attendance.flags || "").split(",").filter(Boolean);
  const checkoutGpsFlag = `CHECKOUT_GPS:${checkoutLat.toFixed(6)}:${checkoutLng.toFixed(6)}:${Math.round(checkoutAcc)}`;
  if (checkoutGpsLowAccuracy) existingFlags.push("CHECKOUT_GPS_LOW_ACC");
  existingFlags.push(checkoutGpsFlag);
  const newFlags = existingFlags.join(",");

  // Tandai assignment sebagai completed
  await db
    .from("staff_shift_assignments")
    .update({ status: "completed", completed_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("staff_id", staff.id)
    .eq("date", date)
    .eq("status", "locked");

  const { data: updated, error } = await db
    .from("attendance")
    .update({
      checkout_time: now.toISOString(),
      selfie_out: selfieUrl,
      flags: newFlags
    })
    .eq("id", attendance.id)
    .select("*")
    .single();
  if (error) throw error;
  await logAudit(db, "checkout", staff.name, {
    date, shift, durationMin,
    checkoutDist: Math.round(checkoutDist),
    checkoutGpsLowAccuracy
  });
  // Kirim setelah checkout agar email tutup toko memuat selfie dan GPS keluar.
  const emailSent = await sendClosingReportAfterCheckout(db, staff, outlet, date, updated);
  return ok({
    attendance: updated,
    checkout_time: now.toISOString(),
    duration_min: durationMin,
    checkout_dist_m: Math.round(checkoutDist),
    checkout_gps_low_accuracy: checkoutGpsLowAccuracy,
    emailSent
  });
}

async function reportsConfig(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request);
  let outletId = stringBody(body, "outletId");
  if (!outletId && session.role === "staff") {
    const { outlet } = await getStaffWithOutlet(db, session.sub);
    outletId = outlet?.id || "";
  }
  if (!outletId) throw new HttpError("Outlet wajib dipilih");
  const type = body.type ? reportType(body) : undefined;
  let query = db.from("report_cfg").select("*").eq("outlet_id", outletId).order("sort_order");
  if (type) query = query.eq("type", type);
  const { data, error } = await query;
  if (error) throw error;
  const items = session.role === "staff"
    ? (data || []).filter((item: any) => !isLegacySelfieReportItem(item.label))
    : data || [];
  return ok({ items });
}

async function submitReport(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan", 400, "NO_OUTLET");

  const type = reportType(body);
  const date = stringBody(body, "shiftDate") || stringBody(body, "date") || getWorkingDate().date;

  const allowedShifts = type === "BUKA" ? [0, 1] : [0, 2];
  const { data: checkinRows, error: attCheckError } = await db
    .from("attendance")
    .select("id,shift,flags")
    .eq("staff_id", staff.id)
    .eq("date", date)
    .not("checkin_time", "is", null);
  if (attCheckError) throw attCheckError;
  const hasEligibleCheckin = (checkinRows || []).some((row) =>
    allowedShifts.includes(Number(row.shift)) || String(row.flags || "").includes("FULL_SHIFT_2X")
  );
  if (!hasEligibleCheckin) {
    throw new HttpError("Absen masuk dulu sebelum submit laporan", 400, "NO_CHECKIN");
  }

  // Cek inventori wajib selesai sebelum laporan tutup toko bisa dikirim
  if (type === "TUTUP" && outlet.inventory_branch_id) {
    const inventoryStatus = await checkInventoryCheckoutStatus(outlet.inventory_branch_id, date);
    if (!inventoryStatus.can_checkout) {
      throw new HttpError(
        inventoryStatus.message
          ? `Laporan inventori belum selesai — ${inventoryStatus.message}\n\nSelesaikan laporan inventori cabang ini terlebih dahulu, lalu kirim ulang laporan tutup toko.`
          : "Laporan inventori belum selesai.\n\nSelesaikan laporan inventori cabang ini terlebih dahulu, lalu kirim ulang laporan tutup toko.",
        400,
        "INVENTORY_NOT_COMPLETE"
      );
    }
  }

  const submittedAt = new Date();
  const submissionStatus = reportSubmissionStatus(outlet, type, submittedAt);
  if (!submissionStatus.canSubmit) {
    throw new HttpError(
      `Laporan ${type} belum bisa dikirim. Tersedia mulai pukul ${submissionStatus.start.slice(0, 5)}.`,
      400,
      "REPORT_TOO_EARLY"
    );
  }

  const inputItems = parseItems(body.items).filter((item) => !isLegacySelfieReportItem(item?.label));

  const { data: cfgItems, error: cfgError } = await db
    .from("report_cfg")
    .select("*")
    .eq("outlet_id", outlet.id)
    .eq("type", type)
    .order("sort_order");
  if (cfgError) throw cfgError;

  const effectiveCfgItems = (cfgItems || []).filter((item: any) => !isLegacySelfieReportItem(item.label));
  const savedItems: SavedReportItem[] = await Promise.all(effectiveCfgItems.map(async (cfgItem: any) => {
    const submitted = inputItems.find((item) => String(item.label || "") === String(cfgItem.label));

    // Client sudah upload langsung ke PHP server dan mengirim URL — pakai langsung tanpa re-upload
    const directUrl = trustedHttpsPhotoUrl(submitted?.photo_url);
    if (directUrl) {
      return { label: cfgItem.label, required: cfgItem.required, photo_url: directUrl, submitted: true };
    }

    // Fallback: client kirim blob via FormData (backward compat)
    const photoInput = photoInputForItem(body, submitted);
    if (cfgItem.required && !photoInput) {
      throw new HttpError(`Foto "${cfgItem.label}" wajib diupload`);
    }
    const photoUrl = photoInput
      ? await uploadImage(
          db,
          `reports/${outlet.id}/${date}/${type}/${sanitizePathSegment(cfgItem.label || "item")}.jpg`,
          photoInput
        )
      : "";
    return {
      label: cfgItem.label,
      required: cfgItem.required,
      photo_url: photoUrl,
      submitted: Boolean(photoUrl)
    };
  }));

  if (!effectiveCfgItems.length) {
    const hasPhoto = inputItems.some((item) => trustedHttpsPhotoUrl(item?.photo_url) || photoInputForItem(body, item));
    if (!hasPhoto) {
      throw new HttpError("Minimal satu foto laporan wajib diupload");
    }
    const fallbackItems = await Promise.all(inputItems.map(async (item) => {
      if (!item?.label) return null;
      // Client upload langsung → gunakan URL
      const directUrl = trustedHttpsPhotoUrl(item?.photo_url);
      if (directUrl) {
        return { label: item.label, required: false, photo_url: directUrl, submitted: true };
      }
      // Fallback blob
      const photoInput = photoInputForItem(body, item);
      if (!photoInput) return null;
      const photoUrl = await uploadImage(
        db,
        `reports/${outlet.id}/${date}/${type}/${sanitizePathSegment(String(item.label))}.jpg`,
        photoInput
      );
      return { label: item.label, required: false, photo_url: photoUrl, submitted: true };
    }));
    savedItems.push(...fallbackItems.filter((item): item is SavedReportItem => Boolean(item)));
  }

  await consumeNonce(db, stringBody(body, "nonce"));

  const { data: report, error } = await db
    .from("reports")
    .upsert(
      {
        staff_id: staff.id,
        staff_name: staff.name,
        outlet_id: outlet.id,
        outlet_name: outlet.name,
        date,
        type,
        items_json: savedItems,
        selfie: null,
        submitted_at: submittedAt.toISOString()
      },
      { onConflict: "outlet_id,date,type" }
    )
    .select("*")
    .single();
  if (error) throw error;

  const cfg = await configMap(db);
  const notifEmail = cfg.notification_email || process.env.NOTIFICATION_EMAIL || "";
  const reportBase = {
    reportId: report.id,
    staffId: staff.id,
    staffName: staff.name,
    outletId: outlet.id,
    outletName: outlet.name,
    date,
    submittedAt: report.submitted_at,
    reportStatusLabel: submissionStatus.isLate ? "Laporan Terlambat" : "Tepat waktu",
    reportStatusTone: submissionStatus.isLate ? "warning" as const : "success" as const,
    deadlineLabel: reportDeadlineLabel(outlet, type),
    reportLateMinutes: submissionStatus.lateMinutes,
    items: savedItems,
    photos: reportPhotoItems(savedItems),
    note: stringBody(body, "note") || null,
    to: notifEmail,
    forceType: submissionStatus.isLate ? "report_late" as const : undefined
  };

  let emailSent = false;
  if (type === "BUKA") {
    const { data: attRows, error: attEmailError } = await db
      .from("attendance")
      .select("id, checkin_time, selfie_in, lat, lng, late_minutes, shift, flags")
      .eq("staff_id", staff.id)
      .eq("date", date)
      .not("checkin_time", "is", null);
    if (attEmailError) throw attEmailError;
    const attData = (attRows || []).find((row) =>
      [0, 1].includes(Number(row.shift)) || String(row.flags || "").includes("FULL_SHIFT_2X")
    );
    const attShift = attData?.shift ?? 1;
    const isFullShiftAttendance = attShift === 0 || String(attData?.flags || "").includes("FULL_SHIFT_2X");
    const attShiftLabel = isFullShiftAttendance ? "Full Shift" : "Shift 1";
    emailSent = Boolean(await notifySafely(db, "report_email_failed", staff.name, () =>
      sendOpeningCombinedEmail(db, {
        ...reportBase,
        shiftLabel: attShiftLabel,
        scheduledStart: shiftStartTime(outlet, isFullShiftAttendance ? 0 : (attShift as 0 | 1 | 2)),
        checkinTime: attData?.checkin_time || null,
        lateMinutes: attData?.late_minutes || 0,
        checkinLat: attData?.lat || null,
        checkinLng: attData?.lng || null,
        selfieInUrl: attData?.selfie_in || null
      })
    ));
  } else {
    const { data: attRows, error: attEmailError } = await db
      .from("attendance")
      .select("id, checkin_time, checkout_time, selfie_out, flags, paid_status, final_salary, shift")
      .eq("staff_id", staff.id)
      .eq("date", date);
    if (attEmailError) throw attEmailError;
    const attData = (attRows || []).find((row) =>
      [0, 2].includes(Number(row.shift)) || String(row.flags || "").includes("FULL_SHIFT_2X")
    );
    if (attData?.checkout_time) {
      emailSent = await sendClosingReportAfterCheckout(db, staff, outlet, date, attData as Body);
    }
  }
  await logAudit(db, "submit_report", staff.name, { date, type, outletId: outlet.id });
  return ok({ report, reportId: report.id, emailSent });
}

async function staffInventoryStatus(db: Db, request: NextRequest) {
  const session = await requireSession(request, "staff");
  const { outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet?.inventory_branch_id) {
    return ok({ can_proceed: true, has_mapping: false, message: "" });
  }
  const date = getWorkingDate().date;
  const result = await checkInventoryCheckoutStatus(outlet.inventory_branch_id, date);
  return ok({ can_proceed: result.can_checkout, has_mapping: true, message: result.message });
}

async function staffPayroll(db: Db, request: NextRequest) {
  const session = await requireSession(request, "staff");

  // Ambil semua data secara paralel untuk kecepatan
  const [
    { data: attendance, error },
    { data: payments, error: payError },
    { staff, outlet },
    cfg
  ] = await Promise.all([
    db.from("attendance").select("*").eq("staff_id", session.sub).order("date", { ascending: false }),
    db.from("payments").select("*").eq("staff_id", session.sub).order("paid_at", { ascending: false }),
    getStaffWithOutlet(db, session.sub),
    configMap(db)
  ]);

  if (error) throw error;
  if (payError) throw payError;

  const rows = attendance || [];
  const summary = buildPayrollSummary(rows, payments || []);

  return ok({
    attendance: rows,
    payments: payments || [],
    summary,
    outlet: outlet ? {
      shift1_start: outlet.shift1_start || null,
      shift2_start: outlet.shift2_start || null
    } : null,
    config: {
      lateToleranceMinutes: configNumber(cfg, "late_tolerance_minutes", 10),
      deductionPerMinute: configNumber(cfg, "deduction_per_minute", configNumber(cfg, "late_deduction_per_minute", 1000))
    }
  });
}

async function staffProfile(db: Db, request: NextRequest) {
  const session = await requireSession(request, "staff");
  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  return ok({ profile: publicStaff(staff), outlet });
}

async function staffWeeklySchedule(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan");
  const weekStart = stringBody(body, "weekStart") || todayJakarta();
  const dateTo = addDays(weekStart, 6);
  return weeklySchedule(db, outlet.id, weekStart, dateTo, staff.id);
}

async function weeklySchedule(db: Db, outletId: string, dateFrom: string, dateTo: string, staffId?: string) {
  const [
    { data: outlet, error: outletError },
    { data: schedules, error },
    { data: leaves, error: leaveError },
    { data: dayoffs, error: offError },
    { data: assignments, error: assError },
    { data: staffDayoffs, error: sdError }
  ] =
    await Promise.all([
      db.from("outlets").select("id,shift_mode,active").eq("id", outletId).single(),
      db.from("shift_schedule").select("*").eq("outlet_id", outletId).gte("date", dateFrom).lte("date", dateTo),
      db.from("leave_requests").select("*").eq("outlet_id", outletId).gte("date", dateFrom).lte("date", dateTo),
      db.from("shift_dayoff").select("*").eq("outlet_id", outletId).gte("date", dateFrom).lte("date", dateTo),
      db.from("staff_shift_assignments").select("*").eq("outlet_id", outletId).gte("date", dateFrom).lte("date", dateTo).in("status", ["confirmed", "admin_override", "auto_cover", "locked", "completed"]),
      db.from("staff_dayoff").select("*").eq("outlet_id", outletId).gte("date", dateFrom).lte("date", dateTo).eq("status", "active")
    ]);
  if (outletError) throw outletError;
  if (error) throw error;
  if (leaveError) throw leaveError;
  if (offError) throw offError;
  if (assError) throw assError;
  if (sdError) throw sdError;
  assertOperationalOutlet(outlet, "Jadwal hanya bisa dibuka untuk outlet aktif.");

  const shiftNumbers = Number(outlet?.shift_mode) === 2 ? [1, 2] : [0];
  const days = [];
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(dateFrom, index);

    // Assignments untuk tanggal ini (tabel baru)
    const dayAssignments = (assignments || []).filter((a: any) => a.date === date);
    const myAssignment = staffId ? dayAssignments.find((a: any) => a.staff_id === staffId) : null;
    const myDayoff = staffId ? (staffDayoffs || []).find((d: any) => d.date === date && d.staff_id === staffId) : null;

    // Cari leave request milik staff untuk tanggal ini (pending/approved/rejected — BUKAN cancelled)
    // Priority: approved > pending > rejected
    const myLeaveRaw = staffId
      ? (leaves || [])
          .filter((l: any) => l.date === date && l.staff_id === staffId && l.status !== "cancelled")
          .sort((a: any, b: any) => {
            const order = { approved: 0, pending: 1, rejected: 2 };
            return (order[a.status as keyof typeof order] ?? 9) - (order[b.status as keyof typeof order] ?? 9);
          })[0] ?? null
      : null;

    // Leave request aktif yang mempengaruhi status slot (hanya approved yang mengubah ke "dayoff")
    const isLeaveApproved = myLeaveRaw?.status === "approved";
    // Leave pending: ada request menunggu, perlu ditampilkan prominent tapi slot belum terblokir
    const isLeavePending = myLeaveRaw?.status === "pending";

    const slots = shiftNumbers.map((shift) => {
      if (shift === 0) {
        // Single-shift outlet: tampilkan assignment jika ada
        // Jika leave approved → override status ke "dayoff" (sama dengan staff_dayoff)
        const ass = myAssignment || dayAssignments[0] || null;
        return {
          shift,
          scheduleId: null,
          assignmentId: ass?.id || null,
          staffId: ass?.staff_id || null,
          staffName: ass?.staff_name || null,
          shiftType: ass?.shift_type || "FULL_SHIFT",
          status: myDayoff ? "dayoff" : isLeaveApproved ? "dayoff" : ass ? ass.status : "single",
          isMe: Boolean(staffId && ass?.staff_id === staffId),
          isDayoff: Boolean(myDayoff || isLeaveApproved),
          hasPendingLeave: isLeavePending
        };
      }
      // 2-shift outlet
      const off = (dayoffs || []).some((item: any) => item.date === date && item.shift === shift);
      const recRaw = (schedules || []).find((item: any) => item.date === date && item.shift === shift);
      // Cari assignment yang cocok untuk shift ini
      const targetShiftType = shift === 1 ? ["SHIFT_1", "FULL_SHIFT"] : ["SHIFT_2", "FULL_SHIFT"];
      const ass = dayAssignments.find((a: any) => targetShiftType.includes(a.shift_type));
      const legacyConflictsWithAssignment = recRaw?.staff_id
        ? dayAssignments.some((a: any) => a.staff_id === recRaw.staff_id)
        : false;
      const rec = ass || legacyConflictsWithAssignment ? null : recRaw;

      return {
        shift,
        scheduleId: rec?.id || null,
        assignmentId: ass?.id || null,
        staffId: ass?.staff_id || rec?.staff_id || null,
        staffName: ass?.staff_name || rec?.staff_name || null,
        shiftType: ass?.shift_type || (shift === 1 ? "SHIFT_1" : "SHIFT_2"),
        status: myDayoff ? "dayoff" : isLeaveApproved ? "dayoff" : off ? "off" : ass ? ass.status : rec?.status || "open",
        isMe: Boolean(staffId && (ass?.staff_id === staffId || rec?.staff_id === staffId)),
        isDayoff: Boolean(myDayoff || isLeaveApproved),
        hasPendingLeave: isLeavePending
      };
    });

    days.push({
      date,
      slots,
      assignments: dayAssignments,
      // Sembunyikan myAssignment dari response jika leave sudah approved
      // (agar frontend tidak menampilkan "Jadwal Saya" di bawah banner "Libur")
      myAssignment: isLeaveApproved ? null : (myAssignment || null),
      myDayoff: myDayoff || null,
      // Sertakan myLeave agar frontend bisa menampilkan status leave secara informatif
      myLeave: myLeaveRaw || null,
      leaves: (leaves || [])
        .filter((leave: any) => leave.date === date && leave.status !== "cancelled")
        .map((leave: any) => ({ ...leave, isMe: Boolean(staffId && leave.staff_id === staffId) }))
    });
  }
  return ok({
    weekStart: dateFrom,
    dateTo,
    days,
    schedules: schedules || [],
    assignments: assignments || [],
    leaves: leaves || [],
    dayoffs: dayoffs || [],
    staffDayoffs: staffDayoffs || []
  });
}

async function claimShift(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan");
  const date = stringBody(body, "date");
  const shift = Number(body.shift) as 1 | 2;
  if (!date || ![1, 2].includes(shift)) throw new HttpError("Tanggal dan shift wajib diisi");
  if (Number(outlet.shift_mode) !== 2) throw new HttpError("Outlet 1 shift tidak memakai claim shift");
  if (date <= todayJakarta()) {
    throw new HttpError(
      "Jadwal hanya bisa diatur H-1 (sehari sebelumnya). Untuk perubahan mendadak, hubungi admin.",
      400, "DEADLINE_PASSED"
    );
  }

  const { data: off } = await db
    .from("shift_dayoff")
    .select("id")
    .eq("outlet_id", outlet.id)
    .eq("date", date)
    .eq("shift", shift)
    .maybeSingle();
  if (off) throw new HttpError("Shift ini sedang libur");

  const { data: existing } = await db
    .from("shift_schedule")
    .select("*")
    .eq("outlet_id", outlet.id)
    .eq("date", date)
    .eq("shift", shift)
    .maybeSingle();
  if (existing?.staff_id && existing.staff_id !== staff.id && existing.status === "claimed") {
    throw new HttpError("Shift sudah diambil staff lain", 409, "SHIFT_TAKEN");
  }

  const { data, error } = await db
    .from("shift_schedule")
    .upsert(
      {
        outlet_id: outlet.id,
        date,
        shift,
        staff_id: staff.id,
        staff_name: staff.name,
        status: "claimed",
        requested_at: new Date().toISOString(),
        cancelled_at: null,
        cancel_reason: null,
        created_by: "staff"
      },
      { onConflict: "outlet_id,date,shift" }
    )
    .select("*")
    .single();
  if (error) throw error;
  await logAudit(db, "claim_shift", staff.name, { date, shift });
  return ok({ schedule: data });
}

async function cancelShift(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  const scheduleId = stringBody(body, "scheduleId");
  if (!scheduleId) throw new HttpError("Schedule ID wajib diisi");
  const { staff } = await getStaffWithOutlet(db, session.sub);
  const { data: existing, error: existingError } = await db
    .from("shift_schedule")
    .select("*")
    .eq("id", scheduleId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing || existing.staff_id !== staff.id) throw new HttpError("Shift tidak ditemukan", 404);
  if (existing.date <= todayJakarta()) {
    throw new HttpError(
      "Pembatalan jadwal hanya bisa dilakukan H-1 (sehari sebelumnya). Untuk perubahan mendadak, hubungi admin.",
      400, "DEADLINE_PASSED"
    );
  }
  const { data, error } = await db
    .from("shift_schedule")
    .update({
      staff_id: null,
      staff_name: null,
      status: "open",
      cancelled_at: new Date().toISOString(),
      cancel_reason: stringBody(body, "reason", "Dibatalkan staff")
    })
    .eq("id", scheduleId)
    .select("*")
    .single();
  if (error) throw error;
  await logAudit(db, "cancel_shift", staff.name, { scheduleId });
  return ok({ schedule: data });
}

async function requestLeave(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan");
  const date = stringBody(body, "date");
  if (!date) throw new HttpError("Tanggal cuti wajib diisi");
  if (date <= todayJakarta()) {
    throw new HttpError(
      "Pengajuan libur hanya bisa dilakukan H-1 (sehari sebelumnya). Untuk keperluan mendadak, hubungi admin.",
      400, "DEADLINE_PASSED"
    );
  }

  // Cek apakah auto-approve aktif (default: aktif)
  const cfg = await configMap(db);
  const autoApprove = cfg["leave_auto_approve"] !== "false";
  const leaveStatus = autoApprove ? "approved" : "pending";

  const { data, error } = await db
    .from("leave_requests")
    .upsert(
      {
        outlet_id: outlet.id,
        outlet_name: outlet.name,
        staff_id: staff.id,
        staff_name: staff.name,
        date,
        status: leaveStatus,
        reason: stringBody(body, "reason") || null,
        admin_note: null,
        cancelled_at: null,
        rejected_at: null
      },
      { onConflict: "staff_id,date" }
    )
    .select("*")
    .single();
  if (error) throw error;

  // Jika auto-approve: batalkan shift_schedule dan staff_shift_assignments yang konflik
  if (autoApprove) {
    await db
      .from("shift_schedule")
      .update({
        staff_id: null,
        staff_name: null,
        status: "open",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Cuti disetujui otomatis"
      })
      .eq("staff_id", staff.id)
      .eq("date", date);
    await db
      .from("staff_shift_assignments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Cuti disetujui otomatis",
        updated_at: new Date().toISOString()
      })
      .eq("staff_id", staff.id)
      .eq("date", date)
      .in("status", ["confirmed", "admin_override", "auto_cover"]);
  }

  await logAudit(db, "request_leave", staff.name, { date, autoApprove });
  const emailSent = await notifySafely(db, "email_leave_request_failed", staff.name, () =>
    sendLeaveRequestEmail(db, {
      leaveId: data.id,
      staffId: staff.id,
      staffName: staff.name,
      outletId: outlet.id,
      outletName: outlet.name,
      leaveDate: date,
      reason: data.reason,
      requestedAt: data.created_at,
      status: data.status,
      adminUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/admin/leave`,
      to: cfg.notification_email || process.env.NOTIFICATION_EMAIL || ""
    })
  );
  return ok({ leave: data, autoApproved: autoApprove, emailSent });
}

async function cancelLeave(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  const leaveId = stringBody(body, "leaveId");
  if (!leaveId) throw new HttpError("Leave ID wajib diisi");
  const { staff } = await getStaffWithOutlet(db, session.sub);

  // Fetch dulu untuk validasi kepemilikan, status, dan H-1 cutoff
  const { data: leaveRow, error: fetchErr } = await db
    .from("leave_requests")
    .select("id,date,status,staff_id")
    .eq("id", leaveId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!leaveRow || leaveRow.staff_id !== staff.id) throw new HttpError("Permintaan libur tidak ditemukan", 404);
  if (leaveRow.status === "cancelled") throw new HttpError("Permintaan libur sudah dibatalkan");
  if (leaveRow.date <= todayJakarta()) {
    throw new HttpError(
      "Pembatalan libur hanya bisa dilakukan H-1 (sehari sebelumnya). Untuk keperluan mendadak, hubungi admin.",
      400, "DEADLINE_PASSED"
    );
  }

  const { data, error } = await db
    .from("leave_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", leaveId)
    .eq("staff_id", staff.id)
    .select("*")
    .single();
  if (error) throw error;
  await logAudit(db, "cancel_leave", staff.name, { leaveId });
  return ok({ leave: data });
}

async function adminDispatch(db: Db, method: string, path: string, body: Body) {
  if (path === "/admin/dashboard" && method === "GET") return adminDashboard(db);
  if (path === "/admin/staff" && method === "GET" && body.deletePreview === "1") return adminStaffDeletePreview(db, body);
  if (path === "/admin/staff") return adminStaff(db, method, body);
  if (path === "/admin/outlets") return adminOutlets(db, method, body);
  if (path === "/admin/inventory-branches" && method === "GET") return adminInventoryBranches();
  if (path === "/admin/attendance/bulk" && method === "POST") return adminAttendanceBulk(db, body);
  if (path === "/admin/attendance-import/preview" && method === "POST") return adminAttendanceImportPreview(db, body);
  if (path === "/admin/attendance-import/import" && method === "POST") return adminAttendanceImportCommit(db, body);
  if (path === "/admin/attendance") return adminAttendance(db, method, body);
  if (path === "/admin/payroll") return adminPayroll(db, method, body);
  if (path === "/admin/payroll-projection" && method === "GET") return adminPayrollProjection(db, body);
  if (path === "/admin/payroll-projection/detail" && method === "GET") return adminPayrollProjectionDetail(db, body);
  if (path === "/admin/schedule") return adminSchedule(db, method, body);
  if (path === "/admin/leave") return adminLeave(db, method, body);
  if (path === "/admin/reports" && method === "GET") return adminReports(db, body);
  if (path === "/admin/report-cfg") return adminReportCfg(db, method, body);
  if (path === "/admin/dayoff") return adminDayoff(db, method, body);
  if (path === "/admin/staff-dayoff") return adminStaffDayoff(db, method, body);
  if (path === "/admin/email") return adminEmail(db, method, body);
  if (path === "/admin/config") return adminConfig(db, method, body);
  if (path === "/admin/attendance/duplicates") return adminFixDuplicateShifts(db, method, body);
  throw new HttpError("Endpoint admin tidak ditemukan", 404, "ADMIN_NOT_FOUND");
}

async function adminFixDuplicateShifts(db: Db, method: string, body: Body) {
  type AttRow = {
    id: string;
    staff_id: string;
    staff_name: string;
    outlet_id: string;
    outlet_name: string;
    date: string;
    shift: number;
    checkin_time: string | null;
    final_salary: number;
    flags: string | null;
    paid_status: boolean;
    original_final_salary: number | null;
  };

  if (method === "GET") {
    const { data: rows, error } = await db
      .from("attendance")
      .select("id,staff_id,staff_name,outlet_id,outlet_name,date,shift,checkin_time,final_salary,flags,paid_status")
      .not("checkin_time", "is", null)
      .in("shift", [1, 2])
      .order("date", { ascending: false }) as { data: AttRow[] | null; error: unknown };
    if (error) throw error;

    const groups = new Map<string, AttRow[]>();
    for (const row of rows || []) {
      const key = `${row.outlet_id}|${row.date}|${row.shift}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const duplicates: object[] = [];
    for (const groupRows of groups.values()) {
      if (groupRows.length < 2) continue;
      const sorted = [...groupRows].sort(
        (a, b) => new Date(a.checkin_time!).getTime() - new Date(b.checkin_time!).getTime()
      );
      duplicates.push({
        outlet_name: sorted[0].outlet_name,
        date: sorted[0].date,
        shift: sorted[0].shift,
        valid_record: sorted[0],
        duplicate_records: sorted.slice(1)
      });
    }

    return ok({ duplicates, totalDuplicateGroups: duplicates.length });
  }

  if (method === "POST") {
    const dryRun = body.dryRun === true || body.dryRun === "true";

    const { data: rows, error } = await db
      .from("attendance")
      .select("id,staff_id,staff_name,outlet_id,date,shift,checkin_time,final_salary,flags,original_final_salary,paid_status")
      .not("checkin_time", "is", null)
      .in("shift", [1, 2]) as { data: AttRow[] | null; error: unknown };
    if (error) throw error;

    const groups = new Map<string, AttRow[]>();
    for (const row of rows || []) {
      const key = `${row.outlet_id}|${row.date}|${row.shift}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const toMark: AttRow[] = [];
    for (const groupRows of groups.values()) {
      if (groupRows.length < 2) continue;
      const sorted = [...groupRows].sort(
        (a, b) => new Date(a.checkin_time!).getTime() - new Date(b.checkin_time!).getTime()
      );
      for (const row of sorted.slice(1)) {
        if (!(row.flags || "").split(",").includes("DUPLIKAT")) toMark.push(row);
      }
    }

    if (dryRun) {
      return ok({ dryRun: true, wouldMark: toMark.length, ids: toMark.map((r) => r.id) });
    }

    let markedCount = 0;
    for (const row of toMark) {
      const flagsArr = (row.flags || "").split(",").filter(Boolean);
      if (!flagsArr.includes("DUPLIKAT")) flagsArr.push("DUPLIKAT");
      await db.from("attendance").update({
        is_duplicate: true,
        flags: flagsArr.join(","),
        original_final_salary: row.original_final_salary ?? row.final_salary,
        final_salary: 0,
        deduction: 0
      }).eq("id", row.id);
      markedCount++;
    }

    await logAudit(db, "fix_duplicate_shifts", "Admin", { markedCount, ids: toMark.map((r) => r.id) });
    return ok({ markedCount, ids: toMark.map((r) => r.id) });
  }

  throw new HttpError("Method tidak diizinkan", 405);
}

async function adminDashboard(db: Db) {
  const today = todayJakarta();
  const [
    { data: staff, error: staffError },
    { data: outlets, error: outletsError },
    { data: attendance, error: attendanceError },
    { data: reports, error: reportsError }
  ] = await Promise.all([
    db.from("staff").select("id,name,outlet_id,active").eq("active", true),
    db.from("outlets").select("*").eq("active", true),
    db.from("attendance").select("*").eq("date", today).order("checkin_time", { ascending: false }),
    db.from("reports").select("*").eq("date", today)
  ]);
  if (staffError) throw staffError;
  if (outletsError) throw outletsError;
  if (attendanceError) throw attendanceError;
  if (reportsError) throw reportsError;

  const presentStaff = new Set((attendance || []).filter((row) => row.checkin_time).map((row) => row.staff_id));
  return ok({
    date: today,
    metrics: {
      activeStaff: (staff || []).length,
      presentStaff: presentStaff.size,
      activeOutlets: (outlets || []).length,
      reportBuka: (reports || []).filter((report) => report.type === "BUKA").length,
      reportTutup: (reports || []).filter((report) => report.type === "TUTUP").length
    },
    staff: staff || [],
    outlets: outlets || [],
    attendance: attendance || [],
    reports: reports || []
  });
}

async function adminStaff(db: Db, method: string, body: Body) {
  if (method === "GET") {
    let query = db.from("staff").select("*, outlets(name)").order("name");
    if (body.outletId) query = query.eq("outlet_id", body.outletId);
    if (body.active !== undefined && body.active !== "") query = query.eq("active", body.active === "true" || body.active === true);
    if (body.q) query = query.ilike("name", `%${body.q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return ok({ staff: (data || []).map(publicStaff) });
  }

  if (method === "POST") {
    const schema = z.object({
      name: z.string().min(2),
      pin: z.string().min(4).max(6),
      outlet_id: z.string().uuid().optional().nullable(),
      salary_per_shift: z.coerce.number().min(0),
      phone: z.string().optional().nullable(),
      ktp_no: z.string().optional().nullable(),
      address: z.string().optional().nullable()
    });
    const parsed = schema.parse(body);
    if (parsed.outlet_id) {
      const { data: outlet, error: outletError } = await db.from("outlets").select("id,active").eq("id", parsed.outlet_id).single();
      if (outletError) throw outletError;
      assertOperationalOutlet(outlet, "Staff hanya bisa ditugaskan ke outlet aktif.");
    }
    const { data: staff, error } = await db
      .from("staff")
      .insert({
        name: parsed.name,
        pin_hash: hashPin(parsed.pin),
        outlet_id: parsed.outlet_id || null,
        salary_per_shift: parsed.salary_per_shift,
        phone: parsed.phone || null,
        ktp_no: parsed.ktp_no || null,
        address: parsed.address || null
      })
      .select("*")
      .single();
    if (error) throw error;

    const photoUrl = body.photo ? await uploadImage(db, `staff/photos/${staff.id}.jpg`, body.photo) : "";
    const ktpUrl = body.ktp_photo ? await uploadImage(db, `staff/ktp/${staff.id}.jpg`, body.ktp_photo) : "";
    const updates: Body = {};
    if (photoUrl) updates.photo_url = photoUrl;
    if (ktpUrl) updates.ktp_photo_url = ktpUrl;
    const saved = Object.keys(updates).length
      ? await db.from("staff").update(updates).eq("id", staff.id).select("*").single()
      : { data: staff, error: null };
    if (saved.error) throw saved.error;
    await logAudit(db, "admin_add_staff", "Admin", { staffId: staff.id, name: staff.name });
    return ok({ staff: publicStaff(saved.data) });
  }

  if (method === "PUT") {
    const staffId = stringBody(body, "staffId") || stringBody(body, "id");
    if (!staffId) throw new HttpError("Staff ID wajib diisi");
    const updates: Body = {};
    [
      "name",
      "outlet_id",
      "salary_per_shift",
      "phone",
      "ktp_no",
      "address",
      "active"
    ].forEach((key) => {
      if (body[key] !== undefined) updates[key] = body[key];
    });
    if (body.pin) updates.pin_hash = hashPin(String(body.pin));
    if (body.photo) updates.photo_url = await uploadImage(db, `staff/photos/${staffId}.jpg`, body.photo);
    if (body.ktp_photo) updates.ktp_photo_url = await uploadImage(db, `staff/ktp/${staffId}.jpg`, body.ktp_photo);
    if (updates.outlet_id) {
      const { data: outlet, error: outletError } = await db.from("outlets").select("id,active").eq("id", updates.outlet_id).single();
      if (outletError) throw outletError;
      assertOperationalOutlet(outlet, "Staff hanya bisa ditugaskan ke outlet aktif.");
    }
    const { data, error } = await db.from("staff").update(updates).eq("id", staffId).select("*").single();
    if (error) throw error;
    await logAudit(db, "admin_update_staff", "Admin", { staffId });
    return ok({ staff: publicStaff(data) });
  }

  if (method === "DELETE") {
    const staffId = stringBody(body, "staffId") || stringBody(body, "id");
    if (!staffId) throw new HttpError("Staff ID wajib diisi");
    // mode: "deactivate" (default, backward compat), "archive" (soft delete), "hard" (permanent, hanya jika dep=0)
    const mode = stringBody(body, "mode", "deactivate");
    const today = todayJakarta();

    if (mode === "deactivate") {
      const { error } = await db.from("staff").update({ active: false }).eq("id", staffId);
      if (error) throw error;
      await db.from("shift_schedule").update({ staff_id: null, staff_name: null, status: "open" }).eq("staff_id", staffId).gte("date", today);
      await db.from("staff_shift_assignments").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Staff dinonaktifkan", updated_at: new Date().toISOString() }).eq("staff_id", staffId).gte("date", today).in("status", ["confirmed", "admin_override", "auto_cover"]);
      await db.from("staff_dayoff").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Staff dinonaktifkan" }).eq("staff_id", staffId).eq("status", "active").gte("date", today);
      await logAudit(db, "admin_deactivate_staff", "Admin", { staffId, mode: "deactivate" });
      return ok({ deleted: true, mode: "deactivate" });
    }

    if (mode === "archive") {
      const deleteReason = stringBody(body, "deleteReason") || null;
      const { error } = await db.from("staff").update({
        active: false,
        deleted_at: new Date().toISOString(),
        deleted_by: "Admin",
        delete_reason: deleteReason,
        archived_at: new Date().toISOString()
      }).eq("id", staffId);
      if (error) throw error;
      await db.from("shift_schedule").update({ staff_id: null, staff_name: null, status: "open" }).eq("staff_id", staffId).gte("date", today);
      await db.from("staff_shift_assignments").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Staff diarsipkan", updated_at: new Date().toISOString() }).eq("staff_id", staffId).gte("date", today).in("status", ["confirmed", "admin_override", "auto_cover"]);
      await db.from("staff_dayoff").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Staff diarsipkan" }).eq("staff_id", staffId).eq("status", "active").gte("date", today);
      await logAudit(db, "admin_archive_staff", "Admin", { staffId, mode: "archive", deleteReason });
      return ok({ deleted: true, mode: "archive" });
    }

    if (mode === "hard") {
      // Dependency check
      const preview = await getStaffDeleteDependencies(db, staffId);
      if (preview.totalDependencies > 0) {
        throw new HttpError(
          `Staff ini memiliki ${preview.totalDependencies} data historis. Gunakan Arsipkan Staff, bukan Hapus Permanen.`,
          400, "STAFF_HAS_HISTORY"
        );
      }
      const { data: staffRow } = await db.from("staff").select("name").eq("id", staffId).maybeSingle();
      const confirmName = stringBody(body, "confirmName");
      if (!staffRow || confirmName !== staffRow.name) {
        throw new HttpError("Nama konfirmasi tidak cocok. Ketik nama staff dengan tepat untuk melanjutkan.", 400, "CONFIRMATION_MISMATCH");
      }
      await db.from("staff").delete().eq("id", staffId);
      await logAudit(db, "admin_hard_delete_staff", "Admin", { staffId, staffName: staffRow.name, mode: "hard" });
      return ok({ deleted: true, mode: "hard" });
    }

    throw new HttpError("Mode delete tidak valid. Pilih: deactivate, archive, atau hard", 400, "INVALID_MODE");
  }

  throw new HttpError("Method staff tidak valid", 405);
}

async function adminOutlets(db: Db, method: string, body: Body) {
  if (method === "GET") {
    const { data, error } = await db.from("outlets").select("*").order("name");
    if (error) throw error;
    return ok({ outlets: (data || []).map(toOutlet) });
  }

  if (method === "DELETE") {
    const outletId = stringBody(body, "outletId") || stringBody(body, "id");
    if (!outletId) throw new HttpError("Outlet ID wajib diisi");
    const { error } = await db.from("outlets").update({ active: false }).eq("id", outletId);
    if (error) throw error;
    await logAudit(db, "admin_delete_outlet", "Admin", { outletId });
    return ok({ deleted: true });
  }

  const shiftMode = Number(body.shift_mode || 1) === 2 ? 2 : 1;
  const payload = {
    name: stringBody(body, "name"),
    location_url: stringBody(body, "location_url") || null,
    lat: numberBody(body, "lat"),
    lng: numberBody(body, "lng"),
    radius_m: numberBody(body, "radius_m", 100),
    shift_mode: shiftMode,
    shift1_start: stringBody(body, "shift1_start", "09:00"),
    shift1_end: stringBody(body, "shift1_end", "17:00"),
    shift2_start: shiftMode === 2 ? stringBody(body, "shift2_start") || null : null,
    shift2_end: shiftMode === 2 ? stringBody(body, "shift2_end") || null : null,
    report_buka_start: stringBody(body, "report_buka_start") || null,
    report_buka_end: stringBody(body, "report_buka_end") || null,
    report_tutup_start: stringBody(body, "report_tutup_start") || null,
    report_tutup_end: stringBody(body, "report_tutup_end") || null,
    inventory_branch_id: stringBody(body, "inventory_branch_id") || null,
    active: body.active === undefined ? true : body.active === true || body.active === "true"
  };
  if (!payload.name) throw new HttpError("Nama outlet wajib diisi");
  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) throw new HttpError("Koordinat outlet wajib valid");

  if (method === "POST") {
    if (payload.active) await assertUniqueActiveOutletName(db, payload.name);
    const { data, error } = await db.from("outlets").insert(payload).select("*").single();
    if (error) throw error;
    await logAudit(db, "admin_add_outlet", "Admin", { outletId: data.id, name: data.name });
    return ok({ outlet: toOutlet(data) });
  }

  if (method === "PUT") {
    const outletId = stringBody(body, "outletId") || stringBody(body, "id");
    if (!outletId) throw new HttpError("Outlet ID wajib diisi");
    if (payload.active) await assertUniqueActiveOutletName(db, payload.name, outletId);
    const { data, error } = await db.from("outlets").update(payload).eq("id", outletId).select("*").single();
    if (error) throw error;
    await logAudit(db, "admin_update_outlet", "Admin", { outletId });
    return ok({ outlet: toOutlet(data) });
  }

  throw new HttpError("Method outlet tidak valid", 405);
}

async function adminInventoryBranches() {
  const apiKey = process.env.INVENTORY_API_KEY;
  if (!apiKey) return ok({ branches: [] });
  const params = new URLSearchParams({
    action: "api.v1.integration.branches",
    api_key: apiKey
  });
  try {
    const res = await fetch(`${INVENTORY_API_URL}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { success?: boolean; branches?: { branch_id: string; branch_name: string }[] };
    return ok({ branches: json.branches || [] });
  } catch (err) {
    console.error("[inventory] Gagal ambil daftar cabang:", err instanceof Error ? err.message : err);
    return ok({ branches: [] });
  }
}

async function adminAttendance(db: Db, method: string, body: Body) {
  if (method === "GET") {
    let query = db.from("attendance").select("*").order("date", { ascending: false }).order("shift", { ascending: true });
    if (body.staffId) query = query.eq("staff_id", body.staffId);
    if (body.outletId) query = query.eq("outlet_id", body.outletId);
    if (body.status) query = query.eq("status", body.status);
    if (body.date) query = query.eq("date", body.date);
    if (body.dateFrom) query = query.gte("date", body.dateFrom);
    if (body.dateTo) query = query.lte("date", body.dateTo);
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return ok({ attendance: data || [] });
  }

  if (method === "POST") {
    const staffId = stringBody(body, "staffId");
    const outletId = stringBody(body, "outletId");
    const date = stringBody(body, "date") || todayJakarta();
    const shift = Number(body.shift || 0) as 0 | 1 | 2;
    if (!staffId || !outletId) throw new HttpError("Staff dan outlet wajib dipilih");

    const [{ data: staff, error: staffError }, { data: outletRaw, error: outletError }, cfg] = await Promise.all([
      db.from("staff").select("*").eq("id", staffId).single(),
      db.from("outlets").select("*").eq("id", outletId).single(),
      configMap(db)
    ]);
    if (staffError) throw staffError;
    if (outletError) throw outletError;
    assertOperationalStaff(staff, "Absen manual hanya bisa dibuat untuk staff aktif.");
    assertOperationalOutlet(outletRaw, "Absen manual hanya bisa dibuat untuk outlet aktif.");
    const outlet = toOutlet(outletRaw);
    const checkin = body.checkin_time
      ? dateTimeUtc(date, String(body.checkin_time).slice(0, 5))
      : dateTimeUtc(date, shiftStartTime(outlet, shift));
    const checkout = body.checkout_time ? dateTimeUtc(date, String(body.checkout_time).slice(0, 5)) : null;
    const salary = calculateSalary(
      checkin,
      dateTimeUtc(date, shiftStartTime(outlet, shift)),
      normalizeCurrency(staff.salary_per_shift),
      configNumber(cfg, "late_tolerance_minutes", 10),
      configNumber(cfg, "deduction_per_minute", configNumber(cfg, "late_deduction_per_minute", 1000))
    );

    const { data, error } = await db
      .from("attendance")
      .upsert(
        {
          staff_id: staff.id,
          staff_name: staff.name,
          outlet_id: outlet.id,
          outlet_name: outlet.name,
          date,
          shift,
          checkin_time: checkin.toISOString(),
          checkout_time: checkout?.toISOString() || null,
          final_checkin_time: checkin.toISOString(),
          status: salary.lateMinutes > 0 ? "late" : "present",
          late_minutes: salary.lateMinutes,
          deduction: salary.deduction,
          final_salary: salary.finalSalary,
          flags: "MANUAL_ADMIN"
        },
        { onConflict: "staff_id,date,shift" }
      )
      .select("*")
      .single();
    if (error) throw error;
    await logAudit(db, "admin_manual_attendance", "Admin", { attendanceId: data.id, staffId, date, shift });
    return ok({ attendance: data });
  }

  if (method === "PUT") {
    const attendanceId = stringBody(body, "attendanceId") || stringBody(body, "id");
    if (!attendanceId) throw new HttpError("Attendance ID wajib diisi");
    const { data: existing, error: existingError } = await db
      .from("attendance")
      .select("*")
      .eq("id", attendanceId)
      .single();
    if (existingError) throw existingError;
    if (!stringBody(body, "revision_note")) throw new HttpError("Catatan revisi wajib diisi");
    const updates: Body = {
      revision_note: stringBody(body, "revision_note"),
      revised_at: new Date().toISOString(),
      revised_by: "Admin",
      original_late_minutes: existing.original_late_minutes ?? existing.late_minutes,
      original_deduction: existing.original_deduction ?? existing.deduction,
      original_final_salary: existing.original_final_salary ?? existing.final_salary
    };

    // Koreksi shift: jika admin mengubah shift, hitung ulang gaji secara otomatis
    const newShiftRaw = body.shift !== undefined && body.shift !== null && body.shift !== "" ? Number(body.shift) : null;
    if (newShiftRaw !== null && [0, 1, 2].includes(newShiftRaw) && newShiftRaw !== existing.shift && existing.checkin_time) {
      const newShift = newShiftRaw as 0 | 1 | 2;
      const [{ data: outletRaw }, { data: staffRaw }, revCfg] = await Promise.all([
        db.from("outlets").select("*").eq("id", existing.outlet_id).single(),
        db.from("staff").select("salary_per_shift").eq("id", existing.staff_id).single(),
        configMap(db)
      ]);
      if (outletRaw && staffRaw) {
        const revOutlet = toOutlet(outletRaw);
        const checkinDt = new Date(existing.checkin_time);
        const newShiftStart = dateTimeUtc(existing.date, shiftStartTime(revOutlet, newShift));
        const recalc = calculateSalary(
          checkinDt,
          newShiftStart,
          normalizeCurrency((staffRaw as any).salary_per_shift),
          configNumber(revCfg, "late_tolerance_minutes", 10),
          configNumber(revCfg, "deduction_per_minute", configNumber(revCfg, "late_deduction_per_minute", 1000))
        );
        updates.shift = newShift;
        updates.late_minutes = recalc.lateMinutes;
        updates.deduction = recalc.deduction;
        updates.final_salary = recalc.finalSalary;
        updates.status = recalc.lateMinutes > 0 ? "late" : "present";

        // Sinkronkan shift_type di staff_shift_assignments agar status endpoint konsisten
        const newShiftType = newShift === 1 ? "SHIFT_1" : newShift === 2 ? "SHIFT_2" : "FULL_SHIFT";
        await db
          .from("staff_shift_assignments")
          .update({ shift_type: newShiftType, updated_at: new Date().toISOString() })
          .eq("staff_id", existing.staff_id)
          .eq("date", existing.date)
          .in("status", ["confirmed", "admin_override", "auto_cover", "locked", "completed"]);
      }
    } else {
      // Koreksi manual: late_minutes, deduction, final_salary, status, paid_status
      ["late_minutes", "deduction", "final_salary", "status", "paid_status"].forEach((key) => {
        if (body[key] !== undefined && body[key] !== null && body[key] !== "") updates[key] = body[key];
      });
    }

    if (body.checkin_time) updates.checkin_time = dateTimeUtc(existing.date, String(body.checkin_time).slice(0, 5)).toISOString();
    if (body.checkout_time) updates.checkout_time = dateTimeUtc(existing.date, String(body.checkout_time).slice(0, 5)).toISOString();
    const { data, error } = await db.from("attendance").update(updates).eq("id", attendanceId).select("*").single();
    if (error) throw error;
    await logAudit(db, "admin_revise_attendance", "Admin", {
      attendanceId,
      note: updates.revision_note,
      shiftChanged: updates.shift !== undefined ? { from: existing.shift, to: updates.shift } : undefined
    });
    return ok({ attendance: data });
  }

  if (method === "DELETE") {
    const attendanceId = stringBody(body, "attendanceId") || stringBody(body, "id");
    if (!attendanceId) throw new HttpError("Attendance ID wajib diisi");

    const { data: existing, error: fetchErr } = await db
      .from("attendance")
      .select("paid_status,staff_name,date,shift,payment_id,flags")
      .eq("id", attendanceId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) throw new HttpError("Data absensi tidak ditemukan", 404, "NOT_FOUND");

    if (existing.paid_status) {
      throw new HttpError(
        "Absensi ini sudah tercatat sebagai dibayar dan tidak bisa dihapus. Hubungi admin untuk membatalkan pembayaran terlebih dahulu.",
        400,
        "ATTENDANCE_PAID"
      );
    }

    const { error: delErr } = await db.from("attendance").delete().eq("id", attendanceId);
    if (delErr) throw delErr;

    await logAudit(db, "admin_delete_attendance", "Admin", {
      attendanceId,
      staffName: existing.staff_name,
      date: existing.date,
      shift: existing.shift,
      reason: stringBody(body, "reason") || "Dihapus admin"
    });
    return ok({ deleted: true });
  }

  throw new HttpError("Method attendance tidak valid", 405);
}

async function adminAttendanceBulk(db: Db, body: Body) {
  const rawEntries = Array.isArray(body.entries) ? body.entries : [];
  if (rawEntries.length === 0) throw new HttpError("Tidak ada data absensi yang dikirim");
  if (rawEntries.length > 100) throw new HttpError("Maksimal 100 absen per batch");

  const staffIds = [...new Set(rawEntries.map((e: Body) => String(e.staffId)).filter(Boolean))];
  const outletIds = [...new Set(rawEntries.map((e: Body) => String(e.outletId)).filter(Boolean))];

  const [{ data: staffList, error: staffError }, { data: outletList, error: outletError }, cfg] = await Promise.all([
    db.from("staff").select("*").in("id", staffIds),
    db.from("outlets").select("*").in("id", outletIds),
    configMap(db)
  ]);
  if (staffError) throw staffError;
  if (outletError) throw outletError;

  const staffMap = new Map((staffList || []).map((s: Body) => [s.id as string, s]));
  const outletMap = new Map((outletList || []).map((o: Body) => [o.id as string, toOutlet(o)]));

  const lateTolerance = configNumber(cfg, "late_tolerance_minutes", 10);
  const deductionPerMinute = configNumber(cfg, "deduction_per_minute", configNumber(cfg, "late_deduction_per_minute", 1000));

  const results: Body[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const entry of rawEntries) {
    const staffId = String(entry.staffId || "");
    const outletId = String(entry.outletId || "");
    const date = String(entry.date || todayJakarta());
    const shift = Number(entry.shift ?? 0) as 0 | 1 | 2;

    const staff = staffMap.get(staffId);
    const outlet = outletMap.get(outletId);

    if (!staff || !outlet) {
      results.push({ staffId, staffName: String(staff?.name || staffId), status: "error", message: "Staff atau outlet tidak ditemukan" });
      errorCount++;
      continue;
    }
    if (staff.active === false || staff.deleted_at) {
      results.push({ staffId, staffName: String(staff.name || staffId), status: "error", message: "Staff tidak aktif" });
      errorCount++;
      continue;
    }
    if (outlet.active === false) {
      results.push({ staffId, staffName: String(staff.name || staffId), status: "error", message: "Outlet tidak aktif" });
      errorCount++;
      continue;
    }

    try {
      const checkin = entry.checkin_time
        ? dateTimeUtc(date, String(entry.checkin_time).slice(0, 5))
        : dateTimeUtc(date, shiftStartTime(outlet, shift));
      const checkout = entry.checkout_time ? dateTimeUtc(date, String(entry.checkout_time).slice(0, 5)) : null;

      const salary = calculateSalary(
        checkin,
        dateTimeUtc(date, shiftStartTime(outlet, shift)),
        normalizeCurrency(staff.salary_per_shift),
        lateTolerance,
        deductionPerMinute
      );

      const { data, error } = await db
        .from("attendance")
        .upsert(
          {
            staff_id: staff.id,
            staff_name: staff.name,
            outlet_id: outlet.id,
            outlet_name: outlet.name,
            date,
            shift,
            checkin_time: checkin.toISOString(),
            checkout_time: checkout?.toISOString() || null,
            final_checkin_time: checkin.toISOString(),
            status: salary.lateMinutes > 0 ? "late" : "present",
            late_minutes: salary.lateMinutes,
            deduction: salary.deduction,
            final_salary: salary.finalSalary,
            flags: "MANUAL_ADMIN"
          },
          { onConflict: "staff_id,date,shift" }
        )
        .select("*")
        .single();

      if (error) throw error;
      results.push({ staffId, staffName: String(staff.name), status: "success", attendance: data });
      successCount++;
    } catch (err) {
      results.push({ staffId, staffName: String(staff.name || staffId), status: "error", message: err instanceof Error ? err.message : "Gagal menyimpan" });
      errorCount++;
    }
  }

  await logAudit(db, "admin_bulk_attendance", "Admin", { count: rawEntries.length, successCount, errorCount });
  return ok({ results, successCount, errorCount });
}

async function adminAttendanceImportPreview(db: Db, body: Body) {
  const file = body.file || body.csv;
  if (!isCsvUpload(file)) throw new HttpError("Upload file CSV absensi terlebih dahulu", 400, "CSV_REQUIRED");
  try {
    const preview = await previewAttendanceImport(db, file, parseMapping(body.mapping));
    return ok(preview);
  } catch (err) {
    throw new HttpError(err instanceof Error ? err.message : "Gagal membaca file CSV", 400, "CSV_PREVIEW_FAILED");
  }
}

async function adminAttendanceImportCommit(db: Db, body: Body) {
  const file = body.file || body.csv;
  if (!isCsvUpload(file)) throw new HttpError("Upload file CSV absensi terlebih dahulu", 400, "CSV_REQUIRED");
  try {
    const result = await importAttendanceCsv(db, file, parseMapping(body.mapping));
    await logAudit(db, "admin_import_attendance_csv", "Admin", {
      totalRows: result.summary.totalRows,
      imported: result.summary.imported,
      failed: result.summary.failed,
      duplicate: result.summary.duplicate
    });
    return ok(result);
  } catch (err) {
    throw new HttpError(err instanceof Error ? err.message : "Gagal import file CSV", 400, "CSV_IMPORT_FAILED");
  }
}

async function adminPayroll(db: Db, method: string, body: Body) {
  if (method === "GET") {
    const [{ data: staff, error: staffError }, { data: attendance, error: attError }, { data: payments, error: payError }] =
      await Promise.all([
        db.from("staff").select("id,name,active,salary_per_shift,outlet_id").order("name"),
        db.from("attendance").select("*").order("date", { ascending: false }),
        db.from("payments").select("*").order("paid_at", { ascending: false })
      ]);
    if (staffError) throw staffError;
    if (attError) throw attError;
    if (payError) throw payError;
    const payroll = (staff || []).map((member) => {
      const rows = (attendance || []).filter((row) => row.staff_id === member.id);
      const pays = (payments || []).filter((row) => row.staff_id === member.id);
      const summary = buildPayrollSummary(rows, pays);
      return {
        ...member,
        attendance: rows,
        payments: pays,
        totalEarned: summary.totalEarned,
        totalPaid: summary.totalPaid,
        balance: summary.balance,
        summary
      };
    });
    return ok({ payroll });
  }

  if (method === "POST") {
    const preview = Boolean(body.preview);
    const staffId = stringBody(body, "staffId");
    const mode = stringBody(body, "mode") || "amount";
    if (!staffId) throw new HttpError("Staff wajib dipilih");

    const { data: staff, error: staffError } = await db.from("staff").select("id,name").eq("id", staffId).single();
    if (staffError) throw staffError;

    const { data: unpaidRows, error: rowsError } = await db
      .from("attendance")
      .select("id,date,shift,final_salary,paid_status")
      .eq("staff_id", staffId)
      .eq("paid_status", false)
      .order("date", { ascending: true })
      .order("shift", { ascending: true });
    if (rowsError) throw rowsError;

    const unpaid = (unpaidRows || []).map((row) => ({
      id: String(row.id),
      date: String(row.date),
      shift: Number(row.shift || 0),
      final_salary: normalizeCurrency(row.final_salary),
      paid_status: false
    }));

    let allocation;
    let payAmount = 0;

    if (mode === "dates") {
      const attendanceIds = Array.isArray(body.attendanceIds)
        ? body.attendanceIds.map((id) => String(id)).filter(Boolean)
        : [];
      if (!attendanceIds.length) {
        throw new HttpError("Pilih minimal satu tanggal kerja yang akan dibayar");
      }
      allocation = allocatePaymentByDates(unpaid, attendanceIds);
      if (allocation.missingIds.length) {
        throw new HttpError(
          "Beberapa shift tidak ditemukan atau sudah dibayar. Muat ulang halaman lalu coba lagi.",
          400,
          "INVALID_ATTENDANCE_IDS"
        );
      }
      if (!allocation.covered.length) {
        throw new HttpError("Tidak ada shift yang dapat dibayar");
      }
      payAmount = allocation.totalCovered;
    } else if (mode === "amount") {
      payAmount = numberBody(body, "amount");
      if (payAmount <= 0) throw new HttpError("Nominal pembayaran wajib diisi dan lebih dari 0");
      allocation = allocatePaymentByAmount(unpaid, payAmount);
      if (!allocation.covered.length) {
        throw new HttpError(
          "Nominal tidak cukup untuk menutup gaji 1 shift. Periksa daftar shift belum dibayar.",
          400,
          "INSUFFICIENT_AMOUNT"
        );
      }
    } else {
      throw new HttpError("Mode pembayaran tidak valid. Gunakan 'amount' atau 'dates'.");
    }

    const covered = allocation.covered.sort(compareAttendanceChronological);
    const dateFrom = covered[0]?.date || null;
    const dateTo = covered[covered.length - 1]?.date || null;

    if (preview) {
      return ok({
        preview: true,
        mode,
        amount: payAmount,
        allocation: {
          covered: covered.map((row) => ({
            id: row.id,
            date: row.date,
            shift: row.shift,
            final_salary: normalizeCurrency(row.final_salary)
          })),
          totalCovered: allocation.totalCovered,
          overpayment: allocation.overpayment,
          remainingUnpaidSalary: allocation.remainingUnpaidSalary,
          paidShiftCount: allocation.paidShiftCount,
          unpaidShiftCount: allocation.unpaidShiftCount
        }
      });
    }

    const proofId = crypto.randomUUID();
    const proofUrl = body.proof ? await uploadImage(db, `payments/proof/${proofId}.jpg`, body.proof) : "";
    const overpayment = allocation.overpayment;
    const modeTag = mode === "dates" ? "[MODE:tanggal]" : "[MODE:nominal]";
    const noteParts = [
      stringBody(body, "note"),
      modeTag,
      overpayment ? `[LEBIH_BAYAR:${overpayment}]` : ""
    ].filter(Boolean);
    const note = noteParts.join(" ").trim() || null;

    const { data: payment, error } = await db
      .from("payments")
      .insert({
        id: proofId,
        staff_id: staffId,
        staff_name: staff.name,
        amount: payAmount,
        date_from: dateFrom,
        date_to: dateTo,
        proof_url: proofUrl || null,
        note
      })
      .select("*")
      .single();
    if (error) throw error;

    const ids = covered.map((row) => row.id);
    const { error: updateError } = await db
      .from("attendance")
      .update({ paid_status: true, payment_id: payment.id })
      .in("id", ids);
    if (updateError) throw updateError;

    await logAudit(db, "admin_process_payment", "Admin", {
      staffId,
      mode,
      amount: payAmount,
      dateFrom,
      dateTo,
      overpayment,
      shiftCount: ids.length
    });

    return ok({
      payment,
      earned: allocation.totalCovered,
      overpayment,
      allocation: {
        coveredShiftCount: allocation.paidShiftCount,
        remainingUnpaidSalary: allocation.remainingUnpaidSalary
      }
    });
  }

  throw new HttpError("Method payroll tidak valid", 405);
}

async function activeAssignmentsForShift(db: Db, outletId: string, date: string, shift: 1 | 2) {
  const { data, error } = await db
    .from("staff_shift_assignments")
    .select("*")
    .eq("outlet_id", outletId)
    .eq("date", date)
    .in("status", [...ACTIVE_ASSIGNMENT_STATUSES])
    .in("shift_type", [shiftTypeFromShift(shift), "FULL_SHIFT"]);
  if (error) throw error;
  return data || [];
}

async function cancelMutableAssignments(db: Db, assignments: Body[], reason: string) {
  const ids = assignments.filter(isMutableAssignment).map((row) => String(row.id || "")).filter(Boolean);
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await db
    .from("staff_shift_assignments")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancel_reason: reason,
      updated_at: now
    })
    .in("id", ids);
  if (error) throw error;
}

async function cancelAdminAssignmentsForShift(db: Db, outletId: string, date: string, shift: 1 | 2, reason: string) {
  const assignments = await activeAssignmentsForShift(db, outletId, date, shift);
  const locked = assignments.find((row: Body) => !isMutableAssignment(row));
  if (locked) {
    throw new HttpError(
      "Jadwal shift ini sudah dikunci karena staff sudah absen masuk. Koreksi lewat menu Absensi.",
      400,
      "SCHEDULE_LOCKED"
    );
  }
  await cancelMutableAssignments(db, assignments as Body[], reason);
}

async function syncAdminShiftAssignment(db: Db, params: {
  outletId: string;
  date: string;
  shift: 1 | 2;
  staffId: string;
  staffName: string;
}) {
  const { outletId, date, shift, staffId, staffName } = params;
  const targetShiftType = shiftTypeFromShift(shift);
  const now = new Date().toISOString();

  const { data: checkedIn, error: checkedInError } = await db
    .from("attendance")
    .select("id,shift")
    .eq("staff_id", staffId)
    .eq("date", date)
    .not("checkin_time", "is", null)
    .limit(1);
  if (checkedInError) throw checkedInError;
  if ((checkedIn || []).length > 0) {
    throw new HttpError(
      "Staff sudah absen masuk pada tanggal ini. Koreksi shift lewat menu Absensi agar gaji ikut dihitung ulang.",
      400,
      "SCHEDULE_LOCKED"
    );
  }

  const { data: staffAssignments, error: staffAssignmentError } = await db
    .from("staff_shift_assignments")
    .select("*")
    .eq("staff_id", staffId)
    .eq("date", date)
    .in("status", [...ACTIVE_ASSIGNMENT_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(1);
  if (staffAssignmentError) throw staffAssignmentError;
  const existingStaffAssignment = (staffAssignments || [])[0] as Body | undefined;
  if (existingStaffAssignment && !isMutableAssignment(existingStaffAssignment)) {
    throw new HttpError(
      "Jadwal staff ini sudah dikunci karena sudah absen masuk. Koreksi lewat menu Absensi.",
      400,
      "SCHEDULE_LOCKED"
    );
  }

  const slotAssignments = await activeAssignmentsForShift(db, outletId, date, shift);
  const lockedSlot = (slotAssignments as Body[]).find((row) => row.staff_id !== staffId && !isMutableAssignment(row));
  if (lockedSlot) {
    throw new HttpError(
      "Shift ini sudah dikunci oleh absensi staff lain. Koreksi lewat menu Absensi.",
      400,
      "SCHEDULE_LOCKED"
    );
  }
  await cancelMutableAssignments(
    db,
    (slotAssignments as Body[]).filter((row) => row.staff_id !== staffId),
    "Ditimpa assignment admin"
  );

  const payload: Body = {
    outlet_id: outletId,
    staff_id: staffId,
    staff_name: staffName,
    date,
    shift_type: targetShiftType,
    status: "admin_override",
    source: "admin",
    requested_at: now,
    confirmed_at: now,
    cancelled_at: null,
    cancel_reason: null,
    updated_at: now,
    created_by: "Admin"
  };

  if (existingStaffAssignment) {
    const { data, error } = await db
      .from("staff_shift_assignments")
      .update(payload)
      .eq("id", existingStaffAssignment.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db
    .from("staff_shift_assignments")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function adminSchedule(db: Db, method: string, body: Body) {
  if (method === "GET") {
    const outletId = stringBody(body, "outletId");
    const dateFrom = stringBody(body, "dateFrom") || stringBody(body, "weekStart") || todayJakarta();
    const dateTo = stringBody(body, "dateTo") || addDays(dateFrom, 6);
    if (outletId) return weeklySchedule(db, outletId, dateFrom, dateTo);
    const { data, error } = await db
      .from("shift_schedule")
      .select("*")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date");
    if (error) throw error;
    return ok({ schedules: data || [], dateFrom, dateTo });
  }

  if (method === "POST" || method === "PUT") {
    const outletId = stringBody(body, "outletId");
    const date = stringBody(body, "date");
    const shift = Number(body.shift) as 1 | 2;
    if (!outletId || !date || ![1, 2].includes(shift)) throw new HttpError("Outlet, tanggal, dan shift wajib diisi");
    const { data: outlet, error: outletError } = await db.from("outlets").select("shift_mode,active").eq("id", outletId).single();
    if (outletError) throw outletError;
    assertOperationalOutlet(outlet, "Jadwal shift hanya untuk outlet aktif");
    if (Number(outlet.shift_mode) !== 2) throw new HttpError("Jadwal shift hanya untuk outlet 2 shift");

    if (body.status === "off") {
      // Prevent both shifts from being off on the same date
      const otherShift = shift === 1 ? 2 : 1;
      const { data: otherOff } = await db
        .from("shift_dayoff")
        .select("id")
        .eq("outlet_id", outletId)
        .eq("date", date)
        .eq("shift", otherShift)
        .maybeSingle();
      if (otherOff) {
        throw new HttpError(
          "Tidak bisa meliburkan kedua shift pada tanggal yang sama. Minimal satu shift harus aktif.",
          400,
          "BOTH_SHIFTS_OFF"
        );
      }
      await cancelAdminAssignmentsForShift(db, outletId, date, shift, "Shift ditandai libur admin");

      const { data, error } = await db
        .from("shift_schedule")
        .upsert(
          {
            outlet_id: outletId,
            date,
            shift,
            staff_id: null,
            staff_name: null,
            status: "off",
            created_by: "admin",
            note: stringBody(body, "note") || null
          },
          { onConflict: "outlet_id,date,shift" }
        )
        .select("*")
        .single();
      if (error) throw error;
      await db.from("shift_dayoff").upsert({ outlet_id: outletId, date, shift }, { onConflict: "outlet_id,date,shift" });
      await logAudit(db, "admin_schedule_off", "Admin", { outletId, date, shift });
      return ok({ schedule: data });
    }

    const staffId = stringBody(body, "staffId");
    if (!staffId && body.forceCancel !== true && body.forceCancel !== "true") throw new HttpError("Staff wajib dipilih");
    let staffName: string | null = null;
    if (staffId) {
      const { data: staff, error: staffError } = await db.from("staff").select("id,name,active,deleted_at").eq("id", staffId).single();
      if (staffError) throw staffError;
      assertOperationalStaff(staff, "Jadwal hanya bisa di-assign ke staff aktif.");
      staffName = staff.name;
    }
    let assignment: Body | null = null;
    if (staffId && staffName) {
      assignment = await syncAdminShiftAssignment(db, { outletId, date, shift, staffId, staffName });
    } else {
      await cancelAdminAssignmentsForShift(db, outletId, date, shift, stringBody(body, "cancel_reason", "Dibatalkan admin"));
    }
    const status = staffId ? "claimed" : "open";
    const { data, error } = await db
      .from("shift_schedule")
      .upsert(
        {
          outlet_id: outletId,
          date,
          shift,
          staff_id: staffId || null,
          staff_name: staffName,
          status,
          requested_at: staffId ? new Date().toISOString() : null,
          cancelled_at: staffId ? null : new Date().toISOString(),
          cancel_reason: staffId ? null : stringBody(body, "cancel_reason", "Dibatalkan admin"),
          created_by: "admin"
        },
        { onConflict: "outlet_id,date,shift" }
      )
      .select("*")
      .single();
    if (error) throw error;
    await db.from("shift_dayoff").delete().eq("outlet_id", outletId).eq("date", date).eq("shift", shift);
    await logAudit(db, "admin_override_schedule", "Admin", { outletId, date, shift, staffId });
    return ok({ schedule: data, assignment });
  }

  if (method === "DELETE") {
    const scheduleId = stringBody(body, "scheduleId") || stringBody(body, "id");
    if (!scheduleId) throw new HttpError("Schedule ID wajib diisi");
    const { error } = await db.from("shift_schedule").delete().eq("id", scheduleId);
    if (error) throw error;
    await logAudit(db, "admin_delete_schedule", "Admin", { scheduleId });
    return ok({ deleted: true });
  }

  throw new HttpError("Method schedule tidak valid", 405);
}

async function adminLeave(db: Db, method: string, body: Body) {
  if (method === "GET") {
    // Join dengan outlets agar admin bisa lihat nama outlet tanpa query tambahan
    let query = db
      .from("leave_requests")
      .select("*, outlets(name)")
      .order("created_at", { ascending: false });
    if (body.staffId) query = query.eq("staff_id", body.staffId);
    if (body.outletId) query = query.eq("outlet_id", body.outletId);
    if (body.status) query = query.eq("status", body.status);
    if (body.dateFrom) query = query.gte("date", body.dateFrom);
    if (body.dateTo) query = query.lte("date", body.dateTo);
    const { data, error } = await query.limit(500);
    if (error) throw error;
    // Flatten nama outlet dari join agar frontend tidak perlu nested access
    const leaves = (data || []).map((l: any) => ({
      id: l.id,
      outlet_id: l.outlet_id,
      outlet_name: l.outlets?.name || l.outlet_name || "—",
      staff_id: l.staff_id,
      staff_name: l.staff_name,
      date: l.date,
      status: l.status,
      reason: l.reason || null,
      admin_note: l.admin_note || null,
      created_at: l.created_at,
      cancelled_at: l.cancelled_at || null,
      rejected_at: l.rejected_at || null
    }));
    return ok({ leaves });
  }

  if (method === "PUT" || method === "POST") {
    const leaveId = stringBody(body, "leaveId") || stringBody(body, "id");
    const status = stringBody(body, "status", "approved");
    if (!leaveId) throw new HttpError("Leave ID wajib diisi");
    if (!["approved", "cancelled", "pending", "rejected"].includes(status)) {
      throw new HttpError("Status cuti tidak valid");
    }

    const { data: leave, error: leaveError } = await db
      .from("leave_requests")
      .select("*")
      .eq("id", leaveId)
      .single();
    if (leaveError) throw leaveError;

    const now = new Date();
    const adminNote = stringBody(body, "note") || null;

    // Bangun payload update berdasarkan status baru
    const updatePayload: Body = {
      status,
      admin_note: adminNote,
      // Reset kolom timestamp yang tidak relevan
      cancelled_at: status === "cancelled" ? now.toISOString() : null,
      rejected_at: status === "rejected" ? now.toISOString() : null
    };

    const { data, error } = await db
      .from("leave_requests")
      .update(updatePayload)
      .eq("id", leaveId)
      .select("*")
      .single();
    if (error) throw error;

    // Jika disetujui: batalkan shift & assignment yang konflik
    if (status === "approved") {
      await db
        .from("shift_schedule")
        .update({
          staff_id: null,
          staff_name: null,
          status: "open",
          cancelled_at: now.toISOString(),
          cancel_reason: "Cuti disetujui admin"
        })
        .eq("staff_id", leave.staff_id)
        .eq("date", leave.date);
      await db
        .from("staff_shift_assignments")
        .update({
          status: "cancelled",
          cancelled_at: now.toISOString(),
          cancel_reason: "Cuti disetujui admin",
          updated_at: now.toISOString()
        })
        .eq("staff_id", leave.staff_id)
        .eq("date", leave.date)
        .in("status", ["confirmed", "admin_override", "auto_cover"]);
    }

    await logAudit(db, "admin_update_leave", "Admin", { leaveId, status, adminNote });

    // Kirim email notifikasi ke staff untuk keputusan approved / rejected / cancelled
    let emailSent = false;
    if (status === "approved" || status === "rejected" || status === "cancelled") {
      const [{ data: outletRow }, cfg] = await Promise.all([
        db.from("outlets").select("name").eq("id", leave.outlet_id).maybeSingle(),
        configMap(db)
      ]);
      emailSent = await notifySafely(db, "email_leave_decision_failed", "Admin", () =>
        sendLeaveDecisionEmail(db, {
          leaveId,
          staffId: leave.staff_id,
          staffName: leave.staff_name,
          outletId: leave.outlet_id,
          outletName: outletRow?.name || "Outlet",
          leaveDate: leave.date,
          approved: status === "approved",
          adminNote,
          to: cfg.notification_email || process.env.NOTIFICATION_EMAIL || ""
        })
      );
    }

    return ok({ leave: data, emailSent });
  }

  throw new HttpError("Method leave tidak valid", 405);
}

async function adminReports(db: Db, body: Body) {
  let query = db.from("reports").select("*").order("submitted_at", { ascending: false });
  if (body.outletId) query = query.eq("outlet_id", body.outletId);
  if (body.staffId) query = query.eq("staff_id", body.staffId);
  if (body.type) query = query.eq("type", String(body.type).toUpperCase());
  if (body.date) query = query.eq("date", body.date);
  if (body.dateFrom) query = query.gte("date", body.dateFrom);
  if (body.dateTo) query = query.lte("date", body.dateTo);
  const { data, error } = await query.limit(500);
  if (error) throw error;
  return ok({ reports: data || [] });
}

async function adminEmail(db: Db, method: string, body: Body) {
  if (method === "GET") {
    const [cfg, logsResult] = await Promise.all([
      configMap(db),
      listEmailLogs(db, numberBody(body, "limit", 30))
    ]);
    return ok({
      config: {
        notification_email: cfg.notification_email || process.env.NOTIFICATION_EMAIL || "",
        test_notification_email:
          cfg.test_notification_email || cfg.notification_email || process.env.TEST_NOTIFICATION_EMAIL || process.env.NOTIFICATION_EMAIL || ""
      },
      notificationTypes: EMAIL_NOTIFICATION_TYPES,
      logs: logsResult.logs,
      logsUnavailable: logsResult.unavailable
    });
  }

  if (method === "PUT") {
    const testEmail = stringBody(body, "test_notification_email") || stringBody(body, "testEmail");
    if (!isValidEmailList(testEmail)) throw new HttpError("Format email tujuan test tidak valid", 400, "INVALID_EMAIL");
    const { error } = await db.from("config").upsert({ key: "test_notification_email", value: testEmail });
    if (error) throw error;
    await logAudit(db, "admin_update_test_email", "Admin", { testEmail });
    return ok({ saved: true, test_notification_email: testEmail });
  }

  if (method === "POST") {
    const action = stringBody(body, "action", "test");

    if (action === "retry") {
      const logId = stringBody(body, "logId") || stringBody(body, "id");
      if (!logId) throw new HttpError("Log email wajib dipilih", 400, "EMAIL_LOG_REQUIRED");
      const log = await retryEmailLog(db, logId);
      await logAudit(db, "admin_retry_email", "Admin", { logId, status: log.status });
      return ok({ log, message: `Email berhasil dikirim ulang ke ${log.recipient}.` });
    }

    const type = stringBody(body, "type");
    if (!isEmailNotificationType(type)) {
      throw new HttpError("Jenis email test tidak valid", 400, "INVALID_EMAIL_TYPE");
    }
    const cfg = await configMap(db);
    const to = stringBody(body, "to") || cfg.test_notification_email || cfg.notification_email || process.env.TEST_NOTIFICATION_EMAIL || process.env.NOTIFICATION_EMAIL || "";
    if (!isValidEmailList(to)) throw new HttpError("Format email tujuan test tidak valid", 400, "INVALID_EMAIL");

    await sendTestEmailNotification(db, type, to);
    await logAudit(db, "admin_send_test_email", "Admin", { type, to });
    return ok({ message: `Email test berhasil dikirim ke ${to}.` });
  }

  throw new HttpError("Method email tidak valid", 405);
}

async function adminReportCfg(db: Db, method: string, body: Body) {
  if (method === "GET") {
    const outletId = stringBody(body, "outletId");
    if (!outletId) throw new HttpError("Outlet wajib dipilih");
    const type = body.type ? reportType(body) : undefined;
    let query = db.from("report_cfg").select("*").eq("outlet_id", outletId).order("sort_order");
    if (type) query = query.eq("type", type);
    const { data, error } = await query;
    if (error) throw error;
    return ok({ items: data || [] });
  }

  const outletId = stringBody(body, "outletId");
  const type = reportType(body);
  if (!outletId) throw new HttpError("Outlet wajib dipilih");
  const { data: outletRow, error: outletError } = await db.from("outlets").select("id,active").eq("id", outletId).single();
  if (outletError) throw outletError;
  assertOperationalOutlet(outletRow, "Konfigurasi laporan hanya bisa diubah untuk outlet aktif.");

  if (method === "POST") {
    const isBatchMode = Array.isArray(body.items);

    if (isBatchMode) {
      // Explicit clear operation — separate from normal save
      if (body.clearAll === true || body.clearAll === "true") {
        const { error: delErr } = await db.from("report_cfg").delete().eq("outlet_id", outletId).eq("type", type);
        if (delErr) throw delErr;
        await logAudit(db, "admin_clear_report_cfg", "Admin", { outletId, type });
        return ok({ items: [], cleared: true });
      }

      const items = parseItems(body.items);
      if (items.length === 0) {
        throw new HttpError(
          "Tidak bisa menyimpan tanpa item. Gunakan tombol 'Kosongkan Konfigurasi' untuk menghapus semua item.",
          400,
          "EMPTY_ITEMS"
        );
      }

      // Step 1: Validate ALL labels before any DB write
      const seenLabels = new Set<string>();
      for (const [index, item] of items.entries()) {
        const label = String(item.label || "").trim();
        if (label.length < 2) {
          throw new HttpError(`Item ${index + 1}: label wajib diisi (minimal 2 karakter)`, 400, "INVALID_LABEL");
        }
        if (label.length > 80) {
          throw new HttpError(`Item ${index + 1}: label terlalu panjang (maksimal 80 karakter)`, 400, "INVALID_LABEL");
        }
        const normalized = label.toLowerCase();
        if (seenLabels.has(normalized)) {
          throw new HttpError(`Label "${label}" duplikat — setiap label harus unik`, 400, "DUPLICATE_LABEL");
        }
        seenLabels.add(normalized);
      }

      // Step 2: Upload images (after validation)
      const payload = [];
      for (const [index, item] of items.entries()) {
        const label = String(item.label || "").trim();
        const existingExampleUrl =
          typeof item.example_photo_url === "string" && !item.example_photo_url.startsWith("data:")
            ? item.example_photo_url
            : null;
        const uploadedExampleUrl = item.example_photo
          ? await uploadImage(db, `reports/examples/${outletId}/${type}/${crypto.randomUUID()}.jpg`, item.example_photo)
          : "";
        const rawMode = String(item.photo_mode || "realtime");
        const photoMode = rawMode === "upload" ? "upload" : "realtime";
        payload.push({
          outlet_id: outletId,
          type,
          label,
          required: item.required !== false,
          example_photo_url: uploadedExampleUrl || existingExampleUrl,
          sort_order: Number(item.sort_order ?? index),
          photo_mode: photoMode
        });
      }

      // Step 3: Delete old, then insert new (only after validation + upload succeed)
      const { error: deleteError } = await db.from("report_cfg").delete().eq("outlet_id", outletId).eq("type", type);
      if (deleteError) throw deleteError;
      const { data, error } = await db.from("report_cfg").insert(payload).select("*").order("sort_order");
      if (error) throw error;
      await logAudit(db, "admin_save_report_cfg", "Admin", { outletId, type, count: payload.length });
      return ok({ items: data || [] });
    }

    // Single item insert
    const label = stringBody(body, "label");
    if (label.length < 2) throw new HttpError("Label wajib diisi (minimal 2 karakter)", 400, "INVALID_LABEL");
    if (label.length > 80) throw new HttpError("Label terlalu panjang (maksimal 80 karakter)", 400, "INVALID_LABEL");
    const singleMode = String(body.photo_mode || "realtime") === "upload" ? "upload" : "realtime";
    const { data, error } = await db
      .from("report_cfg")
      .insert({
        outlet_id: outletId,
        type,
        label,
        required: body.required === undefined ? true : body.required === true || body.required === "true",
        example_photo_url: body.example_photo
          ? await uploadImage(db, `reports/examples/${outletId}/${type}/${crypto.randomUUID()}.jpg`, body.example_photo)
          : stringBody(body, "example_photo_url") || null,
        sort_order: numberBody(body, "sort_order", 0),
        photo_mode: singleMode
      })
      .select("*")
      .single();
    if (error) throw error;
    await logAudit(db, "admin_add_report_cfg", "Admin", { outletId, type, label: data.label });
    return ok({ item: data });
  }

  if (method === "PUT") {
    const id = stringBody(body, "id");
    if (!id) throw new HttpError("ID konfigurasi wajib diisi");
    const updates: Body = {};
    if (body.label !== undefined) {
      const label = String(body.label || "").trim();
      if (label.length < 2) throw new HttpError("Label wajib diisi (minimal 2 karakter)", 400, "INVALID_LABEL");
      if (label.length > 80) throw new HttpError("Label terlalu panjang (maksimal 80 karakter)", 400, "INVALID_LABEL");
      updates.label = label;
    }
    ["required", "sort_order", "example_photo_url"].forEach((key) => {
      if (body[key] !== undefined) updates[key] = body[key];
    });
    if (body.photo_mode !== undefined) {
      updates.photo_mode = String(body.photo_mode) === "upload" ? "upload" : "realtime";
    }
    if (body.example_photo) updates.example_photo_url = await uploadImage(db, `reports/examples/${outletId}/${type}/${id}.jpg`, body.example_photo);
    const { data, error } = await db.from("report_cfg").update(updates).eq("id", id).select("*").single();
    if (error) throw error;
    await logAudit(db, "admin_update_report_cfg", "Admin", { id });
    return ok({ item: data });
  }

  if (method === "DELETE") {
    const id = stringBody(body, "id");
    if (!id) throw new HttpError("ID konfigurasi wajib diisi");
    const { error } = await db.from("report_cfg").delete().eq("id", id);
    if (error) throw error;
    await logAudit(db, "admin_delete_report_cfg", "Admin", { id });
    return ok({ deleted: true });
  }

  throw new HttpError("Method report config tidak valid", 405);
}

async function adminDayoff(db: Db, method: string, body: Body) {
  if (method === "GET") {
    let query = db.from("shift_dayoff").select("*").order("date");
    if (body.outletId) query = query.eq("outlet_id", body.outletId);
    if (body.dateFrom) query = query.gte("date", body.dateFrom);
    if (body.dateTo) query = query.lte("date", body.dateTo);
    const { data, error } = await query;
    if (error) throw error;
    return ok({ dayoff: data || [] });
  }

  if (method === "POST") {
    const outletId = stringBody(body, "outletId");
    const dateFrom = stringBody(body, "dateFrom") || stringBody(body, "date");
    const dateTo = stringBody(body, "dateTo") || dateFrom;
    const shifts = body.shifts ? parseItems(body.shifts) : [Number(body.shift || 1)];
    if (!outletId || !dateFrom) throw new HttpError("Outlet dan tanggal wajib diisi");
    const { data: outlet, error: outletError } = await db.from("outlets").select("shift_mode,active").eq("id", outletId).single();
    if (outletError) throw outletError;
    assertOperationalOutlet(outlet, "Hari libur shift hanya untuk outlet aktif.");
    if (Number(outlet.shift_mode) !== 2) throw new HttpError("Hari libur shift hanya untuk outlet 2 shift");
    const payload: { outlet_id: string; date: string; shift: number }[] = [];
    for (let date = dateFrom; date <= dateTo; date = addDays(date, 1)) {
      for (const shift of shifts) {
        if ([1, 2].includes(Number(shift))) payload.push({ outlet_id: outletId, date, shift: Number(shift) });
      }
      if (payload.length > 366 * 2) break;
    }
    const requestedShiftsByDate = new Map<string, Set<number>>();
    payload.forEach((item) => {
      const set = requestedShiftsByDate.get(item.date) || new Set<number>();
      set.add(item.shift);
      requestedShiftsByDate.set(item.date, set);
    });
    const selfConflictDates = [...requestedShiftsByDate.entries()]
      .filter(([, requestedShifts]) => requestedShifts.has(1) && requestedShifts.has(2))
      .map(([date]) => date);
    if (selfConflictDates.length > 0) {
      throw new HttpError(
        `Tidak bisa meliburkan kedua shift pada tanggal yang sama: ${selfConflictDates.join(", ")}`,
        400,
        "BOTH_SHIFTS_OFF"
      );
    }

    // Prevent making both shifts off on any date in the range
    const otherShiftNums = [...new Set(payload.map((item) => (item.shift === 1 ? 2 : 1)))];
    const { data: conflicting } = await db
      .from("shift_dayoff")
      .select("date,shift")
      .eq("outlet_id", outletId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .in("shift", otherShiftNums);
    const conflictDates = new Set((conflicting || []).map((item: any) => item.date as string));
    const failedDates = payload.filter((item) => conflictDates.has(item.date)).map((item) => item.date);
    const validPayload = payload.filter((item) => !conflictDates.has(item.date));

    if (failedDates.length > 0 && validPayload.length === 0) {
      throw new HttpError(
        `Tidak bisa meliburkan kedua shift. Semua tanggal ditolak karena shift lain sudah libur: ${[...new Set(failedDates)].join(", ")}`,
        400,
        "BOTH_SHIFTS_OFF"
      );
    }

    if (!validPayload.length) {
      return ok({ dayoff: [], skipped: failedDates });
    }

    const { data, error } = await db.from("shift_dayoff").upsert(validPayload, { onConflict: "outlet_id,date,shift" }).select("*");
    if (error) throw error;
    await logAudit(db, "admin_dayoff_add", "Admin", { outletId, dateFrom, dateTo, count: validPayload.length, skipped: failedDates.length });
    return ok({ dayoff: data || [], skipped: failedDates });
  }

  if (method === "DELETE") {
    const id = stringBody(body, "id");
    const outletId = stringBody(body, "outletId");
    if (id) {
      const { error } = await db.from("shift_dayoff").delete().eq("id", id);
      if (error) throw error;
      return ok({ deleted: true });
    }
    const date = stringBody(body, "date");
    const shift = Number(body.shift || 0);
    if (!outletId || !date || ![1, 2].includes(shift)) throw new HttpError("Outlet, tanggal, dan shift wajib diisi");
    const { error } = await db
      .from("shift_dayoff")
      .delete()
      .eq("outlet_id", outletId)
      .eq("date", date)
      .eq("shift", shift);
    if (error) throw error;
    await logAudit(db, "admin_dayoff_delete", "Admin", { outletId, date, shift });
    return ok({ deleted: true });
  }

  throw new HttpError("Method dayoff tidak valid", 405);
}

async function adminConfig(db: Db, method: string, body: Body) {
  if (method === "GET") {
    return ok({ config: await configMap(db) });
  }

  if (method === "PUT") {
    const entries: { key: string; value: string }[] = [];
    if (body.key) {
      const key = stringBody(body, "key");
      let value = stringBody(body, "value");
      if (key === "admin_pin" || key === "admin_pin_hash") {
        if (key === "admin_pin" && value.length < 4) throw new HttpError("PIN admin minimal 4 digit");
        entries.push({ key: "admin_pin_hash", value: key === "admin_pin" ? hashPin(value) : value });
      } else {
        entries.push({ key, value });
      }
    } else {
      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null) entries.push({ key, value: String(value) });
      });
    }
    if (!entries.length) throw new HttpError("Tidak ada konfigurasi yang dikirim");
    const { error } = await db.from("config").upsert(entries);
    if (error) throw error;
    await logAudit(db, "admin_update_config", "Admin", entries.map((entry) => entry.key).join(","));
    return ok({ config: await configMap(db) });
  }

  throw new HttpError("Method config tidak valid", 405);
}

// ─── PRD §8.1 — Staff memilih jadwal (SHIFT_1 / SHIFT_2 / FULL_SHIFT) ──────

async function selectShift(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan", 400, "NO_OUTLET");

  const date = stringBody(body, "date");
  const shiftTypeRaw = stringBody(body, "shiftType").toUpperCase();
  if (!date) throw new HttpError("Tanggal wajib diisi");
  if (!["SHIFT_1", "SHIFT_2", "FULL_SHIFT"].includes(shiftTypeRaw)) {
    throw new HttpError("Tipe shift tidak valid. Pilih: SHIFT_1, SHIFT_2, atau FULL_SHIFT", 400, "INVALID_SHIFT_TYPE");
  }
  const shiftType = shiftTypeRaw as "SHIFT_1" | "SHIFT_2" | "FULL_SHIFT";

  if (Number(outlet.shift_mode) === 1 && shiftType !== "FULL_SHIFT") {
    throw new HttpError("Outlet ini hanya menggunakan Full Shift", 400, "INVALID_SHIFT_TYPE");
  }

  if (date <= todayJakarta()) {
    throw new HttpError(
      "Jadwal hanya bisa diatur H-1 (sehari sebelumnya). Untuk perubahan mendadak, hubungi admin.",
      400, "DEADLINE_PASSED"
    );
  }

  // Cek staff dayoff
  const { data: dayoff } = await db
    .from("staff_dayoff")
    .select("id")
    .eq("staff_id", staff.id)
    .eq("date", date)
    .eq("status", "active")
    .maybeSingle();
  if (dayoff) throw new HttpError("Kamu sedang libur pada tanggal ini", 400, "STAFF_DAYOFF");

  // Cek sudah punya assignment aktif
  const { data: existing } = await db
    .from("staff_shift_assignments")
    .select("id,shift_type")
    .eq("staff_id", staff.id)
    .eq("date", date)
    .in("status", ["confirmed", "admin_override", "auto_cover", "locked", "completed"])
    .maybeSingle();
  if (existing) {
    throw new HttpError(
      `Kamu sudah memiliki jadwal ${existing.shift_type} untuk tanggal ini`,
      409,
      "ALREADY_SCHEDULED"
    );
  }

  // Cek konflik slot Shift 1
  if (shiftType === "SHIFT_1" || shiftType === "FULL_SHIFT") {
    const { data: shift1Taken } = await db
      .from("staff_shift_assignments")
      .select("id,staff_name")
      .eq("outlet_id", outlet.id)
      .eq("date", date)
      .in("status", ["confirmed", "admin_override", "auto_cover", "locked", "completed"])
      .in("shift_type", ["SHIFT_1", "FULL_SHIFT"])
      .maybeSingle();
    if (shift1Taken) {
      throw new HttpError(
        `Shift 1 sudah diambil ${shift1Taken.staff_name}. Pilih shift lain atau hubungi admin.`,
        409,
        "SHIFT_TAKEN"
      );
    }
  }

  // Cek konflik slot Shift 2
  if (shiftType === "SHIFT_2" || shiftType === "FULL_SHIFT") {
    const { data: shift2Taken } = await db
      .from("staff_shift_assignments")
      .select("id,staff_name")
      .eq("outlet_id", outlet.id)
      .eq("date", date)
      .in("status", ["confirmed", "admin_override", "auto_cover", "locked", "completed"])
      .in("shift_type", ["SHIFT_2", "FULL_SHIFT"])
      .maybeSingle();
    if (shift2Taken) {
      throw new HttpError(
        `Shift 2 sudah diambil ${shift2Taken.staff_name}. Pilih shift lain atau hubungi admin.`,
        409,
        "SHIFT_TAKEN"
      );
    }
  }

  const now = new Date();
  const { data: assignment, error } = await db
    .from("staff_shift_assignments")
    .insert({
      outlet_id: outlet.id,
      staff_id: staff.id,
      staff_name: staff.name,
      date,
      shift_type: shiftType,
      status: "confirmed",
      source: "staff",
      requested_at: now.toISOString(),
      confirmed_at: now.toISOString(),
      created_by: staff.name
    })
    .select("*")
    .single();
  if (error) throw error;

  await logAudit(db, "schedule_select", staff.name, { date, shiftType, assignmentId: assignment.id });
  return ok({ assignment });
}

async function cancelAssignment(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  const assignmentId = stringBody(body, "assignmentId");
  if (!assignmentId) throw new HttpError("Assignment ID wajib diisi");

  const { staff } = await getStaffWithOutlet(db, session.sub);
  const { data: assignment, error: fetchError } = await db
    .from("staff_shift_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!assignment || assignment.staff_id !== staff.id) {
    throw new HttpError("Jadwal tidak ditemukan", 404, "NOT_FOUND");
  }
  if (assignment.status === "locked" || assignment.status === "completed") {
    throw new HttpError(
      "Jadwal sudah dikunci karena kamu sudah absen masuk. Hubungi admin untuk koreksi.",
      400,
      "SCHEDULE_LOCKED"
    );
  }

  if (assignment.date <= todayJakarta()) {
    throw new HttpError(
      "Pembatalan jadwal hanya bisa dilakukan H-1 (sehari sebelumnya). Untuk perubahan mendadak, hubungi admin.",
      400, "DEADLINE_PASSED"
    );
  }

  const { data: updated, error } = await db
    .from("staff_shift_assignments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: stringBody(body, "reason", "Dibatalkan staff"),
      updated_at: new Date().toISOString()
    })
    .eq("id", assignmentId)
    .select("*")
    .single();
  if (error) throw error;

  await logAudit(db, "schedule_cancel_assignment", staff.name, { assignmentId, date: assignment.date });
  return ok({ assignment: updated });
}

// ─── PRD §8.3 — Delete staff aman dengan dependency check ────────────────

async function getStaffDeleteDependencies(db: Db, staffId: string) {
  const [
    { count: attCount },
    { count: repCount },
    { count: payCount },
    { count: schedCount },
    { count: leaveCount },
    { count: schedV1Count },
    { count: sdCount }
  ] = await Promise.all([
    db.from("attendance").select("id", { count: "exact", head: true }).eq("staff_id", staffId),
    db.from("reports").select("id", { count: "exact", head: true }).eq("staff_id", staffId),
    db.from("payments").select("id", { count: "exact", head: true }).eq("staff_id", staffId),
    db.from("staff_shift_assignments").select("id", { count: "exact", head: true }).eq("staff_id", staffId),
    db.from("leave_requests").select("id", { count: "exact", head: true }).eq("staff_id", staffId),
    // shift_schedule dan staff_dayoff juga punya FK ke staff(id) tanpa CASCADE —
    // harus dihitung agar hard delete tidak gagal dengan FK constraint error.
    db.from("shift_schedule").select("id", { count: "exact", head: true }).eq("staff_id", staffId),
    db.from("staff_dayoff").select("id", { count: "exact", head: true }).eq("staff_id", staffId)
  ]);
  const attendanceCount = attCount ?? 0;
  const reportCount = repCount ?? 0;
  const paymentCount = payCount ?? 0;
  const scheduleCount = schedCount ?? 0;
  const leaveCount2 = leaveCount ?? 0;
  const shiftScheduleCount = schedV1Count ?? 0;
  const staffDayoffCount = sdCount ?? 0;
  const totalDependencies = attendanceCount + reportCount + paymentCount + scheduleCount + leaveCount2 + shiftScheduleCount + staffDayoffCount;
  return {
    attendanceCount,
    reportCount,
    paymentCount,
    scheduleCount,
    leaveCount: leaveCount2,
    shiftScheduleCount,
    staffDayoffCount,
    totalDependencies,
    canHardDelete: totalDependencies === 0
  };
}

async function adminStaffDeletePreview(db: Db, body: Body) {
  const staffId = stringBody(body, "staffId") || stringBody(body, "id");
  if (!staffId) throw new HttpError("Staff ID wajib diisi");
  const { data: staffRow } = await db.from("staff").select("name").eq("id", staffId).maybeSingle();
  if (!staffRow) throw new HttpError("Staff tidak ditemukan", 404, "STAFF_NOT_FOUND");
  const deps = await getStaffDeleteDependencies(db, staffId);
  return ok({ staffId, staffName: staffRow.name, ...deps });
}

// ─── PRD §8.4 — Hari libur berbasis nama staff ───────────────────────────

async function adminStaffDayoff(db: Db, method: string, body: Body) {
  if (method === "GET") {
    let query = db.from("staff_dayoff").select("*, staff(name,outlet_id)").order("date");
    if (body.outletId) query = query.eq("outlet_id", body.outletId);
    if (body.staffId) query = query.eq("staff_id", body.staffId);
    if (body.dateFrom) query = query.gte("date", body.dateFrom);
    if (body.dateTo) query = query.lte("date", body.dateTo);
    if (body.status) query = query.eq("status", body.status);
    else query = query.eq("status", "active");
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return ok({ dayoff: data || [] });
  }

  if (method === "POST") {
    const outletId = stringBody(body, "outletId");
    const staffId = stringBody(body, "staffId");
    const date = stringBody(body, "date");
    const reason = stringBody(body, "reason") || null;
    if (!outletId || !staffId || !date) throw new HttpError("Outlet, staff, dan tanggal wajib diisi");

    const [{ data: staffRow }, { data: outletRow, error: outletError }] = await Promise.all([
      db
        .from("staff")
        .select("id,name,outlet_id,active,deleted_at")
        .eq("id", staffId)
        .maybeSingle(),
      db.from("outlets").select("id,active").eq("id", outletId).single()
    ]);
    if (outletError) throw outletError;
    assertOperationalOutlet(outletRow, "Libur staff hanya bisa dibuat untuk outlet aktif.");
    if (!staffRow || !staffRow.active) {
      throw new HttpError("Staff tidak ditemukan atau tidak aktif", 404, "STAFF_NOT_FOUND");
    }
    assertOperationalStaff(staffRow, "Libur staff hanya bisa dibuat untuk staff aktif.");
    if (staffRow.outlet_id !== outletId) {
      throw new HttpError("Staff tidak terdaftar di outlet yang dipilih", 400, "STAFF_OUTLET_MISMATCH");
    }

    // Tolak jika staff sudah check-in
    const { data: checkedIn } = await db
      .from("attendance")
      .select("id")
      .eq("staff_id", staffId)
      .eq("date", date)
      .not("checkin_time", "is", null)
      .maybeSingle();
    if (checkedIn) {
      throw new HttpError(
        "Staff sudah absen masuk pada tanggal ini. Jadwal tidak bisa diubah.",
        400,
        "SCHEDULE_LOCKED"
      );
    }

    // Batalkan assignment aktif pada tanggal tersebut
    await db
      .from("staff_shift_assignments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Libur diset admin",
        updated_at: new Date().toISOString()
      })
      .eq("staff_id", staffId)
      .eq("date", date)
      .in("status", ["confirmed", "admin_override", "auto_cover"]);

    const { data: dayoff, error } = await db
      .from("staff_dayoff")
      .upsert(
        {
          outlet_id: outletId,
          staff_id: staffId,
          staff_name: staffRow.name,
          date,
          status: "active",
          source: "admin",
          reason,
          created_by: "Admin"
        },
        { onConflict: "staff_id,date" }
      )
      .select("*")
      .single();
    if (error) throw error;

    // Auto coverage
    const coverage = await computeAutoCoverage(db, outletId, date, staffId);

    await logAudit(db, "admin_staff_dayoff_set", "Admin", {
      staffId,
      staffName: staffRow.name,
      date,
      outletId,
      coverage: coverage.action
    });
    return ok({ dayoff, coverage });
  }

  if (method === "DELETE") {
    const id = stringBody(body, "id");
    if (!id) throw new HttpError("ID dayoff wajib diisi");
    const { error } = await db
      .from("staff_dayoff")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Dibatalkan admin"
      })
      .eq("id", id);
    if (error) throw error;
    await logAudit(db, "admin_staff_dayoff_cancel", "Admin", { id });
    return ok({ cancelled: true });
  }

  throw new HttpError("Method staff dayoff tidak valid", 405);
}

async function computeAutoCoverage(db: Db, outletId: string, date: string, excludeStaffId: string) {
  const { data: activeStaff } = await db
    .from("staff")
    .select("id,name")
    .eq("outlet_id", outletId)
    .eq("active", true)
    .is("deleted_at", null);

  if (!activeStaff || activeStaff.length === 0) {
    return { action: "no_staff", message: "Tidak ada staff aktif di outlet ini" };
  }

  const { data: dayoffs } = await db
    .from("staff_dayoff")
    .select("staff_id")
    .eq("outlet_id", outletId)
    .eq("date", date)
    .eq("status", "active");

  const offStaffIds = new Set<string>((dayoffs || []).map((d: any) => d.staff_id as string));
  offStaffIds.add(excludeStaffId);

  const available = activeStaff.filter((s: any) => !offStaffIds.has(s.id));

  if (available.length === 0) {
    return {
      action: "needs_assignment",
      message: "Semua staff libur — tandai outlet tutup atau assign manual"
    };
  }

  if (available.length === 1) {
    const autoStaff = available[0] as any;
    const { data: existingAss } = await db
      .from("staff_shift_assignments")
      .select("id,shift_type")
      .eq("staff_id", autoStaff.id)
      .eq("date", date)
      .in("status", ["confirmed", "admin_override", "auto_cover"])
      .maybeSingle();

    if (existingAss) {
      if (existingAss.shift_type !== "FULL_SHIFT") {
        await db
          .from("staff_shift_assignments")
          .update({
            shift_type: "FULL_SHIFT",
            status: "auto_cover",
            source: "auto_dayoff",
            updated_at: new Date().toISOString()
          })
          .eq("id", existingAss.id);
        return { action: "upgraded_to_full_shift", staffId: autoStaff.id, staffName: autoStaff.name };
      }
      return { action: "already_full_shift", staffId: autoStaff.id, staffName: autoStaff.name };
    }

    // Buat assignment baru FULL_SHIFT otomatis
    await db.from("staff_shift_assignments").insert({
      outlet_id: outletId,
      staff_id: autoStaff.id,
      staff_name: autoStaff.name,
      date,
      shift_type: "FULL_SHIFT",
      status: "auto_cover",
      source: "auto_dayoff",
      confirmed_at: new Date().toISOString(),
      created_by: "system"
    });
    return { action: "auto_assigned_full_shift", staffId: autoStaff.id, staffName: autoStaff.name };
  }

  return {
    action: "multiple_available",
    availableCount: available.length,
    message: "Lebih dari satu staff tersedia, assignment pilih manual"
  };
}

// ─── Admin Payroll Projection ──────────────────────────────────────────────

async function buildProjectionData(db: Db, asOfDate: string, filterStaffId?: string, filterOutletId?: string, includeInactive = false) {
  let staffQuery = db
    .from("staff")
    .select("id,name,outlet_id,salary_per_shift,active,deleted_at,outlets(id,name)")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (!includeInactive) staffQuery = staffQuery.eq("active", true);
  if (filterOutletId) staffQuery = staffQuery.eq("outlet_id", filterOutletId);
  if (filterStaffId) staffQuery = staffQuery.eq("id", filterStaffId);

  const { data: allStaff, error: staffError } = await staffQuery;
  if (staffError) throw staffError;
  if (!allStaff?.length) return { allStaff: [], projections: [] };

  // History range: 7+ months back to cover up to 6 historical periods
  const rangeStart = addDateDays(asOfDate, -220);
  const rangeEnd = addDateDays(asOfDate, 40);

  const [
    { data: allAttendance, error: attError },
    { data: allPayments, error: payError },
    { data: allDayoffs, error: dayoffError },
    { data: allLeaves, error: leaveError },
    { data: allAssignments, error: assError }
  ] = await Promise.all([
    db.from("attendance")
      .select("staff_id,date,checkin_time,status,final_salary,paid_status,flags")
      .gte("date", rangeStart)
      .lte("date", asOfDate)
      .in("staff_id", allStaff.map((s: any) => s.id)),
    db.from("payments")
      .select("staff_id,amount,date_from,date_to")
      .gte("date_to", rangeStart)
      .in("staff_id", allStaff.map((s: any) => s.id)),
    db.from("staff_dayoff")
      .select("staff_id,date,status")
      .eq("status", "active")
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .in("staff_id", allStaff.map((s: any) => s.id)),
    db.from("leave_requests")
      .select("staff_id,date,status")
      .in("status", ["approved", "pending"])
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .in("staff_id", allStaff.map((s: any) => s.id)),
    db.from("staff_shift_assignments")
      .select("staff_id,date,shift_type,status")
      .in("status", ["confirmed", "admin_override", "auto_cover", "locked"])
      .gt("date", asOfDate)
      .lte("date", rangeEnd)
      .in("staff_id", allStaff.map((s: any) => s.id))
  ]);

  if (attError) throw attError;
  if (payError) throw payError;
  if (dayoffError) throw dayoffError;
  if (leaveError) throw leaveError;
  if (assError) throw assError;

  const projections = allStaff.map((staff: any) => {
    const staffAtt = (allAttendance || []).filter((r: any) => r.staff_id === staff.id);
    const firstAttendanceDate = staffAtt.length > 0
      ? staffAtt.reduce((min: string, r: any) => r.date < min ? r.date : min, staffAtt[0].date as string)
      : null;

    if (!firstAttendanceDate) {
      return makeInsufficientDataProjection(
        staff.id,
        staff.name,
        staff.outlet_id ?? null,
        (staff.outlets as any)?.name ?? null
      );
    }

    const paydayDay = parseInt(firstAttendanceDate.split("-")[2], 10);
    const period = resolvePayrollPeriod(paydayDay, asOfDate);
    const historicalPeriods = buildHistoricalPeriods(paydayDay, period.periodStart, 6);

    const staffDayoffs = (allDayoffs || []).filter((d: any) => d.staff_id === staff.id);
    const staffLeaves = (allLeaves || []).filter((l: any) => l.staff_id === staff.id);

    const blockedDatesPast = new Set<string>();
    const blockedDaysFuture = new Set<string>();
    for (const d of staffDayoffs) {
      if (d.date <= asOfDate) blockedDatesPast.add(d.date);
      else blockedDaysFuture.add(d.date);
    }
    for (const l of staffLeaves) {
      if (l.status === "approved") {
        if (l.date <= asOfDate) blockedDatesPast.add(l.date);
        else blockedDaysFuture.add(l.date);
      }
    }

    const pendingLeaveCount = staffLeaves.filter(
      (l: any) => l.status === "pending" && l.date > asOfDate && l.date <= period.periodEnd
    ).length;

    const historySummaries = historicalPeriods.map(hp => ({
      ...summarizeAttendancePeriod(staffAtt, hp.start, hp.end),
      start: hp.start,
      end: hp.end
    }));

    const futureAssignments = (allAssignments || []).filter((a: any) => a.staff_id === staff.id);
    const payments = (allPayments || []).filter((p: any) => p.staff_id === staff.id);

    return calculatePayrollProjection({
      staffId: staff.id,
      staffName: staff.name,
      outletId: staff.outlet_id ?? null,
      outletName: (staff.outlets as any)?.name ?? null,
      salaryPerShift: Number(staff.salary_per_shift) || 0,
      firstAttendanceDate,
      paydayDay,
      asOfDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      nextPayday: period.nextPayday,
      currentAttendance: staffAtt,
      historySummaries,
      blockedDatesPast,
      blockedDaysFuture,
      pendingLeaveCount,
      futureAssignments,
      payments
    });
  });

  return { allStaff, projections };
}

async function adminPayrollProjection(db: Db, body: Body) {
  const asOfDate = stringBody(body, "asOfDate") || todayJakarta();
  const filterOutletId = stringBody(body, "outletId") || undefined;
  const filterStaffId = stringBody(body, "staffId") || undefined;
  const includeInactive = body.includeInactive === "true" || body.includeInactive === true;

  const { projections } = await buildProjectionData(db, asOfDate, filterStaffId, filterOutletId, Boolean(includeInactive));

  const valid = projections.filter((p: any) => p.status !== "insufficient_data");
  const fieldSum = (field: string) => valid.reduce((s: number, p: any) => s + (p[field] ?? 0), 0);

  const summary = {
    formedSalary: fieldSum("formedSalary"),
    projectedLow: fieldSum("projectedLow"),
    projectedNormal: fieldSum("projectedNormal"),
    projectedHigh: fieldSum("projectedHigh"),
    estimatedCashNeed: fieldSum("cashNeedNormal"),
    averageConfidence: valid.length > 0
      ? Math.round(valid.reduce((s: number, p: any) => s + p.confidenceScore, 0) / valid.length)
      : 0,
    staffCount: projections.length,
    insufficientDataCount: projections.filter((p: any) => p.status === "insufficient_data").length
  };

  return ok({ asOfDate, summary, projections });
}

async function adminPayrollProjectionDetail(db: Db, body: Body) {
  const staffId = stringBody(body, "staffId");
  if (!staffId) throw new HttpError("staffId wajib diisi", 400, "MISSING_STAFF_ID");
  const asOfDate = stringBody(body, "asOfDate") || todayJakarta();

  const { projections } = await buildProjectionData(db, asOfDate, staffId);
  const projection = projections[0];

  if (!projection) throw new HttpError("Staff tidak ditemukan atau tidak aktif", 404, "STAFF_NOT_FOUND");

  if (projection.status === "insufficient_data") {
    return ok({
      ok: true,
      projection,
      currentPeriod: null,
      history: null,
      prediction: null
    });
  }

  // Rebuild full detail with history summaries for detail view
  const rangeStart = addDateDays(asOfDate, -220);
  const rangeEnd = addDateDays(asOfDate, 40);

  const { data: staffRow, error: staffErr } = await db
    .from("staff")
    .select("id,name,outlet_id,salary_per_shift,outlets(id,name)")
    .eq("id", staffId)
    .maybeSingle();
  if (staffErr) throw staffErr;
  if (!staffRow) throw new HttpError("Staff tidak ditemukan", 404, "STAFF_NOT_FOUND");

  const [
    { data: attRows },
    { data: dayoffRows },
    { data: leaveRows },
    { data: assignmentRows },
    { data: paymentRows }
  ] = await Promise.all([
    db.from("attendance").select("staff_id,date,checkin_time,status,final_salary,paid_status,flags")
      .eq("staff_id", staffId).gte("date", rangeStart).lte("date", asOfDate),
    db.from("staff_dayoff").select("staff_id,date,status").eq("staff_id", staffId).eq("status", "active")
      .gte("date", rangeStart).lte("date", rangeEnd),
    db.from("leave_requests").select("staff_id,date,status").eq("staff_id", staffId)
      .in("status", ["approved", "pending"]).gte("date", rangeStart).lte("date", rangeEnd),
    db.from("staff_shift_assignments").select("staff_id,date,shift_type,status").eq("staff_id", staffId)
      .in("status", ["confirmed", "admin_override", "auto_cover", "locked"])
      .gt("date", asOfDate).lte("date", rangeEnd),
    db.from("payments").select("staff_id,amount,date_from,date_to").eq("staff_id", staffId)
      .gte("date_to", rangeStart)
  ]);

  const staffAtt = attRows || [];
  const firstAttendanceDate = staffAtt.length > 0
    ? staffAtt.reduce((min: string, r: any) => r.date < min ? r.date : min, staffAtt[0].date as string)
    : null;

  if (!firstAttendanceDate) {
    return ok({ ok: true, projection, currentPeriod: null, history: null, prediction: null });
  }

  const paydayDay = parseInt(firstAttendanceDate.split("-")[2], 10);
  const period = resolvePayrollPeriod(paydayDay, asOfDate);
  const historicalPeriods = buildHistoricalPeriods(paydayDay, period.periodStart, 6);

  const blockedDatesPast = new Set<string>();
  const blockedDaysFuture = new Set<string>();
  for (const d of (dayoffRows || [])) {
    if (d.date <= asOfDate) blockedDatesPast.add(d.date);
    else blockedDaysFuture.add(d.date);
  }
  for (const l of (leaveRows || [])) {
    if (l.status === "approved") {
      if (l.date <= asOfDate) blockedDatesPast.add(l.date);
      else blockedDaysFuture.add(l.date);
    }
  }

  const pendingLeaveCount = (leaveRows || []).filter(
    (l: any) => l.status === "pending" && l.date > asOfDate && l.date <= period.periodEnd
  ).length;

  const historySummaries = historicalPeriods.map(hp => ({
    ...summarizeAttendancePeriod(staffAtt, hp.start, hp.end),
    start: hp.start,
    end: hp.end
  }));

  const projectionInput = {
    staffId: staffRow.id,
    staffName: staffRow.name,
    outletId: staffRow.outlet_id ?? null,
    outletName: (staffRow.outlets as any)?.name ?? null,
    salaryPerShift: Number(staffRow.salary_per_shift) || 0,
    firstAttendanceDate,
    paydayDay,
    asOfDate,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    nextPayday: period.nextPayday,
    currentAttendance: staffAtt,
    historySummaries,
    blockedDatesPast,
    blockedDaysFuture,
    pendingLeaveCount,
    futureAssignments: assignmentRows || [],
    payments: paymentRows || []
  };

  const detailedProjection = calculatePayrollProjection(projectionInput);
  const detail = buildProjectionDetail(detailedProjection, projectionInput, historySummaries);

  return ok(detail);
}

async function getPayslip(db: Db, request: NextRequest, body: Body) {
  const token = tokenFromRequest(request);
  if (!token) throw new HttpError("Sesi tidak ditemukan, silakan login ulang", 401, "NO_SESSION");

  let session: Awaited<ReturnType<typeof verifySessionToken>>;
  try {
    session = await verifySessionToken(token);
  } catch {
    throw new HttpError("Sesi sudah kedaluwarsa, silakan login ulang", 401, "SESSION_EXPIRED");
  }

  const paymentId = stringBody(body, "paymentId");
  if (!paymentId) throw new HttpError("paymentId wajib diisi", 400);

  const { data: payment, error: payError } = await db
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (payError) throw payError;
  if (!payment) throw new HttpError("Slip gaji tidak ditemukan", 404, "PAYSLIP_NOT_FOUND");

  if (session.role === "staff" && payment.staff_id !== session.sub) {
    throw new HttpError("Akses ditolak", 403, "FORBIDDEN");
  }

  const [
    { data: staffRow, error: staffError },
    { data: shifts, error: shiftsError },
    { data: allPayments, error: allPayError }
  ] = await Promise.all([
    db.from("staff").select("id,name,salary_per_shift,outlet_id,phone,outlets(id,name,shift1_start,shift1_end,shift2_start,shift2_end)").eq("id", payment.staff_id).maybeSingle(),
    db.from("attendance").select("id,date,shift,checkin_time,checkout_time,late_minutes,deduction,final_salary,flags,status").eq("payment_id", paymentId).order("date", { ascending: true }).order("shift", { ascending: true }),
    db.from("payments").select("id,amount,paid_at").eq("staff_id", payment.staff_id).order("paid_at", { ascending: true })
  ]);
  if (staffError) throw staffError;
  if (shiftsError) throw shiftsError;
  if (allPayError) throw allPayError;

  const { data: allAtt, error: allAttError } = await db
    .from("attendance")
    .select("id,final_salary,paid_status")
    .eq("staff_id", payment.staff_id);
  if (allAttError) throw allAttError;

  const totalEarned = (allAtt || []).reduce((s: number, r: any) => s + normalizeCurrency(r.final_salary), 0);
  const totalPaid = (allPayments || []).reduce((s: number, r: any) => s + normalizeCurrency(r.amount), 0);
  const balance = Math.max(0, totalEarned - totalPaid);

  const outlet = (staffRow as any)?.outlets ?? null;

  return ok({
    payment: {
      id: payment.id,
      paid_at: payment.paid_at,
      amount: normalizeCurrency(payment.amount),
      note: payment.note || null,
      date_from: payment.date_from || null,
      date_to: payment.date_to || null,
      proof_url: payment.proof_url || null
    },
    staff: {
      name: payment.staff_name || staffRow?.name || "",
      salary_per_shift: normalizeCurrency((staffRow as any)?.salary_per_shift ?? 0),
      phone: (staffRow as any)?.phone || null
    },
    outlet: outlet ? {
      name: outlet.name,
      shift1_start: outlet.shift1_start || null,
      shift1_end: outlet.shift1_end || null,
      shift2_start: outlet.shift2_start || null,
      shift2_end: outlet.shift2_end || null
    } : null,
    shifts: (shifts || []).map((r: any) => ({
      id: String(r.id),
      date: String(r.date),
      shift: Number(r.shift ?? 0),
      checkin_time: r.checkin_time || null,
      checkout_time: r.checkout_time || null,
      late_minutes: Number(r.late_minutes ?? 0),
      deduction: normalizeCurrency(r.deduction),
      final_salary: normalizeCurrency(r.final_salary),
      flags: r.flags || null,
      status: r.status || null
    })),
    summary: {
      totalEarned,
      totalPaid,
      balance,
      thisPaymentAmount: normalizeCurrency(payment.amount),
      coveredShiftCount: (shifts || []).length,
      paymentNumber: (allPayments || []).findIndex((p: any) => p.id === paymentId) + 1,
      totalPayments: (allPayments || []).length
    }
  });
}
