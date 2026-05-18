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

  return (
    <StaffPage title="Profil" subtitle="Data staff aktif">
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      <section className="panel p-4">
        <div className="flex items-center gap-4">
          {data?.profile.photo_url ? (
            <Image src={data.profile.photo_url} alt={data.profile.name} width={72} height={72} className="h-18 w-18 rounded-lg object-cover" />
          ) : (
            <div className="grid h-18 w-18 place-items-center rounded-lg bg-[var(--surface-soft)] text-2xl font-black text-[var(--primary)]">
              {data?.profile.name?.slice(0, 1) || "S"}
            </div>
          )}
          <div>
            <h2 className="text-xl font-black">{data?.profile.name || "Memuat..."}</h2>
            <p className="font-bold text-slate-500">{data?.outlet?.name || "Outlet belum ditentukan"}</p>
          </div>
        </div>
      </section>
      <section className="mt-4 grid gap-3">
        {[
          ["Status", data?.profile.active ? "Aktif" : "Nonaktif"],
          ["Telepon", data?.profile.phone || "-"],
          ["Alamat", data?.profile.address || "-"],
          ["KTP", data?.profile.ktp_no || "-"],
          ["Gaji per shift", rupiah(data?.profile.salary_per_shift || 0)]
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <p className="text-xs font-extrabold uppercase text-slate-500">{label}</p>
            <p className="mt-1 font-black">{value}</p>
          </div>
        ))}
      </section>
    </StaffPage>
  );
}
