// Bills Management -- page controller. bills.html is a one-line shell; everything the page does is wired
// here. The data layer is passed in (`api`), so the same code runs against the real Supabase functions in
// production and against a stand-in object in tests.
//
// One loaded copy of the data (ctx) feeds every tab; a change anywhere goes through the database, then
// ctx.refresh() reloads and redraws. Who may do what is decided by the database -- the page only hides
// the buttons a person could not use.
import { esc, drawersHtml, makeToast, closeDrawer, isDrawerOpen, drawerBody, friendly } from './billsUi.js?v=20261007d';
import { enrichBills, daysToSunday } from './billsLogic.js?v=20261007d';
import { defaultFilters } from './billsFilters.js?v=20261007d';
import { renderDashboard } from './billsDashboard.js?v=20261007d';
import { renderTable, newTableState, openAssignBranches } from './billsTable.js?v=20261007d';
import { renderCalendar, renderPlanning, newCalState, newPlanState } from './billsCalendar.js?v=20261007d';
import { renderRecurring, openTemplateForm } from './billsRecurring.js?v=20261007d';
import { renderReports } from './billsReports.js?v=20261007d';
import { renderLog, renderSettings, newLogState } from './billsAdmin.js?v=20261007d';
import { openDetail, closeDetail, detailOpenId } from './billsDetail.js?v=20261007d';
import { openBillForm, requestCloseForm, openPayment, openUpload, openSnooze } from './billsForm.js?v=20261007d';
import { bellHtml, refreshBell } from './billsNotifications.js?v=20261007d';

const $ = (id) => document.getElementById(id);

/** Everything a Bills screen needs besides its own markup. The caller supplies ctx.refresh / rerender. */
export function createBillsContext(api, employee) {
  const ctx = {
    api, employee, access: { role: 'No access' }, today: '', soonDays: 7, highAmount: 20000, daysToSunday: 0,
    cats: [], catById: {}, branches: [], branchById: {}, people: [],
    data: { bills: [], payments: [], attachments: [], templates: [], notifications: [] }, bills: [], byId: new Map(),
    filters: { year: 0, month: 0, branch: '', category: '', status: '' },
    canWrite: false, canAdd: false, canAdmin: false, canDelete: false,
    ui: { budget: '', table: newTableState(), cal: null, plan: newPlanState(), log: newLogState(), repOpen: new Set(), showArchivedTemplates: false },
  };
  ctx.toast = makeToast();
  ctx.rules = () => ({ daysToSunday: ctx.daysToSunday, highAmount: ctx.highAmount });
  ctx.detailOpenId = detailOpenId;

  ctx.loadData = async (opts = {}) => {
    const [access, cats, branches, bills, payments, attachments, templates, settings] = await Promise.all([
      api.getAccess(), api.listCategories(), api.listBranches(), api.listBills(), api.listPayments(), api.listAttachments(), api.listTemplates(), api.listSettings().catch(() => []),
    ]);
    if (!access || access.role === 'No access') throw Object.assign(new Error('Expense tracking is restricted to Admin or accounts granted Expenses access.'), { noAccess: true });
    const first = !ctx.today;
    ctx.access = access; ctx.today = access.today;
    ctx.canWrite = !!access.write; ctx.canAdmin = !!access.admin; ctx.canAdd = !!(access.write || access.branch_only);
    ctx.canDelete = !!(access.admin || (employee && employee.role === 'Manager'));
    const cfg = Object.fromEntries((settings || []).map((s) => [s.key, s.value]));
    ctx.highAmount = Number(cfg.high_amount ?? 20000); ctx.soonDays = Number(cfg.due_soon_days ?? 7); ctx.daysToSunday = daysToSunday(ctx.today);
    ctx.cats = cats; ctx.catById = Object.fromEntries(cats.map((c) => [c.id, c]));
    ctx.branches = branches; ctx.branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
    ctx.data = { ...ctx.data, bills, payments, attachments, templates };
    ctx.bills = enrichBills(ctx.data, ctx);
    ctx.byId = new Map(ctx.bills.map((b) => [b.id, b]));
    if (first) { ctx.filters = defaultFilters(ctx); ctx.ui.cal = newCalState(ctx.today); }
    // these two only enrich the page; losing them must never stop it opening
    if (opts.light !== true) {
      try { ctx.people = access.write ? await api.listPeople() : []; } catch (e) { ctx.people = []; }
      try { ctx.data.notifications = await api.listNotifications(60); } catch (e) { ctx.data.notifications = []; }
    }
  };
  ctx.reloadNotifications = async () => { try { ctx.data.notifications = await api.listNotifications(60); refreshBell(ctx); } catch (e) { /* the bell is a convenience */ } };

  ctx.openDetail = (id, opts) => openDetail(ctx, id, opts);
  ctx.openForm = (opts) => openBillForm(ctx, opts);
  ctx.openPayment = (id) => openPayment(ctx, id);
  ctx.openUpload = (id) => openUpload(ctx, id);
  ctx.openSnooze = (id) => openSnooze(ctx, id);
  ctx.openTemplateForm = (id) => openTemplateForm(ctx, id);
  ctx.openAssignBranches = () => openAssignBranches(ctx);
  ctx.rerender = () => {};
  ctx.showTab = () => {};
  ctx.applyView = () => {};
  return ctx;
}

export async function startBillsPage({ root, api, employee, search, hash }) {
  root.innerHTML = '<div id="bl-whoami" class="lv-whoami bl-whoami"></div><div class="lv-tabs" id="bl-tabs" role="tablist" aria-label="Expenses sections"></div>' +
    '<div id="bl-panel" role="tabpanel"><p class="muted">Loading…</p></div>' + drawersHtml();
  const panel = $('bl-panel');
  const ctx = createBillsContext(api, employee);
  const params = new URLSearchParams(search || '');

  const overdueCount = () => ctx.bills.filter((b) => b._eff === 'Overdue').length;
  const tabDefs = () => [
    { id: 'dashboard', label: 'Dashboard', show: true, render: renderDashboard },
    { id: 'bills', label: 'Expenses', show: true, badge: overdueCount(), render: renderTable },
    { id: 'calendar', label: 'Calendar', show: true, render: renderCalendar },
    { id: 'planning', label: 'Cash Planning', show: true, render: renderPlanning },
    { id: 'recurring', label: 'Recurring', show: !ctx.access.branch_only, render: renderRecurring },
    { id: 'reports', label: 'Reports', show: true, render: renderReports },
    { id: 'log', label: 'Activity Log', show: ctx.canAdmin, render: renderLog },
    { id: 'settings', label: 'Settings', show: ctx.canAdmin, render: renderSettings },
  ].filter((t) => t.show);
  let activeTab = null;
  const visibleTab = (id) => tabDefs().find((t) => t.id === id);

  function renderWhoami() {
    const role = ctx.access.role;
    const cls = { Admin: 'lv-orange', Finance: 'lv-blue', Viewer: 'lv-gray', 'Branch Manager': 'lv-green' }[role] || 'lv-gray';
    const note = role === 'Viewer' ? 'You can see expenses and reports but cannot change them.'
      : role === 'Branch Manager' ? 'You see ' + esc((ctx.branchById[ctx.access.branch_id] || {}).name || 'your branch') + ' expenses and can add expenses and proof for it.' : '';
    $('bl-whoami').innerHTML = '<span>Signed in as <b>' + esc(ctx.access.name || (employee && employee.full_name) || '') + '</b> <span class="badge ' + cls + '">' + esc(role) + '</span>' + (note ? ' <span class="muted">' + note + '</span>' : '') + '</span>' +
      '<span class="bl-whoami-right"><span id="bl-bell-slot">' + bellHtml(ctx) + '</span>' + (ctx.canAdd ? '<button type="button" class="btn small" id="bl-add-top">+ Add Expense</button>' : '') + '</span>';
    refreshBell(ctx);
    if ($('bl-add-top')) $('bl-add-top').addEventListener('click', () => ctx.openForm({}));
  }
  function renderTabs() {
    $('bl-tabs').innerHTML = tabDefs().map((t) =>
      '<button type="button" class="lv-tab' + (t.id === activeTab ? ' lv-tab-active' : '') + '" role="tab" aria-selected="' + (t.id === activeTab) + '" data-tab="' + t.id + '">' + esc(t.label) +
      (t.badge ? ' <span class="lv-tab-badge">' + t.badge + '</span>' : '') + '</button>').join('');
    $('bl-tabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
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
    if (!visibleTab(id)) id = 'dashboard';
    activeTab = id;
    try { history.replaceState(null, '', location.pathname + location.search + '#' + id); } catch (e) { /* harmless */ }
    renderTabs();
    panel.innerHTML = '';
    return renderPanel();
  }
  ctx.showTab = showTab;
  ctx.rerender = () => { renderTabs(); return renderPanel(); };
  ctx.applyView = (viewId) => { const t = ctx.ui.table; t.view = viewId; t.page = 1; t.selected.clear(); return showTab('bills'); };

  // ---- refresh: reload everything and redraw, without stealing focus from someone typing ----
  let inflight = null, again = null, pendingRender = false;
  const typing = () => panel.contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  ctx.refresh = (opts = {}) => {
    if (inflight) { again = opts; return inflight; }
    inflight = (async () => {
      try {
        await ctx.loadData({ light: opts.light });
        ctx.ui.log.loaded = false;
        if (!visibleTab(activeTab)) activeTab = 'dashboard';
        renderWhoami(); renderTabs();
        if (opts.quiet && typing()) pendingRender = true; else { pendingRender = false; await renderPanel(); }
        // a detail card that is open (and not in the middle of a confirmation) follows the new data
        if (opts.quiet && detailOpenId() !== null && !$('bl-act-ok')) { const id = detailOpenId(); if (ctx.byId.has(id)) openDetail(ctx, id, { keep: true }); else closeDetail(); }
      } catch (err) { ctx.toast(err.message || String(err), true); } finally { inflight = null; }
      if (again) { const next = again; again = null; return ctx.refresh(next); }
    })();
    return inflight;
  };
  panel.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !typing()) { pendingRender = false; renderPanel(); } }, 80));

  // ---- drawers: close buttons, backdrops, Escape; and the "⋯" menus close when you click elsewhere ----
  $('bl-detail-close').addEventListener('click', closeDetail); $('bl-detail-backdrop').addEventListener('click', closeDetail);
  $('bl-form-close').addEventListener('click', requestCloseForm); $('bl-form-backdrop').addEventListener('click', requestCloseForm);
  $('bl-side-close').addEventListener('click', () => closeDrawer('side')); $('bl-side-backdrop').addEventListener('click', () => closeDrawer('side'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !$('bl-side-drawer')) return;
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
    $('bl-tabs').innerHTML = '';
    return ctx;
  }
  renderWhoami();
  const wanted = String(hash || '').replace('#', '');
  await showTab(visibleTab(wanted) ? wanted : 'dashboard');
  if (params.get('open')) { const id = Number(params.get('open')); if (ctx.byId.has(id)) openDetail(ctx, id); else ctx.toast('That expense is no longer available.', true); }
  if (params.get('open')) { try { history.replaceState(null, '', location.pathname + '#' + activeTab); } catch (e) { /* harmless */ } }

  // once per day per browser tab, make sure today's reminders exist (the nightly job normally already did; this is idempotent)
  try {
    const key = 'bl-reminders-' + ctx.today;
    if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); api.refreshReminders().then(() => ctx.reloadNotifications()).catch(() => {}); }
  } catch (e) { /* storage can be blocked; the nightly job still runs */ }

  // live: another person's payment / new bill / reminder -- debounced, quiet while typing
  let liveTimer = null;
  try {
    api.subscribe(['bills', 'bill_payments', 'bill_attachments', 'recurring_bill_templates'], () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => ctx.refresh({ quiet: true, light: true }), 700); });
    api.subscribe('bill_notifications', () => ctx.reloadNotifications());
  } catch (e) { /* the page still works without live updates */ }
  return ctx;
}
