import type { Metadata, Viewport } from "next";
import { DM_Sans, Nunito } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap"
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Roti Bakar Ngeunah Staff Portal",
  description: "Absensi, laporan toko, jadwal shift, dan payroll staff Roti Bakar Ngeunah",
  applicationName: "RBN Staff Portal",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#C0392B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${nunito.variable} ${dmSans.variable}`}>
      <body style={{ fontFamily: "var(--font-nunito), system-ui, sans-serif" }}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
