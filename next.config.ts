import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb"
    }
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co"
      },
      {
        protocol: "https",
        hostname: "foto-laporan-area.rotibakarngeunah.my.id"
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com"
      },
      {
        protocol: "https",
        hostname: "owner-portal.rotibakarngeunah.my.id"
      }
    ]
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate"
          },
          { key: "Service-Worker-Allowed", value: "/" }
        ]
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }
        ]
      },
      {
        source: "/app/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }
        ]
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=()"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
