// CI only: inspect the actual WebView2 page through its explicit debug port.
import { chromium } from '../../frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const output = process.env.SOLA_SMOKE_OUTPUT;
const watchdog = setTimeout(() => { console.error('WebView inspection timed out'); process.exit(2); }, 45000);
await fs.mkdir(output, { recursive: true });
let browser;
for (let i = 0; i < 60; i++) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:9223'); break; }
  catch { await new Promise(resolve => setTimeout(resolve, 500)); }
}
if (!browser) throw new Error('WebView2 debug endpoint did not become available.');
try {
  const pages = browser.contexts().flatMap(context => context.pages());
  console.log('WebView2 pages:', pages.map(page => page.url()));
  const page = pages.find(page => page.url().includes('wails')) || pages[0];
  if (!page) throw new Error('WebView2 has no page.');
  page.on('pageerror', error => console.log('WebView2 JavaScript error:', error.message));
  page.on('console', message => { if (message.type() === 'error') console.log('WebView2 console:', message.text()); });
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 3000));
  const report = await page.evaluate(async () => {
    const app = window.go?.main?.App;
    const result = {
      location: location.href,
      native: Boolean(app),
      body: document.body.innerText.slice(0, 6000),
      resources: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => !name.includes('session=')),
    };
    if (app) {
      try {
        const bootstrap = await Promise.race([app.Bootstrap(), new Promise((_, reject) => setTimeout(() => reject(new Error('Native bootstrap timed out during modal dialog')), 5000))]);
        result.baseURL = bootstrap.baseURL;
        const response = await fetch(bootstrap.baseURL + '/health', { headers: { 'X-SolA-Session': bootstrap.session } });
        result.health = response.status;
      } catch (error) { result.nativeError = String(error); }
    }
    return result;
  });
  console.log('WebView2 report:', JSON.stringify(report));
  await fs.writeFile(path.join(output, 'webview.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: path.join(output, 'webview.png') });
} finally { clearTimeout(watchdog); await browser.close(); }
