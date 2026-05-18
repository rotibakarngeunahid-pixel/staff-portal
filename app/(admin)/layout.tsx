"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/login" && !localStorage.getItem("rbn_admin_token")) {
      router.replace("/admin/login");
    }
  }, [pathname, router]);

  return <>{children}</>;
}
