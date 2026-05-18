"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<ProfilePayload>("/api/staff/profile", { role: "staff" })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  const profile = data?.profile;

  return (
    <StaffPage title="Profil Saya" subtitle="Data staff">
      {error ? (
        <div style={{ background: "var(--danger-bg)", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}

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
        <p className="prof-name">{profile?.name || "Memuat..."}</p>
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
    </StaffPage>
  );
}
