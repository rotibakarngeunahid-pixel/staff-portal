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
    <nav className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-[480px] -translate-x-1/2 grid-cols-5 border-t border-[var(--border)] bg-white">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[0.68rem] font-extrabold ${
              active ? "text-[var(--primary)]" : "text-[var(--muted)]"
            }`}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
