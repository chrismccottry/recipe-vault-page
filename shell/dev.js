/*
 * Local preview, so a screen can be looked at before Phase 4 wires the page to
 * LINE. Add ?dev=1 to the URL while serving the vault locally.
 *
 * In this mode the shell skips liff.init() and reads line/build/page-index.json
 * and line/build/page-details.json straight off the local server instead of
 * calling the gatekeeper.
 *
 * Why this is safe to have in a public repository:
 *   - it refuses to engage unless the hostname is localhost or 127.0.0.1, so
 *     appending ?dev=1 to the published page does nothing
 *   - it bypasses nothing on the server. The gate is the LINE token check and
 *     the two-person allowlist in api.gs, and neither is in the browser
 *   - line/build/ is gitignored, so the files it reads are never published
 *
 * The shopping list is a MODEL of the gatekeeper's state machine, held in memory:
 * it behaves like the server but is lost on reload, because there is no shared
 * store without the gatekeeper.
 */

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function devRequested() {
  const on = new URLSearchParams(location.search).get('dev') === '1';
  return on && LOCAL_HOSTS.indexOf(location.hostname) !== -1;
}

/** The named transforms. Each takes the real index and returns a bent copy. */
function bend(data, name) {
  const out = JSON.parse(JSON.stringify(data));
  if (name === 'empty-buttons') {
    for (const b of out.buttons) if (b.count <= 1) b.count = 0;   // so 準備中 can be seen
    out.buttons.sort((a, b) => b.count - a.count);
  } else if (name === 'no-cooks') {
    out.cooks = [];
  } else {
    console.warn('unknown fixture "' + name + '", showing the real data');
  }
  return out;
}

async function readJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(path + ' -> HTTP ' + res.status);
  return res.json();
}

/* ---------- an in-memory copy of the gatekeeper's shopping list ----------
 *
 * Every field, refusal string and rule below is read off line/api.gs, named by
 * line, so the preview and the server cannot drift apart silently. This is a
 * MODEL of that state machine, not a stored copy of any data: it starts empty
 * and fills from the same page-details.json the recipe handler already reads.
 *
 * It exists because the list screen cannot be exercised locally without it. A
 * handler that returns a shape the server does not send is worse than no
 * handler at all, which is what the old flat { items: [...] } had become after
 * the gatekeeper stopped wrapping its reply.
 */

const STATE_CAP = 8000;                       // api.gs:17, Script Properties allows 9 KB
const SLUG = /^[a-z0-9-]{1,120}$/;            // api.gs:148

function newState() { return { v: 1, seq: 0, dishes: [], rows: [] }; }   // api.gs:86

/* api.gs:123-129. `items` stays in the payload: page/phase0/index.html reads
 * r.items, and until the push that page is the only way either of them can see
 * the list, because line/recipe-bot.gs has no shopping-list command. */
function listPayload(state) {
  return {
    items: state.rows.map(function (r) { return r.ja; }),
    dishes: state.dishes,
    rows: state.rows
  };
}

function freeRow(state, text) {               // api.gs:94-98
  state.seq += 1;
  return { id: 'r' + state.seq, ja: text.slice(0, 100), en: text.slice(0, 100),
           amount: '', slug: null, checked: false };
}

/* A JSON round trip on the way out, because the real replies cross the wire and
 * a screen must not be able to reach back into this state by holding a
 * reference to it. */
function wire(payload) { return JSON.parse(JSON.stringify(payload)); }

/**
 * api.gs:101-116. The rollback is the part an in-memory model has to do by hand:
 * the server gets it free, because mutate() re-reads the state from Script
 * Properties on every call and simply does not write it back when the change is
 * refused or the cap is blown. Here the same object survives the call, so a
 * refusal has to be undone or the list quietly grows past the cap, and `seq`
 * drifts away from the server's.
 */
function mutate(state, fn) {
  const snapshot = JSON.stringify(state);
  const undo = function () {
    const prev = JSON.parse(snapshot);
    state.v = prev.v; state.seq = prev.seq;
    state.dishes = prev.dishes; state.rows = prev.rows;
  };
  const refusal = fn(state);
  if (refusal && refusal.error) { undo(); return refusal; }
  if (JSON.stringify(state).length > STATE_CAP) {
    undo();
    return { error: 'list is full', list: wire(listPayload(state)) };   // api.gs:110
  }
  return wire(listPayload(state));
}

/**
 * Stand-ins for the gatekeeper's actions, matching its reply shapes exactly so
 * no screen can tell the difference. Verified against line/api.gs, not against
 * memory of it: run the checks in the commit message if you change either side.
 */
export function devHandlers(base) {
  // ?fixture=<name> bends the real index on the way through, so a state the data
  // does not contain can still be tested. The empty-button state is why this
  // exists: no button is empty at today's counts.
  //
  // A NAMED TRANSFORM, never a stored copy. A fixture FILE would be a second
  // copy of all 82 recipes' titles, cooks and thumbnails sitting in the page
  // directory, and the page directory is what gets published to a PUBLIC
  // repository. Recipes only ever come from the gatekeeper. That rule has to
  // survive convenience, and on 2026-09-20 it very nearly did not.
  const fixture = new URLSearchParams(location.search).get('fixture');
  const root = base || '../../line/build/';
  const state = newState();
  let details = null;
  let index = null;

  async function loadDetails() {
    if (!details) details = await readJson(root + 'page-details.json');
    return details;
  }

  /* The unbent index, for a dish's title. Separate from recipes() on purpose: a
   * fixture bends what the grid shows, never what a dish is called. */
  async function loadIndex() {
    if (!index) index = await readJson(root + 'page-index.json');
    return index;
  }

  async function findRecipe(slug) {           // api.gs:114 and 148, same two guards
    if (!SLUG.test(slug)) return { error: 'bad slug' };
    const data = await loadDetails();
    const recipes = data.recipes || {};
    if (!Object.prototype.hasOwnProperty.call(recipes, slug)) return { error: 'no such recipe' };
    return { slug: slug, generated: data.generated, recipe: recipes[slug] };
  }

  return {
    async recipes() {
      const data = await readJson(root + 'page-index.json');
      return fixture ? bend(data, fixture) : data;
    },

    async recipe(payload) {
      return findRecipe(String((payload && payload.slug) || ''));
    },

    async list() { return wire(listPayload(state)); },

    /* api.gs:133-137. An empty line is not an error: the list comes back unchanged. */
    async add(payload) {
      const text = String((payload && payload.item) || '').trim().slice(0, 100);
      if (!text) return wire(listPayload(state));
      return mutate(state, function (st) { st.rows.push(freeRow(st, text)); });
    },

    /* api.gs:146-176. The page sends a slug and the server expands it, so only
     * `fresh` ingredients become rows; the pantry staples stay off the list. */
    async addDish(payload) {
      const slug = String((payload && payload.slug) || '').trim();
      if (!SLUG.test(slug)) return { error: 'bad slug' };
      if (state.dishes.some(function (d) { return d.slug === slug; })) {
        return { error: 'already on the list' };
      }
      const detail = await findRecipe(slug);
      if (detail.error) return detail;
      const idx = await loadIndex();
      const row = (idx.recipes || []).filter(function (r) { return r.slug === slug; })[0];
      return mutate(state, function (st) {
        st.dishes.push({
          slug: slug,
          title_ja: row ? row.title_ja : slug,
          at: new Date().toISOString(),
          by: ''
        });
        (detail.recipe.ingredients || []).forEach(function (ing) {
          if (!ing.fresh) return;
          st.seq += 1;
          st.rows.push({
            id: 'r' + st.seq,
            ja: ing.ja || '',
            en: ing.en || '',
            amount: ing.amount || '',
            slug: slug,
            checked: false
          });
        });
      });
    },

    /* api.gs:175-181. A dish takes its rows with it, ticked ones included. */
    async removeDish(payload) {
      const slug = String((payload && payload.slug) || '').trim();
      return mutate(state, function (st) {
        const before = st.dishes.length;
        st.dishes = st.dishes.filter(function (d) { return d.slug !== slug; });
        if (st.dishes.length === before) return { error: 'not on the list' };
        st.rows = st.rows.filter(function (r) { return r.slug !== slug; });
      });
    },

    /* api.gs:183-187 */
    async toggleRow(payload) {
      const id = String((payload && payload.id) || '');
      return mutate(state, function (st) {
        const row = st.rows.filter(function (r) { return r.id === id; })[0];
        if (!row) return { error: 'no such row' };
        row.checked = !row.checked;
      });
    },

    /* api.gs:189-193 */
    async removeRow(payload) {
      const id = String((payload && payload.id) || '');
      return mutate(state, function (st) {
        const before = st.rows.length;
        st.rows = st.rows.filter(function (r) { return r.id !== id; });
        if (st.rows.length === before) return { error: 'no such row' };
      });
    }
  };
}
