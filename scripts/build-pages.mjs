import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, productionURL } from './build.mjs';

export function pagesSiteURL(environment) {
  if (!environment.CF_PAGES_BRANCH) throw new Error('CF_PAGES_BRANCH is required for a Pages build.');
  // Setup can copy variables to both environments. Never give a preview branch
  // production metadata, even if SITE_URL is present there by mistake.
  if (environment.CF_PAGES_BRANCH !== 'main') return null;
  const url = productionURL(environment.SITE_URL);
  if (!url) throw new Error('SITE_URL is required for the main production branch.');
  return url.href;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await build({ siteURL: pagesSiteURL(process.env), refreshGithub: process.env.CF_PAGES_BRANCH === 'main' });
  console.log(`Built ${result.files} allowlisted files for Cloudflare Pages (${result.production ? 'production' : 'non-indexable preview'}).`);
}
