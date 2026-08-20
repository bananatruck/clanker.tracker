/**
 * Install the production bundle in Chrome and prove its two runtime halves:
 * the content script renders on a real page and an extension page can reach
 * the MV3 service worker. Unit tests and a manifest parser cannot prove either.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXTENSION = join(ROOT, '.output', 'chrome-mv3');
const TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chromeBinary() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;

  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const cache = join(homedir(), '.cache', 'puppeteer', 'chrome');
  if (existsSync(cache)) {
    for (const version of readdirSync(cache).sort().reverse()) {
      candidates.push(join(cache, version, 'chrome-linux64', 'chrome'));
    }
  }

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('No Chrome binary found. Set CHROME=/path/to/chrome.');
  return found;
}

class Devtools {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)), {
        once: true,
      });
    });
    return new Devtools(socket);
  }

  send(method, params = {}, sessionId, timeoutMs = TIMEOUT_MS) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  close() {
    this.socket.close();
  }
}

function serveFixture() {
  const html = `<!doctype html>
    <html><head><title>Clanker browser fixture</title></head><body>
      <main>
        <h1>Software Engineer</h1><p>Acme Systems</p>
        <form id="application-form">
          <label for="first_name">First name</label><input id="first_name" name="first_name">
          <label for="email">Email</label><input id="email" name="email" type="email">
          <label for="phone">Phone</label><input id="phone" name="phone" type="tel">
        </form>
      </main>
    </body></html>`;
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Fixture server did not expose a TCP port.'));
        return;
      }
      resolve({ server, url: `http://localhost:${address.port}/application` });
    });
  });
}

async function waitForLauncher(devtools, sessionId) {
  const expression = `(() => {
    const host = document.querySelector('[data-clanker-launcher]');
    const badge = host?.shadowRoot?.querySelector('.badge');
    return badge ? badge.textContent.replace(/\\s+/g, ' ').trim() : '';
  })()`;

  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(250);
    const { result } = await devtools.send(
      'Runtime.evaluate',
      { expression, returnByValue: true },
      sessionId,
    );
    if (result.value) return result.value;
  }
  throw new Error('The production content script never rendered its launcher.');
}

async function backgroundHealth(devtools, extensionId) {
  const { targetId } = await devtools.send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/sidepanel.html`,
  });
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true });
  await devtools.send('Runtime.enable', {}, sessionId);

  const expression = `(async () => JSON.stringify(await chrome.runtime.sendMessage({
    type: 'db:getSetting', key: 'browser.smoke', fallback: 'worker-ok'
  })))()`;
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(200);
    try {
      const { result } = await devtools.send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      );
      const reply = JSON.parse(result.value ?? 'null');
      if (reply?.ok && reply.data === 'worker-ok') return;
    } catch {
      // The extension page may still be starting; keep the bounded poll going.
    }
  }
  throw new Error('The extension page could not exchange a message with the service worker.');
}

if (!existsSync(join(EXTENSION, 'manifest.json'))) {
  throw new Error('No production build found. Run `pnpm build` first.');
}

const profile = await mkdtemp(join(tmpdir(), 'clanker-browser-smoke-'));
const fixture = await serveFixture();
const chrome = spawn(
  chromeBinary(),
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-unsafe-extension-debugging',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

let stderr = '';
const endpoint = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Chrome did not start. ${stderr.slice(-500)}`)), TIMEOUT_MS);
  chrome.stderr.on('data', (chunk) => {
    stderr += chunk;
    const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) {
      clearTimeout(timer);
      resolve(match[1]);
    }
  });
  chrome.once('exit', (code) => {
    clearTimeout(timer);
    reject(new Error(`Chrome exited before startup (${code}). ${stderr.slice(-500)}`));
  });
});

const devtools = await Devtools.connect(endpoint);
try {
  const installed = await devtools.send('Extensions.loadUnpacked', { path: EXTENSION });
  if (!installed?.id) throw new Error('Chrome did not return an extension id after loadUnpacked.');

  const { targetId } = await devtools.send('Target.createTarget', { url: fixture.url });
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true });
  await devtools.send('Runtime.enable', {}, sessionId);
  const badge = await waitForLauncher(devtools, sessionId);
  await backgroundHealth(devtools, installed.id);

  console.log(`✓ Chrome loaded ${installed.id}`);
  console.log(`✓ content launcher rendered: ${JSON.stringify(badge)}`);
  console.log('✓ MV3 service worker replied through runtime messaging');
} finally {
  devtools.close();
  chrome.kill();
  fixture.server.close();
  await rm(profile, { recursive: true, force: true });
}
