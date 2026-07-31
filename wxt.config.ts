import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],

  vite: () => ({
    plugins: [tailwindcss()],
    // transformers.js and pdfjs are large and load lazily in a worker.
    worker: { format: 'es' },
  }),

  manifest: {
    name: 'clanker.tracker',
    description:
      'Parse your resume, ATS-scan it, one-click fill any job application, write grounded cover letters, and track it all. Local-first, bring your own key.',
    version: '0.0.1',

    permissions: [
      'storage',        // settings + API keys (chrome.storage.local)
      'sidePanel',      // main UI surface, persists across navigation
      'activeTab',      // fill only the tab the user invoked us on
      'scripting',      // inject the fill routine on demand
      'unlimitedStorage', // IndexedDB holds resumes, letters, embeddings
    ],

    // Only ATS hosts we have adapters for. The generic fallback runs via
    // activeTab + scripting, so it needs no standing host permission.
    host_permissions: [
      'https://*.greenhouse.io/*',
      'https://*.lever.co/*',
      'https://*.ashbyhq.com/*',
      'https://*.workable.com/*',
      'https://*.myworkdayjobs.com/*',
      'https://www.linkedin.com/*',
    ],

    side_panel: { default_path: 'sidepanel.html' },

    action: { default_title: 'clanker.tracker' },

    // No remotely-hosted code anywhere: MV3 forbids it, and it is what
    // makes user-imported theme packs safe (data only, never script).
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  },
});
