// Chromium runs every case. WebKit retains every functional scenario and a
// representative layout matrix: all locales, narrow dark and desktop light.
// Mark the remaining layout permutations instead of skipping them at runtime,
// so reports and --list show only cases that will actually run in each project.
export const chromiumOnlyTag = '@chromium-only';

export function layoutCoverage({ width, theme, webkitBoundary = false }) {
  const representative = theme === undefined
    ? width === 320 || width === 1440
    : (width === 320 && theme === 'dark') || (width === 1440 && theme === 'light');
  return { tag: representative || webkitBoundary ? [] : [chromiumOnlyTag] };
}
