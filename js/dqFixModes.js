// Data Fixes -- the forms for product cost, purchase price, category and supplier: what to show, what to ask for, and how to save it.
// Each mode gives the Fix screen (dqFix.js) two things: make(row, ctx) for one item at a time, and bulk.make(ctx) for several at once.
// Wording is plain; the messages ("Enter a valid cost.", "Select a supplier.", "Price cannot be negative.") are the same ones the database gives.
import { dq } from './dqApi.js?v=20261008a';
import { esc, money, int, shortDate } from './dqUi.js?v=20261008a';

export const parseMoney = (s) => { const t = String(s === null || s === undefined ? '' : s).replace(/[₱,\s]/g, ''); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const costError = (n) => (n === null || Number.isNaN(n) ? 'Enter a valid cost.' : n < 0 ? 'Price cannot be negative.' : (n === 0 || n > 50000000) ? 'Enter a valid cost.' : null);
const unitError = (n) => (n === null || Number.isNaN(n) ? 'Enter a valid unit price.' : n < 0 ? 'Price cannot be negative.' : (n === 0 || n > 50000000) ? 'Enter a valid unit price.' : null);
const fact = (label, html, cls) => '<dt>' + esc(label) + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</dd>';
const missing = (text) => '<span class="dq-missing">' + esc(text || 'Missing') + '</span>';
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : esc(v));

// A pick-list with "+ Add new ..." (suppliers are added to the shared list first; a new category is just typed).
function picker({ name, label, items, canAdd, kind, optional, first }) {
  const addLabel = kind === 'supplier' ? '+ Add new supplier…' : '+ New category…';
  return '<div class="field' + (kind ? '' : ' wide') + '"><label for="dq-' + name + '">' + esc(label) + '</label><select id="dq-' + name + '" name="' + name + '"><option value="">' + esc(first || (optional ? '— none —' : '— choose —')) + '</option>' +
    items.map((v) => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('') + (canAdd ? '<option value="__new__">' + esc(addLabel) + '</option>' : '') + '</select></div>' +
    (canAdd ? '<div class="field" id="dq-' + name + '-new" hidden><label for="dq-' + name + '-newtext">' + (kind === 'supplier' ? 'New supplier name' : 'New category name') + '</label>' +
      '<div style="display:flex;gap:6px;"><input id="dq-' + name + '-newtext" type="text" maxlength="80" autocomplete="off">' + (kind === 'supplier' ? '<button type="button" class="btn small" data-addsup="' + name + '">Add</button>' : '') + '</div>' +
      '<div class="dq-err" data-adderr="' + name + '" role="alert"></div></div>' : '');
}
function bindPicker(root, name, kind, ctx) {
  const sel = root.querySelector('#dq-' + name); const box = root.querySelector('#dq-' + name + '-new');
  if (!sel || !box) return;
  sel.addEventListener('change', () => { box.hidden = sel.value !== '__new__'; if (!box.hidden) box.querySelector('input').focus(); });
  const add = box.querySelector('[data-addsup]');
  if (add) add.addEventListener('click', async () => {
    const inp = box.querySelector('input'); const err = box.querySelector('[data-adderr]'); err.textContent = '';
    add.disabled = true; const r = await dq.supplierAdd(inp.value); add.disabled = false;
    if (!r.ok) { err.textContent = r.message; return; }
    const nm = r.supplier.name;
    if (![...sel.options].some((o) => o.value === nm)) { const o = document.createElement('option'); o.value = nm; o.textContent = nm; sel.insertBefore(o, sel.querySelector('[value="__new__"]')); }
    sel.value = nm; box.hidden = true; inp.value = ''; await ctx.refreshOptions();
  });
}
// the value chosen in a picker, or an error sentence
function pickerValue(root, name, kind, required) {
  const sel = root.querySelector('#dq-' + name); if (!sel) return { ok: true, value: '' };
  if (sel.value === '__new__') {
    if (kind === 'supplier') return { ok: false, error: 'Add the supplier first, or choose one from the list.', field: name };
    const t = root.querySelector('#dq-' + name + '-newtext').value.trim();
    return t ? { ok: true, value: t } : { ok: false, error: 'Type the new category name.', field: name };
  }
  if (!sel.value && required) return { ok: false, error: kind === 'supplier' ? 'Select a supplier.' : 'Select a category.', field: name };
  return { ok: true, value: sel.value };
}
const supplierNames = (ctx) => (ctx.options.suppliers || []).map((s) => s.name);

// ============================================================================ product cost
const cost = {
  make(row, ctx) {
    let source = 'manual';
    const useBtn = (src, v, extra) => v === null || v === undefined ? '<span class="muted">No purchase price on record</span>' :
      money(v) + (extra ? ' <span class="muted">(' + esc(extra) + ')</span>' : '') + '<button type="button" class="dq-use" data-use="' + src + '" data-val="' + esc(v) + '">Use this</button>';
    return {
      facts: fact('Product', esc(row.product_name || row.sku), 'dq-big') + fact('SKU', esc(row.sku)) + fact('Supplier', dash(row.supplier)) + fact('Current Cost', missing()) +
        fact('Last Purchase Cost', useBtn('last_purchase', row.last_cost, row.last_cost_date ? shortDate(row.last_cost_date) : '')) + fact('Average Purchase Cost', useBtn('average', row.avg_cost)),
      form: '<div class="field wide"><label for="dq-cost">Enter Cost (per piece, ₱)</label><input id="dq-cost" name="cost" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00"><div class="dq-hint" id="dq-cost-hint"></div></div>' +
        (ctx.can.supplier ? picker({ name: 'supplier', label: 'Supplier (optional)', items: supplierNames(ctx), canAdd: ctx.options.can_add_supplier, kind: 'supplier', optional: true }) : '') +
        '<div class="field' + (ctx.can.supplier ? '' : ' wide') + '"><label for="dq-note">Notes (optional)</label><input id="dq-note" name="note" type="text" maxlength="200" autocomplete="off"></div>',
      bind(root) {
        const inp = root.querySelector('#dq-cost'); const hint = root.querySelector('#dq-cost-hint');
        root.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => {
          source = b.dataset.use; inp.value = Number(b.dataset.val).toFixed(2);
          hint.textContent = source === 'last_purchase' ? 'Using the last purchase cost. You will be asked to confirm.' : 'Using the average purchase cost. You will be asked to confirm.'; inp.focus();
        }));
        inp.addEventListener('input', () => { if (source !== 'manual') { source = 'manual'; hint.textContent = ''; } });
        bindPicker(root, 'supplier', 'supplier', ctx);
      },
      collect() {
        const root = document.getElementById('dq-body'); const n = parseMoney(root.querySelector('#dq-cost').value); const e = costError(n);
        if (e) return { ok: false, error: e, field: 'cost' };
        const sp = pickerValue(root, 'supplier', 'supplier', false); if (!sp.ok) return sp;
        return { ok: true, payload: { sku: row.sku, cost: n, source, supplier: sp.value || null, note: root.querySelector('#dq-note').value.trim() || null } };
      },
      save: (p, confirm) => dq.costSave({ ...p, confirm }),
      confirm: (p, res) => ({ title: 'Use the suggested cost?', ok: 'Yes, use it', body: '<p>Save <b>' + money(res.suggested) + '</b> as the cost of <b>' + esc(row.product_name || row.sku) + '</b>?</p><p class="muted">It comes from ' +
        (p.source === 'last_purchase' ? 'the last purchase.' : 'the average of the past purchases.') + '</p>' }),
    };
  },
  bulk: {
    make(ctx) {
      return {
        head: '<th>SKU</th><th>Product</th><th>Supplier</th><th>Last cost</th><th>Average</th><th>New cost (₱)</th>',
        toolbar: (ctx.can.supplier ? picker({ name: 'bsup', label: 'Supplier for the selected items', items: supplierNames(ctx), canAdd: ctx.options.can_add_supplier, kind: 'supplier', optional: true, first: 'Don’t change' }) : '') +
          '<div class="field"><label>Cost source (selected rows)</label><div style="display:flex;gap:6px;flex-wrap:wrap;"><button type="button" class="btn small secondary" data-src="last_purchase">Use last purchase cost</button><button type="button" class="btn small secondary" data-src="average">Use average cost</button></div></div>',
        row: (r) => '<td data-label="SKU"><b>' + esc(r.sku) + '</b></td><td data-label="Product">' + esc(r.product_name || '') + '</td><td data-label="Supplier">' + dash(r.supplier) + '</td>' +
          '<td data-label="Last cost">' + (r.last_cost != null ? money(r.last_cost) : '—') + '</td><td data-label="Average">' + (r.avg_cost != null ? money(r.avg_cost) : '—') +
          '</td><td data-label="New cost"><input type="text" inputmode="decimal" data-cost="' + r.issue_id + '" data-source="manual" aria-label="New cost for ' + esc(r.sku) + '" placeholder="0.00"></td>',
        bind(body, api) {
          bindPicker(body, 'bsup', 'supplier', ctx);
          body.querySelectorAll('[data-cost]').forEach((i) => i.addEventListener('input', () => { i.dataset.source = 'manual'; if (i.value.trim()) api.tick([Number(i.dataset.cost)]); }));
          body.querySelectorAll('button[data-src]').forEach((b) => { b.addEventListener('click', () => {
            const picked = api.selected(); const src = b.dataset.src;
            if (!picked.length) { body.querySelector('#dq-bulk-err').textContent = 'Select at least one item first.'; return; }
            body.querySelector('#dq-bulk-err').textContent = '';
            picked.forEach((r) => {
              const v = src === 'last_purchase' ? r.last_cost : r.avg_cost; const inp = body.querySelector('[data-cost="' + r.issue_id + '"]'); const cell = body.querySelector('tr[data-id="' + r.issue_id + '"] [data-rowerr]');
              if (v == null) { cell.textContent = 'No purchase price on record.'; return; }
              cell.textContent = ''; inp.value = Number(v).toFixed(2); inp.dataset.source = src;
            });
          }); });
        },
        collect(picked, body) {
          const items = []; const rowErrors = {}; let sugg = 0;
          picked.forEach((r) => {
            const inp = body.querySelector('[data-cost="' + r.issue_id + '"]'); const src = inp.dataset.source || 'manual';
            if (src !== 'manual') { items.push({ sku: r.sku, source: src }); sugg++; return; }
            const n = parseMoney(inp.value); const e = costError(n);
            if (e) rowErrors[r.issue_id] = e; else items.push({ sku: r.sku, cost: n, source: 'manual' });
          });
          if (Object.keys(rowErrors).length) return { ok: false, error: 'Some rows need attention.', rowErrors };
          const sp = pickerValue(body, 'bsup', 'supplier', false); if (!sp.ok) return sp;
          return { ok: true, payload: { items, supplier: sp.value || null },
            confirm: '<p>Save the cost for <b>' + int(items.length) + '</b> product' + (items.length === 1 ? '' : 's') + '?' + (sugg ? ' <b>' + int(sugg) + '</b> of them use a suggested cost from past purchases.' : '') + '</p>' + (sp.value ? '<p>Supplier will be set to <b>' + esc(sp.value) + '</b>.</p>' : '') };
        },
        save: (p, confirm) => dq.costBulk(p.items, p.supplier, confirm),
      };
    },
  },
};

// ============================================================================ purchase price
const purchase = {
  make(row, ctx) {
    let useTotal = false;
    const calc = (root) => {
      const u = parseMoney(root.querySelector('#dq-unit') && root.querySelector('#dq-unit').value); const t = root.querySelector('#dq-total-out');
      if (!useTotal) t.textContent = (u !== null && !Number.isNaN(u) && u > 0) ? money(Math.round(u * row.qty * 100) / 100) : '—';
    };
    return {
      facts: fact('Purchase Reference', esc(row.purchase_ref) + (row.date ? ' <span class="muted">· ' + esc(shortDate(row.date)) + '</span>' : ''), 'dq-big') + fact('Supplier', dash(row.supplier)) +
        fact('Product', esc(row.product_name) + ' <span class="muted">(' + esc(row.sku) + ')</span>') + fact('Quantity', int(row.qty) + ' pcs' + (row.branch ? ' <span class="muted">· ' + esc(row.branch) + '</span>' : '')),
      form: '<div class="field" id="dq-unit-box"><label for="dq-unit">Enter Unit Price (per piece, ₱)</label><input id="dq-unit" name="unit" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00"></div>' +
        '<div class="field"><label>Total</label><div id="dq-total-box"><div class="dq-big" id="dq-total-out" style="font-size:18px;font-weight:bold;padding:8px 0;">—</div></div><button type="button" class="dq-use" id="dq-flip" style="align-self:flex-start;margin:0;">I have the total instead</button></div>' +
        '<div class="field wide"><label for="dq-note">Notes (optional)</label><input id="dq-note" name="note" type="text" maxlength="200" autocomplete="off"></div>',
      bind(root) {
        const unit = root.querySelector('#dq-unit'); unit.addEventListener('input', () => calc(root));
        root.querySelector('#dq-flip').addEventListener('click', () => {
          useTotal = !useTotal; const box = root.querySelector('#dq-total-box'); const flip = root.querySelector('#dq-flip');
          if (useTotal) { box.innerHTML = '<input id="dq-total" name="total" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00">'; unit.value = ''; unit.disabled = true; flip.textContent = 'I have the unit price instead'; root.querySelector('#dq-total').focus(); }
          else { box.innerHTML = '<div class="dq-big" id="dq-total-out" style="font-size:18px;font-weight:bold;padding:8px 0;">—</div>'; unit.disabled = false; flip.textContent = 'I have the total instead'; calc(root); unit.focus(); }
        });
      },
      collect() {
        const root = document.getElementById('dq-body');
        if (useTotal) { const n = parseMoney(root.querySelector('#dq-total').value); const e = (n === null || Number.isNaN(n)) ? 'Enter a valid total.' : n < 0 ? 'Price cannot be negative.' : (n === 0 || n > 50000000) ? 'Enter a valid total.' : null;
          return e ? { ok: false, error: e, field: 'total' } : { ok: true, payload: { id: row.purchase_id, total: n, note: root.querySelector('#dq-note').value.trim() || null } }; }
        const n = parseMoney(root.querySelector('#dq-unit').value); const e = unitError(n);
        return e ? { ok: false, error: e, field: 'unit' } : { ok: true, payload: { id: row.purchase_id, unit: n, note: root.querySelector('#dq-note').value.trim() || null } };
      },
      save: (p) => dq.purchaseSave(p),
      confirm: () => ({ title: 'Please confirm', body: '', ok: 'Yes, save' }),
    };
  },
  bulk: {
    make() {
      return {
        head: '<th>Delivery</th><th>Product</th><th>Qty</th><th>Unit price (₱)</th><th>Total</th>',
        toolbar: '<div class="field"><label for="dq-allunit">Use one unit price for the selected rows</label><div style="display:flex;gap:6px;"><input id="dq-allunit" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off"><button type="button" class="btn small secondary" id="dq-applyunit">Apply</button></div></div>',
        row: (r) => '<td data-label="Delivery"><b>' + esc(r.purchase_ref) + '</b><div class="muted">' + esc(shortDate(r.date)) + (r.branch ? ' · ' + esc(r.branch) : '') + '</div></td><td data-label="Product">' + esc(r.product_name) + ' <span class="muted">(' + esc(r.sku) + ')</span></td>' +
          '<td data-label="Qty">' + int(r.qty) + '</td><td data-label="Unit price"><input type="text" inputmode="decimal" data-unit="' + r.issue_id + '" data-qty="' + r.qty + '" aria-label="Unit price for ' + esc(r.purchase_ref) + '" placeholder="0.00"></td><td data-label="Total" data-total="' + r.issue_id + '">—</td>',
        bind(body, api) {
          const recalc = (i) => { const u = parseMoney(i.value); const t = body.querySelector('[data-total="' + i.dataset.unit + '"]'); t.textContent = (u !== null && !Number.isNaN(u) && u > 0) ? money(Math.round(u * Number(i.dataset.qty) * 100) / 100) : '—'; };
          body.querySelectorAll('[data-unit]').forEach((i) => i.addEventListener('input', () => { recalc(i); if (i.value.trim()) api.tick([Number(i.dataset.unit)]); }));
          body.querySelector('#dq-applyunit').addEventListener('click', () => {
            const u = parseMoney(body.querySelector('#dq-allunit').value); const err = body.querySelector('#dq-bulk-err'); const e = unitError(u);
            if (e) { err.textContent = e; return; }
            const picked = api.selected(); if (!picked.length) { err.textContent = 'Select at least one item first.'; return; }
            err.textContent = ''; picked.forEach((r) => { const i = body.querySelector('[data-unit="' + r.issue_id + '"]'); i.value = Number(u).toFixed(2); recalc(i); });
          });
        },
        collect(picked, body) {
          const items = []; const rowErrors = {};
          picked.forEach((r) => { const n = parseMoney(body.querySelector('[data-unit="' + r.issue_id + '"]').value); const e = unitError(n); if (e) rowErrors[r.issue_id] = e; else items.push({ id: r.purchase_id, unit_price: n }); });
          if (Object.keys(rowErrors).length) return { ok: false, error: 'Some rows need attention.', rowErrors };
          return { ok: true, payload: { items }, confirm: '<p>Save the unit price for <b>' + int(items.length) + '</b> purchase' + (items.length === 1 ? '' : 's') + '? The total of each is worked out from its quantity.</p>' };
        },
        save: (p, confirm) => dq.purchaseBulk(p.items, confirm),
      };
    },
  },
};

// ============================================================================ category
const category = {
  make(row, ctx) {
    return {
      facts: fact('Product', esc(row.product_name || row.sku), 'dq-big') + fact('SKU', esc(row.sku)) + fact('Current Category', missing()),
      form: picker({ name: 'category', label: 'Category', items: ctx.options.categories || [], canAdd: ctx.options.can_add_category, kind: 'category', first: '— choose a category —' }),
      bind(root) { bindPicker(root, 'category', 'category', ctx); },
      collect() { const v = pickerValue(document.getElementById('dq-body'), 'category', 'category', true); return v.ok ? { ok: true, payload: { sku: row.sku, category: v.value } } : v; },
      save: (p) => dq.categorySave(p.sku, p.category),
      confirm: () => ({ title: 'Please confirm', body: '', ok: 'Yes, save' }),
    };
  },
  bulk: {
    make(ctx) {
      return {
        head: '<th>SKU</th><th>Product</th>',
        toolbar: picker({ name: 'bcat', label: 'Category for the selected products', items: ctx.options.categories || [], canAdd: ctx.options.can_add_category, kind: 'category', first: '— choose a category —' }),
        row: (r) => '<td data-label="SKU"><b>' + esc(r.sku) + '</b></td><td data-label="Product">' + esc(r.product_name || '') + '</td>',
        bind(body) { bindPicker(body, 'bcat', 'category', ctx); },
        collect(picked, body) { const v = pickerValue(body, 'bcat', 'category', true); if (!v.ok) return v;
          return { ok: true, payload: { skus: picked.map((r) => r.sku), category: v.value }, confirm: '<p>Set the category of <b>' + int(picked.length) + '</b> product' + (picked.length === 1 ? '' : 's') + ' to <b>' + esc(v.value) + '</b>?</p>' }; },
        save: (p, confirm) => dq.categoryBulk(p.skus, p.category, confirm),
      };
    },
  },
};

// ============================================================================ supplier
const supplier = {
  make(row, ctx) {
    return {
      facts: fact('Product', esc(row.product_name || row.sku), 'dq-big') + fact('SKU', esc(row.sku)) + fact('Current Supplier', missing()),
      form: picker({ name: 'supplier', label: 'Supplier', items: supplierNames(ctx), canAdd: ctx.options.can_add_supplier, kind: 'supplier', first: '— choose a supplier —' }),
      bind(root) { bindPicker(root, 'supplier', 'supplier', ctx); },
      collect() { const v = pickerValue(document.getElementById('dq-body'), 'supplier', 'supplier', true); return v.ok ? { ok: true, payload: { sku: row.sku, supplier: v.value } } : v; },
      save: (p) => dq.supplierSave(p.sku, p.supplier),
      confirm: () => ({ title: 'Please confirm', body: '', ok: 'Yes, save' }),
    };
  },
  bulk: {
    make(ctx) {
      return {
        head: '<th>SKU</th><th>Product</th>',
        toolbar: picker({ name: 'bsup', label: 'Supplier for the selected products', items: supplierNames(ctx), canAdd: ctx.options.can_add_supplier, kind: 'supplier', first: '— choose a supplier —' }),
        row: (r) => '<td data-label="SKU"><b>' + esc(r.sku) + '</b></td><td data-label="Product">' + esc(r.product_name || '') + '</td>',
        bind(body) { bindPicker(body, 'bsup', 'supplier', ctx); },
        collect(picked, body) { const v = pickerValue(body, 'bsup', 'supplier', true); if (!v.ok) return v;
          return { ok: true, payload: { skus: picked.map((r) => r.sku), supplier: v.value }, confirm: '<p>Set the supplier of <b>' + int(picked.length) + '</b> product' + (picked.length === 1 ? '' : 's') + ' to <b>' + esc(v.value) + '</b>?</p>' }; },
        save: (p, confirm) => dq.supplierBulk(p.skus, p.supplier, confirm),
      };
    },
  },
};

export const MODES = { cost, purchase, category, supplier };
