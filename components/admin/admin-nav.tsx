"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  CalendarDays,
  CalendarMinus,
  CalendarOff,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Settings,
  Store,
  UsersRound,
  FileImage
} from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSessionStore } from "@/stores/session";

const items = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/staff", label: "Staff", icon: UsersRound },
  { href: "/admin/outlets", label: "Outlet", icon: Store },
  { href: "/admin/attendance", label: "Absensi", icon: ClipboardList },
  { href: "/admin/schedule", label: "Jadwal", icon: CalendarDays },
  { href: "/admin/leave", label: "Cuti", icon: CalendarMinus },
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
    <aside className="admin-sidebar">
      <div className="mb-5">
        <p className="text-xs font-black uppercase text-[var(--accent)]">RBN</p>
        <h1 className="text-xl font-black text-white">Admin Portal</h1>
      </div>
      <nav className="grid gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-extrabold ${
                active ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--admin-sidebar-muted)] hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button className="mt-5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-extrabold text-[var(--admin-sidebar-muted)] hover:bg-white/10 hover:text-white" onClick={logout}>
        <LogOut size={17} />
        Keluar
      </button>
    </aside>
  );
}
