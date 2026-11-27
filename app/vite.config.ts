import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-v2.png'],
      manifest: {
        name: 'Quota',
        short_name: 'Quota',
        description: 'Monitoraggio dei prezzi dei voli',
        lang: 'it',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#14161b',
        theme_color: '#14161b',
        icons: [
          { src: 'pwa-192-v2.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512-v2.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        navigateFallback: '/index.html',
        // Le chiamate a Supabase non passano dal service worker: la cache dei dati
        // è gestita da TanStack Query (IndexedDB), così restano sempre coerenti.
        navigateFallbackDenylist: [/^\/auth/],
      },
    }),
  ],
})
