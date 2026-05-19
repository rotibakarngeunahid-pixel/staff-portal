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

const LOGO_URL = "https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto/v1777572835/Untitled-2_tgjm4u.png";

export const metadata: Metadata = {
  title: "Roti Bakar Ngeunah Staff Portal",
  description: "Absensi, laporan toko, jadwal shift, dan payroll staff Roti Bakar Ngeunah",
  applicationName: "RBN Staff Portal",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: `${LOGO_URL}`, sizes: "any", type: "image/png" }
    ],
    apple: [
      { url: `${LOGO_URL}`, sizes: "180x180" }
    ]
  }
};

export const viewport: Viewport = {
  themeColor: "#B42318",
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
