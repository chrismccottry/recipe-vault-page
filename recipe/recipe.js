/*
 * One dish's screen, reached from a photo tile or from a レシピを見る button in
 * the chat. Plan: Phase 3 step 3, "Remy-style layout, video link, 買い物リストに
 * 追加. Nutrition one small 目安 line. No serving adjuster."
 *
 * Mounted by the shell router at #/r/<slug>. Everything visual comes from
 * Direction C's .rC rules in page/design/variants.html, which stays the comp,
 * and every colour comes from tokens.css.
 *
 * Two fields the screen deliberately does NOT invent:
 *   - Section labels are bilingual on only 6 of 42 distinct values, so English
 *     mode shows a Japanese label most of the time. That is the data. Inventing
 *     translations would break the doctrine rule against a design pass adding
 *     claims the content did not have.
 *   - The thumbnail keeps the creator's burnt-in text. Chris's wife chose that on
 *     2026-09-20 against both agents' advice, because the text is how she
 *     recognises the dish. So: no crop, no mask, no overlay, no forced ratio.
 */

import { getRecipe, indexRow, addDish, errorText, isBenign } from '../shell/api.js';
import { t, pair, pick, bilingual, minutes, getLang } from '../shell/i18n.js';
import { el, fill, showLoading, backLink, screenTitle, setLede, setTitle }
  from '../shell/ui.js';
import { hrefButton, hrefHome } from '../shell/router.js';

/* Guards against a reply landing after the router has moved to another screen. */
let token = 0;

export function unmount() { token += 1; }

export async function mount(outlet, params) {
  const mine = ++token;
  const slug = (params && params.slug) || '';

  // Clear the previous dish's cook and tab title first. Without this a failed
  // load leaves the last recipe's cook sitting under the wordmark, so the error
  // screen reads as belonging to a dish she is no longer looking at.
  setLede('');
  setTitle('');

  showLoading(outlet, t('レシピを読み込み中…', 'Loading the recipe…'));

  // Thrown, not caught. Since shell commit 9ba72d3 the router's error screen
  // carries its own way out, so catching here would only stack a second exit on
  // top of the shell's. getRecipe is memoised in api.js as of the same commit,
  // which is what makes a language switch cost no network.
  const [recipe, row] = await Promise.all([getRecipe(slug), indexRow(slug)]);
  if (mine !== token) return;

  draw(outlet, slug, recipe, row);
}

function draw(outlet, slug, recipe, row) {
  const title = row ? pick(row, 'title') : slug;
  const cook = (row && row.cook) || '';
  const servings = (row && row.servings) || '';

  setTitle(title);
  setLede(cook);

  const parts = [];

  /* ---- back to the button this dish sits under ---- */
  parts.push(row && row.button
    ? backLink(hrefButton(row.button), row.button)
    : backLink(hrefHome(), t('レシピさん', 'Recipe list')));

  /* ---- title and cook ---- */
  parts.push(screenTitle(title, cook));

  /* ---- the photo, untouched ---- */
  if (row && row.thumb) {
    parts.push(el('img', {
      class: 'recipe-hero',
      src: row.thumb,
      alt: title,
      decoding: 'async'
    }));
  }

  /* ---- time, servings, tags ---- */
  const meta = [];
  if (row && row.time_minutes) meta.push(minutes(row.time_minutes));
  if (servings) meta.push(t(servings + '人分', 'serves ' + servings));
  for (const tag of (row && row.page_tags) || []) meta.push(tag);
  if (meta.length) {
    parts.push(el('p', { class: 'recipe-meta' },
      meta.map(m => el('span', { text: m }))));
  }

  /* ---- the video, or whatever the source is for the one web recipe ---- */
  const link = videoHref(recipe);
  if (link) {
    parts.push(el('a', {
      class: 'recipe-video',
      href: link,
      target: '_blank',
      rel: 'noopener noreferrer'
    }, recipe.video_id
      ? t('レシピ動画を見る', 'Watch the video')
      : t('元のレシピを見る', 'Open the original recipe')));
  }

  /* ---- ingredients ---- */
  parts.push(sectionPill(servings
    ? t('材料（' + servings + '人分）', 'Ingredients (serves ' + servings + ')')
    : t('材料', 'Ingredients')));
  parts.push(...ingredients(recipe.ingredients || []));

  /* ---- the shopping button, its status line, and the 目安 line ---- */
  parts.push(...shoppingButton(slug));
  const est = estimateLine(recipe);
  if (est) parts.push(el('p', { class: 'recipe-est', text: est }));

  /* ---- method ---- */
  const steps = recipe.steps || [];
  if (steps.length) {
    parts.push(sectionPill(t('作り方', 'Method')));
    parts.push(el('ol', { class: 'recipe-steps' },
      steps.map((s, i) => el('li', { class: 'recipe-step' },
        el('b', { 'aria-hidden': 'true', text: String(i + 1) }),
        el('p', { text: pair(s) })
      ))
    ));
  }

  fill(outlet, parts);
}

/* ---------- pieces ---------- */

function sectionPill(text) {
  return el('h2', { class: 'recipe-sect', text });
}

function videoHref(recipe) {
  if (recipe.video_id) return 'https://www.youtube.com/watch?v=' + recipe.video_id;
  const src = (recipe.source || '').trim();
  return /^https?:\/\//.test(src) ? src : '';
}

/**
 * Ingredients in table order, split into the sections the cards themselves use.
 * `group` is sticky: a run of rows sharing one label is one section. Rows with no
 * label form the opening section and get no heading.
 *
 * A `fresh: false` row is a pantry row under the household rule, drawn quieter,
 * exactly as .rC li.p does in the comp. Those rows are also the ones the server
 * leaves out of the shopping list, which is what the note under the button says.
 */
function ingredients(rows) {
  const sections = [];
  for (const ing of rows) {
    const label = ing.group || '';
    const last = sections[sections.length - 1];
    if (!last || last.label !== label) sections.push({ label, rows: [ing] });
    else last.rows.push(ing);
  }

  return sections.map(sec => el('section', { class: 'recipe-ing-sect' },
    sec.label ? el('h3', { class: 'recipe-ing-head', text: bilingual(sec.label) }) : null,
    el('ul', { class: 'recipe-ing' }, sec.rows.map(row))
  ));

  function row(ing) {
    const amount = bilingual(ing.amount);
    return el('li', { class: ing.fresh ? 'recipe-row' : 'recipe-row is-pantry' },
      el('span', { class: 'recipe-name' },
        pair(ing),
        // One row in the whole vault carries this: pot-au-feu's 牛すね肉, the
        // single deliberate substitute behind the plan's 98% match. Dropping it
        // would hide the one case that measurement was careful about.
        // ※ marks it as an aside in both languages. The note itself is stored in
        // English only on the one card that has it, and it is left as written:
        // translating it here would be inventing content, and recipes/ is not
        // this screen's to edit.
        ing.substitute_note
          ? el('small', { class: 'recipe-note', text: '※ ' + ing.substitute_note })
          : null
      ),
      amount ? el('em', { text: amount }) : null
    );
  }
}

/**
 * 買い物リストに追加. Sends the slug only: api.gs's addDish expands the recipe's
 * `fresh` rows server-side, so this page cannot corrupt the shared list and a
 * card corrected in Obsidian reaches her without the site being republished.
 * Contract from the main session, which owns line/api.gs.
 */
function shoppingButton(slug) {
  const status = el('p', { class: 'recipe-status', role: 'status', 'aria-live': 'polite' });

  const button = el('button', {
    class: 'recipe-cta',
    type: 'button',
    onclick: add
  }, t('買い物リストに追加', 'Add to the shopping list'));

  /*
   * What goes on the list is what needs BUYING, not what is perishable. This
   * said 生鮮 until 2026-09-21, which is a different rule and a wrong one: the
   * household test is whether it needs a special trip, so カスリメティ and
   * コチュカル go on the list although they keep for months, while salt and soy
   * sauce off the rack stay off. See CLAUDE.md, ruled 2026-08-22 and refined
   * 2026-09-20; the data was made consistent with it in fa35127.
   *
   * 家にある is doing real work in the second sentence. Some seasonings DO reach
   * the list on their own, so "seasonings can be added from the list screen"
   * implied an exclusion that is not true. The ones she already has at home are
   * the ones the 調味料 drawer offers, which is what the list screen also says.
   *
   * Wording chosen by Chris on 2026-09-21 from three rendered options.
   */
  const note = el('p', {
    class: 'recipe-cta-note',
    text: t('リストに入るのは買う必要があるものだけです。家にある調味料はリストの画面で足せます。',
            'Only the things you need to buy go on the list. Seasonings you already have can be added from the list screen.')
  });

  async function add() {
    const mine = token;
    button.disabled = true;
    status.textContent = t('追加中…', 'Adding…');
    try {
      // addDish() sends the slug only and turns a bare 'unknown action' into the
      // clearer 'not-deployed', because api.gs has no addDish case in the
      // deployed script yet.
      await addDish(slug);
      if (mine !== token) return;
      settle(t('買い物リストに追加しました。', 'Added to the shopping list.'), true);
    } catch (err) {
      if (mine !== token) return;
      // The shell carries the wording for all fourteen of the gatekeeper's
      // refusals as of commit 30dae98, so nothing is hand-written here.
      //
      // isBenign() is true only for 'already on the list', which is not a
      // failure: the dish IS on the list, which is what she asked for, so it
      // settles in the same tone as a successful add. Every other refusal puts
      // the button back, including a full list, because clearing it is a real
      // way forward even though an immediate retry is not.
      settle(errorFor(err), isBenign(err));
    }
  }

  /*
   * done=true is the only final state. Every other outcome puts the button back,
   * because they are all things she can act on and retry: a full list can be
   * cleared on the list screen, and a network blip passes. Leaving it disabled
   * stranded her with no way to try again.
   */
  function settle(text, done) {
    status.textContent = text;
    status.dataset.tone = done ? 'done' : 'warn';
    if (done) {
      button.disabled = true;
      button.textContent = t('追加済み', 'On the list');
    } else {
      button.disabled = false;
    }
  }

  return [button, note, status];
}

/** The shell owns the wording for its ten refusals; reuse it rather than rewrite. */
function errorFor(err) {
  const msg = errorText(err);
  return msg[getLang()] || msg.ja;
}

/**
 * One small line, per the plan. Nutrition on the cards is estimated from the
 * ingredient list and never measured, so the line always carries 目安 and says
 * per serving, matching the cards' own wording in templates/card.md.
 */
function estimateLine(recipe) {
  const kcal = String(recipe.calories_est || '').trim();
  const protein = String(recipe.protein_est || '').trim();
  if (!kcal && !protein) return '';

  // Kept to one line, per the plan. 目安 is the cards' own word for an estimate
  // (templates/card.md line 45), so the label is carried without a second clause
  // that would wrap the line in two at phone width.
  if (getLang() === 'en') {
    const bits = [];
    if (kcal) bits.push('~' + kcal + ' kcal');
    if (protein) bits.push('~' + protein + ' g protein');
    return 'Per serving, estimated: ' + bits.join(', ');
  }
  const bits = [];
  if (kcal) bits.push('約' + kcal + 'kcal');
  if (protein) bits.push('たんぱく質約' + protein + 'g');
  return '1人分の目安　' + bits.join(' ／ ');
}
