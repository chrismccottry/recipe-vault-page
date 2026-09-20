/*
 * The shared shopping list. Plan Phase 3 step 4: "今回の献立 (picked dishes,
 * removable), fresh ingredients with checkboxes and the dish they're for, a
 * collapsed 調味料 section to add from, a free 'add item' box. Shared and saved
 * online."
 *
 * Mounted by the shell router at #/list. Direction C throughout, every colour a
 * token from shell/tokens.css.
 *
 * THE SHAPE IS THE SERVER'S. Every mutating call returns the whole list back as
 * { items, dishes, rows }, so this screen re-renders from the reply and never
 * mutates a local copy. Two people share one list from two phones; a local copy
 * would drift the moment the other one adds something.
 *
 * `items` is the flat string array the Phase 0 page still reads. This screen
 * ignores it and reads `rows`, but it must keep arriving, because until the push
 * happens page/phase0/index.html is the only way either of them can see the list
 * at all — line/recipe-bot.gs has no shopping-list command.
 *
 * Two things this screen deliberately does not draw:
 *   - WHO added a dish. The server records it as `by`, a LINE user id. This
 *     directory is copied wholesale to a PUBLIC repository, so no code here goes
 *     near a user id, and with exactly two users the answer is nearly always
 *     obvious anyway.
 *   - A translated seasoning name. 調味料 rows come from the cards' own Japanese,
 *     and inventing English for them would be inventing content.
 */

import {
  addItem, getListData, getIndex, getRecipe, removeDish, toggleRow, removeRow,
  errorText
} from '../shell/api.js';
import { t, pair, pick, bilingual, dishes as dishCount, getLang } from '../shell/i18n.js';
import { el, fill, showLoading, backLink, screenTitle, setLede, setTitle } from '../shell/ui.js';
import { hrefHome, hrefRecipe } from '../shell/router.js';

/* Guards against a reply landing after the router has moved to another screen. */
let token = 0;

/* The last payload the server sent. Read-only as far as this screen is concerned. */
let list = null;

/* Pantry rows per slug, so the 調味料 section survives a redraw without refetching.
   getRecipe() is memoised in the shell too, so this is belt and braces. */
const pantryBySlug = new Map();

/*
 * Whether the 調味料 drawer is open. It has to live outside the render, because
 * adding a seasoning redraws the whole screen and would otherwise snap the
 * drawer shut under her thumb — and adding two or three in a row is the normal
 * way to use it.
 */
let seasoningOpen = false;

/* Index rows for dish titles. Optional: the list must still open if the index is
   away, because the list is the thing she needs while standing in the shop. */
let indexRows = null;

let outletEl = null;

export function unmount() {
  token += 1;
  outletEl = null;
}

export async function mount(outlet, params) {
  const mine = ++token;
  outletEl = outlet;

  setTitle(t('買い物リスト', 'Shopping list'));
  setLede('');
  status.textContent = '';
  status.dataset.tone = '';
  seasoningOpen = false;

  showLoading(outlet, t('買い物リストを読み込み中…', 'Loading the shopping list…'));

  // Thrown, not caught: the router's error screen carries its own way out since
  // shell commit 9ba72d3, so catching here would stack a second exit on it.
  const payload = await getListData();
  if (mine !== token) return;

  // The index is a nice-to-have, not a requirement. It supplies the ENGLISH dish
  // title, which the server does not store (it keeps title_ja only). If it is
  // away we fall back to the Japanese title rather than failing the whole screen.
  try {
    const idx = await getIndex();
    indexRows = (idx && idx.recipes) || [];
  } catch (e) {
    indexRows = [];
  }
  if (mine !== token) return;

  list = normalise(payload);
  render();
  loadPantry(mine);
}

/*
 * Tolerate the reply shape rather than trusting it. Two reasons, both real:
 * the deployed api.gs currently double-wraps this payload as
 * { items: { items, dishes, rows } } (the fix is in the main session's working
 * tree, uncommitted), and shell/dev.js still answers the old flat { items }.
 * Neither is something to CODE AROUND — Chris ruled against a tolerant getList
 * on 2026-09-20 — so this does not unwrap anything or guess. It only supplies
 * empty arrays for keys that are absent, which is what an empty list looks like.
 */
function normalise(payload) {
  const p = payload || {};
  return {
    dishes: Array.isArray(p.dishes) ? p.dishes : [],
    rows: Array.isArray(p.rows) ? p.rows : []
  };
}

/* ---------- drawing ---------- */

function render() {
  const outlet = outletEl;
  if (!outlet) return;

  // Which control had focus, so a redraw does not drop her out of the list.
  // Ids are the server's and stable across a reply, which is what makes this work.
  const active = document.activeElement;
  const focusKey = (active && active.dataset && active.dataset.focusKey) || '';

  setLede(list.dishes.length ? dishCount(list.dishes.length) : '');

  const parts = [
    backLink(hrefHome(), t('ホーム', 'Home')),
    screenTitle(t('買い物リスト', 'Shopping list'),
                t('ふたりで共有しています', 'Shared between the two of you')),
    sectionPill(t('今回の献立', 'Dishes on the list')),
    dishSection(),
    sectionPill(t('買うもの', 'To buy')),
    progressLine(),
    rowSection(),
    seasoningSection(),
    addBox(),
    status
  ];

  fill(outlet, parts.filter(Boolean));

  if (focusKey) {
    const again = outlet.querySelector('[data-focus-key="' + cssEscape(focusKey) + '"]');
    if (again) again.focus();
  }
}

/** Attribute selectors need quoting for ids, and ids here are server-made. */
function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

function sectionPill(text) {
  return el('h2', { class: 'list-sect', text });
}

/* ---------- 今回の献立 ---------- */

function dishSection() {
  if (!list.dishes.length) {
    return el('div', { class: 'list-empty' },
      el('p', { text: t('まだ料理を選んでいません。', 'No dishes picked yet.') }),
      el('a', { class: 'list-empty-link', href: hrefHome() },
        t('レシピをさがす', 'Find a recipe'))
    );
  }

  return el('ul', { class: 'list-dishes' }, list.dishes.map(dishItem));
}

function dishItem(dish) {
  const slug = dish.slug;
  const row = (indexRows || []).find(r => r.slug === slug);
  const title = row ? pick(row, 'title') : (dish.title_ja || slug);
  const n = list.rows.filter(r => r.slug === slug).length;

  return el('li', { class: 'list-dish' },
    el('a', { class: 'list-dish-name', href: hrefRecipe(slug) },
      el('span', { text: title }),
      el('small', { text: n
        ? t(n + '品', n + (n === 1 ? ' item' : ' items'))
        : t('材料なし', 'no items') })
    ),
    el('button', {
      class: 'list-x',
      type: 'button',
      'data-focus-key': 'dish:' + slug,
      'aria-label': t(title + 'を献立から外す', 'Remove ' + title),
      onclick: () => act(() => removeDish(slug),
        t(title + 'を外しました。', 'Removed ' + title + '.'))
    }, '×')
  );
}

/* ---------- 買うもの ---------- */

function progressLine() {
  if (!list.rows.length) return null;
  const done = list.rows.filter(r => r.checked).length;
  return el('p', { class: 'list-progress', text: getLang() === 'en'
    ? done + ' of ' + list.rows.length + ' picked up'
    : list.rows.length + '品中 ' + done + '品 かごに入れました' });
}

function rowSection() {
  if (!list.rows.length) {
    return el('div', { class: 'list-empty' },
      el('p', { text: t('買うものはまだありません。', 'Nothing to buy yet.') }));
  }
  // Server order, never re-sorted and never moved when a box is ticked. A row
  // that jumps out from under her thumb in a shop is worse than a tidy list.
  return el('ul', { class: 'list-rows' }, list.rows.map(rowItem));
}

function rowItem(row) {
  const dish = row.slug ? list.dishes.find(d => d.slug === row.slug) : null;
  const idxRow = row.slug ? (indexRows || []).find(r => r.slug === row.slug) : null;
  const from = idxRow ? pick(idxRow, 'title') : (dish ? dish.title_ja : '');
  const amount = bilingual(row.amount);

  const box = el('input', {
    class: 'list-check',
    type: 'checkbox',
    checked: row.checked === true,
    'data-focus-key': 'row:' + row.id,
    onchange: () => act(() => toggleRow(row.id), '')
  });
  // `checked` as an attribute only sets the DEFAULT. Set the property too, or a
  // redraw shows every box unticked while the server says otherwise.
  box.checked = row.checked === true;

  return el('li', { class: row.checked ? 'list-row is-done' : 'list-row' },
    el('label', { class: 'list-row-main' },
      box,
      el('span', { class: 'list-row-text' },
        el('span', { class: 'list-row-name', text: pair(row) || row.ja || row.en || '' }),
        from ? el('small', { class: 'list-row-from', text: from }) : null
      )
    ),
    amount ? el('em', { class: 'list-row-amount', text: amount }) : null,
    el('button', {
      class: 'list-x',
      type: 'button',
      'data-focus-key': 'del:' + row.id,
      'aria-label': t('この項目を消す', 'Delete this item'),
      onclick: () => act(() => removeRow(row.id), '')
    }, '×')
  );
}

/* ---------- 調味料 ---------- */

/*
 * The server adds only a recipe's `fresh` rows to the list. The pantry rows are
 * left out on purpose, under the household rule in CLAUDE.md: a special trip is
 * the test, not shelf life. This section offers them back, so コチュカル or a
 * 4 L bottle of frying oil can go on the list when the shelf at home is empty,
 * without the list filling with salt and sugar every time she picks a dish.
 *
 * Collapsed by default, per the plan. Adding one sends it as a hand-typed line,
 * because the server has no "add this dish's pantry row" action and inventing
 * one is not this screen's call.
 */
function seasoningSection() {
  const offered = pantryOffers();
  if (!offered.length) return null;

  const body = el('ul', { class: 'list-seasonings' }, offered.map(ing => el('li', {},
    el('button', {
      class: 'list-add-seasoning',
      type: 'button',
      'data-focus-key': 'pantry:' + ing.key,
      onclick: () => act(() => addItem(ing.send),
        t(ing.label + 'を追加しました。', 'Added ' + ing.label + '.'))
    },
      el('span', { class: 'list-seasoning-name', text: ing.label }),
      ing.amount ? el('small', { text: ing.amount }) : null,
      el('span', { class: 'list-plus', 'aria-hidden': 'true' }, '＋')
    )
  )));

  return el('details', {
    class: 'list-seasoning-wrap',
    open: seasoningOpen || null,
    ontoggle: e => { seasoningOpen = e.target.open; }
  },
    el('summary', { class: 'list-seasoning-head' },
      el('span', { text: t('調味料・常備品', 'Seasonings and staples') }),
      el('small', { text: getLang() === 'en'
        ? offered.length + ' available'
        : offered.length + '件' })
    ),
    el('p', { class: 'list-seasoning-note', text: t(
      '選んだ料理で使う調味料です。家にあるものは足さなくて大丈夫。',
      'Seasonings the picked dishes use. Skip anything already in the cupboard.') }),
    body
  );
}

/**
 * Every pantry row across the dishes on the list, deduped by its Japanese name
 * and minus anything already on the list. Japanese is the dedupe key because it
 * is the name that is always present; English is blank on some rows.
 */
function pantryOffers() {
  const already = new Set(list.rows.map(r => norm(r.ja)));
  const seen = new Set();
  const out = [];

  for (const dish of list.dishes) {
    for (const ing of pantryBySlug.get(dish.slug) || []) {
      const key = norm(ing.ja);
      if (!key || seen.has(key) || already.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        label: pair(ing) || ing.ja,
        amount: bilingual(ing.amount),
        // Sent as the card's Japanese name. freeRow() on the server stores one
        // string in both ja and en, so whatever goes up is what both languages
        // show; Japanese is the one that gets checked against a Japanese shelf.
        send: ing.ja || pair(ing)
      });
    }
  }
  return out;
}

function norm(s) { return String(s || '').trim(); }

/**
 * Pantry rows arrive after the list is already on screen. The list is what she
 * opened the page for; the seasoning drawer can fill in a moment later.
 */
async function loadPantry(mine) {
  let added = false;
  for (const dish of list.dishes) {
    if (pantryBySlug.has(dish.slug)) continue;
    try {
      const recipe = await getRecipe(dish.slug);
      if (mine !== token) return;
      pantryBySlug.set(dish.slug, (recipe.ingredients || []).filter(i => !i.fresh));
      added = true;
    } catch (e) {
      // One unreadable recipe must not cost her the whole seasoning drawer.
      pantryBySlug.set(dish.slug, []);
    }
  }
  if (added && mine === token) render();
}

/* ---------- the free add box ---------- */

function addBox() {
  const input = el('input', {
    class: 'list-add-input',
    type: 'text',
    maxlength: '100',
    autocomplete: 'off',
    enterkeyhint: 'done',
    'data-focus-key': 'addbox',
    placeholder: t('牛乳、卵、…', 'Milk, eggs, …'),
    'aria-label': t('自分で追加する', 'Add your own item')
  });

  const form = el('form', { class: 'list-add', onsubmit: submit },
    input,
    el('button', { class: 'list-add-btn', type: 'submit' }, t('追加', 'Add'))
  );

  function submit(e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    // addItem(), not addToList(): addToList reduces the reply to the flat `items`
    // array, which would leave this screen without the rows it redraws from. The
    // shell's owner added addItem for exactly this, in bdc872f.
    act(() => addItem(text), t('追加しました。', 'Added.'));
  }

  return form;
}

/* ---------- one place where every mutation happens ---------- */

const status = el('p', { class: 'list-status', role: 'status', 'aria-live': 'polite' });

/* True while a call is in flight, so a double tap cannot race two writes. */
let busy = false;

/**
 * Run one mutating call, then redraw from what the server sent back. Never from
 * a local guess: the other phone may have changed the list in between.
 */
async function act(call, okText) {
  if (busy) return;
  const mine = token;
  busy = true;
  setBusy(true);
  status.dataset.tone = '';
  status.textContent = t('更新中…', 'Updating…');

  try {
    const payload = await call();
    if (mine !== token) return;
    list = normalise(payload);
    status.textContent = okText || '';
    status.dataset.tone = okText ? 'done' : '';
    render();
    loadPantry(mine);
  } catch (err) {
    if (mine !== token) return;
    // The shell carries the wording for all fourteen refusals api.gs can return,
    // so nothing is hand-written here.
    const msg = errorText(err);
    status.textContent = msg[getLang()] || msg.ja;
    status.dataset.tone = 'warn';

    // Two of the refusals mean this screen is looking at a list the server has
    // already moved past: the other phone deleted that row, or took that dish
    // off, a moment ago. Re-read, or she is left tapping a row that cannot
    // exist and being refused every time. This is the one case where the screen
    // asks the server again instead of redrawing from what it holds.
    if (err && (err.code === 'no-such-row' || err.code === 'not-on-list')) {
      try {
        const fresh = await getListData();
        if (mine !== token) return;
        list = normalise(fresh);
      } catch (e) { /* the catch-up is a courtesy; keep what we have */ }
    }

    // Every other refusal redraws from what we already hold, which is what puts
    // a wrongly-ticked box back where the server has it.
    render();
  } finally {
    busy = false;
    setBusy(false);
  }
}

/** Everything that writes is disabled together while one write is in flight. */
function setBusy(on) {
  if (!outletEl) return;
  for (const node of outletEl.querySelectorAll('button, input')) {
    if (on) node.setAttribute('aria-busy', 'true');
    else node.removeAttribute('aria-busy');
    node.disabled = on;
  }
}
