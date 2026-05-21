import type { Outlet } from "@/types/domain";

export const APP_TIME_ZONE = "Asia/Jakarta";
export const REPORT_TIME_ZONE = "Asia/Makassar";

// Jam kerja baru dimulai setelah jam ini. Sebelumnya dianggap masih hari kerja sebelumnya.
// Contoh: 00:01–02:59 WIB masih dianggap hari kerja tanggal sebelumnya.
export const WORKING_DAY_CUTOFF_HOUR = 3;
export const DEFAULT_REPORT_WINDOWS = {
  BUKA: { start: "09:00", end: "11:00" },
  TUTUP: { start: "20:00", end: "01:00" }
} as const;

export type ReportType = "BUKA" | "TUTUP";

type DateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function localParts(date = new Date(), timeZone = APP_TIME_ZONE): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as DateParts;
}

export function todayJakarta(date = new Date()) {
  const p = localParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function timeJakarta(date = new Date()) {
  const p = localParts(date);
  return `${p.hour}:${p.minute}`;
}

export function timeMakassar(date = new Date()) {
  const p = localParts(date, REPORT_TIME_ZONE);
  return `${p.hour}:${p.minute}`;
}

export function hourJakarta(date = new Date()) {
  return Number(localParts(date).hour);
}

export function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return todayJakarta(date);
}

/**
 * Mengembalikan tanggal kerja efektif berdasarkan cutoff jam 03:00 WIB.
 * Waktu 00:00–02:59 WIB masih dianggap bagian dari hari kerja sebelumnya.
 */
export function getWorkingDate(now = new Date()) {
  const hour = hourJakarta(now);
  if (hour < WORKING_DAY_CUTOFF_HOUR) {
    return { date: addDays(todayJakarta(now), -1), usePrevDay: true };
  }
  return { date: todayJakarta(now), usePrevDay: false };
}

/** @deprecated Gunakan getWorkingDate() */
export const getEffectiveDate = getWorkingDate;

export function parseTimeToMinutes(time?: string | null) {
  if (!time) return null;
  const match = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function dateTimeUtc(date: string, time?: string | null) {
  const safeTime = time && /^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5) : "00:00";
  return new Date(`${date}T${safeTime}:00+07:00`);
}

export function isTimeWithinWindow(current: string, start?: string | null, end?: string | null) {
  const c = parseTimeToMinutes(current);
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (c === null || s === null || e === null) return false;
  if (s <= e) return c >= s && c <= e;
  return c >= s || c <= e;
}

export function reportWindow(
  outlet: Pick<
    Outlet,
    "report_buka_start" | "report_buka_end" | "report_tutup_start" | "report_tutup_end"
  > | null | undefined,
  type: ReportType
) {
  const configuredStart = type === "BUKA" ? outlet?.report_buka_start : outlet?.report_tutup_start;
  const configuredEnd = type === "BUKA" ? outlet?.report_buka_end : outlet?.report_tutup_end;
  const fallback = DEFAULT_REPORT_WINDOWS[type];
  const start = configuredStart || fallback.start;
  const end = configuredEnd || fallback.end;
  return {
    start,
    end,
    label: `${start.slice(0, 5)} - ${end.slice(0, 5)}`
  };
}

export function reportWindowStatus(
  outlet: Parameters<typeof reportWindow>[0],
  type: ReportType,
  now = new Date()
) {
  const window = reportWindow(outlet, type);
  const current = timeMakassar(now);
  return {
    ...window,
    current,
    timeZone: REPORT_TIME_ZONE,
    allowed: isTimeWithinWindow(current, window.start, window.end)
  };
}

export function reportSubmissionStatus(
  outlet: Parameters<typeof reportWindow>[0],
  type: ReportType,
  now = new Date()
) {
  const window = reportWindowStatus(outlet, type, now);
  const currentMinutes = parseTimeToMinutes(window.current);
  const startMinutes = parseTimeToMinutes(window.start);
  const endMinutes = parseTimeToMinutes(window.end);

  if (window.allowed || currentMinutes === null || startMinutes === null || endMinutes === null) {
    return {
      ...window,
      canSubmit: window.allowed,
      tooEarly: !window.allowed,
      isLate: false,
      lateMinutes: 0
    };
  }

  if (startMinutes <= endMinutes) {
    const isLate = currentMinutes > endMinutes;
    return {
      ...window,
      canSubmit: isLate,
      tooEarly: !isLate,
      isLate,
      lateMinutes: isLate ? currentMinutes - endMinutes : 0
    };
  }

  // Cross-midnight window, e.g. 20:00-01:00. Allow late submissions only
  // shortly after the closing boundary, before the working-day cutoff.
  const cutoffMinutes = WORKING_DAY_CUTOFF_HOUR * 60;
  const isLate = currentMinutes > endMinutes && currentMinutes < cutoffMinutes;
  return {
    ...window,
    canSubmit: isLate,
    tooEarly: !isLate,
    isLate,
    lateMinutes: isLate ? currentMinutes - endMinutes : 0
  };
}

export function detectShift(outlet: Outlet, now = new Date()): 0 | 1 | 2 {
  if (Number(outlet.shift_mode) === 1) return 0;
  const current = parseTimeToMinutes(timeJakarta(now)) ?? 0;
  const shift2Start = parseTimeToMinutes(outlet.shift2_start);
  if (shift2Start !== null && current >= shift2Start) return 2;
  // Sebelum cutoff dianggap masih bagian dari shift 2 hari sebelumnya
  if (hourJakarta(now) < WORKING_DAY_CUTOFF_HOUR) return 2;
  return 1;
}

/**
 * Cek apakah waktu absen masuk terlalu awal untuk shift yang ditentukan.
 * Staff diperbolehkan absen paling awal earlyWindowMinutes (default 60) menit sebelum shift mulai.
 * Contoh: Shift 2 mulai 19:00 → boleh absen mulai 18:00.
 */
export function isCheckinTooEarly(
  outlet: { shift1_start: string | null; shift2_start?: string | null },
  shift: 0 | 1 | 2,
  now = new Date(),
  earlyWindowMinutes = 60
): { tooEarly: boolean; windowOpensAt: string | null } {
  if (shift === 0) return { tooEarly: false, windowOpensAt: null };
  const startTime = shift === 2 ? (outlet.shift2_start ?? null) : (outlet.shift1_start ?? null);
  if (!startTime) return { tooEarly: false, windowOpensAt: null };

  const startMin = parseTimeToMinutes(startTime);
  if (startMin === null) return { tooEarly: false, windowOpensAt: null };

  const nowMin = parseTimeToMinutes(timeJakarta(now)) ?? 0;
  const nowHour = hourJakarta(now);

  // Hitung menit pembuka window (earlyWindowMinutes sebelum shift mulai)
  const windowOpensMin = startMin - earlyWindowMinutes;

  // Window crossing midnight (shift mulai sangat awal, misal 00:30) — tidak perlu cek
  if (windowOpensMin < 0) return { tooEarly: false, windowOpensAt: null };

  // Setelah tengah malam sebelum cutoff = masih sisa hari kerja sebelumnya — tidak perlu cek
  if (nowHour < WORKING_DAY_CUTOFF_HOUR) return { tooEarly: false, windowOpensAt: null };

  const tooEarly = nowMin < windowOpensMin;
  const windowOpensAt = tooEarly
    ? `${String(Math.floor(windowOpensMin / 60)).padStart(2, "0")}:${String(windowOpensMin % 60).padStart(2, "0")}`
    : null;

  return { tooEarly, windowOpensAt };
}

export function shiftStartTime(outlet: Outlet, shift: 0 | 1 | 2) {
  if (shift === 2) return outlet.shift2_start || outlet.shift1_start;
  return outlet.shift1_start;
}

export function calculateSalary(
  checkinTime: Date,
  shiftStart: Date,
  salaryPerShift: number,
  lateTolerance: number,
  deductionPerMinute: number
) {
  const diffMinutes = (checkinTime.getTime() - shiftStart.getTime()) / 60000;
  const rawLateMinutes = Math.max(0, diffMinutes - lateTolerance);
  const lateMinutes = Math.min(Math.floor(rawLateMinutes), 960);
  const deduction = Math.min(lateMinutes * deductionPerMinute, salaryPerShift);
  const finalSalary = Math.max(0, salaryPerShift - deduction);
  return { lateMinutes, deduction, finalSalary };
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeCurrency(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function sanitizePathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function formatDateRangeStart(date?: string | null) {
  return date || todayJakarta();
}

/**
 * Cek apakah staff sudah boleh absen keluar berdasarkan jam selesai shift.
 * Menggunakan timezone WITA (Asia/Makassar).
 * Shift yang selesai setelah tengah malam (mis. 01:00) ditangani secara khusus.
 */
export function isCheckoutTimeReached(
  shiftEnd: string | null | undefined,
  now = new Date()
): boolean {
  if (!shiftEnd) return true; // Tidak ada konfigurasi jam selesai → selalu boleh
  const currentWita = timeMakassar(now);
  const currentMin = parseTimeToMinutes(currentWita);
  const endMin = parseTimeToMinutes(shiftEnd);
  if (currentMin === null || endMin === null) return true;
  // Jika jam selesai shift ada setelah tengah malam (00:00 s.d. 02:59 WITA)
  if (endMin < WORKING_DAY_CUTOFF_HOUR * 60) {
    return currentMin < WORKING_DAY_CUTOFF_HOUR * 60 && currentMin >= endMin;
  }
  return currentMin >= endMin;
}

/**
 * Kembalikan jam selesai shift berdasarkan tipe shift.
 * shift 0 = full shift → gunakan shift2_end.
 * shift 1 → shift1_end.
 * shift 2 → shift2_end.
 */
export function shiftEndTime(
  outlet: { shift1_end: string | null; shift2_end?: string | null },
  shift: 0 | 1 | 2
): string | null {
  if (shift === 2) return outlet.shift2_end ?? null;
  if (shift === 0) return outlet.shift2_end ?? outlet.shift1_end ?? null;
  return outlet.shift1_end ?? null;
}
