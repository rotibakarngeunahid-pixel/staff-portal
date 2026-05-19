import type { MetadataRoute } from "next";

// Icon paths — place local files at public/icons/ by running: node scripts/download-icons.mjs
// Falls back to Cloudinary CDN so PWA install works without local files.
const ICON_192 = "/icons/icon-192.png";
const ICON_512 = "/icons/icon-512.png";
const CDN_192 = "https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto,w_192/v1777572835/Untitled-2_tgjm4u.png";
const CDN_512 = "https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto,w_512/v1777572835/Untitled-2_tgjm4u.png";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Roti Bakar Ngeunah Staff Portal",
    short_name: "RBN Staff",
    description: "Absensi dan laporan operasional staff Roti Bakar Ngeunah",
    start_url: "/app/login",
    display: "standalone",
    background_color: "#F4F6FA",
    theme_color: "#B42318",
    icons: [
      {
        src: ICON_192,
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: ICON_512,
        sizes: "512x512",
        type: "image/png"
      },
      // CDN fallback entries (browsers use first matching size)
      {
        src: CDN_192,
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: CDN_512,
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
