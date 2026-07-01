import { normalizeCurrency } from "@/lib/business";
import type {
  AutoComplianceStatus,
  ConfigMap,
  FinalComplianceStatus,
  ResignationCaseStatus
} from "@/types/domain";

function configNum(cfg: ConfigMap, key: string, fallback: number): number {
  const value = Number(cfg[key]);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Status di mana sebuah resignation case masih "berjalan" — belum withdrawn,
 * cancelled, atau paid. Harus sinkron dengan partial unique index
 * ux_resignation_active_staff di migration 0017.
 */
export const ACTIVE_RESIGNATION_STATUSES: ResignationCaseStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "approved_compliant",
  "approved_non_compliant",
  "exempted",
  "final_payroll_approved"
];

export function isActiveResignationStatus(status: ResignationCaseStatus): boolean {
  return (ACTIVE_RESIGNATION_STATUSES as string[]).includes(status);
}

/** Status setelah HR/admin memberi final compliance decision — siap masuk final payroll. */
export const DECIDED_RESIGNATION_STATUSES: ResignationCaseStatus[] = [
  "approved_compliant",
  "approved_non_compliant",
  "exempted"
];

export function isDecidedResignationStatus(status: ResignationCaseStatus): boolean {
  return (DECIDED_RESIGNATION_STATUSES as string[]).includes(status);
}

/** Selisih hari kalender dari `fromDate` ke `toDate` (YYYY-MM-DD, boleh negatif). */
export function calculateNoticeGivenDays(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export type RequiredNoticeResolution = {
  requiredDays: number;
  usedProbationConfig: boolean;
};

/**
 * PRD §6.3: staff tidak punya kolom "employment_type/probation" di skema saat ini,
 * jadi isProbation dideklarasikan eksplisit oleh pemohon (staff/admin), bukan hasil
 * deteksi otomatis. usedProbationConfig=false berarti config probation belum
 * dikustomisasi dari default umum (AC §11.5 — UI wajib tampilkan warning).
 */
export function resolveRequiredNoticeDays(cfg: ConfigMap, isProbation: boolean): RequiredNoticeResolution {
  const defaultDays = configNum(cfg, "resignation_notice_days", 30);
  if (!isProbation) return { requiredDays: defaultDays, usedProbationConfig: false };
  const probationDays = configNum(cfg, "resignation_notice_days_probation", defaultDays);
  return { requiredDays: probationDays, usedProbationConfig: probationDays !== defaultDays };
}

/**
 * approved_last_working_date menang atas requested_last_working_date begitu HR
 * sudah mereview (PRD test case §12.7 — perubahan tanggal memicu hitung ulang).
 */
export function resolveEffectiveResignDate(caseRow: {
  approved_last_working_date?: string | null;
  requested_last_working_date: string;
}): string {
  return caseRow.approved_last_working_date || caseRow.requested_last_working_date;
}

export function resolveNoticeStartDate(caseRow: {
  submitted_at?: string | null;
  letter_received_at?: string | null;
}): string | null {
  const raw = caseRow.submitted_at || caseRow.letter_received_at;
  return raw ? raw.slice(0, 10) : null;
}

/**
 * PRD §7.4. Urutan evaluasi: kelengkapan data dicek lebih dulu karena
 * notice_given_days tidak bisa dihitung tanpa tanggal — baru setelah itu surat
 * resmi & jumlah hari notice dievaluasi.
 */
export function computeAutoComplianceStatus(input: {
  hasCompleteDates: boolean;
  hasWrittenNotice: boolean;
  noticeGivenDays: number | null;
  requiredNoticeDays: number;
}): AutoComplianceStatus {
  const { hasCompleteDates, hasWrittenNotice, noticeGivenDays, requiredNoticeDays } = input;
  if (!hasCompleteDates || noticeGivenDays === null) return "needs_review";
  if (!hasWrittenNotice) return "auto_non_compliant";
  if (noticeGivenDays < requiredNoticeDays) return "auto_non_compliant";
  return "auto_compliant";
}

/** PRD §7.2: compliant/exempted dibayar 100%, non_compliant dibayar sesuai config rate. */
export function resolvePayoutRate(finalStatus: FinalComplianceStatus, cfg: ConfigMap): number {
  if (finalStatus === "non_compliant") {
    return configNum(cfg, "resignation_non_compliant_payout_rate", 0.2);
  }
  return 1;
}

export type FinalPayrollCalculation = {
  eligibleBase: number;
  payoutRate: number;
  resignationPolicyDeduction: number;
  manualDeduction: number;
  bonus: number;
  netTransferAmount: number;
};

/** PRD §6.6 formula persis. */
export function calculateFinalPayroll(input: {
  eligibleBase: number;
  payoutRate: number;
  manualDeduction?: number;
  bonus?: number;
}): FinalPayrollCalculation {
  const eligibleBase = normalizeCurrency(input.eligibleBase);
  const payoutRate = Number.isFinite(input.payoutRate) ? input.payoutRate : 1;
  const manualDeduction = normalizeCurrency(input.manualDeduction ?? 0);
  const bonus = normalizeCurrency(input.bonus ?? 0);
  const resignationPolicyDeduction = Math.round(eligibleBase * (1 - payoutRate));
  const netTransferAmount = eligibleBase - resignationPolicyDeduction - manualDeduction + bonus;
  return { eligibleBase, payoutRate, resignationPolicyDeduction, manualDeduction, bonus, netTransferAmount };
}

const STATUS_LABELS: Record<ResignationCaseStatus, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  under_review: "Sedang Direview",
  approved_compliant: "Disetujui — Sesuai Prosedur",
  approved_non_compliant: "Disetujui — Tidak Sesuai Prosedur",
  exempted: "Dikecualikan (Exempted)",
  withdrawn: "Ditarik Staff",
  cancelled: "Dibatalkan Admin",
  final_payroll_approved: "Payroll Final Disetujui",
  paid: "Sudah Dibayar"
};

export function resignationStatusLabel(status: ResignationCaseStatus): string {
  return STATUS_LABELS[status] || status;
}
