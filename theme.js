// Runs before styles so a remembered choice is applied before the first paint.
(() => {
  const root = document.documentElement;
  const key = 'portfolio-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = (value) => value === 'light' || value === 'dark';
  let preferred;
  try { preferred = localStorage.getItem(key); } catch { /* Storage is optional. */ }
  if (!valid(preferred)) preferred = null;
  let button;
  const update = () => {
    const theme = preferred ?? (system.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.content = theme === 'dark' ? '#0b0e12' : '#f7f8f2';
    }
    if (button) {
      const label = theme === 'dark' ? button.dataset.labelLight : button.dataset.labelDark;
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  };
  update();
  system.addEventListener('change', update);
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    try { if (event.storageArea !== localStorage) return; } catch { return; }
    preferred = valid(event.newValue) ? event.newValue : null;
    update();
  });
  document.addEventListener('DOMContentLoaded', () => {
    button = document.querySelector('.theme-toggle');
    if (!button) return;
    update();
    button.hidden = false;
    button.addEventListener('click', () => {
      preferred = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preferred); } catch { /* Keep the in-page choice without storage. */ }
      update();
    });
  }, { once: true });
})();
