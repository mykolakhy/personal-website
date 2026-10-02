import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function triggerDeployment(value, fetcher = fetch) {
  if (!value) throw new Error('CLOUDFLARE_DEPLOY_HOOK is not configured.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid deploy hook.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'api.cloudflare.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/client\/v4\/pages\/webhooks\/deploy_hooks\/[a-zA-Z0-9-]+$/.test(url.pathname)) throw new Error('Invalid deploy hook.');
  // Never log the URL, response body, or a fetch error containing credentials.
  try {
    const response = await fetcher(url.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok || (await response.json()).success !== true) throw new Error();
  } catch { throw new Error('Cloudflare did not confirm the deployment trigger. Check its dashboard before retrying.'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await triggerDeployment(process.env.CLOUDFLARE_DEPLOY_HOOK); console.log('Cloudflare accepted the main-branch deployment trigger.'); }
  catch { console.error('Deployment trigger failed. Check CLOUDFLARE_DEPLOY_HOOK and the Cloudflare dashboard.'); process.exitCode = 1; }
}
