// Builds the static website from src/ into dist/.
// Usage: node build.mjs   (no dependencies needed)
//
// Pages live in src/pages/**. Each page starts with a JSON front-matter block
// between two "---" lines, followed by the page's HTML. Pages are wrapped in
// src/layout.html, and can use these template tags:
//   {{name}}               value, HTML-escaped
//   {{{name}}}             value, inserted as raw HTML
//   {{> partial}}          contents of src/partials/partial.html
//   {{#name}}...{{/name}}  only rendered when name is set / true
//   {{^name}}...{{/name}}  only rendered when name is empty / false

import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'dist');

const config = JSON.parse(await readFile(join(ROOT, 'site.config.json'), 'utf8'));

// Local testing only: build with the enquiry form switched on.
if (process.env.KS_FORM_TEST) {
  config.form.enabled = true;
  config.form.recipient = 'test-inbox@example.com';
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

const fileHash = async (file) =>
  createHash('sha1').update(await readFile(file)).digest('hex').slice(0, 10);

// --- Logo -------------------------------------------------------------------

// Uses the real logo if one has been added to src/static/assets/img/,
// otherwise falls back to a text wordmark in the brand colours.
async function findLogo() {
  for (const name of ['logo.svg', 'logo.png', 'logo.webp', 'logo.jpg']) {
    const file = join(SRC, 'static/assets/img', name);
    if (await exists(file)) return { name, file };
  }
  return null;
}

function imageSize(buffer, name) {
  if (name.endsWith('.png')) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (name.endsWith('.jpg')) {
    // Find the JPEG "start of frame" marker, which holds the image size.
    let i = 2;
    while (i < buffer.length) {
      const marker = buffer[i + 1];
      const length = buffer.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
      }
      i += 2 + length;
    }
  }
  if (name.endsWith('.svg')) {
    const viewBox = buffer.toString('utf8').match(/viewBox="[\d.\s-]*?\s([\d.]+)\s+([\d.]+)"/);
    if (viewBox) return { width: Math.round(viewBox[1]), height: Math.round(viewBox[2]) };
  }
  return null;
}

// --- Templating -------------------------------------------------------------

function render(template, vars, partials, depth = 0) {
  if (depth > 10) throw new Error('Partials nested too deeply');
  let out = template.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    if (!(name in partials)) throw new Error(`Unknown partial: ${name}`);
    return render(partials[name], vars, partials, depth + 1);
  });

  const lookup = (key) => key.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), vars);
  const truthy = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

  let previous;
  do {
    previous = out;
    out = out.replace(/\{\{([#^])([\w.]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, type, key, body) =>
      (type === '#') === truthy(lookup(key)) ? body : '',
    );
  } while (out !== previous);

  out = out.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, key) => String(lookup(key) ?? ''));
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => escapeHtml(lookup(key) ?? ''));
  return out;
}

function parsePage(source, file) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing front matter`);
  try {
    return { meta: JSON.parse(match[1]), body: match[2] };
  } catch (error) {
    throw new Error(`${file}: invalid front matter JSON (${error.message})`);
  }
}

function urlPathFor(file) {
  const rel = relative(join(SRC, 'pages'), file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
}

// --- Structured data (schema.org) ---------------------------------------------

function organisationSchema(vars) {
  const { contact } = config;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${config.siteUrl}/#organization`,
    name: config.siteName,
    slogan: config.tagline,
    url: `${config.siteUrl}/`,
    description:
      'IT services, technical support, infrastructure management, software solutions and IT consulting for businesses in Nairobi and across Kenya.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: contact.locality,
      addressCountry: contact.countryCode,
    },
    areaServed: [
      { '@type': 'City', name: 'Nairobi' },
      { '@type': 'Country', name: 'Kenya' },
    ],
    image: `${config.siteUrl}/assets/img/og-image.png`,
  };
  if (vars.logoUrl) schema.logo = `${config.siteUrl}${vars.logoUrl}`;
  if (contact.phone) schema.telephone = contact.phone;
  if (contact.email) schema.email = contact.email;
  return schema;
}

function breadcrumbSchema(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, href], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: `${config.siteUrl}${href}`,
    })),
  };
}

function serviceSchema(meta, canonical) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: meta.service.name,
    serviceType: meta.service.name,
    description: meta.description,
    url: canonical,
    provider: { '@id': `${config.siteUrl}/#organization` },
    areaServed: [
      { '@type': 'City', name: 'Nairobi' },
      { '@type': 'Country', name: 'Kenya' },
    ],
  };
}

function breadcrumbHtml(crumbs) {
  const items = crumbs.map(([name, href], index) =>
    index === crumbs.length - 1
      ? `<li><span aria-current="page">${escapeHtml(name)}</span></li>`
      : `<li><a href="${href}">${escapeHtml(name)}</a></li>`,
  );
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><ol>${items.join('')}</ol></nav>`;
}

function analyticsHead() {
  const { ga4Id, googleAdsId } = config.analytics;
  const ids = [ga4Id, googleAdsId].filter(Boolean);
  if (!ids.length) return '';
  const configs = ids.map((id) => `gtag('config', ${JSON.stringify(id)});`).join('\n    ');
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids[0])}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    ${configs}
  </script>`;
}

// --- Build ------------------------------------------------------------------

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(join(SRC, 'static'), OUT, { recursive: true });

const layout = await readFile(join(SRC, 'layout.html'), 'utf8');
const partials = {};
for (const file of await readdir(join(SRC, 'partials'))) {
  if (file.endsWith('.html')) partials[file.slice(0, -5)] = await readFile(join(SRC, 'partials', file), 'utf8');
}

const { contact, analytics } = config;
const whatsappUrl = `https://wa.me/${contact.whatsappNumber}`;

const logo = await findLogo();
let logoUrl = '';
let brandMark;
if (logo) {
  const size = imageSize(await readFile(logo.file), logo.name);
  logoUrl = `/assets/img/${logo.name}`;
  const dims = size ? ` width="${size.width}" height="${size.height}"` : '';
  brandMark = `<img class="brand__logo" src="${logoUrl}" alt="${escapeHtml(config.siteName)}"${dims}>`;
} else {
  brandMark = partials['wordmark'];
}

const today = new Date().toISOString().slice(0, 10);

const baseVars = {
  siteName: config.siteName,
  siteUrl: config.siteUrl,
  tagline: config.tagline,
  year: new Date().getFullYear(),
  whatsappUrl,
  whatsappChatUrl: `${whatsappUrl}?text=${encodeURIComponent(contact.whatsappMessage)}`,
  whatsappDisplay: contact.whatsappDisplay,
  email: contact.email,
  emailHref: contact.email ? `mailto:${contact.email}` : '',
  phone: contact.phone,
  phoneHref: contact.phone ? `tel:${contact.phone.replace(/[^+\d]/g, '')}` : '',
  phoneDisplay: contact.phoneDisplay || contact.phone,
  location: `${contact.locality}, ${contact.country}`,
  formEnabled: config.form.enabled && Boolean(config.form.recipient),
  cssVersion: await fileHash(join(SRC, 'static/assets/css/styles.css')),
  jsVersion: await fileHash(join(SRC, 'static/assets/js/main.js')),
  analyticsHead: analyticsHead(),
  analyticsConfig: JSON.stringify({
    adsId: analytics.googleAdsId || '',
    contactLabel: analytics.adsContactConversionLabel || '',
    leadLabel: analytics.adsLeadConversionLabel || '',
  }),
  logoUrl,
  brandMark,
  lastUpdated: today,
};

const pageFiles = (await walk(join(SRC, 'pages'))).filter((f) => f.endsWith('.html')).sort();
const sitemapUrls = [];

for (const file of pageFiles) {
  const { meta, body } = parsePage(await readFile(file, 'utf8'), relative(ROOT, file));
  for (const key of ['title', 'description']) {
    if (!meta[key]) throw new Error(`${relative(ROOT, file)}: front matter needs "${key}"`);
  }

  const path = urlPathFor(file);
  const canonical = `${config.siteUrl}${path}`;
  const crumbs = meta.breadcrumb ? [['Home', '/'], ...meta.breadcrumb] : null;

  const schemas = [];
  if (meta.organisationSchema) schemas.push(organisationSchema(baseVars));
  if (crumbs) schemas.push(breadcrumbSchema(crumbs));
  if (meta.service) schemas.push(serviceSchema(meta, canonical));

  const vars = {
    ...baseVars,
    path,
    canonical,
    pageTitle: meta.title,
    pageDescription: meta.description,
    robots: meta.noindex ? 'noindex, follow' : 'index, follow',
    bodyClass: meta.bodyClass || '',
    bodyData: meta.conversion ? 'data-conversion="lead"' : '',
    breadcrumbHtml: crumbs ? breadcrumbHtml(crumbs) : '',
    servicesActive: path.startsWith('/services/') ? 'is-active' : '',
    schemaJson: schemas
      .map((s) => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`)
      .join('\n  '),
  };

  const content = render(body, vars, partials);
  let html = render(layout, { ...vars, content }, partials);

  // Mark the current page in the navigation.
  html = html.split(`href="${path}" data-nav-link`).join(`href="${path}" data-nav-link aria-current="page"`);

  const outFile = path.endsWith('/') ? join(OUT, path, 'index.html') : join(OUT, path);
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, html);

  if (!meta.noindex) sitemapUrls.push({ loc: canonical, priority: meta.priority ?? (path === '/' ? '1.0' : '0.8') });
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls
  .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`)
  .join('\n')}
</urlset>
`;
await writeFile(join(OUT, 'sitemap.xml'), sitemap);

await writeFile(
  join(OUT, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`,
);

// Settings for the enquiry form handler (dist/api/contact.php).
const formConfig = {
  enabled: baseVars.formEnabled,
  to: config.form.recipient,
  from: config.form.fromAddress,
  siteName: config.siteName,
};
const phpString = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
await writeFile(
  join(OUT, 'api/contact-config.php'),
  `<?php\n// Generated by build.mjs from site.config.json. Do not edit on the server.\nreturn [\n${Object.entries(formConfig)
    .map(([k, v]) => `    '${k}' => ${typeof v === 'boolean' ? v : phpString(v)},`)
    .join('\n')}\n];\n`,
);

console.log(`Built ${pageFiles.length} pages into dist/ (contact form ${baseVars.formEnabled ? 'ON' : 'OFF'}, logo: ${logo ? logo.name : 'text wordmark'})`);
