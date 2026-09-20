/*
 * Boot. Runs once, in this order:
 *   1. apply the saved language to <html> before anything draws
 *   2. wire the language switch in the top bar
 *   3. liff.init(), and sign in if LINE has not already done it
 *   4. translate a deep link into a route
 *   5. hand over to the router
 *
 * No screen runs before liff.init() resolves, so there is always a token to call
 * the gatekeeper with.
 */

import { LIFF_ID } from './config.js';
import { ApiError, useDevHandlers } from './api.js';
import { devRequested, devHandlers } from './dev.js';
import { applyLang, getLang, setLang, t, onLangChange } from './i18n.js';
import { showError, showLoading, el } from './ui.js';
import { start, hrefRecipe, hrefList } from './router.js';

const app = document.getElementById('app');
const outlet = document.getElementById('outlet');

function wireLangSwitch() {
  const btn = document.querySelector('.shell-lang');
  if (!btn) return;
  const paint = () => {
    // The button says the language it switches TO, which is the thing she is
    // looking for when she wants it.
    const to = getLang() === 'ja' ? 'en' : 'ja';
    btn.textContent = to === 'en' ? 'EN' : '日本語';
    btn.setAttribute('aria-label',
      to === 'en' ? 'Switch to English' : '日本語に切り替える');
  };
  btn.addEventListener('click', () => { setLang(getLang() === 'ja' ? 'en' : 'ja'); paint(); });
  paint();
}

/**
 * The shopping list link in the top bar. It is here rather than on the home
 * screen because she opens the list standing in a shop, not having walked
 * through home, so it has to be reachable from wherever she already is.
 *
 * On the list screen itself it stays put and stays live: aria-current marks it
 * as where she is, and a tap re-renders, which is how she re-reads a list the
 * other phone may have ticked. A control that vanishes on one screen is a
 * control she has to learn the rules of.
 */
function wireListLink() {
  const link = document.querySelector('.shell-list');
  if (!link) return;
  link.href = hrefList();
  const paint = () => {
    link.textContent = t('買い物リスト', 'Shopping list');
    if (location.hash.replace(/^#/, '') === '/list') link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  };
  addEventListener('hashchange', paint);
  onLangChange(paint);
  paint();
}

/*
 * A deep link from a chat bubble. レシピを見る on a recipe bubble opens
 *   https://liff.line.me/<liff-id>?r=<slug>
 * and lands on that dish instead of home. The agreement with the bot half is
 * plans/2026-09-21-deep-link-contract.md; do not change the shape here without
 * changing that file first.
 *
 * Two things decide the design, and both are easy to get backwards:
 *
 *  - A QUERY, not a fragment. LINE carries whatever follows the LIFF id through
 *    its own redirect in a liff.state parameter, and a fragment does not survive
 *    that hop reliably. A query does. The shell turns it into a hash route here,
 *    so the hash stays the only routing language inside the app.
 *
 *  - AFTER liff.init() has resolved, because resolving is what rewrites
 *    liff.state into a real query string on location.search. When that has not
 *    happened, slugFromLiffState() below reads the slug out of the raw
 *    liff.state itself.
 *
 * `r` is stripped from the URL on the way through, so a reload or a back press
 * cannot fire the same deep link a second time. A malformed slug boots home in
 * silence: a bad slug in a URL is not something she can do anything about, and
 * an error screen would only be in the way.
 */

/* The gatekeeper's own slug rule, line/api.gs:148. All 82 slugs pass it. */
const SLUG = /^[a-z0-9-]{1,120}$/;

/**
 * Amendment 1 to the contract, 2026-09-21: if `r` is not on the URL but a raw
 * liff.state is, read `r` out of that instead.
 *
 * liff.init is supposed to have expanded liff.state into the query before this
 * runs, and when it has, this never fires. It is here because the live test
 * window is a single pass on one phone after the publish, and a deep link that
 * quietly lands on home looks exactly like the feature not existing. A few
 * lines against an unobservable platform behaviour is a different thing from
 * coding around a wrong server shape, which Chris ruled against.
 */
function slugFromLiffState(params) {
  const raw = params.get('liff.state');
  if (!raw) return null;
  let state = raw;
  try { state = decodeURIComponent(raw); } catch (e) { /* use it as given */ }
  const q = state.indexOf('?');
  if (q === -1) return null;
  return new URLSearchParams(state.slice(q + 1)).get('r');
}

function applyDeepLink() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('r') !== null ? params.get('r') : slugFromLiffState(params);
  if (slug === null) return;                      // no deep link: home, as always

  // Both go, not just `r`. A surviving liff.state would fire again on a reload,
  // and when `r` won over a stale liff.state it would fire again for a
  // DIFFERENT dish, which is worse than firing twice for the same one.
  params.delete('r');
  params.delete('liff.state');
  const query = params.toString();
  const hash = SLUG.test(slug) ? hrefRecipe(slug) : location.hash;
  history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + hash);
}

async function boot() {
  applyLang();
  wireLangSwitch();
  wireListLink();
  showLoading(outlet, t('つないでいます…', 'Connecting…'));

  // Local preview: read the build files straight off the dev server and never
  // touch LINE. Refuses to engage anywhere but localhost.
  if (devRequested()) {
    useDevHandlers(devHandlers());
    document.body.dataset.dev = '1';
    applyDeepLink();          // ?dev=1&r=<slug> exercises the same path, without LINE
    start(outlet);
    return;
  }

  try {
    await liff.init({ liffId: LIFF_ID });
  } catch (e) {
    console.error('liff.init failed:', e);
    showError(outlet, new ApiError('liff', e && e.message));
    return;
  }

  // Inside LINE this has already happened. Outside it, in Safari or on a laptop, LIFF
  // sends her through LINE's login and comes back. Phase 0 proved both routes.
  if (!liff.isLoggedIn()) { liff.login(); return; }

  applyDeepLink();
  start(outlet);
}

boot();
