/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// What the built page may load: only its own files. No inline scripts and nothing
// sent anywhere else. Inline styles are allowed because screens set widths (bars,
// markers) with style attributes.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Adds the security policy to the built page only; the dev server needs inline scripts for hot reload. */
const securityPolicy = (): Plugin => ({
  name: 'tare-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
});

export default defineConfig({
  // Relative paths so the build works from any folder or sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [
    securityPolicy(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        // The app's identity once installed. It resolves to the same address as start_url, as before.
        id: './',
        name: 'Tare Weight Tracker',
        short_name: 'Tare',
        description: 'Track your weight, goal pace, calories and body measurements. Your data stays on your device.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        lang: 'en',
        dir: 'ltr',
        categories: ['health', 'fitness', 'lifestyle'],
        background_color: '#EDF0EF',
        theme_color: '#2446D6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the installed app's icon (Android, Windows, macOS) to jump straight to logging.
        // The manifest has one language; the name is kept short and the form itself is translated.
        // Shown in the install dialog (Chrome shows a larger one with them). Retake with `npm run screenshots`.
        screenshots: [
          { src: 'screenshots/phone-overview.png', sizes: '412x839', type: 'image/png', form_factor: 'narrow', label: 'Overview: current weight, goal pace and trend' },
          { src: 'screenshots/phone-history.png', sizes: '412x839', type: 'image/png', form_factor: 'narrow', label: 'History: weekly averages, milestones and every weigh-in' },
          { src: 'screenshots/wide-overview.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Overview on a computer' },
        ],
        shortcuts: [
          { name: 'Log weight', short_name: 'Log weight', url: './?action=log', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
      },
      workbox: {
        // Fonts are precached too, so the app looks right offline from the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The install dialog's screenshots are only needed online.
        globIgnores: ['screenshots/**'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
