import { StaffNav } from "@/components/staff/staff-nav";

export function StaffPage({
  title,
  subtitle,
  children
}: Readonly<{ title: string; subtitle?: string; children: React.ReactNode }>) {
  return (
    <main className="mobile-frame px-4 pb-24 pt-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase text-[var(--primary)]">Roti Bakar Ngeunah</p>
          <h1 className="text-2xl font-black text-[var(--ink)]">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p> : null}
        </div>
      </header>
      {children}
      <StaffNav />
    </main>
  );
}
