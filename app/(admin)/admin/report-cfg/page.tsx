"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
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

  useEffect(() => {
    loadOutlets().catch((err: Error) => setMessage(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadItems().catch((err: Error) => setMessage(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId, type]);

  function update(index: number, patch: Partial<Item>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function setExamplePhoto(index: number, file?: File) {
    if (!file) return;
    update(index, { example_photo: await dataUrlFromFile(file) });
  }

  function removeExamplePhoto(index: number) {
    update(index, { example_photo: "", example_photo_url: null });
  }

  async function save() {
    setMessage("Menyimpan...");
    try {
      await apiFetch("/api/admin/report-cfg", {
        method: "POST",
        role: "admin",
        body: {
          outletId,
          type,
          items: items.map((item, index) => ({ ...item, sort_order: index }))
        }
      });
      await loadItems();
      setMessage("Tersimpan");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan");
    }
  }

  return (
    <AdminPage title="Konfigurasi Laporan" subtitle="Item foto wajib per outlet dan tipe laporan">
      <section className="panel mb-5 grid gap-3 p-4 md:grid-cols-4">
        <select className="field" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
          {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
        </select>
        <select className="field" value={type} onChange={(e) => setType(e.target.value as "BUKA" | "TUTUP")}>
          <option value="BUKA">BUKA</option>
          <option value="TUTUP">TUTUP</option>
        </select>
        <button className="btn btn-soft" onClick={() => setItems([...items, { label: "", required: true, sort_order: items.length, example_photo_url: null }])}>Tambah Item</button>
        <button className="btn btn-primary" onClick={save}>Simpan</button>
      </section>
      <p className="mb-3 text-sm font-bold text-slate-500">{message}</p>
      <section className="panel overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Urutan</th><th>Label</th><th>Wajib</th><th>Contoh Foto</th><th>Aksi</th></tr></thead>
          <tbody>
            {items.map((item, index) => {
              const preview = item.example_photo || item.example_photo_url;
              return (
                <tr key={item.id || index}>
                  <td>{index + 1}</td>
                  <td><input className="field min-w-56" value={item.label} onChange={(e) => update(index, { label: e.target.value })} /></td>
                  <td>
                    <label className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--muted)]">
                      <input type="checkbox" checked={item.required} onChange={(e) => update(index, { required: e.target.checked })} />
                      Wajib
                    </label>
                  </td>
                  <td>
                    <div className="flex min-w-60 items-center gap-3">
                      {preview ? (
                        <a href={preview} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-soft)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={preview} alt={`Contoh ${item.label || "foto"}`} className="h-full w-full object-cover" />
                        </a>
                      ) : (
                        <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-soft)] text-[var(--muted)]">
                          <ImageIcon size={20} />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <label className="btn btn-soft min-h-9 px-3 text-xs">
                          <Upload size={14} />
                          {preview ? "Ubah" : "Upload"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => setExamplePhoto(index, event.target.files?.[0])}
                          />
                        </label>
                        {preview ? (
                          <button type="button" className="btn btn-danger min-h-9 px-3 text-xs" onClick={() => removeExamplePhoto(index)}>
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td><button className="btn btn-danger min-h-9 px-3 text-xs" onClick={() => setItems(items.filter((_, i) => i !== index))}>Hapus</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </AdminPage>
  );
}
