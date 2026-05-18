"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";

type Outlet = {
  id: string;
  name: string;
  location_url: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  shift_mode: number;
  shift1_start: string;
  shift1_end: string;
  shift2_start: string | null;
  shift2_end: string | null;
  report_buka_start: string | null;
  report_buka_end: string | null;
  report_tutup_start: string | null;
  report_tutup_end: string | null;
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
  shift2_start: "",
  shift2_end: "",
  report_buka_start: "09:00",
  report_buka_end: "11:00",
  report_tutup_start: "20:00",
  report_tutup_end: "01:00"
};

type FormKey = keyof typeof empty;
type FormField = [FormKey, string, React.HTMLInputTypeAttribute];

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

  function validateForm() {
    if (!form.name.trim()) return "Nama outlet wajib diisi";
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    const radius = Number(form.radius_m);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Latitude dan longitude wajib valid";
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "Koordinat outlet di luar batas valid";
    if (!Number.isFinite(radius) || radius <= 0) return "Radius meter wajib lebih dari 0";
    if (!form.shift1_start || !form.shift1_end) return "Jam buka dan jam tutup wajib diisi";
    if (form.shift_mode === "2" && (!form.shift2_start || !form.shift2_end)) return "Jam Shift 2 wajib diisi";
    return "";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setMessage(validationError);
      return;
    }
    setMessage("Menyimpan...");
    try {
      const payload = {
        ...form,
        shift2_start: form.shift_mode === "2" ? form.shift2_start : "",
        shift2_end: form.shift_mode === "2" ? form.shift2_end : ""
      };
      await apiFetch("/api/admin/outlets", {
        method: editing ? "PUT" : "POST",
        role: "admin",
        body: { ...payload, outletId: editing || undefined }
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
      location_url: row.location_url || "",
      lat: String(row.lat),
      lng: String(row.lng),
      radius_m: String(row.radius_m),
      shift_mode: String(row.shift_mode),
      shift1_start: row.shift1_start?.slice(0, 5) || "09:00",
      shift1_end: row.shift1_end?.slice(0, 5) || "17:00",
      shift2_start: row.shift_mode === 2 ? row.shift2_start?.slice(0, 5) || "17:00" : "",
      shift2_end: row.shift_mode === 2 ? row.shift2_end?.slice(0, 5) || "01:00" : "",
      report_buka_start: row.report_buka_start?.slice(0, 5) || "09:00",
      report_buka_end: row.report_buka_end?.slice(0, 5) || "11:00",
      report_tutup_start: row.report_tutup_start?.slice(0, 5) || "20:00",
      report_tutup_end: row.report_tutup_end?.slice(0, 5) || "01:00"
    });
  }

  function updateField(key: FormKey, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateShiftMode(value: string) {
    setForm((current) => ({
      ...current,
      shift_mode: value,
      shift2_start: value === "2" ? current.shift2_start || current.shift1_end || "17:00" : "",
      shift2_end: value === "2" ? current.shift2_end || "01:00" : ""
    }));
  }

  function renderInput([key, label, type]: FormField) {
    const isRequired = ["name", "lat", "lng", "radius_m", "shift1_start", "shift1_end", "shift2_start", "shift2_end"].includes(key);
    return (
      <div key={key}>
        <label className="label">{label}</label>
        <input
          className="field"
          type={type}
          required={isRequired}
          min={key === "radius_m" ? 1 : undefined}
          step={key === "lat" || key === "lng" ? "any" : undefined}
          value={form[key]}
          onChange={(e) => updateField(key, e.target.value)}
        />
      </div>
    );
  }

  const isTwoShift = form.shift_mode === "2";
  const baseFields: FormField[] = [
    ["name", "Nama", "text"],
    ["location_url", "URL Maps", "text"],
    ["lat", "Latitude", "number"],
    ["lng", "Longitude", "number"],
    ["radius_m", "Radius meter", "number"]
  ];
  const shiftFields: FormField[] = isTwoShift
    ? [
        ["shift1_start", "Shift 1 mulai", "time"],
        ["shift1_end", "Shift 1 selesai", "time"],
        ["shift2_start", "Shift 2 mulai", "time"],
        ["shift2_end", "Shift 2 selesai", "time"]
      ]
    : [
        ["shift1_start", "Jam buka", "time"],
        ["shift1_end", "Jam tutup", "time"]
      ];
  const reportFields: FormField[] = [
    ["report_buka_start", "Laporan buka mulai", "time"],
    ["report_buka_end", "Laporan buka selesai", "time"],
    ["report_tutup_start", "Laporan tutup mulai", "time"],
    ["report_tutup_end", "Laporan tutup selesai", "time"]
  ];

  return (
    <AdminPage title="Manajemen Outlet" subtitle="Geofence, shift, dan window laporan">
      <form className="panel mb-5 grid gap-3 p-4 md:grid-cols-4" noValidate onSubmit={submit}>
        {baseFields.map(renderInput)}
        <div>
          <label className="label">Mode Shift</label>
          <select className="field" value={form.shift_mode} onChange={(e) => updateShiftMode(e.target.value)}>
            <option value="1">1 Shift</option>
            <option value="2">2 Shift</option>
          </select>
        </div>
        {shiftFields.map(renderInput)}
        {reportFields.map(renderInput)}
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
                  {outlet.shift_mode === 2
                    ? `S1 ${outlet.shift1_start?.slice(0, 5)}-${outlet.shift1_end?.slice(0, 5)} · S2 ${outlet.shift2_start?.slice(0, 5)}-${outlet.shift2_end?.slice(0, 5)}`
                    : `Jam ${outlet.shift1_start?.slice(0, 5)}-${outlet.shift1_end?.slice(0, 5)}`}
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
