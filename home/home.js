/*
 * Home: the ingredient grid, with the cook row underneath.
 *
 * This is the screen she opens before a shopping trip with no dish decided, so
 * it answers "what am I in the mood to cook from" rather than "what is in the
 * fridge". The fridge question is Chris's, and it lives in the chat side.
 *
 * Ten buttons, chosen and labelled by her. 粉もの is the bread-and-dough button
 * and it covers pita, gyros, wraps, tacos, quesadilla and pizza. Outside this
 * family 粉もの usually reads as お好み焼き・たこ焼き. Do not "correct" it.
 */

import { getIndex } from '../shell/api.js';
import { t, pick, dishes, getLang } from '../shell/i18n.js';
import { el, fill, showLoading, setLede, setTitle } from '../shell/ui.js';
import { hrefAll, hrefButton, hrefCook } from '../shell/router.js';
import { icon } from './icons.js';

/** How many cooks stay visible before もっと見る. Everything past this is a single. */
const COOKS_SHOWN = 12;

function buttonCell(b) {
  const empty = !b.count;
  const cell = el('a', {
    class: 'home-cell' + (empty ? ' is-empty' : '') + (b.count === 1 ? ' is-thin' : ''),
    href: empty ? null : hrefButton(b.name),
    role: empty ? null : null
  });

  const glyph = icon(b.name);
  if (glyph) cell.append(glyph);

  /*
   * What a thin button says: 1品・準備中, both facts at once. Chris ruled this on
   * 2026-09-20, taking the comp's wording (variants.html:320-321) over mine.
   * The reasoning that decided it: she browses to pick two or three days of
   * meals, and a button holding one recipe cannot do that, so it is near-empty
   * in practice even though it is not empty. It stays a real link, because it
   * holds a real recipe.
   *
   * A button with nothing in it is different: not a link, and it says how to
   * fill it. No button is empty at today's counts, so that branch is tested
   * against a fixture rather than waited for.
   *
   * The hint lives INSIDE the label. As a sibling it competed for the row's
   * width and squeezed スイーツ onto three lines.
   */
  let count;
  if (empty)              count = t('準備中', 'Nothing yet');
  else if (b.count === 1) count = dishes(1) + t('・準備中', ' · more coming');
  else                    count = dishes(b.count);

  const label = el('span', { class: 'home-cell-label' },
    el('b', { text: b.name }),
    el('i', { text: count }),
    empty ? el('small', { class: 'home-cell-hint',
      text: t('LINEでリンクを送ってね', 'Send a link on LINE') }) : null
  );
  cell.append(label);
  return cell;
}

function cookRow(cooks) {
  const shown = cooks.slice(0, COOKS_SHOWN);
  const rest = cooks.slice(COOKS_SHOWN);

  const list = el('div', { class: 'home-cooks' },
    shown.map(c => el('a', { class: 'home-cook', href: hrefCook(c.name) },
      el('span', { class: 'home-cook-name', text: c.name }),
      el('span', { class: 'home-cook-count', text: String(c.count) })
    ))
  );

  const section = el('section', { class: 'home-section' },
    el('h2', { class: 'home-section-title', text: t('作る人からえらぶ', 'Choose by cook') }),
    list
  );

  /*
   * 16 of the 28 cooks hold exactly one recipe, so more than half the row would
   * be single-recipe tiles. They are folded rather than cut: the useful names
   * stay in front, and nothing is lost for the evening she wants the one
   * 笠原将弘 recipe. Chris has the final say on this treatment.
   */
  if (rest.length) {
    const more = el('div', { class: 'home-cooks home-cooks-more', hidden: true },
      rest.map(c => el('a', { class: 'home-cook', href: hrefCook(c.name) },
        el('span', { class: 'home-cook-name', text: c.name }),
        el('span', { class: 'home-cook-count', text: String(c.count) })
      ))
    );
    const toggle = el('button', { class: 'home-more', type: 'button', 'aria-expanded': 'false' });
    const paint = () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.textContent = open
        ? t('とじる', 'Show fewer')
        : t('もっと見る（あと' + rest.length + '人）', 'Show ' + rest.length + ' more');
    };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      more.hidden = open;
      paint();
    });
    paint();
    section.append(toggle, more);
  }
  return section;
}

export async function mount(el_, params) {
  setLede(t('食材からえらぶ', 'Choose by ingredient'));
  setTitle('');
  showLoading(el_);

  const idx = await getIndex();      // throwing here is fine: the router draws the error
  const buttons = idx.buttons || [];
  const cooks = idx.cooks || [];

  fill(el_,
    el('a', { class: 'home-all', href: hrefAll() },
      t('ぜんぶ見る', 'See everything') + '　' + dishes(idx.count)),
    el('nav', { class: 'home-grid', 'aria-label': t('食材', 'Ingredients') },
      buttons.map(buttonCell)),
    cookRow(cooks)
  );
}
