"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";

const keys = [
  ["late_tolerance_minutes", "Toleransi terlambat (menit)"],
  ["deduction_per_minute", "Potongan per menit"],
  ["early_checkout_tolerance", "Toleransi pulang awal"],
  ["notification_email", "Email notifikasi"],
  ["company_name", "Nama perusahaan"]
];

export default function AdminConfigPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await apiFetch<{ ok: true; config: Record<string, string> }>("/api/admin/config", { role: "admin" });
    setConfig(payload.config);
  }

  useEffect(() => {
    load().catch((err: Error) => setMessage(err.message));
  }, []);

  async function save() {
    setMessage("Menyimpan...");
    try {
      await apiFetch("/api/admin/config", { method: "PUT", role: "admin", body: config });
      setMessage("Pengaturan tersimpan");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan");
    }
  }

  async function changePin() {
    if (pin.length < 4) return setMessage("PIN minimal 4 digit");
    if (pin !== pinConfirm) return setMessage("Konfirmasi PIN tidak cocok");
    await apiFetch("/api/admin/config", { method: "PUT", role: "admin", body: { key: "admin_pin", value: pin } });
    setPin("");
    setPinConfirm("");
    setMessage("PIN admin diubah");
  }

  return (
    <AdminPage title="Pengaturan Sistem" subtitle="Keterlambatan, email, dan PIN admin">
      <section className="panel max-w-2xl p-4">
        <div className="grid gap-4">
          {keys.map(([key, label]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input className="field" value={config[key] || ""} onChange={(e) => setConfig({ ...config, [key]: e.target.value })} />
            </div>
          ))}
          <button className="btn btn-primary w-fit" onClick={save}>Simpan Pengaturan</button>
        </div>
      </section>

      <section className="panel mt-5 max-w-2xl p-4">
        <h2 className="mb-3 text-lg font-black">Ganti PIN Admin</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="field" type="password" placeholder="PIN baru" value={pin} onChange={(e) => setPin(e.target.value)} />
          <input className="field" type="password" placeholder="Konfirmasi PIN" value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value)} />
        </div>
        <button className="btn btn-soft mt-3" onClick={changePin}>Ganti PIN</button>
      </section>
      <p className="mt-3 text-sm font-bold text-slate-500">{message}</p>
    </AdminPage>
  );
}
