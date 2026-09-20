/*
 * The ten button icons, taken from the chosen comp (the .vC grid in
 * page/design/variants.html) rather than redrawn, so the screen Chris picked is
 * the screen he gets.
 *
 * Thin monoline glyphs, stroked not filled, inheriting their colour from CSS.
 * Keyed by the exact button name in page-index.json. A button with no icon here
 * still renders, just without one, so a new button never breaks the grid.
 */

export const ICONS = {
  '鶏肉': '<path d="M9 4a4 4 0 0 1 7 2.5c0 2-1.5 3-1.5 4.5S16 13 16 15a4 4 0 0 1-7 2"/><path d="M9 17l-3.5 3.5M7 19l-1.5 1.5"/>',
  '豚肉': '<ellipse cx="12" cy="13" rx="8" ry="6"/><circle cx="12" cy="14" r="2"/><path d="M6 8l1.5 2M18 8l-1.5 2"/>',
  '粉もの': '<path d="M4 14h16M5 14a7 7 0 0 1 14 0"/><path d="M3 18h18"/><path d="M9 7c0-1.5 1-2 1.5-1s-.5 1.5 0 2.5"/>',
  '麺・ご飯': '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M6 8c1-1.5 3-1.5 4 0s3 1.5 4 0 3-1.5 4 0"/><path d="M3 19h18"/>',
  '牛肉': '<path d="M6 6h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h10"/><path d="M6 6l-2 3 2 3"/>',
  '魚介': '<path d="M3 12c3-4 7-5 10-5s6 2 8 5c-2 3-5 5-8 5s-7-1-10-5z"/><circle cx="8" cy="12" r=".7"/><path d="M21 12l-3-3v6z"/>',
  '野菜・サラダ': '<path d="M12 20V9"/><path d="M12 9c0-3 2-5 5-5 0 3-2 5-5 5z"/><path d="M12 13c0-3-2-5-5-5 0 3 2 5 5 5z"/>',
  '卵・豆腐・豆': '<ellipse cx="12" cy="13" rx="6" ry="8"/><circle cx="12" cy="14" r="2.5"/>',
  'スイーツ': '<path d="M5 20h14l-1-7H6z"/><path d="M6 13c0-3 2.5-5 6-5s6 2 6 5"/><path d="M12 8V5"/>',
  'ラム・その他': '<path d="M7 11a5 5 0 0 1 10 0v4a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3z"/><path d="M7 11c-2-1-2-4 0-5 1 1.5 1 3 0 5zM17 11c2-1 2-4 0-5-1 1.5-1 3 0 5z"/>'
};

/** An <svg> for a button, or null when the name is one we have no glyph for. */
export function icon(name) {
  const paths = ICONS[name];
  if (!paths) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths;
  return svg;
}
