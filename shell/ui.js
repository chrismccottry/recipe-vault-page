/*
 * The few pieces of presentation all three screens share: the loading state,
 * the failure state, and the back control. Anything that appears on more than
 * one screen belongs here, so a fix lands once.
 *
 * The shell owns the error surface. All ten refusals the gatekeeper can return
 * are mapped in api.js and rendered here, so no screen writes its own wording
 * for "not signed in" or for a half-finished sync.
 */

import { errorText, isRetryable } from './api.js';
import { t, getLang } from './i18n.js';

/** Build an element without fighting innerHTML. Text is always set as text. */
export function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') throw new Error('use text, not html');
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/** Replace a node's contents in one go. */
export function fill(node, ...kids) {
  node.innerHTML = '';
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid);
  return node;
}

/**
 * The waiting state. She opens this on a phone in a kitchen, so it says what it
 * is waiting for rather than spinning anonymously.
 */
export function showLoading(node, label) {
  fill(node, el('div', { class: 'shell-loading', role: 'status', 'aria-live': 'polite' },
    el('span', { class: 'shell-loading-dot', 'aria-hidden': 'true' }),
    el('span', { text: label || t('読み込み中…', 'Loading…') })
  ));
}

/**
 * The failure state. Says what went wrong in her language, and offers a retry
 * only where trying again could actually work. A refusal from the allowlist
 * never gets a retry button, because pressing it would do nothing.
 *
 * `back` is {href, label}, and it matters: an error screen with no way out is
 * the same dead end as a blank one, on a phone in a kitchen. The router passes
 * one for every screen except home. Raised by the session building the recipe
 * screen, which had worked around it locally.
 */
export function showError(node, err, onRetry, back) {
  const msg = errorText(err);
  const kids = [
    el('p', { class: 'shell-error-title', text: t('うまくいきませんでした', 'Something went wrong') }),
    el('p', { class: 'shell-error-note', text: msg[getLang()] || msg.ja })
  ];
  if (onRetry && isRetryable(err)) {
    kids.push(el('button', { class: 'shell-btn', type: 'button', onclick: onRetry },
      t('もう一度', 'Try again')));
  }
  if (back && back.href) {
    kids.push(el('p', { class: 'shell-error-back' },
      el('a', { class: 'shell-back', href: back.href }, '← ' + back.label)));
  }
  fill(node, el('div', { class: 'shell-error', role: 'alert' }, kids));
}

/** The back control, the same on every screen that has one. */
export function backLink(href, label) {
  return el('a', { class: 'shell-back', href }, '← ' + label);
}

/** A screen heading in the display face. Screens should not restyle this. */
export function screenTitle(text, sub) {
  return el('header', { class: 'shell-screen-head' },
    el('h1', { class: 'shell-screen-title', text }),
    sub ? el('p', { class: 'shell-screen-sub', text: sub }) : null
  );
}

/** The line under the wordmark. Each screen sets it; the shell owns the markup. */
export function setLede(text) {
  const node = document.querySelector('.shell-lede');
  if (node) node.textContent = text || '';
}

/** The browser tab / LINE title. Kept bilingual like everything else. */
export function setTitle(text) {
  document.title = text ? text + '｜レシピさん' : 'レシピさん';
}
