"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    function check() {
      // Tablet besar (> 768px) dan desktop diblokir
      setIsMobile(window.innerWidth <= 768);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (pathname !== "/app/login" && !localStorage.getItem("rbn_staff_token")) {
      router.replace("/app/login");
    }
  }, [pathname, router]);

  // Tunggu hingga ukuran layar diketahui sebelum render apapun
  if (isMobile === null) return null;

  if (!isMobile) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #FEF2F2 0%, #FFF7ED 100%)",
        padding: "32px 24px",
        fontFamily: "system-ui, sans-serif"
      }}>
        <div style={{ maxWidth: 400, textAlign: "center" }}>
          <div style={{ fontSize: 80, marginBottom: 20, lineHeight: 1 }}>📱</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#DC2626", marginBottom: 12, letterSpacing: "-0.5px" }}>
            Khusus Perangkat Mobile
          </h1>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, marginBottom: 8 }}>
            UI Staff Roti Bakar Ngeunah <strong>hanya dapat diakses melalui smartphone atau HP</strong>.
          </p>
          <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6, marginBottom: 24 }}>
            Buka halaman ini di browser HP kamu untuk menggunakan sistem absensi, laporan, dan jadwal.
          </p>
          <div style={{
            padding: "14px 20px",
            background: "rgba(220,38,38,0.06)",
            border: "1.5px solid rgba(220,38,38,0.2)",
            borderRadius: 14, fontSize: 13, color: "#991B1B", fontWeight: 700,
            lineHeight: 1.5
          }}>
            💡 Scan QR code atau kirim link ini ke HP kamu
          </div>
          <p style={{ marginTop: 20, fontSize: 11, color: "#9CA3AF" }}>
            Halaman Admin tersedia di path /admin untuk akses desktop.
          </p>
        </div>
      </div>
    );
  }

  return <div className="app-shell">{children}</div>;
}
