# Krisha Solutions website

Website for [krishasolutions.net](https://krishasolutions.net), hosted on HostAfrica (DirectAdmin).

## Structure

- `site/` – the website files. Everything in here is uploaded to the server.
- `.github/workflows/deploy.yml` – automatic deployment.

## Deployment

Every push to `main` uploads `site/` to HostAfrica over FTP using GitHub Actions.
It can also be run by hand from the **Actions** tab → **Deploy to HostAfrica** → **Run workflow**.

Only changed files are uploaded. Files deleted from `site/` are also deleted on the server.

### Setup (one time)

In GitHub: **Settings → Secrets and variables → Actions**.

**Secrets** (tab "Secrets"):

| Name | Value |
|------|-------|
| `FTP_SERVER` | FTP server hostname, e.g. `da40.host-ww.net` |
| `FTP_USERNAME` | FTP account username, e.g. `deploy@krishasolutions.net` |
| `FTP_PASSWORD` | FTP account password |

**Variables** (tab "Variables", optional):

| Name | Default | When to set it |
|------|---------|----------------|
| `FTP_SERVER_DIR` | `./` | Set to `domains/krishasolutions.net/public_html/` if using the main DirectAdmin login instead of a dedicated FTP account. Must end with `/`. |
| `FTP_PROTOCOL` | `ftps` | Set to `ftp` only if the secure connection fails. |
