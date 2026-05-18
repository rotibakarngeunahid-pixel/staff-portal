"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy } from "@/lib/format";

type Outlet = { id: string; name: string; shift_mode: number };
type Staff = { id: string; name: string; outlet_id: string | null };
type Day = { date: string; slots: Array<{ shift: number; scheduleId: string | null; staffName: string | null; status: string }> };

export default function AdminSchedulePage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [outletId, setOutletId] = useState("");
  const [weekStart, setWeekStart] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");

  async function loadBase() {
    const [outletPayload, staffPayload] = await Promise.all([
      apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" }),
      apiFetch<{ ok: true; staff: Staff[] }>("/api/admin/staff", { role: "admin" })
    ]);
    const shiftOutlets = outletPayload.outlets.filter((outlet) => outlet.shift_mode === 2);
    setOutlets(shiftOutlets);
    setStaff(staffPayload.staff);
    if (!outletId && shiftOutlets[0]) setOutletId(shiftOutlets[0].id);
  }

  async function loadSchedule(nextOutletId = outletId) {
    if (!nextOutletId) return;
    const payload = await apiFetch<{ ok: true; days: Day[] }>("/api/admin/schedule", {
      role: "admin",
      body: { outletId: nextOutletId, weekStart }
    });
    setDays(payload.days);
  }

  useEffect(() => {
    loadBase().catch((err: Error) => setMessage(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSchedule().catch((err: Error) => setMessage(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId, weekStart]);

  async function assign(date: string, shift: number) {
    const staffId = window.prompt("Masukkan Staff ID untuk assign shift");
    if (!staffId) return;
    await apiFetch("/api/admin/schedule", { method: "POST", role: "admin", body: { outletId, date, shift, staffId } });
    await loadSchedule();
  }

  async function markOff(date: string, shift: number) {
    await apiFetch("/api/admin/schedule", { method: "POST", role: "admin", body: { outletId, date, shift, status: "off" } });
    await loadSchedule();
  }

  return (
    <AdminPage title="Jadwal Shift" subtitle="Assign, cancel, dan mark off shift outlet 2-shift">
      <section className="panel mb-5 grid gap-3 p-4 md:grid-cols-4">
        <select className="field" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
          {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
        </select>
        <input className="field" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        <button className="btn btn-primary" onClick={() => loadSchedule()}>Refresh</button>
        <p className="self-center text-sm font-bold text-slate-500">{message}</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {days.map((day) => (
          <article key={day.date} className="panel p-4">
            <h2 className="mb-3 font-black">{ddmmyyyy(day.date)}</h2>
            <div className="grid gap-2">
              {day.slots.map((slot) => (
                <div key={slot.shift} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black">Shift {slot.shift}</p>
                      <p className="text-sm font-semibold text-slate-500">{slot.status === "off" ? "Libur" : slot.staffName || "Kosong"}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-soft min-h-9 px-3 text-xs" onClick={() => assign(day.date, slot.shift)}>Assign</button>
                      <button className="btn btn-danger min-h-9 px-3 text-xs" onClick={() => markOff(day.date, slot.shift)}>Off</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="panel mt-5 p-4">
        <h2 className="font-black">Daftar Staff ID</h2>
        <div className="mt-2 grid gap-1 text-sm font-semibold text-slate-600 md:grid-cols-3">
          {staff.map((item) => <p key={item.id}>{item.name}: <span className="font-mono text-xs">{item.id}</span></p>)}
        </div>
      </section>
    </AdminPage>
  );
}
