"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/app/login" && !localStorage.getItem("rbn_staff_token")) {
      router.replace("/app/login");
    }
  }, [pathname, router]);

  return <div className="app-shell">{children}</div>;
}
