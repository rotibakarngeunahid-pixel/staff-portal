"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy } from "@/lib/format";

type Outlet = { id: string; name: string; shift_mode: number };
type Staff = { id: string; name: string; outlet_id: string | null };
type Day = { date: string; slots: Array<{ shift: number; scheduleId: string | null; staffName: string | null; status: string }> };
type AssignTarget = { date: string; shift: number } | null;

export default function AdminSchedulePage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [outletId, setOutletId] = useState("");
  const [weekStart, setWeekStart] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [assignTarget, setAssignTarget] = useState<AssignTarget>(null);
  const [assignStaffId, setAssignStaffId] = useState("");

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
    try {
      const payload = await apiFetch<{ ok: true; days: Day[] }>("/api/admin/schedule", {
        role: "admin",
        body: { outletId: nextOutletId, weekStart }
      });
      setDays(payload.days);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memuat jadwal"); setMsgType("err");
    }
  }

  useEffect(() => {
    loadBase().catch((err: Error) => { setMessage(err.message); setMsgType("err"); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSchedule().catch((err: Error) => { setMessage(err.message); setMsgType("err"); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId, weekStart]);

  async function submitAssign() {
    if (!assignTarget || !assignStaffId) return;
    setMessage("Menyimpan jadwal..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/schedule", {
        method: "POST",
        role: "admin",
        body: { outletId, date: assignTarget.date, shift: assignTarget.shift, staffId: assignStaffId }
      });
      setAssignTarget(null);
      setAssignStaffId("");
      await loadSchedule();
      setMessage("Jadwal disimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan jadwal"); setMsgType("err");
    }
  }

  async function markOff(date: string, shift: number) {
    setMessage("Menyimpan hari libur..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/schedule", { method: "POST", role: "admin", body: { outletId, date, shift, status: "off" } });
      await loadSchedule();
      setMessage("Shift ditandai libur ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menandai hari libur"); setMsgType("err");
    }
  }

  const outletStaff = staff.filter((item) => !item.outlet_id || item.outlet_id === outletId);

  return (
    <AdminPage title="Jadwal Shift" subtitle="Assign, cancel, dan mark off shift outlet 2-shift">
      <MsgBar message={message} type={msgType} />

      {/* Controls */}
      <AdminSection title="Pilih Outlet & Minggu">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label className="label">Outlet (2 shift)</label>
            <select className="field" value={outletId} onChange={(e) => { setOutletId(e.target.value); setAssignTarget(null); }}>
              {outlets.length === 0 ? <option value="">Tidak ada outlet 2-shift</option> : null}
              {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Awal Minggu</label>
            <input className="field" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          </div>
          <button className="btn btn-soft" style={{ fontSize: 13, alignSelf: "flex-end" }} onClick={() => loadSchedule()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </AdminSection>

      {/* Assign panel */}
      {assignTarget ? (
        <AdminSection title={`Assign Shift ${assignTarget.shift} · ${ddmmyyyy(assignTarget.date)}`}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "flex-end" }}>
            <div>
              <label className="label">Staff</label>
              <select className="field" value={assignStaffId} onChange={(e) => setAssignStaffId(e.target.value)}>
                <option value="">Pilih staff</option>
                {outletStaff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={submitAssign} disabled={!assignStaffId}>Simpan</button>
            <button className="btn btn-soft" style={{ fontSize: 13 }} onClick={() => { setAssignTarget(null); setAssignStaffId(""); }}>Batal</button>
          </div>
        </AdminSection>
      ) : null}

      {/* Day cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {days.map((day) => (
          <div key={day.date} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,.05)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 900, marginBottom: 12 }}>{ddmmyyyy(day.date)}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {day.slots.map((slot) => {
                const isOff = slot.status === "off";
                return (
                  <div
                    key={slot.shift}
                    style={{
                      background: isOff ? "var(--danger-bg)" : "var(--surface-soft)",
                      border: `1px solid ${isOff ? "#fca5a5" : "var(--border)"}`,
                      borderRadius: 10,
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 900 }}>Shift {slot.shift}</p>
                      <p style={{ fontSize: 12, fontWeight: 600, color: isOff ? "var(--danger)" : slot.staffName ? "#222" : "var(--muted-light)" }}>
                        {isOff ? "Libur" : slot.staffName || "Kosong"}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-soft"
                        style={{ fontSize: 11, padding: "5px 10px" }}
                        onClick={() => { setAssignTarget({ date: day.date, shift: slot.shift }); setAssignStaffId(""); }}
                      >
                        Assign
                      </button>
                      {!isOff ? (
                        <button
                          className="btn btn-danger"
                          style={{ fontSize: 11, padding: "5px 10px" }}
                          onClick={() => markOff(day.date, slot.shift)}
                        >
                          Off
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {days.length === 0 ? (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "32px 16px", color: "var(--muted-light)", fontSize: 13, border: "2px dashed var(--border)", borderRadius: 12 }}>
            {outlets.length === 0 ? "Tidak ada outlet dengan mode 2-shift" : "Pilih outlet dan minggu untuk melihat jadwal"}
          </div>
        ) : null}
      </div>
    </AdminPage>
  );
}
