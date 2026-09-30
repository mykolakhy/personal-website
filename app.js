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
openLinkedCase();
