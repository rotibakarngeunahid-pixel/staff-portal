// Proyeksi Gaji — core service (pure functions, no DB calls)

// ─── Type Definitions ──────────────────────────────────────────────────────

export type PayrollPeriod = {
  periodStart: string;
  periodEnd: string;
  nextPayday: string;
};

export type HistoricalPeriod = {
  start: string;
  end: string;
};

export type AttendanceRow = {
  staff_id: string;
  date: string;
  checkin_time: string | null;
  status: string;
  final_salary: number;
  paid_status: boolean;
  flags: string | null;
};

export type DayoffRow = {
  staff_id: string;
  date: string;
  status: string;
};

export type AssignmentRow = {
  staff_id: string;
  date: string;
  shift_type: string;
  status: string;
};

export type PaymentRow = {
  staff_id: string;
  amount: number;
  date_from: string | null;
  date_to: string | null;
};

export type PeriodSummary = {
  workedUnits: number;
  totalSalary: number;
  totalDays: number;
};

export type ProjectionStatus = "normal" | "up" | "down" | "insufficient_data";

export type ProjectionInput = {
  staffId: string;
  staffName: string;
  outletId: string | null;
  outletName: string | null;
  salaryPerShift: number;
  firstAttendanceDate: string;
  paydayDay: number;
  asOfDate: string;
  periodStart: string;
  periodEnd: string;
  nextPayday: string;
  currentAttendance: AttendanceRow[];
  historySummaries: Array<PeriodSummary & { start: string; end: string }>;
  blockedDaysFuture: Set<string>;
  blockedDatesPast: Set<string>;
  pendingLeaveCount: number;
  futureAssignments: AssignmentRow[];
  payments: PaymentRow[];
};

export type StaffPayrollProjection = {
  staffId: string;
  staffName: string;
  outletId: string | null;
  outletName: string | null;
  firstAttendanceDate: string;
  paydayDay: number;
  nextPayday: string;
  periodStart: string;
  periodEnd: string;
  workedUnitsSoFar: number;
  formedSalary: number;
  projectedLow: number;
  projectedNormal: number;
  projectedHigh: number;
  fullAttendanceProjection: number;
  differenceFromPreviousPeriod: number;
  differencePercent: number;
  status: ProjectionStatus;
  statusLabel: string;
  confidenceScore: number;
  confidenceLabel: string;
  cashNeedNormal: number;
  remainingPotentialUnits: number;
  elapsedPotentialUnits: number;
  expectedAdditionalUnits: number;
};

export type InsufficientDataProjection = {
  staffId: string;
  staffName: string;
  outletId: string | null;
  outletName: string | null;
  firstAttendanceDate: null;
  paydayDay: null;
  nextPayday: null;
  periodStart: null;
  periodEnd: null;
  status: "insufficient_data";
  statusLabel: string;
  confidenceScore: 0;
  confidenceLabel: string;
  projectedNormal: 0;
  projectedLow: 0;
  projectedHigh: 0;
  fullAttendanceProjection: 0;
  formedSalary: 0;
  cashNeedNormal: 0;
  workedUnitsSoFar: 0;
  remainingPotentialUnits: 0;
  elapsedPotentialUnits: 0;
  expectedAdditionalUnits: 0;
  differenceFromPreviousPeriod: 0;
  differencePercent: 0;
};

export type AnyStaffProjection = StaffPayrollProjection | InsufficientDataProjection;

// ─── Pure Date Helpers ─────────────────────────────────────────────────────

export function lastDayOfMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

export function paydayForMonth(year: number, monthIdx: number, paydayDay: number): string {
  const day = Math.min(paydayDay, lastDayOfMonth(year, monthIdx));
  const m = String(monthIdx + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function addDateDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Returns number of calendar days from A to B (positive if B > A)
export function dateDiff(dateA: string, dateB: string): number {
  const a = new Date(`${dateA}T00:00:00Z`);
  const b = new Date(`${dateB}T00:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// ─── Period Resolution ─────────────────────────────────────────────────────

export function resolveNextPayday(paydayDay: number, asOfDate: string): string {
  const [yearStr, monthStr] = asOfDate.split("-");
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1;

  const thisMonthPayday = paydayForMonth(year, monthIdx, paydayDay);
  if (thisMonthPayday > asOfDate) return thisMonthPayday;

  const nextMonthIdx = monthIdx + 1;
  const nextYear = nextMonthIdx > 11 ? year + 1 : year;
  return paydayForMonth(nextYear, nextMonthIdx % 12, paydayDay);
}

export function resolvePayrollPeriod(paydayDay: number, asOfDate: string): PayrollPeriod {
  const nextPayday = resolveNextPayday(paydayDay, asOfDate);

  const [npYearStr, npMonthStr] = nextPayday.split("-");
  const npYear = parseInt(npYearStr, 10);
  const npMonthIdx = parseInt(npMonthStr, 10) - 1;

  const prevMonthIdx = npMonthIdx - 1;
  const prevYear = prevMonthIdx < 0 ? npYear - 1 : npYear;
  const normalizedPrevMonthIdx = ((prevMonthIdx % 12) + 12) % 12;

  const periodStart = paydayForMonth(prevYear, normalizedPrevMonthIdx, paydayDay);
  const periodEnd = addDateDays(nextPayday, -1);

  return { periodStart, periodEnd, nextPayday };
}

export function buildHistoricalPeriods(
  paydayDay: number,
  periodStart: string,
  count: number
): HistoricalPeriod[] {
  const periods: HistoricalPeriod[] = [];
  let currentStart = periodStart;

  for (let i = 0; i < count; i++) {
    const [yearStr, monthStr] = currentStart.split("-");
    const year = parseInt(yearStr, 10);
    const monthIdx = parseInt(monthStr, 10) - 1;

    const prevMonthIdx = monthIdx - 1;
    const prevYear = prevMonthIdx < 0 ? year - 1 : year;
    const normalizedPrevMonthIdx = ((prevMonthIdx % 12) + 12) % 12;

    const prevStart = paydayForMonth(prevYear, normalizedPrevMonthIdx, paydayDay);
    const prevEnd = addDateDays(currentStart, -1);

    periods.push({ start: prevStart, end: prevEnd });
    currentStart = prevStart;
  }

  return periods;
}

// ─── Attendance Analysis ───────────────────────────────────────────────────

export function isValidAttendanceRow(row: AttendanceRow): boolean {
  return (
    !!row.checkin_time &&
    (row.status === "present" || row.status === "late") &&
    row.final_salary > 0
  );
}

// Count calendar days in [startDate, endDate] minus blocked dates
export function countPotentialUnits(
  startDate: string,
  endDate: string,
  blockedDates: Set<string>
): number {
  if (startDate > endDate) return 0;
  const totalDays = dateDiff(startDate, endDate) + 1;
  let blocked = 0;
  for (const date of blockedDates) {
    if (date >= startDate && date <= endDate) blocked++;
  }
  return Math.max(0, totalDays - blocked);
}

export function summarizeAttendancePeriod(
  rows: AttendanceRow[],
  periodStart: string,
  periodEnd: string
): PeriodSummary {
  const periodRows = rows.filter(r => r.date >= periodStart && r.date <= periodEnd);
  const validRows = periodRows.filter(isValidAttendanceRow);
  return {
    workedUnits: validRows.length,
    totalSalary: validRows.reduce((sum, r) => sum + r.final_salary, 0),
    totalDays: dateDiff(periodStart, periodEnd) + 1
  };
}

// ─── Statistical Helpers ───────────────────────────────────────────────────

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ─── Confidence Score ─────────────────────────────────────────────────────

export type ConfidenceParams = {
  historicalPeriodCount: number;
  elapsedPeriodRatio: number;
  stdDevUnits: number;
  avgWorkUnits: number;
  missingDataLevel: "none" | "moderate" | "severe";
  pendingLeaveCount: number;
};

export function calculateProjectionConfidence(params: ConfidenceParams): number {
  let confidence = 50;

  confidence += Math.min(6, params.historicalPeriodCount) * 5;
  confidence += Math.min(20, params.elapsedPeriodRatio * 20);

  const variancePenalty =
    params.avgWorkUnits > 0
      ? Math.min(20, (params.stdDevUnits / params.avgWorkUnits) * 100)
      : 20;
  confidence -= variancePenalty;

  if (params.missingDataLevel === "severe") confidence -= 15;
  else if (params.missingDataLevel === "moderate") confidence -= 8;

  const pendingPenalty = Math.min(10, params.pendingLeaveCount * 3);
  confidence -= pendingPenalty;

  return clamp(Math.round(confidence), 35, 95);
}

export function confidenceLabel(score: number): string {
  if (score >= 85) return "Sangat yakin";
  if (score >= 70) return "Cukup yakin";
  if (score >= 55) return "Perlu perhatian";
  return "Data kurang";
}

// ─── Status ───────────────────────────────────────────────────────────────

export function projectionStatus(
  projectedNormal: number,
  previousPeriodSalary: number,
  hasHistory: boolean
): ProjectionStatus {
  if (!hasHistory || previousPeriodSalary <= 0) return "insufficient_data";
  const diff = projectedNormal - previousPeriodSalary;
  const pct = (diff / previousPeriodSalary) * 100;
  if (pct >= 8) return "up";
  if (pct <= -8) return "down";
  return "normal";
}

export function projectionStatusLabel(status: ProjectionStatus): string {
  const labels: Record<ProjectionStatus, string> = {
    normal: "Normal",
    up: "Naik",
    down: "Turun",
    insufficient_data: "Belum cukup data"
  };
  return labels[status];
}

// ─── Main Projection Calculator ────────────────────────────────────────────

export function calculatePayrollProjection(input: ProjectionInput): StaffPayrollProjection {
  const { salaryPerShift, asOfDate, periodStart, periodEnd } = input;

  // 1. Current period worked units & formed salary
  const effectiveEnd = asOfDate < periodEnd ? asOfDate : periodEnd;
  const validCurrentRows = input.currentAttendance.filter(
    r => r.date >= periodStart && r.date <= effectiveEnd && isValidAttendanceRow(r)
  );
  const workedUnitsSoFar = validCurrentRows.length;
  const formedSalary = validCurrentRows.reduce((sum, r) => sum + r.final_salary, 0);

  // 2. Potential units
  const elapsedPotentialUnits = countPotentialUnits(periodStart, effectiveEnd, input.blockedDatesPast);
  const tomorrowDate = addDateDays(asOfDate, 1);
  const remainingPotentialUnits =
    asOfDate >= periodEnd
      ? 0
      : countPotentialUnits(tomorrowDate, periodEnd, input.blockedDaysFuture);
  const maxPossibleUnits = workedUnitsSoFar + remainingPotentialUnits;

  // 3. Historical averages
  const usable = input.historySummaries.filter(h => h.totalDays > 0);
  const usable3 = usable.slice(0, 3);

  const totalHistoryUnits = usable.reduce((s, h) => s + h.workedUnits, 0);
  const totalHistorySalary = usable.reduce((s, h) => s + h.totalSalary, 0);

  const avgWork3 = usable3.length > 0
    ? usable3.reduce((s, h) => s + h.workedUnits, 0) / usable3.length
    : null;
  const avgWork6 = usable.length > 0 ? totalHistoryUnits / usable.length : null;

  const avgNetSalaryPerUnit =
    totalHistoryUnits > 0 ? totalHistorySalary / totalHistoryUnits : salaryPerShift;

  const stdDevUnits = standardDeviation(usable.map(h => h.workedUnits));

  // 4. Weighted historical target
  let weightedHistoricalTarget: number;
  if (avgWork3 !== null && avgWork6 !== null) {
    weightedHistoricalTarget = avgWork3 * 0.65 + avgWork6 * 0.35;
  } else if (avgWork3 !== null) {
    weightedHistoricalTarget = avgWork3;
  } else if (avgWork6 !== null) {
    weightedHistoricalTarget = avgWork6;
  } else {
    weightedHistoricalTarget = maxPossibleUnits;
  }

  // 5. Trend target
  const currentProgressRate = workedUnitsSoFar / Math.max(1, elapsedPotentialUnits);
  const trendTarget = workedUnitsSoFar + currentProgressRate * remainingPotentialUnits;

  // 6. Normal projected units
  const hasHistory = usable.length > 0;
  const normalRaw = hasHistory
    ? weightedHistoricalTarget * 0.6 + trendTarget * 0.4
    : trendTarget;

  const normalProjectedUnits = clamp(Math.round(normalRaw), workedUnitsSoFar, maxPossibleUnits);
  const expectedAdditionalUnits = normalProjectedUnits - workedUnitsSoFar;

  // 7. Projections
  const spread = clamp(Math.round(stdDevUnits), 1, 3);
  const lowUnits = clamp(normalProjectedUnits - spread, workedUnitsSoFar, maxPossibleUnits);
  const highUnits = clamp(normalProjectedUnits + spread, workedUnitsSoFar, maxPossibleUnits);

  const projectedNormal = formedSalary + expectedAdditionalUnits * avgNetSalaryPerUnit;
  const projectedLow = formedSalary + (lowUnits - workedUnitsSoFar) * avgNetSalaryPerUnit;
  const projectedHigh = formedSalary + (highUnits - workedUnitsSoFar) * avgNetSalaryPerUnit;

  // 8. Full attendance projection (day-by-day for FULL_SHIFT awareness)
  let fullAttendanceSalary = 0;
  if (remainingPotentialUnits > 0 && asOfDate < periodEnd) {
    const fullShiftDates = new Set(
      input.futureAssignments
        .filter(a => a.shift_type === "FULL_SHIFT")
        .map(a => a.date)
    );
    let d = tomorrowDate;
    while (d <= periodEnd) {
      if (!input.blockedDaysFuture.has(d)) {
        const dayRate = fullShiftDates.has(d) ? salaryPerShift * 2 : avgNetSalaryPerUnit;
        fullAttendanceSalary += dayRate;
      }
      d = addDateDays(d, 1);
    }
  }
  const fullAttendanceProjection = formedSalary + fullAttendanceSalary;

  // 9. Confidence
  const totalPotential = elapsedPotentialUnits + remainingPotentialUnits;
  const elapsedRatio = totalPotential > 0 ? elapsedPotentialUnits / totalPotential : 0;
  const confidenceScore = calculateProjectionConfidence({
    historicalPeriodCount: usable.length,
    elapsedPeriodRatio: elapsedRatio,
    stdDevUnits,
    avgWorkUnits: avgWork6 ?? 0,
    missingDataLevel: usable.length < 2 ? "severe" : usable.length < 3 ? "moderate" : "none",
    pendingLeaveCount: input.pendingLeaveCount
  });

  // 10. Status vs previous period
  const previousPeriodSalary = usable[0]?.totalSalary ?? 0;
  const status = projectionStatus(projectedNormal, previousPeriodSalary, hasHistory);
  const differenceFromPreviousPeriod = previousPeriodSalary > 0 ? projectedNormal - previousPeriodSalary : 0;
  const differencePercent =
    previousPeriodSalary > 0
      ? Math.round((differenceFromPreviousPeriod / previousPeriodSalary) * 100)
      : 0;

  // 11. Cash need — use paid attendance rows as fallback (safer than payments date range)
  const paidFormedSalary = validCurrentRows
    .filter(r => r.paid_status)
    .reduce((sum, r) => sum + r.final_salary, 0);
  const paidFromPayments = input.payments
    .filter(p => {
      if (!p.date_from || !p.date_to) return false;
      return p.date_from <= periodEnd && p.date_to >= periodStart;
    })
    .reduce((sum, p) => sum + p.amount, 0);
  const paidInPeriod = Math.max(paidFromPayments, paidFormedSalary);
  const cashNeedNormal = Math.max(0, projectedNormal - paidInPeriod);

  return {
    staffId: input.staffId,
    staffName: input.staffName,
    outletId: input.outletId,
    outletName: input.outletName,
    firstAttendanceDate: input.firstAttendanceDate,
    paydayDay: input.paydayDay,
    nextPayday: input.nextPayday,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    workedUnitsSoFar,
    formedSalary: Math.round(formedSalary),
    projectedLow: Math.round(Math.max(projectedLow, formedSalary)),
    projectedNormal: Math.round(Math.max(projectedNormal, formedSalary)),
    projectedHigh: Math.round(Math.max(projectedHigh, formedSalary)),
    fullAttendanceProjection: Math.round(Math.max(fullAttendanceProjection, projectedNormal)),
    differenceFromPreviousPeriod: Math.round(differenceFromPreviousPeriod),
    differencePercent,
    status,
    statusLabel: projectionStatusLabel(status),
    confidenceScore,
    confidenceLabel: confidenceLabel(confidenceScore),
    cashNeedNormal: Math.round(cashNeedNormal),
    remainingPotentialUnits,
    elapsedPotentialUnits,
    expectedAdditionalUnits
  };
}

// ─── Insufficient Data Fallback ────────────────────────────────────────────

export function makeInsufficientDataProjection(
  staffId: string,
  staffName: string,
  outletId: string | null,
  outletName: string | null
): InsufficientDataProjection {
  return {
    staffId,
    staffName,
    outletId,
    outletName,
    firstAttendanceDate: null,
    paydayDay: null,
    nextPayday: null,
    periodStart: null,
    periodEnd: null,
    status: "insufficient_data",
    statusLabel: projectionStatusLabel("insufficient_data"),
    confidenceScore: 0,
    confidenceLabel: confidenceLabel(35),
    projectedNormal: 0,
    projectedLow: 0,
    projectedHigh: 0,
    fullAttendanceProjection: 0,
    formedSalary: 0,
    cashNeedNormal: 0,
    workedUnitsSoFar: 0,
    remainingPotentialUnits: 0,
    elapsedPotentialUnits: 0,
    expectedAdditionalUnits: 0,
    differenceFromPreviousPeriod: 0,
    differencePercent: 0
  };
}

// ─── Detail Builder ────────────────────────────────────────────────────────

export type ProjectionDetail = {
  projection: StaffPayrollProjection;
  currentPeriod: {
    workedUnits: number;
    formedSalary: number;
    elapsedDays: number;
    remainingDays: number;
    knownFutureDayoff: number;
    knownFutureApprovedLeave: number;
  };
  history: {
    periodsUsed3: number;
    periodsUsed6: number;
    averageWorkUnits3: number;
    averageWorkUnits6: number;
    averageDayoff3: number;
    averageNetSalaryPerUnit: number;
    standardDeviationUnits: number;
    periods: Array<{ start: string; end: string; workedUnits: number; totalSalary: number }>;
  };
  prediction: {
    expectedAdditionalUnits: number;
    lowUnits: number;
    normalUnits: number;
    highUnits: number;
    reason: string[];
  };
};

export function buildProjectionDetail(
  projection: StaffPayrollProjection,
  input: ProjectionInput,
  historySummaries: Array<PeriodSummary & { start: string; end: string }>
): ProjectionDetail {
  const usable = historySummaries.filter(h => h.totalDays > 0);
  const usable3 = usable.slice(0, 3);

  const totalHistoryUnits = usable.reduce((s, h) => s + h.workedUnits, 0);
  const totalHistorySalary = usable.reduce((s, h) => s + h.totalSalary, 0);
  const avgWork3 = usable3.length > 0
    ? Math.round((usable3.reduce((s, h) => s + h.workedUnits, 0) / usable3.length) * 10) / 10
    : 0;
  const avgWork6 = usable.length > 0
    ? Math.round((totalHistoryUnits / usable.length) * 10) / 10
    : 0;
  const avgNetSalaryPerUnit =
    totalHistoryUnits > 0 ? Math.round(totalHistorySalary / totalHistoryUnits) : input.salaryPerShift;
  const stdDev = standardDeviation(usable.map(h => h.workedUnits));
  const spread = clamp(Math.round(stdDev), 1, 3);

  const avgDayoff3 = usable3.length > 0
    ? Math.round((usable3.reduce((s, h) => s + Math.max(0, h.totalDays - h.workedUnits), 0) / usable3.length) * 10) / 10
    : 0;

  const normalUnits = projection.workedUnitsSoFar + projection.expectedAdditionalUnits;
  const lowUnits = Math.max(projection.workedUnitsSoFar, normalUnits - spread);
  const highUnits = Math.min(projection.workedUnitsSoFar + projection.remainingPotentialUnits, normalUnits + spread);

  const asOfDate = input.asOfDate;
  const periodStart = input.periodStart;
  const periodEnd = input.periodEnd;

  const elapsedDays = dateDiff(periodStart, asOfDate < periodEnd ? asOfDate : periodEnd) + 1;
  const remainingDays = asOfDate >= periodEnd ? 0 : dateDiff(addDateDays(asOfDate, 1), periodEnd) + 1;
  const knownFutureDayoff = [...input.blockedDaysFuture].filter(d => d > asOfDate && d <= periodEnd).length;
  const knownFutureApprovedLeave = 0; // already folded into blockedDaysFuture

  const reason: string[] = [];
  if (usable3.length > 0) {
    reason.push(`Rata-rata ${usable3.length} periode terakhir: ${avgWork3} hari kerja.`);
  } else {
    reason.push("Belum ada histori lengkap, proyeksi berdasarkan tren periode berjalan.");
  }
  reason.push(`Periode berjalan sudah tercatat ${projection.workedUnitsSoFar} hari kerja.`);
  reason.push(`Sisa potensi hari kerja: ${projection.remainingPotentialUnits} hari.`);
  if ((input.pendingLeaveCount ?? 0) > 0) {
    reason.push(`Ada ${input.pendingLeaveCount} permintaan cuti yang menunggu persetujuan — bisa mengurangi proyeksi.`);
  }

  return {
    projection,
    currentPeriod: {
      workedUnits: projection.workedUnitsSoFar,
      formedSalary: projection.formedSalary,
      elapsedDays: Math.max(0, elapsedDays),
      remainingDays,
      knownFutureDayoff,
      knownFutureApprovedLeave
    },
    history: {
      periodsUsed3: usable3.length,
      periodsUsed6: usable.length,
      averageWorkUnits3: avgWork3,
      averageWorkUnits6: avgWork6,
      averageDayoff3: avgDayoff3,
      averageNetSalaryPerUnit: avgNetSalaryPerUnit,
      standardDeviationUnits: Math.round(stdDev * 10) / 10,
      periods: usable.map(h => ({
        start: h.start,
        end: h.end,
        workedUnits: h.workedUnits,
        totalSalary: h.totalSalary
      }))
    },
    prediction: {
      expectedAdditionalUnits: projection.expectedAdditionalUnits,
      lowUnits,
      normalUnits,
      highUnits,
      reason
    }
  };
}
