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
        <header style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.7px", color: "var(--primary)", marginBottom: 2 }}>
              Roti Bakar Ngeunah
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{title}</h1>
            {subtitle ? <p style={{ marginTop: 3, fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>{subtitle}</p> : null}
          </div>
          {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
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
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 16,
        boxShadow: "0 2px 12px rgba(0,0,0,.05)",
        marginBottom: 16,
        overflow: "hidden",
        ...style
      }}
    >
      {title ? (
        <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--border)", background: "var(--surface-soft)" }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>{title}</h2>
          {subtitle ? <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{subtitle}</p> : null}
        </div>
      ) : null}
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

/* Simple field group row */
export function FieldGrid({ children, cols = 4 }: Readonly<{ children: React.ReactNode; cols?: number }>) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>
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
