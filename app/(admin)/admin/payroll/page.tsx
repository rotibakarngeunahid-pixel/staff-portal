"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, RefreshCw, Save } from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";
import { formatDateID, rupiah } from "@/lib/format";

type PaymentRecord = {
  id: string;
  paid_at: string;
  amount: number;
  note: string | null;
  proof_url: string | null;
  date_from: string | null;
  date_to: string | null;
};

type PayrollStaff = {
  id: string;
  name: string;
  active: boolean;
  totalEarned: number;
  totalPaid: number;
  balance: number;
  attendance: Array<{ id: string; date: string; shift: number; final_salary: number; paid_status: boolean }>;
  payments: PaymentRecord[];
};

export default function AdminPayrollPage() {
  const [payroll, setPayroll] = useState<PayrollStaff[]>([]);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({ dateFrom: "", dateTo: "", amount: "", note: "" });
  const [proof, setProof] = useState<string>("");
  const [proofName, setProofName] = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const payload = await apiFetch<{ ok: true; payroll: PayrollStaff[] }>("/api/admin/payroll", { role: "admin" });
      setPayroll(payload.payroll);
      if (!selected && payload.payroll[0]) setSelected(payload.payroll[0].id);
    } catch (err) {
      setMessage((err as Error).message);
      setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = useMemo(() => payroll.find((item) => item.id === selected) || null, [payroll, selected]);
  const unpaid = current?.attendance.filter((row) => !row.paid_status) || [];
  const payments = current?.payments || [];

  function onProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setProof(ev.target?.result as string ?? "");
    reader.readAsDataURL(file);
  }

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setMessage("Memproses pembayaran..."); setMsgType("info");
    try {
      const body: Record<string, unknown> = { staffId: selected, ...form };
      if (proof) body.proof = proof;
      const payload = await apiFetch<{ ok: true; overpayment: number }>("/api/admin/payroll", {
        method: "POST", role: "admin", body
      });
      setForm({ dateFrom: "", dateTo: "", amount: "", note: "" });
      setProof(""); setProofName("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
      setMessage(payload.overpayment
        ? `Tersimpan. Lebih bayar ${rupiah(payload.overpayment)} (dicatat dalam catatan).`
        : "Pembayaran tersimpan ✓");
      setMsgType("ok");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal memproses pembayaran"); setMsgType("err");
    }
  }

  const SUMMARY = [
    { label: "Total Diperoleh", value: rupiah(current?.totalEarned || 0), color: "#2980B9", bg: "#EBF5FB" },
    { label: "Sudah Dibayar", value: rupiah(current?.totalPaid || 0), color: "#27AE60", bg: "#EAFAF1" },
    { label: "Belum Dibayar", value: rupiah(current?.balance || 0), color: current?.balance ? "var(--primary)" : "var(--muted-light)", bg: current?.balance ? "rgba(192,57,43,.05)" : "#F8F9FA" }
  ];

  return (
    <AdminPage
      title="Penggajian"
      subtitle="Ringkasan saldo dan proses pembayaran"
      action={
        <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={load} disabled={loading}>
          <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
        </button>
      }
    >
      <MsgBar message={message} type={msgType} />

      {/* Staff selector + summary cards */}
      <AdminSection title="Pilih Staff & Ringkasan Gaji">
        <div style={{ marginBottom: 14 }}>
          <label className="label">Staff</label>
          <select className="field" style={{ maxWidth: 320 }} value={selected} onChange={(e) => setSelected(e.target.value)}>
            {loading
              ? <option>Memuat...</option>
              : payroll.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{!item.active ? " (nonaktif)" : ""}
                  </option>
                ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 16px", textAlign: "center" }}>
                <div style={{ height: 10, width: 70, borderRadius: 4, background: "var(--border)", margin: "0 auto 12px", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
                <div style={{ height: 24, width: 100, borderRadius: 6, background: "var(--border)", margin: "0 auto", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
              </div>
            ))
          ) : SUMMARY.map((s) => (
            <div key={s.label} style={{ background: s.bg, border: "1px solid var(--border)", borderRadius: 14, padding: "18px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-light)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: "var(--font-nunito, sans-serif)" }}>{s.value}</div>
            </div>
          ))}
        </div>
      </AdminSection>

      {/* Unpaid shifts */}
      <AdminSection title={`Shift Belum Dibayar (${loading ? "..." : unpaid.length})`} subtitle="Daftar shift yang belum ditandai lunas untuk staff ini">
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Shift</th>
                <th>Gaji Final</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3].map((i) => (
                  <tr key={i}>
                    {[90, 40, 80, 60].map((w, j) => (
                      <td key={j}><div style={{ height: 12, width: w, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} /></td>
                    ))}
                  </tr>
                ))
              ) : unpaid.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--muted-light)", fontSize: 13 }}>
                  {current ? "Semua shift sudah dibayar 🎉" : "Pilih staff terlebih dahulu"}
                </td></tr>
              ) : unpaid.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateID(row.date)}</td>
                  <td>{row.shift === 0 ? "Full" : `Shift ${row.shift}`}</td>
                  <td style={{ fontWeight: 700 }}>{rupiah(row.final_salary)}</td>
                  <td><span className="status-pill status-warn">Belum dibayar</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      {/* Payment form */}
      <AdminSection title="Proses Pembayaran" subtitle="Tandai gaji sebagai sudah dibayarkan dan unggah bukti transfer">
        <form onSubmit={pay}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label className="label">Dari Tanggal<span style={{ color: "var(--danger)" }}>*</span></label>
              <input className="field" type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} required />
            </div>
            <div>
              <label className="label">Sampai Tanggal<span style={{ color: "var(--danger)" }}>*</span></label>
              <input className="field" type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} required />
            </div>
            <div>
              <label className="label">Jumlah Bayar (Rp)<span style={{ color: "var(--danger)" }}>*</span></label>
              <input className="field" type="number" min="1" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <div>
              <label className="label">Catatan</label>
              <input className="field" placeholder="Opsional" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Bukti Pembayaran (foto/screenshot transfer)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10, border: "1.5px dashed var(--border)",
                background: "var(--surface-soft)", fontSize: 12, fontWeight: 600, color: "var(--muted)",
                cursor: "pointer"
              }}>
                <ImageIcon size={14} />
                {proofName || "Pilih gambar..."}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onProofChange} />
              </label>
              {proof && (
                <button
                  type="button"
                  onClick={() => { setProof(""); setProofName(""); if (fileRef.current) fileRef.current.value = ""; }}
                  style={{ fontSize: 11, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
                >
                  Hapus
                </button>
              )}
            </div>
            {proof && (
              <p style={{ fontSize: 11, color: "var(--success)", marginTop: 6, fontWeight: 600 }}>
                ✓ Bukti dipilih — akan diunggah bersama pembayaran
              </p>
            )}
          </div>
          <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }}>
            <Save size={15} /> Proses Bayar
          </button>
        </form>
      </AdminSection>

      {/* Payment history */}
      {!loading && payments.length > 0 && (
        <AdminSection title={`Riwayat Pembayaran (${payments.length})`} subtitle="Semua pembayaran yang sudah diproses untuk staff ini">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {payments.map((payment) => (
              <div key={payment.id} style={{
                background: "#fff", border: "1px solid var(--success-border)", borderRadius: 12,
                padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)", marginBottom: 2 }}>
                    {formatDateID(payment.paid_at.slice(0, 10))}
                  </p>
                  {payment.date_from && payment.date_to && (
                    <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>
                      Periode: {formatDateID(payment.date_from)} – {formatDateID(payment.date_to)}
                    </p>
                  )}
                  {payment.note && (
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>
                      {payment.note.replace(/\[LEBIH_BAYAR:\d+\]/g, "").trim() || null}
                    </p>
                  )}
                  {payment.proof_url && (
                    <a href={payment.proof_url} target="_blank" rel="noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--primary)", marginTop: 4 }}>
                      🧾 Lihat Bukti
                    </a>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontFamily: "var(--font-nunito,sans-serif)", fontSize: 18, fontWeight: 900, color: "var(--success)" }}>
                    {rupiah(payment.amount)}
                  </p>
                  <span className="status-pill status-ok" style={{ fontSize: 10 }}>Dibayar</span>
                </div>
              </div>
            ))}
          </div>
        </AdminSection>
      )}
    </AdminPage>
  );
}
