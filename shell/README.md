# The shell

Everything three screens share. Built 2026-09-20. Owned by the session that
holds briefing 0; announce a change here before making it, because the home,
button, recipe and shopping-list screens all build against it.

## What a screen is

An ES module at `page/app/<name>/<name>.js`, with its stylesheet beside it at
`page/app/<name>/<name>.css`. The router loads both on demand, the first time
that route is visited.

```js
// page/app/home/home.js
export async function mount(el, params) { … }   // required
export function unmount() { … }                 // optional, for timers/listeners
```

- `mount(el, params)` is handed an empty `<main>` and the route's parameters.
  It may be async. Throwing is fine: the router catches it and draws the shared
  error state, so a screen never has to render its own failure.
- `unmount()` runs before the next screen mounts. Only needed if you attached
  something outside `el`.
- **`mount()` is called again when the language changes**, with scroll position
  restored. Keep it cheap and idempotent. It costs no network, because
  `getIndex()` is memoised.
- A screen whose file does not exist yet shows 準備中 instead of breaking the
  app. That is what lets several people build several screens at once.

## Routes

| Hash | Screen | `params` |
|---|---|---|
| `#/` | home | `{}` |
| `#/all` | button | `{ button: null, cook: null }` |
| `#/b/<button>` | button | `{ button: '鶏肉', cook: null }` |
| `#/c/<cook>` | button | `{ button: null, cook: 'コウケンテツ' }` |
| `#/r/<slug>` | recipe | `{ slug: 'carrot-salad-koh' }` |
| `#/list` | list | `{}` |

Never hand-write a hash. Use the builders, which handle encoding:

```js
import { hrefHome, hrefAll, hrefButton, hrefCook, hrefRecipe, hrefList, go } from '../shell/router.js';
el('a', { href: hrefButton('鶏肉') }, '鶏肉');   // #/b/%E9%B6%8F%E8%82%89
go(hrefRecipe(slug));                            // navigate in code
```

Hash routing, not paths, because GitHub Pages serves static files and cannot
rewrite `/b/鶏肉` to the app.

## Data

```js
import { getIndex, getRecipe, indexRow, getList, addToList, addDish } from '../shell/api.js';
```

| Call | Returns |
|---|---|
| `getIndex()` | the whole of `page-index.json`: `{ generated, count, buttons[], cooks[], recipes[] }`. Memoised, so every screen shares one round trip |
| `indexRow(slug)` | one recipe's index row: both titles, cook, button, page_tags, time_minutes, servings, thumb, captured |
| `getRecipe(slug)` | ingredients and steps, flattened: `{ slug, generated, ingredients[], steps[], source, video_id, protein_est, calories_est }` |
| `getList()` | the shared shopping list, today a flat array of strings |
| `addToList(text)` | append one free-typed line, returns the whole list |
| `addDish(slug)` | **not deployed.** See below |

The title, cook, time, servings and thumb live in the index, not in the recipe
call. A recipe screen wants `indexRow(slug)` **and** `getRecipe(slug)`; run them
together with `Promise.all`, since the index is usually already in hand.

## Errors

Every call throws `ApiError` with a `.code`. The shell maps all ten refusals
`line/api.gs` can return, so no screen writes its own wording:

| `.code` | from |
|---|---|
| `bad-request` | `bad json` |
| `not-signed-in` | `not signed in` (one silent re-login is attempted first) |
| `not-allowed` | `not on the family list` |
| `unknown-action` | `unknown action` |
| `data-missing` | either page JSON not on Drive |
| `data-corrupt` | either page JSON not valid JSON |
| `bad-slug` | `bad slug` |
| `no-such-recipe` | `no such recipe` |
| `network`, `bad-reply`, `liff`, `server`, `not-deployed` | raised in the browser |

```js
import { showError, showLoading } from '../shell/ui.js';
try { … } catch (e) { showError(el, e, () => mount(el, params)); }
```

`showError` picks the wording for the current language and only offers the retry
button where retrying could work. Letting `mount()` throw does the same thing.

The four `data-*` cases fire when a sync half-completes. They are the most
likely to reach her in a kitchen, so they say to ask Chris to run the sync
rather than naming a file she has never heard of.

### `addDish` is not deployed

`api.gs` line 36 reads `case 'add': … addItem(body.item)` and stores a plain
string, keeping the last 50, with no removal and no per-dish shape. There is no
`addDish` case. `addDish(slug)` is the agreed future contract and ships now so
the 買い物リストに追加 button fails in the open with "the shopping list is not
connected yet" rather than looking like it worked. Do not describe that button
as wired until the endpoint lands.

## Language

Japanese is the default and stays the default. The shell owns the switch; each
screen writes both languages in its own files as it goes. There is no later
translation step.

```js
import { t, pick, pair, bilingual, minutes, dishes, getLang } from '../shell/i18n.js';

t('食材からえらぶ', 'Choose by ingredient')  // any literal string
pick(row, 'title')                           // title_ja / title_en
pair(step)                                   // { ja, en } objects: steps, ingredient names
bilingual(ing.amount)                        // "1 tsp / 小さじ1" -> one side
minutes(row.time_minutes)                    // 25分 / 25 min
dishes(20)                                   // 20品 / 20 recipes
```

`bilingual()` covers all three shapes in the data, measured across all 1437
ingredient rows on 2026-09-20: 1200 carry the `" / "` separator, 234 are a
single string with no separator (`500 g`, `1個`), and 3 are empty. A string with
no separator shows as-is in both languages.

Ingredient section labels are bilingual on only 6 of 42 distinct values, so
English mode shows a Japanese section label most of the time. That is the data,
not something to paper over.

## Styling

`tokens.css` is the one source of truth for colour, type and motion. Use the
variables; do not put a hex value in a screen stylesheet. If a screen needs a
colour the tokens do not have, ask for a token rather than inventing one.

House rules, from the design doctrine:

- Motion animates transform and opacity only, easing `var(--ease)`, which does
  not overshoot. Nine overshooting transitions were replaced in the comp.
- Every clickable element gets hover, `:focus-visible` and active states.
- Focus rings are `var(--focus-width)` solid `var(--focus-color)`.
- **Contrast is calculated by hand.** The Impeccable detector runs DEGRADED on
  this machine and cannot compute contrast at all, so a clean run is an
  undercount. Two colours in this palette have already had to be darkened.

Shared pieces live in `ui.js`: `el`, `fill`, `showLoading`, `showError`,
`backLink`, `screenTitle`, `setLede`, `setTitle`. `el()` refuses an `html`
property on purpose; set text as text.

## Looking at a screen before Phase 4

Serve the vault root and open the app with `?dev=1`:

```
http://localhost:4173/page/app/index.html?dev=1
```

That skips `liff.init()` and reads `line/build/page-index.json` and
`line/build/page-details.json` off the local server, reproducing the
gatekeeper's reply shapes exactly, including its refusals. It engages only on
localhost, so appending `?dev=1` to the published page does nothing, and it
bypasses nothing on the server: the gate is the LINE token check and the
two-person allowlist in `api.gs`, neither of which is in the browser.
`line/build/` is gitignored, so those files are never published.

The shopping list is a model of the gatekeeper's state machine, held in memory:
it adds dishes, expands their fresh ingredients, ticks rows, removes them and
enforces the same 8000-byte cap, and it is lost on reload. Every rule in it
names the `line/api.gs` line it came from. It is a MODEL, never a stored copy:
it starts empty and fills from the same build files the recipe handler reads,
so no recipe data lives in `page/app/`.

### The stale module, which has faked a bug three times

The preview server sends no cache headers, so the browser caches ES modules
heuristically and **a plain reload can keep running the old shell**. This has
produced three false bug reports between two agents in two days: a test fails,
the failure looks real, and the file on disk already has the fix.

The tell is a failure that survives a change you can prove reached the file.

To be sure which code is running:

```js
Object.keys(await import('/page/app/shell/api.js'))   // does the new export exist?
```

To force the new one: `fetch(url, { cache: 'reload' })` over each module, then
navigate to a URL with a **different query string**. Navigating to the same URL
does not refetch. Found by the session building the list screen, 2026-09-21.

## Files

| File | What it is |
|---|---|
| `../index.html` | the host document. Part of the shell |
| `tokens.css` | colour, type, motion. One source of truth |
| `shell.css` | top bar, language switch, loading, failure, 準備中 |
| `config.js` | the LIFF id and the `/exec` URL |
| `api.js` | the only code that talks to the gatekeeper |
| `i18n.js` | the language convention |
| `router.js` | hash routes and on-demand screen loading |
| `ui.js` | shared presentation |
| `main.js` | boot: language, LIFF, deep link, router |
| `dev.js` | localhost-only preview fixtures |
