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
};

export type ReportCfg = {
  id: string;
  outlet_id: string;
  type: "BUKA" | "TUTUP";
  label: string;
  required: boolean;
  example_photo_url: string | null;
  sort_order: number;
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

export type SessionPayload = {
  sub: string;
  role: Role;
  name?: string;
  outlet_id?: string | null;
};

export type ApiOk<T> = T & { ok: true };
export type ApiError = { ok: false; error: string; errorCode?: string };
export type ApiResult<T> = ApiOk<T> | ApiError;
