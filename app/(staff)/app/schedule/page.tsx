"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, RefreshCw } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";
import { apiFetch } from "@/lib/client-api";
import { ddmmyyyy } from "@/lib/format";

type Day = {
  date: string;
  slots: Array<{ shift: number; scheduleId: string | null; staffName: string | null; status: string; isMe: boolean }>;
  leaves: Array<{ id: string; staff_name: string; status: string; reason: string | null; isMe: boolean }>;
};

type SchedulePayload = { ok: true; weekStart: string; days: Day[] };

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function StaffSchedulePage() {
  const [weekStart, setWeekStart] = useState(isoToday());
  const [data, setData] = useState<SchedulePayload | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setBusy("Memuat jadwal...");
    setError("");
    try {
      setData(await apiFetch<SchedulePayload>("/api/schedule/weekly", { role: "staff", body: { weekStart } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat jadwal");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const nextWeek = useMemo(() => {
    const date = new Date(`${weekStart}T00:00:00`);
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  }, [weekStart]);

  async function claim(date: string, shift: number) {
    setBusy("Mengambil shift...");
    try {
      await apiFetch("/api/schedule/claim", { method: "POST", role: "staff", body: { date, shift } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengambil shift");
      setBusy("");
    }
  }

  async function cancel(scheduleId: string) {
    setBusy("Membatalkan shift...");
    try {
      await apiFetch("/api/schedule/cancel", { method: "POST", role: "staff", body: { scheduleId } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membatalkan shift");
      setBusy("");
    }
  }

  async function leave(date: string) {
    const reason = window.prompt("Alasan cuti") || "";
    setBusy("Mengajukan cuti...");
    try {
      await apiFetch("/api/schedule/leave", { method: "POST", role: "staff", body: { date, reason } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengajukan cuti");
      setBusy("");
    }
  }

  return (
    <StaffPage title="Jadwal" subtitle="Claim shift dan request libur">
      <div className="mb-4 grid grid-cols-[1fr_auto] gap-2">
        <input className="field" type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} />
        <button className="btn btn-soft" onClick={load}>
          <RefreshCw size={16} />
        </button>
      </div>
      <button className="btn btn-soft mb-4 w-full text-sm" onClick={() => setWeekStart(nextWeek)}>
        Minggu Berikutnya
      </button>
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      {busy ? <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800">{busy}</p> : null}

      <div className="space-y-3">
        {(data?.days || []).map((day) => (
          <section key={day.date} className="panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-black">{ddmmyyyy(day.date)}</h2>
              <button className="btn btn-soft min-h-9 px-3 text-xs" onClick={() => leave(day.date)}>
                <CalendarPlus size={15} />
                Cuti
              </button>
            </div>
            <div className="grid gap-2">
              {day.slots.map((slot) => (
                <div key={slot.shift} className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black">{slot.shift === 0 ? "1 Shift" : `Shift ${slot.shift}`}</p>
                      <p className="text-sm font-semibold text-slate-500">
                        {slot.status === "single" ? "Jam buka sampai tutup" : slot.status === "off" ? "Libur" : slot.staffName || "Kosong"}
                      </p>
                    </div>
                    {slot.status === "open" ? (
                      <button className="btn btn-primary min-h-9 px-3 text-xs" onClick={() => claim(day.date, slot.shift)}>
                        Ambil
                      </button>
                    ) : slot.isMe && slot.scheduleId ? (
                      <button className="btn btn-soft min-h-9 px-3 text-xs" onClick={() => cancel(slot.scheduleId!)}>
                        Batalkan
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {day.leaves.length ? (
              <p className="mt-3 text-xs font-bold text-amber-700">
                Cuti: {day.leaves.map((item) => item.staff_name).join(", ")}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </StaffPage>
  );
}
