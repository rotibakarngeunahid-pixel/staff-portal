export type Role = "staff" | "admin";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ConfigMap = Record<string, string>;

export type Outlet = {
  id: string;
  name: string;
  location_url: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  shift_mode: 1 | 2;
  shift1_start: string;
  shift1_end: string;
  shift2_start: string | null;
  shift2_end: string | null;
  report_buka_start: string | null;
  report_buka_end: string | null;
  report_tutup_start: string | null;
  report_tutup_end: string | null;
  active: boolean;
  inventory_branch_id: string | null;
  created_at?: string;
};

export type Staff = {
  id: string;
  name: string;
  pin_hash?: string;
  salary_per_shift: number;
  outlet_id: string | null;
  active: boolean;
  photo_url: string | null;
  ktp_no: string | null;
  ktp_photo_url: string | null;
  address: string | null;
  phone: string | null;
  created_at?: string;
  outlets?: Outlet | null;
  // PRD §11.5 — safe delete fields
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  archived_at?: string | null;
};

export type Attendance = {
  id: string;
  staff_id: string;
  staff_name: string;
  outlet_id: string;
  outlet_name: string;
  date: string;
  shift: 0 | 1 | 2;
  arrival_time: string | null;
  report_time: string | null;
  checkin_time: string | null;
  checkout_time: string | null;
  final_checkin_time: string | null;
  status: "pending" | "present" | "absent" | "late" | "off";
  late_minutes: number;
  deduction: number;
  final_salary: number;
  flags: string | null;
  selfie_in: string | null;
  selfie_out: string | null;
  lat: number | null;
  lng: number | null;
  paid_status: boolean;
  payment_id: string | null;
  revision_note: string | null;
  revised_at: string | null;
  revised_by: string | null;
  original_late_minutes: number | null;
  original_deduction: number | null;
  original_final_salary: number | null;
  created_at?: string;
  // PRD §11.3 — schedule linkage
  schedule_id?: string | null;
  shift_type?: ShiftType | null;
  client_request_id?: string | null;
  missing_checkout_flag?: boolean;
};

export type PhotoMode = "realtime" | "upload";

export type ReportCfg = {
  id: string;
  outlet_id: string;
  type: "BUKA" | "TUTUP";
  label: string;
  required: boolean;
  example_photo_url: string | null;
  sort_order: number;
  photo_mode: PhotoMode;
};

export type Report = {
  id: string;
  staff_id: string;
  staff_name: string;
  outlet_id: string;
  outlet_name: string;
  date: string;
  type: "BUKA" | "TUTUP";
  items_json: JsonValue;
  selfie: string | null;
  submitted_at: string;
  // PRD §11.4
  attendance_id?: string | null;
  schedule_id?: string | null;
  client_request_id?: string | null;
};

export type Payment = {
  id: string;
  staff_id: string;
  staff_name: string;
  amount: number;
  date_from: string;
  date_to: string;
  paid_at: string;
  proof_url: string | null;
  note: string | null;
};

export type ShiftSchedule = {
  id: string;
  outlet_id: string;
  date: string;
  shift: 1 | 2;
  staff_id: string | null;
  staff_name: string | null;
  status: "open" | "claimed" | "cancelled" | "off";
  requested_at: string | null;
  cancelled_at: string | null;
  note: string | null;
  created_by: string | null;
  cancel_reason: string | null;
  created_at?: string;
};

export type LeaveRequest = {
  id: string;
  outlet_id: string;
  staff_id: string;
  staff_name: string;
  date: string;
  status: "pending" | "approved" | "cancelled";
  reason: string | null;
  created_at: string;
  cancelled_at: string | null;
};

// ─── PRD §8.1 — Jadwal berbasis assignment staff ───────────────────────────

export type ShiftType = "SHIFT_1" | "SHIFT_2" | "FULL_SHIFT";

export type ScheduleStatus =
  | "confirmed"
  | "cancelled"
  | "admin_override"
  | "auto_cover"
  | "locked"
  | "completed"
  | "conflict";

export type ScheduleSource = "staff" | "admin" | "auto_dayoff" | "migration" | "checkin";

export type StaffShiftAssignment = {
  id: string;
  outlet_id: string;
  staff_id: string;
  staff_name: string;
  date: string;
  shift_type: ShiftType;
  status: ScheduleStatus;
  source: ScheduleSource;
  requested_at: string | null;
  confirmed_at: string;
  cancelled_at: string | null;
  locked_at: string | null;
  completed_at: string | null;
  overridden_from_id: string | null;
  note: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// ─── PRD §8.4 — Libur berbasis staff ──────────────────────────────────────

export type StaffDayoffStatus = "active" | "cancelled";
export type StaffDayoffSource = "admin" | "staff_request" | "migration";

export type StaffDayoff = {
  id: string;
  outlet_id: string;
  staff_id: string;
  staff_name: string;
  date: string;
  status: StaffDayoffStatus;
  source: StaffDayoffSource;
  leave_request_id: string | null;
  replacement_schedule_id: string | null;
  reason: string | null;
  created_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};

// ─── PRD §13 — State management staff home ────────────────────────────────

export type ScheduleState =
  | "loading"
  | "unassigned"
  | "dayoff"
  | "ready"
  | "locked"
  | "completed"
  | "error";

export type NextStep =
  | "checkin"
  | "report_buka"
  | "report_tutup"
  | "checkout"
  | "done"
  | "blocked";

export type DraftState =
  | "none"
  | "found"
  | "saving"
  | "saved"
  | "submit_pending"
  | "submitted"
  | "error";

// ─── PRD §8.2 — Draft foto ────────────────────────────────────────────────

export type DraftFlow =
  | "attendance_checkin"
  | "attendance_checkout"
  | "report_buka"
  | "report_tutup"
  | "report_cfg"
  | "payroll_payment"
  | "staff_profile";

export type UploadDraft = {
  id: string;
  schemaVersion: 1;
  role: "staff" | "admin";
  flow: DraftFlow;
  ownerId: string;
  outletId?: string;
  staffId?: string;
  date?: string;
  shiftType?: ShiftType;
  reportType?: "BUKA" | "TUTUP";
  formData: Record<string, unknown>;
  photos: Array<{ key: string; label: string; blob: Blob; mime: string; size: number }>;
  clientRequestId: string;
  submitHash?: string;
  status: "draft" | "saving" | "submitting" | "submitted" | "deleted";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

// ─── PRD §8.3 — Delete staff dependency preview ───────────────────────────

export type StaffDeletePreview = {
  staffId: string;
  staffName: string;
  attendanceCount: number;
  reportCount: number;
  paymentCount: number;
  scheduleCount: number;
  leaveCount: number;
  totalDependencies: number;
  canHardDelete: boolean;
};

// ─── Auth & API helpers ───────────────────────────────────────────────────

export type SessionPayload = {
  sub: string;
  role: Role;
  name?: string;
  outlet_id?: string | null;
};

export type ApiOk<T> = T & { ok: true };
export type ApiError = { ok: false; error: string; errorCode?: string };
export type ApiResult<T> = ApiOk<T> | ApiError;
