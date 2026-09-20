/*
 * The screen router. Hash routes, because GitHub Pages serves static files and
 * cannot rewrite /b/鶏肉 to the app.
 *
 *   #/            home: the ingredient grid and the cook row
 *   #/all         every recipe, unfiltered
 *   #/b/<button>  one ingredient button, e.g. #/b/%E9%B6%8F%E8%82%89
 *   #/c/<cook>    one cook
 *   #/r/<slug>    one recipe
 *   #/list        the shared shopping list
 *
 * Screens are loaded on demand. A screen whose directory does not exist yet
 * shows 準備中 instead of breaking the app, which is what lets three agents
 * build three screens at once.
 */

import { t, onLangChange } from './i18n.js';

const ROUTES = [
  { pattern: /^\/?$/,                 screen: 'home',   params: ()  => ({}) },
  { pattern: /^\/all$/,               screen: 'button', params: ()  => ({ button: null, cook: null }) },
  { pattern: /^\/b\/(.+)$/,           screen: 'button', params: (m) => ({ button: safeDecode(m[1]), cook: null }) },
  { pattern: /^\/c\/(.+)$/,           screen: 'button', params: (m) => ({ button: null, cook: safeDecode(m[1]) }) },
  { pattern: /^\/r\/([A-Za-z0-9-]{1,120})$/, screen: 'recipe', params: (m) => ({ slug: m[1] }) },
  { pattern: /^\/list$/,              screen: 'list',   params: ()  => ({}) }
];

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

/* ---------- link builders: nobody should hand-write a hash string ---------- */

export const hrefHome   = ()     => '#/';
export const hrefAll    = ()     => '#/all';
export const hrefButton = (name) => '#/b/' + encodeURIComponent(name);
export const hrefCook   = (name) => '#/c/' + encodeURIComponent(name);
export const hrefRecipe = (slug) => '#/r/' + slug;
export const hrefList   = ()     => '#/list';

/** Change screen. Same as setting location.hash, but says what it means. */
export function go(path) {
  if (location.hash === path) { render(); return; }
  location.hash = path;
}

/** What the hash says right now, matched to a route. */
export function current() {
  const raw = location.hash.replace(/^#/, '') || '/';
  for (const r of ROUTES) {
    const m = raw.match(r.pattern);
    if (m) return { screen: r.screen, params: r.params(m), path: raw };
  }
  return { screen: 'home', params: {}, path: '/' };
}

const loaded = new Map();   // screen name -> module, or null when it is not built yet
let mounted = null;         // the module currently on screen
let outlet = null;
let token = 0;              // guards against a slow import landing after a newer route

/** Pull in a screen module the first time it is needed. */
async function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  let mod = null;
  try {
    mod = await import('../' + name + '/' + name + '.js');
    addStyles(name);
  } catch (e) {
    console.warn('screen "' + name + '" is not built yet:', e && e.message);
    mod = null;
  }
  loaded.set(name, mod);
  return mod;
}

/** Each screen keeps its CSS beside its module: home/home.css, button/button.css. */
function addStyles(name) {
  const href = name + '/' + name + '.css';
  if (document.querySelector('link[data-screen="' + name + '"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.screen = name;
  document.head.appendChild(link);
}

/** The placeholder for a screen another agent has not landed yet. */
function notBuiltYet(el, name) {
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'shell-empty';
  const h = document.createElement('p');
  h.className = 'shell-empty-title';
  h.textContent = t('準備中', 'Not built yet');
  const p = document.createElement('p');
  p.className = 'shell-empty-note';
  p.textContent = t('この画面はまだできていません。', 'This screen is still being built.') + ' (' + name + ')';
  wrap.append(h, p);
  el.appendChild(wrap);
}

async function render() {
  const route = current();
  const mine = ++token;

  if (mounted && typeof mounted.unmount === 'function') {
    try { mounted.unmount(); } catch (e) { console.warn('unmount failed:', e); }
  }
  mounted = null;
  outlet.innerHTML = '';
  document.body.dataset.screen = route.screen;

  const mod = await load(route.screen);
  if (mine !== token) return;             // a newer route won while we waited

  if (!mod || typeof mod.mount !== 'function') { notBuiltYet(outlet, route.screen); return; }

  mounted = mod;
  try {
    await mod.mount(outlet, route.params);
  } catch (e) {
    if (mine !== token) return;
    console.error('screen "' + route.screen + '" failed to mount:', e);
    const { showError } = await import('./ui.js');
    showError(outlet, e, () => render(),
      route.screen === 'home' ? null : { href: hrefHome(), label: t('ホーム', 'Home') });
  }
}

/**
 * Start listening. Called once by main.js after liff.init() resolves, so no
 * screen ever runs before there is a token to call the gatekeeper with.
 */
export function start(outletEl) {
  outlet = outletEl;
  addEventListener('hashchange', () => { scrollTo(0, 0); render(); });

  // A language switch redraws the screen in place. Screens therefore do not each
  // subscribe: keep mount() cheap and idempotent, and lean on getIndex(), which
  // is memoised, so a redraw costs no network.
  onLangChange(() => {
    const y = scrollY;
    render().then(() => scrollTo(0, y));
  });

  render();
}
