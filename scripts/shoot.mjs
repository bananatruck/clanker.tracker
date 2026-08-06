/**
 * Regenerate docs/demo/*.png from the built extension.
 *
 *   pnpm build && pnpm shots
 *
 * The screenshots in the README are the real UI rendering the real database —
 * `sidepanel.html#/demo` seeds a plausible crusade through the actual repo
 * functions and every screen runs its shipping code path. A mockup drawn in a
 * design tool cannot be wrong, which is exactly the problem with one; a picture
 * taken this way that looks wrong means the app is wrong.
 *
 * Chrome's `--screenshot` flag fires before an IndexedDB-backed React app has
 * painted, so this drives the DevTools protocol and waits for the DOM.
 *
 * Set CHROME to a Chrome/Chromium binary if the ones probed below are absent.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVE = join(ROOT, '.output/chrome-mv3');
const OUT = join(ROOT, 'docs/demo');

const PORT = 8731;
const DEBUG_PORT = 9333;
const WIDTH = 420; // the side panel's default width
const SCALE = 2; // retina, so the pixel art survives being scaled in a README
const PROBE_HEIGHT = 1000;

/**
 * One image per screen, plus the review overlay — which is not a side-panel
 * screen at all. It renders into the job board, which makes it the one part of
 * the product that cannot be photographed by opening a URL, and the most
 * important one, because it is the step between a resolver guess and a
 * submitted application.
 */
const SHOTS = [
  'dashboard', 'profile', 'scan', 'fill',
  'title', 'encounter', 'running',
  'tracker', 'tracker-table', 'crusade', 'settings', 'overlay',
];

/**
 * Screens that fill their frame rather than growing to fit it.
 *
 * Measuring these would be measuring a viewport rather than a screen, and the
 * measure path reloads to lay out at the final height — which would restart
 * the very animation the shot is of.
 */
const FIXED = { running: 760, encounter: 700, title: 460 };

/**
 * How long to wait after paint, per route.
 *
 * The encounter is a 620ms flash over a 420ms drop, and the interesting frame
 * is the one where the foe has landed and the wash has not finished. 450ms is
 * inside the last step of the flash, which is deterministic because the
 * animation is on `steps()` — a smooth curve would make this a race.
 */
const SETTLE = { encounter: 450 };

/**
 * Screens that are a route plus a click.
 *
 * The panel's tracker opens on the board, which is the right default for 420
 * pixels and the wrong thing to photograph twice. Rather than add a URL for
 * every internal toggle — routes that exist only to be screenshotted are
 * routes that rot — the shot drives the actual control a user would press.
 */
const ROUTE_OF = { 'tracker-table': 'tracker' };
const CLICK = {
  'tracker-table':
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'table')?.click()`,
};

/** The full-page dashboard is its own document at its own width. */
const PAGES = [
  { name: 'page-home', url: 'dashboard.html#/demo', width: 1180, height: 1000 },
  { name: 'page-profile', url: 'dashboard.html#/demo/profile', width: 1180, height: 1400 },
  // The table wants every column visible at once, which is the whole argument
  // for it living in a tab rather than a 420-pixel panel.
  { name: 'page-tracker', url: 'dashboard.html#/demo/tracker', width: 1440, height: 940 },
  // The README's hero: the battle screen alone, wide, with nothing around it.
  { name: 'scene', url: 'sidepanel.html#/demo/scene', width: 900, height: 484 },
  { name: 'acts', url: 'sidepanel.html#/demo/acts', width: 900, height: 174 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ chrome */

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;

  const candidates = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

  // Whatever Puppeteer last downloaded, newest first. Plenty of machines have
  // one of these and no system Chrome at all.
  const cache = join(homedir(), '.cache/puppeteer/chrome');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).sort().reverse()) {
      candidates.push(join(cache, dir, 'chrome-linux64/chrome'));
      candidates.push(join(cache, dir, 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    }
  }

  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome found. Set CHROME=/path/to/chrome.');
  return found;
}

/* ------------------------------------------------------------------ server */

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
};

/**
 * Whether to serve installed art.
 *
 * Off by default, and that default is the point. Whoever runs this has their
 * own sheets in `public/Sprites/`, so photographing the build as-is would put
 * *their* art in the README — and every visitor would then arrive at a repo
 * that does not look like its own screenshots. The pictures have to show what
 * a fresh clone renders, which is the drawn sprites and the drawn acts.
 *
 * `SHOTS_ART=installed pnpm shots` to photograph your own instead.
 */
const WITH_ART = process.env.SHOTS_ART === 'installed';

function serve() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (!WITH_ART && url.startsWith('/Sprites/')) {
      res.writeHead(404).end();
      return;
    }

    const path = join(SERVE, url);
    if (!path.startsWith(SERVE) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

/* --------------------------------------------------------------------- cdp */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async eval(expression) {
    const { result } = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    return result.value;
  }
}

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome never opened a debugging port');
}

/* -------------------------------------------------------------------- main */

if (!existsSync(join(SERVE, 'sidepanel.html'))) {
  throw new Error('No build to photograph. Run `pnpm build` first.');
}

/**
 * A fresh profile, every run.
 *
 * The demo seeder refuses to touch a database that already has applications in
 * it — correct, since it must never overwrite a real user's board — which
 * means a profile kept between runs photographs whatever was seeded the first
 * time this ever ran. That silently defeats the entire point of taking these
 * pictures from the real app: the screenshots stop tracking the code and start
 * being an old database with a new UI drawn over it. Cheap to throw away,
 * expensive to trust.
 */
const PROFILE = join(ROOT, 'node_modules/.cache/shoot-profile');
rmSync(PROFILE, { recursive: true, force: true });

const server = await serve();
const chrome = spawn(
  findChrome(),
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--window-size=${WIDTH},${PROBE_HEIGHT}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

await waitForDevtools();
mkdirSync(OUT, { recursive: true });

for (const route of SHOTS) {
  const target = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, {
    method: 'PUT',
  }).then((r) => r.json());

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const cdp = new Cdp(ws);
  const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: target.id });

  /**
   * Resize the window and the emulated viewport together. Emulating a viewport
   * taller than the window makes headless tile the compositor surface, which
   * produces a screenshot of the same screen repeated four times.
   */
  const size = async (height) => {
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: WIDTH, height } });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height,
      deviceScaleFactor: SCALE,
      mobile: false,
    });
  };

  const painted =
    route === 'overlay'
      ? '!!document.querySelector("[data-clanker-overlay]")'
      : 'document.querySelectorAll("#root *").length > 20';

  const fixed = FIXED[route] ?? null;

  const settle = async () => {
    for (let i = 0; i < 60; i++) {
      await sleep(200);
      if (await cdp.eval(painted)) break;
    }
    await sleep(SETTLE[route] ?? 700); // canvases are drawn in an effect, a frame later

    // Re-applied after a reload, so growing the frame to fit does not quietly
    // put the screen back on its default tab.
    if (CLICK[route]) {
      await cdp.eval(CLICK[route]);
      await sleep(300);
    }
  };

  // How tall the content actually is, so the image is cropped to the screen
  // rather than to whatever viewport happened to be in force.
  const measure = () =>
    cdp.eval(
      route === 'overlay'
        ? `(() => {
             const wrap = document
               .querySelector('[data-clanker-overlay]').shadowRoot.querySelector('.wrap');
             return Math.ceil(wrap.getBoundingClientRect().bottom + 16);
           })()`
        : `(() => {
             const main = document.querySelector('main');
             const content = main.firstElementChild;
             return Math.ceil(
               main.getBoundingClientRect().top + content.getBoundingClientRect().height + 16,
             );
           })()`,
    );

  // The overlay's max-height is tied to the viewport, so it needs the taller
  // frame from the start or it photographs mid-scroll.
  await size(route === 'overlay' ? 1600 : (fixed ?? PROBE_HEIGHT));
  await cdp.send('Page.navigate', {
    url: `http://localhost:${PORT}/sidepanel.html#/demo/${ROUTE_OF[route] ?? route}`,
  });
  await settle();

  const height = fixed ?? Math.max(360, (await measure()) ?? PROBE_HEIGHT);

  // Grow to fit, then reload so layout happens once, at the final size.
  if (height > PROBE_HEIGHT && route !== 'overlay') {
    await size(height);
    await cdp.send('Page.reload');
    await settle();
  }

  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: WIDTH, height, scale: 1 },
  });
  writeFileSync(join(OUT, `${route}.png`), Buffer.from(data, 'base64'));
  console.log(`docs/demo/${route}.png  ${WIDTH}x${height}`);

  ws.close();
  await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`);
}

for (const page of PAGES) {
  const target = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, {
    method: 'PUT',
  }).then((r) => r.json());

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const cdp = new Cdp(ws);
  const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: target.id });

  await cdp.send('Browser.setWindowBounds', {
    windowId,
    bounds: { width: page.width, height: page.height },
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: page.width,
    height: page.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/${page.url}` });

  for (let i = 0; i < 60; i++) {
    await sleep(200);
    if (await cdp.eval('document.querySelectorAll("#root *").length > 20')) break;
  }
  await sleep(900);

  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${page.name}.png`), Buffer.from(data, 'base64'));
  console.log(`docs/demo/${page.name}.png  ${page.width}x${page.height}`);

  ws.close();
  await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`);
}

chrome.kill();
server.close();
