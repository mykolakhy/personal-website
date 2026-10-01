# Mykola Khytra - personal website

A small, framework-free portfolio: HTML, CSS and a progressive-enhancement script.
All visitor-facing assets are local; no analytics, external fonts, forms or runtime packages.

## Local development

Use Node.js 24 or newer.

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://127.0.0.1:4173/. The server binds to this computer only and serves an
explicit public-file allowlist. It does not expose Git, notes, original photos,
dependencies, scripts or directory listings. Reload after editing HTML/CSS/JS.

## Build and preview

```sh
npm run build
npm run preview
```

Only `dist/` is deployment output. A build without a production URL is a
non-indexable preview, with no invented canonical URL.

Before writing output, the build verifies every allowlisted source and snapshots
its bytes. Sources must be regular files: symbolic links, including linked parent
directories, are rejected. A missing or unsafe source leaves existing output
unchanged; private data cannot be copied through a linked public resource.

Before publishing, configure the real HTTPS address, including any subpath:

```sh
SITE_URL=https://your-actual-domain.example/ npm run build
```

The example is documentation, not a configured domain. A production build adds
canonical/Open Graph URLs, ProfilePage/Person structured data, robots.txt and a
sitemap. The output uses relative resource paths and works under a subdirectory.

`_headers` contains a CSP, no-sniff, frame protection, referrer and permissions
policies. Netlify/Cloudflare Pages can use that format; other hosts need equivalent
server configuration. The local preview applies those headers. Do not assume a
host honors this file: verify HTTPS, headers, compression, caching and 404 behavior
after deployment. No production host or deployment credentials are configured.

## Verification

```sh
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
```

Unit checks cover contrast tokens, links/assets, safe build output, image metadata,
production metadata and server boundaries. Browser checks cover Chromium, Firefox
and WebKit at nine widths (320-1440 px), axe scans, disclosures, keyboard/skip-link
behavior, PDF responses, reduced motion, print styles, resource budgets and the
no-JavaScript path. Automated axe checks do not certify WCAG compliance.

GitHub CI runs the same checks. Reports and failure traces are retained for seven
days; they are public, so test only the public portfolio, never private data.
The `quality` and `browser-regression` checks are required before merging.

## Content and assets

- Edit copy in `index.html`; claim team-scale figures as a shared ecosystem, not
  individually authored tests. Keep experience and availability current.
- Positioning spans manual, general and automation QA. Expertise precedes the
  automation case studies; the AI workflow describes confirmed uses of Claude Code
  and Codex without claiming AI-product/LLM expertise or measured AI speedups.
- New manual or AI case studies need a real task, personal contribution and
  supported outcome. Do not invent them to balance the existing automation cases.
- CI performance improvements covered many jobs, with speedups of up to four
  times, not all jobs or the whole delivery pipeline. The 60-to-15-minute reduction
  is a concrete result, not a promise of the same speedup for every job. Overnight
  regression maintenance covered roughly 30 of around 70 jobs; this is not a count
  of accelerated jobs.
- The shared repository served roughly 10-15 QA engineers, automation engineers
  and developers. TestRail-to-Testomat migration was independently completed by
  the owner. Do not publish coverage percentages without defining the metric.
- Fonts and their SIL OFL licenses are in `assets/fonts/`.
- Optimized portraits are metadata-free AVIF/WebP/JPEG files. The original PNG is
  deliberately ignored and never included in a build.
- `npm run prepare:assets -- /absolute/path/to/a/new-photo.png` regenerates
  optimized portraits, fonts and the social image. This is an optional maintainer
  command: clones build using the committed assets without needing the original.
- The downloadable CV is the owner's original two-page PDF, published with
  explicit approval and copied without changes. It contains business email/profile
  links, but no phone, street address or private job-search notes.
- When adding a resource, update `scripts/public-files.mjs` explicitly.
- `qa-artifacts/`, `tmp/` and `output/` are local-only. An unrelated existing
  Telegram workflow is ignored and has not been published.

## Repository protection

Public visibility was approved by the owner. `main` requires pull requests,
resolved conversations, up-to-date passing CI and a linear squash-only history;
force pushes/deletion are blocked without bypass actors. There is one owner, so
external reviewer approval is not required. Actions have read-only permissions,
SHA-pinned allowlisted actions and no deployment secrets.

Secret scanning/push protection, Dependabot alerts/security fixes and private
vulnerability reporting are enabled. Account 2FA is the owner's responsibility;
it has not been changed. See [SECURITY.md](SECURITY.md).

The owner can reapply repo settings using `node scripts/configure-github.mjs
--protect-main` with an authorized GitHub CLI session. That command is scoped to
`mykolakhy/personal-website` and does not change visibility or account settings.

## Rights

Personal copy, photographs and branding remain the property of their respective
owners. No open-source license is granted by publishing this repository.
Third-party fonts retain their included licenses.

See [the implementation milestones](docs/IMPLEMENTATION-PLAN.md).
