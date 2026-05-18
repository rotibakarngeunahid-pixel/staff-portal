import Image from "next/image";
import { StaffNav } from "@/components/staff/staff-nav";

export function StaffPage({
  title,
  subtitle,
  children
}: Readonly<{ title: string; subtitle?: string; children: React.ReactNode }>) {
  return (
    <div className="mobile-frame">
      <header className="staff-hdr">
        <Image
          src="https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto,w_80/v1777572835/Untitled-2_tgjm4u.png"
          alt="Roti Bakar Ngeunah"
          width={36}
          height={36}
          className="staff-hdr-logo"
          priority
        />
        <div className="staff-hdr-info">
          <h1>Roti Bakar Ngeunah</h1>
          <p>{title}</p>
        </div>
      </header>
      <main style={{ flex: 1, padding: "14px 16px 96px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {subtitle ? (
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{subtitle}</p>
        ) : null}
        {children}
      </main>
      <StaffNav />
    </div>
  );
}
