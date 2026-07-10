"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(pathname === "/admin/login");

  useEffect(() => {
    let cancelled = false;
    if (pathname === "/admin/login") {
      setAuthReady(true);
      return () => { cancelled = true; };
    }
    setAuthReady(false);
    apiFetch<{ ok: true; session: { role: string } }>("/api/auth/session?role=admin", {
      role: "admin",
      redirectOnUnauthorized: false
    })
      .then((payload) => {
        if (cancelled) return;
        if (payload.session.role !== "admin") router.replace("/admin/login");
        else setAuthReady(true);
      })
      .catch(() => {
        if (!cancelled) router.replace("/admin/login");
      });
    return () => { cancelled = true; };
  }, [pathname, router]);

  // Loading screen selama cek sesi — mencegah blank screen & interaksi dini
  // pada setiap perpindahan halaman admin.
  if (!authReady) return <LoadingOverlay show message="Memeriksa sesi..." />;
  return <>{children}</>;
}
