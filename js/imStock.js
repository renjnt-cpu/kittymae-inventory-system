// Item Monitoring > Stock by Branch -- the part of the page used most, so it is a tab of its own with the search at the very top (no scrolling past forms and tables to reach it).
// It reads the SAME inventory rows as everything else on the page (ctx.data.stock); nothing here calculates stock. qty_available is what can still be sold, qty_reserved is held for layaway,
// and what the branch physically holds is the two added together -- the meaning the database already gives them is kept.
import { esc, num, weight, fmtDate, plural } from './imFormat.js?v=20261030a';
import { applySort, byText, byNumber, sortControlHtml, wireSortControl } from './uiKit.js?v=20261030a';
import { branchBadge, branchButtonStyle } from './branchColors.js?v=20261030a';
import { skuSummary, singleSku } from './imData.js?v=20261030a';
import { emptyBox } from './imUi.js?v=20261030a';

const PAGE = 100;
const SORT_FIELDS = [
  { key: 'sku', label: 'SKU' }, { key: 'item_name', label: 'Product name' }, { key: 'branch', label: 'Branch' },
  { key: 'qty_available', label: 'Available' }, { key: 'qty_reserved', label: 'Reserved' }, { key: 'total_grams_on_hand', label: 'Weight on hand' },
];
const STATUS = [['all', 'All stock'], ['low', 'Low stock only'], ['overdue', 'Counts overdue'], ['reserved', 'Reserved stock']];

function match(ctx, r, st, ignoreStatus) {
  if (st.branch !== 'all' && String(r.branch_id) !== st.branch) return false;
  const q = st.search.trim().toLowerCase();
  if (q && !r._text.includes(q)) return false;
  if (ignoreStatus) return true;
  if (st.status === 'low') return r._low;
  if (st.status === 'overdue') return r._overdue;
  if (st.status === 'reserved') return Number(r.qty_reserved) > 0;
  return true;
}

export function renderStock(ctx, panel, opts) {
  const st = ctx.ui.stock;
  if (opts) {
    if (opts.search !== undefined) st.search = String(opts.search).slice(0, 80);
    if (opts.status) st.status = opts.status;
    if (opts.branch !== undefined) st.branch = opts.branch;
    st.shown = PAGE;
  }
  const comps = {
    sku: byText('sku'), qty_available: byNumber('qty_available'), qty_reserved: byNumber('qty_reserved'), total_grams_on_hand: byNumber('total_grams_on_hand'),
    item_name: (a, b) => a._name.localeCompare(b._name), branch: (a, b) => a._branch.localeCompare(b._branch),
  };
  const manyBranches = ctx.branches.length > 8;

  panel.innerHTML = '<div class="im-stockbar" id="im-sb">' +
    '<div class="im-sb-row"><div class="field im-grow"><label>Search SKU or product name</label><input type="search" id="im-s-search" placeholder="Type a SKU or product name…" autocomplete="off" value="' + esc(st.search) + '"></div>' +
    '<button type="button" class="btn secondary im-filters-btn" id="im-s-filters" aria-expanded="false">Filters</button></div>' +
    '<div class="im-chips" id="im-s-quick"></div>' +
    (manyBranches ? '' : '<div class="im-chips" id="im-s-branches"></div>') +
    '<div class="im-more-filters" id="im-s-more"><div class="im-filter-row">' +
      (manyBranches ? '<div class="field"><label>Branch</label><select id="im-s-branch"><option value="all">All branches</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (st.branch === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' : '') +
      '<div class="field"><label>Status</label><select id="im-s-status">' + STATUS.map(([k, l]) => '<option value="' + k + '"' + (st.status === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      sortControlHtml(SORT_FIELDS, st.sort, 'im-s-sortf', 'im-s-sortd') + '<button type="button" class="btn small secondary" id="im-s-clear">Clear filters</button></div></div></div>' +
    '<div id="im-s-summary"></div><div id="im-s-list"></div>';
  const $ = (id) => panel.querySelector('#' + id);
  const bar = $('im-sb');

  function paintChips() {
    const base = ctx.data.stock.filter((r) => match(ctx, r, st, true));
    const n = { all: base.length, low: base.filter((r) => r._low).length, overdue: base.filter((r) => r._overdue).length, reserved: base.filter((r) => Number(r.qty_reserved) > 0).length };
    $('im-s-quick').innerHTML = [['all', 'All stock'], ['low', 'Low stock'], ['overdue', 'Count overdue'], ['reserved', 'Reserved stock']]
      .map(([k, l]) => '<button type="button" class="im-chip' + (st.status === k ? ' im-chip-on' : '') + '" data-status="' + k + '">' + l + ' <span class="im-chip-n">' + num(n[k]) + '</span></button>').join('');
    $('im-s-quick').querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => { st.status = b.dataset.status; st.shown = PAGE; $('im-s-status').value = st.status; paintAll(); }));
    const bx = $('im-s-branches');
    if (bx) {
      bx.innerHTML = '<button type="button" class="im-chip' + (st.branch === 'all' ? ' im-chip-on' : '') + '" data-branch="all">ALL BRANCHES</button>' +
        ctx.branches.map((b) => '<button type="button" class="im-chip im-chip-branch' + (st.branch === String(b.id) ? ' im-chip-on' : '') + '" data-branch="' + b.id + '" style="' + branchButtonStyle(b.id, ctx.branches, st.branch === String(b.id)) + '">' + esc(b.name).toUpperCase() + '</button>').join('');
      bx.querySelectorAll('[data-branch]').forEach((b) => b.addEventListener('click', () => { st.branch = b.dataset.branch; st.shown = PAGE; paintAll(); }));
    }
  }

  function paintSummary(rowsForSearch) {
    const sku = singleSku(rowsForSearch, st.search);
    const box = $('im-s-summary');
    const s = sku && skuSummary(ctx.data.stock, sku);
    if (!s) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="im-skucard"><div class="im-sku-title"><b>' + esc(s.sku) + '</b> <span class="muted">' + esc(s.name) + (s.category ? ' · ' + esc(s.category) : '') + '</span></div>' +
      '<div class="im-skunums"><div><span>Total company stock</span><b>' + num(s.total) + ' pcs</b></div><div><span>Reserved</span><b>' + num(s.reserved) + ' pcs</b></div><div><span>Available</span><b class="im-pos">' + num(s.available) + ' pcs</b></div>' +
      (s.grams ? '<div><span>Weight on hand</span><b>' + weight(s.grams) + '</b></div>' : '') + '</div>' +
      '<div class="im-skubranches">' + s.perBranch.map((p) => '<button type="button" class="im-bchip" data-branch="' + p.branch_id + '">' + esc(ctx.branchById[p.branch_id] || '') + ' <b>' + num(p.available) + ' pcs</b>' + (p.reserved ? ' <small>+' + num(p.reserved) + ' reserved</small>' : '') + '</button>').join('') + '</div>' +
      '<div class="im-links"><button type="button" class="btn small secondary" data-sum-hist="' + esc(s.sku) + '">View history</button><button type="button" class="btn small secondary" data-sum-trace="' + esc(s.sku) + '">Trace product</button>' +
      '<button type="button" class="btn small secondary" data-sum-fp="' + esc(s.sku) + '">View factory purchases</button><button type="button" class="btn small secondary" data-sum-count="' + esc(s.sku) + '">Log physical count</button></div></div>';
    box.querySelectorAll('[data-branch]').forEach((b) => b.addEventListener('click', () => { st.branch = b.dataset.branch; st.shown = PAGE; paintAll(); }));
    box.querySelector('[data-sum-hist]').addEventListener('click', () => ctx.openMovement(s.sku, st.branch !== 'all' ? Number(st.branch) : undefined));
    box.querySelector('[data-sum-trace]').addEventListener('click', () => ctx.showTab('trace', { search: s.sku }));
    box.querySelector('[data-sum-fp]').addEventListener('click', () => ctx.showTab('history', { search: s.sku }));
    box.querySelector('[data-sum-count]').addEventListener('click', () => ctx.showTab('counts', { sku: s.sku, branch: st.branch !== 'all' ? st.branch : '' }));
  }

  function paintList() {
    const rows = ctx.data.stock.filter((r) => match(ctx, r, st, false));
    const box = $('im-s-list');
    const chips = [];
    if (st.search.trim()) chips.push('Search: <b>' + esc(st.search.trim()) + '</b>');
    if (st.branch !== 'all') chips.push('Branch: <b>' + esc(ctx.branchById[st.branch] || st.branch) + '</b>');
    if (st.status !== 'all') chips.push('Status: <b>' + esc((STATUS.find((x) => x[0] === st.status) || [])[1] || st.status) + '</b>');
    if (!rows.length) {
      box.innerHTML = (chips.length ? '<div class="active-filters"><span class="active-filters-label">Filters:</span> ' + chips.map((c) => '<span class="filter-chip">' + c + '</span>').join('') + '</div>' : '') +
        emptyBox(ctx.data.stock.length ? 'No rows match this filter.' : 'No stock rows yet — a row appears once a SKU has had a movement at a branch.');
      return;
    }
    const sorted = applySort(rows, st.sort, comps);
    const shown = sorted.slice(0, st.shown);
    box.innerHTML = '<div class="muted im-count">' + (chips.length ? chips.join(' · ') + ' — ' : '') + 'showing ' + num(shown.length) + ' of ' + plural(rows.length, 'row') + '</div>' +
      '<div class="table-scroll table-2col"><table class="im-stocktable"><thead><tr><th>SKU</th><th>Product name</th><th>Branch</th><th>Available</th><th>Reserved</th><th>Status</th><th>Weight on hand</th><th>Next count due</th><th>Last count</th><th>Product line</th><th>Metal purity</th><th></th></tr></thead><tbody>' +
      shown.map((r) => {
        const p = r.products || {};
        const canCount = !ctx.who.isScoped || String(r.branch_id) === String(ctx.employee.branch_id);
        return '<tr class="im-srow' + (r._low ? ' im-low' : '') + '" data-sku="' + esc(r.sku) + '" data-branch="' + r.branch_id + '">' +
          '<td data-label="SKU"><b>' + esc(r.sku) + '</b></td><td data-label="Product name">' + esc(p.item_name || '—') + '</td>' +
          '<td data-label="Branch">' + (ctx.branchById[r.branch_id] ? branchBadge(esc, ctx.branchById[r.branch_id], r.branch_id, ctx.branches) : '') + '</td>' +
          '<td data-label="Available"><span class="im-qty">' + num(r.qty_available) + '</span></td><td data-label="Reserved">' + (Number(r.qty_reserved) ? '<span class="im-reserved">' + num(r.qty_reserved) + '</span>' : '<span class="muted">0</span>') + '</td>' +
          '<td data-label="Status"><span class="badge ' + (r._low ? 'low' : 'ok') + '">' + (r._low ? '⚠ LOW STOCK' : 'OK') + '</span></td>' +
          '<td data-label="Weight on hand">' + weight(r.total_grams_on_hand) + '</td>' +
          '<td data-label="Next count due">' + fmtDate(new Date(r._due).toISOString()) + (r._overdue ? ' <span class="badge low">DUE</span>' : '') + '</td>' +
          '<td data-label="Last count" class="im-sec">' + (r._last ? fmtDate(r._last) : '<span class="muted">Never counted</span>') + '</td>' +
          '<td data-label="Product line" class="im-sec">' + esc(p.product_line || '—') + '</td><td data-label="Metal purity" class="im-sec">' + esc(p.metal_purity || '—') + '</td>' +
          '<td data-label="" class="full-row"><div class="im-actions"><button type="button" class="btn small secondary" data-hist>History</button>' +
          '<details class="im-more"><summary class="btn small secondary">More</summary><div class="im-more-menu"><button type="button" data-trace>Trace product</button><button type="button" data-fp>Factory purchases</button>' +
          (canCount ? '<button type="button" data-count>Log physical count</button>' : '') + '</div></details></div></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (shown.length < sorted.length ? '<div class="im-showmore"><span class="muted">' + num(sorted.length - shown.length) + ' more rows</span> <button type="button" class="btn small secondary" id="im-s-more-btn">Show more</button></div>' : '');
    box.querySelectorAll('tr.im-srow').forEach((tr) => {
      const sku = tr.dataset.sku, br = Number(tr.dataset.branch);
      tr.addEventListener('click', (ev) => { if (ev.target.closest('button, a, details, summary, input, select')) return; ctx.openMovement(sku, br); });
      tr.querySelector('[data-hist]').addEventListener('click', () => ctx.openMovement(sku, br));
      tr.querySelector('[data-trace]').addEventListener('click', () => ctx.showTab('trace', { search: sku }));
      tr.querySelector('[data-fp]').addEventListener('click', () => ctx.showTab('history', { search: sku }));
      const c = tr.querySelector('[data-count]'); if (c) c.addEventListener('click', () => ctx.showTab('counts', { sku, branch: String(br) }));
      tr.querySelectorAll('.im-more-menu button').forEach((b) => b.addEventListener('click', () => { const d = tr.querySelector('details'); if (d) d.open = false; }));
    });
    const more = $('im-s-more-btn');
    if (more) more.addEventListener('click', () => { st.shown += 150; paintList(); });
  }

  function paintAll() {
    const forSearch = ctx.data.stock.filter((r) => r._text.includes(st.search.trim().toLowerCase()));
    paintChips(); paintSummary(forSearch); paintList();
  }

  let timer = null;
  $('im-s-search').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { st.search = e.target.value; st.shown = PAGE; paintAll(); }, 220); });
  $('im-s-status').addEventListener('change', (e) => { st.status = e.target.value; st.shown = PAGE; paintAll(); });
  const bsel = $('im-s-branch'); if (bsel) bsel.addEventListener('change', (e) => { st.branch = e.target.value; st.shown = PAGE; paintAll(); });
  wireSortControl('im-s-sortf', 'im-s-sortd', st.sort, () => { st.shown = PAGE; paintList(); });
  $('im-s-clear').addEventListener('click', () => {
    st.search = ''; st.branch = 'all'; st.status = 'all'; st.shown = PAGE; $('im-s-search').value = ''; $('im-s-status').value = 'all'; if (bsel) bsel.value = 'all'; paintAll();
  });
  $('im-s-filters').addEventListener('click', () => { const open = bar.classList.toggle('im-filters-open'); $('im-s-filters').setAttribute('aria-expanded', String(open)); });
  paintAll();
  if (opts && opts.focus) $('im-s-search').focus();
}
