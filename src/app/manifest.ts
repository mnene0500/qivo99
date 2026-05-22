import type { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QIVO",
    short_name: "QIVO",
    description: "Premium Social Experience",
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#00A2FF",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/notification.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      }
    ]
  }
}
