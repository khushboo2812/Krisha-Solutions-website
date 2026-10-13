// Renders the PNG icons and the social sharing image (og-image.png) from
// src/static/assets/img/favicon.svg using Playwright's Chromium.
// Run locally when the branding changes:  node scripts/make-images.mjs
// (Needs Playwright: npm install --no-save playwright)

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMG = join(ROOT, 'src/static/assets/img');
const favicon = await readFile(join(IMG, 'favicon.svg'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();

async function shoot(html, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}</style></head><body>${html}</body></html>`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: join(IMG, file), omitBackground: true });
}

const icon = (size) => favicon.replace('<svg ', `<svg width="${size}" height="${size}" `);
await shoot(icon(32), 32, 32, 'favicon-32.png');
await shoot(icon(180).replace('rx="14"', 'rx="0"'), 180, 180, 'apple-touch-icon.png');

const og = `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=swap">
<div style="box-sizing:border-box;width:1200px;height:630px;padding:80px 90px;display:flex;flex-direction:column;justify-content:space-between;
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#fff;
  background:radial-gradient(700px 420px at 95% 0%,rgba(0,166,230,.35),transparent 60%),linear-gradient(150deg,#0f0b3a,#1a1259 55%,#2d1e84);">
  <div style="display:flex;align-items:center;gap:22px">
    ${icon(84)}
    <div style="line-height:1">
      <div style="font-size:54px;font-weight:800;letter-spacing:-1px">krisha</div>
      <div style="font-size:20px;font-weight:600;letter-spacing:10px;color:#00a6e6;margin-top:6px">SOLUTIONS</div>
    </div>
  </div>
  <div>
    <div style="font-size:68px;font-weight:800;letter-spacing:-2px;line-height:1.08;max-width:900px">IT That Keeps Your Business Moving.</div>
    <div style="font-size:28px;font-weight:600;color:#a8dcf5;margin-top:26px">Managed IT support · Infrastructure · Cloud · Software &nbsp;|&nbsp; Nairobi, Kenya</div>
  </div>
</div>`;
await shoot(og, 1200, 630, 'og-image.png');

await browser.close();
console.log('Images written to src/static/assets/img/');
