// Sales & Profit Dashboard -- the filter bar: date range (presets or a custom range, always shown with the previous comparable period), branch, and the
// "more filters" (channel, shop, product, SKU, category, collection, supplier, customer, salesperson, payment method, order status, payment status).
// Every filter works together with every other, and every tab, chart, table and export reads the same state.
import { esc, PRESETS, presetRange, previousPeriod, rangeText, fmtDate } from './sdCore.js?v=20261007e';

const MORE = [
  { key: 'channel', label: 'Sales channel', opt: 'channels' }, { key: 'shop', label: 'Shop', opt: 'shops' },
  { key: 'category', label: 'Category', opt: 'categories', none: 'Uncategorized' }, { key: 'collection', label: 'Collection', opt: 'collections', none: '(none)' },
  { key: 'supplier', label: 'Supplier', opt: 'suppliers', none: 'Unassigned' }, { key: 'salesperson', label: 'Salesperson', opt: 'salespeople', none: '(none)' },
  { key: 'payment_method', label: 'Payment method', opt: 'payment_methods' }, { key: 'order_status', label: 'Order status', opt: 'order_statuses' },
  { key: 'payment_status', label: 'Payment status', opt: 'payment_statuses' },
  { key: 'product', label: 'Product name', text: true }, { key: 'sku', label: 'SKU', text: true }, { key: 'customer', label: 'Customer', text: true },
];

export function createFilters({ root, meta, onChange }) {
  const settings = meta.settings || {};
  const today = meta.today;
  const defPreset = (PRESETS.some((p) => p.id === settings.default_date_range) ? settings.default_date_range : 'this_month');
  const allBranches = !!meta.all_branches;
  const defBranch = allBranches ? (settings.default_branch_id !== null && settings.default_branch_id !== undefined ? String(settings.default_branch_id) : '') : String((meta.me && meta.me.branch_id) || '');
  const state = { preset: defPreset, custom: null, branch: defBranch, more: {}, moreOpen: false, customOpen: false };
  const opt = (k) => (meta.options && meta.options[k]) || [];

  function range() { return presetRange(state.preset, today, state.custom); }
  function prev() { const r = range(); return previousPeriod(r.from, r.to, state.preset); }

  function html() {
    return '<div class="card sd-filterbar">' +
      '<div class="sd-fb-row">' +
        '<div class="field"><label for="sd-preset">Date range</label><select id="sd-preset">' + PRESETS.map((p) => '<option value="' + p.id + '">' + esc(p.label) + '</option>').join('') + '</select></div>' +
        '<div class="field sd-custom" hidden><label for="sd-from">Start date</label><input type="date" id="sd-from"></div>' +
        '<div class="field sd-custom" hidden><label for="sd-to">End date</label><input type="date" id="sd-to"></div>' +
        '<div class="sd-custom sd-custom-btns" hidden><button type="button" class="btn small" id="sd-apply">Apply</button><button type="button" class="btn small secondary" id="sd-reset">Reset</button></div>' +
        '<div class="field"><label for="sd-branch">Branch</label><select id="sd-branch">' + (allBranches ? '<option value="">All Branches</option>' : '') +
          (meta.branches || []).map((b) => '<option value="' + b.id + '">' + esc(b.name) + '</option>').join('') + '</select></div>' +
        '<button type="button" class="btn small secondary sd-more-btn" id="sd-more-btn" aria-expanded="false">More filters ▾</button>' +
      '</div>' +
      '<div class="sd-fb-err" id="sd-fb-err" role="alert"></div>' +
      '<div class="sd-period-line" id="sd-period-line"></div>' +
      '<div class="sd-more" id="sd-more" hidden>' +
        '<div class="sd-more-grid">' + MORE.filter((m) => m.text || opt(m.opt).length).map((m) => m.text
          ? '<div class="field"><label for="sd-m-' + m.key + '">' + esc(m.label) + '</label><input type="text" id="sd-m-' + m.key + '" data-more="' + m.key + '" placeholder="Contains…" maxlength="100"></div>'
          : '<div class="field"><label for="sd-m-' + m.key + '">' + esc(m.label) + '</label><select id="sd-m-' + m.key + '" data-more="' + m.key + '"><option value="">All</option>' +
            (m.none ? '<option value="(none)">' + esc(m.none) + '</option>' : '') + opt(m.opt).map((o) => '<option>' + esc(o) + '</option>').join('') + '</select></div>').join('') + '</div>' +
        '<div class="sd-more-foot"><button type="button" class="btn small secondary" id="sd-clear-more">Clear these filters</button></div>' +
      '</div>' +
      '<div class="sd-chips" id="sd-chips"></div>' +
    '</div>';
  }
  root.innerHTML = html();
  const $ = (id) => root.querySelector('#' + id);

  function chips() {
    const out = [];
    const br = (meta.branches || []).find((b) => String(b.id) === state.branch);
    if (allBranches && br) out.push({ k: '__branch', label: 'Branch', v: br.name });
    MORE.forEach((m) => { const v = state.more[m.key]; if (v) out.push({ k: m.key, label: m.label, v }); });
    $('sd-chips').innerHTML = out.length ? '<span class="muted">Active filters:</span>' + out.map((c) => '<span class="filter-chip">' + esc(c.label) + ': <b>' + esc(c.v) + '</b> <button type="button" class="sd-chip-x" data-x="' + esc(c.k) + '" aria-label="Remove ' + esc(c.label) + ' filter">✕</button></span>').join('') : '';
    $('sd-chips').querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.x === '__branch') { state.branch = ''; $('sd-branch').value = ''; } else { delete state.more[b.dataset.x]; const el = root.querySelector('[data-more="' + b.dataset.x + '"]'); if (el) el.value = ''; }
      paint(); onChange();
    }));
  }
  function paint() {
    const r = range(), p = prev();
    $('sd-preset').value = state.preset; $('sd-branch').value = state.branch;
    const custom = state.preset === 'custom';
    root.querySelectorAll('.sd-custom').forEach((e) => { e.hidden = !custom; });
    if (custom) { $('sd-from').value = r.from; $('sd-to').value = r.to; }
    $('sd-period-line').innerHTML = '<span><b>Selected period:</b> ' + esc(rangeText(r.from, r.to)) + '</span><span><b>Compared with:</b> ' + esc(rangeText(p.from, p.to)) + '</span>';
    chips();
  }
  function showErr(t) { $('sd-fb-err').textContent = t || ''; }

  $('sd-preset').addEventListener('change', (e) => {
    showErr('');
    if (e.target.value === 'custom') { const r = range(); state.custom = { from: r.from, to: r.to }; state.preset = 'custom'; paint(); return; } // wait for Apply
    state.preset = e.target.value; state.custom = null; paint(); onChange();
  });
  $('sd-apply').addEventListener('click', () => {
    const a = $('sd-from').value, b = $('sd-to').value;
    if (!a || !b) return showErr('Pick both a start and an end date.');
    if (a > b) return showErr('The start date must not be after the end date.');
    if ((new Date(b) - new Date(a)) / 86400000 > 3660) return showErr('That range is too long (10 years at most).');
    showErr(''); state.custom = { from: a, to: b }; state.preset = 'custom'; paint(); onChange();
  });
  $('sd-reset').addEventListener('click', () => { showErr(''); state.preset = defPreset; state.custom = null; paint(); onChange(); });
  $('sd-branch').addEventListener('change', (e) => { state.branch = e.target.value; paint(); onChange(); });
  $('sd-more-btn').addEventListener('click', () => {
    state.moreOpen = !state.moreOpen; $('sd-more').hidden = !state.moreOpen; $('sd-more-btn').setAttribute('aria-expanded', String(state.moreOpen));
    $('sd-more-btn').textContent = state.moreOpen ? 'Fewer filters ▴' : 'More filters ▾';
  });
  let t = null;
  root.querySelectorAll('[data-more]').forEach((el) => {
    const set = () => { const v = el.value.trim(); if (v) state.more[el.dataset.more] = v; else delete state.more[el.dataset.more]; chips(); onChange(); };
    if (el.tagName === 'SELECT') el.addEventListener('change', set);
    else el.addEventListener('input', () => { clearTimeout(t); t = setTimeout(set, 450); });
  });
  $('sd-clear-more').addEventListener('click', () => { state.more = {}; root.querySelectorAll('[data-more]').forEach((el) => { el.value = ''; }); chips(); onChange(); });
  paint();

  return {
    state,
    /** the filter object every database call takes */
    server() {
      const r = range(), p = prev();
      const o = { from: r.from, to: r.to, prev_from: p.from, prev_to: p.to };
      if (state.branch) o.branch_id = Number(state.branch);
      Object.entries(state.more).forEach(([k, v]) => { if (v) o[k] = v; });
      return o;
    },
    range, prev,
    anyMore: () => Object.keys(state.more).length > 0,
    /** lines for an export / print header */
    describe() {
      const r = range(), p = prev(), br = (meta.branches || []).find((b) => String(b.id) === state.branch);
      return ['Period: ' + rangeText(r.from, r.to), 'Compared with: ' + rangeText(p.from, p.to), 'Branch: ' + (br ? br.name : 'All branches'),
        'Filters: ' + (Object.keys(state.more).length ? Object.entries(state.more).map(([k, v]) => (MORE.find((m) => m.key === k) || { label: k }).label + ' = ' + v).join('; ') : 'none'),
        'Generated: ' + new Date().toLocaleString('en-US', { timeZone: meta.tz || 'Asia/Manila' })];
    },
    setCustom(from, to) { state.preset = 'custom'; state.custom = { from, to }; paint(); onChange(); },
  };
}
