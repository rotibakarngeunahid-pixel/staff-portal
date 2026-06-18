"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, FileUp, Loader2, RefreshCw, Upload } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { rupiah } from "@/lib/format";

type ImportStatus = "ready" | "success" | "failed" | "duplicate";

type ImportRow = {
  rowNumber: number;
  status: ImportStatus;
  statusLabel: string;
  reason: string;
  raw: Record<string, string>;
  normalized: {
    staffName: string;
    outletName: string;
    date: string;
    shift: string;
    checkinTime: string;
    checkoutTime: string;
    finalSalary: number;
  };
};

type ImportSummary = {
  totalRows: number;
  ready: number;
  imported: number;
  failed: number;
  duplicate: number;
  needsFix: number;
};

type ImportResult = {
  ok: true;
  columns: string[];
  mapping: Record<string, string>;
  rows: ImportRow[];
  summary: ImportSummary;
};

const fieldChoices = [
  { key: "staffName", label: "Nama staff", required: true },
  { key: "outletName", label: "Outlet", required: true },
  { key: "date", label: "Tanggal", required: true },
  { key: "checkinTime", label: "Jam masuk", required: true },
  { key: "checkoutTime", label: "Jam pulang" },
  { key: "shift", label: "Shift" },
  { key: "staffId", label: "ID staff" },
  { key: "outletId", label: "ID outlet" },
  { key: "status", label: "Status lama" },
  { key: "lateMinutes", label: "Menit terlambat" },
  { key: "deduction", label: "Potongan" },
  { key: "finalSalary", label: "Gaji final" },
  { key: "arrivalTime", label: "Jam datang" },
  { key: "reportTime", label: "Jam laporan" },
  { key: "finalCheckinTime", label: "Jam masuk final" },
  { key: "flags", label: "Catatan lama" },
  { key: "selfieIn", label: "Foto masuk" },
  { key: "selfieOut", label: "Foto pulang" },
  { key: "lat", label: "Latitude" },
  { key: "lng", label: "Longitude" },
  { key: "paidStatus", label: "Sudah dibayar" },
  { key: "createdAt", label: "Dibuat pada" }
];

const statusColors: Record<ImportStatus, string> = {
  ready: "status-ok",
  success: "status-ok",
  failed: "status-danger",
  duplicate: "status-warn"
};

export default function AdminAttendanceImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const visibleRows = useMemo(() => result?.rows.slice(0, 100) || [], [result]);
  const hasImported = Boolean(result?.summary.imported);

  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    setResult(null);
    setColumns([]);
    setMapping({});
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setMessage("File harus berformat CSV. Pilih file dengan akhiran .csv.");
      setMsgType("err");
      return;
    }
    setFile(selected);
    setMessage("File siap dicek. Klik Cek data untuk melihat preview.");
    setMsgType("info");
  }

  function formData() {
    if (!file) return null;
    const data = new FormData();
    data.append("file", file);
    data.append("mapping", JSON.stringify(mapping));
    return data;
  }

  async function checkData() {
    const data = formData();
    if (!data) {
      setMessage("Upload file absensi lama terlebih dahulu.");
      setMsgType("err");
      return;
    }
    setPreviewLoading(true);
    setMessage("Membaca file dan mengecek data...");
    setMsgType("info");
    try {
      const payload = await apiFetch<ImportResult>("/api/admin/attendance-import/preview", {
        method: "POST",
        role: "admin",
        body: data
      });
      setResult(payload);
      setColumns(payload.columns);
      setMapping(payload.mapping);
      setMessage(`Cek selesai. ${payload.summary.ready} baris siap import, ${payload.summary.failed} perlu diperbaiki, ${payload.summary.duplicate} duplikat.`);
      setMsgType(payload.summary.failed > 0 ? "err" : "ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal membaca file CSV.");
      setMsgType("err");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function importData() {
    const data = formData();
    if (!data || !result) return;
    const ready = result.summary.ready;
    if (ready <= 0) {
      setMessage("Tidak ada data yang siap diimport.");
      setMsgType("err");
      return;
    }
    if (!window.confirm(`Import ${ready} baris data yang sudah valid ke sistem?`)) return;

    setImportLoading(true);
    setMessage("Mengimport data ke sistem...");
    setMsgType("info");
    try {
      const payload = await apiFetch<ImportResult>("/api/admin/attendance-import/import", {
        method: "POST",
        role: "admin",
        body: data
      });
      setResult(payload);
      setColumns(payload.columns);
      setMapping(payload.mapping);
      setMessage(`Import selesai. Berhasil: ${payload.summary.imported}, gagal: ${payload.summary.failed}, duplikat: ${payload.summary.duplicate}.`);
      setMsgType(payload.summary.failed > 0 ? "err" : "ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal import data.");
      setMsgType("err");
    } finally {
      setImportLoading(false);
    }
  }

  function downloadReport() {
    if (!result) return;
    const rows = result.rows.map((row) => ({
      baris_csv: row.rowNumber,
      hasil: row.statusLabel,
      alasan: row.reason,
      staff: row.normalized.staffName || row.raw[mapping.staffName || ""] || "",
      outlet: row.normalized.outletName || row.raw[mapping.outletName || ""] || "",
      tanggal: row.normalized.date,
      shift: row.normalized.shift,
      jam_masuk: row.normalized.checkinTime,
      jam_pulang: row.normalized.checkoutTime,
      gaji_final: row.normalized.finalSalary || ""
    }));
    const csv = toCsv(rows);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan-import-absensi-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminPage
      title="Import Absensi"
      subtitle="Upload file absensi lama, cek data, lalu import ke sistem"
      action={
        result ? (
          <button className="btn btn-soft" style={{ fontSize: 13 }} onClick={downloadReport}>
            <Download size={15} /> Download laporan
          </button>
        ) : null
      }
    >
      <MsgBar message={message} type={msgType} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <SummaryBox label="Total baris CSV" value={result?.summary.totalRows ?? 0} />
        <SummaryBox label={hasImported ? "Berhasil diimport" : "Siap import"} value={hasImported ? result?.summary.imported ?? 0 : result?.summary.ready ?? 0} tone="ok" />
        <SummaryBox label="Gagal" value={result?.summary.failed ?? 0} tone="danger" />
        <SummaryBox label="Duplikat" value={result?.summary.duplicate ?? 0} tone="warn" />
        <SummaryBox label="Perlu diperbaiki" value={result?.summary.needsFix ?? 0} tone="danger" />
      </div>

      <AdminSection title="1. Upload file absensi lama">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "end" }}>
          <div>
            <label className="label">File CSV</label>
            <input className="field" type="file" accept=".csv,text/csv" onChange={chooseFile} />
            {file ? (
              <p style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                File dipilih: <strong>{file.name}</strong>
              </p>
            ) : null}
          </div>
          <button className="btn btn-primary" type="button" onClick={checkData} disabled={!file || previewLoading || importLoading}>
            {previewLoading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={15} />}
            {previewLoading ? "Mengecek..." : "Cek data"}
          </button>
        </div>
      </AdminSection>

      {columns.length > 0 ? (
        <AdminSection title="2. Sesuaikan kolom" subtitle="Jika pilihan otomatis belum benar, ubah pilihan lalu klik Cek data lagi.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {fieldChoices.map((field) => (
              <div key={field.key}>
                <label className="label">
                  {field.label}{field.required ? <span style={{ color: "var(--danger)" }}>*</span> : null}
                </label>
                <select
                  className="field"
                  value={mapping[field.key] || ""}
                  onChange={(event) => setMapping((prev) => ({ ...prev, [field.key]: event.target.value }))}
                >
                  <option value="">Tidak dipakai</option>
                  {columns.map((column) => (
                    <option key={column} value={column}>{column}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button className="btn btn-soft" type="button" onClick={checkData} disabled={!file || previewLoading || importLoading}>
              {previewLoading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={15} />}
              Cek ulang
            </button>
          </div>
        </AdminSection>
      ) : null}

      {result ? (
        <AdminSection title="3. Preview data">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <p style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
              Data yang statusnya duplikat atau perlu diperbaiki tidak akan dimasukkan ulang.
            </p>
            <button className="btn btn-primary" type="button" onClick={importData} disabled={importLoading || previewLoading || result.summary.ready === 0}>
              {importLoading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={15} />}
              {importLoading ? "Mengimport..." : `Import ${result.summary.ready} data`}
            </button>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Baris</th>
                  <th>Status</th>
                  <th>Alasan</th>
                  <th>Staff</th>
                  <th>Outlet</th>
                  <th>Tanggal</th>
                  <th>Shift</th>
                  <th>Masuk</th>
                  <th>Pulang</th>
                  <th>Gaji</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td data-label="Baris">{row.rowNumber}</td>
                    <td data-label="Status"><span className={`status-pill ${statusColors[row.status]}`}>{row.statusLabel}</span></td>
                    <td data-label="Alasan" style={{ minWidth: 220, color: row.status === "failed" ? "var(--danger)" : "var(--muted)" }}>{row.reason || "-"}</td>
                    <td data-label="Staff" style={{ fontWeight: 700 }}>{row.normalized.staffName || "-"}</td>
                    <td data-label="Outlet">{row.normalized.outletName || "-"}</td>
                    <td data-label="Tanggal">{row.normalized.date || "-"}</td>
                    <td data-label="Shift">{row.normalized.shift || "-"}</td>
                    <td data-label="Masuk">{row.normalized.checkinTime || "-"}</td>
                    <td data-label="Pulang">{row.normalized.checkoutTime || "-"}</td>
                    <td data-label="Gaji" style={{ fontWeight: 700 }}>{row.normalized.finalSalary ? rupiah(row.normalized.finalSalary) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rows.length > visibleRows.length ? (
            <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
              Menampilkan 100 baris pertama dari {result.rows.length} baris. Download laporan untuk melihat semua hasil.
            </p>
          ) : null}
        </AdminSection>
      ) : (
        <AdminSection title="Preview data">
          <div style={{ display: "flex", gap: 12, alignItems: "center", color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>
            <FileUp size={18} />
            Upload file CSV lalu klik Cek data untuk melihat hasil sebelum import.
          </div>
        </AdminSection>
      )}
    </AdminPage>
  );
}

function SummaryBox({ label, value, tone = "neutral" }: Readonly<{ label: string; value: number; tone?: "neutral" | "ok" | "warn" | "danger" }>) {
  const color = tone === "ok" ? "var(--success)" : tone === "warn" ? "var(--warning)" : tone === "danger" ? "var(--danger)" : "var(--ink)";
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", boxShadow: "var(--shadow-xs)" }}>
      <p style={{ fontSize: 11, color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
      <p style={{ marginTop: 5, color, fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{value}</p>
    </div>
  );
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  });
  return lines.join("\n");
}

function csvCell(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
