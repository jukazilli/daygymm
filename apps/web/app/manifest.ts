import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DayGym",
    short_name: "DayGym",
    description: "Plano, registro e evolução do seu treino.",
    id: "/",
    start_url: "/hoje/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFBF8",
    theme_color: "#FF6B00",
    categories: ["fitness", "health"],
    icons: [
      {
        src: "/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
