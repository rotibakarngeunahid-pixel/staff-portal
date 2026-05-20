"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  CalendarDays,
  CalendarMinus,
  CalendarOff,
  ClipboardList,
  FileImage,
  FileUp,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Settings,
  Store,
  UsersRound
} from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSessionStore } from "@/stores/session";

const items = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/staff", label: "Staff", icon: UsersRound },
  { href: "/admin/outlets", label: "Outlet", icon: Store },
  { href: "/admin/attendance", label: "Absensi", icon: ClipboardList },
  { href: "/admin/attendance-import", label: "Import Absensi", icon: FileUp },
  { href: "/admin/schedule", label: "Jadwal", icon: CalendarDays },
  { href: "/admin/leave", label: "Libur", icon: CalendarMinus },
  { href: "/admin/payroll", label: "Payroll", icon: BadgeDollarSign },
  { href: "/admin/reports", label: "Laporan", icon: FileImage },
  { href: "/admin/report-cfg", label: "Konfig Laporan", icon: MapPinned },
  { href: "/admin/dayoff", label: "Hari Libur", icon: CalendarOff },
  { href: "/admin/config", label: "Pengaturan", icon: Settings }
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const setAdminToken = useSessionStore((state) => state.setAdminToken);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAdminToken(null);
    router.replace("/admin/login");
  }

  return (
    <aside className="admin-sidebar" style={{ display: "flex", flexDirection: "column" }}>
      {/* Brand */}
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--primary)", marginBottom: 2 }}>
          Admin Portal
        </p>
        <h1 style={{ fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>Roti Bakar Ngeunah</h1>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderRadius: 10,
                padding: "9px 12px",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                background: active ? "var(--primary)" : "transparent",
                color: active ? "#fff" : "var(--admin-sidebar-muted)",
                transition: "background 0.15s, color 0.15s"
              }}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <button
        onClick={logout}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderRadius: 10,
          padding: "9px 12px",
          fontSize: 13,
          fontWeight: 700,
          background: "transparent",
          color: "var(--admin-sidebar-muted)",
          border: "none",
          cursor: "pointer",
          width: "100%",
          marginTop: 12
        }}
      >
        <LogOut size={16} />
        Keluar
      </button>
    </aside>
  );
}
