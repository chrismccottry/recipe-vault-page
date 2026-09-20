/*
 * The one way the page talks to the gatekeeper (line/api.gs, deployed in the
 * レシピさん Apps Script project). No screen calls fetch() itself.
 *
 * Four actions are known to be deployed: recipes, recipe, list, add. The four
 * list mutations (addDish, removeDish, toggleRow, removeRow) are in the
 * repo's api.gs; whether they are DEPLOYED cannot be checked from here,
 * because the token and allowlist checks run before the action switch, so
 * every unauthenticated probe answers "not signed in" whatever action it
 * names.
 *
 * The POST goes out as text/plain on purpose. That keeps it a "simple" request,
 * so the browser sends no CORS preflight, which is what made Phase 0 work from
 * GitHub Pages. Do not switch it to application/json.
 */

import { LIFF_ID, API_URL } from './config.js';

/** Every refusal the gatekeeper can return, read from line/api.gs on 2026-09-20. */
const ERROR_CODES = {
  'bad json':                            'bad-request',     // api.gs:22
  'not signed in':                       'not-signed-in',   // api.gs:28
  'not on the family list':              'not-allowed',     // api.gs:31
  'unknown action':                      'unknown-action',  // api.gs:39
  'page-index.json not on Drive':        'data-missing',    // api.gs:100
  'page-index.json is not valid JSON':   'data-corrupt',    // api.gs:102
  'bad slug':                            'bad-slug',        // api.gs:114
  'page-details.json not on Drive':      'data-missing',    // api.gs:119
  'page-details.json is not valid JSON': 'data-corrupt',    // api.gs:121
  'no such recipe':                      'no-such-recipe',   // api.gs:125
  'already on the list':                 'already-on-list',  // api.gs:149
  'not on the list':                     'not-on-list',      // api.gs:179
  'no such row':                         'no-such-row',      // api.gs:185 and 192
  'list is full':                        'list-full'         // api.gs:110
};

export class ApiError extends Error {
  constructor(code, raw) {
    super(raw || code);
    this.name = 'ApiError';
    this.code = code;
    this.raw = raw || '';
  }
}

/**
 * What each failure says to the two people who use this. Japanese is what they
 * see; English is there because the whole page carries both.
 *
 * The four data-* cases are the ones that fire when a sync half-completes, and
 * they are the most likely to reach her in a kitchen, so they say what to do
 * rather than naming a file she has never heard of.
 */
const MESSAGES = {
  'not-signed-in':  { ja: 'ログインし直してください。', en: 'Please sign in again.' },
  'not-allowed':    { ja: 'このページは家族専用です。', en: 'This page is for the family only.' },
  'no-such-recipe': { ja: 'そのレシピが見つかりません。', en: 'That recipe could not be found.' },
  'bad-slug':       { ja: 'そのレシピが見つかりません。', en: 'That recipe could not be found.' },
  'data-missing':   { ja: 'レシピの置き場所が見つかりません。Chrisに同期をお願いしてください。',
                      en: 'The recipe data is not on Drive. Ask Chris to run the sync.' },
  'data-corrupt':   { ja: 'レシピのデータが壊れています。Chrisに同期をお願いしてください。',
                      en: 'The recipe data is damaged. Ask Chris to run the sync.' },
  'bad-request':    { ja: 'うまく送れませんでした。', en: 'The request could not be read.' },
  'unknown-action': { ja: 'うまく送れませんでした。', en: 'The request could not be read.' },
  'network':        { ja: 'つながりませんでした。電波を確かめて、もう一度。',
                      en: 'Could not connect. Check the signal and try again.' },
  'bad-reply':      { ja: '返事が読めませんでした。もう一度お試しください。',
                      en: 'The reply could not be read. Please try again.' },
  'not-deployed':   { ja: '買い物リストはまだつながっていません。',
                      en: 'The shopping list is not connected yet.' },
  'liff':           { ja: 'LINEとつながりませんでした。', en: 'Could not connect to LINE.' },
  'server':         { ja: 'うまくいきませんでした。もう一度お試しください。',
                      en: 'Something went wrong. Please try again.' },
  // Not a failure. From where she is standing the dish IS on the list and the
  // thing she wanted has happened, so screens should show this in the same tone
  // as a successful add. See isBenign(). Raised by the recipe screen's session.
  'already-on-list': { ja: 'すでにリストに入っています。', en: 'Already on the shopping list.' },
  'not-on-list':    { ja: 'その料理はリストにありません。', en: 'That dish is not on the list.' },
  'no-such-row':    { ja: 'その項目が見つかりません。', en: 'That item could not be found.' },
  // The 8000-byte state cap, which lands at about seven dishes. An immediate
  // retry does nothing, so it gets no retry button, but the control must go
  // back to enabled because clearing the list is a real way forward.
  'list-full':      { ja: 'リストがいっぱいです。いくつか消してからもう一度。',
                      en: 'The list is full. Clear a few items and try again.' }
};

/** The friendly pair for an error. Unknown errors fall back to the generic one. */
export function errorText(err) {
  const code = (err && err.code) || 'server';
  return MESSAGES[code] || MESSAGES.server;
}

/**
 * True when this "error" is really the outcome she wanted. Only 'already on the
 * list' qualifies: the dish is on the list, which is what she asked for. Style
 * it as success, not as a failure, or the button looks broken when nothing is.
 */
export function isBenign(err) { return !!err && err.code === 'already-on-list'; }

/** True when trying the same thing again could plausibly work. */
export function isRetryable(err) {
  const code = (err && err.code) || 'server';
  return code === 'network' || code === 'bad-reply' || code === 'server' ||
         code === 'data-missing' || code === 'data-corrupt';
}

function idToken() {
  try {
    return (typeof liff !== 'undefined' && liff.getIDToken && liff.getIDToken()) || '';
  } catch (e) {
    return '';
  }
}

/* Local preview only. See dev.js: it cannot engage off localhost. */
let devHandlers = null;
export function useDevHandlers(handlers) { devHandlers = handlers; }
export function isDev() { return devHandlers !== null; }

async function post(action, payload) {
  if (devHandlers) {
    const fn = devHandlers[action];
    // Throw, never return, the refusal shape: a returned {error} would sail past
    // every caller as if it had worked. Caught by a test on 2026-09-20.
    if (!fn) throw new ApiError('unknown-action', 'unknown action');
    const data = await fn(payload);
    if (data && data.error) throw new ApiError(ERROR_CODES[data.error] || 'server', data.error);
    return data;
  }

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, idToken: idToken() }, payload || {}))
    });
  } catch (e) {
    throw new ApiError('network', e && e.message);
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ApiError('bad-reply', text.slice(0, 300));
  }
  if (data && data.error) {
    throw new ApiError(ERROR_CODES[data.error] || 'server', data.error);
  }
  return data;
}

/**
 * Call the gatekeeper. Throws ApiError on every refusal; screens catch it and
 * hand it to showError(). Two recoveries are built in and neither ever loops:
 *   - one silent retry on a network blip, because Apps Script can be slow to wake
 *   - one re-login when the LINE token has expired, guarded by a session flag
 */
export async function api(action, payload) {
  try {
    return await post(action, payload);
  } catch (err) {
    if (err.code === 'network') {
      await new Promise(r => setTimeout(r, 600));
      return await post(action, payload);
    }
    if (err.code === 'not-signed-in' && !sessionStorage.getItem('recipesan-relogin')) {
      try {
        sessionStorage.setItem('recipesan-relogin', '1');
        if (typeof liff !== 'undefined' && liff.login) { liff.login(); return new Promise(() => {}); }
      } catch (e) { /* fall through and report the original refusal */ }
    }
    throw err;
  }
}

/* ---------- the four actions, as the shapes screens actually want ---------- */

let indexPromise = null;

/**
 * page-index.json: { generated, count, buttons[], cooks[], recipes[] }.
 * Memoised, so the home screen and the button screen share one round trip.
 * Everything the home grid, the cook row and the tile screen need is in here.
 */
export function getIndex() {
  if (!indexPromise) {
    indexPromise = api('recipes').catch(err => { indexPromise = null; throw err; });
  }
  return indexPromise;
}

/** Throw away the memoised index, so the next getIndex() re-reads. */
export function refreshIndex() { indexPromise = null; }

/**
 * One recipe's ingredients and steps, with slug and generated merged in.
 * The gatekeeper returns { slug, generated, recipe }; the recipe object's own
 * keys are ingredients, steps, source, video_id, protein_est, calories_est, so
 * nothing collides. Checked against page-details.json, all 82 rows.
 */
const recipeCache = new Map();

export async function getRecipe(slug) {
  const key = String(slug || '');
  if (recipeCache.has(key)) return recipeCache.get(key);
  const p = api('recipe', { slug: key })
    .then(env => Object.assign({ slug: env.slug, generated: env.generated }, env.recipe || {}))
    .catch(err => { recipeCache.delete(key); throw err; });
  recipeCache.set(key, p);
  return p;
}

/**
 * Throw away memoised recipes. mount() runs again on every language switch, so
 * without the memo a tap on EN costs a fresh round trip to Apps Script for a
 * recipe already in hand. Raised by the session building the recipe screen.
 */
export function refreshRecipes() { recipeCache.clear(); }

/** The index row for one recipe: title, cook, button, tags, time, servings, thumb. */
export async function indexRow(slug) {
  const idx = await getIndex();
  return (idx.recipes || []).find(r => r.slug === slug) || null;
}

/** The shared shopping list, reduced to the flat string array. getListData()
 *  returns the whole payload and is what the list screen reads. */
export async function getList() {
  const r = await api('list');
  return r.items || [];
}

/**
 * Add one hand-typed line and get the WHOLE list back: { items, dishes, rows }.
 * This is the one to call. A free line arrives as a row with slug null, so a
 * screen that draws from `rows` can redraw straight from the reply.
 *
 * Requested by the list screen's session, which was calling api('add') directly
 * because addToList() below hands back only the flat strings.
 */
export async function addItem(text) { return api('add', { item: text }); }

/**
 * The same call, reduced to the flat string array.
 *
 * Kept only for a caller that wants nothing else; `items` is the compatibility
 * half of the payload, there so page/phase0/index.html keeps working until the
 * list screen is published. New code should call addItem() and read `rows`.
 */
export async function addToList(item) {
  const r = await addItem(item);
  return r.items || [];
}

/**
 * Add a whole dish to the shared list by slug, letting the server expand its
 * fresh ingredients. This is the shape the recipe screen's 買い物リストに追加
 * button needs, and it is the agreed contract with the main session.
 *
 * The session that owns line/api.gs reports this deployed at 17:06 on
 * 2026-09-20, as Version 10 on the same deployment id. The repo's api.gs does
 * now carry the case (line 41), which is checkable; the DEPLOYMENT is not
 * checkable from here, because api.gs verifies the token and the allowlist
 * before it reaches the action switch, so every unauthenticated probe returns
 * 'not signed in' whatever action it names. A deployed addDish and a missing
 * one look identical without a real LINE token.
 *
 * So the 'not-deployed' rethrow below stays, as a safety net rather than as an
 * expectation. If the deployment is live it never fires. If it is not, the
 * button still says "the shopping list is not connected yet" instead of the
 * meaningless "the request could not be read". It costs nothing to keep.
 */
export async function addDish(slug) {
  try {
    return await api('addDish', { slug });
  } catch (err) {
    if (err.code === 'unknown-action') {
      throw new ApiError('not-deployed', 'api.gs answered unknown action for addDish');
    }
    throw err;
  }
}

/** Take a dish, and its rows, back off the shared list. */
export async function removeDish(slug) { return api('removeDish', { slug }); }

/**
 * Tick or untick one row. Row ids are strings like 'r7' and come back in every
 * response; never build one in the browser.
 */
export async function toggleRow(id) { return api('toggleRow', { id }); }

/** Delete one row outright. */
export async function removeRow(id) { return api('removeRow', { id }); }

/**
 * The whole shopping list: { items, dishes, rows }. `rows` is what the list
 * screen wants, each { id, ja, en, amount, slug, checked }, with slug null for
 * a hand-typed line. `items` is the old flat string array, still returned.
 */
export async function getListData() { return api('list'); }

export { LIFF_ID, API_URL };
