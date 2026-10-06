// Sales & Profit Dashboard -- the Sales, Products, Channels, Purchases, Inventory, Expenses and Payments tabs.
// Each tab asks the database for its own figures (so a slow or denied panel never blocks the others) and draws them with the shared charts and the shared table.
import { api, esc, money, moneyShort, int, pct, fin, change, toneOf, friendly, defaultGrain, GRAINS } from './sdCore.js?v=20261007f';
import { panel, lockedBox, loadingBox, errorBox, emptyBox, hbars, donut, lineChart, columnChart, trendLabels, seriesOf, C, PALETTE, badge } from './sdUi.js?v=20261007f';
import { createTable, staticTable } from './sdTable.js?v=20261007f';
import { COLS, ROW_TITLE } from './sdColumns.js?v=20261007f';
import { openDrill } from './sdOverview.js?v=20261007f';

// ---------------------------------------------------------------- shared bits
/** A row of figures; `chip` compares this period with the previous one. */
export function stats(items) {
  return '<div class="sd-stats">' + items.filter(Boolean).map((c) => {
    const ch = c.cmp ? change(c.cmp.cur, c.cmp.prev, c.cmp.kind) : null;
    const tone = ch ? toneOf(c.cmp.good || 'up', ch.dir) : 'gray';
    return '<div class="sd-stat sd-tone-' + tone + '"><span class="sd-stat-l">' + esc(c.label) + (c.warn ? ' ' + badge(c.warn, 'orange') : '') + '</span><span class="sd-stat-v">' + (c.html !== undefined ? c.html : esc(c.value)) + '</span>' +
      (c.sub ? '<span class="sd-stat-s">' + esc(c.sub) + '</span>' : '') +
      (ch && ch.dir !== 'na' ? '<span class="sd-chip sd-c-' + tone + '"><span aria-hidden="true">' + ({ up: '▲', down: '▼', flat: '▬' }[ch.dir] || '') + '</span> ' + esc(ch.text) + '</span><span class="sd-stat-s">Previous: ' + esc(c.f ? c.f(c.cmp.prev) : String(c.cmp.prev)) + '</span>' : '') + '</div>';
  }).join('') + '</div>';
}
async function fill(el, loader, build, retry) {
  const body = el.querySelector('.sd-panel-body');
  body.innerHTML = loadingBox();
  try { const data = await loader(); body.innerHTML = build(data); return data; }
  catch (err) {
    if (err.denied) { body.innerHTML = lockedBox(err.message); return null; }
    body.innerHTML = errorBox(friendly(err), 'x'); const b = body.querySelector('[data-retry]'); if (b) b.addEventListener('click', retry); return null;
  }
}
function add(root, html) { const t = document.createElement('div'); t.innerHTML = html; const el = t.firstElementChild; root.appendChild(el); return el; }
const tableCan = (can) => ({ cost: can.cost || can.profit, profit: can.profit, expenses: can.expenses });
const mkTable = (root, ctx, kind, o) => createTable(Object.assign({ root, kind, columns: COLS[kind], getFilters: () => ctx.filters.server(), subtitle: () => ctx.filters.describe(), can: tableCan(ctx.can), rowTitle: ROW_TITLE[kind] }, o));
const grainSelect = (grain) => '<label class="sd-inline">Group by <select class="sd-grain">' + GRAINS.map((g) => '<option value="' + g.id + '"' + (g.id === grain ? ' selected' : '') + '>' + g.label + '</option>').join('') + '</select></label>';

// ---------------------------------------------------------------- Sales
export function renderSales(root, ctx) {
  const { filters, can } = ctx; let grain = null; let token = 0;
  function draw() {
    const my = ++token, f = filters.server(), r = filters.range(); grain = grain || defaultGrain(r.from, r.to);
    root.innerHTML = '<div id="sd-s-sum"></div><div class="sd-grid" id="sd-s-grid"></div><div id="sd-s-table"></div>';
    const sum = add(root.querySelector('#sd-s-sum'), panel('Sales Summary', '', { sub: 'This period compared with the previous one' }));
    fill(sum, () => api.overview(f), (ov) => { const c = ov.cur, p = ov.prev || {};
      return stats([
        { label: 'Gross sales', html: esc(money(c.gross_sales)), cmp: { cur: c.gross_sales, prev: p.gross_sales, good: 'up' }, f: money },
        { label: 'Discounts', html: esc(money(c.discounts)), cmp: { cur: c.discounts, prev: p.discounts, good: 'down' }, f: money },
        { label: 'Refunds', html: esc(money(c.refunds)), cmp: { cur: c.refunds, prev: p.refunds, good: 'down' }, f: money },
        { label: 'Net sales', html: esc(money(c.net_sales)), cmp: { cur: c.net_sales, prev: p.net_sales, good: 'up' }, f: money },
        { label: 'Total orders', html: esc(int(c.orders_total)), cmp: { cur: c.orders_total, prev: p.orders_total, good: 'up' }, f: int },
        { label: 'Completed orders', html: esc(int(c.orders_completed)), cmp: { cur: c.orders_completed, prev: p.orders_completed, good: 'up' }, f: int },
        { label: 'Cancelled orders', html: esc(int(c.orders_cancelled)), cmp: { cur: c.orders_cancelled, prev: p.orders_cancelled, good: 'down' }, f: int },
        { label: 'Items sold', html: esc(int(c.items_sold)), cmp: { cur: c.items_sold, prev: p.items_sold, good: 'up' }, f: int },
        { label: 'Average order value', html: esc(money(c.aov)), cmp: { cur: c.aov, prev: p.aov, good: 'up' }, f: money },
        { label: 'Sales growth', html: esc(ov.prev ? (fin(p.net_sales) ? change(c.net_sales, p.net_sales).text : 'No change') : '—'), sub: ov.prev ? 'Net sales vs the previous period' : '' },
      ]); }, draw);
    const grid = root.querySelector('#sd-s-grid');
    const trendPanels = [];
    const mine = add(grid, panel('Sales vs COGS', '', { cls: 'sd-span-12', sub: 'Net sales against the cost of what was sold', actions: grainSelect(grain) }));
    trendPanels.push(mine);
    const gpP = can.profit ? add(grid, panel('Gross Profit Trend', '', { cls: 'sd-span-6' })) : null;
    const npP = can.profit && can.expenses ? add(grid, panel('Net Profit Trend', '', { cls: 'sd-span-6' })) : null;
    const loadTrend = async () => {
      let t; const bodies = [mine, gpP, npP].filter(Boolean).map((e) => e.querySelector('.sd-panel-body'));
      bodies.forEach((b) => { b.innerHTML = loadingBox(); });
      try { t = await api.trend(f, grain); } catch (err) { bodies.forEach((b) => { b.innerHTML = err.denied ? lockedBox(err.message) : errorBox(friendly(err)); }); return; }
      if (my !== token) return;
      const labels = trendLabels(t.points, t.grain), net = seriesOf(t.points, 'net_sales'), cogs = seriesOf(t.points, 'cogs');
      mine.querySelector('.sd-panel-body').innerHTML = columnChart({ labels, series: [{ label: 'Net sales', color: C.sales, values: net }].concat(can.profit || can.cost ? [{ label: 'COGS', color: C.cogs, values: cogs }] : []), emptyText: 'No sales in this period.' }) +
        ((can.profit || can.cost) && cogs.every((x) => x === null) ? '<p class="muted sd-note">COGS appears once the products you sell have a supplier price (cost data is missing).</p>' : '');
      if (gpP) gpP.querySelector('.sd-panel-body').innerHTML = lineChart({ labels, series: [{ label: 'Gross profit', color: C.gross, values: seriesOf(t.points, 'gross_profit'), area: true }], emptyText: 'Gross profit appears once supplier prices are filled in.' });
      if (npP) npP.querySelector('.sd-panel-body').innerHTML = lineChart({ labels, series: [{ label: 'Net profit', color: C.net, values: seriesOf(t.points, 'net_profit'), area: true }], emptyText: 'Net profit appears once supplier prices are filled in.' });
    };
    loadTrend();
    mine.querySelector('.sd-grain').addEventListener('change', (e) => { grain = e.target.value; loadTrend(); });
    const cat = add(grid, panel('Sales by Category', '', { cls: 'sd-span-12', sub: 'Net sales' }));
    fill(cat, () => api.breakdown(f, 'category'), (b) => b.rows.length ? hbars(b.rows.filter((x) => x.net_sales > 0).slice(0, 12).map((x) => ({ label: x.group, value: x.net_sales })), { format: moneyShort, color: C.sales }) : emptyBox('No sales in this period.'), draw);
    mkTable(root.querySelector('#sd-s-table'), ctx, 'sales', { sort: { key: 'date', dir: 'desc' }, size: 25, title: 'Sales', exportName: 'sales', searchPlaceholder: 'Search order #, customer, SKU, product, salesperson…' });
  }
  return { reload: draw };
}

// ---------------------------------------------------------------- Products
export function renderProducts(root, ctx) {
  const { filters, can } = ctx; let table = null;
  const PRESETS = [{ id: 'qty:desc', label: 'Best selling (most pieces)' }, { id: 'net:desc', label: 'Highest revenue' }, can.profit ? { id: 'gp:desc', label: 'Highest gross profit' } : null,
    can.profit ? { id: 'margin:desc', label: 'Highest margin' } : null, { id: 'net:asc', label: 'Lowest performing' }, { id: 'return_rate:desc', label: 'Highest return rate' }].filter(Boolean);
  function draw() {
    const f = filters.server();
    root.innerHTML = '<div class="sd-grid" id="sd-p-grid"></div><div class="card sd-sortbar"><div class="field"><label for="sd-p-rank">Rank products by</label><select id="sd-p-rank">' +
      PRESETS.map((p) => '<option value="' + p.id + '">' + esc(p.label) + '</option>').join('') + '</select></div></div><div id="sd-p-table"></div>';
    const grid = root.querySelector('#sd-p-grid');
    const top = add(grid, panel('Top 10 Products', '', { cls: 'sd-span-6', sub: 'By net sales' }));
    const bot = add(grid, panel('Bottom 10 Products', '', { cls: 'sd-span-6', sub: 'Lowest net sales among products that sold' }));
    const bars = (t) => t.rows.length ? hbars(t.rows.map((r) => ({ label: r.product || r.sku, sub: r.sku, value: Math.max(r.net, 0) })), { format: moneyShort, color: C.sales }) : emptyBox('No sales in this period.');
    fill(top, () => api.table('products', f, { sort: 'net', dir: 'desc', size: 10 }), bars, draw);
    fill(bot, () => api.table('products', f, { sort: 'net', dir: 'asc', size: 10 }), (t) => t.rows.length ? hbars(t.rows.map((r) => ({ label: r.product || r.sku, sub: r.sku, value: Math.max(r.net, 0) })), { format: moneyShort, color: C.cogs }) : emptyBox('No sales in this period.'), draw);
    table = mkTable(root.querySelector('#sd-p-table'), ctx, 'products', { sort: { key: 'net', dir: 'desc' }, size: 25, title: 'Product performance', exportName: 'product-performance', searchPlaceholder: 'Search SKU, product, category…' });
    root.querySelector('#sd-p-rank').addEventListener('change', (e) => { const [k, d] = e.target.value.split(':'); table.state.sort = { key: k, dir: d }; table.reload(); });
  }
  return { reload: draw };
}

// ---------------------------------------------------------------- Channels
const GROUPS = [{ id: 'channel', label: 'Sales channel', col: 'Channel' }, { id: 'shop', label: 'Shop', col: 'Shop' }, { id: 'branch', label: 'Branch', col: 'Branch' }, { id: 'salesperson', label: 'Salesperson', col: 'Salesperson' }, { id: 'customer', label: 'Customer (top 300)', col: 'Customer' }];
export function renderChannels(root, ctx) {
  const { filters, can } = ctx; let kind = 'channel'; let token = 0;
  const na = { render: () => '<span class="muted" title="Not tracked per channel in the ERP">—</span>' };
  function cols(label) {
    return [{ key: 'group', label }, { key: 'orders', label: 'Orders', type: 'int' }, { key: 'items_sold', label: 'Items', type: 'int' }, { key: 'gross_sales', label: 'Gross sales', type: 'money', total: 'gross_sales' },
      { key: 'discounts', label: 'Discounts', type: 'money', total: 'discounts' }, { key: 'refunds', label: 'Refunds', type: 'money', total: 'refunds' }, { key: 'net_sales', label: 'Net sales', type: 'money', total: 'net_sales' },
      { key: 'cogs', label: 'COGS', type: 'money', need: 'cost', render: (r) => r.cogs === null || r.cogs === undefined ? (r.cost_missing_lines > 0 ? badge('COST DATA MISSING', 'orange') : '<span class="muted">—</span>') : esc(money(r.cogs)) },
      { key: 'gross_profit', label: 'Gross profit', type: 'money', need: 'profit', total: 'gross_profit' }, { key: 'margin', label: 'Margin %', type: 'pct', need: 'profit' },
      { key: 'marketplace_fees', label: 'Marketplace fees', type: 'money', total: 'marketplace_fees' }, Object.assign({ key: 'ad_spend', label: 'Ad spend', type: 'money' }, na),
      Object.assign({ key: 'other_channel_expenses', label: 'Other channel expenses', type: 'money' }, na), { key: 'est_net_profit', label: 'Est. net profit (before shared expenses)', type: 'money', need: 'profit' }];
  }
  function draw() {
    const my = ++token, f = filters.server();
    root.innerHTML = '<div class="card sd-sortbar"><div class="field"><label for="sd-ch-by">Compare by</label><select id="sd-ch-by">' + GROUPS.map((g) => '<option value="' + g.id + '"' + (g.id === kind ? ' selected' : '') + '>' + g.label + '</option>').join('') + '</select></div></div><div class="sd-grid" id="sd-ch-grid"></div>';
    root.querySelector('#sd-ch-by').addEventListener('change', (e) => { kind = e.target.value; draw(); });
    const grid = root.querySelector('#sd-ch-grid'), g = GROUPS.find((x) => x.id === kind);
    const chart = add(grid, panel('Comparison', '', { cls: 'sd-span-12', sub: 'Net sales' + (can.profit ? ' and gross profit' : '') + ' by ' + g.label.toLowerCase() }));
    const tbl = add(grid, panel(g.label + ' detail', '<div id="sd-ch-t"></div>', { cls: 'sd-span-12' }));
    fill(chart, () => api.breakdown(f, kind), (b) => {
      if (my !== token) return '';
      const rows = b.rows.filter((r) => r.net_sales !== 0 || r.orders > 0);
      const t = tbl.querySelector('#sd-ch-t');
      staticTable(t, { columns: cols(g.col), rows: b.rows, totals: totalsOf(b.rows), title: g.label + ' performance', exportName: 'by-' + kind, subtitle: () => filters.describe(), can: { cost: can.cost || can.profit, profit: can.profit }, emptyText: 'No sales in this period.' });
      if (b.note) t.insertAdjacentHTML('beforeend', '<p class="muted sd-note">' + esc(b.note) + '</p>');
      return rows.length ? columnChart({ labels: rows.map((r) => r.group), series: [{ label: 'Net sales', color: C.sales, values: rows.map((r) => r.net_sales) }].concat(can.profit && rows.some((r) => r.gross_profit !== null && r.gross_profit !== undefined) ? [{ label: 'Gross profit', color: C.gross, values: rows.map((r) => fin(r.gross_profit)) }] : []) }) : emptyBox('No sales in this period.');
    }, draw);
  }
  const totalsOf = (rows) => ({ gross_sales: sum(rows, 'gross_sales'), discounts: sum(rows, 'discounts'), refunds: sum(rows, 'refunds'), net_sales: sum(rows, 'net_sales'), marketplace_fees: sum(rows, 'marketplace_fees'),
    gross_profit: rows.some((r) => r.gross_profit !== null && r.gross_profit !== undefined) ? rows.reduce((s, r) => s + (fin(r.gross_profit) || 0), 0) : null });
  const sum = (rows, k) => rows.reduce((s, r) => s + (fin(r[k]) || 0), 0);
  return { reload: draw };
}

// ---------------------------------------------------------------- Purchases
export function renderPurchases(root, ctx) {
  const { filters, can } = ctx; let grain = null; let token = 0;
  function draw() {
    const my = ++token, f = filters.server(), r = filters.range(); grain = grain || defaultGrain(r.from, r.to);
    root.innerHTML = '<div id="sd-pu-sum"></div><div class="sd-grid" id="sd-pu-grid"></div><div id="sd-pu-table"></div>';
    const sum = add(root.querySelector('#sd-pu-sum'), panel('Purchase Summary', '', { sub: 'Deliveries recorded in the ERP' }));
    fill(sum, () => api.purchaseSummary(f), (s) => { const c = s.cur, p = s.prev || {};
      return stats([
        { label: 'Total purchases (priced)', html: esc(money(c.total)), cmp: s.prev ? { cur: c.total, prev: p.total, good: 'neutral' } : null, f: money, warn: c.unpriced > 0 ? int(c.unpriced) + ' unpriced' : '' },
        { label: 'Pieces purchased', html: esc(int(c.units)), cmp: s.prev ? { cur: c.units, prev: p.units, good: 'neutral' } : null, f: int },
        { label: 'Deliveries', html: esc(int(c.deliveries)), cmp: s.prev ? { cur: c.deliveries, prev: p.deliveries, good: 'neutral' } : null, f: int },
        { label: 'Deliveries with no price', html: esc(int(c.unpriced)), sub: int(c.units_unpriced) + ' pieces — their cost is unknown, not zero' },
      ]) + (s.notes || []).map((n) => '<p class="muted sd-note">' + esc(n) + '</p>').join(''); }, draw);
    const grid = root.querySelector('#sd-pu-grid');
    const tr = add(grid, panel('Purchase Trend', '', { cls: 'sd-span-12', sub: 'Priced purchases over time', actions: grainSelect(grain) }));
    const bc = add(grid, panel('By Category', '', { cls: 'sd-span-6', sub: 'Priced purchases' })), bb = add(grid, panel('By Branch', '', { cls: 'sd-span-6', sub: 'Priced purchases' }));
    const loadTrend = () => fill(tr, () => api.trend(f, grain), (t) => columnChart({ labels: trendLabels(t.points, t.grain), series: [{ label: 'Purchases', color: C.sales, values: seriesOf(t.points, 'purchases') }], emptyText: 'No purchases in this period.' }), draw);
    loadTrend(); tr.querySelector('.sd-grain').addEventListener('change', (e) => { grain = e.target.value; loadTrend(); });
    api.purchaseSummary(f).then((s) => { if (my !== token) return;
      bc.querySelector('.sd-panel-body').innerHTML = s.by_category.length ? hbars(s.by_category.slice(0, 10).map((x) => ({ label: x.category, value: x.cost, sub: x.unpriced ? '(' + x.unpriced + ' unpriced)' : '' })), { format: moneyShort, color: C.sales }) : emptyBox('No purchases in this period.');
      bb.querySelector('.sd-panel-body').innerHTML = s.by_branch.length ? hbars(s.by_branch.map((x) => ({ label: x.branch, value: x.cost })), { format: moneyShort, color: C.blue2 }) : emptyBox('No purchases in this period.'); })
      .catch((err) => { [bc, bb].forEach((e) => { e.querySelector('.sd-panel-body').innerHTML = err.denied ? lockedBox(err.message) : errorBox(friendly(err)); }); });
    mkTable(root.querySelector('#sd-pu-table'), ctx, 'purchases', { sort: { key: 'date', dir: 'desc' }, size: 25, title: 'Purchases', exportName: 'purchases', searchPlaceholder: 'Search SKU, product, supplier, created by…' });
  }
  return { reload: draw };
}

// ---------------------------------------------------------------- Inventory
export function renderInventory(root, ctx) {
  const { filters, can } = ctx; let grain = null; let status = ''; let token = 0; let table = null;
  const ORDER = ['IN STOCK', 'LOW STOCK', 'OUT OF STOCK', 'OVERSTOCK', 'SLOW MOVING', 'DEAD STOCK'];
  const TONE = { 'IN STOCK': 'green', 'LOW STOCK': 'orange', 'OUT OF STOCK': 'red', OVERSTOCK: 'blue', 'SLOW MOVING': 'yellow', 'DEAD STOCK': 'gray' };
  function draw() {
    const my = ++token, f = filters.server(), r = filters.range(); grain = grain || defaultGrain(r.from, r.to);
    root.innerHTML = '<div id="sd-in-sum"></div><div class="sd-grid" id="sd-in-grid"></div><div class="card sd-chips-row" id="sd-in-status"></div><div id="sd-in-table"></div>';
    const sum = add(root.querySelector('#sd-in-sum'), panel('Inventory Summary', '', { sub: 'Stock today' }));
    fill(sum, () => api.inventorySummary(f), (s) => {
      const st = s.statuses || {}, th = s.thresholds || {};
      root.querySelector('#sd-in-status').innerHTML = '<span class="muted">Show:</span> <button type="button" class="sd-statuschip' + (status === '' ? ' on' : '') + '" data-st="">All stock</button>' +
        ORDER.map((k) => '<button type="button" class="sd-statuschip sd-b-' + TONE[k] + (status === k ? ' on' : '') + '" data-st="' + k + '">' + esc(k) + ' · ' + int((st[k] || {}).skus || 0) + '</button>').join('');
      root.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { status = b.dataset.st; root.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x.dataset.st === status)); if (table) table.reload(); }));
      return stats([
        { label: 'Units in stock', html: esc(int(s.units)) }, { label: 'SKUs in stock', html: esc(int(s.skus_in_stock)) },
        { label: 'Retail value', html: esc(money(s.retail_value)), sub: int(s.units_priced) + ' of ' + int(s.units) + ' units have a selling price' },
        can.cost ? { label: 'Cost value', html: s.cost_value === null || s.cost_value === undefined ? badge('Cost data missing', 'orange') : esc(money(s.cost_value)), sub: int(s.units_costed) + ' of ' + int(s.units) + ' units have a supplier price' } : null,
        can.cost ? { label: 'Potential gross profit', html: s.potential_gp === null || s.potential_gp === undefined ? '<span class="sd-dash">—</span>' : esc(money(s.potential_gp)), sub: 'Retail value − cost value' } : null,
        { label: 'Low stock', html: esc(int((st['LOW STOCK'] || {}).skus || 0)), sub: 'at or under the reorder level (default ' + int(th.low_stock_default) + ')' },
        { label: 'Out of stock', html: esc(int((st['OUT OF STOCK'] || {}).skus || 0)) },
        { label: 'Slow-moving', html: esc(int((st['SLOW MOVING'] || {}).skus || 0)), sub: 'no sale for ' + int(th.slow_moving_days) + '+ days' },
        { label: 'Dead stock', html: esc(int((st['DEAD STOCK'] || {}).skus || 0)), sub: 'no sale for ' + int(th.dead_stock_days) + '+ days' },
      ]) + (s.no_history ? '<p class="muted sd-note">The ERP’s stock history starts on ' + esc(s.history_starts || '—') + '; earlier stock levels are unknown, not zero.</p>' : ''); }, draw);
    const grid = root.querySelector('#sd-in-grid');
    const tr = add(grid, panel('Inventory Value Trend', '', { cls: 'sd-span-12', sub: 'Stock of each period’s last day, worked back from today’s quantities', actions: grainSelect(grain) }));
    const loadTrend = () => fill(tr, () => api.inventoryTrend(f, grain), (t) => {
      const pts = t.points, labels = pts.map((p) => p.bucket.slice(5)), retail = pts.map((p) => fin(p.retail_value)), cost = pts.map((p) => fin(p.cost_value));
      const series = [{ label: 'At selling price', color: C.sales, values: retail, area: true }]; if (can.cost) series.push({ label: 'At cost', color: C.gross, values: cost });
      return lineChart({ labels: pts.map((p) => { const d = p.as_of; return d.slice(5, 7) + '/' + d.slice(8); }), series, emptyText: 'No stock history in this period.' }) +
        '<p class="muted sd-note">Points before the opening balance (' + esc(t.history_starts || '—') + ') are left blank — stock then is unknown, not zero.' + (can.cost && cost.every((x) => x === null) ? ' “At cost” appears once products have a supplier price.' : '') + '</p>';
    }, draw);
    loadTrend(); tr.querySelector('.sd-grain').addEventListener('change', (e) => { grain = e.target.value; loadTrend(); });
    table = mkTable(root.querySelector('#sd-in-table'), ctx, 'inventory', { sort: { key: 'retail_value', dir: 'desc' }, size: 25, title: 'Inventory', exportName: 'inventory', extra: () => (status ? { stock_status: status } : {}), searchPlaceholder: 'Search SKU, product, category…' });
    void my;
  }
  return { reload: draw };
}

// ---------------------------------------------------------------- Expenses
export function renderExpenses(root, ctx) {
  const { filters, can } = ctx; let grain = null;
  function draw() {
    const f = filters.server(), r = filters.range(); grain = grain || defaultGrain(r.from, r.to);
    root.innerHTML = '<div id="sd-ex-sum"></div><div class="sd-grid" id="sd-ex-grid"></div><div id="sd-ex-table"></div>';
    const sum = add(root.querySelector('#sd-ex-sum'), panel('Expense Summary', '', { sub: 'Business expenses due in the period', actions: '<button type="button" class="btn small secondary" id="sd-ex-open">See unpaid expenses (payables)</button>' }));
    fill(sum, () => api.expenseSummary(f), (s) => { const c = s.cur, p = s.prev;
      return stats([
        { label: 'Total expenses', html: esc(money(c.total)), cmp: p ? { cur: c.total, prev: p.total, good: 'down' } : null, f: money, warn: c.no_amount > 0 ? int(c.no_amount) + ' with no amount' : '' },
        { label: 'Expenses', html: esc(int(c.bills)), cmp: p ? { cur: c.bills, prev: p.bills, good: 'neutral' } : null, f: int },
        { label: 'Paid so far', html: esc(money(c.paid)) }, { label: 'Still unpaid', html: esc(money(c.unpaid)) },
      ]) + '<p class="muted sd-note">' + esc(s.basis) + '</p>'; }, draw);
    root.querySelector('#sd-ex-open').addEventListener('click', () => openDrill('payables', ctx));
    const grid = root.querySelector('#sd-ex-grid');
    const cat = add(grid, panel('Expenses by Category', '', { cls: 'sd-span-6', sub: 'Biggest first' })), top = add(grid, panel('Top Expense Categories', '', { cls: 'sd-span-6', sub: 'Share of the total' }));
    api.expenseSummary(f).then((s) => {
      cat.querySelector('.sd-panel-body').innerHTML = s.by_category.length ? donut(s.by_category.slice(0, 8).map((x, i) => ({ label: x.category, value: x.amount, color: PALETTE[i % PALETTE.length] })), { center: moneyShort(s.cur.total), centerSub: 'expenses', format: moneyShort }) : emptyBox('No expenses are due in this period.');
      top.querySelector('.sd-panel-body').innerHTML = s.by_category.length ? hbars(s.by_category.slice(0, 8).map((x) => ({ label: x.category, value: x.amount, sub: x.pct === null || x.pct === undefined ? '' : x.pct + '%' })), { format: moneyShort, color: C.opex }) : emptyBox('No expenses are due in this period.'); })
      .catch((err) => { [cat, top].forEach((e) => { e.querySelector('.sd-panel-body').innerHTML = err.denied ? lockedBox(err.message) : errorBox(friendly(err)); }); });
    const tr = add(grid, panel('Expense Trend', '', { cls: 'sd-span-12', sub: 'Expenses due over time', actions: grainSelect(grain) }));
    const loadTrend = () => fill(tr, () => api.trend(f, grain), (t) => columnChart({ labels: trendLabels(t.points, t.grain), series: [{ label: 'Operating expenses', color: C.opex, values: seriesOf(t.points, 'opex') }], emptyText: 'No expenses are due in this period.' }), draw);
    loadTrend(); tr.querySelector('.sd-grain').addEventListener('change', (e) => { grain = e.target.value; loadTrend(); });
    mkTable(root.querySelector('#sd-ex-table'), ctx, 'expenses', { sort: { key: 'date', dir: 'desc' }, size: 25, title: 'Expenses', exportName: 'expenses', searchPlaceholder: 'Search category, description, payee…' });
  }
  return { reload: draw };
}

// ---------------------------------------------------------------- Payments
export function renderPayments(root, ctx) {
  const { filters } = ctx;
  function draw() {
    const f = filters.server();
    root.innerHTML = '<div id="sd-pa-sum"></div><div class="sd-grid" id="sd-pa-grid"></div><div id="sd-pa-table"></div>';
    const sum = add(root.querySelector('#sd-pa-sum'), panel('Payments Summary', '', { sub: 'Money collected and refunded in the period' }));
    const grid = root.querySelector('#sd-pa-grid');
    const ch = add(grid, panel('Payment Method Breakdown', '', { cls: 'sd-span-5', sub: 'Collected' })), tb = add(grid, panel('By Payment Method', '<div id="sd-pa-t"></div>', { cls: 'sd-span-7' }));
    api.payments(f).then((p) => {
      const k = p.kpis;
      sum.querySelector('.sd-panel-body').innerHTML = stats([
        { label: 'Total collected', html: esc(money(k.collected)) }, { label: 'Refunded', html: esc(money(k.refunded)) }, { label: 'Marketplace fees', html: esc(money(k.marketplace_fees)) },
        { label: 'Net collections', html: esc(money(k.net)), sub: 'Collected − refunded − fees' },
        { label: 'Pending COD', html: esc(money(k.pending_cod)), sub: 'On parcels still in transit' }, { label: 'Layaway balances due', html: esc(money(k.layaway_balance_due)), sub: int(k.layaway_open) + ' open layaways' },
        { label: 'Failed payments', html: '<span class="sd-dash">—</span>', sub: 'Not tracked in the ERP' }, { label: 'Gateway fees', html: '<span class="sd-dash">—</span>', sub: 'Not tracked in the ERP' },
      ]) + p.notes.map((n) => '<p class="muted sd-note">' + esc(n) + '</p>').join('');
      const rows = p.methods.filter((m) => m.collected > 0);
      ch.querySelector('.sd-panel-body').innerHTML = rows.length ? donut(rows.map((m, i) => ({ label: m.method, value: m.collected, color: PALETTE[i % PALETTE.length] })), { center: moneyShort(k.collected), centerSub: 'collected', format: moneyShort }) : emptyBox('Nothing was collected in this period.');
      staticTable(tb.querySelector('#sd-pa-t'), { columns: [{ key: 'method', label: 'Method' }, { key: 'transactions', label: 'Payments', type: 'int' }, { key: 'collected', label: 'Collected', type: 'money', total: 'collected' }, { key: 'refunded', label: 'Refunded', type: 'money', total: 'refunded' }, { key: 'net', label: 'Net', type: 'money', total: 'net' }],
        rows: p.methods, totals: { collected: p.methods.reduce((s, m) => s + m.collected, 0), refunded: p.methods.reduce((s, m) => s + m.refunded, 0), net: p.methods.reduce((s, m) => s + m.net, 0) }, title: 'Payments by method', exportName: 'payments-by-method', subtitle: () => filters.describe(), emptyText: 'No payments in this period.' });
    }).catch((err) => { const m = err.denied ? lockedBox(err.message) : errorBox(friendly(err)); [sum, ch, tb].forEach((e) => { e.querySelector('.sd-panel-body').innerHTML = m; }); });
    mkTable(root.querySelector('#sd-pa-table'), ctx, 'payments', { sort: { key: 'date', dir: 'desc' }, size: 25, title: 'Payments', exportName: 'payments', searchPlaceholder: 'Search reference, customer, method…' });
  }
  return { reload: draw };
}
