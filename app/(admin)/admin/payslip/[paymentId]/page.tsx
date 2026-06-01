"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { PayslipView, PayslipSkeleton, type PayslipData } from "@/components/payroll/payslip-view";
import { apiFetch } from "@/lib/client-api";

export default function AdminPayslipPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const router = useRouter();
  const [paymentId, setPaymentId] = useState("");
  const [data, setData] = useState<PayslipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    params.then((p) => setPaymentId(p.paymentId));
  }, [params]);

  async function load() {
    if (!paymentId) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<{ ok: true } & PayslipData>(
        `/api/payslip?paymentId=${paymentId}`,
        { role: "admin" }
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat slip gaji.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (paymentId) load(); }, [paymentId]);

  return (
    <AdminPage
      title="Slip Gaji"
      subtitle="Detail slip gaji karyawan — bisa diunduh sebagai gambar atau PDF"
      action={
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => router.back()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 12,
              background: "#fff", border: "1.5px solid var(--border)",
              color: "var(--muted)", fontSize: 13, fontWeight: 700, cursor: "pointer"
            }}
          >
            <ArrowLeft size={15} />
            Kembali
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="btn btn-soft"
            style={{ fontSize: 12, padding: "8px 12px" }}
          >
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            Refresh
          </button>
        </div>
      }
    >
      {error && (
        <div
          style={{
            background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
            borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 700,
            color: "var(--danger)", marginBottom: 16
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <PayslipSkeleton />
      ) : data ? (
        <PayslipView data={data} />
      ) : null}
    </AdminPage>
  );
}
