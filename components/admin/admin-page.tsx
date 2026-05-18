import { AdminNav } from "@/components/admin/admin-nav";

export function AdminPage({
  title,
  subtitle,
  children
}: Readonly<{ title: string; subtitle?: string; children: React.ReactNode }>) {
  return (
    <div className="admin-layout">
      <AdminNav />
      <main className="admin-main">
        <header className="mb-5">
          <p className="text-xs font-black uppercase text-[var(--primary)]">Roti Bakar Ngeunah</p>
          <h1 className="text-2xl font-black text-slate-950">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
