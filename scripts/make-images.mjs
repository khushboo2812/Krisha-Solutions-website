// Renders the social sharing image (og-image.png) from the real logo
// (src/static/assets/img/logo.png) using Playwright's Chromium.
// Run when the branding changes:  node scripts/make-images.mjs
// (Needs Playwright: npm install --no-save playwright)
//
// The browser icons (favicon-32.png, icon-192.png, apple-touch-icon.png) and
// feather.png are cut from the original logo file and are not generated here.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMG = join(ROOT, 'src/static/assets/img');
const logo = `data:image/png;base64,${(await readFile(join(IMG, 'logo.png'))).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=swap">
<style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}</style></head><body>
<div style="box-sizing:border-box;width:1200px;height:630px;padding:70px 90px;display:flex;flex-direction:column;justify-content:space-between;
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#fff;
  background:radial-gradient(700px 420px at 95% 0%,rgba(0,166,230,.35),transparent 60%),linear-gradient(150deg,#0f0b3a,#1a1259 55%,#2d1e84);">
  <div style="align-self:flex-start;background:#fff;border-radius:22px;padding:18px 26px"><img src="${logo}" style="height:120px;display:block"></div>
  <div>
    <div style="font-size:66px;font-weight:800;letter-spacing:-2px;line-height:1.08;max-width:900px">IT That Keeps Your Business Moving.</div>
    <div style="font-size:28px;font-weight:600;color:#a8dcf5;margin-top:22px">Managed IT support · Infrastructure · Cloud · Software &nbsp;|&nbsp; Nairobi, Kenya</div>
  </div>
</div></body></html>`);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: join(IMG, 'og-image.png') });
await browser.close();
console.log('Wrote src/static/assets/img/og-image.png');
