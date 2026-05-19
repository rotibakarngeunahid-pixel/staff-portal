import Image from "next/image";
import { StaffNav } from "@/components/staff/staff-nav";

export function StaffPage({
  title,
  subtitle,
  children
}: Readonly<{ title: string; subtitle?: string; children: React.ReactNode }>) {
  const headerSubtitle = subtitle || title;

  return (
    <div className="mobile-frame">
      <header className="staff-hdr">
        <Image
          src="https://owner-portal.rotibakarngeunah.my.id/wp-content/uploads/2026/05/cropped-Icon-Roti-Bakar-Ngeunah.webp"
          alt="Roti Bakar Ngeunah"
          width={38}
          height={38}
          className="staff-hdr-logo"
          priority
        />
        <div className="staff-hdr-info">
          <h1>Roti Bakar Ngeunah</h1>
          <p title={headerSubtitle}>{headerSubtitle}</p>
        </div>
      </header>
      <main className="staff-main" aria-labelledby="staff-page-title">
        <h2 id="staff-page-title" className="sr-only">{title}</h2>
        {children}
      </main>
      <StaffNav />
    </div>
  );
}
