"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { StaffPage } from "@/components/staff/staff-page";
import { PayslipView, PayslipSkeleton, type PayslipData } from "@/components/payroll/payslip-view";
import { apiFetch } from "@/lib/client-api";

export default function StaffPayslipPage({ params }: { params: Promise<{ paymentId: string }> }) {
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
        { role: "staff" }
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
    <StaffPage title="Slip Gaji" subtitle="Detail pembayaran gaji kamu">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button
          onClick={() => router.back()}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 12,
            background: "var(--surface, #fff)", border: "1.5px solid var(--border, #F0DDD0)",
            color: "var(--muted, #9B7060)", fontSize: 13, fontWeight: 700, cursor: "pointer"
          }}
        >
          <ArrowLeft size={15} />
          Kembali
        </button>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 12,
            background: "var(--surface, #fff)", border: "1.5px solid var(--border, #F0DDD0)",
            color: "var(--muted, #9B7060)", fontSize: 13, fontWeight: 700, cursor: "pointer"
          }}
        >
          <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "var(--danger-bg, #FDECEA)", border: "1px solid var(--danger-border, #F5C6C3)",
            borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 700,
            color: "var(--danger, #C8202B)", marginBottom: 16
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
    </StaffPage>
  );
}
