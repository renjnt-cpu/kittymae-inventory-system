// Sales & Profit Dashboard -- the Overview tab: 17 KPI cards (each with the previous comparable period, the change, and a green / red / gray arrow that follows
// what the change MEANS: lower expenses are good, higher refunds are not), the sales trend, the profit breakdown, channel / product / expense / stock / capital panels,
// and the detailed sales table. Click a KPI card to see the transactions behind it.
import { api, esc, money, moneyShort, int, pct, fin, change, toneOf, friendly, defaultGrain, GRAINS, rangeText, fmtDateTime } from './sdCore.js?v=20261007a';
import { kpiCard, panel, lockedBox, loadingBox, errorBox, emptyBox, badge, openDrawer, hbars, donut, lineChart, waterfall, trendLabels, seriesOf, C, PALETTE, kvRow, closeDrawer } from './sdUi.js?v=20261007a';
import { createTable } from './sdTable.js?v=20261007a';
import { COLS, ROW_TITLE } from './sdColumns.js?v=20261007a';

// ---------------------------------------------------------------- the 17 cards
// (There is deliberately no "Cash Available" card: it came from the Finance > Transactions ledger, which does not see the real money -- Ren, 2026-10-07.)
const prevText = (p, f) => 'Previous: ' + (p === null || p === undefined ? '—' : f(p));
function mk(def) { return def; }
const covWarn = (c) => c.unknown ? { text: 'Cost data missing', tone: 'orange' } : (c.partial ? { text: 'Partial · ' + (c.pct === null || c.pct === undefined ? '?' : Math.round(c.pct)) + '% costed', tone: 'yellow' } : null);

/** Each card: label, which rows of the result it reads, how it reads as "good", which permission shows it, and which table opens when it is clicked. */
const KPIS = [
  mk({ key: 'gross_sales', row: 1, label: 'Gross Sales', need: 'sales', good: 'up', hint: 'Selling price of everything sold, before discounts and refunds.',
    card: (d) => ({ v: d.gross_sales, f: money, sub: 'Before discounts and refunds' }) }),
  mk({ key: 'net_sales', row: 1, label: 'Net Sales', need: 'sales', good: 'up', hint: 'Gross Sales − Discounts − Refunds.',
    card: (d) => ({ v: d.net_sales, f: money, sub: 'Gross − discounts − refunds' }) }),
  mk({ key: 'gross_profit', row: 1, label: 'Gross Profit', need: ['sales', 'profit'], good: 'up', hint: 'Net Sales − Cost of Goods Sold (what the products you actually sold cost). Lines whose product has no supplier price are left out, never counted as zero cost.',
    card: (d) => ({ v: d.gross_profit, f: money, sub: d.coverage.unknown ? 'No supplier prices on what was sold' : 'Gross margin ' + pct(d.gross_margin, 1), warn: covWarn(d.coverage), unknown: d.gross_profit === null || d.gross_profit === undefined }) }),
  mk({ key: 'net_profit', row: 1, label: 'Net Profit', need: ['sales', 'profit', 'expenses'], good: 'up', hint: 'Gross Profit − Operating Expenses.',
    card: (d) => ({ v: d.net_profit, f: money, sub: d.coverage.unknown ? 'Needs supplier prices' : 'After operating expenses', warn: covWarn(d.coverage), unknown: d.net_profit === null || d.net_profit === undefined }) }),
  mk({ key: 'net_margin', row: 1, label: 'Net Profit Margin', need: ['sales', 'profit', 'expenses'], good: 'up', kind: 'pp', hint: 'Net Profit ÷ Net Sales × 100.',
    card: (d) => ({ v: d.net_margin, f: (x) => pct(x, 2), sub: 'Net profit ÷ net sales', warn: covWarn(d.coverage), unknown: d.net_margin === null || d.net_margin === undefined }) }),
  mk({ key: 'total_orders', row: 1, label: 'Total Orders', need: 'sales', good: 'up', hint: 'Orders placed in the period (any status). Completed orders are the ones counted as sales.',
    card: (d) => ({ v: d.orders_total, f: int, sub: int(d.orders_completed) + ' completed · ' + int(d.orders_cancelled) + ' cancelled' }) }),

  mk({ key: 'total_purchases', row: 2, label: 'Total Purchases', need: 'cost', good: 'neutral', hint: 'What was bought in the period (deliveries recorded in the ERP). This is NOT the cost of what was sold.',
    card: (d) => ({ v: d.purchases, f: money, sub: int(d.purchase_units) + ' pcs · ' + int(d.purchase_deliveries) + ' deliveries', warn: d.purchase_unpriced > 0 ? { text: int(d.purchase_unpriced) + ' unpriced', tone: 'orange' } : null }) }),
  mk({ key: 'cogs', row: 2, label: 'COGS (Capital Used)', show: (c) => c.sales && (c.profit || c.cost), good: 'neutral', hint: 'Cost of Goods Sold: what the products you actually sold cost — not what you purchased.',
    card: (d) => ({ v: d.cogs, f: money, sub: 'Cost of what was sold', warn: covWarn(d.coverage), unknown: d.cogs === null || d.cogs === undefined }) }),
  mk({ key: 'opex', row: 2, label: 'Operating Expenses', need: 'expenses', good: 'down', hint: 'Business bills due in the period (rent, utilities, salaries, services…). Personal bills and supplier payments are not included.',
    card: (d) => ({ v: d.opex, f: money, sub: int(d.opex_bills) + ' bills due', warn: d.opex_no_amount > 0 ? { text: int(d.opex_no_amount) + ' with no amount', tone: 'orange' } : null }) }),
  mk({ key: 'inventory_value', row: 2, label: 'Inventory Value', show: (c) => c.cost || c.inventory, good: 'neutral', hint: 'Stock on hand × supplier price (cost). Selling-price value is shown underneath.',
    card: (d, can) => {
      const noHist = d.inventory_units === null || d.inventory_units === undefined;
      if (can.cost) return { v: noHist ? null : d.inventory_cost_value, f: money, sub: can.inventory && !noHist ? 'Retail ' + money(d.inventory_retail_value) + ' · ' + int(d.inventory_units) + ' pcs' : '',
        warn: noHist ? { text: 'No stock history yet', tone: 'gray' } : (d.inventory_cost_value === null || d.inventory_cost_value === undefined ? { text: 'Cost data missing', tone: 'orange' }
          : (d.inventory_units_costed < d.inventory_units_total ? { text: 'Partial · ' + Math.round(d.inventory_units_costed / Math.max(d.inventory_units_total, 1) * 100) + '% costed', tone: 'yellow' } : null)),
        unknown: noHist || d.inventory_cost_value === null || d.inventory_cost_value === undefined };
      return { v: noHist ? null : d.inventory_retail_value, f: money, sub: 'At selling price · ' + int(d.inventory_units) + ' pcs', unknown: noHist };
    } }),
  mk({ key: 'receivables', row: 2, label: 'Accounts Receivable', need: 'sales', good: 'down', hint: 'COD parcels that were delivered but the courier has not remitted yet (LBC Monitoring).',
    card: (d) => ({ v: d.receivables, f: money, sub: int(d.receivable_parcels) + ' COD parcels not remitted' }) }),
  mk({ key: 'payables', row: 2, label: 'Accounts Payable', need: 'expenses', good: 'down', hint: 'What is still owed on business bills (unpaid balances).',
    card: (d) => ({ v: d.payables, f: money, sub: int(d.payable_bills) + ' unpaid bills' }) }),

  mk({ key: 'items_sold', row: 3, label: 'Items Sold', need: 'sales', good: 'up', hint: 'Pieces sold, less pieces returned.',
    card: (d) => ({ v: d.items_sold, f: int, sub: int(d.units_returned) + ' returned' }) }),
  mk({ key: 'aov', row: 3, label: 'Average Order Value', need: 'sales', good: 'up', hint: 'Net Sales ÷ Completed Orders.',
    card: (d) => ({ v: d.aov, f: money, sub: 'Net sales ÷ completed orders' }) }),
  mk({ key: 'capital_invested', row: 3, label: 'Total Capital Invested', need: 'capital', good: 'neutral', hint: 'Net owner contribution = initial + additional capital − owner withdrawals (Capital tab).',
    card: (d) => ({ v: d.capital_entries > 0 ? d.capital_net : null, f: money, sub: d.capital_entries > 0 ? 'Contributions ' + money(d.capital_contributions) + ' − withdrawals ' + money(d.capital_withdrawals) : 'Record capital on the Capital tab',
      warn: d.capital_entries > 0 ? null : { text: 'No capital entries', tone: 'gray' }, unknown: !(d.capital_entries > 0) }) }),
  mk({ key: 'refunds', row: 3, label: 'Refunds', need: 'sales', good: 'down', hint: 'Money taken back from sales: orders returned or cancelled after delivery, plus refunds recorded in the Refunds module that reduce sales.',
    card: (d) => ({ v: d.refunds, f: money, sub: int(d.orders_returned) + ' returned orders' }) }),
  mk({ key: 'discounts', row: 3, label: 'Discounts', need: 'sales', good: 'down', hint: 'Discounts given on completed sales.',
    card: (d) => ({ v: d.discounts, f: money, sub: 'On completed sales' }) }),
];
const DRILL = {
  gross_sales: { kind: 'sales', extra: { row_kind: 'Sale' }, sort: 'gross', note: 'Every completed sale in the period. The Gross column adds up to the Gross Sales card.' },
  net_sales: { kind: 'sales', extra: {}, sort: 'net', note: 'Sales, returns and refunds in the period. The Net column adds up to the Net Sales card.' },
  gross_profit: { kind: 'sales', extra: { row_kind: 'Sale,Return' }, sort: 'gp', note: 'Lines flagged COST DATA MISSING have no supplier price and are left out of gross profit.' },
  net_profit: { kind: 'sales', extra: {}, sort: 'net', note: 'Each line with its share of operating expenses (shared in proportion to net sales).' },
  net_margin: { kind: 'sales', extra: {}, sort: 'margin', note: 'Each line with its margin.' },
  total_orders: { kind: 'sales', extra: { row_kind: 'Sale' }, sort: 'date', note: 'The completed sales in the period, one line per item.' },
  total_purchases: { kind: 'purchases', extra: {}, sort: 'total', note: 'Deliveries recorded in the ERP in the period.' },
  cogs: { kind: 'sales', extra: { row_kind: 'Sale,Return' }, sort: 'cogs', note: 'Cost of goods sold = pieces sold × supplier price. Returns give the cost back.' },
  opex: { kind: 'expenses', extra: {}, sort: 'amount', note: 'Business bills due in the period.' },
  inventory_value: { kind: 'inventory', extra: {}, sort: 'retail_value', note: 'Stock by SKU (today’s quantities).' },
  receivables: { kind: 'receivables', extra: {}, sort: 'ship_date', note: 'Delivered COD parcels the courier has not remitted yet.' },
  payables: { kind: 'payables', extra: {}, sort: 'due_date', note: 'Business bills with an unpaid balance (today).' },
  items_sold: { kind: 'sales', extra: { row_kind: 'Sale,Return' }, sort: 'qty', note: 'Pieces sold and returned.' },
  aov: { kind: 'sales', extra: { row_kind: 'Sale' }, sort: 'net', note: 'Completed sales in the period.' },
  refunds: { kind: 'sales', extra: { row_kind: 'Return,Refund' }, sort: 'refund', note: 'Returned orders and refunds that reduced sales. Refunds that only hand back money that was never part of a sale (excess payment, item unavailable) are on the Payments tab.' },
  discounts: { kind: 'sales', extra: { row_kind: 'Sale' }, sort: 'discount', note: 'Sorted by discount, largest first.' },
};

export function kpiCards(ov, settings) {
  const can = ov.can, cur = ov.cur || {}, prev = ov.prev || null;
  [cur, prev].forEach((o) => { if (o && !o.coverage) o.coverage = {}; });
  const visible = new Set((settings && settings.visible_kpis) || KPIS.map((k) => k.key));
  const allowed = (k) => k.show ? k.show(can) : (Array.isArray(k.need) ? k.need : [k.need]).every((x) => can[x]);
  const rows = [1, 2, 3].map((r) => KPIS.filter((k) => k.row === r && visible.has(k.key) && allowed(k)).map((k) => {
    const c = k.card(cur, can), p = prev ? k.card(prev, can) : null;
    const v = fin(c.v), pv = p ? fin(p.v) : null;
    const ch = change(v, pv, k.kind);
    const tone = toneOf(k.good, ch.dir);
    const vt = v === null ? '—' : c.f(v), valueHtml = v === null ? '<span class="sd-dash">—</span>' : esc(vt);
    return kpiCard({ label: k.label, value: valueHtml, sub: esc(c.sub || ''), warn: c.warn, unknown: c.unknown || v === null,
      long: vt.length >= 16 ? 2 : vt.length >= 14 ? 1 : 0, chip: { dir: v === null ? 'na' : ch.dir, text: v === null ? 'Not available yet' : ch.text, tone: v === null ? 'gray' : tone }, prev: esc(prevText(pv, c.f)), hint: k.hint + (ch.dir !== 'na' && ch.diff !== null && k.kind !== 'pp' ? ' Change: ' + money(ch.diff) + '.' : ''),
      go: DRILL[k.key] ? k.key : (k.key === 'capital_invested' ? k.key : null) });
  }));
  return rows.map((r) => r.length ? '<div class="sd-kpi-row">' + r.join('') + '</div>' : '').join('');
}

/** Opens the transactions behind a card. */
export function openDrill(key, ctx) {
  const d = DRILL[key];
  if (!d) { if (key === 'capital_invested') ctx.goTab('capital'); return; }
  const label = (KPIS.find((k) => k.key === key) || {}).label || 'Transactions';
  openDrawer({ wide: true, title: label, sub: rangeText(ctx.filters.range().from, ctx.filters.range().to), body: '<p class="muted">' + esc(d.note) + '</p><div id="sd-drill"></div>' });
  const can = ctx.can;
  createTable({ root: document.getElementById('sd-drill'), kind: d.kind, columns: COLS[d.kind], getFilters: () => ctx.filters.server(), extra: () => d.extra, sort: { key: d.sort, dir: d.sort === 'due_date' || d.sort === 'ship_date' ? 'asc' : 'desc' },
    size: 25, title: label, exportName: 'kpi-' + key, subtitle: () => ctx.filters.describe(), can: { cost: can.cost || can.profit, profit: can.profit, expenses: can.expenses }, rowTitle: ROW_TITLE[d.kind] });
}

// ---------------------------------------------------------------- the tab
function slot(root, html) { const el = document.createElement('div'); el.innerHTML = html; root.appendChild(el.firstElementChild); return root.lastElementChild; }
async function fill(el, loader, build, retry) {
  const body = el.querySelector('.sd-panel-body');
  body.innerHTML = loadingBox();
  try { const data = await loader(); body.innerHTML = build(data); return data; }
  catch (err) {
    if (err.denied) { body.innerHTML = lockedBox(err.message); return null; }
    body.innerHTML = errorBox(friendly(err), 'x'); const b = body.querySelector('[data-retry]'); if (b) b.addEventListener('click', retry); return null;
  }
}

export function renderOverview(root, ctx) {
  const { meta, filters, can } = ctx;
  const tok = { n: 0 };
  let grain = null;

  function draw() {
    const my = ++tok.n; const f = filters.server();
    const r = filters.range();
    if (!grain) grain = defaultGrain(r.from, r.to);
    root.innerHTML = '<div id="sd-kpis" class="sd-kpis">' + loadingBox('Loading the figures…') + '</div><div class="sd-grid" id="sd-ov-grid"></div>';
    const kp = root.querySelector('#sd-kpis'), grid = root.querySelector('#sd-ov-grid');
    const stale = () => my !== tok.n;

    // KPI cards -- the one call that drives the cards and the profit breakdown
    const ovP = api.overview(f).then((ov) => { if (stale()) return null; kp.innerHTML = kpiCards(ov, meta.settings) || emptyBox('No figures are available to you here.');
      kp.querySelectorAll('[data-drill]').forEach((b) => b.addEventListener('click', () => openDrill(b.dataset.drill, ctx))); return ov; })
      .catch((err) => { if (!stale()) { kp.innerHTML = errorBox(friendly(err), 'kpi'); const b = kp.querySelector('[data-retry]'); if (b) b.addEventListener('click', draw); } return null; });

    // Sales trend
    if (can.sales) {
      const el = slot(grid, panel('Sales Trend', '', { cls: 'sd-span-12', id: 'sd-p-trend', sub: 'Net sales' + (can.profit ? ', gross profit' : '') + (can.profit && can.expenses ? ' and net profit' : '') + ' over time',
        actions: '<label class="sd-inline">Group by <select id="sd-grain">' + GRAINS.map((g) => '<option value="' + g.id + '"' + (g.id === grain ? ' selected' : '') + '>' + g.label + '</option>').join('') + '</select></label>' }));
      const load = () => fill(el, () => api.trend(f, grain), (t) => {
        const labels = trendLabels(t.points, t.grain), series = [{ label: 'Net sales', color: C.sales, values: seriesOf(t.points, 'net_sales'), area: true }];
        let note = '';
        if (can.profit) { const gp = seriesOf(t.points, 'gross_profit'); series.push({ label: 'Gross profit', color: C.gross, values: gp }); if (gp.every((x) => x === null)) note = 'Gross profit and net profit appear once the products you sell have a supplier price (cost data is missing).'; }
        if (can.profit && can.expenses) series.push({ label: 'Net profit', color: C.net, values: seriesOf(t.points, 'net_profit') });
        return lineChart({ labels, series: series.filter((s) => s.values.some((x) => x !== null)), emptyText: 'No sales in this period.' }) + (note ? '<p class="muted sd-note">' + esc(note) + '</p>' : '');
      }, load);
      load();
      el.querySelector('#sd-grain').addEventListener('change', (e) => { grain = e.target.value; load(); });
    }

    // Profit breakdown (waterfall)
    if (can.sales) {
      const el = slot(grid, panel('Profit Breakdown', '', { cls: 'sd-span-7', sub: 'From gross sales down to net profit' }));
      ovP.then((ov) => { if (!ov || stale()) return; const c = ov.cur, cv = c.coverage || {};
        const steps = [{ label: 'Gross / Sales', value: c.gross_sales, kind: 'total', color: C.sales }, { label: 'Discounts', value: -c.discounts, kind: 'delta' }, { label: 'Refunds', value: -c.refunds, kind: 'delta' },
          { label: 'Net / Sales', value: c.net_sales, kind: 'total', color: C.sales }];
        const list = [['Gross Sales', money(c.gross_sales)], ['− Discounts', money(c.discounts)], ['− Refunds', money(c.refunds)], ['= Net Sales', money(c.net_sales)]];
        if (can.profit || can.cost) {
          if (cv.unknown) { steps.push({ label: 'COGS', value: null, kind: 'delta' }, { label: 'Gross / Profit', value: null, kind: 'total' }); list.push(['− COGS', 'Cost data missing'], ['= Gross Profit', 'Cost data missing']); if (can.expenses && can.profit) { steps.push({ label: 'Operating / Expenses', value: -c.opex, kind: 'delta' }, { label: 'Net / Profit', value: null, kind: 'total' }); list.push(['− Operating Expenses', money(c.opex)], ['= Net Profit', 'Cost data missing']); } }
          else {
            if (Math.abs(cv.net_uncosted) > 0.004) { steps.push({ label: 'Cost / missing', value: -cv.net_uncosted, kind: 'delta' }); list.push(['− Sales with cost missing (left out)', money(cv.net_uncosted)]); }
            steps.push({ label: 'COGS', value: -c.cogs, kind: 'delta' }); list.push(['− COGS', money(c.cogs)]);
            if (can.profit) { steps.push({ label: 'Gross / Profit', value: c.gross_profit, kind: 'total', color: C.gross }); list.push(['= Gross Profit', money(c.gross_profit)]); }
            if (can.profit && can.expenses) { steps.push({ label: 'Operating / Expenses', value: -c.opex, kind: 'delta' }, { label: 'Net / Profit', value: c.net_profit, kind: 'total', color: C.net }); list.push(['− Operating Expenses', money(c.opex)], ['= Net Profit', money(c.net_profit)]); }
          }
        }
        el.querySelector('.sd-panel-body').innerHTML = waterfall(steps) + '<details class="sd-fig"><summary>Show the figures</summary>' + list.map((x) => kvRow(x[0], esc(x[1]))).join('') + '</details>';
      });
    }

    // Sales by channel
    if (can.sales) {
      const el = slot(grid, panel('Sales by Channel', '', { cls: 'sd-span-5', sub: 'Net sales', actions: '<button type="button" class="act-link" data-tab="channels">See channels</button>' }));
      fill(el, () => api.breakdown(f, 'channel'), (b) => {
        const rows = b.rows.filter((r) => r.net_sales > 0); const tot = rows.reduce((s, r) => s + r.net_sales, 0);
        return rows.length ? donut(rows.map((r, i) => ({ label: r.group, value: r.net_sales, color: PALETTE[i % PALETTE.length] })), { center: moneyShort(tot), centerSub: 'net sales', format: moneyShort }) : emptyBox('No sales in this period.');
      }, draw);
    }

    // Top products
    if (can.sales) {
      const el = slot(grid, panel('Top Products', '', { cls: 'sd-span-7', sub: 'Top 10 by net sales', actions: '<button type="button" class="act-link" data-tab="products">See all products</button>' }));
      fill(el, () => api.table('products', f, { sort: 'net', dir: 'desc', size: 10 }), (t) => t.rows.length
        ? hbars(t.rows.map((r) => ({ label: r.product || r.sku, sub: r.sku, value: Math.max(r.net, 0) })), { format: moneyShort, color: C.sales }) : emptyBox('No sales in this period.'), draw);
    }

    // Expenses by category
    if (can.expenses) {
      const el = slot(grid, panel('Expenses by Category', '', { cls: 'sd-span-5', sub: 'Business bills due in the period', actions: '<button type="button" class="act-link" data-tab="expenses">See expenses</button>' }));
      fill(el, () => api.expenseSummary(f), (x) => x.by_category.length
        ? donut(x.by_category.slice(0, 8).map((r, i) => ({ label: r.category, value: r.amount, color: PALETTE[i % PALETTE.length] })), { center: moneyShort(x.cur.total), centerSub: 'expenses', format: moneyShort }) : emptyBox('No bills are due in this period.'), draw);
    }

    // Inventory summary
    if (can.inventory) {
      const el = slot(grid, panel('Inventory Summary', '', { cls: 'sd-span-6', sub: 'Stock today', actions: '<button type="button" class="act-link" data-tab="inventory">See inventory</button>' }));
      fill(el, () => api.inventorySummary(f), (s) => {
        const st = s.statuses || {}, order = ['IN STOCK', 'LOW STOCK', 'OUT OF STOCK', 'OVERSTOCK', 'SLOW MOVING', 'DEAD STOCK'], colors = { 'IN STOCK': '#2e7d32', 'LOW STOCK': '#d9602a', 'OUT OF STOCK': '#c62828', OVERSTOCK: '#1a56b0', 'SLOW MOVING': '#e0a030', 'DEAD STOCK': '#7f8c8d' };
        return '<div class="sd-mini">' + [['Units in stock', int(s.units)], ['SKUs in stock', int(s.skus_in_stock)], ['Retail value', money(s.retail_value)], can.cost ? ['Cost value', s.cost_value === null || s.cost_value === undefined ? 'Cost data missing' : money(s.cost_value)] : null,
          can.cost ? ['Potential gross profit', s.potential_gp === null || s.potential_gp === undefined ? '—' : money(s.potential_gp)] : null].filter(Boolean).map((x) => '<div><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>').join('') + '</div>' +
          hbars(order.filter((k) => st[k] && st[k].skus > 0).map((k) => ({ label: k, value: st[k].skus, color: colors[k] })), { format: (v) => int(v) + ' SKUs' });
      }, draw);
    }

    // Capital summary
    if (can.capital) {
      const el = slot(grid, panel('Capital Summary', '', { cls: 'sd-span-6', sub: 'Owner capital, stock and equipment', actions: '<button type="button" class="act-link" data-tab="capital">See capital</button>' }));
      fill(el, () => api.capitalSummary(f), (c) => '<div class="sd-mini">' + [['Capital contributions', money(c.contributions)], ['Owner withdrawals', money(c.withdrawals)], ['Net capital', money(c.net_contribution)],
        ['Inventory (at cost)', c.inventory_cost_value === null || c.inventory_cost_value === undefined ? 'Cost data missing' : money(c.inventory_cost_value)],
        ['Receivables', c.receivables === null || c.receivables === undefined ? '—' : money(c.receivables)], ['Equipment / assets', money(c.equipment)]]
        .map((x) => '<div><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>').join('') + '</div>', draw);
    }

    // Detailed sales table
    if (can.sales) {
      const el = slot(grid, panel('Detailed Sales', '<div id="sd-ov-sales"></div>', { cls: 'sd-span-12', sub: 'Every sale, return and refund in the period', actions: '<button type="button" class="act-link" data-tab="sales">Open the full Sales tab</button>' }));
      createTable({ root: el.querySelector('#sd-ov-sales'), kind: 'sales', columns: COLS.sales, getFilters: () => filters.server(), sort: { key: 'date', dir: 'desc' }, size: 10, title: 'Detailed Sales', exportName: 'sales',
        subtitle: () => filters.describe(), can: { cost: can.cost || can.profit, profit: can.profit, expenses: can.expenses }, rowTitle: ROW_TITLE.sales, searchPlaceholder: 'Search order #, customer, SKU, product…' });
    }
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => ctx.goTab(b.dataset.tab)));
    return ovP;
  }
  return { reload: draw, overview: () => null };
}
/** The 17 cards by name, for the Visible KPI Cards setting. */
export const KPI_LABELS = KPIS.map((k) => ({ key: k.key, label: k.label }));
void badge; void fmtDateTime; void closeDrawer;
