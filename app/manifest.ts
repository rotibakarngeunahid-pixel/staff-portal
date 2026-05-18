import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Roti Bakar Ngeunah Staff Portal",
    short_name: "RBN Staff",
    description: "Absensi dan laporan operasional staff Roti Bakar Ngeunah",
    start_url: "/app/login",
    display: "standalone",
    background_color: "#FFF8F2",
    theme_color: "#C0392B",
    icons: [
      {
        src: "https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto,w_192/v1777572835/Untitled-2_tgjm4u.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto,w_512/v1777572835/Untitled-2_tgjm4u.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
