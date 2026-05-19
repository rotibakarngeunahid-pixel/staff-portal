"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StaffPage } from "@/components/staff/staff-page";
import { apiFetch } from "@/lib/client-api";
import { rupiah } from "@/lib/format";

type ProfilePayload = {
  ok: true;
  profile: {
    name: string;
    phone: string | null;
    address: string | null;
    photo_url: string | null;
    ktp_no: string | null;
    salary_per_shift: number;
    active: boolean;
  };
  outlet: { name: string } | null;
};

export default function StaffProfilePage() {
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch<ProfilePayload>("/api/staff/profile", { role: "staff" }));
    } catch (err) {
      setError(err instanceof Error
        ? (err.message.includes("fetch") || err.message.includes("Failed to fetch")
            ? "Data belum berhasil dimuat. Periksa koneksi internet lalu coba lagi."
            : err.message)
        : "Gagal memuat profil.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const profile = data?.profile;

  return (
    <StaffPage title="Profil Saya" subtitle="Data staff">
      {error ? (
        <div style={{ background: "var(--danger-bg)", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        /* Loading skeleton */
        <div className="prof-card">
          <div style={{
            width: 72, height: 72, borderRadius: "50%", background: "var(--border)",
            margin: "0 auto 12px", animation: "skeleton-pulse 1.4s ease-in-out infinite"
          }} />
          <div style={{ height: 20, width: 140, borderRadius: 6, background: "var(--border)", margin: "0 auto 6px", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
          <div style={{ height: 12, width: 100, borderRadius: 4, background: "var(--border)", margin: "0 auto 18px", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="prof-row">
              <div style={{ height: 12, width: 70, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
              <div style={{ height: 12, width: 90, borderRadius: 4, background: "var(--border)", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="prof-card">
          {profile?.photo_url ? (
            <Image
              src={profile.photo_url}
              alt={profile.name}
              width={72}
              height={72}
              style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--border)", display: "block", margin: "0 auto 10px" }}
            />
          ) : (
            <div style={{
              width: 72, height: 72, borderRadius: "50%", background: "var(--primary)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, fontWeight: 900, margin: "0 auto 10px",
              fontFamily: "var(--font-nunito, sans-serif)"
            }}>
              {profile?.name?.slice(0, 1).toUpperCase() || "S"}
            </div>
          )}
          <p className="prof-name">{profile?.name || "—"}</p>
          <p className="prof-outlet">{data?.outlet?.name || "Outlet belum ditentukan"}</p>

          {[
            ["Status", profile ? (profile.active ? "✅ Aktif" : "❌ Nonaktif") : "—"],
            ["Telepon", profile?.phone || "—"],
            ["Alamat", profile?.address || "—"],
            ["No. KTP", profile?.ktp_no || "—"],
            ["Gaji per shift", rupiah(profile?.salary_per_shift || 0)]
          ].map(([key, value]) => (
            <div key={key} className="prof-row">
              <span className="prof-k">{key}</span>
              <span className="prof-v">{value}</span>
            </div>
          ))}
        </div>
      )}

      <button
        className="btn btn-soft"
        style={{ fontSize: 12, padding: "9px 14px", alignSelf: "flex-start" }}
        onClick={load}
        disabled={loading}
      >
        <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
        {loading ? "Memuat..." : "Refresh"}
      </button>
    </StaffPage>
  );
}
