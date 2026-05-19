"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ImageIcon, Plus, Save, Trash2, Upload } from "lucide-react";
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
  _error?: string;
};

function validateItems(items: Item[]): Item[] {
  const seenLabels = new Map<string, number>();
  return items.map((item, index) => {
    const label = item.label.trim();
    let err = "";
    if (label.length === 0) {
      err = "Label wajib diisi";
    } else if (label.length < 2) {
      err = "Label minimal 2 karakter";
    } else if (label.length > 80) {
      err = "Label maksimal 80 karakter";
    } else {
      const normalized = label.toLowerCase();
      const prevIndex = seenLabels.get(normalized);
      if (prevIndex !== undefined) {
        err = `Duplikat dengan item ${prevIndex + 1}`;
      } else {
        seenLabels.set(normalized, index);
      }
    }
    return { ...item, _error: err };
  });
}

export default function AdminReportCfgPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [type, setType] = useState<"BUKA" | "TUTUP">("BUKA");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function loadOutlets() {
    const payload = await apiFetch<{ ok: true; outlets: Outlet[] }>("/api/admin/outlets", { role: "admin" });
    setOutlets(payload.outlets);
    if (!outletId && payload.outlets[0]) {
      const firstId = payload.outlets[0].id;
      setOutletId(firstId);
      loadItemsFor(firstId, type).catch((err: Error) => setMessage(humanError(err)));
    }
  }

  async function loadItemsFor(nextOutlet: string, nextType: "BUKA" | "TUTUP") {
    if (!nextOutlet) return;
    setLoading(true);
    setMessage(""); setMsgType("info");
    try {
      const payload = await apiFetch<{ ok: true; items: Item[] }>("/api/admin/report-cfg", {
        role: "admin",
        body: { outletId: nextOutlet, type: nextType }
      });
      setItems(payload.items.map((item) => ({ ...item, _error: "" })));
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOutlets().catch((err: Error) => setMessage(humanError(err)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!outletId) return;
    loadItemsFor(outletId, type).catch((err: Error) => { setMessage(humanError(err)); setMsgType("err"); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId, type]);

  function update(index: number, patch: Partial<Item>) {
    setItems((cur) => {
      const updated = cur.map((item, i) => (i === index ? { ...item, ...patch } : item));
      return validateItems(updated);
    });
  }

  async function setExamplePhoto(index: number, file?: File) {
    if (!file) return;
    update(index, { example_photo: await dataUrlFromFile(file) });
  }

  function addItem() {
    setItems((cur) => {
      const next = [...cur, { label: "", required: true, sort_order: cur.length, _error: "Label wajib diisi" }];
      return validateItems(next);
    });
  }

  function removeItem(index: number) {
    setItems((cur) => validateItems(cur.filter((_, i) => i !== index)));
  }

  function moveItem(index: number, direction: "up" | "down") {
    setItems((cur) => {
      const next = [...cur];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return cur;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return validateItems(next);
    });
  }

  const hasErrors = items.some((item) => Boolean(item._error));

  async function save() {
    const validated = validateItems(items);
    setItems(validated);
    if (validated.some((item) => Boolean(item._error))) {
      setMessage("Perbaiki semua error sebelum menyimpan"); setMsgType("err");
      return;
    }
    setMessage("Menyimpan..."); setMsgType("info");
    try {
      const result = await apiFetch<{ ok: true; items: Item[] }>("/api/admin/report-cfg", {
        method: "POST",
        role: "admin",
        body: { outletId, type, items: items.map((item, i) => ({ ...item, sort_order: i })) }
      });
      await loadItemsFor(outletId, type);
      setMessage(`Konfigurasi tersimpan ✓ — ${result.items.length} item`); setMsgType("ok");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    }
  }

  async function clearAll() {
    setConfirmClear(false);
    setClearing(true);
    setMessage("Menghapus konfigurasi..."); setMsgType("info");
    try {
      await apiFetch("/api/admin/report-cfg", {
        method: "POST",
        role: "admin",
        body: { outletId, type, items: [], clearAll: true }
      });
      setItems([]);
      setMessage("Semua konfigurasi dihapus ✓"); setMsgType("ok");
    } catch (err) {
      setMessage(humanError(err)); setMsgType("err");
    } finally {
      setClearing(false);
    }
  }

  const typeColor = type === "BUKA" ? "#2980B9" : "#8E44AD";

  return (
    <AdminPage title="Konfigurasi Laporan" subtitle="Atur item foto wajib per outlet dan tipe laporan">
      {/* Confirm clear dialog */}
      {confirmClear && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "24px 24px 20px", width: "min(100%, 400px)",
            boxShadow: "0 8px 40px rgba(15,23,42,0.18)"
          }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🗑️</div>
              <h2 style={{ fontSize: 17, fontWeight: 900, marginBottom: 8 }}>Hapus Semua Konfigurasi?</h2>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
                Semua item laporan <strong>{type}</strong> untuk outlet ini akan dihapus permanen.<br />
                Tindakan ini tidak bisa dibatalkan.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn btn-soft"
                style={{ flex: 1, fontSize: 13 }}
                onClick={() => setConfirmClear(false)}
              >
                Batal
              </button>
              <button
                type="button"
                style={{
                  flex: 1, fontSize: 13, fontWeight: 800,
                  background: "var(--danger-bg)", color: "var(--danger)",
                  border: "1.5px solid var(--danger-border)", borderRadius: 12,
                  padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                }}
                onClick={clearAll}
                disabled={clearing}
              >
                <Trash2 size={14} /> Ya, Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selector */}
      <AdminSection title="Pilih Outlet & Tipe Laporan">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label className="label">Outlet</label>
            <select
              className="field"
              value={outletId}
              onChange={(e) => { setOutletId(e.target.value); setItems([]); }}
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
                  onClick={() => { setType(t); setItems([]); }}
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
        title={`Item Laporan ${type} (${loading ? "..." : items.length} item)`}
        subtitle="Urutan dari atas ke bawah menentukan urutan pengambilan foto oleh staff"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "24px 16px", color: "var(--muted-light)", fontSize: 13 }}>
              Memuat konfigurasi...
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted-light)", fontSize: 13, border: "2px dashed var(--border)", borderRadius: 12 }}>
              Belum ada item. Klik &quot;Tambah Item&quot; untuk memulai.
            </div>
          ) : null}

          {!loading && items.map((item, index) => {
            const preview = item.example_photo || item.example_photo_url;
            const hasErr = Boolean(item._error);
            return (
              <div
                key={item.id || index}
                style={{
                  background: hasErr ? "var(--danger-bg, #FEF2F2)" : "var(--surface-soft)",
                  border: `1px solid ${hasErr ? "var(--danger-border, #FECACA)" : "var(--border)"}`,
                  borderRadius: 14,
                  padding: 14,
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto",
                  gap: 12,
                  alignItems: "flex-start"
                }}
              >
                {/* Order controls / number */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-light)", minWidth: 18, textAlign: "center" }}>{index + 1}</span>
                  <button
                    type="button"
                    title="Pindah ke atas"
                    disabled={index === 0}
                    onClick={() => moveItem(index, "up")}
                    style={{
                      background: index === 0 ? "var(--surface-soft)" : "#fff",
                      border: "1px solid var(--border)", borderRadius: 6,
                      width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: index === 0 ? "not-allowed" : "pointer",
                      color: index === 0 ? "var(--muted-light)" : "var(--muted)"
                    }}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    title="Pindah ke bawah"
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, "down")}
                    style={{
                      background: index === items.length - 1 ? "var(--surface-soft)" : "#fff",
                      border: "1px solid var(--border)", borderRadius: 6,
                      width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: index === items.length - 1 ? "not-allowed" : "pointer",
                      color: index === items.length - 1 ? "var(--muted-light)" : "var(--muted)"
                    }}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* Fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label className="label">Label Item</label>
                    <input
                      className="field"
                      placeholder="Contoh: Tampak Depan, Meja Kasir, ..."
                      value={item.label}
                      onChange={(e) => update(index, { label: e.target.value })}
                      style={{ borderColor: hasErr ? "var(--danger)" : undefined }}
                    />
                    {hasErr && (
                      <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <AlertTriangle size={11} /> {item._error}
                      </p>
                    )}
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

                {/* Delete item */}
                <button
                  type="button"
                  style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", marginTop: 22 }}
                  onClick={() => removeItem(index)}
                  title="Hapus item ini"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-soft" style={{ fontSize: 13 }} onClick={addItem}>
            <Plus size={15} /> Tambah Item
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: 13 }}
            onClick={save}
            disabled={hasErrors || items.length === 0}
            title={hasErrors ? "Perbaiki error terlebih dahulu" : ""}
          >
            <Save size={15} /> Simpan Konfigurasi
          </button>

          {/* Danger zone — styled as secondary outline-danger, not big red */}
          {items.length > 0 && (
            <button
              type="button"
              style={{
                marginLeft: "auto",
                fontSize: 12, fontWeight: 700,
                background: "transparent",
                color: "var(--danger)",
                border: "1.5px solid var(--danger-border)",
                borderRadius: 10,
                padding: "8px 14px",
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                opacity: clearing ? 0.5 : 1
              }}
              onClick={() => setConfirmClear(true)}
              disabled={clearing}
            >
              <Trash2 size={13} /> Kosongkan Konfigurasi
            </button>
          )}
        </div>
      </AdminSection>
    </AdminPage>
  );
}

function humanError(err: unknown): string {
  if (!(err instanceof Error)) return "Terjadi kesalahan. Coba lagi.";
  const msg = err.message;
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch"))
    return "Koneksi bermasalah. Periksa internet lalu coba lagi.";
  if (msg.includes("401") || msg.includes("Sesi") || msg.includes("login"))
    return "Sesi berakhir. Silakan login ulang.";
  if (msg.includes("403") || msg.includes("ditolak") || msg.includes("izin"))
    return "Anda tidak memiliki izin untuk mengubah konfigurasi ini.";
  if (msg.includes("duplikat") || msg.includes("unique") || msg.includes("Duplikat"))
    return "Terdapat label yang sama. Pastikan setiap item memiliki nama unik.";
  if (msg.includes("500") || msg.includes("server"))
    return "Server sedang bermasalah. Coba beberapa saat lagi.";
  return msg || "Terjadi kesalahan. Coba lagi.";
}
