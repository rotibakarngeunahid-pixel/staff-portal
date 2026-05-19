import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPin, createSessionToken, publicStaff, verifySessionToken } from "@/lib/auth";
import {
  addDays,
  calculateSalary,
  dateTimeUtc,
  detectShift,
  getEffectiveDate,
  haversineDistance,
  isTimeWithinWindow,
  normalizeCurrency,
  sanitizePathSegment,
  shiftStartTime,
  timeJakarta,
  todayJakarta
} from "@/lib/business";
import { sendReportNotification } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/server";
import { uploadImage } from "@/lib/storage";
import type { ConfigMap, Outlet, SessionPayload, Staff } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Db = ReturnType<typeof supabaseAdmin>;
type Body = Record<string, any>;
type RouteContext = { params: Promise<{ path?: string[] }> };

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

async function getStaffWithOutlet(db: Db, staffId: string) {
  const { data, error } = await db.from("staff").select("*, outlets(*)").eq("id", staffId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError("Karyawan tidak ditemukan", 404, "STAFF_NOT_FOUND");
  const outlet = data.outlets ? toOutlet(data.outlets) : null;
  return { staff: data as Staff, outlet };
}

async function logAudit(db: Db, action: string, userName: string, detail: unknown) {
  const value = typeof detail === "string" ? detail : JSON.stringify(detail);
  await db
    .from("audit_log")
    .insert({ action, user_name: userName || "system", detail: value.slice(0, 500) });
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

function reportWindow(outlet: Outlet, type: "BUKA" | "TUTUP") {
  const start = type === "BUKA" ? outlet.report_buka_start : outlet.report_tutup_start;
  const end = type === "BUKA" ? outlet.report_buka_end : outlet.report_tutup_end;
  return { start, end };
}

function assertReportWindow(outlet: Outlet, type: "BUKA" | "TUTUP") {
  const { start, end } = reportWindow(outlet, type);
  if (!start || !end) return;
  const nowTime = timeJakarta();
  if (isTimeWithinWindow(nowTime, start, end)) return;
  throw new HttpError(
    `Laporan ${type} hanya bisa dikirim antara ${start.slice(0, 5)} - ${end.slice(0, 5)}`,
    400,
    "OUTSIDE_REPORT_WINDOW"
  );
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

async function dispatch(request: NextRequest, context: RouteContext) {
  try {
    const params = await paramsFrom(context);
    const path = `/${(params.path || []).join("/")}`;
    const body = await readBody(request);
    const db = supabaseAdmin();

    if (request.method === "GET" && path === "/staff/list") return getStaffList(db);
    if (request.method === "POST" && path === "/auth/login") return staffLogin(db, body);
    if (request.method === "POST" && path === "/auth/admin-login") return adminLogin(db, request, body);
    if (request.method === "POST" && path === "/auth/logout") return logout();

    if (request.method === "GET" && path === "/attendance/status") return staffAttendanceStatus(db, request, body);
    if (request.method === "POST" && path === "/attendance/checkin") return checkin(db, request, body);
    if (request.method === "POST" && path === "/attendance/checkout") return checkout(db, request, body);
    if (request.method === "GET" && path === "/reports/config") return reportsConfig(db, request, body);
    if (request.method === "POST" && path === "/reports/submit") return submitReport(db, request, body);
    if (request.method === "GET" && path === "/staff/payroll") return staffPayroll(db, request);
    if (request.method === "GET" && path === "/staff/profile") return staffProfile(db, request);
    if (request.method === "GET" && path === "/schedule/weekly") return staffWeeklySchedule(db, request, body);
    if (request.method === "POST" && path === "/schedule/claim") return claimShift(db, request, body);
    if (request.method === "POST" && path === "/schedule/cancel") return cancelShift(db, request, body);
    if (request.method === "POST" && path === "/schedule/select") return selectShift(db, request, body);
    if (request.method === "POST" && path === "/schedule/cancel-assignment") return cancelAssignment(db, request, body);
    if (request.method === "POST" && path === "/schedule/leave") return requestLeave(db, request, body);
    if (request.method === "DELETE" && path === "/schedule/leave") return cancelLeave(db, request, body);

    if (path.startsWith("/admin/")) {
      await requireSession(request, "admin");
      return adminDispatch(db, request.method, path, body);
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
    .select("id,name,outlet_id,active")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return ok({ staff: data || [] });
}

async function staffLogin(db: Db, body: Body) {
  const schema = z.object({ name: z.string().min(1), pin: z.string().min(4).max(12) });
  const parsed = schema.parse(body);
  const { data, error } = await db
    .from("staff")
    .select("*, outlets(*)")
    .ilike("name", parsed.name)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.pin_hash !== hashPin(parsed.pin)) {
    throw new HttpError("Nama atau PIN salah", 401, "INVALID_LOGIN");
  }
  const cfg = await configMap(db);
  const hours = configNumber(cfg, "token_hours", 8);
  const token = await createSessionToken(
    { sub: data.id, role: "staff", name: data.name, outlet_id: data.outlet_id },
    hours
  );
  await logAudit(db, "staff_login", data.name, { staffId: data.id });
  const response = ok({ token, staff: publicStaff(data), outlet: data.outlets ? toOutlet(data.outlets) : null });
  setSessionCookie(response, "staff", token, hours);
  return response;
}

async function adminLogin(db: Db, request: NextRequest, body: Body) {
  const pin = stringBody(body, "pin");
  if (pin.length < 4) throw new HttpError("PIN admin minimal 4 digit");
  const cfg = await configMap(db);
  const maxAttempts = configNumber(cfg, "max_login_attempts", 5);
  const lockoutMinutes = configNumber(cfg, "lockout_minutes", 15);
  const since = new Date(Date.now() - lockoutMinutes * 60000).toISOString();
  const { data: attempts, error: attemptsError } = await db
    .from("admin_login_attempts")
    .select("id")
    .eq("success", false)
    .gte("attempt_at", since);
  if (attemptsError) throw attemptsError;
  if ((attempts || []).length >= maxAttempts) {
    throw new HttpError(`Terlalu banyak percobaan. Coba lagi ${lockoutMinutes} menit lagi.`, 429, "LOCKED");
  }

  const expected = cfg.admin_pin_hash || hashPin("admin1234");
  const success = expected === hashPin(pin);
  await db.from("admin_login_attempts").insert({
    success,
    ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "local"
  });
  if (!success) throw new HttpError("PIN admin salah", 401, "INVALID_ADMIN_PIN");

  if (!cfg.admin_pin_hash) {
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

  const effective = stringBody(body, "date") || getEffectiveDate().date;
  const rawShift = detectShift(outlet);
  const cfg = await configMap(db);

  // Detect full shift scenario for 2-shift outlets
  let effectiveShift: 0 | 1 | 2 = rawShift;
  let isFullShift = false;
  let offShift: number | null = null;
  let activeShift: number | null = null;

  if (outlet.shift_mode === 2) {
    const { data: dayoffs } = await db
      .from("shift_dayoff")
      .select("shift")
      .eq("outlet_id", outlet.id)
      .eq("date", effective);
    const offSet = new Set((dayoffs || []).map((d: any) => Number(d.shift)));
    const shift1Off = offSet.has(1);
    const shift2Off = offSet.has(2);
    if (shift1Off && !shift2Off) {
      isFullShift = true; offShift = 1; activeShift = 2; effectiveShift = 0;
    } else if (shift2Off && !shift1Off) {
      isFullShift = true; offShift = 2; activeShift = 1; effectiveShift = 0;
    }
  }

  const { data: attendance, error: attendanceError } = await db
    .from("attendance")
    .select("*")
    .eq("staff_id", staff.id)
    .eq("date", effective)
    .eq("shift", effectiveShift)
    .maybeSingle();
  if (attendanceError) throw attendanceError;

  const { data: reports, error: reportsError } = await db
    .from("reports")
    .select("*")
    .eq("outlet_id", outlet.id)
    .eq("date", effective)
    .order("submitted_at", { ascending: false });
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

  // PRD §8.5 — resolve jadwal dari staff_shift_assignments (sumber kebenaran baru)
  const { data: assignment } = await db
    .from("staff_shift_assignments")
    .select("*")
    .eq("staff_id", staff.id)
    .eq("date", effective)
    .in("status", ["confirmed", "admin_override", "auto_cover", "locked", "completed"])
    .maybeSingle();

  // PRD §8.4 — cek staff_dayoff
  const { data: staffDayoffRow } = await db
    .from("staff_dayoff")
    .select("id,reason")
    .eq("staff_id", staff.id)
    .eq("date", effective)
    .eq("status", "active")
    .maybeSingle();

  // Compute scheduleState dan nextStep
  const hasBuka = (reports || []).some((r: any) => r.type === "BUKA");
  const hasTutup = (reports || []).some((r: any) => r.type === "TUTUP");

  let scheduleState: string;
  let nextStep: string;
  let requiredReports: string[] = [];

  if (staffDayoffRow) {
    scheduleState = "dayoff";
    nextStep = "blocked";
  } else if (assignment) {
    const shiftType = assignment.shift_type as string;
    requiredReports = shiftType === "SHIFT_1" ? ["BUKA"] : shiftType === "SHIFT_2" ? ["TUTUP"] : ["BUKA", "TUTUP"];
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
    // Fallback ke logic lama (backward compat untuk outlet yang belum pakai assignments)
    if (!attendance?.checkin_time) {
      scheduleState = "unassigned";
      nextStep = outlet.shift_mode === 2 ? "blocked" : "checkin";
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
    scheduleState,
    nextStep,
    requiredReports,
    serverTime: new Date().toISOString()
  });
}

async function checkin(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  await consumeNonce(db, stringBody(body, "nonce"));

  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan", 400, "NO_OUTLET");

  const date = stringBody(body, "shiftDate") || stringBody(body, "date") || getEffectiveDate().date;
  // Use nullish coalescing to allow shift=0 (full shift) to pass through correctly
  const shiftFromBody = body.shift !== undefined && body.shift !== null && body.shift !== "" ? Number(body.shift) : -1;
  const shift = ([0, 1, 2].includes(shiftFromBody) ? shiftFromBody : detectShift(outlet)) as 0 | 1 | 2;
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

  const { data: existing, error: existingError } = await db
    .from("attendance")
    .select("id")
    .eq("staff_id", staff.id)
    .eq("date", date)
    .eq("shift", shift)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) throw new HttpError("Absen masuk untuk shift ini sudah tercatat", 409, "ALREADY_CHECKED_IN");

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

  const cfg = await configMap(db);
  const now = new Date();
  // Full shift always starts at shift1_start; shiftStartTime(outlet, 0) already returns shift1_start
  const start = dateTimeUtc(date, shiftStartTime(outlet, shift));

  // Full shift: shift=0 for 2-shift outlet always means full shift (other shift is off)
  let isFullShift2x = false;
  if (outlet.shift_mode === 2) {
    if (shift === 0) {
      isFullShift2x = true;
    } else if (shift === 1 || shift === 2) {
      const otherShift = shift === 1 ? 2 : 1;
      const { data: otherOff } = await db
        .from("shift_dayoff")
        .select("id")
        .eq("outlet_id", outlet.id)
        .eq("date", date)
        .eq("shift", otherShift)
        .maybeSingle();
      if (otherOff) isFullShift2x = true;
    }
  }

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
  await db
    .from("staff_shift_assignments")
    .update({ status: "locked", locked_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("staff_id", staff.id)
    .eq("date", date)
    .in("status", ["confirmed", "admin_override", "auto_cover"]);

  await logAudit(db, "checkin", staff.name, { date, shift, distance: Math.round(distance), gpsLowAccuracy });
  return ok({
    attendance: inserted,
    checkin_time: now.toISOString(),
    late_minutes: salary.lateMinutes,
    deduction: salary.deduction,
    final_salary: salary.finalSalary,
    gps_low_accuracy: gpsLowAccuracy,
    distance_m: Math.round(distance)
  });
}

async function checkout(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  await consumeNonce(db, stringBody(body, "nonce"));

  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan", 400, "NO_OUTLET");
  const date = stringBody(body, "shiftDate") || stringBody(body, "date") || getEffectiveDate().date;
  // Allow shift=0 (full shift) to pass — same fix as checkin
  const shiftFromBody = body.shift !== undefined && body.shift !== null && body.shift !== "" ? Number(body.shift) : -1;
  const shift = ([0, 1, 2].includes(shiftFromBody) ? shiftFromBody : detectShift(outlet)) as 0 | 1 | 2;

  const { data: attendance, error: attendanceError } = await db
    .from("attendance")
    .select("*")
    .eq("staff_id", staff.id)
    .eq("date", date)
    .eq("shift", shift)
    .maybeSingle();
  if (attendanceError) throw attendanceError;
  if (!attendance?.checkin_time) throw new HttpError("Belum ada absen masuk untuk shift ini", 400, "NO_CHECKIN");
  if (attendance.checkout_time) throw new HttpError("Absen pulang sudah tercatat", 409, "ALREADY_CHECKED_OUT");

  const { data: reports, error: reportsError } = await db
    .from("reports")
    .select("type")
    .eq("outlet_id", outlet.id)
    .eq("date", date);
  if (reportsError) throw reportsError;
  const hasBuka = (reports || []).some((report) => report.type === "BUKA");
  const hasTutup = (reports || []).some((report) => report.type === "TUTUP");
  if ((shift === 0 || shift === 1) && !hasBuka) throw new HttpError("Laporan BUKA wajib disubmit sebelum checkout");
  if ((shift === 0 || shift === 2) && !hasTutup) throw new HttpError("Laporan TUTUP wajib disubmit sebelum checkout");

  const selfieUrl = await uploadImage(db, `selfies/checkout/${staff.id}/${date}_${shift}.jpg`, body.selfie || body.photo);
  if (!selfieUrl) throw new HttpError("Selfie absen pulang wajib diupload");

  const now = new Date();
  const durationMin = Math.min(
    18 * 60,
    Math.max(0, Math.round((now.getTime() - new Date(attendance.checkin_time).getTime()) / 60000))
  );

  const { data: updated, error } = await db
    .from("attendance")
    .update({
      checkout_time: now.toISOString(),
      selfie_out: selfieUrl
    })
    .eq("id", attendance.id)
    .select("*")
    .single();
  if (error) throw error;
  await logAudit(db, "checkout", staff.name, { date, shift, durationMin });
  return ok({ attendance: updated, checkout_time: now.toISOString(), duration_min: durationMin });
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
  return ok({ items: data || [] });
}

async function submitReport(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  await consumeNonce(db, stringBody(body, "nonce"));
  const { staff, outlet } = await getStaffWithOutlet(db, session.sub);
  if (!outlet) throw new HttpError("Outlet belum ditentukan", 400, "NO_OUTLET");

  const type = reportType(body);
  const date = stringBody(body, "shiftDate") || stringBody(body, "date") || getEffectiveDate().date;

  const allowedShifts = type === "BUKA" ? [0, 1] : [0, 2];
  const { data: checkinRows, error: attCheckError } = await db
    .from("attendance")
    .select("id,selfie_in")
    .eq("staff_id", staff.id)
    .eq("date", date)
    .in("shift", allowedShifts)
    .not("checkin_time", "is", null)
    .limit(1);
  if (attCheckError) throw attCheckError;
  if (!checkinRows || checkinRows.length === 0) {
    throw new HttpError("Absen masuk dulu sebelum submit laporan", 400, "NO_CHECKIN");
  }

  assertReportWindow(outlet, type);

  const inputItems = parseItems(body.items);

  const { data: cfgItems, error: cfgError } = await db
    .from("report_cfg")
    .select("*")
    .eq("outlet_id", outlet.id)
    .eq("type", type)
    .order("sort_order");
  if (cfgError) throw cfgError;

  const savedItems = [];
  for (const cfgItem of cfgItems || []) {
    const submitted = inputItems.find((item) => String(item.label || "") === String(cfgItem.label));
    if (cfgItem.required && !submitted?.photo) {
      throw new HttpError(`Foto "${cfgItem.label}" wajib diupload`);
    }
    const photoUrl = submitted?.photo
      ? await uploadImage(
          db,
          `reports/${outlet.id}/${date}/${type}/${sanitizePathSegment(cfgItem.label || "item")}.jpg`,
          submitted.photo
        )
      : "";
    savedItems.push({
      label: cfgItem.label,
      required: cfgItem.required,
      photo_url: photoUrl,
      submitted: Boolean(photoUrl)
    });
  }

  if (!(cfgItems || []).length) {
    if (!inputItems.some((item) => item?.photo)) {
      throw new HttpError("Minimal satu foto laporan wajib diupload");
    }
    for (const item of inputItems) {
      if (!item?.label || !item?.photo) continue;
      const photoUrl = await uploadImage(
        db,
        `reports/${outlet.id}/${date}/${type}/${sanitizePathSegment(String(item.label))}.jpg`,
        item.photo
      );
      savedItems.push({ label: item.label, required: false, photo_url: photoUrl, submitted: true });
    }
  }

  const selfieUrl = body.selfie
    ? await uploadImage(db, `reports/selfies/${outlet.id}/${date}_${type}.jpg`, body.selfie)
    : String(checkinRows[0]?.selfie_in || "");

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
        selfie: selfieUrl,
        submitted_at: new Date().toISOString()
      },
      { onConflict: "outlet_id,date,type" }
    )
    .select("*")
    .single();
  if (error) throw error;

  const cfg = await configMap(db);
  let emailSent = false;
  try {
    emailSent = await sendReportNotification({
      type,
      outlet_name: outlet.name,
      staff_name: staff.name,
      date,
      submitted_at: report.submitted_at,
      itemCount: savedItems.filter((item) => item.photo_url).length,
      selfieUrl,
      items: savedItems,
      to: cfg.notification_email
    });
  } catch (emailError) {
    await logAudit(db, "report_email_failed", staff.name, {
      date,
      type,
      error: emailError instanceof Error ? emailError.message : "Unknown email error"
    });
  }
  await logAudit(db, "submit_report", staff.name, { date, type, outletId: outlet.id });
  return ok({ report, reportId: report.id, emailSent });
}

async function staffPayroll(db: Db, request: NextRequest) {
  const session = await requireSession(request, "staff");
  const { data: attendance, error } = await db
    .from("attendance")
    .select("*")
    .eq("staff_id", session.sub)
    .order("date", { ascending: false });
  if (error) throw error;
  const { data: payments, error: payError } = await db
    .from("payments")
    .select("*")
    .eq("staff_id", session.sub)
    .order("paid_at", { ascending: false });
  if (payError) throw payError;
  const rows = attendance || [];
  const totalEarned = rows.reduce((sum, row) => sum + normalizeCurrency(row.final_salary), 0);
  const totalPaid = (payments || []).reduce((sum, row) => sum + normalizeCurrency(row.amount), 0);
  return ok({ attendance: rows, payments: payments || [], summary: { totalEarned, totalPaid, balance: totalEarned - totalPaid } });
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
      db.from("outlets").select("id,shift_mode").eq("id", outletId).single(),
      db.from("shift_schedule").select("*").eq("outlet_id", outletId).gte("date", dateFrom).lte("date", dateTo),
      db.from("leave_requests").select("*").eq("outlet_id", outletId).gte("date", dateFrom).lte("date", dateTo),
      db.from("shift_dayoff").select("*").eq("outlet_id", outletId).gte("date", dateFrom).lte("date", dateTo),
      db.from("staff_shift_assignments").select("*").eq("outlet_id", outletId).gte("date", dateFrom).lte("date", dateTo).not("status", "in", '("cancelled","conflict")'),
      db.from("staff_dayoff").select("*").eq("outlet_id", outletId).gte("date", dateFrom).lte("date", dateTo).eq("status", "active")
    ]);
  if (outletError) throw outletError;
  if (error) throw error;
  if (leaveError) throw leaveError;
  if (offError) throw offError;
  if (assError) throw assError;
  if (sdError) throw sdError;

  const shiftNumbers = Number(outlet?.shift_mode) === 2 ? [1, 2] : [0];
  const days = [];
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(dateFrom, index);

    // Assignments untuk tanggal ini (tabel baru)
    const dayAssignments = (assignments || []).filter((a: any) => a.date === date);
    const myAssignment = staffId ? dayAssignments.find((a: any) => a.staff_id === staffId) : null;
    const myDayoff = staffId ? (staffDayoffs || []).find((d: any) => d.date === date && d.staff_id === staffId) : null;

    const slots = shiftNumbers.map((shift) => {
      if (shift === 0) {
        // Single-shift outlet: tampilkan assignment jika ada
        const ass = myAssignment || dayAssignments[0] || null;
        return {
          shift,
          scheduleId: null,
          assignmentId: ass?.id || null,
          staffId: ass?.staff_id || null,
          staffName: ass?.staff_name || null,
          shiftType: ass?.shift_type || "FULL_SHIFT",
          status: myDayoff ? "dayoff" : ass ? ass.status : "single",
          isMe: Boolean(staffId && ass?.staff_id === staffId),
          isDayoff: Boolean(myDayoff)
        };
      }
      // 2-shift outlet
      const off = (dayoffs || []).some((item: any) => item.date === date && item.shift === shift);
      const rec = (schedules || []).find((item: any) => item.date === date && item.shift === shift);
      // Cari assignment yang cocok untuk shift ini
      const targetShiftType = shift === 1 ? ["SHIFT_1", "FULL_SHIFT"] : ["SHIFT_2", "FULL_SHIFT"];
      const ass = dayAssignments.find((a: any) => targetShiftType.includes(a.shift_type));

      return {
        shift,
        scheduleId: rec?.id || null,
        assignmentId: ass?.id || null,
        staffId: ass?.staff_id || rec?.staff_id || null,
        staffName: ass?.staff_name || rec?.staff_name || null,
        shiftType: ass?.shift_type || (shift === 1 ? "SHIFT_1" : "SHIFT_2"),
        status: myDayoff ? "dayoff" : off ? "off" : ass ? ass.status : rec?.status || "open",
        isMe: Boolean(staffId && (ass?.staff_id === staffId || rec?.staff_id === staffId)),
        isDayoff: Boolean(myDayoff)
      };
    });

    days.push({
      date,
      slots,
      assignments: dayAssignments,
      myAssignment: myAssignment || null,
      myDayoff: myDayoff || null,
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
  const { data, error } = await db
    .from("leave_requests")
    .upsert(
      {
        outlet_id: outlet.id,
        staff_id: staff.id,
        staff_name: staff.name,
        date,
        status: "pending",
        reason: stringBody(body, "reason") || null,
        cancelled_at: null
      },
      { onConflict: "staff_id,date" }
    )
    .select("*")
    .single();
  if (error) throw error;
  await logAudit(db, "request_leave", staff.name, { date });
  return ok({ leave: data });
}

async function cancelLeave(db: Db, request: NextRequest, body: Body) {
  const session = await requireSession(request, "staff");
  const leaveId = stringBody(body, "leaveId");
  if (!leaveId) throw new HttpError("Leave ID wajib diisi");
  const { staff } = await getStaffWithOutlet(db, session.sub);
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
  if (path === "/admin/attendance/bulk" && method === "POST") return adminAttendanceBulk(db, body);
  if (path === "/admin/attendance") return adminAttendance(db, method, body);
  if (path === "/admin/payroll") return adminPayroll(db, method, body);
  if (path === "/admin/schedule") return adminSchedule(db, method, body);
  if (path === "/admin/leave") return adminLeave(db, method, body);
  if (path === "/admin/reports" && method === "GET") return adminReports(db, body);
  if (path === "/admin/report-cfg") return adminReportCfg(db, method, body);
  if (path === "/admin/dayoff") return adminDayoff(db, method, body);
  if (path === "/admin/staff-dayoff") return adminStaffDayoff(db, method, body);
  if (path === "/admin/config") return adminConfig(db, method, body);
  throw new HttpError("Endpoint admin tidak ditemukan", 404, "ADMIN_NOT_FOUND");
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
    active: body.active === undefined ? true : body.active === true || body.active === "true"
  };
  if (!payload.name) throw new HttpError("Nama outlet wajib diisi");
  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) throw new HttpError("Koordinat outlet wajib valid");

  if (method === "POST") {
    const { data, error } = await db.from("outlets").insert(payload).select("*").single();
    if (error) throw error;
    await logAudit(db, "admin_add_outlet", "Admin", { outletId: data.id, name: data.name });
    return ok({ outlet: toOutlet(data) });
  }

  if (method === "PUT") {
    const outletId = stringBody(body, "outletId") || stringBody(body, "id");
    if (!outletId) throw new HttpError("Outlet ID wajib diisi");
    const { data, error } = await db.from("outlets").update(payload).eq("id", outletId).select("*").single();
    if (error) throw error;
    await logAudit(db, "admin_update_outlet", "Admin", { outletId });
    return ok({ outlet: toOutlet(data) });
  }

  throw new HttpError("Method outlet tidak valid", 405);
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
    ["late_minutes", "deduction", "final_salary", "status", "paid_status"].forEach((key) => {
      if (body[key] !== undefined && body[key] !== "") updates[key] = body[key];
    });
    if (body.checkin_time) updates.checkin_time = dateTimeUtc(existing.date, String(body.checkin_time).slice(0, 5)).toISOString();
    if (body.checkout_time) updates.checkout_time = dateTimeUtc(existing.date, String(body.checkout_time).slice(0, 5)).toISOString();
    const { data, error } = await db.from("attendance").update(updates).eq("id", attendanceId).select("*").single();
    if (error) throw error;
    await logAudit(db, "admin_revise_attendance", "Admin", { attendanceId, note: updates.revision_note });
    return ok({ attendance: data });
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
      const totalEarned = rows.reduce((sum, row) => sum + normalizeCurrency(row.final_salary), 0);
      const totalPaid = pays.reduce((sum, row) => sum + normalizeCurrency(row.amount), 0);
      return { ...member, attendance: rows, payments: pays, totalEarned, totalPaid, balance: totalEarned - totalPaid };
    });
    return ok({ payroll });
  }

  if (method === "POST") {
    const staffId = stringBody(body, "staffId");
    const dateFrom = stringBody(body, "dateFrom");
    const dateTo = stringBody(body, "dateTo");
    const amount = numberBody(body, "amount");
    if (!staffId || !dateFrom || !dateTo || amount <= 0) {
      throw new HttpError("Staff, range tanggal, dan jumlah bayar wajib diisi");
    }
    const { data: staff, error: staffError } = await db.from("staff").select("id,name").eq("id", staffId).single();
    if (staffError) throw staffError;
    const { data: rows, error: rowsError } = await db
      .from("attendance")
      .select("*")
      .eq("staff_id", staffId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .eq("paid_status", false);
    if (rowsError) throw rowsError;
    const earned = (rows || []).reduce((sum, row) => sum + normalizeCurrency(row.final_salary), 0);
    const proofId = crypto.randomUUID();
    const proofUrl = body.proof ? await uploadImage(db, `payments/proof/${proofId}.jpg`, body.proof) : "";
    const overpayment = Math.max(0, amount - earned);
    const note = [stringBody(body, "note"), overpayment ? `[LEBIH_BAYAR:${overpayment}]` : ""].filter(Boolean).join(" ");
    const { data: payment, error } = await db
      .from("payments")
      .insert({
        id: proofId,
        staff_id: staffId,
        staff_name: staff.name,
        amount,
        date_from: dateFrom,
        date_to: dateTo,
        proof_url: proofUrl || null,
        note: note || null
      })
      .select("*")
      .single();
    if (error) throw error;
    if ((rows || []).length) {
      const ids = rows.map((row) => row.id);
      const { error: updateError } = await db
        .from("attendance")
        .update({ paid_status: true, payment_id: payment.id })
        .in("id", ids);
      if (updateError) throw updateError;
    }
    await logAudit(db, "admin_process_payment", "Admin", { staffId, amount, dateFrom, dateTo, overpayment });
    return ok({ payment, earned, overpayment });
  }

  throw new HttpError("Method payroll tidak valid", 405);
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
    const { data: outlet, error: outletError } = await db.from("outlets").select("shift_mode").eq("id", outletId).single();
    if (outletError) throw outletError;
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
      const { data: staff, error: staffError } = await db.from("staff").select("id,name").eq("id", staffId).single();
      if (staffError) throw staffError;
      staffName = staff.name;
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
    return ok({ schedule: data });
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
    let query = db.from("leave_requests").select("*").order("date", { ascending: false });
    if (body.staffId) query = query.eq("staff_id", body.staffId);
    if (body.outletId) query = query.eq("outlet_id", body.outletId);
    if (body.status) query = query.eq("status", body.status);
    if (body.dateFrom) query = query.gte("date", body.dateFrom);
    if (body.dateTo) query = query.lte("date", body.dateTo);
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return ok({ leaves: data || [] });
  }

  if (method === "PUT" || method === "POST") {
    const leaveId = stringBody(body, "leaveId") || stringBody(body, "id");
    const status = stringBody(body, "status", "approved");
    if (!leaveId) throw new HttpError("Leave ID wajib diisi");
    if (!["approved", "cancelled", "pending"].includes(status)) throw new HttpError("Status cuti tidak valid");
    const { data: leave, error: leaveError } = await db.from("leave_requests").select("*").eq("id", leaveId).single();
    if (leaveError) throw leaveError;
    const { data, error } = await db
      .from("leave_requests")
      .update({ status, cancelled_at: status === "cancelled" ? new Date().toISOString() : null })
      .eq("id", leaveId)
      .select("*")
      .single();
    if (error) throw error;
    if (status === "approved") {
      await db
        .from("shift_schedule")
        .update({
          staff_id: null,
          staff_name: null,
          status: "open",
          cancelled_at: new Date().toISOString(),
          cancel_reason: "Cuti disetujui admin"
        })
        .eq("staff_id", leave.staff_id)
        .eq("date", leave.date);
    }
    await logAudit(db, "admin_update_leave", "Admin", { leaveId, status });
    return ok({ leave: data });
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
        payload.push({
          outlet_id: outletId,
          type,
          label,
          required: item.required !== false,
          example_photo_url: uploadedExampleUrl || existingExampleUrl,
          sort_order: Number(item.sort_order ?? index)
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
        sort_order: numberBody(body, "sort_order", 0)
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
    const { data: outlet, error: outletError } = await db.from("outlets").select("shift_mode").eq("id", outletId).single();
    if (outletError) throw outletError;
    if (Number(outlet.shift_mode) !== 2) throw new HttpError("Hari libur shift hanya untuk outlet 2 shift");
    const payload: { outlet_id: string; date: string; shift: number }[] = [];
    for (let date = dateFrom; date <= dateTo; date = addDays(date, 1)) {
      for (const shift of shifts) {
        if ([1, 2].includes(Number(shift))) payload.push({ outlet_id: outletId, date, shift: Number(shift) });
      }
      if (payload.length > 366 * 2) break;
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
    { count: leaveCount }
  ] = await Promise.all([
    db.from("attendance").select("id", { count: "exact", head: true }).eq("staff_id", staffId),
    db.from("reports").select("id", { count: "exact", head: true }).eq("staff_id", staffId),
    db.from("payments").select("id", { count: "exact", head: true }).eq("staff_id", staffId),
    db.from("staff_shift_assignments").select("id", { count: "exact", head: true }).eq("staff_id", staffId),
    db.from("leave_requests").select("id", { count: "exact", head: true }).eq("staff_id", staffId)
  ]);
  const attendanceCount = attCount ?? 0;
  const reportCount = repCount ?? 0;
  const paymentCount = payCount ?? 0;
  const scheduleCount = schedCount ?? 0;
  const leaveCount2 = leaveCount ?? 0;
  const totalDependencies = attendanceCount + reportCount + paymentCount + scheduleCount + leaveCount2;
  return {
    attendanceCount,
    reportCount,
    paymentCount,
    scheduleCount,
    leaveCount: leaveCount2,
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

    const { data: staffRow } = await db
      .from("staff")
      .select("id,name,outlet_id,active")
      .eq("id", staffId)
      .maybeSingle();
    if (!staffRow || !staffRow.active) {
      throw new HttpError("Staff tidak ditemukan atau tidak aktif", 404, "STAFF_NOT_FOUND");
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
