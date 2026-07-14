import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      devOptions: { enabled: false },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: [
        'icons/icon-192.svg',
        'icons/icon-512.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        id: '/employee/',
        name: 'Puantaj Çalışan Portalı',
        short_name: 'Puantaj',
        description: 'Çalışan check-in/check-out ve cihaz işlemleri',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        scope: '/employee/',
        start_url: '/employee/',
        lang: 'tr',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
      },
    }),
  ],
  base: '/employee/',
  define: {
    __BUILD_TS__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  // Ozel manualChunks KALDIRILDI: React'i ayri chunk'a alip dolanma yaratiyordu
  // ve uretim build'inde "createContext undefined" cokmesine yol aciyordu.
  // Vite varsayilan parcalama React'i dogru sirada yukler; lazy import'lar yine bolunur.
})
