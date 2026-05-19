"use client";

import Link from "next/link";
import { BookOpen, CalendarDays, CreditCard, Home, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app/home",    label: "Home",    icon: Home },
  { href: "/app/payroll", label: "Gaji",    icon: CreditCard },
  { href: "/app/schedule",label: "Jadwal",  icon: CalendarDays },
  { href: "/app/panduan", label: "Panduan", icon: BookOpen },
  { href: "/app/profile", label: "Profil",  icon: UserRound }
];

export function StaffNav() {
  const pathname = usePathname();
  return (
    <nav
      className="bottom-nav"
      style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-item${active ? " active" : ""}`}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
