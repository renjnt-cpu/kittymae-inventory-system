// Sales & Profit Dashboard -- the Reports tab (the eight reports, each exported for the period and filters chosen above) and the Dashboard Settings tab.
import { api, esc, money, friendly, fmtDateTime, bucketLabel, defaultGrain, rangeText, PRESETS } from './sdCore.js?v=20261007g';
import { panel, loadingBox, errorBox, toast } from './sdUi.js?v=20261007g';
import { fetchAllRows, exportData } from './sdTable.js?v=20261007g';
import { COLS } from './sdColumns.js?v=20261007g';
import { KPI_LABELS } from './sdOverview.js?v=20261007g';

// ---------------------------------------------------------------- Reports
const REPORTS = [
  { id: 'sales', title: 'Sales report', desc: 'Every sale, return and refund in the period, one line each, with the cost and profit columns you are allowed to see.', kind: 'sales', need: 'sales', sort: 'date' },
  { id: 'profit', title: 'Profit report', desc: 'For each day / week / month in the range: gross sales, discounts, refunds, net sales, cost of goods sold, gross profit, operating expenses and net profit.', custom: 'profit', need: 'profit' },
  { id: 'purchase', title: 'Purchase report', desc: 'Every delivery recorded in the period, with its price (or “price missing”).', kind: 'purchases', need: 'cost', sort: 'date' },
  { id: 'inventory', title: 'Inventory report', desc: 'Every SKU in stock with its stock status, value at cost and at selling price, and last sale.', kind: 'inventory', need: 'inventory', sort: 'retail_value' },
  { id: 'expense', title: 'Expense report', desc: 'The business expenses due in the period, with category, payee, amount, paid and unpaid.', kind: 'expenses', need: 'expenses', sort: 'date' },
  { id: 'capital', title: 'Capital report', desc: 'Owner capital contributions, withdrawals and asset purchases up to the end of the period (voided entries marked).', kind: 'capital', need: 'capital', sort: 'date', extra: { capital_scope: 'all' } },
  { id: 'payment', title: 'Payment report', desc: 'Every payment collected and refunded in the period, by method.', kind: 'payments', need: 'sales', sort: 'date' },
  { id: 'product', title: 'Product performance report', desc: 'Every product that sold in the period: quantity, sales, cost, profit, margin, returns.', kind: 'products', need: 'sales', sort: 'net' },
];
const PROFIT_COLS = [
  { key: 'period', label: 'Period' }, { key: 'gross_sales', label: 'Gross sales', type: 'money', total: 'gross_sales' }, { key: 'discounts', label: 'Discounts', type: 'money', total: 'discounts' },
  { key: 'refunds', label: 'Refunds', type: 'money', total: 'refunds' }, { key: 'net_sales', label: 'Net sales', type: 'money', total: 'net_sales' }, { key: 'cogs', label: 'COGS', type: 'money', total: 'cogs' },
  { key: 'gross_profit', label: 'Gross profit', type: 'money', total: 'gross_profit' }, { key: 'opex', label: 'Operating expenses', type: 'money', total: 'opex' }, { key: 'net_profit', label: 'Net profit', type: 'money', total: 'net_profit' },
];

export function renderReports(root, ctx) {
  const { filters, can } = ctx;
  const mine = REPORTS.filter((r) => can[r.need]);
  function draw() {
    const r = filters.range();
    root.innerHTML = panel('Reports', '<div class="sd-reports">' + mine.map((rp) => '<div class="sd-report"><h4>' + esc(rp.title) + '</h4><p class="muted">' + esc(rp.desc) + '</p><div class="sd-report-btns" data-r="' + rp.id + '">' +
      (can.export ? '<button type="button" class="btn small" data-fmt="csv">CSV</button><button type="button" class="btn small" data-fmt="xlsx">Excel</button><button type="button" class="btn small" data-fmt="pdf">PDF</button><button type="button" class="btn small secondary" data-fmt="print">Print</button>' : '<span class="muted">You do not have the Export permission.</span>') +
      '</div></div>').join('') + '</div>', { sub: 'Each report covers ' + rangeText(r.from, r.to) + ' and every filter chosen above.' });
    root.querySelectorAll('.sd-report-btns [data-fmt]').forEach((b) => b.addEventListener('click', async () => {
      const wrap = b.parentElement, rp = REPORTS.find((x) => x.id === wrap.dataset.r); const old = b.textContent;
      wrap.querySelectorAll('button').forEach((x) => { x.disabled = true; }); b.textContent = 'Preparing…';
      try { await run(rp, b.dataset.fmt); } catch (err) { toast(friendly(err), true); }
      finally { wrap.querySelectorAll('button').forEach((x) => { x.disabled = false; }); b.textContent = old; }
    }));
  }
  async function run(rp, fmt) {
    const f = filters.server();
    if (rp.custom === 'profit') {
      const rr = filters.range(), grain = defaultGrain(rr.from, rr.to);
      const [t, ov] = await Promise.all([api.trend(f, grain), api.overview(f)]);
      const c = ov.cur;
      const rows = t.points.map((p) => ({ period: bucketLabel(p.bucket, t.grain) + (t.grain === 'day' ? ' ' + p.bucket.slice(0, 4) : ''), gross_sales: p.gross_sales, discounts: p.discounts, refunds: p.refunds, net_sales: p.net_sales, cogs: p.cogs, gross_profit: p.gross_profit, opex: p.opex, net_profit: p.net_profit }));
      const totals = { gross_sales: c.gross_sales, discounts: c.discounts, refunds: c.refunds, net_sales: c.net_sales, cogs: c.cogs, gross_profit: c.gross_profit, opex: c.opex, net_profit: c.net_profit };
      const cols = PROFIT_COLS.filter((x) => (x.key !== 'cogs' || can.cost || can.profit) && (x.key !== 'gross_profit' || can.profit) && (x.key !== 'opex' || can.expenses) && (x.key !== 'net_profit' || (can.profit && can.expenses)));
      const sub = filters.describe().concat(c.coverage && c.coverage.unknown ? ['Note: cost data is missing for the products sold, so cost of goods sold and profit are not available.']
        : c.coverage && c.coverage.partial ? ['Note: ' + (c.coverage.pct === null || c.coverage.pct === undefined ? '?' : Math.round(c.coverage.pct)) + '% of net sales has a known cost; profit covers those sales only.'] : []);
      await exportData(fmt, { name: 'profit-report', title: rp.title, subtitle: sub, columns: cols, rows, totals });
      return;
    }
    const { rows, totals } = await fetchAllRows(rp.kind, Object.assign({}, f, rp.extra || {}), { sort: rp.sort, dir: 'desc' });
    const allow = { cost: can.cost || can.profit, profit: can.profit, expenses: can.expenses };
    const cols = COLS[rp.kind].filter((x) => !x.need || allow[x.need]).filter((x) => !x.noExport);
    await exportData(fmt, { name: rp.id + '-report', title: rp.title, subtitle: filters.describe(), columns: cols, rows, totals });
  }
  return { reload: draw };
}

// ---------------------------------------------------------------- Settings
const TZS = ['Asia/Manila', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Tokyo', 'UTC'];
const ACTION = { settings_changed: 'Settings changed', capital_added: 'Capital entry added', capital_edited: 'Capital entry edited', capital_voided: 'Capital entry voided' };
const short = (v) => { const t = v === null || v === undefined ? '—' : typeof v === 'object' ? (Array.isArray(v) ? v.length + ' items' : JSON.stringify(v)) : String(v); return t.length > 40 ? t.slice(0, 38) + '…' : t; };

export function renderSettings(root, ctx) {
  const { meta, can } = ctx;
  function summ(r) {
    const d = r.details || {};
    if (r.action === 'settings_changed') return Object.entries(d).map(([k, v]) => k.replace(/_/g, ' ') + ': ' + short(v.from) + ' → ' + short(v.to)).join('; ');
    if (r.action === 'capital_edited') return d.to ? (d.to.type || '') + ' ' + money(d.to.amount) + ' (was ' + (d.from ? money(d.from.amount) : '—') + ')' : '';
    return [d.type, d.amount !== undefined ? money(d.amount) : '', d.date, d.reason].filter(Boolean).join(' · ');
  }
  function draw() {
    const s = meta.settings || {}, dis = can.settings ? '' : ' disabled';
    const kp = new Set(s.visible_kpis || []);
    root.innerHTML = '<div id="sd-set-msg"></div>' + panel('Dashboard Settings', '<form id="sd-set-form" class="sd-set-form" novalidate>' +
      '<div class="field"><label for="sd-s-range">Default date range</label><select id="sd-s-range"' + dis + '>' + PRESETS.filter((p) => p.id !== 'custom').map((p) => '<option value="' + p.id + '"' + (s.default_date_range === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="sd-s-branch">Default branch</label><select id="sd-s-branch"' + (can.settings && meta.all_branches ? '' : ' disabled') + '><option value="">All Branches</option>' + (meta.branches || []).map((b) => '<option value="' + b.id + '"' + (String(s.default_branch_id) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' +
      '<div class="field sd-wide"><label>Inventory costing method</label><div class="sd-readonly"><b>Standard cost</b> — each product’s <b>Supplier Price</b> in the SKU Catalog (the method the ERP’s Dashboard already used). Weighted-average costing needs a purchase price on every delivery, and most deliveries have none, so it is not offered. Cost of goods sold = pieces sold × supplier price; a product with no supplier price is flagged “cost data missing” and left out of profit.</div></div>' +
      '<div class="field"><label for="sd-s-low">Low stock threshold (pieces)</label><input type="number" id="sd-s-low" min="0" max="1000" step="1" value="' + esc(s.low_stock_threshold) + '"' + dis + '><span class="muted">Used when a product has no reorder level of its own.</span></div>' +
      '<div class="field"><label for="sd-s-slow">Slow-moving days</label><input type="number" id="sd-s-slow" min="1" max="3650" step="1" value="' + esc(s.slow_moving_days) + '"' + dis + '><span class="muted">No sale for this many days.</span></div>' +
      '<div class="field"><label for="sd-s-dead">Dead-stock days</label><input type="number" id="sd-s-dead" min="1" max="3650" step="1" value="' + esc(s.dead_stock_days) + '"' + dis + '><span class="muted">No sale for this many days.</span></div>' +
      '<div class="field"><label for="sd-s-over">Overstock threshold (pieces per SKU)</label><input type="number" id="sd-s-over" min="1" max="100000" step="1" value="' + esc(s.overstock_units) + '"' + dis + '></div>' +
      '<div class="field"><label>Default currency</label><div class="sd-readonly">PHP (₱) — Philippine peso</div></div>' +
      '<div class="field"><label for="sd-s-tz">Timezone</label><select id="sd-s-tz"' + dis + '>' + Array.from(new Set(TZS.concat(s.timezone ? [s.timezone] : []))).map((z) => '<option' + (s.timezone === z ? ' selected' : '') + '>' + esc(z) + '</option>').join('') + '</select><span class="muted">Every date on the dashboard follows this clock.</span></div>' +
      '<div class="field"><label for="sd-s-from">Start raising data tasks from</label><input type="date" id="sd-s-from" value="' + esc(s.issues_from || '') + '"' + dis + '><span class="muted">Sales and purchases on or after this day can become “Needs Attention” tasks for Managers and Supervisors (a product with no cost, a sold item to match, a purchase with no price). Earlier ones are left alone.</span></div>' +
      '<div class="field sd-wide"><label style="display:flex;gap:8px;align-items:center;"><input type="checkbox" id="sd-s-cat"' + (s.issues_track_category === false ? '' : ' checked') + dis + '> Ask for a category when a sold product has none</label>' +
        '<label style="display:flex;gap:8px;align-items:center;"><input type="checkbox" id="sd-s-sup"' + (s.issues_track_supplier ? ' checked' : '') + dis + '> Ask for a supplier when a sold product has none</label><span class="muted">Supplier requests are off until your supplier list is set up. Anything fixed stays fixed; turning these off closes the matching tasks.</span></div>' +
      '<fieldset class="field sd-wide sd-kpi-pick"><legend>Visible KPI cards</legend>' + KPI_LABELS.map((k) => '<label><input type="checkbox" data-kpi="' + k.key + '"' + (kp.has(k.key) ? ' checked' : '') + dis + '> ' + esc(k.label) + '</label>').join('') + '</fieldset>' +
      '</form>', { sub: can.settings ? 'Saved settings apply to everyone who opens the dashboard.' : 'You can see these settings, but only people with the Dashboard Settings permission can change them.',
      actions: can.settings ? '<button type="button" class="btn" id="sd-set-save">Save settings</button>' : '' }) + '<div id="sd-set-hist"></div>';
    if (!can.settings) return;
    root.querySelector('#sd-set-save').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true; const $ = (id) => root.querySelector('#' + id); const msg = $('sd-set-msg'); msg.innerHTML = '';
      const vals = { default_date_range: $('sd-s-range').value, default_branch_id: $('sd-s-branch').value === '' ? null : Number($('sd-s-branch').value), low_stock_threshold: Number($('sd-s-low').value),
        slow_moving_days: Number($('sd-s-slow').value), dead_stock_days: Number($('sd-s-dead').value), overstock_units: Number($('sd-s-over').value), timezone: $('sd-s-tz').value,
        issues_from: $('sd-s-from').value, issues_track_category: $('sd-s-cat').checked, issues_track_supplier: $('sd-s-sup').checked,
        visible_kpis: [...root.querySelectorAll('[data-kpi]')].filter((c) => c.checked).map((c) => c.dataset.kpi) };
      if (!meta.all_branches) delete vals.default_branch_id;
      try { const res = await api.saveSettings(vals); meta.settings = res.settings; toast(Object.keys(res.changed || {}).length ? 'Settings saved.' : 'Nothing changed.'); ctx.onSettingsSaved(); }
      catch (err) { msg.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; window.scrollTo({ top: 0 }); }
    });
    const h = root.querySelector('#sd-set-hist');
    h.innerHTML = panel('Change history', loadingBox(), { sub: 'Settings and capital changes, newest first' });
    api.auditList(40).then((a) => {
      h.querySelector('.sd-panel-body').innerHTML = a.rows.length ? '<div class="sd-tablewrap"><table class="sd-tbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>' + a.rows.map((r) =>
        '<tr><td>' + esc(fmtDateTime(r.at, meta.tz)) + '</td><td>' + esc(r.user_name || '') + '</td><td>' + esc(ACTION[r.action] || r.action) + '</td><td class="sd-small">' + esc(summ(r)) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">Nothing has been changed yet.</p>';
    }).catch((err) => { h.querySelector('.sd-panel-body').innerHTML = errorBox(friendly(err)); });
  }
  return { reload: draw };
}
