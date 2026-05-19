"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy, hhmm } from "@/lib/format";

type ReportItem = { label: string; photo_url: string | null; required: boolean };
type Report = { id: string; staff_name: string; outlet_name: string; date: string; type: string; selfie: string | null; items_json: ReportItem[]; submitted_at: string };
type Outlet = { id: string; name: string };

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", outletId: "", type: "" });
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");

  async function load() {
    setLoading(true);
    try {
      const [reportPayload, outletPayload] = await Promise.all([
        apiFetch<{ ok: true; reports: Report[] }>("/api/admin/reports", { role: "admin", body: filters }),
        apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" })
      ]);
      setReports(reportPayload.reports);
      setOutlets(outletPayload.outlets);
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typeColor = (type: string) => type === "BUKA" ? "#2980B9" : "#8E44AD";

  return (
    <AdminPage
      title="Laporan Toko"
      subtitle="Viewer foto laporan buka dan tutup"
      action={
        <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={load} disabled={loading}>
          <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
        </button>
      }
    >
      <MsgBar message={message} type={msgType} />

      {/* Filters */}
      <AdminSection title="Filter Laporan">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label className="label">Dari Tanggal</label>
            <input className="field" type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
          </div>
          <div>
            <label className="label">Sampai Tanggal</label>
            <input className="field" type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
          </div>
          <div>
            <label className="label">Outlet</label>
            <select className="field" value={filters.outletId} onChange={(e) => setFilters({ ...filters, outletId: e.target.value })}>
              <option value="">Semua outlet</option>
              {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tipe</label>
            <select className="field" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">Semua tipe</option>
              <option value="BUKA">🌅 BUKA</option>
              <option value="TUTUP">🌙 TUTUP</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 13, alignSelf: "flex-end" }} onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Filter
          </button>
        </div>
      </AdminSection>

      {/* Loading */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted-light)", fontSize: 13 }}>
          <RefreshCw size={20} style={{ display: "inline", animation: "spin 1s linear infinite", marginBottom: 8 }} />
          <p style={{ marginTop: 8 }}>Memuat laporan...</p>
        </div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted-light)", fontSize: 13, border: "2px dashed var(--border)", borderRadius: 16 }}>
          Tidak ada laporan ditemukan
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {reports.map((report) => {
            const items = Array.isArray(report.items_json) ? report.items_json : [];
            const color = typeColor(report.type);
            return (
              <div
                key={report.id}
                style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,.05)" }}
              >
                {/* Header */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: `${color}08` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 900, color }}>{report.type === "BUKA" ? "🌅" : "🌙"} {report.type}</span>
                        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>· {report.outlet_name}</span>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                        {ddmmyyyy(report.date)} · {report.staff_name} · {hhmm(report.submitted_at)}
                      </p>
                    </div>
                    <span className="status-pill status-ok" style={{ fontSize: 11 }}>{items.length} foto</span>
                  </div>
                </div>

                {/* Photos */}
                <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {report.selfie ? (
                    <a href={report.selfie} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                      <Image
                        src={report.selfie}
                        alt="Selfie absen masuk"
                        width={240}
                        height={160}
                        style={{ width: "100%", height: 150, objectFit: "contain", borderRadius: 10, border: "1px solid var(--border)", background: "#f8fafc" }}
                      />
                      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 4 }}>Selfie absen masuk</p>
                    </a>
                  ) : null}
                  {items.map((item) => item.photo_url ? (
                    <a key={item.label} href={item.photo_url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                      <Image
                        src={item.photo_url}
                        alt={item.label}
                        width={240}
                        height={160}
                        style={{ width: "100%", height: 150, objectFit: "contain", borderRadius: 10, border: "1px solid var(--border)", background: "#f8fafc" }}
                      />
                      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 4 }}>{item.label}</p>
                    </a>
                  ) : null)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}

function humanError(err: unknown): string {
  if (!(err instanceof Error)) return "Terjadi kesalahan. Coba lagi.";
  const msg = err.message;
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch"))
    return "Koneksi bermasalah. Periksa internet lalu coba lagi.";
  if (msg.includes("401") || msg.includes("Sesi") || msg.includes("login"))
    return "Sesi berakhir. Silakan login ulang.";
  if (msg.includes("403") || msg.includes("ditolak") || msg.includes("izin"))
    return "Anda tidak memiliki izin untuk mengakses data ini.";
  if (msg.includes("500") || msg.includes("server"))
    return "Server sedang bermasalah. Coba beberapa saat lagi.";
  return msg || "Gagal memuat laporan. Coba lagi.";
}
