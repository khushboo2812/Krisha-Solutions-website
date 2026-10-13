// Checks the built site in dist/ for common problems:
// broken internal links and anchors, missing SEO tags, heading structure,
// duplicate IDs, image alt text, unsafe new-tab links and leftover template tags.
// Usage: node scripts/check.mjs   (run after node build.mjs)

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const errors = [];
const warnings = [];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

function urlFor(file) {
  const rel = relative(DIST, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  return rel.endsWith('/index.html') ? `/${rel.slice(0, -10)}` : `/${rel}`;
}

const files = (await walk(DIST)).filter((f) => f.endsWith('.html'));
const pages = new Map();
for (const file of files) pages.set(urlFor(file), await readFile(file, 'utf8'));

const idsOf = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const titles = new Map();
const descriptions = new Map();

for (const [url, html] of pages) {
  const where = (msg) => `${url}: ${msg}`;

  if (/\{\{|\}\}/.test(html)) errors.push(where('unrendered template tag'));
  if (!/<html lang="/.test(html)) errors.push(where('missing lang attribute'));

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!title) errors.push(where('missing <title>'));
  if (!desc) errors.push(where('missing meta description'));
  if (!/<link rel="canonical" href="https:\/\/krishasolutions\.net\//.test(html)) errors.push(where('missing canonical URL'));
  const noindex = /content="noindex/.test(html);
  if (!noindex) {
    if (title && title.length > 70) warnings.push(where(`title is ${title.length} characters (aim for 70 or fewer)`));
    if (desc && desc.length > 170) warnings.push(where(`description is ${desc.length} characters (aim for 170 or fewer)`));
    if (titles.has(title)) errors.push(where(`duplicate title (also on ${titles.get(title)})`));
    if (descriptions.has(desc)) errors.push(where(`duplicate description (also on ${descriptions.get(desc)})`));
    titles.set(title, url);
    descriptions.set(desc, url);
  }

  const h1s = html.match(/<h1[\s>]/g) || [];
  if (h1s.length !== 1) errors.push(where(`has ${h1s.length} <h1> elements (expected 1)`));

  const ids = idsOf(html);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) errors.push(where(`duplicate ids: ${[...new Set(dupes)].join(', ')}`));

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) errors.push(where(`image without alt text: ${m[0]}`));
  }

  for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0])) errors.push(where(`new-tab link without rel="noopener": ${m[0]}`));
  }

  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const link = m[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(link)) continue;
    if (link.startsWith('#')) {
      if (link.length > 1 && !ids.includes(link.slice(1))) errors.push(where(`anchor ${link} not found on page`));
      continue;
    }
    if (!link.startsWith('/')) {
      errors.push(where(`relative link "${link}" (use a root-relative path)`));
      continue;
    }
    const [pathAndQuery, hash] = link.split('#');
    const path = pathAndQuery.split('?')[0];
    let target;
    if (path.endsWith('/')) target = join(DIST, path, 'index.html');
    else target = join(DIST, path);
    if (!(await isFile(target))) {
      errors.push(where(`broken link ${link}`));
      continue;
    }
    if (hash && target.endsWith('.html')) {
      const targetHtml = pages.get(path);
      if (targetHtml && !idsOf(targetHtml).includes(hash)) errors.push(where(`anchor #${hash} not found on ${path}`));
    }
  }
}

// Sitemap must list exactly the indexable pages.
const sitemap = await readFile(join(DIST, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>https:\/\/krishasolutions\.net([^<]*)<\/loc>/g)].map((m) => m[1]);
for (const [url, html] of pages) {
  const indexable = !/content="noindex/.test(html);
  if (indexable && !sitemapUrls.includes(url)) errors.push(`sitemap.xml is missing ${url}`);
  if (!indexable && sitemapUrls.includes(url)) errors.push(`sitemap.xml lists noindex page ${url}`);
}
if (!(await readFile(join(DIST, 'robots.txt'), 'utf8')).includes('Sitemap: https://krishasolutions.net/sitemap.xml')) {
  errors.push('robots.txt does not reference the sitemap');
}

for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`ERROR:   ${e}`);
console.log(`\nChecked ${pages.size} pages: ${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
