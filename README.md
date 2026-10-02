# Mykola Khytra — personal website

**Live site: [mykolakhytra.com](https://mykolakhytra.com/)**

A framework-free QA portfolio built with HTML, CSS and vanilla JavaScript.
Fonts and images are self-hosted; there are no analytics, forms or runtime dependencies.

## Local development

Requires Node.js 24 or newer and npm. Run commands from the repository root.

```sh
npm ci --ignore-scripts
npm run dev
```

Open [127.0.0.1:4173](http://127.0.0.1:4173/). Reload the browser after editing
files; there is no hot reload. The server binds to loopback and serves only
allowlisted public files.

## Build and preview

```sh
npm run build
npm run preview -- --port 4174
```

Open [127.0.0.1:4174](http://127.0.0.1:4174/). The separate port lets dev and
preview run together; plain `npm run preview` uses port 4173.
Rebuild after source changes: preview serves the generated `dist/` files.

When `SITE_URL` is unset, the build is a non-indexable preview.
For a production build:

```sh
SITE_URL=https://mykolakhytra.com/ npm run build
```

Only `dist/` is deployment output. Production builds configure canonical/social
URLs, structured data and sitemap entries. All builds generate `robots.txt`,
`sitemap.xml`, `404.html` and security headers in `_headers`. The build rejects
symlinked sources and unexpected output files.

## Where to make changes

| Change | File or directory |
| --- | --- |
| Text, sections and links | [index.html](index.html) |
| Ukrainian, Italian and German translations | [locales/](locales/) |
| Layout, colors and responsive styles | [styles.css](styles.css) |
| Case-study links and language preference | [app.js](app.js) |
| Theme preference and switching | [theme.js](theme.js) |
| Images, fonts and downloadable CV | [assets/](assets/) |
| Deployment allowlist and security headers | [scripts/public-files.mjs](scripts/public-files.mjs) |
| Build and local server | [scripts/](scripts/) |
| Automated checks | [tests/](tests/) |

Keep claims evidence-based: distinguish personal contributions from team-scale
figures and CI-job improvements from whole-pipeline results. Keep experience,
availability and manual/automation/AI positioning accurate.

## Languages

English lives at `/`, Ukrainian at `/uk/`, Italian at `/it/` and German at `/de/`.
The native header selector works without JavaScript. With JavaScript it remembers
the selection locally and keeps the current section when switching languages.
On mobile the menu opens directly below its button, over navigation. With
JavaScript, covered links are temporarily non-interactive until the menu closes.
Direct localized links take priority over the saved preference; `/?lang=en`
explicitly selects English. No browser-language detection or tracking is used.

English copy is authored in `index.html`; `data-i18n` markers map to plain-text
keys in the three JSON catalogs. Update all catalogs when changing marked copy.
Use `\n` for heading line breaks, not HTML. Builds reject missing, empty or extra
translations before writing output, and do not publish the catalogs. Dev renders
localized pages directly; builds produce static HTML, localized 404s, canonical
URLs, language alternatives and a four-page sitemap. The CV stays in English.

## Appearance

Light and dark themes follow the device preference on the first visit. The header
button switches themes and remembers an explicit choice locally, across reloads,
languages and 404 pages. The choice is applied before the stylesheet to avoid a
flash of the wrong theme. Without JavaScript, the site still follows the device
preference and hides the inactive theme button. Blocked storage does not prevent
in-page switching; no theme preference is sent to a server.

## Assets

Optimized assets are committed, so normal builds do not need the original photo.
To replace the portrait, pass the path to a private source image stored outside
the repository:

```sh
npm run prepare:assets -- /absolute/path/to/photo.png
```

This regenerates portrait variants and local fonts, and renders
[assets/social-preview.svg](assets/social-preview.svg) as the PNG social preview.
Retain the font licenses in
`assets/fonts/`. Replacing the CV requires owner approval and updating its
fingerprint in [tests/site.test.mjs](tests/site.test.mjs). Add new public resources
to `scripts/public-files.mjs`.

## Verification

```sh
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
```

Install browser binaries on first setup and after Playwright upgrades.
Checks cover content/assets, build and server boundaries, Chromium/Firefox/WebKit,
responsive layouts at 320–1440 px, both themes, theme preference persistence,
accessibility, keyboard navigation, downloads, print, reduced motion and
no-JavaScript behavior. Automated checks are not a full
WCAG certification or real-device audit.

GitHub CI runs on PRs targeting `main` and their updates, on pushes to `main`,
and manually through **Actions → Website CI → Run workflow**. Pushes to working
branches alone do not trigger CI; open a PR or run it manually to check a branch.
The manual-run button becomes available once this workflow is on `main`.
Every run includes the full browser suite and a dependency audit. Both `quality`
and `browser-regression` must pass before merging. PRs use regular merge commits;
squash and rebase are disabled.
Reports/traces are public and retained for seven days; test only public content.

## Cloudflare Pages deployment

Merges to `main` deploy automatically through the GitHub integration.

- Repository: `mykolakhy/personal-website`; production branch: `main`.
- Framework preset: None; repository root: unchanged; output directory: `dist`.
- Build command: `npm ci --ignore-scripts && npm test && npm run build:pages`.
- Variables: `NODE_VERSION=24`, `SKIP_DEPENDENCY_INSTALL=1`,
  `SITE_URL=https://mykolakhytra.com/`.

Keep the Cloudflare GitHub app restricted to this repository.
Cloudflare supplies `CF_PAGES_BRANCH`. `build:pages` requires a valid production
URL on `main`; other branches remain non-indexable even if they inherit `SITE_URL`.
The generated `404.html` prevents the static site from falling back to the homepage
for missing paths.

After hosting changes, verify live HTTPS, redirects, security headers, metadata,
CV downloads and actual 404 responses. The local preview is not a full Cloudflare
emulator.

## Security

Do not commit credentials, private job-search notes or original photos.
Local reports, temporary files, dependencies and build output are ignored by Git
and excluded from deployment. See [SECURITY.md](SECURITY.md) for reporting and
repository protections.

Owner-only maintenance: with an authorized GitHub CLI session, reapply repository
protections using:

```sh
node scripts/configure-github.mjs --protect-main
```

This changes repository settings, not account security or visibility.

## Rights

Personal copy, photographs and branding remain the property of their owners.
Publishing this repository does not grant an open-source license.
Third-party fonts retain their included SIL OFL licenses.
