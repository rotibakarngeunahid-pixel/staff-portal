"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";

type Outlet = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  shift_mode: number;
  shift1_start: string;
  shift1_end: string;
  shift2_start: string | null;
  shift2_end: string | null;
  active: boolean;
};

const empty = {
  name: "",
  location_url: "",
  lat: "",
  lng: "",
  radius_m: "100",
  shift_mode: "1",
  shift1_start: "09:00",
  shift1_end: "17:00",
  shift2_start: "17:00",
  shift2_end: "01:00",
  report_buka_start: "09:00",
  report_buka_end: "11:00",
  report_tutup_start: "20:00",
  report_tutup_end: "01:00"
};

export default function AdminOutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" });
    setOutlets(payload.outlets);
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Menyimpan...");
    try {
      await apiFetch("/api/admin/outlets", {
        method: editing ? "PUT" : "POST",
        role: "admin",
        body: { ...form, outletId: editing || undefined }
      });
      setForm(empty);
      setEditing(null);
      await load();
      setMessage("Tersimpan");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan");
    }
  }

  function edit(row: Outlet) {
    setEditing(row.id);
    setForm({
      ...empty,
      name: row.name,
      lat: String(row.lat),
      lng: String(row.lng),
      radius_m: String(row.radius_m),
      shift_mode: String(row.shift_mode),
      shift1_start: row.shift1_start?.slice(0, 5) || "09:00",
      shift1_end: row.shift1_end?.slice(0, 5) || "17:00",
      shift2_start: row.shift2_start?.slice(0, 5) || "17:00",
      shift2_end: row.shift2_end?.slice(0, 5) || "01:00"
    });
  }

  return (
    <AdminPage title="Manajemen Outlet" subtitle="Geofence, shift, dan window laporan">
      <form className="panel mb-5 grid gap-3 p-4 md:grid-cols-4" onSubmit={submit}>
        {[
          ["name", "Nama", "text"],
          ["location_url", "URL Maps", "text"],
          ["lat", "Latitude", "number"],
          ["lng", "Longitude", "number"],
          ["radius_m", "Radius meter", "number"],
          ["shift1_start", "Shift 1 mulai", "time"],
          ["shift1_end", "Shift 1 selesai", "time"],
          ["shift2_start", "Shift 2 mulai", "time"],
          ["shift2_end", "Shift 2 selesai", "time"],
          ["report_buka_start", "Buka mulai", "time"],
          ["report_buka_end", "Buka selesai", "time"],
          ["report_tutup_start", "Tutup mulai", "time"],
          ["report_tutup_end", "Tutup selesai", "time"]
        ].map(([key, label, type]) => (
          <div key={key}>
            <label className="label">{label}</label>
            <input className="field" type={type} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          </div>
        ))}
        <div>
          <label className="label">Mode Shift</label>
          <select className="field" value={form.shift_mode} onChange={(e) => setForm({ ...form, shift_mode: e.target.value })}>
            <option value="1">1 Shift</option>
            <option value="2">2 Shift</option>
          </select>
        </div>
        <div className="flex items-end gap-2 md:col-span-4">
          <button className="btn btn-primary">{editing ? "Update Outlet" : "Tambah Outlet"}</button>
          {editing ? <button type="button" className="btn btn-soft" onClick={() => { setEditing(null); setForm(empty); }}>Batal</button> : null}
          <span className="text-sm font-bold text-slate-500">{message}</span>
        </div>
      </form>

      <section className="grid gap-3 md:grid-cols-2">
        {outlets.map((outlet) => (
          <article key={outlet.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">{outlet.name}</h2>
                <p className="text-sm font-semibold text-slate-500">
                  Radius {outlet.radius_m}m · {outlet.shift_mode === 2 ? "2 Shift" : "1 Shift"}
                </p>
                <p className="mt-2 text-sm font-bold text-slate-700">
                  S1 {outlet.shift1_start?.slice(0, 5)}-{outlet.shift1_end?.slice(0, 5)}
                  {outlet.shift_mode === 2 ? ` · S2 ${outlet.shift2_start?.slice(0, 5)}-${outlet.shift2_end?.slice(0, 5)}` : ""}
                </p>
              </div>
              <button className="btn btn-soft min-h-9 px-3 text-xs" onClick={() => edit(outlet)}>Edit</button>
            </div>
          </article>
        ))}
      </section>
    </AdminPage>
  );
}
