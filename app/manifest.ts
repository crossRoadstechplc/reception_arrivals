import type { MetadataRoute } from "next";

// Lets people "Add to Home Screen". iPhones need this to receive push notifications.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arrival Desk",
    short_name: "Arrival Desk",
    description: "Guest lists for reception and each floor.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f2ee",
    theme_color: "#14201b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
