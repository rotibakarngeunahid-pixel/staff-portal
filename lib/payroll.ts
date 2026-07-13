import { normalizeCurrency } from "@/lib/business";

export type PayrollShiftRow = {
  id: string;
  date: string;
  shift: number;
  final_salary: number;
  paid_status?: boolean;
  checkin_time?: string | null;
  checkout_time?: string | null;
};

/**
 * Sebuah shift HANYA dihitung ke gaji jika absen masuk DAN absen keluar lengkap.
 * Jika salah satu (atau keduanya) tidak tercatat, shift itu tidak menghasilkan gaji.
 * Aturan ini jadi satu-satunya sumber kebenaran untuk "shift terhitung" di seluruh
 * kalkulasi payroll (staff & admin) agar konsisten dan tidak bisa dimanipulasi UI.
 */
export function isShiftCounted(row: {
  checkin_time?: string | null;
  checkout_time?: string | null;
}): boolean {
  return Boolean(row.checkin_time) && Boolean(row.checkout_time);
}

/**
 * Shift yang sudah PASTI tidak dibayar: sudah absen masuk, tidak pernah absen
 * keluar, dan tanggal shift sudah lewat (bukan hari ini — staff yang masih
 * bertugas hari ini belum tentu lupa checkout, jadi tidak dihitung "rugi").
 */
export function isIncompleteUnpaid(
  row: { checkin_time?: string | null; checkout_time?: string | null; date: string },
  referenceDate: string
): boolean {
  return Boolean(row.checkin_time) && !row.checkout_time && row.date < referenceDate;
}

export type PayrollPaymentStatus = "lunas" | "sebagian" | "belum_lunas";

export type PayrollAllocationResult = {
  covered: PayrollShiftRow[];
  uncovered: PayrollShiftRow[];
  totalCovered: number;
  overpayment: number;
  remainingUnpaidSalary: number;
  paidShiftCount: number;
  unpaidShiftCount: number;
};

export type PayrollSummary = {
  totalEarned: number;
  totalPaid: number;
  balance: number;
  status: PayrollPaymentStatus;
  statusLabel: string;
  paidShiftCount: number;
  unpaidShiftCount: number;
  paidShifts: Array<{ id: string; date: string; shift: number; final_salary: number }>;
  unpaidShifts: Array<{ id: string; date: string; shift: number; final_salary: number }>;
};

export function payrollStatusLabel(status: PayrollPaymentStatus): string {
  const labels: Record<PayrollPaymentStatus, string> = {
    lunas: "Lunas",
    sebagian: "Sebagian Dibayar",
    belum_lunas: "Belum Lunas"
  };
  return labels[status];
}

export function compareAttendanceChronological(a: PayrollShiftRow, b: PayrollShiftRow) {
  const dateCmp = a.date.localeCompare(b.date);
  if (dateCmp !== 0) return dateCmp;
  return a.shift - b.shift;
}

export function resolvePaymentStatus(balance: number, paidShiftCount: number): PayrollPaymentStatus {
  if (normalizeCurrency(balance) <= 0) return "lunas";
  if (paidShiftCount <= 0) return "belum_lunas";
  return "sebagian";
}

/**
 * Alokasi pembayaran berdasarkan nominal (FIFO: shift terlama dulu).
 * Satu shift hanya ditandai lunas jika nominal mencukupi gaji penuh shift tersebut.
 */
export function allocatePaymentByAmount(
  unpaidRows: PayrollShiftRow[],
  amount: number
): PayrollAllocationResult {
  const sorted = [...unpaidRows].sort(compareAttendanceChronological);
  const covered: PayrollShiftRow[] = [];
  let remaining = normalizeCurrency(amount);

  for (const row of sorted) {
    const salary = normalizeCurrency(row.final_salary);
    if (salary <= 0) {
      covered.push(row);
      continue;
    }
    if (remaining >= salary) {
      covered.push(row);
      remaining -= salary;
    } else {
      break;
    }
  }

  const coveredIds = new Set(covered.map((row) => row.id));
  const uncovered = sorted.filter((row) => !coveredIds.has(row.id));
  const totalCovered = covered.reduce((sum, row) => sum + normalizeCurrency(row.final_salary), 0);

  return {
    covered,
    uncovered,
    totalCovered,
    overpayment: Math.max(0, normalizeCurrency(amount) - totalCovered),
    remainingUnpaidSalary: uncovered.reduce((sum, row) => sum + normalizeCurrency(row.final_salary), 0),
    paidShiftCount: covered.length,
    unpaidShiftCount: uncovered.length
  };
}

export function allocatePaymentByDates(
  unpaidRows: PayrollShiftRow[],
  attendanceIds: string[]
): PayrollAllocationResult & { missingIds: string[] } {
  const idSet = new Set(attendanceIds.filter(Boolean));
  const byId = new Map(unpaidRows.map((row) => [row.id, row]));
  const missingIds = [...idSet].filter((id) => !byId.has(id));
  const covered = [...idSet]
    .map((id) => byId.get(id))
    .filter((row): row is PayrollShiftRow => Boolean(row))
    .sort(compareAttendanceChronological);

  const coveredIds = new Set(covered.map((row) => row.id));
  const uncovered = unpaidRows.filter((row) => !coveredIds.has(row.id));
  const totalCovered = covered.reduce((sum, row) => sum + normalizeCurrency(row.final_salary), 0);

  return {
    covered,
    uncovered,
    totalCovered,
    overpayment: 0,
    remainingUnpaidSalary: uncovered.reduce((sum, row) => sum + normalizeCurrency(row.final_salary), 0),
    paidShiftCount: covered.length,
    unpaidShiftCount: uncovered.length,
    missingIds
  };
}

export function buildPayrollSummary(
  attendance: PayrollShiftRow[],
  payments: Array<{ amount: number }>
): PayrollSummary {
  const rows = attendance || [];
  // Hanya shift dengan absen masuk + absen keluar lengkap yang menghasilkan gaji.
  // Shift tak lengkap diabaikan total dari semua angka & rincian payroll.
  const countedRows = rows.filter(isShiftCounted);
  const totalEarned = countedRows.reduce((sum, row) => sum + normalizeCurrency(row.final_salary), 0);
  const totalPaid = (payments || []).reduce((sum, row) => sum + normalizeCurrency(row.amount), 0);

  const paidShifts = countedRows
    .filter((row) => row.paid_status)
    .sort(compareAttendanceChronological)
    .map((row) => ({
      id: row.id,
      date: row.date,
      shift: row.shift,
      final_salary: normalizeCurrency(row.final_salary)
    }));

  const unpaidShifts = countedRows
    .filter((row) => !row.paid_status)
    .sort(compareAttendanceChronological)
    .map((row) => ({
      id: row.id,
      date: row.date,
      shift: row.shift,
      final_salary: normalizeCurrency(row.final_salary)
    }));

  // Saldo gaji tertahan dihitung langsung dari shift yang paid_status-nya masih
  // false, BUKAN dari (totalEarned - totalPaid). Nominal transfer bisa dibulatkan
  // lebih besar dari gaji shift yang tertutup (lebih-bayar), dan absen yang
  // sudah lunas bisa direvisi/dihapus admin setelahnya — keduanya bikin selisih
  // total vs total melenceng dari saldo sebenarnya, dan diam-diam "menelan" gaji
  // shift baru yang sebetulnya belum dibayar (Sisa Gaji nampak Rp0 padahal ada
  // baris berstatus "Belum" di rincian shift).
  const balance = unpaidShifts.reduce((sum, row) => sum + row.final_salary, 0);
  const status = resolvePaymentStatus(balance, paidShifts.length);

  return {
    totalEarned,
    totalPaid,
    balance,
    status,
    statusLabel: payrollStatusLabel(status),
    paidShiftCount: paidShifts.length,
    unpaidShiftCount: unpaidShifts.length,
    paidShifts,
    unpaidShifts
  };
}

export function shiftLabel(shift: number) {
  return shift === 0 ? "Full" : `Shift ${shift}`;
}

/** Denda info libur di hari-H (bukan H-1), sesuai SOP sanksi pelanggaran prosedur libur. */
export const LATE_LEAVE_NOTICE_FINE_AMOUNT = 15000;
export const LATE_LEAVE_NOTICE_FINE_REASON = "Info libur di hari-H, bukan H-1";
