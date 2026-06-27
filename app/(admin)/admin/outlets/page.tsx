"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus, RefreshCw, Trash2 } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
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
  inventory_branch_id: string | null;
  pos_branch_id: string | null;
  active: boolean;
};

const empty = {
  name: "", location_url: "", lat: "", lng: "", radius_m: "100",
  shift_mode: "1",
  shift1_start: "09:00", shift1_end: "17:00",
  shift2_start: "17:00", shift2_end: "01:00",
  report_buka_start: "", report_buka_end: "",
  report_tutup_start: "", report_tutup_end: "",
  inventory_branch_id: "",
  pos_branch_id: ""
};
type F = typeof empty;

type InventoryBranch = { branch_id: string; branch_name: string };
type PosBranch = { pos_branch_id: string; pos_branch_name: string };

export default function AdminOutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inventoryBranches, setInventoryBranches] = useState<InventoryBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [posBranches, setPosBranches] = useState<PosBranch[]>([]);
  const [posBranchesLoading, setPosBranchesLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const payload = await apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" });
      setOutlets(payload.outlets);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memuat outlet");
      setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function loadInventoryBranches() {
    if (inventoryBranches.length > 0) return; // sudah di-cache, skip fetch ulang
    setBranchesLoading(true);
    try {
      const payload = await apiFetch<{ branches: InventoryBranch[] }>("/api/admin/inventory-branches", { role: "admin" });
      setInventoryBranches(payload.branches || []);
    } catch {
      // gagal fetch tidak perlu blokir form, input tetap bisa pakai dropdown kosong
    } finally {
      setBranchesLoading(false);
    }
  }

  async function loadPosBranches() {
    if (posBranches.length > 0) return; // sudah di-cache, skip fetch ulang
    setPosBranchesLoading(true);
    try {
      const payload = await apiFetch<{ branches: PosBranch[] }>("/api/admin/pos-branches", { role: "admin" });
      setPosBranches(payload.branches || []);
    } catch {
      // gagal fetch tidak perlu blokir form
    } finally {
      setPosBranchesLoading(false);
    }
  }

  function loadIntegrationBranches() {
    loadInventoryBranches();
    loadPosBranches();
  }

  async function deactivate(outletId: string, name: string) {
    if (saving) return;
    if (!window.confirm(`Nonaktifkan outlet "${name}"?\n\nOutlet tidak akan muncul dalam daftar, tapi data histori tetap tersimpan.`)) return;
    setSaving(true);
    setMessage("Menonaktifkan outlet..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/outlets", { method: "DELETE", role: "admin", body: { outletId } });
      await load();
      setMessage(`Outlet "${name}" dinonaktifkan ✓`); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menonaktifkan outlet"); setMsgType("err");
    } finally {
      setSaving(false);
    }
  }

  function parseMapsUrl(url: string): { lat: string; lng: string } | null {
    // @lat,lng,zoom — URL address bar standard Google Maps
    const atMatch = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (atMatch) return { lat: atMatch[1], lng: atMatch[2] };
    // !3d{lat}!4d{lng} — URL share "Copy link" untuk Place tertentu
    const lat3d = url.match(/!3d(-?\d+(?:\.\d+)?)/);
    const lng4d = url.match(/!4d(-?\d+(?:\.\d+)?)/);
    if (lat3d && lng4d) return { lat: lat3d[1], lng: lng4d[1] };
    // ?q=lat,lng atau &q=lat,lng
    const qMatch = url.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (qMatch) return { lat: qMatch[1], lng: qMatch[2] };
    // ll=lat,lng
    const llMatch = url.match(/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (llMatch) return { lat: llMatch[1], lng: llMatch[2] };
    return null;
  }

  function onLocationUrlChange(url: string) {
    const coords = parseMapsUrl(url);
    if (coords) {
      setForm((prev) => ({ ...prev, location_url: url, lat: coords.lat, lng: coords.lng }));
    } else {
      setForm((prev) => ({ ...prev, location_url: url }));
    }
  }

  const f = (key: keyof F, label: string, type: string, placeholder?: string, required = false) => (
    <div key={key}>
      <label className="label">{label}{required ? <span style={{ color: "var(--danger)" }}>*</span> : null}</label>
      <input
        className="field"
        type={type}
        step={type === "number" ? "any" : undefined}
        min={key === "radius_m" ? "1" : undefined}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => {
          if (key === "location_url") onLocationUrlChange(e.target.value);
          else setForm((prev) => ({ ...prev, [key]: e.target.value }));
        }}
      />
    </div>
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const lat = Number(form.lat); const lng = Number(form.lng); const r = Number(form.radius_m);
    if (!form.name.trim()) { setMessage("Nama outlet wajib diisi"); setMsgType("err"); return; }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { setMessage("Koordinat GPS tidak valid"); setMsgType("err"); return; }
    if (!Number.isFinite(r) || r <= 0) { setMessage("Radius harus lebih dari 0"); setMsgType("err"); return; }
    if (form.shift_mode === "2" && (!form.shift2_start || !form.shift2_end)) { setMessage("Jam shift 2 wajib diisi"); setMsgType("err"); return; }
    if (saving) return;
    setSaving(true);
    setMessage("Menyimpan..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/outlets", {
        method: editing ? "PUT" : "POST",
        role: "admin",
        body: { ...form, outletId: editing || undefined, shift2_start: form.shift_mode === "2" ? form.shift2_start : "", shift2_end: form.shift_mode === "2" ? form.shift2_end : "" }
      });
      setForm(empty); setEditing(null); setShowForm(false);
      await load();
      setMessage("Outlet tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan"); setMsgType("err");
    } finally {
      setSaving(false);
    }
  }

  function edit(row: Outlet) {
    setEditing(row.id);
    setForm({
      name: row.name, location_url: row.location_url || "",
      lat: String(row.lat), lng: String(row.lng), radius_m: String(row.radius_m),
      shift_mode: String(row.shift_mode),
      shift1_start: row.shift1_start?.slice(0, 5) || "09:00",
      shift1_end: row.shift1_end?.slice(0, 5) || "17:00",
      shift2_start: row.shift2_start?.slice(0, 5) || "17:00",
      shift2_end: row.shift2_end?.slice(0, 5) || "01:00",
      report_buka_start: row.report_buka_start?.slice(0, 5) || "",
      report_buka_end: row.report_buka_end?.slice(0, 5) || "",
      report_tutup_start: row.report_tutup_start?.slice(0, 5) || "",
      report_tutup_end: row.report_tutup_end?.slice(0, 5) || "",
      inventory_branch_id: row.inventory_branch_id || "",
      pos_branch_id: row.pos_branch_id || ""
    });
    setShowForm(true);
    loadIntegrationBranches();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const is2Shift = form.shift_mode === "2";

  return (
    <AdminPage
      title="Manajemen Outlet"
      subtitle="Geofence, shift, dan jendela laporan"
      action={
        !showForm ? (
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => { setEditing(null); setForm(empty); setShowForm(true); loadIntegrationBranches(); }}>
            <Plus size={15} /> Tambah Outlet
          </button>
        ) : null
      }
    >
      <MsgBar message={message} type={msgType} />

      {/* Form */}
      {showForm ? (
        <form onSubmit={submit}>
          <AdminSection title="Informasi Dasar">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {f("name", "Nama Outlet", "text", "Contoh: Outlet Utama", true)}
              {f("location_url", "Link Google Maps (otomatis isi koordinat)", "text", "https://www.google.com/maps/@-6.9054,107.6191,14z")}
            </div>
            {form.lat && form.lng ? (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--success-bg)", border: "1px solid var(--success-border)", borderRadius: 10, fontSize: 12, fontWeight: 600, color: "var(--success)" }}>
                ✓ Koordinat terdeteksi otomatis: {form.lat}, {form.lng}
              </div>
            ) : null}
          </AdminSection>

          <AdminSection title="Lokasi GPS & Geofence" subtitle="Untuk validasi absensi staff">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {f("lat", "Latitude", "number", "-6.123456", true)}
              {f("lng", "Longitude", "number", "106.789012", true)}
              {f("radius_m", "Radius (meter)", "number", "100", true)}
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
              💡 Buka Google Maps di browser → arahkan ke lokasi outlet → salin URL dari address bar. Format yang terdeteksi otomatis:<br />
              • <code>https://www.google.com/maps/@-6.9054,107.6191,14z</code> (address bar)<br />
              • <code>https://www.google.com/maps/place/NamaTemp.../@-6.9054,107.6191,15z</code><br />
              • URL &quot;Copy link&quot; place (mengandung <code>!3d</code> dan <code>!4d</code>)<br />
              ⚠️ Link pendek <code>maps.app.goo.gl</code> tidak bisa diparsing — gunakan URL lengkap. Radius 50–150m biasanya cukup.
            </p>
          </AdminSection>

          <AdminSection title="Mode Shift & Jam Operasional">
            <div style={{ marginBottom: 12 }}>
              <label className="label">Mode Shift</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[["1", "1 Shift (full day)"], ["2", "2 Shift (pagi & malam)"]].map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, shift_mode: val }))}
                    style={{
                      padding: "9px 16px", borderRadius: 10, border: "1.5px solid",
                      borderColor: form.shift_mode === val ? "var(--primary)" : "var(--border)",
                      background: form.shift_mode === val ? "rgba(192,57,43,.06)" : "#fff",
                      color: form.shift_mode === val ? "var(--primary)" : "var(--muted)",
                      fontWeight: 700, fontSize: 13, cursor: "pointer"
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            {is2Shift ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                {f("shift1_start", "Shift 1 Mulai", "time", "", true)}
                {f("shift1_end", "Shift 1 Selesai", "time", "", true)}
                {f("shift2_start", "Shift 2 Mulai", "time", "", true)}
                {f("shift2_end", "Shift 2 Selesai", "time", "", true)}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {f("shift1_start", "Jam Buka", "time", "", true)}
                {f("shift1_end", "Jam Tutup", "time", "", true)}
              </div>
            )}
          </AdminSection>

          <AdminSection title="Jendela Waktu Laporan" subtitle="Batas waktu staff bisa kirim laporan buka/tutup toko">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              {f("report_buka_start", "🌅 Buka Dari", "time")}
              {f("report_buka_end", "🌅 Buka Sampai", "time")}
              {f("report_tutup_start", "🌙 Tutup Dari", "time")}
              {f("report_tutup_end", "🌙 Tutup Sampai", "time")}
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
              💡 Kosongkan semua kolom jika tidak ingin membatasi waktu pengiriman laporan. Pastikan jam window sesuai dengan jam shift outlet — misalnya outlet yang buka sore hari jangan pakai window pagi.
            </p>
          </AdminSection>

          <AdminSection title="Integrasi Inventori" subtitle="Hubungkan outlet ini ke sistem inventori eksternal">
            <div>
              <label className="label">Cabang di Sistem Inventori</label>
              {branchesLoading ? (
                <div style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, color: "var(--muted)" }}>
                  Memuat daftar cabang inventori...
                </div>
              ) : (
                <select
                  className="field"
                  value={form.inventory_branch_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, inventory_branch_id: e.target.value }))}
                >
                  <option value="">— Tidak terhubung ke inventori —</option>
                  {inventoryBranches.map((b) => (
                    <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
                  ))}
                  {inventoryBranches.length === 0 && (
                    <option disabled>Tidak ada cabang ditemukan (cek koneksi sistem inventori)</option>
                  )}
                </select>
              )}
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
              💡 Pilih cabang inventori yang sesuai dengan outlet ini. Jika dipilih, staff tidak bisa absen keluar sebelum laporan inventori cabang tersebut selesai.<br />
              Daftar cabang diambil langsung dari sistem inventori saat halaman dibuka.
            </p>

            <div style={{ marginTop: 16 }}>
              <label className="label">Cabang di Sistem Kasir/POS</label>
              {posBranchesLoading ? (
                <div style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, color: "var(--muted)" }}>
                  Memuat daftar cabang kasir...
                </div>
              ) : (
                <select
                  className="field"
                  value={form.pos_branch_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, pos_branch_id: e.target.value }))}
                >
                  <option value="">— Tidak terhubung ke kasir —</option>
                  {posBranches.map((b) => (
                    <option key={b.pos_branch_id} value={b.pos_branch_id}>{b.pos_branch_name}</option>
                  ))}
                  {posBranches.length === 0 && (
                    <option disabled>Tidak ada cabang ditemukan (cek POS_API_URL / POS_API_KEY)</option>
                  )}
                </select>
              )}
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
              💡 Pilih cabang kasir yang sesuai dengan outlet ini. Jika dipilih, staff tidak bisa mengirim laporan <b>Tutup Toko</b> sebelum <b>Tutup Kasir/Shift</b> cabang tersebut dilakukan.
            </p>
          </AdminSection>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Menyimpan..." : editing ? "Update Outlet" : "Simpan Outlet"}
            </button>
            <button type="button" className="btn btn-soft" onClick={() => { setEditing(null); setForm(empty); setShowForm(false); }} disabled={saving}>Batal</button>
          </div>
        </form>
      ) : null}

      {/* Outlet list */}
      {!showForm ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800 }}>
              Outlet Aktif ({loading ? "..." : outlets.filter((o) => o.active).length})
            </h2>
            <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={load} disabled={loading}>
              <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {[1, 2].map((i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 16, padding: 18, border: "1px solid var(--border)" }}>
                  <div style={{ height: 18, width: 140, borderRadius: 6, background: "var(--border)", marginBottom: 8, animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                  <div style={{ height: 12, width: 100, borderRadius: 4, background: "var(--border)", marginBottom: 14, animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                  {[1, 2, 3].map((j) => (
                    <div key={j} style={{ height: 11, width: 120, borderRadius: 4, background: "var(--border)", marginBottom: 6, animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {outlets.filter((o) => o.active).map((outlet) => (
                <div key={outlet.id} style={{ background: "#fff", borderRadius: 16, padding: 18, border: "1px solid var(--border)", boxShadow: "0 2px 10px rgba(0,0,0,.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 900 }}>{outlet.name}</h3>
                      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {outlet.shift_mode === 2 ? "2 Shift" : "1 Shift"} · Radius {outlet.radius_m}m
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button className="btn btn-soft" style={{ fontSize: 12, padding: "7px 14px" }} onClick={() => edit(outlet)}>Edit</button>
                      <button
                        className="btn btn-soft"
                        style={{ fontSize: 12, padding: "7px 10px", color: "var(--danger)", borderColor: "var(--danger-border)" }}
                        onClick={() => deactivate(outlet.id, outlet.name)}
                        title="Nonaktifkan outlet ini"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                    {outlet.shift_mode === 2 ? (
                      <>
                        <span>⏰ S1: {outlet.shift1_start?.slice(0, 5)}–{outlet.shift1_end?.slice(0, 5)}</span>
                        <span>⏰ S2: {outlet.shift2_start?.slice(0, 5)}–{outlet.shift2_end?.slice(0, 5)}</span>
                      </>
                    ) : (
                      <span>⏰ {outlet.shift1_start?.slice(0, 5)}–{outlet.shift1_end?.slice(0, 5)}</span>
                    )}
                    {outlet.report_buka_start ? <span>🌅 Buka: {outlet.report_buka_start?.slice(0, 5)}–{outlet.report_buka_end?.slice(0, 5)}</span> : null}
                    {outlet.report_tutup_start ? <span>🌙 Tutup: {outlet.report_tutup_start?.slice(0, 5)}–{outlet.report_tutup_end?.slice(0, 5)}</span> : null}
                    {outlet.inventory_branch_id ? (
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>📦 Inventori: {outlet.inventory_branch_id}</span>
                    ) : (
                      <span style={{ color: "var(--muted-light)" }}>📦 Inventori: tidak terhubung</span>
                    )}
                    {outlet.location_url ? (
                      <a href={outlet.location_url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                        <MapPin size={12} /> Lihat di Maps
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
              {outlets.filter((o) => o.active).length === 0 && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "32px 16px", color: "var(--muted-light)", fontSize: 13, border: "2px dashed var(--border)", borderRadius: 12 }}>
                  Belum ada outlet aktif. Tambahkan outlet baru.
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </AdminPage>
  );
}
