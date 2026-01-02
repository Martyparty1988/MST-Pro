import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-*.svg', 'icon-*.png'],
      manifest: {
        short_name: "MST",
        name: "Martyho Solar Tracker",
        description: "Profesionální PWA nástroj pro správu solárních montáží, docházky, projektů a týmů. Funguje offline.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: "#6366f1",
        background_color: "#020617",
        categories: ["productivity", "business", "utilities"],
        lang: "cs",
        dir: "ltr",
        icons: [
          { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-maskable-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "maskable" },
          { src: "/icon-maskable-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" }
        ],
        shortcuts: [
          { name: "Projekty", url: "/#/projects", icons: [{ src: "/icon-192.svg", sizes: "192x192" }] },
          { name: "Tým", url: "/#/workers", icons: [{ src: "/icon-192.svg", sizes: "192x192" }] },
          { name: "Statistiky", url: "/#/statistics", icons: [{ src: "/icon-192.svg", sizes: "192x192" }] }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },

        ]
      }
    })
  ],
});
