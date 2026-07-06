"use client";

import { useEffect, useState } from "react";
import { KeyRound, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";

const CONFIG_FIELDS: Array<[string, string, string]> = [
  ["late_tolerance_minutes", "Toleransi terlambat (menit)", "number"],
  ["deduction_per_minute", "Potongan per menit (Rp)", "number"],
  ["early_checkout_tolerance", "Toleransi pulang awal (menit)", "number"],
  [
    "full_shift_auto_cutoff_offset_minutes",
    "Auto Full Shift: batas tunggu shift berikutnya (menit setelah jam mulai shift 2 — kosong = 180, isi 0 untuk nonaktif)",
    "number"
  ],
  ["notification_email", "Email notifikasi", "email"],
  ["company_name", "Nama perusahaan", "text"]
];

export default function AdminConfigPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingAutoApprove, setSavingAutoApprove] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  // leave_auto_approve: default aktif jika config belum di-set
  const autoApproveActive = config["leave_auto_approve"] !== "false";

  async function load() {
    const payload = await apiFetch<{ ok: true; config: Record<string, string> }>("/api/admin/config", { role: "admin" });
    setConfig(payload.config);
  }

  useEffect(() => {
    load().catch((err: Error) => { setMessage(err.message); setMsgType("err"); });
  }, []);

  async function save() {
    if (savingConfig) return;
    setSavingConfig(true);
    setMessage("Menyimpan..."); setMsgType("info");
    try {
      // Kirim hanya field yang bisa diedit di halaman ini — jangan kirim seluruh config
      // (terutama admin_pin_hash) agar tidak menimpa nilai yang diubah di tempat lain.
      const editable: Record<string, string> = {};
      CONFIG_FIELDS.forEach(([key]) => {
        if (config[key] !== undefined) editable[key] = config[key];
      });
      await apiFetch("/api/admin/config", { method: "PUT", role: "admin", body: editable });
      setMessage("Pengaturan tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan"); setMsgType("err");
    } finally {
      setSavingConfig(false);
    }
  }

  async function toggleAutoApprove() {
    if (savingAutoApprove) return;
    const newValue = autoApproveActive ? "false" : "true";
    setSavingAutoApprove(true);
    setMessage(newValue === "true" ? "Mengaktifkan auto approve..." : "Menonaktifkan auto approve..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/config", {
        method: "PUT", role: "admin",
        body: { key: "leave_auto_approve", value: newValue }
      });
      setConfig((prev) => ({ ...prev, leave_auto_approve: newValue }));
      setMessage(newValue === "true"
        ? "Auto approve permintaan libur diaktifkan ✓"
        : "Auto approve permintaan libur dinonaktifkan ✓");
      setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal mengubah pengaturan"); setMsgType("err");
    } finally {
      setSavingAutoApprove(false);
    }
  }

  async function changePin() {
    if (savingPin) return;
    if (pin.length < 4) { setMessage("Password minimal 4 karakter"); setMsgType("err"); return; }
    if (pin !== pinConfirm) { setMessage("Konfirmasi password tidak cocok"); setMsgType("err"); return; }
    setSavingPin(true);
    setMessage("Mengubah password..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/config", { method: "PUT", role: "admin", body: { key: "admin_pin", value: pin } });
      setPin("");
      setPinConfirm("");
      setMessage("Password admin berhasil diubah ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal mengubah password"); setMsgType("err");
    } finally {
      setSavingPin(false);
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
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={save} disabled={savingConfig}>
          <Save size={15} /> {savingConfig ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
      </AdminSection>

      {/* Auto-approve leave */}
      <AdminSection
        title="Auto Approve Permintaan Libur"
        subtitle="Jika aktif, permintaan libur dari staff langsung disetujui otomatis tanpa perlu konfirmasi admin"
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: autoApproveActive ? "var(--success-bg)" : "var(--surface-soft)",
          border: `1.5px solid ${autoApproveActive ? "var(--success-border)" : "var(--border)"}`,
          borderRadius: 14, padding: "14px 18px", gap: 16
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: autoApproveActive ? "var(--success)" : "var(--ink)", marginBottom: 4 }}>
              Auto Approve {autoApproveActive ? "Aktif" : "Nonaktif"}
            </p>
            <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              {autoApproveActive
                ? "Permintaan libur dari staff langsung disetujui. Admin tetap bisa membatalkan dari menu Libur."
                : "Permintaan libur masuk dengan status Menunggu. Admin harus menyetujui secara manual."}
            </p>
          </div>
          <button
            onClick={toggleAutoApprove}
            disabled={savingAutoApprove}
            aria-label={autoApproveActive ? "Nonaktifkan auto approve" : "Aktifkan auto approve"}
            style={{
              background: "none", border: "none", cursor: savingAutoApprove ? "not-allowed" : "pointer",
              flexShrink: 0, opacity: savingAutoApprove ? 0.5 : 1
            }}
          >
            {autoApproveActive
              ? <ToggleRight size={44} color="var(--success)" />
              : <ToggleLeft size={44} color="var(--muted)" />
            }
          </button>
        </div>
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
        <button className="btn btn-soft" style={{ fontSize: 13 }} onClick={changePin} disabled={savingPin}>
          <KeyRound size={15} /> {savingPin ? "Mengubah..." : "Ganti Password"}
        </button>
      </AdminSection>
    </AdminPage>
  );
}
