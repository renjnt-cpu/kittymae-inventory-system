// Scrap Monitoring -- page controller. scrap-monitoring.html is a short shell; everything the page does is wired here. The data layer is passed in (`api`), so the same code runs against the real
// Supabase functions in production and against a stand-in object in tests.
//
// One rule holds everywhere in this page: the screen only hides buttons a person could not use. Who may see which branch, see money or photos, sell, approve, record a payment, dispose, manage
// buyers, read the reports or export them is decided -- and enforced -- by the database (the scrap_monitor.* keys in the Position Access Matrix, migrations 253-256).
import { esc, friendly, plural, KARAT_GUESS, POS_BASE } from './smFormat.js?v=20261031a';
import { drawersHtml, makeToast, closeDrawer, isDrawerOpen, lightboxOpen } from './smUi.js?v=20261031a';
import { newListState } from './smList.js?v=20261031a';
import { renderDashboard } from './smDashboard.js?v=20261031a';
import { entriesCfg, renderEntries, openEntry } from './smEntries.js?v=20261031a';
import { availableCfg, renderAvailable, renderMarked } from './smAvailable.js?v=20261031a';
import { renderByBranch, renderByPurity } from './smBranches.js?v=20261031a';
import { salesCfg, renderSales, openSale } from './smSales.js?v=20261031a';
import { groupsCfg, renderGroups, openGroup } from './smGroups.js?v=20261031a';
import { renderBuyers } from './smBuyers.js?v=20261031a';
import { renderReports, renderAudit, setReport } from './smReports.js?v=20261031a';
import { openSaleForm } from './smSaleForm.js?v=20261031a';

const $ = (id) => document.getElementById(id);
const karatOrder = (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || String(a).localeCompare(String(b));

/** Every tab: how it is drawn, which filter list (if any) it owns, and who sees it. */
const TABS = [
  { id: 'dashboard', label: 'Dashboard', render: renderDashboard },
  { id: 'entries', label: 'All Scrap', render: renderEntries, cfg: entriesCfg },
  { id: 'branches', label: 'By Branch', render: renderByBranch },
  { id: 'purity', label: 'By Metal / Purity', render: renderByPurity },
  { id: 'groups', label: 'By Group', render: renderGroups, cfg: groupsCfg, badge: 'groups', show: (c) => !!(c.can.sell || c.can.view_all_branches || c.can.view_reports) },
  { id: 'available', label: 'Available Scrap', render: renderAvailable, cfg: (c) => availableCfg(c, 'all') },
  { id: 'marked', label: 'For Sale / Disposal', render: renderMarked, cfg: (c) => availableCfg(c, 'marked'), badge: true },
  { id: 'sales', label: 'Sold Scrap', render: renderSales, cfg: salesCfg },
  { id: 'buyers', label: 'Scrap Buyers', render: renderBuyers, show: (c) => !!(c.can.sell || c.can.manage_buyers || c.can.record_payment || c.can.approve_sale || c.can.view_reports) },
  { id: 'reports', label: 'Reports', render: renderReports, show: (c) => !!c.can.view_reports },
  { id: 'audit', label: 'Audit Log', render: renderAudit, show: (c) => !!c.can.view_reports },
];

export function createSmContext(api, employee, access) {
  const can = access.can || {};
  const ctx = {
    api, employee, access, can, value: !!can.view_value, files: !!can.view_files, settings: access.settings || {}, branches: [],
    refs: { karats: KARAT_GUESS.slice(), buyers: [], people: [] }, counts: { pending: 0, groups: 0 }, ui: { lists: {} },
  };
  ctx.toast = makeToast();
  ctx.openEntry = (id) => openEntry(ctx, id);
  ctx.openSale = (id) => openSale(ctx, id);
  ctx.openGroup = (id) => openGroup(ctx, id);
  ctx.openSaleForm = (opts) => openSaleForm(ctx, opts || {});
  ctx.reloadList = null;
  ctx.afterChange = () => {};
  ctx.refreshCounts = async () => null;
  ctx.gotoTab = () => {};
  ctx.showTab = () => {};
  ctx.gotoReport = () => {};
  // the pick-lists the forms need (buyers, people); asked once, asked again after a buyer is added
  let optPromise = null;
  ctx.loadOptions = () => optPromise || (optPromise = api.formOptions().then((o) => {
    if (!o || o.ok === false) throw new Error((o && o.message) || 'The pick-lists could not be loaded.');
    ctx.refs.buyers = o.buyers || []; ctx.refs.people = o.people || [];
    return o;
  }).catch((err) => { optPromise = null; throw err; }));
  ctx.reloadOptions = () => { optPromise = null; return ctx.loadOptions(); };
  return ctx;
}

export async function startSmPage({ root, api, employee, search, hash }) {
  root.innerHTML = '<div id="sm-whoami" class="lv-whoami sm-whoami"></div><div class="sm-topbar" id="sm-topbar"></div><div id="sm-notice"></div>' +
    '<div class="lv-tabs" id="sm-tabs" role="tablist" aria-label="Scrap Monitoring sections"></div><div id="sm-panel" role="tabpanel"><p class="muted">Loading…</p></div>' + drawersHtml();
  const panel = $('sm-panel');
  const noAccess = (msg) => { root.innerHTML = '<div class="center-screen"><div><h2>No access</h2><p class="muted">' + esc(msg) + '</p></div></div>'; return null; };

  let access;
  try { access = await api.access(); } catch (err) { return noAccess(friendly(err)); }
  if (!access || access.ok === false) return noAccess((access && access.message) || 'You do not have access to Scrap Monitoring. Ask an Admin to give you access.');
  const ctx = createSmContext(api, employee, access);
  const params = new URLSearchParams(search || '');

  // ---- reference data (each is a convenience: the page still opens without it)
  const [branches, purity] = await Promise.all([api.listBranches().catch(() => []), api.byPurity(null, null, null).catch(() => null)]);
  const mine = new Set((access.branch_ids || []).map(Number));
  ctx.branches = (branches || []).filter((b) => mine.has(Number(b.id)));
  if (!ctx.branches.length) {
    try { const r = await api.byBranch(null, null); if (r && r.ok !== false) ctx.branches = (r.rows || []).map((b) => ({ id: b.branch_id, name: b.branch_name })); } catch (e) { /* the branch pick-lists stay empty */ }
  }
  const seen = new Set(KARAT_GUESS);
  if (purity && purity.ok !== false) (purity.rows || []).forEach((r) => { const k = String(r.karat || '').trim().toUpperCase(); if (k) seen.add(k); });
  ctx.refs.karats = [...seen].sort(karatOrder);

  const tabs = TABS.filter((t) => !t.show || t.show(ctx));
  const visibleTab = (id) => tabs.find((t) => t.id === id);
  let activeTab = null;

  function renderWhoami() {
    const scope = ctx.can.view_all_branches ? 'all branches' : ctx.branches.length === 1 ? ctx.branches[0].name : plural(ctx.branches.length, 'branch', 'branches');
    $('sm-whoami').innerHTML = '<span>Signed in as <b>' + esc((access.me && access.me.name) || employee.full_name || '') + '</b> <span class="muted">· you can see ' + esc(scope) + (ctx.value ? ', with the money figures' : ', without the money figures') +
      (ctx.files ? '' : ', without the photos and receipts') + '</span></span>' +
      '<span class="sm-whoami-right"><a class="sm-link" href="' + esc(POS_BASE + 'branches.html?tab=scrap') + '" target="_blank" rel="noopener noreferrer" title="Where the branches record scrap">Branch scrap in the POS ↗</a></span>';
    $('sm-topbar').innerHTML = (ctx.can.sell || ctx.can.dispose ? '<div class="sm-btns">' + (ctx.can.sell ? '<button type="button" class="btn" id="sm-new-sale">+ New scrap sale</button>' : '') +
      (ctx.can.sell ? '<button type="button" class="btn secondary" id="sm-new-group" title="A pending folder for scrap that goes to a supplier to be weighed">+ New group</button>' : '') +
      (ctx.can.dispose ? '<button type="button" class="btn secondary" id="sm-new-disposal">Dispose of scrap</button>' : '') + '</div>' : '');
    const ns = $('sm-new-sale'); if (ns) ns.addEventListener('click', () => ctx.openSaleForm({ mode: 'SALE' }));
    const ng = $('sm-new-group'); if (ng) ng.addEventListener('click', () => ctx.openSaleForm({ mode: 'GROUP' }));
    const nd = $('sm-new-disposal'); if (nd) nd.addEventListener('click', () => ctx.openSaleForm({ mode: 'DISPOSAL' }));
  }
  function renderTabs() {
    $('sm-tabs').innerHTML = tabs.map((t) => {
      const n = t.badge ? (ctx.counts[t.badge === true ? 'pending' : t.badge] || 0) : 0;
      const badge = n ? ' <span class="lv-tab-badge">' + (n > 99 ? '99+' : n) + '</span>' : '';
      return '<button type="button" class="lv-tab' + (t.id === activeTab ? ' lv-tab-active' : '') + '" role="tab" aria-selected="' + (t.id === activeTab) + '" data-tab="' + t.id + '">' + esc(t.label) + badge + '</button>';
    }).join('');
    $('sm-tabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  }
  function renderNotice() {
    const n = ctx.counts.pending;
    $('sm-notice').innerHTML = n > 0 && ctx.can.approve_sale ? '<div class="sm-banner sm-banner-warn sm-notice"><span><b>' + plural(n, 'scrap sale or disposal') + '</b> ' + (n === 1 ? 'is' : 'are') + ' waiting for your approval.</span> ' +
      '<button type="button" class="btn small" id="sm-review">Review</button></div>' : '';
    const r = $('sm-review'); if (r) r.addEventListener('click', () => ctx.gotoTab('marked', {}, { view: 'sale' }));
  }
  async function renderPanel() {
    const tab = visibleTab(activeTab);
    if (!tab) return;
    try {
      await tab.render(ctx, panel);
      if (api.hydrateImages) api.hydrateImages(panel);
    } catch (err) {
      panel.innerHTML = '<div class="msg error">Could not show this section: ' + esc(err.message || String(err)) + '</div>';
      if (typeof console !== 'undefined') console.error(err);
    }
  }
  function showTab(id) {
    if (!visibleTab(id)) id = 'dashboard';
    activeTab = id;
    ctx.reloadList = null;
    try { history.replaceState(null, '', location.pathname + '#' + id); } catch (e) { /* harmless */ }
    renderTabs();
    panel.innerHTML = '';
    return renderPanel();
  }
  /** Opens a tab with its filters already set (a dashboard card, a branch card, an Attention row...). `extra` sets other bits of the tab's state (which half of "For Sale / Disposal"). */
  ctx.gotoTab = (id, filters, extra) => {
    const t = visibleTab(id);
    if (!t) return showTab('dashboard');
    if (t.cfg) {
      const cfg = t.cfg(ctx), s = newListState(cfg), more = new Set(cfg.fields.filter((f) => f.more).map((f) => f.id));
      Object.entries(filters || {}).forEach(([k, v]) => {
        if (!cfg.fields.some((f) => f.id === k)) return;
        s.filters[k] = typeof s.filters[k] === 'boolean' ? !!v : (v === null || v === undefined ? '' : String(v));
        if (more.has(k) && v !== '' && v !== false && v !== null && v !== undefined) s.more = true;
      });
      Object.assign(s, extra || {});
      ctx.ui.lists[cfg.key] = s;
    }
    return showTab(id);
  };
  ctx.showTab = showTab;
  ctx.gotoReport = (kind, patch) => { setReport(ctx, kind, patch); return showTab('reports'); };
  ctx.activeTab = () => activeTab;

  ctx.refreshCounts = async () => {
    try {
      const r = await api.salesList({ status: 'PENDING_APPROVAL' }, 1, 0, 'newest');
      let g = null;
      if (api.groupsList && visibleTab('groups')) { try { g = await api.groupsList({ status: 'PENDING' }, 1, 0, 'newest'); } catch (e) { /* the groups badge is a convenience */ } }
      if (g && g.ok !== false) ctx.counts.groups = Number(g.total) || 0;
      if (r && r.ok !== false) { const before = ctx.counts.pending; ctx.counts.pending = Number(r.total) || 0; renderTabs(); renderNotice(); return before; }
    } catch (e) { /* the badge is a convenience */ }
    return null;
  };
  ctx.afterChange = () => { ctx.refreshCounts(); if (ctx.reloadList) ctx.reloadList(); else renderPanel(); };

  // ---- the drawers: close buttons, backdrops, Escape
  $('sm-detail-close').addEventListener('click', () => closeDrawer('detail')); $('sm-detail-backdrop').addEventListener('click', () => closeDrawer('detail'));
  $('sm-side-close').addEventListener('click', () => closeDrawer('side')); $('sm-side-backdrop').addEventListener('click', () => closeDrawer('side'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || lightboxOpen()) return;
    if (isDrawerOpen('side')) closeDrawer('side'); else if (isDrawerOpen('detail')) closeDrawer('detail');
  });

  // ---- first draw
  renderWhoami();
  await ctx.refreshCounts();
  const wanted = String(hash || '').replace('#', '');
  await showTab(visibleTab(wanted) ? wanted : 'dashboard');
  if (params.get('open_sale')) { ctx.openSale(Number(params.get('open_sale'))); try { history.replaceState(null, '', location.pathname + '#' + activeTab); } catch (e) { /* harmless */ } }
  else if (params.get('open_entry')) { ctx.openEntry(params.get('open_entry')); try { history.replaceState(null, '', location.pathname + '#' + activeTab); } catch (e) { /* harmless */ } }
  else if (params.get('open_group')) { ctx.openGroup(params.get('open_group')); try { history.replaceState(null, '', location.pathname + '#' + activeTab); } catch (e) { /* harmless */ } }

  // every minute (while the page is visible): refresh the waiting-for-approval count, and say so when something new arrived for an approver
  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    const before = ctx.counts.pending;
    await ctx.refreshCounts();
    if (ctx.counts.pending > before && ctx.can.approve_sale) {
      ctx.toast((ctx.counts.pending - before) + ' new scrap ' + (ctx.counts.pending - before === 1 ? 'sale or disposal is' : 'sales or disposals are') + ' waiting for approval.');
      if (activeTab === 'marked' && ctx.reloadList && !panel.contains(document.activeElement)) ctx.reloadList();
    }
  }, 60000);
  return ctx;
}
