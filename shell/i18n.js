/*
 * Language is a shell convention, not a screen at the end of the build.
 *
 * The plan lists "Japanese default, one-tap English switch" as Phase 3 step 5.
 * It is not being built as a step, because retrofitting it would mean one agent
 * editing every string inside directories it does not own. Instead: the shell
 * owns the mechanism and the switch, and each screen writes both languages in
 * its own files as it goes.
 *
 * Japanese is the default and stays the default.
 */

const KEY = 'recipesan-lang';
const listeners = new Set();
let lang = 'ja';

try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'en' || saved === 'ja') lang = saved;
} catch (e) { /* private browsing: fall back to Japanese */ }

export function getLang() { return lang; }

export function setLang(next) {
  if (next !== 'ja' && next !== 'en') return;
  if (next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, lang); } catch (e) { /* not fatal */ }
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
  listeners.forEach(fn => fn(lang));
}

/** Subscribe to the switch. Returns the unsubscribe function. */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The whole convention in one call: t('食材からえらぶ', 'Choose by ingredient'). */
export function t(ja, en) { return lang === 'en' && en != null ? en : ja; }

/**
 * A field that exists as base_ja / base_en on a row, the shape page-index.json
 * uses: pick(row, 'title'). Falls back to the other language rather than showing
 * a blank, because a missing English title should still leave something to read.
 */
export function pick(obj, base) {
  if (!obj) return '';
  const want = obj[base + '_' + lang];
  const other = obj[base + '_' + (lang === 'ja' ? 'en' : 'ja')];
  return want || other || '';
}

/**
 * An object already shaped { ja, en }, which is what steps and ingredient names
 * are in page-details.json.
 */
export function pair(obj) {
  if (!obj) return '';
  return (lang === 'en' ? obj.en || obj.ja : obj.ja || obj.en) || '';
}

/**
 * Ingredient amounts are one bilingual string joined by " / ", English first.
 * Measured across all 1437 ingredient rows on 2026-09-20: 1200 carry the
 * separator, 234 are a single string with no separator ("500 g", "1個"), and 3
 * are empty. All three cases have to work, so a string with no separator is
 * shown as-is in both languages and an empty one stays empty.
 *
 * The same split serves ingredient section labels, which are bilingual on only
 * 6 of the 42 distinct values, so English mode shows a Japanese section label
 * most of the time. That is the data, not a bug to paper over.
 */
export function bilingual(str) {
  const s = (str || '').trim();
  if (!s) return '';
  const at = s.indexOf(' / ');
  if (at === -1) return s;
  return lang === 'en' ? s.slice(0, at).trim() : s.slice(at + 3).trim();
}

/** Minutes as she reads them. 25 -> 25分 / 25 min. */
export function minutes(n) {
  const v = String(n || '').trim();
  if (!v) return '';
  return lang === 'en' ? v + ' min' : v + '分';
}

/** A count of dishes. 20 -> 20品 / 20 recipes. */
export function dishes(n) {
  const v = Number(n) || 0;
  return lang === 'en' ? v + (v === 1 ? ' recipe' : ' recipes') : v + '品';
}

/** Apply the stored language to <html> at boot, before the first screen draws. */
export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
}
