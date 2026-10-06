// Refund Management -- page controller. refunds.html is a one-line shell; everything the page does is wired here.
// The data layer is passed in (`api`), so the same code runs against the real Supabase functions in production and
// against a stand-in object in tests.
//
// One loaded copy of the data (ctx) feeds every tab; a change anywhere goes through the database, then ctx.refresh()
// reloads and redraws. Who may do what is decided by the database -- the page only hides the buttons a person
// could not use.
import { esc, drawersHtml, makeToast, closeDrawer, isDrawerOpen, friendly } from './refundsUi.js?v=20261006d';
import { enrichRefunds } from './refundsLogic.js?v=20261006d';
import { defaultFilters } from './refundsFilters.js?v=20261006d';
import { renderDashboard } from './refundsDashboard.js?v=20261006d';
import { renderTable, newTableState } from './refundsTable.js?v=20261006d';
import { renderQueue, renderPayments, renderCompleted } from './refundsQueue.js?v=20261006d';
import { renderAnalytics, newAnalyticsState } from './refundsAnalytics.js?v=20261006d';
import { renderReports } from './refundsReports.js?v=20261006d';
import { renderLog, renderSettings, newLogState } from './refundsAdmin.js?v=20261006d';
import { openDetail, closeDetail, detailOpenId, printRefund } from './refundsDetail.js?v=20261006d';
import { openRefundForm, requestCloseForm, openPayment, openEditPayment, openUpload, openNote, openComm, openFollowUp, openPriority } from './refundsForm.js?v=20261006d';

const $ = (id) => document.getElementById(id);
const CLOSED = ['Cancelled', 'Rejected'];
const REQUESTER_EDITABLE = ['Pending Approval', 'Needs Information'];
const REQUESTER_CANCELLABLE = ['Pending Approval', 'Under Review', 'Needs Information', 'On Hold'];

/** Everything a Refunds screen needs besides its own markup. The caller supplies ctx.refresh / rerender. */
export function createRefundsContext(api, employee) {
  const ctx = {
    api, employee, access: { role: 'No access' }, today: '', highAmount: 10000, followWarn: 2,
    branches: [], branchById: {}, reasons: [], data: { refunds: [], items: [], payments: [], files: [] }, refunds: [], byId: new Map(),
    filters: defaultFilters(), canAdmin: false,
    ui: { table: newTableState(), analytics: null, log: newLogState(), repOpen: new Set() },
  };
  ctx.toast = makeToast();
  ctx.detailOpenId = detailOpenId;

  // what this person may do to one request (the database enforces the same rules)
  ctx.isOwn = (r) => !!ctx.access.employee_id && r.created_by === ctx.access.employee_id;
  ctx.canEdit = (r) => (CLOSED.includes(r.approval_status) ? ctx.canAdmin : !!(ctx.access.approve || (ctx.isOwn(r) && REQUESTER_EDITABLE.includes(r.approval_status))));
  ctx.canNote = (r) => !!(ctx.access.pay || ctx.isOwn(r));
  ctx.canCancel = (r) => !CLOSED.includes(r.approval_status) && !r._livePays.length && !!(ctx.access.approve || (ctx.isOwn(r) && REQUESTER_CANCELLABLE.includes(r.approval_status)));

  ctx.loadData = async () => {
    const [access, branches, reasons, settings, refunds, items, payments, files] = await Promise.all([
      api.getAccess(), api.listBranches(), api.listReasons(), api.listSettings().catch(() => []), api.listRefunds(), api.listItems(), api.listPayments(), api.listFiles(),
    ]);
    if (!access || access.role === 'No access') throw Object.assign(new Error('Refunds are available to signed-in staff accounts only.'), { noAccess: true });
    ctx.access = access; ctx.today = access.today; ctx.canAdmin = !!access.admin;
    const cfg = Object.fromEntries((settings || []).map((s) => [s.key, s.value]));
    ctx.highAmount = Number(cfg.high_amount ?? 10000); ctx.followWarn = Number(cfg.follow_up_warn ?? 2);
    ctx.branches = branches; ctx.branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
    ctx.reasons = reasons;
    ctx.data = { refunds, items, payments, files };
    ctx.refunds = enrichRefunds(ctx.data, ctx);
    ctx.byId = new Map(ctx.refunds.map((r) => [r.id, r]));
    if (!ctx.ui.analytics) ctx.ui.analytics = newAnalyticsState(ctx.today);
  };

  ctx.openDetail = (id, opts) => openDetail(ctx, id, opts);
  ctx.openForm = (opts) => openRefundForm(ctx, opts);
  ctx.openPayment = (id) => openPayment(ctx, id);
  ctx.openEditPayment = (id) => openEditPayment(ctx, id);
  ctx.openUpload = (id, opts) => openUpload(ctx, id, opts);
  ctx.openNote = (id) => openNote(ctx, id);
  ctx.openComm = (id) => openComm(ctx, id);
  ctx.openFollowUp = (id) => openFollowUp(ctx, id);
  ctx.openPriority = (id) => openPriority(ctx, id);
  ctx.printRefund = (id) => printRefund(ctx, id);
  ctx.rerender = () => {};
  ctx.showTab = () => {};
  ctx.applyView = () => {};
  return ctx;
}

export async function startRefundsPage({ root, api, employee, search, hash }) {
  root.innerHTML = '<div id="rf-whoami" class="lv-whoami bl-whoami"></div><div class="lv-tabs" id="rf-tabs" role="tablist" aria-label="Refund sections"></div>' +
    '<div id="rf-panel" role="tabpanel"><p class="muted">Loading…</p></div>' + drawersHtml();
  const panel = $('rf-panel');
  const ctx = createRefundsContext(api, employee);
  const params = new URLSearchParams(search || '');

  const awaitingCount = () => ctx.refunds.filter((r) => r._awaiting).length;
  const tabDefs = () => [
    { id: 'dashboard', label: 'Dashboard', show: ctx.access.view_all, render: renderDashboard },
    { id: 'requests', label: 'Requests', show: true, render: renderTable },
    { id: 'queue', label: 'Approval Queue', show: true, badge: awaitingCount(), render: renderQueue },
    { id: 'payments', label: 'Payments', show: ctx.access.view_all, render: renderPayments },
    { id: 'completed', label: 'Completed', show: ctx.access.view_all, render: renderCompleted },
    { id: 'analytics', label: 'Analytics', show: ctx.access.view_all, render: renderAnalytics },
    { id: 'reports', label: 'Reports', show: ctx.access.view_all, render: renderReports },
    { id: 'history', label: 'History', show: ctx.access.view_all, render: renderLog },
    { id: 'settings', label: 'Settings', show: ctx.canAdmin, render: renderSettings },
  ].filter((t) => t.show);
  let activeTab = null;
  const visibleTab = (id) => tabDefs().find((t) => t.id === id);
  const homeTab = () => (visibleTab('dashboard') ? 'dashboard' : 'requests');

  function renderWhoami() {
    const role = ctx.access.role;
    const cls = { Admin: 'lv-orange', Manager: 'lv-blue', Finance: 'lv-green', Viewer: 'lv-gray', Staff: 'lv-gray' }[role] || 'lv-gray';
    const note = { Manager: 'You review, approve or reject requests and record refund payments.', Finance: 'You record refund payments and proof. Approving is for managers.', Viewer: 'You can see every request and report but cannot change anything.',
      Staff: 'You can create refund requests and follow your own.' }[role] || '';
    $('rf-whoami').innerHTML = '<span>Signed in as <b>' + esc(ctx.access.name || (employee && employee.full_name) || '') + '</b> <span class="badge ' + cls + '">' + esc(role) + '</span>' + (note ? ' <span class="muted">' + esc(note) + '</span>' : '') + '</span>' +
      '<span class="bl-whoami-right"><button type="button" class="btn small" id="rf-add-top">+ New Refund Request</button></span>';
    $('rf-add-top').addEventListener('click', () => ctx.openForm({}));
  }
  function renderTabs() {
    $('rf-tabs').innerHTML = tabDefs().map((t) =>
      '<button type="button" class="lv-tab' + (t.id === activeTab ? ' lv-tab-active' : '') + '" role="tab" aria-selected="' + (t.id === activeTab) + '" data-tab="' + t.id + '">' + esc(t.label) +
      (t.badge ? ' <span class="lv-tab-badge">' + t.badge + '</span>' : '') + '</button>').join('');
    $('rf-tabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
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
  ctx.applyView = (viewId) => { const t = ctx.ui.table; t.view = viewId; t.page = 1; return showTab('requests'); };

  // ---- refresh: reload everything and redraw, without stealing focus from someone typing ----
  let inflight = null, again = null, pendingRender = false;
  const typing = () => panel.contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  ctx.refresh = (opts = {}) => {
    if (inflight) { again = opts; return inflight; }
    inflight = (async () => {
      try {
        await ctx.loadData();
        ctx.ui.log.loaded = { activity: false, audit: false };
        if (!visibleTab(activeTab)) activeTab = homeTab();
        renderWhoami(); renderTabs();
        if (opts.quiet && typing()) pendingRender = true; else { pendingRender = false; await renderPanel(); }
        // a card that is open (and not in the middle of a confirmation) follows the new data
        if (opts.quiet && detailOpenId() !== null && !$('rf-act-ok')) { const id = detailOpenId(); if (ctx.byId.has(id)) openDetail(ctx, id, { keep: true }); else closeDetail(); }
      } catch (err) { ctx.toast(err.message || String(err), true); } finally { inflight = null; }
      if (again) { const next = again; again = null; return ctx.refresh(next); }
    })();
    return inflight;
  };
  panel.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !typing()) { pendingRender = false; renderPanel(); } }, 80));

  // ---- drawers: close buttons, backdrops, Escape; and the "⋯" menus close when you click elsewhere ----
  $('rf-detail-close').addEventListener('click', closeDetail); $('rf-detail-backdrop').addEventListener('click', closeDetail);
  $('rf-form-close').addEventListener('click', requestCloseForm); $('rf-form-backdrop').addEventListener('click', requestCloseForm);
  $('rf-side-close').addEventListener('click', () => closeDrawer('side')); $('rf-side-backdrop').addEventListener('click', () => closeDrawer('side'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !$('rf-side-drawer')) return;
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
  try { await ctx.loadData(); } catch (err) {
    panel.innerHTML = err.noAccess ? '<div class="center-screen"><div><h2>No access</h2><p class="muted">' + esc(err.message) + '</p></div></div>' : '<div class="msg error">' + esc(friendly(err)) + '</div>';
    $('rf-tabs').innerHTML = '';
    return ctx;
  }
  renderWhoami();
  const wanted = String(hash || '').replace('#', '');
  await showTab(visibleTab(wanted) ? wanted : homeTab());

  // a clicked activity notification opens the refund here in place, or via ?open=<id> when arriving from another page
  window.__kmOpenRecord = (table, id) => {
    if (table !== 'refunds') return false;
    if (ctx.byId.has(Number(id))) openDetail(ctx, Number(id)); else ctx.refresh().then(() => { if (ctx.byId.has(Number(id))) openDetail(ctx, Number(id)); else ctx.toast('That refund request is no longer available.', true); });
    return true;
  };
  if (params.get('open')) {
    const id = Number(params.get('open'));
    if (ctx.byId.has(id)) openDetail(ctx, id); else ctx.toast('That refund request is not available to you.', true);
    try { history.replaceState(null, '', location.pathname + '#' + activeTab); } catch (e) { /* harmless */ }
  }

  // live: another person's request, approval or payment -- debounced, quiet while typing
  let liveTimer = null;
  try {
    api.subscribe(['refunds', 'refund_payments', 'refund_files'], () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => ctx.refresh({ quiet: true }), 700); });
  } catch (e) { /* the page still works without live updates */ }
  return ctx;
}
