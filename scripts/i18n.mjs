import { githubEnglish, renderGithub } from './github-section.mjs';
import { aiEnglish, renderAIStats } from './ai-section.mjs';
import { claudeEnglish, renderClaudeStats } from './claude-section.mjs';

export const languages = [
  { code: 'en', label: 'English', short: 'EN', path: '' },
  { code: 'uk', label: 'Українська', short: 'UA', path: 'uk/' },
  { code: 'it', label: 'Italiano', short: 'IT', path: 'it/' },
  { code: 'de', label: 'Deutsch', short: 'DE', path: 'de/' },
];
export const translationFiles = languages.slice(1).map(({ code }) => `locales/${code}.json`);
export const pages = [
  { key: 'home', path: '', source: 'index.html' },
  { key: 'projects', path: 'projects/', source: 'pages/projects.html' },
  { key: 'ai', path: 'ai/', source: 'pages/ai.html' },
];
export const pageTemplateFiles = pages.slice(1).map(page => page.source);
export const generatedPages = languages.flatMap(({ path }) => [...pages.map(page => `${path}${page.path}index.html`), `${path}404.html`]);
export const escapeHTML = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const interfaceEnglish = {
  ...githubEnglish,
  ...aiEnglish,
  ...claudeEnglish,
  'language.label': 'Change language',
  'theme.light': 'Switch to light theme',
  'theme.dark': 'Switch to dark theme',
  'meta.projectsTitle': 'Projects — Mykola Khytra',
  'meta.projectsDescription': 'Public projects by Mykola Khytra: tools, source code, GitHub activity, and the tests behind this QA portfolio.',
  'meta.aiTitle': 'AI-assisted QA — Mykola Khytra',
  'meta.aiDescription': 'How Mykola Khytra uses Claude Code and Codex for QA, with separate activity snapshots for ChatGPT / Codex and Claude Code.',
  '404.title': 'Page not found — Mykola Khytra',
  '404.heading': 'Page not found',
  '404.body': "This page does not exist. Let's get you back to the portfolio.",
  '404.link': 'Back to the homepage',
};

export function readCatalogs(template, sources) {
  const templates = [template, ...pageTemplateFiles.map(file => {
    if (!sources.has(file)) throw new Error(`Missing page template: ${file}`);
    return sources.get(file).toString('utf8');
  })].join('\n');
  const keys = new Set([...templates.matchAll(/data-i18n(?:-content|-alt|-aria-label)?="([\w.-]+)"/g)].map((m) => m[1]));
  for (const key of Object.keys(interfaceEnglish)) keys.add(key);
  const catalogs = new Map([['en', interfaceEnglish]]);
  for (const { code } of languages.slice(1)) {
    const catalog = JSON.parse(sources.get(`locales/${code}.json`).toString('utf8'));
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new Error(`Invalid ${code} catalog`);
    for (const key of keys) {
      if (typeof catalog[key] !== 'string' || !catalog[key].trim()) throw new Error(`Missing ${code} translation: ${key}`);
    }
    for (const key of Object.keys(catalog)) {
      if (!keys.has(key)) throw new Error(`Unknown ${code} translation: ${key}`);
    }
    catalogs.set(code, catalog);
  }
  return catalogs;
}

export function languageSwitcher(code, prefix, catalog = interfaceEnglish, pagePath = '') {
  const current = languages.find((language) => language.code === code);
  return `<details class="language-switcher">
        <summary><span class="sr-only">${escapeHTML(catalog['language.label'])}: </span><span lang="en">${current.short}</span><span class="sr-only" lang="${code}"> — ${current.label}</span><span aria-hidden="true">⌄</span></summary>
        <ul class="language-list">${languages.map((language) => `
          <li><a href="${prefix}${language.path}${pagePath}${language.code === 'en' ? '?lang=en' : ''}" lang="${language.code}" hreflang="${language.code}" data-language="${language.code}"${code === language.code ? ' aria-current="page"' : ''}>${language.label}</a></li>`).join('')}
        </ul>
      </details>`;
}

export function themeToggle(catalog = interfaceEnglish) {
  const light = escapeHTML(catalog['theme.light']);
  const dark = escapeHTML(catalog['theme.dark']);
  return `<button class="theme-toggle" type="button" hidden aria-label="${light}" data-label-light="${light}" data-label-dark="${dark}">
        <svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
        <svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" /></svg>
      </button>`;
}

export function renderPage(template, code, catalog = interfaceEnglish, githubSnapshot = null, aiSnapshot = null, { page: pageKey = 'home', sources, claudeSnapshot = null } = {}) {
  const language = languages.find((language) => language.code === code);
  if (!language) throw new Error(`Unsupported language: ${code}`);
  const page = pages.find(page => page.key === pageKey);
  if (!page) throw new Error(`Unsupported page: ${pageKey}`);
  const prefix = '../'.repeat((language.path + page.path).split('/').filter(Boolean).length) || './';
  let html = template;
  if (pageKey !== 'home') {
    if (!sources?.has(page.source)) throw new Error(`Missing page template: ${page.source}`);
    html = html.replace(/(<main id="main" tabindex="-1">)[\s\S]*?(<\/main>)/, (_, start, end) => `${start}\n${sources.get(page.source).toString('utf8')}  ${end}`);
  }
  // Home uses responsive, CSS-only destinations: compact header links on
  // mobile and hero shortcuts on larger screens. DOM order matches tab order.
  html = html.replace('<!-- compact-page-navigation -->', pageKey !== 'home' ? '' : '<a class="compact-page-link" data-route="projects" href="./projects/"><span data-i18n="nav.projects">Projects</span><span aria-hidden="true">→</span></a><a class="compact-page-link" data-route="ai" href="./ai/"><span data-i18n="nav.ai">AI</span><span aria-hidden="true">→</span></a>');
  // Detail pages retain their current-page indicator and direct navigation.
  html = html.replace('<!-- secondary-page-navigation -->', pageKey === 'home' ? '' : '<a data-i18n="nav.projects" data-route="projects" href="./projects/">Projects</a><a data-i18n="nav.ai" data-route="ai" href="./ai/">AI</a>');
  html = html.replace('<html lang="en">', `<html lang="${code}" data-page="${pageKey}">`);
  if (code !== 'en') {
    // Only controlled leaf text and explicit attributes are translated. Catalog
    // values are plain text, never trusted markup; newlines become line breaks.
    html = html.replace(/<([\w-]+)([^>]*\bdata-i18n="([\w.-]+)"[^>]*)>[\s\S]*?<\/\1>/g,
      (_, tag, attributes, key) => `<${tag}${attributes}>${escapeHTML(catalog[key]).replaceAll('\n', '<br />')}</${tag}>`);
    html = html.replace(/<[^>]+data-i18n-(?:content|alt|aria-label)="[\w.-]+"[^>]*>/g, (element) =>
      element.replace(/\s(content|alt|aria-label)="[^"]*"/g, (attribute, name) => {
          const key = element.match(new RegExp(`data-i18n-${name}="([\\w.-]+)"`))?.[1];
          return key ? ` ${name}="${escapeHTML(catalog[key])}"` : attribute;
        }));
    if (code === 'uk') html = html.replace('space-grotesk-latin-wght-normal.woff2', 'ibm-plex-sans-cyrillic-600-normal.woff2');
  }
  html = html.replaceAll('./assets/', `${prefix}assets/`).replaceAll('./styles.css', `${prefix}styles.css`).replaceAll('./app.js', `${prefix}app.js`).replaceAll('./theme.js', `${prefix}theme.js`);
  html = html.replace(/<a\b[^>]*\bdata-route="(home|projects|ai)"[^>]*>/g, (element, targetKey) => {
    const target = pages.find(page => page.key === targetKey);
    const original = element.match(/\bhref="([^"]*)"/)?.[1] ?? '';
    const hash = original.includes('#') ? original.slice(original.indexOf('#')) : '';
    const href = targetKey === pageKey && hash ? hash : `${prefix}${language.path}${target.path}${hash}`;
    return element.replace(/\bhref="[^"]*"/, `href="${href}"`).replace(/\sdata-route="[^"]*"/, '');
  });
  if (pageKey !== 'home') {
    const title = escapeHTML(catalog[`meta.${pageKey}Title`]);
    const description = escapeHTML(catalog[`meta.${pageKey}Description`]);
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/, () => `<title>${title}</title>`)
      .replace(/<meta\b[^>]*\bname="description"[^>]*>/, () => `<meta name="description" content="${description}" />`)
      .replace(/<meta\b[^>]*\bproperty="og:title"[^>]*>/, () => `<meta property="og:title" content="${title}" />`)
      .replace(/<meta\b[^>]*\bproperty="og:description"[^>]*>/, () => `<meta property="og:description" content="${description}" />`)
      .replace('property="og:type" content="profile"', 'property="og:type" content="website"');
    html = html.replace(new RegExp(`(<a[^>]*data-i18n="nav\\.${pageKey}"[^>]*)(>)`), '$1 aria-current="page"$2');
  }
  html = html.replace(/<!-- language-switcher -->[\s\S]*?<!-- \/language-switcher -->/, () => languageSwitcher(code, prefix, catalog, page.path));
  html = html.replace(/<!-- theme-toggle -->[\s\S]*?<!-- \/theme-toggle -->/, () => themeToggle(catalog));
  html = html.replace(/<!-- github-data -->[\s\S]*?<!-- \/github-data -->/, () => renderGithub(githubSnapshot, code, catalog));
  html = html.replace(/<!-- ai-data -->[\s\S]*?<!-- \/ai-data -->/, () => renderAIStats(aiSnapshot, code, catalog));
  html = html.replace(/<!-- claude-data -->[\s\S]*?<!-- \/claude-data -->/, () => renderClaudeStats(claudeSnapshot, code, catalog));
  // Markers are authoring-only; deployment needs no catalogs or client renderer.
  return html.replace(/\sdata-i18n(?:-content|-alt|-aria-label)?="[\w.-]+"/g, '');
}

export function renderNotFound(code, catalog, homeRoot = '/') {
  const language = languages.find((language) => language.code === code);
  const text = (key) => escapeHTML(catalog[key]);
  const home = escapeHTML(homeRoot + language.path);
  const root = escapeHTML(homeRoot);
  return `<!doctype html>
<html lang="${code}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#f7f8f2" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0b0e12" media="(prefers-color-scheme: dark)" />
  <meta name="robots" content="noindex, follow" />
  <title>${text('404.title')}</title>
  <link rel="icon" type="image/svg+xml" href="${root}assets/favicon.svg" />
  <script src="${root}theme.js?v=20261002-1"></script>
  <link rel="stylesheet" href="${root}styles.css?v=20261004-6" />
</head>
<body>
  <header class="site-header"><div class="container header-inner"><a class="wordmark" href="${home}">mykola<span>/</span>qa</a><div class="header-controls">${themeToggle(catalog)}</div></div></header>
  <main class="hero grid-texture"><div class="container hero-inner">
    <p class="eyebrow">${text('404.heading')}</p>
    <h1>404.</h1>
    <p class="hero-lede">${text('404.body')}</p>
    <div class="hero-actions"><a class="button button-primary" href="${home}">${text('404.link')} <span aria-hidden="true">→</span></a></div>
  </div></main>
</body>
</html>
`;
}
