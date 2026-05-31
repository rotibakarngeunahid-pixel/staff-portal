"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus
} from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID, rupiah } from "@/lib/format";

// ─── Types ─────────────────────────────────────────────────────────────────

type ProjectionStatus = "normal" | "up" | "down" | "insufficient_data";

type StaffProjection = {
  staffId: string;
  staffName: string;
  outletId: string | null;
  outletName: string | null;
  firstAttendanceDate: string | null;
  paydayDay: number | null;
  nextPayday: string | null;
  periodStart: string | null;
  periodEnd: string | null;
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

type ProjectionSummary = {
  formedSalary: number;
  projectedLow: number;
  projectedNormal: number;
  projectedHigh: number;
  estimatedCashNeed: number;
  averageConfidence: number;
  staffCount: number;
  insufficientDataCount: number;
};

type ProjectionResponse = {
  ok: true;
  asOfDate: string;
  summary: ProjectionSummary;
  projections: StaffProjection[];
};

type HistoryPeriod = { start: string; end: string; workedUnits: number; totalSalary: number };

type DetailResponse = {
  ok: true;
  projection: StaffProjection;
  currentPeriod: {
    workedUnits: number;
    formedSalary: number;
    elapsedDays: number;
    remainingDays: number;
    knownFutureDayoff: number;
    knownFutureApprovedLeave: number;
  } | null;
  history: {
    periodsUsed3: number;
    periodsUsed6: number;
    averageWorkUnits3: number;
    averageWorkUnits6: number;
    averageDayoff3: number;
    averageNetSalaryPerUnit: number;
    standardDeviationUnits: number;
    periods: HistoryPeriod[];
  } | null;
  prediction: {
    expectedAdditionalUnits: number;
    lowUnits: number;
    normalUnits: number;
    highUnits: number;
    reason: string[];
  } | null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function statusColor(status: ProjectionStatus): string {
  if (status === "up") return "#E67E22";
  if (status === "down") return "#C0392B";
  if (status === "insufficient_data") return "#95A5A6";
  return "#27AE60";
}

function statusBg(status: ProjectionStatus): string {
  if (status === "up") return "#FEF9E7";
  if (status === "down") return "#FDEDEC";
  if (status === "insufficient_data") return "#F2F3F4";
  return "#E8F8F0";
}

function StatusIcon({ status }: { status: ProjectionStatus }) {
  const color = statusColor(status);
  if (status === "up") return <TrendingUp size={13} color={color} />;
  if (status === "down") return <TrendingDown size={13} color={color} />;
  if (status === "insufficient_data") return <AlertTriangle size={13} color={color} />;
  return <Minus size={13} color={color} />;
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 85 ? "#27AE60" : pct >= 70 ? "#2980B9" : pct >= 55 ? "#E67E22" : "#C0392B";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 64, height: 6, borderRadius: 3, background: "#ECF0F1", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{score}%</span>
    </div>
  );
}

function SummaryCard({ label, value, sub, color = "#2980B9", bg = "#EBF5FB" }: {
  label: string; value: string; sub?: string; color?: string; bg?: string;
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 14, padding: "14px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color, fontFamily: "var(--font-nunito, sans-serif)" }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#7F8C8D", marginTop: 3 }}>{label}</div>
      {sub ? <div style={{ fontSize: 11, color: "#95A5A6", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

// ─── Detail Panel ──────────────────────────────────────────────────────────

function DetailPanel({ staffId, asOfDate, onClose }: { staffId: string; asOfDate: string; onClose: () => void }) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch<DetailResponse>("/api/admin/payroll-projection/detail", {
      role: "admin",
      body: { staffId, asOfDate }
    })
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat detail"))
      .finally(() => setLoading(false));
  }, [staffId, asOfDate]);

  const proj = detail?.projection;
  const cp = detail?.currentPeriod;
  const hist = detail?.history;
  const pred = detail?.prediction;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "flex-end"
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", width: "min(520px,100vw)", height: "100vh",
        overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", padding: 24
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 900 }}>{proj?.staffName ?? "Detail Proyeksi"}</h2>
            {proj?.outletName ? <p style={{ fontSize: 12, color: "var(--muted)" }}>{proj.outletName}</p> : null}
          </div>
          <button
            onClick={onClose}
            style={{ background: "var(--surface-soft)", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
          >
            Tutup
          </button>
        </div>

        {loading && <div style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>Memuat...</div>}
        {error && <div style={{ color: "var(--danger)", background: "var(--danger-bg)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700 }}>{error}</div>}

        {!loading && !error && proj && (
          <>
            {/* Period info */}
            <div style={{ background: "var(--surface-soft)", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><span style={{ color: "var(--muted)" }}>Periode</span><br /><b>{formatDateID(proj.periodStart)} – {formatDateID(proj.periodEnd)}</b></div>
                <div><span style={{ color: "var(--muted)" }}>Tanggal Gajian</span><br /><b style={{ color: "#2980B9" }}>{formatDateID(proj.nextPayday)}</b></div>
              </div>
            </div>

            {/* Projection numbers */}
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)", marginBottom: 10 }}>Proyeksi</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div style={{ background: "#EBF5FB", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#2980B9" }}>{rupiah(proj.projectedLow)}</div>
                  <div style={{ fontSize: 10, color: "#7F8C8D", marginTop: 2 }}>Rendah</div>
                </div>
                <div style={{ background: "#E8F8F0", borderRadius: 10, padding: "10px 12px", textAlign: "center", border: "2px solid #27AE6033" }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#27AE60" }}>{rupiah(proj.projectedNormal)}</div>
                  <div style={{ fontSize: 10, color: "#7F8C8D", marginTop: 2 }}>Normal</div>
                </div>
                <div style={{ background: "#FEF9E7", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#E67E22" }}>{rupiah(proj.projectedHigh)}</div>
                  <div style={{ fontSize: 10, color: "#7F8C8D", marginTop: 2 }}>Tinggi</div>
                </div>
              </div>
            </div>

            {/* Current period */}
            {cp && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)", marginBottom: 10 }}>Periode Berjalan</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                  <DetailRow label="Hari kerja tercatat" value={`${cp.workedUnits} hari`} />
                  <DetailRow label="Gaji terbentuk" value={rupiah(cp.formedSalary)} />
                  <DetailRow label="Hari berlalu" value={`${cp.elapsedDays} hari`} />
                  <DetailRow label="Sisa hari periode" value={`${cp.remainingDays} hari`} />
                  {cp.knownFutureDayoff > 0 && (
                    <DetailRow label="Libur terjadwal" value={`${cp.knownFutureDayoff} hari`} accent="var(--danger)" />
                  )}
                </div>
              </div>
            )}

            {/* History */}
            {hist && hist.periodsUsed6 > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)", marginBottom: 10 }}>Histori</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                  <DetailRow label="Rata-rata 3 periode" value={`${hist.averageWorkUnits3} hari kerja`} />
                  <DetailRow label="Rata-rata 6 periode" value={`${hist.averageWorkUnits6} hari kerja`} />
                  <DetailRow label="Rata-rata libur" value={`${hist.averageDayoff3} hari`} />
                  <DetailRow label="Rata-rata gaji/hari" value={rupiah(hist.averageNetSalaryPerUnit)} />
                  <DetailRow label="Standar deviasi" value={`${hist.standardDeviationUnits} hari`} />
                </div>
                {hist.periods.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>Detail Per Periode</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {hist.periods.map((p, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, background: "var(--surface-soft)", borderRadius: 8, padding: "6px 10px" }}>
                          <span style={{ color: "var(--muted)" }}>{formatDateID(p.start)} – {formatDateID(p.end)}</span>
                          <span style={{ fontWeight: 700 }}>{p.workedUnits} hari · {rupiah(p.totalSalary)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Prediction reasoning */}
            {pred && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)", marginBottom: 10 }}>Alasan Prediksi</h3>
                <ul style={{ paddingLeft: 16, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {pred.reason.map((r, i) => (
                    <li key={i} style={{ fontSize: 12, color: "var(--muted-light)", lineHeight: 1.5 }}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Full attendance simulation */}
            <div style={{ background: "#F8F9FA", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Simulasi Masuk Penuh</p>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#2980B9" }}>{rupiah(proj.fullAttendanceProjection)}</div>
              <p style={{ fontSize: 11, color: "var(--muted-light)", marginTop: 3 }}>Jika masuk semua sisa hari</p>
            </div>

            {/* Cash need */}
            <div style={{ background: "#E8F8F0", border: "1px solid #27AE6033", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Estimasi Cash Perlu Disiapkan</p>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#27AE60" }}>{rupiah(proj.cashNeedNormal)}</div>
            </div>

            {/* Confidence */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Keyakinan proyeksi:</span>
              <ConfidenceBar score={proj.confidenceScore} />
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{proj.confidenceLabel}</span>
            </div>
          </>
        )}

        {!loading && !error && proj?.status === "insufficient_data" && (
          <div style={{ background: "#F2F3F4", borderRadius: 12, padding: 24, textAlign: "center" }}>
            <AlertTriangle size={28} color="#95A5A6" style={{ marginBottom: 8 }} />
            <p style={{ fontWeight: 700, color: "#7F8C8D" }}>Belum cukup data</p>
            <p style={{ fontSize: 12, color: "#95A5A6", marginTop: 4 }}>Staff belum memiliki absensi untuk menentukan tanggal gajian dan proyeksi.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: "var(--surface-soft)", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, color: accent || "var(--ink)" }}>{value}</div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function AdminPayrollProjectionPage() {
  const [data, setData] = useState<ProjectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [filterOutlet, setFilterOutlet] = useState("");
  const [sortField, setSortField] = useState<"name" | "nextPayday" | "projectedNormal" | "status">("name");
  const [sortAsc, setSortAsc] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {};
      if (filterOutlet) params.outletId = filterOutlet;
      const res = await apiFetch<ProjectionResponse>("/api/admin/payroll-projection", {
        role: "admin",
        body: params
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat proyeksi");
    } finally {
      setLoading(false);
    }
  }, [filterOutlet]);

  useEffect(() => { load(); }, [load]);

  const outlets = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const result: Array<{ id: string; name: string }> = [];
    for (const p of data.projections) {
      if (p.outletId && !seen.has(p.outletId)) {
        seen.add(p.outletId);
        result.push({ id: p.outletId, name: p.outletName || p.outletId });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.projections].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.staffName.localeCompare(b.staffName);
      else if (sortField === "nextPayday") cmp = (a.nextPayday ?? "").localeCompare(b.nextPayday ?? "");
      else if (sortField === "projectedNormal") cmp = a.projectedNormal - b.projectedNormal;
      else if (sortField === "status") cmp = a.status.localeCompare(b.status);
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortField, sortAsc]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortAsc(v => !v);
    else { setSortField(field); setSortAsc(true); }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const s = data?.summary;
  const asOfDate = data?.asOfDate ?? "";

  return (
    <AdminPage
      title="Proyeksi Gaji"
      subtitle={asOfDate ? `Per tanggal ${formatDateID(asOfDate)} · estimasi cash flow gajian berikutnya` : "Estimasi cash flow gajian berikutnya"}
      action={
        <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={load} disabled={loading}>
          <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          Refresh
        </button>
      }
    >
      <MsgBar message={error} type="err" />

      {/* Summary cards */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 80, borderRadius: 14, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : s ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
          <SummaryCard label="Sudah Terbentuk" value={rupiah(s.formedSalary)} color="#7F8C8D" bg="#F2F3F4" />
          <SummaryCard label="Proyeksi Normal" value={rupiah(s.projectedNormal)} color="#27AE60" bg="#E8F8F0" />
          <SummaryCard label="Estimasi Cash Need" value={rupiah(s.estimatedCashNeed)} color="#2980B9" bg="#EBF5FB" />
          <SummaryCard label="Proyeksi Rendah" value={rupiah(s.projectedLow)} color="#95A5A6" bg="#F8F9FA" />
          <SummaryCard label="Proyeksi Tinggi" value={rupiah(s.projectedHigh)} color="#E67E22" bg="#FEF9E7" />
          <SummaryCard
            label="Akurasi Rata-rata"
            value={`${s.averageConfidence}%`}
            sub={`${s.staffCount} staff · ${s.insufficientDataCount} belum ada data`}
            color="#8E44AD"
            bg="#F5EEF8"
          />
        </div>
      ) : null}

      {/* Filter */}
      {!loading && outlets.length > 1 && (
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 700 }}>Filter Outlet:</label>
          <select className="field" style={{ fontSize: 12, padding: "6px 10px", maxWidth: 220 }}
            value={filterOutlet} onChange={e => { setFilterOutlet(e.target.value); }}>
            <option value="">Semua Outlet</option>
            {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}

      {/* Table */}
      <AdminSection title={`Proyeksi per Staff (${sorted.length})`} subtitle="Klik baris untuk melihat detail perhitungan">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("name")}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Staff <SortIcon field="name" /></span>
                </th>
                <th>Outlet</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("nextPayday")}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Gajian <SortIcon field="nextPayday" /></span>
                </th>
                <th>Hari Tercatat</th>
                <th>Gaji Terbentuk</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("projectedNormal")}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Proyeksi <SortIcon field="projectedNormal" /></span>
                </th>
                <th>Rendah</th>
                <th>Tinggi</th>
                <th>Selisih</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("status")}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Status <SortIcon field="status" /></span>
                </th>
                <th>Keyakinan</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>Memuat...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)" }}>Belum ada data proyeksi</td></tr>
              ) : sorted.map((proj) => (
                <tr
                  key={proj.staffId}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedStaffId(proj.staffId)}
                >
                  <td style={{ fontWeight: 700 }}>{proj.staffName}</td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{proj.outletName || "—"}</td>
                  <td style={{ fontWeight: 700, color: "#2980B9", fontSize: 12 }}>
                    {proj.nextPayday ? formatDateID(proj.nextPayday) : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {proj.status === "insufficient_data" ? "—" : proj.workedUnitsSoFar}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {proj.status === "insufficient_data" ? "—" : rupiah(proj.formedSalary)}
                  </td>
                  <td style={{ fontWeight: 900, color: "#27AE60" }}>
                    {proj.status === "insufficient_data" ? "—" : rupiah(proj.projectedNormal)}
                  </td>
                  <td style={{ fontSize: 12, color: "#95A5A6" }}>
                    {proj.status === "insufficient_data" ? "—" : rupiah(proj.projectedLow)}
                  </td>
                  <td style={{ fontSize: 12, color: "#E67E22" }}>
                    {proj.status === "insufficient_data" ? "—" : rupiah(proj.projectedHigh)}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {proj.differencePercent !== 0 ? (
                      <span style={{ color: proj.differencePercent > 0 ? "#27AE60" : "#C0392B", fontWeight: 700 }}>
                        {proj.differencePercent > 0 ? "+" : ""}{proj.differencePercent}%
                      </span>
                    ) : "—"}
                  </td>
                  <td>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 11, fontWeight: 700, padding: "3px 8px",
                      borderRadius: 6, background: statusBg(proj.status), color: statusColor(proj.status)
                    }}>
                      <StatusIcon status={proj.status} />
                      {proj.statusLabel}
                    </span>
                  </td>
                  <td>
                    {proj.status !== "insufficient_data" ? (
                      <ConfidenceBar score={proj.confidenceScore} />
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      {/* Detail panel */}
      {selectedStaffId && (
        <DetailPanel
          staffId={selectedStaffId}
          asOfDate={asOfDate}
          onClose={() => setSelectedStaffId(null)}
        />
      )}
    </AdminPage>
  );
}
