"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  MailCheck,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  XCircle
} from "lucide-react";
import { AdminPage, AdminSection, MsgBar } from "@/components/admin/admin-page";
import { apiFetch } from "@/lib/client-api";

type EmailType =
  | "attendance_in"
  | "opening_report"
  | "closing_report"
  | "attendance_out"
  | "late_attendance"
  | "leave_request"
  | "leave_approved"
  | "leave_rejected"
  | "full_shift"
  | "report_late"
  | "system_warning";

type EmailLog = {
  id: string;
  notification_type: string;
  recipient: string;
  subject: string;
  status: "pending" | "sent" | "failed" | "skipped";
  activity_type: string | null;
  activity_id: string | null;
  error_message: string | null;
  staff_name: string | null;
  outlet_name: string | null;
  sent_at: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

type EmailPayload = {
  ok: true;
  config: {
    notification_email: string;
    test_notification_email: string;
  };
  logs: EmailLog[];
  logsUnavailable: boolean;
};

const EMAIL_LABELS: Record<EmailType, string> = {
  attendance_in: "Test Email Absen Masuk",
  opening_report: "Test Email Laporan Buka Toko",
  closing_report: "Test Email Laporan Tutup Toko",
  attendance_out: "Test Email Absen Keluar",
  late_attendance: "Test Email Staff Terlambat",
  leave_request: "Test Email Request Libur Staff",
  leave_approved: "Test Email Approval Libur",
  leave_rejected: "Test Email Penolakan Libur",
  full_shift: "Test Email Full Shift",
  report_late: "Test Email Laporan Terlambat",
  system_warning: "Test Email Error / Warning Sistem"
};

const TEST_GROUPS: Array<{ title: string; subtitle: string; types: EmailType[] }> = [
  {
    title: "Test Email Absensi",
    subtitle: "Absen masuk, absen keluar, keterlambatan, dan full shift",
    types: ["attendance_in", "attendance_out", "late_attendance", "full_shift"]
  },
  {
    title: "Test Email Laporan Area",
    subtitle: "Laporan buka, tutup, dan laporan terlambat dengan foto",
    types: ["opening_report", "closing_report", "report_late"]
  },
  {
    title: "Test Email Libur",
    subtitle: "Request libur, approval, dan penolakan libur",
    types: ["leave_request", "leave_approved", "leave_rejected"]
  },
  {
    title: "Test Email Sistem",
    subtitle: "Warning sistem untuk validasi konfigurasi provider",
    types: ["system_warning"]
  }
];

const STATUS_META: Record<string, { label: string; cls: string; icon: ReactNode }> = {
  sent: { label: "Berhasil", cls: "status-ok", icon: <CheckCircle2 size={13} /> },
  failed: { label: "Gagal", cls: "status-danger", icon: <XCircle size={13} /> },
  pending: { label: "Pending", cls: "status-warn", icon: <Clock3 size={13} /> },
  skipped: { label: "Dilewati", cls: "status-warn", icon: <AlertTriangle size={13} /> }
};

export default function AdminEmailPage() {
  const [email, setEmail] = useState("");
  const [defaultEmail, setDefaultEmail] = useState("");
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsUnavailable, setLogsUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingType, setSendingType] = useState<EmailType | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "err">("info");

  const validEmail = useMemo(() => isEmailList(email), [email]);

  async function load(options: { preserveMessage?: boolean } = {}) {
    setLoading(true);
    try {
      const payload = await apiFetch<EmailPayload>("/api/admin/email", { role: "admin", body: { limit: 40 } });
      setEmail(payload.config.test_notification_email || payload.config.notification_email || "");
      setDefaultEmail(payload.config.notification_email || "");
      setLogs(payload.logs || []);
      setLogsUnavailable(Boolean(payload.logsUnavailable));
      if (!options.preserveMessage) setMessage("");
    } catch (err) {
      setMessage(humanError(err));
      setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveEmail() {
    if (saving || !validEmail) {
      if (!validEmail) {
        setMessage("Format email tujuan test tidak valid.");
        setMsgType("err");
      }
      return;
    }
    setSaving(true);
    setMessage("Menyimpan email tujuan test...");
    setMsgType("info");
    try {
      await apiFetch("/api/admin/email", {
        method: "PUT",
        role: "admin",
        body: { test_notification_email: email }
      });
      setMessage("Email tujuan test berhasil disimpan.");
      setMsgType("ok");
      await load({ preserveMessage: true });
    } catch (err) {
      setMessage(humanError(err));
      setMsgType("err");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(type: EmailType) {
    if (sendingType || !validEmail) {
      if (!validEmail) {
        setMessage("Format email tujuan test tidak valid.");
        setMsgType("err");
      }
      return;
    }
    setSendingType(type);
    setMessage(`Mengirim ${EMAIL_LABELS[type]}...`);
    setMsgType("info");
    try {
      const payload = await apiFetch<{ ok: true; message: string }>("/api/admin/email", {
        method: "POST",
        role: "admin",
        body: { action: "test", type, to: email }
      });
      setMessage(payload.message || `Email test berhasil dikirim ke ${email}.`);
      setMsgType("ok");
      await load({ preserveMessage: true });
    } catch (err) {
      setMessage(humanError(err));
      setMsgType("err");
    } finally {
      setSendingType(null);
    }
  }

  async function retry(log: EmailLog) {
    if (retryingId) return;
    setRetryingId(log.id);
    setMessage(`Mengirim ulang email ke ${log.recipient}...`);
    setMsgType("info");
    try {
      const payload = await apiFetch<{ ok: true; message: string }>("/api/admin/email", {
        method: "POST",
        role: "admin",
        body: { action: "retry", logId: log.id }
      });
      setMessage(payload.message || `Email berhasil dikirim ulang ke ${log.recipient}.`);
      setMsgType("ok");
      await load({ preserveMessage: true });
    } catch (err) {
      setMessage(humanError(err));
      setMsgType("err");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <AdminPage
      title="Pengaturan Email & Test Notifikasi"
      subtitle="Kirim test email, cek status log, dan retry email gagal"
      action={
        <button className="btn btn-soft" style={{ fontSize: 12, padding: "8px 12px" }} onClick={() => load()} disabled={loading}>
          <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
        </button>
      }
    >
      <MsgBar message={message} type={msgType} />

      <AdminSection title="Konfigurasi Email" subtitle="Email ini dipakai sebagai tujuan test notifikasi dari halaman admin">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) auto", gap: 12, alignItems: "end" }}>
          <div>
            <label className="label">Email tujuan test</label>
            <input
              className="field"
              type="email"
              value={email}
              placeholder={defaultEmail || "admin@email.com"}
              onChange={(event) => setEmail(event.target.value)}
            />
            <p style={{ marginTop: 6, fontSize: 11, color: validEmail ? "var(--muted)" : "var(--danger)", fontWeight: 600 }}>
              {validEmail ? `Default admin: ${defaultEmail || "-"}` : "Masukkan email valid, contoh admin@email.com."}
            </p>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={saveEmail} disabled={saving || !validEmail}>
            <Save size={15} /> {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </AdminSection>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {TEST_GROUPS.map((group) => (
          <AdminSection key={group.title} title={group.title} subtitle={group.subtitle} style={{ marginBottom: 0 }}>
            <div style={{ display: "grid", gap: 10 }}>
              {group.types.map((type) => {
                const active = sendingType === type;
                return (
                  <button
                    key={type}
                    className="btn btn-soft"
                    style={{
                      justifyContent: "space-between",
                      minHeight: 44,
                      fontSize: 12,
                      borderColor: active ? "var(--primary)" : "var(--border)",
                      color: active ? "var(--primary)" : "var(--ink)"
                    }}
                    onClick={() => sendTest(type)}
                    disabled={Boolean(sendingType) || saving || !validEmail}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <MailCheck size={15} /> {EMAIL_LABELS[type]}
                    </span>
                    {active ? <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
                  </button>
                );
              })}
            </div>
          </AdminSection>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <AdminSection title="Log Email Terakhir" subtitle="Status pengiriman email otomatis, test email, dan retry">
          {logsUnavailable ? (
            <div style={{ padding: 18, border: "1px dashed var(--warning-border)", borderRadius: 12, background: "var(--warning-bg)", color: "var(--warning)", fontSize: 13, fontWeight: 700 }}>
              Tabel log email belum tersedia. Jalankan migration database 0004_email_notifications.sql.
            </div>
          ) : loading ? (
            <div style={{ textAlign: "center", padding: 28, color: "var(--muted-light)", fontSize: 13 }}>
              <RefreshCw size={18} style={{ display: "inline", animation: "spin 1s linear infinite", marginRight: 8 }} />
              Memuat log email...
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 28, color: "var(--muted-light)", fontSize: 13, border: "2px dashed var(--border)", borderRadius: 12 }}>
              Belum ada log email. Kirim salah satu test email untuk mulai mengisi log.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Jenis</th>
                    <th>Penerima</th>
                    <th>Staff / Outlet</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const meta = STATUS_META[log.status] || STATUS_META.pending;
                    const open = detailId === log.id;
                    return (
                      <Fragment key={log.id}>
                        <tr key={log.id}>
                          <td data-label="Waktu">{formatDateTime(log.sent_at || log.updated_at || log.created_at)}</td>
                          <td data-label="Jenis">
                            <div style={{ fontWeight: 800 }}>{labelFor(log.notification_type)}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{log.subject}</div>
                          </td>
                          <td data-label="Penerima" style={{ fontWeight: 700 }}>{log.recipient}</td>
                          <td data-label="Staff / Outlet">
                            <div style={{ fontWeight: 700 }}>{log.staff_name || "-"}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{log.outlet_name || log.activity_type || "-"}</div>
                          </td>
                          <td data-label="Status">
                            <span className={`status-pill ${meta.cls}`} style={{ gap: 5 }}>
                              {meta.icon} {meta.label}
                            </span>
                          </td>
                          <td data-label="Aksi">
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                className="btn btn-soft"
                                style={{ fontSize: 11, padding: "6px 10px" }}
                                onClick={() => setDetailId(open ? null : log.id)}
                              >
                                {open ? <EyeOff size={13} /> : <Eye size={13} />}
                                Detail
                              </button>
                              {log.status === "failed" ? (
                                <button
                                  className="btn btn-primary"
                                  style={{ fontSize: 11, padding: "6px 10px" }}
                                  onClick={() => retry(log)}
                                  disabled={Boolean(retryingId)}
                                >
                                  <RotateCcw size={13} style={retryingId === log.id ? { animation: "spin 1s linear infinite" } : undefined} />
                                  {retryingId === log.id ? "Retry..." : "Kirim Ulang"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {open ? (
                          <tr key={`${log.id}-detail`}>
                            <td colSpan={6} style={{ background: "var(--surface-soft)" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 12 }}>
                                <Detail label="Activity" value={[log.activity_type, log.activity_id].filter(Boolean).join(" / ") || "-"} />
                                <Detail label="Retry" value={`${log.retry_count || 0} kali`} />
                                <Detail label="Updated" value={formatDateTime(log.updated_at)} />
                              </div>
                              {log.error_message ? (
                                <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 12, fontWeight: 700 }}>
                                  {log.error_message}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminSection>
      </div>
    </AdminPage>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", fontSize: 10, letterSpacing: ".5px" }}>{label}</div>
      <div style={{ fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function isEmailList(value: string) {
  const list = value.split(/[,\s;]+/).map((email) => email.trim()).filter(Boolean);
  return list.length > 0 && list.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function labelFor(type: string) {
  return EMAIL_LABELS[type as EmailType] || type;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(date);
}

function humanError(err: unknown): string {
  if (!(err instanceof Error)) return "Email gagal dikirim. Periksa konfigurasi email atau koneksi server.";
  const msg = err.message || "";
  const lower = msg.toLowerCase();
  if (msg.includes("Format email")) return msg;
  if (lower.includes("domain is not verified") || lower.includes("not verified"))
    return "Email gagal dikirim karena domain pengirim belum diverifikasi di Resend. Verifikasi domain atau gunakan EMAIL_FROM dari domain yang sudah verified.";
  if (lower.includes("only send testing emails") || lower.includes("your own email address"))
    return "Email gagal dikirim karena akun Resend masih mode testing. Gunakan email pemilik akun Resend sebagai penerima test, atau verifikasi domain agar bisa kirim ke penerima lain.";
  if (msg.includes("RESEND") || msg.includes("API key") || msg.includes("provider")) return msg;
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch"))
    return "Email gagal dikirim. Periksa konfigurasi email atau koneksi server.";
  if (msg.includes("401") || msg.includes("Sesi") || msg.includes("login"))
    return "Sesi berakhir. Silakan login ulang.";
  if (msg.includes("500") || msg.includes("server"))
    return "Email gagal dikirim. Periksa konfigurasi email atau koneksi server.";
  if (msg.includes("undefined") || msg.includes("null"))
    return "Email gagal dikirim. Periksa konfigurasi email atau koneksi server.";
  return msg || "Email gagal dikirim. Periksa konfigurasi email atau koneksi server.";
}
