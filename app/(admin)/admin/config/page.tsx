"use client";

import { useEffect, useState } from "react";
import { KeyRound, Save } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";

const CONFIG_FIELDS: Array<[string, string, string]> = [
  ["late_tolerance_minutes", "Toleransi terlambat (menit)", "number"],
  ["deduction_per_minute", "Potongan per menit (Rp)", "number"],
  ["early_checkout_tolerance", "Toleransi pulang awal (menit)", "number"],
  ["notification_email", "Email notifikasi", "email"],
  ["company_name", "Nama perusahaan", "text"]
];

export default function AdminConfigPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");

  async function load() {
    const payload = await apiFetch<{ ok: true; config: Record<string, string> }>("/api/admin/config", { role: "admin" });
    setConfig(payload.config);
  }

  useEffect(() => {
    load().catch((err: Error) => { setMessage(err.message); setMsgType("err"); });
  }, []);

  async function save() {
    setMessage("Menyimpan..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/config", { method: "PUT", role: "admin", body: config });
      setMessage("Pengaturan tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan"); setMsgType("err");
    }
  }

  async function changePin() {
    if (pin.length < 4) { setMessage("Password minimal 4 karakter"); setMsgType("err"); return; }
    if (pin !== pinConfirm) { setMessage("Konfirmasi password tidak cocok"); setMsgType("err"); return; }
    setMessage("Mengubah password..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/config", { method: "PUT", role: "admin", body: { key: "admin_pin", value: pin } });
      setPin("");
      setPinConfirm("");
      setMessage("Password admin berhasil diubah ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal mengubah password"); setMsgType("err");
    }
  }

  return (
    <AdminPage title="Pengaturan Sistem" subtitle="Keterlambatan, email, dan password admin">
      <MsgBar message={message} type={msgType} />

      {/* General settings */}
      <AdminSection title="Pengaturan Umum" subtitle="Konfigurasi toleransi keterlambatan dan informasi perusahaan">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          {CONFIG_FIELDS.map(([key, label, type]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                className="field"
                type={type}
                value={config[key] || ""}
                onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={save}>
          <Save size={15} /> Simpan Pengaturan
        </button>
      </AdminSection>

      {/* Password change */}
      <AdminSection title="Ganti Password Admin" subtitle="Password digunakan untuk login ke halaman admin (huruf dan angka diperbolehkan)">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14, maxWidth: 480 }}>
          <div>
            <label className="label">Password Baru</label>
            <input
              className="field"
              type="password"
              placeholder="Min. 4 karakter"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Konfirmasi Password</label>
            <input
              className="field"
              type="password"
              placeholder="Ulangi password"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-soft" style={{ fontSize: 13 }} onClick={changePin}>
          <KeyRound size={15} /> Ganti Password
        </button>
      </AdminSection>
    </AdminPage>
  );
}
