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
  MailCheck,
  MapPinned,
  Settings,
  Store,
  TrendingUp,
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
  { href: "/admin/payroll-projection", label: "Proyeksi Gaji", icon: TrendingUp },
  { href: "/admin/reports", label: "Laporan", icon: FileImage },
  { href: "/admin/report-cfg", label: "Konfig Laporan", icon: MapPinned },
  { href: "/admin/email", label: "Test Email", icon: MailCheck },
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
    <aside className="admin-sidebar">
      <div className="admin-nav-brand">
        <p>
          Admin Portal
        </p>
        <h1>Roti Bakar Ngeunah</h1>
      </div>

      <nav className="admin-nav-list" aria-label="Navigasi admin">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <button
        onClick={logout}
        className="admin-nav-logout"
      >
        <LogOut size={16} aria-hidden="true" />
        <span>Keluar</span>
      </button>
    </aside>
  );
}
