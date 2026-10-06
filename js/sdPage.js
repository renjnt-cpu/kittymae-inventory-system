// Sales & Profit Dashboard -- the page: title, filters, data-quality notes, the tabs, and the glue between them.
// Who sees what is decided by the database (keys "dashboard.*" in the Position Access Matrix); this page only hides what it is told not to ask for.
import { api, esc, friendly, fmtDateTime, int, money } from './sdCore.js?v=20261007h';
import { mountShell, loadingBox, errorBox, lockedBox, badge, toast, openDrawer } from './sdUi.js?v=20261007h';
import { createFilters } from './sdFilters.js?v=20261007h';
import { renderOverview } from './sdOverview.js?v=20261007h';
import { renderSales, renderProducts, renderChannels, renderPurchases, renderInventory, renderExpenses, renderPayments } from './sdTabs.js?v=20261007h';
import { renderCapital } from './sdCapital.js?v=20261007h';
import { renderReports, renderSettings } from './sdMore.js?v=20261007h';
import { createTable } from './sdTable.js?v=20261007h';
import { COLS, ROW_TITLE } from './sdColumns.js?v=20261007h';

const TABS = [
  { id: 'overview', label: 'Overview', show: () => true, make: renderOverview },
  { id: 'sales', label: 'Sales', show: (c) => c.sales, make: renderSales },
  { id: 'products', label: 'Products', show: (c) => c.sales, make: renderProducts },
  { id: 'channels', label: 'Channels', show: (c) => c.sales, make: renderChannels },
  { id: 'purchases', label: 'Purchases', show: (c) => c.cost, make: renderPurchases },
  { id: 'inventory', label: 'Inventory', show: (c) => c.inventory, make: renderInventory },
  { id: 'expenses', label: 'Expenses', show: (c) => c.expenses, make: renderExpenses },
  { id: 'payments', label: 'Payments', show: (c) => c.sales, make: renderPayments },
  { id: 'capital', label: 'Capital', show: (c) => c.capital, make: renderCapital },
  { id: 'reports', label: 'Reports', show: () => true, make: renderReports },
  { id: 'settings', label: 'Settings', show: () => true, make: renderSettings },
];

// The owner's line under a note a Manager/Supervisor can fix: the same shared task records the Dashboard's "Needs Attention" shows (status, who, how far).
const TASK_STATUS = { OPEN: ['OPEN', 'orange'], IN_PROGRESS: ['IN PROGRESS', 'blue'], RESOLVED: ['RESOLVED', 'green'] };
const TASK_MODE = { cost_missing: 'cost', not_in_catalog: 'sku', purchase_unpriced: 'purchase' };
function taskLine(t, key) {
  if (!t) return '';
  const [label, tone] = TASK_STATUS[t.status] || TASK_STATUS.OPEN;
  const names = (t.assigned || []).filter(Boolean).join(', ');
  return '<div class="sd-task" style="display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin-top:4px;">' + badge(label, tone) +
    '<span>' + (t.total ? int(t.fixed) + ' / ' + int(t.total) + ' fixed · ' + int(t.remaining) + ' remaining' : 'No tasks yet') + '</span>' +
    '<span>' + (t.open ? (names ? 'Assigned: ' + esc(names) : 'Not assigned yet') : '') + '</span>' +
    (t.total ? '<span style="flex:1 1 120px;min-width:90px;max-width:220px;height:7px;background:#eadfae;border-radius:5px;overflow:hidden;display:inline-block;"><i style="display:block;height:100%;width:' + Math.max(0, Math.min(100, Number(t.pct) || 0)) + '%;background:' + (t.open ? '#e0a800' : '#2e7d32') + ';"></i></span>' : '') +
    (TASK_MODE[key] ? '<a href="fix-data.html?type=' + TASK_MODE[key] + '">' + (t.open ? 'Open the fix list →' : 'See the fix list →') + '</a>' : '') + '</div>';
}

function ago(iso) {
  if (!iso) return 'never';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago';
}

export async function startDashboardPage({ root, employee }) {
  mountShell();
  root.innerHTML = loadingBox('Opening the dashboard…');
  let meta;
  try { meta = await api.meta(); }
  catch (err) { root.innerHTML = err.denied ? '<div class="center-screen"><div><h2>No access</h2><p class="muted">' + esc(err.message) + ' Ask an Admin to give you the “Sales & Profit Dashboard” keys in the Position Access Matrix.</p></div></div>' : errorBox(friendly(err)); return; }

  const has = (k) => meta.keys.includes('dashboard.' + k);
  const can = { sales: has('sales'), profit: has('profit'), cost: has('cost'), capital: has('capital'), expenses: has('expenses'), inventory: has('inventory'), export: has('export'),
    capital_manage: has('capital_manage'), settings: has('settings'), all_branches: has('all_branches') };
  const tabs = TABS.filter((t) => t.show(can));
  let active = (location.hash || '').replace('#', '');
  if (!tabs.some((t) => t.id === active)) active = 'overview';

  root.innerHTML =
    '<div class="sd-head"><div><h2 class="sd-title">KITTYMAE — Sales &amp; Business Dashboard</h2><div class="muted">All figures in Philippine pesos (₱) · dates in ' + esc(meta.tz) + ' · <span id="sd-fresh"></span></div></div>' +
      '<div class="sd-head-right"><button type="button" class="btn small secondary" id="sd-refresh">Refresh data</button>' + (can.export ? '<button type="button" class="btn small" id="sd-export">Export reports</button>' : '') + '</div></div>' +
    '<div id="sd-filters"></div><div id="sd-quality"></div>' +
    '<div class="sd-tabs" role="tablist" aria-label="Dashboard sections">' + tabs.map((t) => '<button type="button" role="tab" class="sd-tab" id="sd-tab-' + t.id + '" data-tab="' + t.id + '" aria-selected="false">' + esc(t.label) + '</button>').join('') + '</div>' +
    '<div id="sd-panel" role="tabpanel"></div>';

  const panelEl = root.querySelector('#sd-panel');
  const ctx = { meta, can, filters: null, goTab, reloadAll, onSettingsSaved: () => { setFresh(); if (active === 'settings') show('settings'); loadQuality(); } };
  let current = null, qToken = 0;

  function setFresh() { root.querySelector('#sd-fresh').textContent = 'Online orders last synced ' + ago(meta.sync && meta.sync.last_run_at) + (meta.sync && meta.sync.last_error ? ' (the last refresh had a problem)' : ''); }
  setFresh();

  function show(id) {
    active = id; history.replaceState(null, '', '#' + id);
    root.querySelectorAll('.sd-tab').forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    panelEl.innerHTML = '';
    const t = tabs.find((x) => x.id === id);
    try { current = t.make(panelEl, ctx); current.reload(); }
    catch (err) { panelEl.innerHTML = errorBox('This tab could not be drawn: ' + friendly(err)); }
  }
  function goTab(id) { if (tabs.some((t) => t.id === id)) { show(id); window.scrollTo({ top: 0, behavior: 'smooth' }); } }
  function reloadAll() { if (current) current.reload(); loadQuality(); }

  // ---- data-quality notes: what is missing, in plain words (the cost warning is always visible)
  async function loadQuality() {
    const box = root.querySelector('#sd-quality'), my = ++qToken;
    if (!(can.sales || can.cost || can.expenses || can.capital || can.inventory)) { box.innerHTML = ''; return; }
    try {
      const q = await api.quality(ctx.filters.server());
      if (my !== qToken) return;
      const items = q.items || [], warn = items.filter((i) => i.severity === 'warn'), info = items.filter((i) => i.severity !== 'warn');
      if (!items.length) { box.innerHTML = ''; return; }
      const cost = items.find((i) => i.key === 'cost_missing');
      box.innerHTML = (cost ? '<div class="sd-alert"><b>⚠ ' + esc(cost.title) + '</b><div>' + esc(cost.detail) + '</div>' + taskLine(cost.task, 'cost_missing') + (can.cost ? '<button type="button" class="btn small secondary" id="sd-show-missing">Show the products missing a cost</button>' : '') + '</div>' : '') +
        '<details class="sd-quality card"><summary>' + (warn.length ? badge(warn.length + ' to fix', 'orange') + ' ' : '') + (info.length ? badge(info.length + ' to know', 'blue') + ' ' : '') + '<b>Data notes</b> <span class="muted">— what is missing or incomplete in the figures below</span></summary><ul>' +
        items.map((i) => '<li>' + badge(i.severity === 'warn' ? 'Fix' : 'Note', i.severity === 'warn' ? 'orange' : 'blue') + ' <b>' + esc(i.title) + '</b><div class="muted">' + esc(i.detail) + '</div>' + taskLine(i.task, i.key) + '</li>').join('') + '</ul></details>';
      const mb = box.querySelector('#sd-show-missing');
      if (mb) mb.addEventListener('click', () => {
        openDrawer({ wide: true, title: 'Products missing a cost', sub: 'Sold in the period, or in stock, with no Supplier Price in the SKU Catalog',
          body: '<p class="muted">Supplier prices come from the <b>SUP. PRICE</b> column of the SKU 26 sheet (run the sync after filling it in). Once a product has a price, its sales are counted in gross profit automatically. Use Export to get this list as a spreadsheet to fill in.</p><div id="sd-missing"></div>' });
        createTable({ root: document.getElementById('sd-missing'), kind: 'missing_cost', columns: COLS.missing_cost, getFilters: () => ctx.filters.server(), sort: { key: 'net_sales', dir: 'desc' }, size: 25, title: 'Products missing a cost', exportName: 'products-missing-cost',
          subtitle: () => ctx.filters.describe(), can: { cost: true }, rowTitle: ROW_TITLE.missing_cost, searchPlaceholder: 'Search SKU or product…' });
      });
    } catch (err) { if (my === qToken) root.querySelector('#sd-quality').innerHTML = ''; }
  }

  // ---- filters, tabs, buttons
  ctx.filters = createFilters({ root: root.querySelector('#sd-filters'), meta, onChange: () => reloadAll() });
  root.querySelectorAll('.sd-tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  root.querySelector('.sd-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((t) => t.id === active), n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; show(tabs[n].id); root.querySelector('#sd-tab-' + tabs[n].id).focus();
  });
  const ex = root.querySelector('#sd-export'); if (ex) ex.addEventListener('click', () => goTab('reports'));
  const rf = root.querySelector('#sd-refresh');
  rf.addEventListener('click', async () => {
    rf.disabled = true; const old = rf.textContent; rf.textContent = 'Refreshing…';
    try {
      const r = await api.refreshNow();
      meta.sync = (await api.meta()).sync; setFresh();
      toast(r.skipped ? 'Already refreshed a moment ago.' : 'Refreshed — ' + int(r.built) + ' order lines updated.'); reloadAll();
    } catch (err) { toast(friendly(err), true); } finally { rf.disabled = false; rf.textContent = old; }
  });
  window.addEventListener('hashchange', () => { const id = (location.hash || '').replace('#', ''); if (id !== active && tabs.some((t) => t.id === id)) show(id); });

  show(active); loadQuality();
  void employee; void lockedBox; void fmtDateTime; void money;
}
