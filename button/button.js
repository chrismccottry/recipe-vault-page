/*
 * The tile screen: one ingredient button, one cook, or everything.
 *
 * THE THUMBNAILS KEEP THE CREATOR'S BURNT-IN TEXT. Decided 2026-09-20 by
 * Chris's wife, from the mockup at page/design/thumbnail-options.html, against
 * both agents' recommendation. Her reason: the text matches the video she has
 * already seen and it helps her recognise the dish. So nothing here crops,
 * masks, overlays or dims the image, and the question is not reopened.
 *
 * The caption stays on every tile even where it repeats the burnt-in title,
 * because 34 of the 82 thumbnails carry no text at all and the grid should not
 * change shape halfway down. Evidence in plans/2026-09-20-thumbnail-census.md.
 *
 * Tile geometry follows the mockup she chose (its .tile and .grid rules), not a
 * fresh design: 4:3 shots, two across, caption under.
 */

import { getIndex } from '../shell/api.js';
import { t, pick, minutes, dishes } from '../shell/i18n.js';
import { el, fill, showLoading, setLede, setTitle, backLink } from '../shell/ui.js';
import { hrefHome, hrefRecipe } from '../shell/router.js';

/** The six tags in use. Fixed order, so the row does not reshuffle per screen. */
const TAGS = ['時短', '揚げ物', 'カレー', '休日向き', '副菜', 'スープ'];

const TAGS_EN = {
  '時短': 'Quick', '揚げ物': 'Fried', 'カレー': 'Curry',
  '休日向き': 'Weekend', '副菜': 'Side', 'スープ': 'Soup'
};

let active = null;    // the tag currently filtering, or null
let lastKey = null;   // which screen that filter belongs to

/** Newest first, with a stable tiebreak: 52 cards share one capture date. */
function newestFirst(a, b) {
  const d = String(b.captured || '').localeCompare(String(a.captured || ''));
  return d !== 0 ? d : String(a.title_ja || '').localeCompare(String(b.title_ja || ''), 'ja');
}

function tile(r) {
  const shot = el('span', { class: 'btn-shot' });
  if (r.thumb) {
    shot.append(el('img', {
      src: r.thumb,
      alt: '',                       // the caption right below already names it
      loading: 'lazy',
      decoding: 'async'
    }));
  } else {
    // One card is not from YouTube and has no thumbnail. Rather than invent an
    // image, the tile says so in the display face and keeps its shape.
    shot.classList.add('is-blank');
    shot.append(el('span', { class: 'btn-shot-blank', text: t('写真なし', 'No photo') }));
  }

  return el('a', { class: 'btn-tile', href: hrefRecipe(r.slug) },
    shot,
    el('b', { text: pick(r, 'title') }),
    el('i', { text: minutes(r.time_minutes) })
  );
}

function render(el_, rows, heading) {
  const shown = active ? rows.filter(r => (r.page_tags || []).includes(active)) : rows;

  // The count under the title follows the filter. Left at the unfiltered total
  // it said 7品 above six tiles.
  const sub = active
    ? dishes(shown.length) + t('（' + rows.length + '品中）', ' of ' + rows.length)
    : dishes(rows.length);

  const chips = el('div', { class: 'btn-tags', role: 'group',
    'aria-label': t('タグでしぼる', 'Filter by tag') },
    TAGS.map(tag => {
      const n = rows.filter(r => (r.page_tags || []).includes(tag)).length;
      const on = active === tag;
      return el('button', {
        class: 'btn-tag' + (on ? ' is-on' : ''),
        type: 'button',
        'aria-pressed': String(on),
        disabled: n === 0,
        onclick: () => { active = on ? null : tag; render(el_, rows, heading); }
      }, t(tag, TAGS_EN[tag] || tag));
    })
  );

  fill(el_,
    backLink(hrefHome(), t('ホーム', 'Home')),
    el('header', { class: 'btn-head' },
      el('h1', { class: 'btn-title', text: heading }),
      el('p', { class: 'btn-sub', text: sub })
    ),
    chips,
    shown.length
      ? el('div', { class: 'btn-grid' }, shown.map(tile))
      : el('p', { class: 'btn-none', text: t('このタグのレシピはありません。', 'Nothing with that tag.') })
  );
}

export async function mount(el_, params) {
  showLoading(el_);
  const idx = await getIndex();
  const all = (idx.recipes || []).slice();

  let rows, heading;
  if (params.button) {
    rows = all.filter(r => r.button === params.button);
    heading = params.button;
  } else if (params.cook) {
    rows = all.filter(r => r.cook === params.cook);
    heading = params.cook;
  } else {
    rows = all;
    heading = t('ぜんぶ', 'Everything');
  }

  rows.sort(newestFirst);

  // A different screen starts unfiltered. The SAME screen keeps its filter,
  // because mount() also runs on a language switch and dropping her 揚げ物
  // selection just for tapping EN would be a surprise.
  const key = params.button || params.cook || 'all';
  if (key !== lastKey) { active = null; lastKey = key; }

  setLede('');
  setTitle(heading);
  render(el_, rows, heading);
}

export function unmount() { /* the filter is cleared on the next different screen */ }
