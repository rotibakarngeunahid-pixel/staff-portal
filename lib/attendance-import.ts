import { calculateSalary, dateTimeUtc, normalizeCurrency, shiftStartTime } from "@/lib/business";
import type { Outlet } from "@/types/domain";

type Db = any;
type Row = Record<string, string>;

export type AttendanceImportMapping = Partial<Record<ImportField, string>>;

export type ImportField =
  | "staffId"
  | "staffName"
  | "outletId"
  | "outletName"
  | "date"
  | "shift"
  | "arrivalTime"
  | "reportTime"
  | "checkinTime"
  | "checkoutTime"
  | "finalCheckinTime"
  | "status"
  | "lateMinutes"
  | "deduction"
  | "finalSalary"
  | "flags"
  | "selfieIn"
  | "selfieOut"
  | "lat"
  | "lng"
  | "paidStatus"
  | "createdAt";

export type AttendanceImportPreviewRow = {
  rowNumber: number;
  status: "ready" | "success" | "failed" | "duplicate";
  statusLabel: string;
  reason: string;
  raw: Row;
  normalized: {
    staffName: string;
    outletName: string;
    date: string;
    shift: string;
    checkinTime: string;
    checkoutTime: string;
    finalSalary: number;
  };
  payload?: Record<string, unknown>;
};

export type AttendanceImportSummary = {
  totalRows: number;
  ready: number;
  imported: number;
  failed: number;
  duplicate: number;
  needsFix: number;
};

export type AttendanceImportPreview = {
  columns: string[];
  mapping: AttendanceImportMapping;
  rows: AttendanceImportPreviewRow[];
  summary: AttendanceImportSummary;
};

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_CSV_ROWS = 5000;

const FIELD_ALIASES: Record<ImportField, string[]> = {
  staffId: ["staff_id", "staff id", "id staff", "id karyawan", "employee_id", "employee id"],
  staffName: ["staff_name", "staff name", "nama staff", "nama karyawan", "karyawan", "staff", "employee_name", "nama"],
  outletId: ["outlet_id", "outlet id", "id outlet", "id cabang"],
  outletName: ["outlet_name", "outlet name", "nama outlet", "nama cabang", "outlet", "cabang"],
  date: ["date", "tanggal", "tgl", "hari"],
  shift: ["shift", "giliran", "jadwal"],
  arrivalTime: ["arrival_time", "arrival time", "jam datang", "datang"],
  reportTime: ["report_time", "report time", "jam laporan"],
  checkinTime: ["checkin_time", "checkin time", "check in", "jam masuk", "masuk", "absen masuk"],
  checkoutTime: ["checkout_time", "checkout time", "check out", "jam pulang", "pulang", "absen pulang"],
  finalCheckinTime: ["final_checkin_time", "final checkin time", "jam masuk final"],
  status: ["status", "status_absensi", "status absensi"],
  lateMinutes: ["late_minutes", "late minutes", "menit telat", "telat", "terlambat"],
  deduction: ["deduction", "potongan", "denda"],
  finalSalary: ["final_salary", "final salary", "gaji final", "gaji", "upah"],
  flags: ["flags", "flag", "catatan sistem"],
  selfieIn: ["selfie_in", "selfie in", "foto masuk"],
  selfieOut: ["selfie_out", "selfie out", "foto pulang"],
  lat: ["lat", "latitude"],
  lng: ["lng", "longitude", "lon", "long"],
  paidStatus: ["paid_status", "paid status", "status bayar", "sudah dibayar"],
  createdAt: ["created_at", "created at", "dibuat", "waktu dibuat"]
};

function toOutlet(raw: any): Outlet {
  return {
    ...raw,
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    radius_m: Number(raw.radius_m || 100),
    shift_mode: Number(raw.shift_mode || 1) === 2 ? 2 : 1
  };
}

export function isCsvUpload(value: unknown): value is File {
  if (!value || typeof value !== "object") return false;
  const file = value as File;
  return typeof file.name === "string" && typeof file.text === "function";
}

export function assertCsvFile(file: File) {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (!name.endsWith(".csv") && type !== "text/csv" && type !== "application/vnd.ms-excel") {
    throw new Error("File harus berformat CSV. Pilih file dengan akhiran .csv.");
  }
  if (file.size > MAX_CSV_BYTES) {
    throw new Error("Ukuran file terlalu besar. Maksimal 2 MB untuk sekali import.");
  }
}

export function parseMapping(input: unknown): AttendanceImportMapping {
  if (!input) return {};
  if (typeof input === "string") {
    try {
      return parseMapping(JSON.parse(input));
    } catch {
      return {};
    }
  }
  if (typeof input !== "object") return {};
  const allowed = new Set(Object.keys(FIELD_ALIASES));
  const mapping: AttendanceImportMapping = {};
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    if (allowed.has(key) && typeof value === "string") {
      const clean = value.trim();
      if (clean) mapping[key as ImportField] = clean;
    }
  });
  return mapping;
}

export async function previewAttendanceImport(
  db: Db,
  file: File,
  requestedMapping: AttendanceImportMapping = {}
): Promise<AttendanceImportPreview> {
  assertCsvFile(file);
  const parsed = parseCsv(await file.text());
  const mapping = { ...guessMapping(parsed.columns), ...requestedMapping };
  const rows = await validateRows(db, parsed.columns, parsed.rows, mapping);
  return {
    columns: parsed.columns,
    mapping,
    rows,
    summary: summarize(rows)
  };
}

export async function importAttendanceCsv(
  db: Db,
  file: File,
  requestedMapping: AttendanceImportMapping = {}
): Promise<AttendanceImportPreview> {
  const preview = await previewAttendanceImport(db, file, requestedMapping);
  const importable = preview.rows.filter((row) => row.status === "ready" && row.payload);

  if (importable.length > 0) {
    const payload = importable.map((row) => row.payload);
    const { data, error } = await db.from("attendance").insert(payload).select("id");
    if (error) {
      throw new Error(`Import dibatalkan. Tidak ada data baru yang disimpan karena database menolak data: ${error.message}`);
    }
    const insertedCount = Array.isArray(data) ? data.length : importable.length;
    if (insertedCount !== importable.length) {
      throw new Error("Import dibatalkan karena jumlah data tersimpan tidak sesuai dengan data yang dikirim.");
    }
  }

  const rows = preview.rows.map((row) =>
    row.status === "ready"
      ? { ...row, status: "success" as const, statusLabel: "Berhasil", reason: "Berhasil diimport" }
      : row
  );
  return {
    ...preview,
    rows,
    summary: summarize(rows)
  };
}

function parseCsv(text: string): { columns: string[]; rows: Row[] } {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) matrix.push(row);
      row = [];
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) matrix.push(row);
  if (matrix.length < 2) throw new Error("CSV tidak memiliki data. Pastikan baris pertama berisi nama kolom dan baris berikutnya berisi data.");

  const columns = matrix[0].map((value) => value.trim()).filter(Boolean);
  if (columns.length === 0) throw new Error("CSV tidak memiliki nama kolom.");
  if (matrix.length - 1 > MAX_CSV_ROWS) {
    throw new Error(`CSV terlalu banyak baris. Maksimal ${MAX_CSV_ROWS} baris untuk sekali import.`);
  }

  const rows = matrix.slice(1).map((values) => {
    const item: Row = {};
    columns.forEach((column, index) => {
      item[column] = (values[index] || "").trim();
    });
    return item;
  });

  return { columns, rows };
}

function guessMapping(columns: string[]) {
  const normalized = new Map(columns.map((column) => [normalizeKey(column), column]));
  const mapping: AttendanceImportMapping = {};
  Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => {
    const found = aliases.map(normalizeKey).map((alias) => normalized.get(alias)).find(Boolean);
    if (found) mapping[field as ImportField] = found;
  });
  return mapping;
}

async function validateRows(
  db: Db,
  columns: string[],
  rawRows: Row[],
  mapping: AttendanceImportMapping
): Promise<AttendanceImportPreviewRow[]> {
  const missingMapping = requiredMappingMessage(mapping);
  if (missingMapping) {
    return rawRows.map((row, index) => finalizeProblem(
      { rowNumber: index + 2, raw: row, normalized: emptyNormalized() },
      missingMapping
    ));
  }

  const [{ data: staffRows, error: staffError }, { data: outletRows, error: outletError }, cfg] = await Promise.all([
    db.from("staff").select("id,name,outlet_id,salary_per_shift,active,deleted_at").order("name"),
    db.from("outlets").select("*").order("name"),
    configMap(db)
  ]);
  if (staffError) throw staffError;
  if (outletError) throw outletError;

  const activeStaffRows = (staffRows || []).filter((staff: any) => staff.active !== false && !staff.deleted_at);
  const activeOutletRows = (outletRows || []).filter((outlet: any) => outlet.active !== false);
  const staffById = new Map<string, any>(activeStaffRows.map((staff: any) => [staff.id, staff]));
  const outletById = new Map<string, Outlet>(activeOutletRows.map((outlet: any) => [outlet.id, toOutlet(outlet)]));
  const staffByName = groupedByName(activeStaffRows);
  const outletByName = groupedByName(activeOutletRows);

  const lateTolerance = configNumber(cfg, "late_tolerance_minutes", 10);
  const deductionPerMinute = configNumber(cfg, "deduction_per_minute", configNumber(cfg, "late_deduction_per_minute", 1000));

  const prepared = rawRows.map((row, index) =>
    prepareRow({
      row,
      rowNumber: index + 2,
      columns,
      mapping,
      staffById,
      staffByName,
      outletById,
      outletByName,
      lateTolerance,
      deductionPerMinute
    })
  );

  const validPrepared = prepared.filter((row): row is PreparedRow & { payload: Record<string, unknown> } => Boolean(row.payload));
  const existing = await loadExistingAttendance(db, validPrepared);
  const seenDuplicateKeys = new Map<string, number>();
  const seenShiftKeys = new Map<string, number>();

  return prepared.map((row) => {
    if (!row.payload || row.problem) return finalizeProblem(row, row.problem || "Data belum lengkap.");

    const duplicateKey = row.duplicateKey || "";
    const shiftKey = row.shiftKey || "";
    const previousDuplicate = seenDuplicateKeys.get(duplicateKey);
    if (previousDuplicate) {
      return finalizeDuplicate(row, `Sama dengan baris ${previousDuplicate} di CSV ini.`);
    }
    seenDuplicateKeys.set(duplicateKey, row.rowNumber);

    const previousShift = seenShiftKeys.get(shiftKey);
    if (previousShift) {
      return finalizeProblem(row, `Bentrok dengan baris ${previousShift}. Sistem hanya menyimpan satu absen untuk staff, tanggal, dan shift yang sama.`);
    }
    seenShiftKeys.set(shiftKey, row.rowNumber);

    if (existing.duplicateKeys.has(duplicateKey)) {
      return finalizeDuplicate(row, "Data yang sama sudah ada di sistem.");
    }
    if (existing.shiftKeys.has(shiftKey)) {
      return finalizeProblem(row, "Data staff, tanggal, dan shift ini sudah ada di sistem dengan jam berbeda.");
    }

    return {
      rowNumber: row.rowNumber,
      status: "ready",
      statusLabel: "Siap import",
      reason: row.warning || "",
      raw: row.raw,
      normalized: row.normalized,
      payload: row.payload
    };
  });
}

function requiredMappingMessage(mapping: AttendanceImportMapping) {
  const missing: string[] = [];
  if (!mapping.staffName && !mapping.staffId) missing.push("nama staff");
  if (!mapping.outletName && !mapping.outletId) missing.push("outlet");
  if (!mapping.date) missing.push("tanggal");
  if (!mapping.checkinTime) missing.push("jam masuk");
  if (missing.length === 0) return "";
  return `Pilih kolom ${missing.join(", ")} terlebih dahulu.`;
}

type PreparedRow = {
  rowNumber: number;
  raw: Row;
  normalized: AttendanceImportPreviewRow["normalized"];
  problem?: string;
  warning?: string;
  duplicateKey?: string;
  shiftKey?: string;
  payload?: Record<string, unknown>;
};

function prepareRow(args: {
  row: Row;
  rowNumber: number;
  columns: string[];
  mapping: AttendanceImportMapping;
  staffById: Map<string, any>;
  staffByName: Map<string, any[]>;
  outletById: Map<string, Outlet>;
  outletByName: Map<string, any[]>;
  lateTolerance: number;
  deductionPerMinute: number;
}): PreparedRow {
  const value = (field: ImportField) => cell(args.row, args.mapping[field]);
  const normalized = emptyNormalized();

  const staffLookup = findByIdOrName({
    id: value("staffId"),
    name: value("staffName"),
    byId: args.staffById,
    byName: args.staffByName,
    label: "staff"
  });
  const outletLookup = findByIdOrName({
    id: value("outletId"),
    name: value("outletName"),
    byId: args.outletById,
    byName: args.outletByName,
    label: "outlet"
  });

  if (!staffLookup.item) return problem(args.rowNumber, args.row, normalized, staffLookup.error);
  if (!outletLookup.item) return problem(args.rowNumber, args.row, normalized, outletLookup.error);

  const staff = staffLookup.item;
  const outlet = toOutlet(outletLookup.item);
  normalized.staffName = String(staff.name || "");
  normalized.outletName = outlet.name;

  const date = parseDate(value("date"));
  if (!date) return problem(args.rowNumber, args.row, normalized, "Tanggal tidak terbaca.");
  normalized.date = date;

  const checkin = parseDateTime(date, value("checkinTime"));
  if (!checkin) return problem(args.rowNumber, args.row, normalized, "Jam masuk tidak terbaca.");
  const checkout = parseDateTime(date, value("checkoutTime"));
  const arrival = parseDateTime(date, value("arrivalTime"));
  const report = parseDateTime(date, value("reportTime"));
  const finalCheckin = parseDateTime(date, value("finalCheckinTime")) || checkin;

  normalized.checkinTime = displayTime(checkin);
  normalized.checkoutTime = checkout ? displayTime(checkout) : "-";

  const shift = parseShift(value("shift"), outlet, checkin);
  if (shift === null) return problem(args.rowNumber, args.row, normalized, "Shift tidak terbaca. Isi 0, 1, 2, Full, Shift 1, atau Shift 2.");
  normalized.shift = shift === 0 ? "Full" : `Shift ${shift}`;

  const calculated = calculateSalary(
    new Date(checkin),
    dateTimeUtc(date, shiftStartTime(outlet, shift)),
    normalizeCurrency(staff.salary_per_shift),
    args.lateTolerance,
    args.deductionPerMinute
  );
  const lateMinutes = parseInteger(value("lateMinutes"), calculated.lateMinutes);
  const deduction = parseMoney(value("deduction"), calculated.deduction);
  const finalSalary = parseMoney(value("finalSalary"), Math.max(0, normalizeCurrency(staff.salary_per_shift) - deduction));
  normalized.finalSalary = finalSalary;

  const flags = mergeFlags(value("flags"), checkout ? "" : "MISSING_CHECKOUT");
  const status = normalizeStatus(value("status"), lateMinutes, Boolean(checkin));
  const lat = parseNullableNumber(value("lat"));
  const lng = parseNullableNumber(value("lng"));
  const createdAt = parseDateTime(date, value("createdAt"));
  const paidStatus = parseBoolean(value("paidStatus"));

  const warning = checkout && new Date(checkout).getTime() < new Date(checkin).getTime()
    ? "Jam pulang lebih awal dari jam masuk. Data tetap bisa diimport, tetapi sebaiknya diperiksa."
    : "";

  const payload: Record<string, unknown> = {
    staff_id: staff.id,
    staff_name: staff.name,
    outlet_id: outlet.id,
    outlet_name: outlet.name,
    date,
    shift,
    arrival_time: arrival,
    report_time: report,
    checkin_time: checkin,
    checkout_time: checkout,
    final_checkin_time: finalCheckin,
    status,
    late_minutes: lateMinutes,
    deduction,
    final_salary: finalSalary,
    flags,
    selfie_in: value("selfieIn") || null,
    selfie_out: value("selfieOut") || null,
    lat,
    lng,
    paid_status: paidStatus ?? false,
    missing_checkout_flag: !checkout
  };
  if (createdAt) payload.created_at = createdAt;

  return {
    rowNumber: args.rowNumber,
    raw: args.row,
    normalized,
    warning,
    duplicateKey: attendanceDuplicateKey(staff.id, outlet.id, date, checkin, checkout),
    shiftKey: attendanceShiftKey(staff.id, date, shift),
    payload
  };
}

function emptyNormalized(): AttendanceImportPreviewRow["normalized"] {
  return {
    staffName: "",
    outletName: "",
    date: "",
    shift: "",
    checkinTime: "",
    checkoutTime: "",
    finalSalary: 0
  };
}

function problem(rowNumber: number, raw: Row, normalized: AttendanceImportPreviewRow["normalized"], reason?: string): PreparedRow {
  return { rowNumber, raw, normalized, problem: reason || "Data belum lengkap." };
}

function finalizeProblem(row: PreparedRow, reason: string): AttendanceImportPreviewRow {
  return {
    rowNumber: row.rowNumber,
    status: "failed",
    statusLabel: "Perlu diperbaiki",
    reason,
    raw: row.raw,
    normalized: row.normalized
  };
}

function finalizeDuplicate(row: PreparedRow, reason: string): AttendanceImportPreviewRow {
  return {
    rowNumber: row.rowNumber,
    status: "duplicate",
    statusLabel: "Duplikat",
    reason,
    raw: row.raw,
    normalized: row.normalized
  };
}

async function loadExistingAttendance(db: Db, rows: Array<PreparedRow & { payload: Record<string, unknown> }>) {
  if (rows.length === 0) return { duplicateKeys: new Set<string>(), shiftKeys: new Set<string>() };
  const staffIds = [...new Set(rows.map((row) => String(row.payload.staff_id)))];
  const dates = rows.map((row) => String(row.payload.date)).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const { data, error } = await db
    .from("attendance")
    .select("staff_id,outlet_id,date,shift,checkin_time,checkout_time")
    .in("staff_id", staffIds)
    .gte("date", minDate)
    .lte("date", maxDate)
    .range(0, 9999);
  if (error) throw error;

  const duplicateKeys = new Set<string>();
  const shiftKeys = new Set<string>();
  (data || []).forEach((item: any) => {
    duplicateKeys.add(attendanceDuplicateKey(item.staff_id, item.outlet_id, item.date, item.checkin_time, item.checkout_time));
    shiftKeys.add(attendanceShiftKey(item.staff_id, item.date, Number(item.shift)));
  });
  return { duplicateKeys, shiftKeys };
}

async function configMap(db: Db): Promise<Record<string, string>> {
  const { data, error } = await db.from("config").select("key,value");
  if (error) throw error;
  return Object.fromEntries((data || []).map((row: any) => [row.key, row.value]));
}

function configNumber(cfg: Record<string, string>, key: string, fallback: number) {
  const value = Number(cfg[key]);
  return Number.isFinite(value) ? value : fallback;
}

function groupedByName<T extends { name: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const key = normalizeName(item.name);
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  });
  return map;
}

function findByIdOrName<T extends { id: string; name: string }>(args: {
  id: string;
  name: string;
  byId: Map<string, T>;
  byName: Map<string, T[]>;
  label: "staff" | "outlet";
}) {
  if (args.id && args.byId.has(args.id)) return { item: args.byId.get(args.id) };
  if (!args.name) {
    return { error: args.label === "staff" ? "Nama staff kosong." : "Nama outlet kosong." };
  }
  const matches = args.byName.get(normalizeName(args.name)) || [];
  if (matches.length === 1) return { item: matches[0] };
  if (matches.length > 1) {
    return { error: args.label === "staff" ? "Nama staff ditemukan lebih dari satu. Gunakan ID staff atau rapikan nama." : "Nama outlet ditemukan lebih dari satu. Gunakan ID outlet atau rapikan nama." };
  }
  return { error: args.label === "staff" ? `Staff "${args.name}" tidak ditemukan di sistem.` : `Outlet "${args.name}" tidak ditemukan di sistem.` };
}

function cell(row: Row, column?: string) {
  if (!column) return "";
  return String(row[column] ?? "").trim();
}

function parseDate(input: string) {
  const value = input.trim();
  if (!value) return "";
  const datePart = value.split(/[ T]/)[0];
  let match = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) return ymd(match[1], match[2], match[3]);
  match = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) return ymd(match[3], match[2], match[1]);

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 25000 && numeric < 80000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + numeric * 86400000);
    return ymd(String(date.getUTCFullYear()), String(date.getUTCMonth() + 1), String(date.getUTCDate()));
  }
  return "";
}

function ymd(year: string, month: string, day: string) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return "";
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const result = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(`${result}T00:00:00Z`);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) return "";
  return result;
}

function parseDateTime(rowDate: string, input: string) {
  const value = input.trim();
  if (!value) return null;
  const normalized = value.replace("T", " ");
  const dateMatch = normalized.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\s+(.+)$/);
  if (dateMatch) {
    const date = parseDate(dateMatch[1]);
    const time = parseTime(dateMatch[2]);
    return date && time ? dateTimeUtc(date, time).toISOString() : null;
  }

  const time = parseTime(value);
  return time ? dateTimeUtc(rowDate, time).toISOString() : null;
}

function parseTime(input: string) {
  const value = input.trim();
  const match = value.match(/^(\d{1,2})(?::|\.)(\d{1,2})(?::\d{1,2})?/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseShift(input: string, outlet: Outlet, checkinIso: string): 0 | 1 | 2 | null {
  const value = normalizeKey(input);
  if (!value) {
    if (outlet.shift_mode === 1) return 0;
    const checkinMinutes = timeMinutes(displayTime(checkinIso));
    const shift2Minutes = timeMinutes(String(outlet.shift2_start || ""));
    if (checkinMinutes !== null && shift2Minutes !== null && checkinMinutes >= shift2Minutes) return 2;
    return 1;
  }
  if (["0", "full", "full shift", "fullday", "all"].includes(value)) return 0;
  if (["1", "s1", "shift 1", "shift1"].includes(value)) return 1;
  if (["2", "s2", "shift 2", "shift2"].includes(value)) return 2;
  return null;
}

function normalizeStatus(input: string, lateMinutes: number, hasCheckin: boolean) {
  const value = normalizeKey(input);
  if (["off", "libur"].includes(value)) return "off";
  if (["absent", "absen", "alfa", "tidak hadir"].includes(value)) return "absent";
  if (["pending", "menunggu"].includes(value)) return "pending";
  if (lateMinutes > 0) return "late";
  if (hasCheckin) return "present";
  return "pending";
}

function mergeFlags(existing: string, extra: string) {
  const parts = ["IMPORT_CSV", existing, extra]
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(parts)].join(",");
}

function parseInteger(input: string, fallback: number) {
  const value = Number(input);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function parseMoney(input: string, fallback: number) {
  if (!input.trim()) return fallback;
  const cleaned = input.replace(/[^\d,.-]/g, "");
  if (!cleaned) return fallback;
  const normalized = cleaned.includes(",") && cleaned.includes(".")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.includes(".") && /^\d{1,3}(\.\d{3})+$/.test(cleaned)
      ? cleaned.replace(/\./g, "")
      : cleaned.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function parseNullableNumber(input: string) {
  if (!input.trim()) return null;
  const value = Number(input.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseBoolean(input: string) {
  const value = normalizeKey(input);
  if (!value) return null;
  if (["true", "1", "yes", "ya", "y", "sudah"].includes(value)) return true;
  if (["false", "0", "no", "tidak", "n", "belum"].includes(value)) return false;
  return null;
}

function displayTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }
  const fallback = iso.match(/\d{1,2}:\d{2}/);
  return fallback ? fallback[0] : "";
}

function timeMinutes(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function attendanceDuplicateKey(staffId: string, outletId: string, date: string, checkinIso: string | null, checkoutIso: string | null) {
  return [
    staffId,
    outletId,
    date.slice(0, 10),
    checkinIso ? displayTime(String(checkinIso)) : "",
    checkoutIso ? displayTime(String(checkoutIso)) : ""
  ].join("|");
}

function attendanceShiftKey(staffId: string, date: string, shift: number) {
  return `${staffId}|${date.slice(0, 10)}|${shift}`;
}

function summarize(rows: AttendanceImportPreviewRow[]): AttendanceImportSummary {
  const imported = rows.filter((row) => row.status === "success").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const duplicate = rows.filter((row) => row.status === "duplicate").length;
  const ready = rows.filter((row) => row.status === "ready").length;
  return {
    totalRows: rows.length,
    ready,
    imported,
    failed,
    duplicate,
    needsFix: failed
  };
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value: string) {
  return normalizeKey(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
