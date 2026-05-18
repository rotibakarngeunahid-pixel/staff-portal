"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy, hhmm } from "@/lib/format";

type Report = { id: string; staff_name: string; outlet_name: string; date: string; type: string; selfie: string | null; items_json: any; submitted_at: string };
type Outlet = { id: string; name: string };

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", outletId: "", type: "" });
  const [message, setMessage] = useState("");

  async function load() {
    const [reportPayload, outletPayload] = await Promise.all([
      apiFetch<{ ok: true; reports: Report[] }>("/api/admin/reports", { role: "admin", body: filters }),
      apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" })
    ]);
    setReports(reportPayload.reports);
    setOutlets(outletPayload.outlets);
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminPage title="Laporan Toko" subtitle="Viewer foto laporan buka dan tutup">
      <section className="panel mb-5 grid gap-3 p-4 md:grid-cols-5">
        <input className="field" type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
        <input className="field" type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
        <select className="field" value={filters.outletId} onChange={(e) => setFilters({ ...filters, outletId: e.target.value })}>
          <option value="">Semua outlet</option>
          {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
        </select>
        <select className="field" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">Semua tipe</option>
          <option value="BUKA">BUKA</option>
          <option value="TUTUP">TUTUP</option>
        </select>
        <button className="btn btn-primary" onClick={load}>Filter</button>
      </section>
      <p className="mb-3 text-sm font-bold text-slate-500">{message}</p>
      <section className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => {
          const items = Array.isArray(report.items_json) ? report.items_json : [];
          return (
            <article key={report.id} className="panel p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">{report.type} · {report.outlet_name}</h2>
                  <p className="text-sm font-semibold text-slate-500">{ddmmyyyy(report.date)} · {report.staff_name} · {hhmm(report.submitted_at)}</p>
                </div>
                <span className="status-pill status-ok">{items.length} foto</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {report.selfie ? <a href={report.selfie} target="_blank"><Image src={report.selfie} alt="Selfie laporan" width={240} height={180} className="aspect-[4/3] rounded-lg object-cover" /></a> : null}
                {items.map((item: any) => item.photo_url ? (
                  <a key={item.label} href={item.photo_url} target="_blank">
                    <Image src={item.photo_url} alt={item.label} width={240} height={180} className="aspect-[4/3] rounded-lg object-cover" />
                    <p className="mt-1 text-xs font-bold">{item.label}</p>
                  </a>
                ) : null)}
              </div>
            </article>
          );
        })}
      </section>
    </AdminPage>
  );
}
