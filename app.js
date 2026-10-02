// Case links open the matching native disclosure. Summaries work without JS.
function openLinkedCase({ focus = false } = {}) {
  const target = document.getElementById(window.location.hash.slice(1));
  if (!(target instanceof HTMLDetailsElement)) return;
  target.open = true;
  if (focus) target.querySelector('summary')?.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start' });
}
window.addEventListener('hashchange', () => openLinkedCase({ focus: true }));
document.querySelectorAll('.case-link').forEach((link) => {
  link.addEventListener('click', () => {
    if (link.hash === window.location.hash) openLinkedCase({ focus: true });
  });
});
const switcher = document.querySelector('.language-switcher');
if (switcher) {
  const links = [...switcher.querySelectorAll('a[data-language]')];
  const language = document.documentElement.lang;
  const preferenceKey = 'portfolio-language';
  const remember = (code) => { try { localStorage.setItem(preferenceKey, code); } catch { /* Storage is optional. */ } };
  let preferred;
  try { preferred = localStorage.getItem(preferenceKey); } catch { /* Private browsing may block storage. */ }
  const explicit = new URLSearchParams(location.search).get('lang');
  const returnLink = links.find((link) => link.dataset.language === preferred);
  if (language === 'en' && !explicit && preferred !== 'en' && returnLink) {
    const destination = new URL(returnLink.href);
    destination.search = location.search;
    destination.hash = location.hash;
    location.replace(destination.href);
  } else {
    // A direct localized URL or an explicit English choice wins over memory.
    remember(language);
    const preserveSection = () => {
      for (const link of links) {
        const destination = new URL(link.href);
        destination.hash = location.hash;
        link.href = destination.href;
      }
    };
    preserveSection();
    window.addEventListener('hashchange', preserveSection);
    for (const link of links) link.addEventListener('click', () => remember(link.dataset.language));
    const navigationLinks = [...document.querySelectorAll('.site-nav a')];
    const syncCoveredNavigation = () => {
      const menu = switcher.open ? switcher.querySelector('.language-list').getBoundingClientRect() : null;
      for (const link of navigationLinks) {
        const rect = link.getBoundingClientRect();
        // Preserve the visual overlay, but do not tab into partially covered
        // links. Uncovered navigation stays usable; closing restores all links.
        link.inert = Boolean(menu && rect.left < menu.right && rect.right > menu.left && rect.top < menu.bottom && rect.bottom > menu.top);
      }
    };
    switcher.addEventListener('toggle', syncCoveredNavigation);
    window.addEventListener('resize', syncCoveredNavigation);
    syncCoveredNavigation();
    document.addEventListener('click', (event) => { if (!switcher.contains(event.target)) switcher.open = false; });
    switcher.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        switcher.open = false;
        switcher.querySelector('summary').focus();
      }
    });
  }
}
openLinkedCase();
