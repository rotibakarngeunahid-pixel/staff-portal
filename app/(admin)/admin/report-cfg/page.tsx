"use client";

import { useEffect, useState } from "react";
import { GripVertical, ImageIcon, Plus, Save, Trash2, Upload } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch, dataUrlFromFile } from "@/lib/client-api";

type Outlet = { id: string; name: string };
type Item = {
  id?: string;
  label: string;
  required: boolean;
  sort_order: number;
  example_photo_url?: string | null;
  example_photo?: string;
};

export default function AdminReportCfgPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [type, setType] = useState<"BUKA" | "TUTUP">("BUKA");
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");

  async function loadOutlets() {
    const payload = await apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" });
    setOutlets(payload.outlets);
    if (!outletId && payload.outlets[0]) setOutletId(payload.outlets[0].id);
  }

  async function loadItems(nextOutlet = outletId) {
    if (!nextOutlet) return;
    const payload = await apiFetch<{ ok: true; items: Item[] }>("/api/admin/report-cfg", {
      role: "admin",
      body: { outletId: nextOutlet, type }
    });
    setItems(payload.items);
  }

  useEffect(() => { loadOutlets().catch((err: Error) => setMessage(err.message)); }, []);
  useEffect(() => { loadItems().catch((err: Error) => setMessage(err.message)); }, [outletId, type]);

  function update(index: number, patch: Partial<Item>) {
    setItems((cur) => cur.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function setExamplePhoto(index: number, file?: File) {
    if (!file) return;
    update(index, { example_photo: await dataUrlFromFile(file) });
  }

  function addItem() {
    setItems((cur) => [...cur, { label: "", required: true, sort_order: cur.length }]);
  }

  function removeItem(index: number) {
    setItems((cur) => cur.filter((_, i) => i !== index));
  }

  async function save() {
    setMessage("Menyimpan..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/report-cfg", {
        method: "POST",
        role: "admin",
        body: { outletId, type, items: items.map((item, i) => ({ ...item, sort_order: i })) }
      });
      await loadItems();
      setMessage("Konfigurasi tersimpan ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan"); setMsgType("err");
    }
  }

  const typeColor = type === "BUKA" ? "#2980B9" : "#8E44AD";

  return (
    <AdminPage title="Konfigurasi Laporan" subtitle="Atur item foto wajib per outlet dan tipe laporan">
      {/* Selector */}
      <AdminSection title="Pilih Outlet & Tipe Laporan">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label className="label">Outlet</label>
            <select
              className="field"
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
            >
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tipe Laporan</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["BUKA", "TUTUP"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  style={{
                    padding: "9px 20px", borderRadius: 10, border: "1.5px solid",
                    borderColor: type === t ? typeColor : "var(--border)",
                    background: type === t ? `${typeColor}11` : "#fff",
                    color: type === t ? typeColor : "var(--muted)",
                    fontWeight: 800, fontSize: 13, cursor: "pointer"
                  }}
                >
                  {t === "BUKA" ? "🌅 BUKA" : "🌙 TUTUP"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </AdminSection>

      <MsgBar message={message} type={msgType} />

      {/* Items */}
      <AdminSection
        title={`Item Laporan ${type} (${items.length} item)`}
        subtitle="Setiap item memerlukan foto dari staff saat laporan"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted-light)", fontSize: 13, border: "2px dashed var(--border)", borderRadius: 12 }}>
              Belum ada item. Klik &quot;Tambah Item&quot; untuk memulai.
            </div>
          ) : null}

          {items.map((item, index) => {
            const preview = item.example_photo || item.example_photo_url;
            return (
              <div
                key={item.id || index}
                style={{
                  background: "var(--surface-soft)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: 14,
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto",
                  gap: 12,
                  alignItems: "flex-start"
                }}
              >
                {/* Drag handle / number */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 8 }}>
                  <GripVertical size={16} style={{ color: "var(--muted-light)" }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-light)", minWidth: 18 }}>{index + 1}</span>
                </div>

                {/* Fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label className="label">Label Item</label>
                    <input
                      className="field"
                      placeholder={`Contoh: Tampak Depan, Meja Kasir, ...`}
                      value={item.label}
                      onChange={(e) => update(index, { label: e.target.value })}
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(e) => update(index, { required: e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: "var(--primary)" }}
                    />
                    Foto wajib diisi oleh staff
                  </label>
                </div>

                {/* Example photo */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <label className="label" style={{ alignSelf: "flex-start" }}>Contoh Foto</label>
                  {preview ? (
                    <a href={preview} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt="contoh" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }} />
                    </a>
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: 10, border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
                      <ImageIcon size={20} style={{ color: "var(--muted-light)" }} />
                    </div>
                  )}
                  <label className="btn btn-soft" style={{ fontSize: 11, padding: "6px 12px", cursor: "pointer" }}>
                    <Upload size={12} /> {preview ? "Ubah" : "Upload"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setExamplePhoto(index, e.target.files?.[0])} />
                  </label>
                  {preview ? (
                    <button type="button" style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", background: "none", border: "none", cursor: "pointer" }}
                      onClick={() => update(index, { example_photo: "", example_photo_url: null })}>
                      Hapus
                    </button>
                  ) : null}
                </div>

                {/* Delete */}
                <button
                  type="button"
                  style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", marginTop: 22 }}
                  onClick={() => removeItem(index)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn btn-soft" style={{ fontSize: 13 }} onClick={addItem}>
            <Plus size={15} /> Tambah Item
          </button>
          <button type="button" className="btn btn-primary" style={{ fontSize: 13 }} onClick={save}>
            <Save size={15} /> Simpan Konfigurasi
          </button>
        </div>
      </AdminSection>
    </AdminPage>
  );
}
