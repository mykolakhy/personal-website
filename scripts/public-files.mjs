// An explicit deployment allowlist: adding files to the repo never publishes them.
export const publicFiles = [
  'index.html', 'styles.css', 'app.js', 'theme.js',
  'assets/favicon.svg', 'assets/social-preview.png',
  'assets/portrait-320.avif', 'assets/portrait-640.avif',
  'assets/portrait-320.webp', 'assets/portrait-640.webp', 'assets/portrait-640.jpg',
  'assets/fonts/space-grotesk-latin-wght-normal.woff2',
  'assets/fonts/jetbrains-mono-latin-wght-normal.woff2',
  'assets/fonts/jetbrains-mono-cyrillic-wght-normal.woff2',
  ...[400, 500, 600].map((weight) => `assets/fonts/ibm-plex-sans-latin-${weight}-normal.woff2`),
  ...[400, 500, 600].map((weight) => `assets/fonts/ibm-plex-sans-cyrillic-${weight}-normal.woff2`),
  ...['space-grotesk', 'jetbrains-mono', 'ibm-plex-sans'].map((name) => `assets/fonts/${name}-OFL.txt`),
  'assets/downloads/mykola-khytra-cv.pdf',
];

export function securityHeaders(scriptHashes = [], { webAnalytics = false } = {}) {
  const hashes = Array.isArray(scriptHashes) ? scriptHashes : [scriptHashes];
  // Cloudflare injects its own beacon at the edge. Allow only the beacon file
  // (including Cloudflare's versioned path), and only our production RUM endpoint.
  const beacon = webAnalytics ? ' https://static.cloudflareinsights.com/beacon.min.js https://static.cloudflareinsights.com/beacon.min.js/' : '';
  const connections = webAnalytics ? 'https://mykolakhytra.com/cdn-cgi/rum' : "'none'";
  return {
    'Content-Security-Policy': `default-src 'none'; script-src 'self'${hashes.map((hash) => ` '${hash}'`).join('')}${beacon}; style-src 'self'; img-src 'self'; font-src 'self'; connect-src ${connections}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-Frame-Options': 'DENY',
  };
}
