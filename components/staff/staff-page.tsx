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
          width={38}
          height={38}
          className="staff-hdr-logo"
          priority
        />
        <div className="staff-hdr-info">
          <h1>Roti Bakar Ngeunah</h1>
          <p>{subtitle || title}</p>
        </div>
      </header>
      <main style={{ flex: 1, padding: "14px 16px 90px", display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </main>
      <StaffNav />
    </div>
  );
}
