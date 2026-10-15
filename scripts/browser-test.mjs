// Browser tests for the built site, using Playwright + PHP's built-in server.
//
//   KS_FORM_TEST=1 node build.mjs      (build with the form switched on)
//   node scripts/browser-test.mjs [screenshot-dir]
//
// Checks every page on a phone and a desktop viewport (script errors, failed
// requests, horizontal scrolling), the mobile menu, and the enquiry form
// end-to-end. Emails "sent" by the form are written to a local file instead.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SHOTS = process.argv[2] || '';
const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;
const MAIL_LOG = join(tmpdir(), 'ks-test-mail.log');

const PAGES = [
  '/', '/services/', '/services/managed-it-services/', '/services/it-infrastructure-networking/',
  '/services/cloud-hosting-backup/', '/services/software-it-consulting/',
  '/services/website-ecommerce-development/', '/services/it-hardware-equipment/',
  '/krishasure/', '/free-it-assessment/', '/about/', '/contact/', '/contact/thank-you/', '/privacy-policy/', '/404.html',
];
if (existsSync(join(DIST, 'contact/form-test/index.html'))) PAGES.push('/contact/form-test/');
const VIEWPORTS = { phone: { width: 375, height: 812 }, desktop: { width: 1366, height: 900 } };

let failures = 0;
const pass = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const check = (cond, msg) => (cond ? pass(msg) : fail(msg));

// Clear rate-limit records and captured mail from earlier runs.
await rm(MAIL_LOG, { force: true });
for (const f of await readdir(tmpdir())) if (f.startsWith('ks-contact-')) await rm(join(tmpdir(), f), { force: true });

// Stand-in for sendmail: appends each message to MAIL_LOG and ignores arguments.
const FAKE_SENDMAIL = join(tmpdir(), 'ks-fake-sendmail.sh');
await writeFile(FAKE_SENDMAIL, `#!/bin/sh\ncat >> '${MAIL_LOG}'\n`);
await chmod(FAKE_SENDMAIL, 0o755);

const server = spawn('php', ['-d', `sendmail_path=${FAKE_SENDMAIL}`, '-S', `127.0.0.1:${PORT}`, '-t', DIST], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
try {
  console.log('Pages');
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    for (const path of PAGES) {
      const page = await context.newPage();
      const problems = [];
      page.on('pageerror', (e) => problems.push(`script error: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !/instagram|ERR_TUNNEL|ERR_CONNECTION/i.test(m.text() + (m.location().url || ''))) problems.push(`console: ${m.text()}`); });
      // Instagram embeds and Google's tag can't be reached from every test environment, so they are not counted.
      const external = /instagram\.com|cdninstagram|facebook|googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net/;
      page.on('requestfailed', (r) => { if (!external.test(r.url())) problems.push(`request failed: ${r.url()}`); });
      page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE) && !r.url().endsWith('/404.html')) problems.push(`HTTP ${r.status()}: ${r.url()}`); });

      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(problems.length === 0, `${name} ${path} loads cleanly${problems.length ? ` (${problems.join('; ')})` : ''}`);
      check(overflow <= 0, `${name} ${path} has no horizontal scrolling${overflow > 0 ? ` (${overflow}px too wide)` : ''}`);
      if (SHOTS) {
        await mkdir(SHOTS, { recursive: true });
        const slug = path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/[/.]/g, '-');
        await page.screenshot({ path: join(SHOTS, `${name}-${slug}.png`), fullPage: true });
      }
      await page.close();
    }
    await context.close();
  }

  console.log('Navigation');
  {
    const context = await browser.newContext({ viewport: VIEWPORTS.phone });
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const nav = page.locator('#site-nav');
    check(!(await nav.isVisible()), 'phone: menu is closed initially');
    await page.click('[data-nav-toggle]');
    check(await nav.isVisible(), 'phone: menu opens from the menu button');
    const navBox = await nav.boundingBox();
    check(navBox && navBox.height > 500, `phone: open menu fills the screen (${navBox ? Math.round(navBox.height) : 0}px tall)`);
    const navCta = page.locator('#site-nav .nav-cta');
    const ctaBox = await navCta.boundingBox();
    check(await navCta.isVisible() && ctaBox && ctaBox.y + ctaBox.height < 812, 'phone: all menu items are on screen without scrolling');
    await page.click('[aria-controls="nav-products"]');
    check(await page.locator('#nav-products a[href="/krishasure/"]').isVisible(), 'phone: products submenu expands');
    await page.click('[aria-controls="nav-products"]');
    await page.click('[data-sub-toggle]');
    check(await page.locator('#nav-services a[href="/services/cloud-hosting-backup/"]').isVisible(), 'phone: services submenu expands');
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'phone-menu-open.png') });
    await page.click('#nav-services a[href="/services/cloud-hosting-backup/"]');
    await page.waitForURL('**/services/cloud-hosting-backup/');
    check(true, 'phone: submenu link navigates');
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.click('[data-nav-toggle]');
    await page.keyboard.press('Escape');
    check(!(await nav.isVisible()), 'phone: Escape closes the menu');
    await context.close();

    const desk = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const dpage = await desk.newPage();
    await dpage.goto(BASE + '/services/managed-it-services/', { waitUntil: 'networkidle' });
    await dpage.hover('[data-sub-toggle]');
    await dpage.waitForTimeout(300);
    check(await dpage.locator('#nav-services').isVisible(), 'desktop: services dropdown opens on hover');
    await dpage.mouse.move(0, 400);
    await dpage.hover('[aria-controls="nav-products"]');
    await dpage.waitForTimeout(300);
    check(await dpage.locator('#nav-products a[href="/krishasure/"]').isVisible(), 'desktop: products dropdown opens on hover');
    await dpage.mouse.move(0, 400);
    await dpage.waitForTimeout(300);
    await dpage.hover('[aria-controls="nav-services"]');
    await dpage.waitForTimeout(300);
    if (SHOTS) await dpage.screenshot({ path: join(SHOTS, 'desktop-dropdown-open.png') });
    check(
      (await dpage.locator('#nav-services a[href="/services/managed-it-services/"]').getAttribute('aria-current')) === 'page',
      'desktop: current page is marked in the menu',
    );
    await desk.close();
  }

  console.log('WhatsApp links');
  {
    const html = await readFile(join(DIST, 'index.html'), 'utf8');
    const links = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    check(links.length > 0 && links.every((l) => l.startsWith('https://wa.me/254181846711')), `all ${links.length} WhatsApp links on the homepage use +254 181 846711`);
  }

  const formEnabled = (await readFile(join(DIST, 'api/contact-config.php'), 'utf8')).includes("'enabled' => true");
  if (!formEnabled) {
    console.log('Enquiry form: skipped (form is switched off; build with KS_FORM_TEST=1 to test it)');
  } else {
    // Before the form goes public it only appears on the private test page.
    const contactHtml = await readFile(join(DIST, 'contact/index.html'), 'utf8');
    const FORM_PAGE = contactHtml.includes('data-enquiry-form') ? '/contact/' : '/contact/form-test/';
    console.log(`Enquiry form (on ${FORM_PAGE})`);
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await context.newPage();
    await page.goto(BASE + FORM_PAGE + '?service=krishasure', { waitUntil: 'networkidle' });
    check((await page.inputValue('#f-service')) === 'krishasure', 'service is pre-selected from the link');

    await page.click('[data-submit]');
    const errorCount = await page.locator('.field.has-error').count();
    check(errorCount >= 5, `empty form shows field errors (${errorCount} fields flagged)`);
    check(await page.locator('[data-form-status]').isVisible(), 'empty form shows an error summary');
    check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'f-name'), 'focus moves to the first invalid field');
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'form-errors.png'), fullPage: true });

    await page.fill('#f-email', 'not-an-email');
    await page.click('[data-submit]');
    check((await page.textContent('#f-email-error')).includes('valid email'), 'invalid email is rejected');

    // Server-side validation, bypassing the browser checks.
    const raw = await page.request.post(BASE + '/api/contact.php', {
      headers: { Accept: 'application/json' },
      form: { name: 'A', email: 'bad', phone: 'x', service: 'nope', message: 'short', consent: '' },
    });
    const rawJson = await raw.json();
    check(raw.status() === 422 && ['name', 'email', 'phone', 'service', 'message', 'consent', 'company'].every((k) => k in rawJson.errors), 'server rejects invalid data with field errors (HTTP 422)');

    const bot = await page.request.post(BASE + '/api/contact.php', {
      headers: { Accept: 'application/json' },
      form: { website: 'http://spam.example', name: 'Bot', company: 'Bot', email: 'bot@example.com', phone: '0700000000', service: 'other', message: 'Buy cheap things now', consent: 'yes' },
    });
    const mailAfterBot = await readFile(MAIL_LOG, 'utf8').catch(() => '');
    check(bot.status() === 200 && mailAfterBot === '', 'honeypot submission is silently dropped (no email sent)');

    const fast = await page.request.post(BASE + '/api/contact.php', {
      headers: { Accept: 'application/json' },
      form: { started: String(Date.now()), name: 'Fast Bot', company: 'Bot', email: 'bot@example.com', phone: '0700000000', service: 'other', message: 'Submitted far too fast', consent: 'yes' },
    });
    check(fast.status() === 400, 'instant submission is rejected');

    const header = await page.request.post(BASE + '/api/contact.php', {
      headers: { Accept: 'application/json' },
      form: { name: 'Eve', company: 'X', email: 'eve@example.com\r\nBcc: victim@example.com', phone: '0700000000', service: 'other', message: 'Header injection attempt', consent: 'yes' },
    });
    check(header.status() === 422, 'email header injection attempt is rejected');

    // A real submission through the page.
    await page.goto(BASE + FORM_PAGE, { waitUntil: 'networkidle' });
    await page.fill('#f-name', 'Jane Wanjiku');
    await page.fill('#f-company', 'Example Accountants Ltd');
    await page.fill('#f-email', 'jane@example.co.ke');
    await page.fill('#f-phone', '+254 700 000 000');
    await page.selectOption('#f-business-type', 'accounting');
    await page.selectOption('#f-employees', '20-50');
    await page.selectOption('#f-service', 'managed-it');
    await page.fill('#f-message', 'Our office Wi-Fi keeps dropping and we are not sure our backups are working.');
    await page.check('#f-consent');
    await page.waitForTimeout(3200); // the anti-spam timer needs 3 seconds
    await page.click('[data-submit]');
    await page.waitForURL('**/contact/thank-you/', { timeout: 10000 });
    check(true, 'valid enquiry redirects to the thank-you page');
    const mail = await readFile(MAIL_LOG, 'utf8').catch(() => '');
    const inbox = (await readFile(join(DIST, 'api/contact-config.php'), 'utf8')).match(/'to' => '([^']+)'/)[1];
    check(mail.includes(`To: ${inbox}`), `email is addressed to the configured inbox (${inbox})`);
    check(mail.includes('Reply-To: jane@example.co.ke'), 'Reply-To is the visitor’s email address');
    check(mail.includes('Example Accountants Ltd') && mail.includes('Wi-Fi keeps dropping'), 'email contains the enquiry details');
    check(mail.includes('Managed IT services and technical support'), 'email shows the selected service');
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'form-thank-you.png'), fullPage: true });

    // No-JavaScript fallback: a plain form post redirects to the thank-you page.
    const noJs = await page.request.post(BASE + '/api/contact.php', {
      maxRedirects: 0,
      form: { name: 'No Script', company: 'Plain Ltd', email: 'plain@example.com', phone: '0711111111', service: 'web', message: 'Testing without JavaScript', consent: 'yes' },
    });
    check(noJs.status() === 303 && noJs.headers()['location'] === '/contact/thank-you/', 'form also works without JavaScript (303 redirect)');

    // Rate limiting: at most 5 accepted submissions per hour from one address.
    let lastStatus = 0;
    for (let i = 0; i < 5; i++) {
      const r = await page.request.post(BASE + '/api/contact.php', {
        headers: { Accept: 'application/json' },
        form: { name: 'Repeat', company: 'R Ltd', email: 'r@example.com', phone: '0722222222', service: 'other', message: `Repeat message ${i}`, consent: 'yes' },
      });
      lastStatus = r.status();
    }
    check(lastStatus === 429, 'repeated submissions are rate-limited (HTTP 429)');
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
