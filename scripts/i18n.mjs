export const languages = [
  { code: 'en', label: 'English', short: 'EN', path: '' },
  { code: 'uk', label: 'Українська', short: 'UA', path: 'uk/' },
  { code: 'it', label: 'Italiano', short: 'IT', path: 'it/' },
  { code: 'de', label: 'Deutsch', short: 'DE', path: 'de/' },
];
export const translationFiles = languages.slice(1).map(({ code }) => `locales/${code}.json`);
export const generatedPages = languages.flatMap(({ path }) => [`${path}index.html`, `${path}404.html`]);
export const escapeHTML = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const interfaceEnglish = {
  'language.label': 'Change language',
  '404.title': 'Page not found — Mykola Khytra',
  '404.heading': 'Page not found',
  '404.body': "This page does not exist. Let's get you back to the portfolio.",
  '404.link': 'Back to the homepage',
};

export function readCatalogs(template, sources) {
  const keys = new Set([...template.matchAll(/data-i18n(?:-content|-alt|-aria-label)?="([\w.-]+)"/g)].map((m) => m[1]));
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

export function languageSwitcher(code, prefix, catalog = interfaceEnglish) {
  const current = languages.find((language) => language.code === code);
  return `<details class="language-switcher">
        <summary><span class="sr-only">${escapeHTML(catalog['language.label'])}: </span><span lang="en">${current.short}</span><span class="sr-only" lang="${code}"> — ${current.label}</span><span aria-hidden="true">⌄</span></summary>
        <ul class="language-list">${languages.map((language) => `
          <li><a href="${prefix}${language.path}${language.code === 'en' ? '?lang=en' : ''}" lang="${language.code}" hreflang="${language.code}" data-language="${language.code}"${code === language.code ? ' aria-current="page"' : ''}>${language.label}</a></li>`).join('')}
        </ul>
      </details>`;
}

export function renderPage(template, code, catalog) {
  const language = languages.find((language) => language.code === code);
  if (!language) throw new Error(`Unsupported language: ${code}`);
  let html = template.replace('<html lang="en">', `<html lang="${code}">`);
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
    html = html.replaceAll('./assets/', '../assets/').replaceAll('./styles.css', '../styles.css').replaceAll('./app.js', '../app.js');
    if (code === 'uk') html = html.replace('space-grotesk-latin-wght-normal.woff2', 'ibm-plex-sans-cyrillic-600-normal.woff2');
  }
  html = html.replace(/<!-- language-switcher -->[\s\S]*?<!-- \/language-switcher -->/, languageSwitcher(code, code === 'en' ? './' : '../', catalog));
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
  <meta name="robots" content="noindex, follow" />
  <title>${text('404.title')}</title>
  <link rel="icon" type="image/svg+xml" href="${root}assets/favicon.svg" />
  <link rel="stylesheet" href="${root}styles.css" />
</head>
<body>
  <header class="site-header"><div class="container header-inner"><a class="wordmark" href="${home}">mykola<span>/</span>qa</a></div></header>
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
