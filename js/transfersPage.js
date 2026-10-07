// Transfers -- page controller. transfers.html is a one-line shell; everything the page does is wired here.
// The data layer is passed in (`api`), so the same code runs against the real Supabase functions in production and against a
// stand-in object in tests.
//
// One loaded copy of the data (ctx) feeds every tab; a change anywhere goes through the database, then ctx.refresh() reloads and
// redraws. Stock is READ from the real inventory and ledger on every load -- this page keeps no stock of its own. Who may do what is
// decided by the database; the page only hides the buttons a person could not use.
import { esc, drawersHtml, makeToast, closeDrawer, isDrawerOpen, friendly } from './transfersUi.js?v=20261007j';
import { enrichTransfers, makeCaps, DEFAULTS } from './transfersLogic.js?v=20261007j';
import { defaultFilters } from './transfersFilters.js?v=20261007j';
import { renderDashboard } from './transfersDashboard.js?v=20261007j';
import { renderTable, newTableState } from './transfersTable.js?v=20261007j';
import { renderBranches, renderDiscrepancies, newDiscState } from './transfersBranches.js?v=20261007j';
import { renderSku, selectSku, newSkuState } from './transfersSku.js?v=20261007j';
import { renderReports } from './transfersReports.js?v=20261007j';
import { renderLog, renderSettings, newLogState } from './transfersAdmin.js?v=20261007j';
import { openDetail, closeDetail, detailOpenId, printTransfer } from './transfersDetail.js?v=20261007j';
import { openTransferForm, requestCloseForm } from './transfersForm.js?v=20261007j';
import { openApprove, openRelease, openReceive, openRevise, openNote, openUpload } from './transfersWork.js?v=20261007j';
import { manilaDate } from './leaveUi.js?v=20261007j';

const $ = (id) => document.getElementById(id);

/** Everything a Transfers screen needs besides its own markup. The caller supplies ctx.refresh / rerender. */
export function createTransfersContext(api, employee) {
  const ctx = {
    api, employee, today: manilaDate(new Date().toISOString()), settings: { ...DEFAULTS }, recvAny: false, recvAnyChecked: false,
    branches: [], branchById: {}, names: {}, stock: {}, products: {}, ledger: [], receiptItems: [], data: { transfers: [], receipts: [], discrepancies: [], ledger: [] }, transfers: [], byId: new Map(),
    filters: defaultFilters(), caps: null, ui: { table: newTableState(), disc: newDiscState(), sku: newSkuState(), log: newLogState(), repOpen: new Set() },
  };
  ctx.toast = makeToast();
  ctx.detailOpenId = detailOpenId;
  ctx.caps = makeCaps(ctx);

  const stockMap = (rows) => { const m = {}; rows.forEach((r) => { (m[r.sku] || (m[r.sku] = {}))[r.branch_id] = Number(r.qty_available); }); return m; };
  const enrich = () => { ctx.transfers = enrichTransfers(ctx.data, ctx); ctx.byId = new Map(ctx.transfers.map((t) => [t.id, t])); };

  ctx.loadData = async () => {
    const [branches, transfers, receipts, receiptItems, discrepancies, ledger, stock, settings] = await Promise.all([
      api.listBranches(), api.listTransfers(), api.listReceipts(), api.listReceiptItems(), api.listDiscrepancies(), api.listTransferLedger(), api.listStock(), api.listSettings().catch(() => []),
    ]);
    ctx.today = manilaDate(new Date().toISOString());
    ctx.branches = branches; ctx.branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
    ctx.stock = stockMap(stock);
    ctx.settings = { ...DEFAULTS, ...Object.fromEntries((settings || []).map((s) => [s.key, Number(s.value)]).filter(([, v]) => Number.isFinite(v))) };
    // the people named anywhere on the page, looked up once
    const ids = new Set([employee.id]);
    transfers.forEach((t) => ['requested_by', 'approved_by', 'shipped_by', 'received_by', 'rejected_by', 'cancelled_by', 'prepared_by', 'revised_by'].forEach((k) => { if (t[k]) ids.add(t[k]); }));
    receipts.forEach((r) => { if (r.received_by) ids.add(r.received_by); });
    discrepancies.forEach((d) => { if (d.reported_by) ids.add(d.reported_by); if (d.resolved_by) ids.add(d.resolved_by); });
    ledger.forEach((x) => { if (x.employee_id) ids.add(x.employee_id); });
    const missing = [...ids].filter((id) => !ctx.names[id]);
    if (missing.length) { try { Object.assign(ctx.names, await api.employeeNames(missing)); } catch (err) { /* names fall back to "Unknown" */ } }
    if (employee && !ctx.names[employee.id]) ctx.names[employee.id] = employee.full_name || '';
    transfers.forEach((t) => (t.inventory_transfer_items || []).forEach((i) => { if (i.products) ctx.products[i.sku] = { ...(ctx.products[i.sku] || {}), ...i.products }; }));
    if (!ctx.recvAnyChecked) { ctx.recvAny = await api.hasPermission(employee.id, 'transfer.receive_any_branch'); ctx.recvAnyChecked = true; }
    ctx.ledger = ledger; ctx.receiptItems = receiptItems;
    ctx.data = { transfers, receipts, discrepancies, ledger };
    ctx.caps = makeCaps(ctx);
    enrich();
  };
  /** The live stock numbers change with every sale; re-read them just before a screen that shows them opens. */
  ctx.refreshStock = async () => {
    try { ctx.stock = stockMap(await api.listStock()); ctx.caps = makeCaps(ctx); enrich(); } catch (err) { /* the numbers already on screen are still the last known stock */ }
  };

  ctx.openDetail = (id, opts) => openDetail(ctx, id, opts);
  ctx.openForm = async (opts) => { await ctx.refreshStock(); return openTransferForm(ctx, opts); };
  ctx.openApprove = async (id) => { await ctx.refreshStock(); return openApprove(ctx, id); };
  ctx.openRelease = async (id) => { await ctx.refreshStock(); return openRelease(ctx, id); };
  ctx.openReceive = async (id) => { await ctx.refreshStock(); return openReceive(ctx, id); };
  ctx.openRevise = (id) => openRevise(ctx, id);
  ctx.openNote = (id) => openNote(ctx, id);
  ctx.openUpload = (id, opts) => openUpload(ctx, id, opts);
  ctx.printTransfer = (id) => printTransfer(ctx, id);
  ctx.rerender = () => {};
  ctx.showTab = () => {};
  ctx.applyView = () => {};
  ctx.openSku = () => {};
  return ctx;
}

export async function startTransfersPage({ root, api, employee, search, hash }) {
  root.innerHTML = '<div id="tf-whoami" class="lv-whoami bl-whoami"></div><div class="lv-tabs" id="tf-tabs" role="tablist" aria-label="Transfer sections"></div>' +
    '<div id="tf-panel" role="tabpanel"><p class="muted">Loading…</p></div>' + drawersHtml();
  const panel = $('tf-panel');
  const ctx = createTransfersContext(api, employee);
  const params = new URLSearchParams(search || '');
  let lastLoad = 0;

  const openDiscCount = () => ctx.transfers.reduce((s, t) => s + t._openDiscs.length, 0);
  const tabDefs = () => [
    { id: 'dashboard', label: 'Dashboard', render: renderDashboard },
    { id: 'transfers', label: 'Transfers', render: renderTable },
    { id: 'discrepancies', label: 'Discrepancies', badge: openDiscCount(), render: renderDiscrepancies },
    { id: 'branches', label: 'Branches', render: renderBranches },
    { id: 'sku', label: 'SKU Trace', render: renderSku },
    { id: 'reports', label: 'Reports', render: renderReports },
    { id: 'history', label: 'History', render: renderLog },
    { id: 'settings', label: 'Settings', show: ctx.caps.admin, render: renderSettings },
  ].filter((t) => t.show !== false && (t.show === undefined || t.show));
  let activeTab = null;
  const visibleTab = (id) => tabDefs().find((t) => t.id === id);
  const homeTab = () => 'dashboard';

  function renderWhoami() {
    const e = employee, role = ctx.caps.admin ? 'Admin' : ctx.caps.mgr ? 'Manager' : e.role === 'Branch Supervisor' ? 'Branch Supervisor' : 'Staff';
    const cls = { Admin: 'lv-orange', Manager: 'lv-blue', 'Branch Supervisor': 'lv-green', Staff: 'lv-gray' }[role];
    const branch = (ctx.branchById[e.branch_id] || {}).name;
    const note = { Admin: 'You can do everything here, including editing a requested transfer and the settings.', Manager: 'You approve, reject, release, receive and resolve discrepancies.',
      'Branch Supervisor': 'You request transfers, and release from and receive at ' + (branch || 'your branch') + '.', Staff: 'You can request transfers and follow those that involve ' + (branch ? branch : 'your branch') + '.' }[role];
    $('tf-whoami').innerHTML = '<span>Signed in as <b>' + esc(ctx.names[e.id] || e.full_name || '') + '</b> <span class="badge ' + cls + '">' + esc(role) + '</span> <span class="muted">' + esc(note) + '</span></span>' +
      '<span class="bl-whoami-right"><button type="button" class="btn small" id="tf-add-top">+ New Transfer</button></span>';
    $('tf-add-top').addEventListener('click', () => ctx.openForm({}));
  }
  function renderTabs() {
    $('tf-tabs').innerHTML = tabDefs().map((t) =>
      '<button type="button" class="lv-tab' + (t.id === activeTab ? ' lv-tab-active' : '') + '" role="tab" aria-selected="' + (t.id === activeTab) + '" data-tab="' + t.id + '">' + esc(t.label) +
      (t.badge ? ' <span class="lv-tab-badge">' + t.badge + '</span>' : '') + '</button>').join('');
    $('tf-tabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  }
  async function renderPanel() {
    const tab = visibleTab(activeTab);
    if (!tab) return;
    try { await tab.render(ctx, panel); } catch (err) {
      panel.innerHTML = '<div class="msg error">Could not show this section: ' + esc(err.message || String(err)) + '</div>';
      if (typeof console !== 'undefined') console.error(err);
    }
  }
  function showTab(id) {
    if (!visibleTab(id)) id = homeTab();
    activeTab = id;
    try { history.replaceState(null, '', location.pathname + location.search + '#' + id); } catch (e) { /* harmless */ }
    renderTabs();
    panel.innerHTML = '';
    return renderPanel();
  }
  ctx.showTab = showTab;
  ctx.rerender = () => { renderTabs(); return renderPanel(); };
  ctx.applyView = (viewId) => { const t = ctx.ui.table; t.view = viewId; t.page = 1; return showTab('transfers'); };
  ctx.openSku = async (sku) => {
    closeDetail(); closeDrawer('side'); closeDrawer('form');
    ctx.ui.sku.q = sku; ctx.ui.sku.sku = sku; ctx.ui.sku.loaded = false;
    await showTab('sku');
    return selectSku(ctx, sku);
  };

  // ---- refresh: reload everything and redraw, without stealing focus from someone typing ----
  let inflight = null, again = null, pendingRender = false;
  const typing = () => panel.contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  ctx.refresh = (opts = {}) => {
    if (inflight) { again = opts; return inflight; }
    inflight = (async () => {
      try {
        await ctx.loadData(); lastLoad = Date.now();
        ctx.ui.log.loaded = { activity: false, audit: false };
        if (!visibleTab(activeTab)) activeTab = homeTab();
        renderWhoami(); renderTabs();
        if (opts.quiet && (typing() || isDrawerOpen('side') || isDrawerOpen('form'))) pendingRender = true; else { pendingRender = false; await renderPanel(); }
        // a card that is open (and not in the middle of a confirmation) follows the new data
        if (opts.quiet && detailOpenId() !== null && !$('tf-act-ok') && !isDrawerOpen('side')) { const id = detailOpenId(); if (ctx.byId.has(id)) openDetail(ctx, id, { keep: true }); else closeDetail(); }
      } catch (err) { ctx.toast(err.message || String(err), true); } finally { inflight = null; }
      if (again) { const next = again; again = null; return ctx.refresh(next); }
    })();
    return inflight;
  };
  panel.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !typing() && !isDrawerOpen('side') && !isDrawerOpen('form')) { pendingRender = false; renderPanel(); } }, 80));

  // ---- drawers: close buttons, backdrops, Escape; and the "⋯" menus close when you click elsewhere ----
  $('tf-detail-close').addEventListener('click', closeDetail); $('tf-detail-backdrop').addEventListener('click', closeDetail);
  $('tf-form-close').addEventListener('click', requestCloseForm); $('tf-form-backdrop').addEventListener('click', requestCloseForm);
  $('tf-side-close').addEventListener('click', () => closeDrawer('side')); $('tf-side-backdrop').addEventListener('click', () => closeDrawer('side'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !$('tf-side-drawer')) return;
    if (isDrawerOpen('side')) closeDrawer('side'); else if (isDrawerOpen('form')) requestCloseForm(); else if (isDrawerOpen('detail')) closeDetail();
  });
  document.addEventListener('click', (e) => document.querySelectorAll('details.bl-menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; }));
  // a "⋯" / Export menu is placed from its button's position (fixed), so a scrolling table or card can never clip it
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLElement) || !d.matches('details.bl-menu') || !d.open) return;
    const pop = d.querySelector('.bl-menu-pop'), r = d.querySelector('summary').getBoundingClientRect();
    if (!pop) return;
    const h = pop.offsetHeight, w = pop.offsetWidth;
    pop.style.top = (r.bottom + 4 + h > window.innerHeight && r.top - 4 - h > 0 ? r.top - 4 - h : r.bottom + 4) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  }, true);
  const closeMenus = () => document.querySelectorAll('details.bl-menu[open]').forEach((d) => { d.open = false; });
  document.addEventListener('scroll', closeMenus, true);
  window.addEventListener('resize', closeMenus);

  // ---- first load ----
  try { await ctx.loadData(); lastLoad = Date.now(); } catch (err) {
    panel.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>';
    $('tf-tabs').innerHTML = '';
    return ctx;
  }
  renderWhoami();
  const wanted = String(hash || '').replace('#', '');
  await showTab(visibleTab(wanted) ? wanted : homeTab());

  // a clicked activity notification opens the transfer here in place, or via ?open=<id> when arriving from another page
  window.__kmOpenRecord = (table, id) => {
    if (table !== 'inventory_transfers') return false;
    if (ctx.byId.has(id)) openDetail(ctx, id); else ctx.refresh().then(() => { if (ctx.byId.has(id)) openDetail(ctx, id); else ctx.toast('That transfer is no longer available.', true); });
    return true;
  };
  if (params.get('open')) {
    const id = params.get('open');
    if (ctx.byId.has(id)) openDetail(ctx, id); else ctx.toast('That transfer is not available to you.', true);
    try { history.replaceState(null, '', location.pathname + '#' + activeTab); } catch (e) { /* harmless */ }
  } else if (params.get('sku')) {
    ctx.openSku(params.get('sku'));
  }

  // live: another person's request, approval, release or receipt -- debounced, quiet while typing
  let liveTimer = null;
  try {
    api.subscribe(['inventory_transfers', 'inventory_transfer_items', 'transfer_receipts', 'transfer_discrepancies', 'transfer_files'], () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => ctx.refresh({ quiet: true }), 700); });
  } catch (e) { /* the page still works without live updates */ }
  // stock changes with every sale, so it is re-read when the tab comes back to the front after a while
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastLoad > 60000) ctx.refresh({ quiet: true }); });
  return ctx;
}
