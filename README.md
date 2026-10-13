# Krisha Solutions website

Website for [krishasolutions.net](https://krishasolutions.net), hosted on HostAfrica (DirectAdmin) and deployed automatically from GitHub.

It is a fast static site (plain HTML, CSS and a little JavaScript) built by a small script with no dependencies. The enquiry form is handled by one PHP file on the hosting.

## Project structure

```
site.config.json        Contact details, form and analytics settings (edit this first)
build.mjs               Builds the site from src/ into dist/
src/
  layout.html           Page wrapper: <head>, SEO tags, header and footer
  partials/             Shared pieces: header, footer, icons, contact options, enquiry form
  pages/                One file per page (the folder becomes the URL)
  static/               Copied as-is: CSS, JavaScript, images, .htaccess, form handler (api/)
scripts/
  check.mjs             Checks links, SEO tags, headings and the sitemap
  browser-test.mjs      Browser tests (pages, mobile menu, enquiry form)
  make-images.mjs       Regenerates favicons and the social sharing image
.github/workflows/      Automatic deployment and pull-request checks
```

## Pages

| URL | Page |
|-----|------|
| `/` | Home |
| `/services/` | All services |
| `/services/managed-it-services/` | Managed IT Services and Technical Support |
| `/services/it-infrastructure-networking/` | IT Infrastructure and Networking |
| `/services/cloud-hosting-backup/` | Cloud Services, Hosting and Backup |
| `/services/software-it-consulting/` | Software Solutions and IT Consulting |
| `/services/website-ecommerce-development/` | Website and E-commerce Development |
| `/services/it-hardware-equipment/` | IT Hardware and Equipment |
| `/krishasure/` | KrishaSure helpdesk product |
| `/about/` | About Us |
| `/contact/` | Contact Us and enquiry form |
| `/contact/thank-you/` | Shown after an enquiry is sent (not indexed by search engines) |
| `/privacy-policy/` | Privacy Policy |
| `/404.html` | Page not found |

`sitemap.xml` and `robots.txt` are generated automatically.

## Editing content

Each page is an HTML file in `src/pages/`. The block at the top sets the page's title and description for Google:

```
---
{
  "title": "Managed IT Services & IT Support in Nairobi | Krisha Solutions",
  "description": "One or two sentences shown in Google results (about 150 characters)."
}
---
```

Shared text (header, footer, contact boxes, enquiry form) is in `src/partials/`.
Contact details come from `site.config.json`, so they only need changing in one place.

## Settings (`site.config.json`)

| Setting | What it does |
|---------|--------------|
| `contact.whatsappNumber` / `whatsappDisplay` | WhatsApp number used in every WhatsApp link |
| `contact.email` | Public email address. Leave empty to hide it everywhere. |
| `contact.phone` / `phoneDisplay` | Phone number for calls, e.g. `+254...`. Leave empty to hide it. |
| `form.enabled` | `true` shows the enquiry form; `false` shows a WhatsApp message instead |
| `form.recipient` | Inbox that receives enquiries |
| `form.fromAddress` | Sender address used for enquiry emails |
| `analytics.ga4Id` | Google Analytics 4 measurement ID (`G-...`) |
| `analytics.googleAdsId` | Google Ads tag ID (`AW-...`) |
| `analytics.adsContactConversionLabel` | Google Ads conversion label for WhatsApp, email and phone clicks |
| `analytics.adsLeadConversionLabel` | Google Ads conversion label for enquiry form submissions |

Analytics code is only added to the site when an ID is filled in.

## Logo

Until a logo file is added, the site shows a text version of the logo in the brand colours.
To use the real logo, add it as **`src/static/assets/img/logo.svg`** (best) or **`logo.png`**
(transparent background, at least 400px wide). It will be used in the header and footer automatically.

## KrishaSure images

The KrishaSure page (`/krishasure/`) picks up images from `src/static/assets/img/krishasure/`
automatically. Use these file names (svg, png, webp or jpg):

| File | Where it appears |
|------|------------------|
| `logo.*` | The KrishaSure logo, used as-is (currently `logo.webp`, converted from the supplied PDF) |
| `dashboard.*` | Screenshot in the KrishaSure hero (replaces the large logo there) |
| `ai_assistant.*` | Screenshot in the AI assistance section |
| `client_portal.*` | Screenshot under "How it works for an MSP" |

Missing screenshots are simply left out, so the page never shows empty placeholders.

**KrishaSure copy rules:** only describe features that are built. Not built, so never claim:
WhatsApp or SMS alerts, Microsoft / Office 365 sign-in, bulk user import, internal-only notes,
built-in ERP integration, per-client reports in the dashboard, a mobile app, or any uptime,
security or certification promise. Don't name customers or name the AI provider ("an AI assistant").

## Team photos

The founder section on the About page uses `src/static/assets/img/team/khushboo.*`
(webp, jpg or png; a portrait photo, cropped to 4:5). Until it exists, the initials "KR" are shown.

## Enquiry form

The form posts to `/api/contact.php`, which validates it, applies spam protection
(a hidden honeypot field, a minimum time to fill in, a limit of 5 messages per hour per visitor and a cap on links)
and sends the enquiry by email using the hosting's PHP mail function.

To switch it on:

1. Set `form.recipient` to the inbox that should receive enquiries. With `form.testPage` set to `true`,
   the form appears only on the private page `/contact/form-test/` so delivery can be tested;
   set `form.enabled` to `true` to show it on `/contact/` (and remove `testPage` afterwards).
2. So that Microsoft 365 trusts emails sent by the website, add the HostAfrica server to the domain's
   SPF record in GoDaddy DNS: edit the TXT record that starts with `v=spf1` and add `ip4:102.68.98.222`
   to it. The record was `v=spf1 include:secureserver.net -all`; with the server added it reads
   `v=spf1 ip4:102.68.98.222 include:secureserver.net -all`.
   Keep everything else in the existing record exactly as it is, and change only this one TXT record.
3. Deploy, send a test enquiry, and confirm it arrives in the inbox (check Junk as well).

**Sending through Resend (recommended).** If the GitHub secret `RESEND_API_KEY` is set, enquiries are
sent through Resend (krishasolutions.net is verified there), which signs them so Microsoft 365 trusts
them. If Resend can't be reached, the form falls back to the hosting server's mail. The key is only
used at deploy time and is never stored in the repository.

## Deployment

Every push to `main` builds the site, checks it, and uploads `dist/` to HostAfrica over FTPS
(`.github/workflows/deploy.yml`). It can also be run from the **Actions** tab → **Deploy to HostAfrica** → **Run workflow**.
Only changed files are uploaded, and files removed from the site are removed from the server.

Pull requests are built and checked without deploying (`.github/workflows/check.yml`).

GitHub settings used (**Settings → Secrets and variables → Actions**):

| Name | Type | Value |
|------|------|-------|
| `FTP_SERVER` | Secret | `da40.host-ww.net` |
| `FTP_USERNAME` | Secret | DirectAdmin / FTP username |
| `FTP_PASSWORD` | Secret | DirectAdmin / FTP password |
| `FTP_SERVER_DIR` | Variable | `domains/krishasolutions.net/public_html/` (main login) or `./` (FTP account limited to `public_html`) |
| `FTP_PROTOCOL` | Variable (optional) | `ftp` only if the secure connection fails |

## Working locally

Requires Node.js 18+ (and PHP to try the form).

```sh
node build.mjs                        # build into dist/
node scripts/check.mjs                # check links and SEO tags
php -S 127.0.0.1:8080 -t dist         # preview at http://127.0.0.1:8080
```

Browser tests need Playwright (`npm install --no-save playwright && npx playwright install chromium`):

```sh
KS_FORM_TEST=1 node build.mjs && node scripts/browser-test.mjs
```

`KS_FORM_TEST=1` builds the site with the form switched on and a test inbox. Emails are written to a local file, never sent.
