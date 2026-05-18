import type { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'QIVO',
    short_name: 'QIVO',
    description: 'Connect with Heart',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#00A2FF',
    orientation: 'portrait',
    icons: [
      {
        src: 'https://picsum.photos/seed/matchflow-icon/192/192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: 'https://picsum.photos/seed/matchflow-icon/512/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  }
}
