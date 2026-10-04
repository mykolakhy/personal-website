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
| Homepage, shared header/footer and links | [index.html](index.html) |
| Projects and AI page content | [pages/projects.html](pages/projects.html), [pages/ai.html](pages/ai.html) |
| Ukrainian, Italian and German translations | [locales/](locales/) |
| Layout, colors and responsive styles | [styles.css](styles.css) |
| Case-study links and language preference | [app.js](app.js) |
| Theme preference and switching | [theme.js](theme.js) |
| Public GitHub data and its collection/rendering | [data/github-stats.json](data/github-stats.json), [scripts/github-data.mjs](scripts/github-data.mjs), [scripts/github-section.mjs](scripts/github-section.mjs) |
| Aggregate ChatGPT/Codex activity | [data/ai-stats.json](data/ai-stats.json), [scripts/ai-data.mjs](scripts/ai-data.mjs), [scripts/ai-section.mjs](scripts/ai-section.mjs) |
| Aggregate local Claude Code activity | [data/claude-stats.json](data/claude-stats.json), [scripts/claude-data.mjs](scripts/claude-data.mjs), [scripts/claude-section.mjs](scripts/claude-section.mjs) |
| Images, fonts and downloadable CV | [assets/](assets/) |
| Deployment allowlist and security headers | [scripts/public-files.mjs](scripts/public-files.mjs) |
| Build and local server | [scripts/](scripts/) |
| Automated checks | [tests/](tests/) |

Keep claims evidence-based: distinguish personal contributions from team-scale
figures and CI-job improvements from whole-pipeline results. Keep experience,
availability and manual/automation/AI positioning accurate.

## Pages and languages

The homepage has seven sections: introduction, about, expertise, selected work,
experience, two compact page previews, and contact. Professional case disclosures
stay on the homepage. The projects page (`/projects/`) puts public repositories
before GitHub activity and site-verification details. The AI page (`/ai/`) contains
the practical workflow followed by separate ChatGPT/Codex and local Claude Code statistics. There is no placeholder
notes page; overlapping principles are covered by expertise, cases and the workflow.

All three pages share the same header/footer and produce static HTML in four
languages: twelve indexable pages, plus localized 404s. For example,
`/uk/projects/` and `/uk/ai/` are the Ukrainian detail pages. Navigation, assets,
downloads and back links are relative to their generated location, including
production sites hosted under a subpath. Each page has its own title, description,
canonical URL and same-page language alternatives.

On the homepage above 600px, the header links to Work and Contact. Projects and AI
are outlined hero buttons: stacked to the right above 1000px, or side by side
below the main actions at 601–1000px. At 600px and below, these buttons move to the
left of the header's second row, with Work and Contact on the right; duplicate
hero links are hidden. Detail pages retain all four header links and highlight
the current page. These links also work without JavaScript.

Old homepage links to `#github`, `#ai-workflow` and `#ai-activity` redirect to the
relocated content with JavaScript, preserving the language and query. Without
JavaScript they land on homepage previews with links to the full pages. The old
`#writing` link resolves to expertise with JavaScript; case-study URLs are unchanged.

English lives at `/`, Ukrainian at `/uk/`, Italian at `/it/` and German at `/de/`.
The native header selector works without JavaScript. With JavaScript it remembers
the selection locally and keeps the current page and section when switching languages.
On mobile the menu opens directly below its button, over navigation. With
JavaScript, covered links are temporarily non-interactive until the menu closes.
Direct localized links take priority over the saved preference; `/?lang=en`
explicitly selects English. No browser-language detection or tracking is used.

English copy is authored in `index.html`, `pages/`, `scripts/github-section.mjs` and `scripts/ai-section.mjs`; `data-i18n` markers map to plain-text
keys in the three JSON catalogs. Update all catalogs when changing marked copy.
Use `\n` for heading line breaks, not HTML. Builds reject missing, empty or extra
translations before writing output, and do not publish the catalogs. Dev renders
localized pages directly; builds produce static HTML, localized 404s, canonical
URLs, language alternatives and a twelve-page sitemap. Page fragments and catalogs
are build inputs, not public website routes. The CV stays in English.

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

## GitHub activity

The GitHub section is static HTML in all four languages and both themes. Visitors
do not call GitHub APIs; no token, raw snapshot or private repository metadata is
deployed. The existing `connect-src 'none'` policy is unchanged.

- Calendar: dates, counts and intensity levels visible on the GitHub profile
  **without signing in**, including anonymous private contributions already shared
  there. GitHub aligns its calendar to weeks (365–371 dates), so compare totals
  over the displayed range, not a separately calculated 365-day window.
- PR/review metrics: public contributions in currently public repositories in that
  range, collected separately. They are not a breakdown of the calendar total.
- Projects: an explicit allowlist (`personal-website`, `PixelKit`, `they-are-frogs`);
  private repositories are omitted. Copy is curated, not imported from API HTML.
- Monthly activity: twelve compact cards for the twelve most recent calendar
  months. The current month is marked partial; bars compare contribution volume.
  This view has its own calendar-month range, not the rolling-year calendar total.
- CI: the last completed push-triggered `ci.yml` run on `main`, with its date,
  commit and source link. This is not a live health/uptime indicator.

The calendar uses GitHub's HTML endpoint, which is not a versioned API. The
collector checks every date, tooltip, count and intensity against the displayed
total; an upstream format change fails the refresh instead of publishing partial
data. Private names, code, messages, paths and review bodies are never requested.
Manual QA and work outside GitHub are not captured by these metrics.

The committed `data/github-stats.json` is a validated offline baseline used by dev,
tests and previews. Update it using an authorized local GitHub CLI session:

```sh
npm run refresh:github -- --local
npm test
npm run build
```

`GitHub activity refresh` runs daily at 05:23 UTC (schedules may be delayed) or
manually on `main`. It validates/collects data, updates the `github-activity`
release asset, then requests a new Cloudflare build. It does not commit to `main`
or bypass branch protection. Only the publishing job has repository `contents:
write`; the standard repository-scoped `GITHUB_TOKEN` is not a personal token.
The data release is not a software version and is not marked as the latest release.

Daily deployment requires a Cloudflare Pages deploy hook restricted to `main`,
stored as the repository Actions secret **`CLOUDFLARE_DEPLOY_HOOK`**. Treat that URL
as a credential; do not commit it, log it or paste it into reports. No broad
Cloudflare API token is required. A missing hook fails deployment explicitly.

On Cloudflare production builds, `build:pages` reads the newer validated public
release asset without credentials. If it is unavailable or invalid, it retains the
dated baseline. Local/CI/preview builds stay offline and deterministic. The site
shows the snapshot timestamp; it is refreshed daily, not in real time.

## ChatGPT / Codex activity

The AI section contains five profile metrics and twelve monthly token-activity
cards, in all languages and both themes. Exact token counts are available to
screen readers and in each compact number's tooltip. There are no case studies,
inferred productivity gains, or invented session/completed-task counts.

The local collector uses the documented Codex App Server `account/usage/read`
method with the owner's existing local login. It does not read conversation
history or copy authentication files. The response is reduced to an exact
allowlist: summary values, twelve monthly totals, activity-day counts, source,
and collection timestamp. Additional service fields (including `threadUsage`)
are discarded. The snapshot is public, owner-approved data, not a private export.

Monthly counts sum only the daily buckets returned by the service. A month
without returned buckets has zero **reported** tokens; this does not prove
inactivity. An unavailable history or metric stays unavailable, not zero.
The current month is partial, lifetime totals use a different period, and the
longest task is elapsed task time, not human hours worked. Insights such as skills,
Fast Mode and reasoning are not included because the verified method does not
provide them. These figures cover only ChatGPT/Codex; Claude Code has a separate block.

Refresh locally with a supported, signed-in Codex CLI:

```sh
npm run refresh:ai
npm test
npm run build
```

Collection is never run by a hosted build or CI. Failed refreshes preserve the
previous snapshot, and no upstream errors, account identifiers, or credentials
are printed. `data/ai-stats.json` is a build input, not an exposed website route.
No OpenAI credentials belong in this repository, GitHub secrets, or Cloudflare.

After this feature is merged, an owner can explicitly publish an updated snapshot:

```sh
npm run publish:ai -- --confirm-publication
```

This uploads only validated aggregates to the public `ai-activity` release and
requests the existing main-branch GitHub refresh/Cloudflare deployment workflow.
It does not commit to `main`, bypass protections, or create a new account login.
The command itself does not install a scheduler. An owner-approved Codex desktop
automation can run the collection and publication locally; it requires the Mac
and app to be available. The configured owner schedule is daily at 23:30
Europe/Warsaw, with notifications for failed runs only. Scheduled runs use a
temporary main-branch checkout, never the owner's working files or a direct push.
Cloudflare production builds use a newer valid public asset when available,
otherwise the committed dated baseline. Dev, CI and preview builds stay offline.
Visitors never contact OpenAI, and `connect-src 'none'` is unchanged.

Official source: [Codex App Server](https://learn.chatgpt.com/docs/app-server).

## Local Claude Code activity

The AI page separately shows recorded sessions, active days, models, four distinct
token categories and twelve monthly session-start cards. Input, output, cache-read
and cache-creation counters are never combined with OpenAI's total. Active days
include ongoing-session activity, not just days when a session started.

`npm run refresh:claude` reads only the bounded, regular local
`~/.claude/stats-cache.json` aggregate file. Supported cache version: 5; unknown
versions, custom model identifiers, missing counters and invalid dates fail closed.
The collector does not launch Claude, recalculate its cache, read transcripts,
copy login files, or require an Anthropic API key. A stale cache stays visibly
dated: `computedThrough` is its last computed date, while `updatedAt` is import
time. The recorded period starts at the first-session date. Months before that
period are unavailable, not fabricated zero-activity months; partial months are
marked. This is one Mac's retained Claude Code activity, not all Claude.ai or
all-device account usage. Messages, session IDs, project paths, costs and unverified
duration counters are deliberately excluded.

Both providers can be published with one deployment request:

```sh
npm run refresh:ai
npm run refresh:claude
npm test
npm run build
npm run publish:ai -- --confirm-publication --include-claude
```

The publisher validates both snapshots before upload. Only `ai-stats.json` and
`claude-stats.json` aggregates reach the public `ai-activity` release; a single
main-branch workflow triggers Cloudflare. Production accepts newer valid snapshots
without credentials, refuses Claude coverage regression, and falls back to the
committed baseline on errors. Dev/CI/preview remain offline. Neither source JSON
nor collection scripts are deployed; visitors make no provider API requests.
The daily automation enables Claude after these scripts are merged into main,
preserving its existing schedule and failure-only notifications.

References: [Claude Code usage](https://code.claude.com/docs/en/costs),
[cache token categories](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
[Codex scheduled tasks](https://learn.chatgpt.com/docs/automations).

## Verification

```sh
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:browser
```

Install browser binaries on first setup and after Playwright upgrades.
Checks cover content/assets, build and server boundaries, Chromium and WebKit,
responsive layouts at 320–1440 px, both themes, theme preference persistence,
accessibility, keyboard navigation, downloads, print, reduced motion and
no-JavaScript behavior. Automated checks are not a full
WCAG certification or real-device audit. WebKit checks Safari's browser engine;
they are not a substitute for testing Safari on real Apple devices.

Chromium runs the full language/theme/viewport matrix. WebKit runs all functional
scenarios, plus representative layouts in every language (320px dark and 1440px
light), both sides of the 600px/1000px navigation breakpoints in Ukrainian and
the 800px about-section breakpoint. Layout tests without a theme parameter keep
both 320px and 1440px in WebKit; language-button state checks keep both mobile and
desktop widths in every language. Exact data, privacy assertions, keyboard,
no-JavaScript, print, theme/language persistence and delayed-style regressions
remain covered. Firefox is outside the current supported test matrix.

Layout permutations tagged `@chromium-only` are excluded during WebKit test
discovery, not reported as skipped or hidden by retries. The shared selection
policy is in `tests/browser/coverage.mjs`. Functional tests are untagged and run
in both engines. To inspect or run one engine:

```sh
npm run test:browser -- --list
npm run test:browser -- --project=chromium
npm run test:browser -- --project=webkit
```

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
