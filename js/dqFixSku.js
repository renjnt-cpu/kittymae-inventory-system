// Data Fixes -- "MATCH SKU": a sold item whose SKU is not in the SKU Catalog. Three ways to fix it, each only shown if the person is allowed to do it:
//   MATCH EXISTING PRODUCT  /  MAP BUNDLE (a set made of several products)  /  CREATE PRODUCT.
// Saving a match or a new product also gives orders that were waiting in Packing for this SKU their chance to deduct stock (the same rule the Pending SKU Match
// screen already uses); the answer says in plain words how many were updated.
import { dq } from './dqApi.js?v=20261007b';
import { esc, int, debounce } from './dqUi.js?v=20261007b';
import { parseMoney } from './dqFixModes.js?v=20261007b';

const fact = (label, html, cls) => '<dt>' + esc(label) + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</dd>';

export const skuMode = {
  make(row, ctx) {
    const can = ctx.can;
    const acts = [];
    if (can.sku_match) acts.push(['match', 'Match an existing product'], ['bundle', 'Map a bundle (several products)']);
    if (can.sku_create) acts.push(['create', 'Create a new product']);
    let act = acts.length ? acts[0][0] : 'match';
    let chosen = null;
    let comps = [];
    let suggested = [];
    const refs = (row.order_refs || []).length ? (row.order_refs || []).map((r) => esc(r)).join(', ') : '—';

    const results = (list) => list.length ? list.map((p) => '<div class="dq-pick" role="option" tabindex="0" data-pick="' + esc(p.sku) + '" data-name="' + esc(p.name) + '"><b>' + esc(p.sku) + '</b><span>' + esc(p.name || '') + '</span><span class="muted">' + esc(p.category || '') + '</span></div>').join('') :
      '<div class="dq-pick muted" style="cursor:default;">No products found. Try another word or SKU.</div>';

    return {
      facts: fact('External SKU', esc(row.external_sku), 'dq-big') + fact('Description', row.description ? esc(row.description) : '—') + fact('Order Reference', refs) + fact('Quantity', int(row.pieces) + ' pcs'),
      form: !acts.length ? '<div class="field wide"><div class="msg error">You do not have permission to fix this one.</div></div>' :
        '<div class="field wide"><div class="dq-modes" role="group" aria-label="What do you want to do?">' + acts.map(([k, l]) => '<button type="button" class="dq-chip" data-act="' + k + '" aria-pressed="' + (k === act) + '">' + esc(l) + '</button>').join('') + '</div></div>' +
        '<div class="field wide" data-sec="match"><label for="dq-find2">Search the SKU Catalog (SKU or name)</label><input id="dq-find2" type="search" autocomplete="off" placeholder="e.g. ring, HRL2"><div id="dq-sug"></div><div class="dq-picklist" id="dq-cands" role="listbox" hidden></div><div class="dq-hint" id="dq-chosen">Nothing chosen yet.</div></div>' +
        '<div class="field wide" data-sec="bundle" hidden><label for="dq-find3">Add the products this set is made of</label><input id="dq-find3" type="search" autocomplete="off" placeholder="Search a SKU or name"><div class="dq-picklist" id="dq-cands3" role="listbox" hidden></div><div id="dq-comps" class="dq-hint">No products added yet.</div></div>' +
        '<div class="field wide" data-sec="create" hidden><div class="dq-form" style="margin:0;">' +
          '<div class="field wide"><label for="dq-cname">Product name</label><input id="dq-cname" name="cname" type="text" maxlength="120" autocomplete="off" value="' + esc(row.description || '') + '"></div>' +
          '<div class="field"><label for="dq-ccat">Category (optional)</label><select id="dq-ccat" name="ccat"><option value="">— none —</option>' + (ctx.options.categories || []).map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('') + '</select></div>' +
          '<div class="field"><label for="dq-cprice">Selling price (optional, ₱)</label><input id="dq-cprice" name="cprice" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00"></div>' +
          '<div class="field"><label for="dq-ccost">Cost per piece (optional, ₱)</label><input id="dq-ccost" name="ccost" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00"></div>' +
          '<div class="dq-hint wide" style="grid-column:1/-1;">The new product gets the SKU <b>' + esc(row.external_sku) + '</b>.</div></div></div>',

      bind(root) {
        const setAct = (a) => {
          act = a;
          root.querySelectorAll('[data-act]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.act === a)));
          root.querySelectorAll('[data-sec]').forEach((s) => { s.hidden = s.dataset.sec !== a; });
        };
        root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => setAct(b.dataset.act)));
        setAct(act);
        const showPicked = () => { const el = root.querySelector('#dq-chosen'); if (el) el.innerHTML = chosen ? 'Matched to: <b>' + esc(chosen.sku) + '</b> — ' + esc(chosen.name || '') : 'Nothing chosen yet.'; };
        const drawComps = () => {
          const el = root.querySelector('#dq-comps'); if (!el) return;
          el.innerHTML = comps.length ? comps.map((c, i) => '<div class="dq-comp"><b>' + esc(c.sku) + '</b><span style="flex:1;min-width:0;">' + esc(c.name || '') + '</span><label class="muted" for="dq-q' + i + '">Pieces</label><input id="dq-q' + i + '" type="number" min="1" max="99" value="' + c.qty + '" data-qty="' + i + '"><button type="button" class="btn small secondary" data-rm="' + i + '" aria-label="Remove ' + esc(c.sku) + '">Remove</button></div>').join('') : 'No products added yet.';
          el.querySelectorAll('[data-qty]').forEach((q) => q.addEventListener('input', () => { comps[Number(q.dataset.qty)].qty = Math.max(1, Math.min(99, Math.round(Number(q.value) || 1))); }));
          el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { comps.splice(Number(b.dataset.rm), 1); drawComps(); }));
        };
        const wireSearch = (inputId, listId, onPick) => {
          const inp = root.querySelector('#' + inputId); const list = root.querySelector('#' + listId); if (!inp) return;
          const go = debounce(async () => {
            const v = inp.value.trim(); if (v.length < 2) { list.hidden = true; list.innerHTML = ''; return; }
            const r = await dq.candidates(v, row.external_sku); list.hidden = false; list.innerHTML = r.ok ? results(r.rows || []) : '<div class="dq-pick muted">We couldn\'t search right now. Please try again.</div>';
            list.querySelectorAll('[data-pick]').forEach((p) => { const pick = () => onPick({ sku: p.dataset.pick, name: p.dataset.name }); p.addEventListener('click', pick); p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }); });
          }, 250);
          inp.addEventListener('input', go);
        };
        wireSearch('dq-find2', 'dq-cands', (p) => { chosen = p; root.querySelectorAll('#dq-cands [data-pick]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.pick === p.sku))); showPicked(); });
        wireSearch('dq-find3', 'dq-cands3', (p) => { if (!comps.some((c) => c.sku === p.sku)) comps.push({ sku: p.sku, name: p.name, qty: 1 }); drawComps(); root.querySelector('#dq-find3').value = ''; root.querySelector('#dq-cands3').hidden = true; });
        // a size variant ("HRL2-3") is offered its base product straight away
        if (can.sku_match) dq.candidates('', row.external_sku).then((r) => {
          suggested = (r.ok && r.suggested) || []; const el = root.querySelector('#dq-sug');
          if (el && suggested.length) { el.innerHTML = '<div class="dq-hint">This looks like a size of <b>' + esc(suggested[0].sku) + '</b> — ' + esc(suggested[0].name || '') + ' <button type="button" class="dq-use" id="dq-usesug">Use this</button></div>'; el.querySelector('#dq-usesug').addEventListener('click', () => { chosen = suggested[0]; showPicked(); }); }
        });
        showPicked(); drawComps();
      },

      collect() {
        const root = document.getElementById('dq-body');
        if (!acts.length) return { ok: false, error: 'You do not have permission to fix this one.' };
        if (act === 'match') {
          if (!chosen) return { ok: false, error: 'Choose the product this item should be matched to.', field: 'dq-find2' };
          return { ok: true, payload: { action: 'map', components: [{ sku: chosen.sku, qty: 1 }] } };
        }
        if (act === 'bundle') {
          if (!comps.length) return { ok: false, error: 'Choose at least one product for the bundle.' };
          return { ok: true, payload: { action: 'map', components: comps.map((c) => ({ sku: c.sku, qty: c.qty })) } };
        }
        const name = root.querySelector('#dq-cname').value.trim();
        if (name.length < 2) return { ok: false, error: 'Enter the product name.', field: 'cname' };
        const price = parseMoney(root.querySelector('#dq-cprice').value); const cost = parseMoney(root.querySelector('#dq-ccost').value);
        if (price !== null && (Number.isNaN(price) || price < 0)) return { ok: false, error: price < 0 ? 'Price cannot be negative.' : 'Enter a valid price.', field: 'cprice' };
        if (cost !== null && (Number.isNaN(cost) || cost <= 0)) return { ok: false, error: cost < 0 ? 'Price cannot be negative.' : 'Enter a valid cost.', field: 'ccost' };
        return { ok: true, payload: { action: 'create', name, category: root.querySelector('#dq-ccat').value || null, price, cost } };
      },
      save(p) {
        return p.action === 'map' ? dq.skuMap(row.external_sku, row.shop_id, p.components)
          : dq.skuCreate({ external: row.external_sku, shop: row.shop_id, name: p.name, category: p.category, price: p.price, cost: p.cost });
      },
      confirm: () => ({ title: 'Please confirm', body: '', ok: 'Yes, save' }),
    };
  },
};
