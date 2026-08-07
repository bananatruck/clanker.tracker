import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

/**
 * Chrome refuses to load a content script containing a Unicode *non-character*
 * — U+FFFE, U+FFFF, or U+FDD0-U+FDEF — and reports it as "isn't UTF-8
 * encoded", which is misleading: the file is valid UTF-8 and `iconv` and
 * `file` both say so. `base::IsStringUTF8` simply rejects more than the
 * encoding does.
 *
 * We hit it because Dexie uses `￿` as its IndexedDB max-key sentinel, and
 * the content script pulls Dexie in through the repository layer.
 *
 * Escaping the character is equivalent for every context it can legally appear
 * in — string, template, and regex literals — since a non-character is not a
 * valid identifier character and cannot be syntax. Only the offending code
 * points are touched, so ordinary non-ASCII in UI strings is left alone.
 */
function escapeUnicodeNoncharacters() {
  const isNoncharacter = (cp: number) =>
    (cp & 0xfffe) === 0xfffe || (cp >= 0xfdd0 && cp <= 0xfdef);

  const escape = (s: string) =>
    [...s].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');

  // Surrogate pairs first, so astral non-characters (U+1FFFF and friends) are
  // matched as one code point rather than two stray halves.
  const pattern = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[﷐-﷯￾￿]/g;

  const clean = (code: string): string | null => {
    let touched = false;
    const out = code.replace(pattern, (match) => {
      const cp = match.codePointAt(0);
      if (cp === undefined || !isNoncharacter(cp)) return match;
      touched = true;
      return escape(match);
    });
    return touched ? out : null;
  };

  return {
    name: 'clanker:escape-unicode-noncharacters',
    // generateBundle rather than renderChunk: under Rolldown the latter does
    // not see the final chunk text, and this silently produced an unloadable
    // extension the first time round.
    generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || typeof chunk.code !== 'string') continue;
        const fixed = clean(chunk.code);
        if (fixed !== null) {
          chunk.code = fixed;
          console.info(`[clanker] escaped Unicode non-characters in ${file}`);
        }
      }
    },
  };
}

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],

  vite: () => ({
    plugins: [tailwindcss(), escapeUnicodeNoncharacters()],
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
    //
    // The LLM endpoints are here because tier 5 is a cross-origin fetch from an
    // extension page, which MV3 blocks without a matching host permission. All
    // five are listed rather than just the default, since the whole point is
    // that the user brings whichever key they already have — and a permission
    // that appears the first time you switch provider reads like a compromise.
    host_permissions: [
      'https://*.greenhouse.io/*',
      'https://*.lever.co/*',
      'https://*.ashbyhq.com/*',
      'https://*.workable.com/*',
      'https://*.myworkdayjobs.com/*',
      'https://www.linkedin.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://openrouter.ai/*',
      'http://localhost/*',
    ],

    side_panel: { default_path: 'sidepanel.html' },

    /**
     * The badge the content script draws needs to load the hero art out of the
     * extension, which means the job board's page has to be allowed to fetch
     * that one folder. Scoped to `Sprites/` — nothing else in the bundle is
     * reachable from a page, and the folder is empty on a fresh clone anyway.
     */
    web_accessible_resources: [
      {
        resources: ['Sprites/*', 'Sprites/items/*', 'Sprites/swords/*'],
        matches: ['<all_urls>'],
      },
    ],

    action: { default_title: 'clanker.tracker' },

    // No remotely-hosted code anywhere: MV3 forbids it, and it is what
    // makes user-imported theme packs safe (data only, never script).
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  },
});
