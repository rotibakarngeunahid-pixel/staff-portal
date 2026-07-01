"use client";

import { useEffect, useState } from "react";
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
  Menu,
  Settings,
  Store,
  TrendingUp,
  UserMinus,
  UsersRound,
  X
} from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSessionStore } from "@/stores/session";

const items = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/staff", label: "Staff", icon: UsersRound },
  { href: "/admin/resignations", label: "Resignasi", icon: UserMinus },
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
  const [open, setOpen] = useState(false);

  const activeItem = items.find((item) => item.href === pathname);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll + allow Escape to close while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAdminToken(null);
    router.replace("/admin/login");
  }

  return (
    <>
      {/* Mobile top bar (hidden on desktop) */}
      <header className="admin-topbar">
        <button
          type="button"
          className="admin-topbar-menu"
          onClick={() => setOpen(true)}
          aria-label="Buka menu navigasi"
          aria-expanded={open}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        <div className="admin-topbar-title">
          <p>Admin Portal</p>
          <h1>{activeItem?.label ?? "Roti Bakar Ngeunah"}</h1>
        </div>
      </header>

      {/* Backdrop for the mobile drawer */}
      <div
        className={`admin-drawer-backdrop${open ? " show" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar — static column on desktop, slide-in drawer on mobile */}
      <aside className={`admin-sidebar${open ? " open" : ""}`}>
        <div className="admin-nav-brand">
          <div className="admin-nav-brand-text">
            <p>Admin Portal</p>
            <h1>Roti Bakar Ngeunah</h1>
          </div>
          <button
            type="button"
            className="admin-drawer-close"
            onClick={() => setOpen(false)}
            aria-label="Tutup menu navigasi"
          >
            <X size={20} aria-hidden="true" />
          </button>
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
                onClick={() => setOpen(false)}
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
    </>
  );
}
