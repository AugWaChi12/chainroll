import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ChainRoll — Film Camera on KUB Chain',
    short_name: 'ChainRoll',
    description: 'One click, one film look, one transaction on KUB Chain.',
    start_url: '/camera',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0e0c0b',
    theme_color: '#d23a1e',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/brand/chainroll-logo-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
