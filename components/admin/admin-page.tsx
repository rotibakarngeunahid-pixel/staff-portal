import { AdminNav } from "@/components/admin/admin-nav";

export function AdminPage({
  title,
  subtitle,
  children,
  action
}: Readonly<{ title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }>) {
  return (
    <div className="admin-layout">
      <AdminNav />
      <main className="admin-main">
        <header className="admin-page-header">
          <div>
            <p className="admin-page-eyebrow">
              Roti Bakar Ngeunah
            </p>
            <h1 className="admin-page-title">{title}</h1>
            {subtitle ? <p className="admin-page-subtitle">{subtitle}</p> : null}
          </div>
          {action ? <div className="admin-page-action">{action}</div> : null}
        </header>
        {children}
      </main>
    </div>
  );
}

/* Reusable section card for forms/content */
export function AdminSection({
  title,
  subtitle,
  children,
  style
}: Readonly<{ title?: string; subtitle?: string; children: React.ReactNode; style?: React.CSSProperties }>) {
  return (
    <div
      className="admin-section"
      style={{
        ...style
      }}
    >
      {title ? (
        <div className="admin-section-head">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      ) : null}
      <div className="admin-section-body">{children}</div>
    </div>
  );
}

/* Simple field group row */
export function FieldGrid({ children, cols = 4 }: Readonly<{ children: React.ReactNode; cols?: number }>) {
  return (
    <div className="field-grid" style={{ "--field-grid-cols": cols } as React.CSSProperties}>
      {children}
    </div>
  );
}

/* Status message bar */
export function MsgBar({ message, type = "info" }: Readonly<{ message: string; type?: "info" | "ok" | "err" }>) {
  if (!message) return null;
  const colors = {
    info: { bg: "var(--surface-soft)", color: "var(--muted)" },
    ok: { bg: "var(--success-bg)", color: "#1E8449" },
    err: { bg: "var(--danger-bg)", color: "var(--danger)" }
  };
  const c = colors[type];
  return (
    <div style={{ background: c.bg, color: c.color, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
      {message}
    </div>
  );
}
