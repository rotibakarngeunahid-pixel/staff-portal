"use client";

import Link from "next/link";
import { CalendarDays, CreditCard, Home, UserRound, ClipboardCheck } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app/home", label: "Home", icon: Home },
  { href: "/app/report", label: "Laporan", icon: ClipboardCheck },
  { href: "/app/payroll", label: "Gaji", icon: CreditCard },
  { href: "/app/schedule", label: "Jadwal", icon: CalendarDays },
  { href: "/app/profile", label: "Profil", icon: UserRound }
];

export function StaffNav() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(100%, 480px)",
        zIndex: 30,
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        borderTop: "1px solid var(--border)",
        background: "#fff",
        paddingBottom: "env(safe-area-inset-bottom)"
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(item.href + "?");
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              minHeight: 56,
              fontSize: "0.65rem",
              fontWeight: 800,
              color: active ? "var(--primary)" : "var(--muted-light)",
              fontFamily: "var(--font-nunito, sans-serif)"
            }}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
