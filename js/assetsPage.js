// Assets & Supplies Custodian -- page controller. assets.html is a one-line shell; everything the page does is wired here.
// The data layer is passed in (`api`), so the same code runs against the real Supabase functions in production and against a stand-in
// object in tests.
//
// One loaded copy of the data (ctx) feeds every tab; a change anywhere goes through the database, then ctx.refresh() reloads and redraws.
// Who may do what is decided by the database; the page only hides the buttons a person could not use. Two kinds of record live here and are
// never mixed: ASSETS (one individual item, one holder, a permanent history) and SUPPLIES (quantities in a stock ledger).
import { esc, drawersHtml, makeToast, closeDrawer, isDrawerOpen, friendly, branchBadge } from './assetsUi.js?v=20261007i';
import { DEFAULTS, makeCaps, enrichAssets, supplyRows, REQUEST_OPEN, OPEN_INCIDENT } from './assetsLogic.js?v=20261007i';
import { manilaDate } from './leaveUi.js?v=20261007i';
import { renderDashboard } from './assetsDashboard.js?v=20261007i';
import { renderAssets, newAssetsState } from './assetsList.js?v=20261007i';
import { renderPeople, newPeopleState } from './assetsPeople.js?v=20261007i';
import { renderBranches } from './assetsBranch.js?v=20261007i';
import { renderTransfers, renderReturns, renderRepairs, renderIncidents, renderDisposals, newFlowState } from './assetsFlows.js?v=20261007i';
import { renderSupplies, newSuppliesState } from './suppliesPage.js?v=20261007i';
import { renderIssuance, newIssuanceState } from './suppliesIssue.js?v=20261007i';
import { renderRequests, newRequestsState } from './suppliesRequests.js?v=20261007i';
import { renderReports } from './assetsReports.js?v=20261007i';
import { renderAudit, renderSettings, newAuditState } from './assetsAdmin.js?v=20261007i';
import { renderMine } from './assetsMine.js?v=20261007i';
import { openAsset, closeAsset, assetOpenId } from './assetsDetail.js?v=20261007i';
import { openAssetForm, requestCloseForm } from './assetsForm.js?v=20261007i';
import * as work from './assetsWork.js?v=20261007i';
import * as cases from './assetsCases.js?v=20261007i';
import * as printing from './assetsPrint.js?v=20261007i';
import { openScan } from './assetsQr.js?v=20261007i';
import { openEmployee } from './assetsPeople.js?v=20261007i';
import { openSupplyCard, supplyActions } from './suppliesPage.js?v=20261007i';
import { openRequestCard, openRequestForm } from './suppliesRequests.js?v=20261007i';
import { openIssueForm } from './suppliesIssue.js?v=20261007i';

const $ = (id) => document.getElementById(id);

/** Everything an Assets screen needs besides its own markup. The caller supplies ctx.refresh / rerender. */
export function createAssetsContext(api, employee) {
  const ctx = {
    api, employee, access: null, caps: null, today: manilaDate(new Date().toISOString()), settings: { ...DEFAULTS }, branches: [], branchById: {}, people: [], personById: {}, cats: [], departments: [], names: {},
    data: { assets: [], assignments: [], acks: [], transfers: [], repairs: [], incidents: [], disposals: [], financials: [], repairCosts: [], accessories: [], supplies: [], balances: [], supplyCosts: [], requests: [], issuances: [], receipts: [], supplyTransfers: [] },
    assets: [], byId: new Map(), supplyList: [], supplyById: new Map(), dash: null, dashAt: 0, recent: [],
    ui: { assets: newAssetsState(), people: newPeopleState(), flow: newFlowState(), supplies: newSuppliesState(), issuance: newIssuanceState(), requests: newRequestsState(), audit: newAuditState(), repOpen: new Set() },
  };
  ctx.toast = makeToast();
  ctx.caps = makeCaps(ctx);

  const addNames = (ids, rows, keys) => rows.forEach((r) => keys.forEach((k) => { if (r[k]) ids.add(r[k]); }));
  ctx.ensureNames = async (ids) => {
    const missing = [...new Set(ids)].filter((id) => id && !ctx.names[id]);
    if (!missing.length) return;
    try { Object.assign(ctx.names, await api.employeeNames(missing)); } catch (err) { /* names fall back to "Unknown" */ }
  };

  ctx.loadData = async () => {
    const access = await api.myAccess();
    ctx.access = access;
    ctx.caps = makeCaps(ctx);
    const c = ctx.caps, wantAssets = true, wantSupplies = c.viewSupplies || c.requestSupplies;
    const [branches, cats, settings, people, departments] = await Promise.all([
      api.listBranches(), api.listCategories(), api.listSettings().catch(() => []),
      (c.viewAssets || wantSupplies) ? api.listPeople().catch(() => []) : Promise.resolve([]), c.viewAssets ? api.listDepartments().catch(() => []) : Promise.resolve([]),
    ]);
    ctx.today = access.today || manilaDate(new Date().toISOString());
    ctx.branches = branches; ctx.branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
    ctx.cats = cats; ctx.departments = departments || [];
    ctx.settings = { ...DEFAULTS, ...Object.fromEntries((settings || []).map((s) => [s.key, Number(s.value)]).filter(([, v]) => Number.isFinite(v))) };
    ctx.people = people || [];
    ctx.personById = Object.fromEntries(ctx.people.map((p) => [p.id, p]));
    if (!ctx.personById[employee.id]) ctx.personById[employee.id] = { id: employee.id, full_name: employee.full_name, status: 'Active', branch_id: employee.branch_id, position: employee.position, left: false };
    ctx.people.forEach((p) => { ctx.names[p.id] = p.full_name; });
    ctx.names[employee.id] = employee.full_name;

    const R = await Promise.all([
      wantAssets ? api.listAssets() : [], api.listAccessories(), api.listAssignments(), api.listAcknowledgments(), api.listAssetTransfers(), api.listRepairs(), api.listIncidents(), api.listDisposals(),
      c.viewCost ? api.listFinancials() : [], c.viewCost ? api.listRepairCosts() : [],
      wantSupplies ? api.listSupplies() : [], wantSupplies ? api.listBalances() : [], c.viewSupplies && c.viewCost ? api.listSupplyCosts() : [],
      wantSupplies ? api.listSupplyRequests() : [], c.viewSupplies ? api.listIssuances() : [], c.viewSupplies ? api.listReceipts() : [], c.viewSupplies ? api.listSupplyTransfers() : [],
    ]);
    const [assets, accessories, assignments, acks, transfers, repairs, incidents, disposals, financials, repairCosts, supplies, balances, supplyCosts, requests, issuances, receipts, supplyTransfers] = R;
    ctx.data = { assets, accessories, assignments, acks, transfers, repairs, incidents, disposals, financials, repairCosts, supplies, balances, supplyCosts, requests, issuances, receipts, supplyTransfers };
    const ids = new Set([employee.id]);
    addNames(ids, assets, ['assigned_employee_id', 'custodian_id', 'created_by']); addNames(ids, assignments, ['employee_id', 'issued_by', 'return_received_by']); addNames(ids, acks, ['employee_id']);
    addNames(ids, transfers, ['requested_by', 'approved_by', 'released_by', 'received_by', 'from_employee_id', 'to_employee_id', 'cancelled_by']);
    addNames(ids, repairs, ['reported_by']); addNames(ids, incidents, ['reported_by', 'reviewed_by', 'resolved_by', 'custodian_id']); addNames(ids, disposals, ['requested_by', 'approved_by', 'processed_by']);
    addNames(ids, requests, ['requested_by', 'approved_by', 'reviewed_by', 'issued_by', 'received_by', 'cancelled_by']); addNames(ids, issuances, ['employee_id', 'issued_by', 'received_by']); addNames(ids, receipts, ['received_by']); addNames(ids, supplyTransfers, ['performed_by']);
    await ctx.ensureNames([...ids]);
    enrichAssets(ctx);
    ctx.supplyList = supplyRows(ctx); ctx.supplyById = new Map(ctx.supplyList.map((s) => [s.id, s]));
  };
  /** the dashboard numbers are counted by the database (so they always match what each person may see) */
  ctx.loadDashboard = async () => {
    if (!(ctx.caps.viewAssets || ctx.caps.viewSupplies)) return null;
    ctx.dash = await api.dashboard(); ctx.dashAt = Date.now();
    try { ctx.recent = ctx.caps.viewAssets ? await api.listRecentMovements(15) : []; await ctx.ensureNames(ctx.recent.map((m) => m.performed_by)); } catch (e) { ctx.recent = []; }
    return ctx.dash;
  };

  // ---- openers every screen shares ----
  ctx.openAsset = (id, opts) => openAsset(ctx, id, opts);
  ctx.openForm = (opts) => openAssetForm(ctx, opts || {});
  ctx.work = Object.fromEntries(Object.keys(work).filter((k) => typeof work[k] === 'function').map((k) => [k, (...a) => work[k](ctx, ...a)]));
  ctx.cases = Object.fromEntries(Object.keys(cases).filter((k) => typeof cases[k] === 'function').map((k) => [k, (...a) => cases[k](ctx, ...a)]));
  ctx.print = Object.fromEntries(Object.keys(printing).filter((k) => typeof printing[k] === 'function').map((k) => [k, (...a) => printing[k](ctx, ...a)]));
  ctx.openEmployee = (id) => openEmployee(ctx, id);
  ctx.openSupply = (id, opts) => openSupplyCard(ctx, id, opts);
  ctx.supplyActions = supplyActions;
  ctx.openRequest = (id) => openRequestCard(ctx, id);
  ctx.openRequestForm = (opts) => openRequestForm(ctx, opts || {});
  ctx.openIssueForm = (opts) => openIssueForm(ctx, opts || {});
  ctx.scan = () => openScan(ctx);
  ctx.rerender = () => {};
  ctx.showTab = () => {};
  /** After any change: reload everything, redraw, and bring the open card (if any) up to date. */
  ctx.afterChange = async (msg) => { if (msg) ctx.toast(msg); await ctx.refresh(); if (ctx.detail) ctx.detail.reopen(); };
  ctx.goAsset = async (number) => {
    const res = await api.findByNumber(number);
    if (!res || res.ok === false) { ctx.toast((res && res.errors && res.errors[0]) || 'No asset with that number is available to you.', true); return false; }
    if (!ctx.byId.has(res.id)) await ctx.refresh();
    ctx.openAsset(res.id); return true;
  };
  return ctx;
}

export async function startAssetsPage({ root, api, employee, search, hash }) {
  root.innerHTML = '<div id="ac-whoami" class="lv-whoami bl-whoami"></div><div class="lv-tabs ac-tabs" id="ac-tabs" role="tablist" aria-label="Asset and supply sections"></div>' +
    '<div id="ac-panel" role="tabpanel"><p class="muted">Loading…</p></div>' + drawersHtml();
  const panel = $('ac-panel');
  const ctx = createAssetsContext(api, employee);
  const params = new URLSearchParams(search || '');
  let lastLoad = 0;

  const openIncidents = () => ctx.data.incidents.filter((i) => OPEN_INCIDENT.includes(i.status)).length;
  const pendingTransfers = () => ctx.data.transfers.filter((t) => ['Requested', 'Approved', 'In Transit'].includes(t.status)).length;
  const openRequests = () => ctx.data.requests.filter((r) => ['Requested', 'Under Review'].includes(r.status)).length;
  const leftHolding = () => ctx.assets.filter((a) => a._holderLeft).length;
  const tabDefs = () => {
    const c = ctx.caps;
    return [
      { id: 'dashboard', label: 'Dashboard', show: c.viewAssets || c.viewSupplies, render: renderDashboard },
      { id: 'my', label: c.viewAssets ? 'My Assets' : 'My Company Assets', show: true, render: renderMine },
      { id: 'assets', label: 'Assets', show: c.viewAssets, render: renderAssets },
      { id: 'supplies', label: 'Supplies', show: c.viewSupplies, render: renderSupplies },
      { id: 'people', label: 'Employee Accountability', show: c.viewAssets, badge: leftHolding(), render: renderPeople },
      { id: 'branches', label: 'Branch Assets', show: c.viewAssets, render: renderBranches },
      { id: 'transfers', label: 'Asset Transfers', show: c.viewAssets, badge: pendingTransfers(), render: renderTransfers },
      { id: 'issuance', label: 'Supply Issuance', show: c.viewSupplies, render: renderIssuance },
      { id: 'returns', label: 'Returns', show: c.viewAssets, render: renderReturns },
      { id: 'repairs', label: 'Maintenance & Repairs', show: c.viewAssets, render: renderRepairs },
      { id: 'incidents', label: 'Lost / Damaged', show: c.viewAssets, badge: openIncidents(), render: renderIncidents },
      { id: 'disposals', label: 'Disposals', show: c.viewAssets, render: renderDisposals },
      { id: 'requests', label: 'Requests', show: c.viewSupplies || c.requestSupplies, badge: c.viewSupplies ? openRequests() : 0, render: renderRequests },
      { id: 'reports', label: 'Reports', show: c.reports, render: renderReports },
      { id: 'audit', label: 'Audit Log', show: c.canSeeAudit, render: renderAudit },
      { id: 'settings', label: 'Settings', show: c.admin, render: renderSettings },
    ].filter((t) => t.show);
  };
  let activeTab = null;
  const visibleTab = (id) => tabDefs().find((t) => t.id === id);
  const homeTab = () => (ctx.caps.viewAssets || ctx.caps.viewSupplies ? 'dashboard' : 'my');

  function renderWhoami() {
    const c = ctx.caps, e = employee, role = c.admin ? 'Admin' : c.mgr ? 'Manager' : c.viewAssets && c.canAssign ? 'Custodian' : c.viewAssets ? 'Branch view' : 'Employee';
    const cls = { Admin: 'lv-orange', Manager: 'lv-blue', Custodian: 'lv-green', 'Branch view': 'lv-green', Employee: 'lv-gray' }[role];
    const branch = (ctx.branchById[e.branch_id] || {}).name;
    const note = { Admin: 'You can do everything here, including the settings and the audit log.', Manager: 'You approve transfers and disposals, resolve lost and damaged reports, and see the audit log.',
      Custodian: c.viewAll ? 'You look after company property at every branch.' : 'You look after company property at ' + (branch || 'your branch') + '.', 'Branch view': 'You can see the company property at ' + (branch || 'your branch') + '.',
      Employee: 'You can see the company property issued to you, confirm you received it, and report a problem.' }[role];
    const scope = c.viewAssets ? (c.viewAll ? 'all branches' : (branch || 'your branch') + ' only') : '';
    $('ac-whoami').innerHTML = '<span>Signed in as <b>' + esc(ctx.names[e.id] || e.full_name || '') + '</b> <span class="badge ' + cls + '">' + esc(role) + '</span>' + (scope ? ' <span class="badge lv-gray">' + esc(scope) + '</span>' : '') + ' <span class="muted">' + esc(note) + '</span></span>' +
      '<span class="bl-whoami-right"><button type="button" class="btn small secondary" id="ac-scan-top">Scan / find asset</button>' + (c.canAdd ? '<button type="button" class="btn small" id="ac-add-top">+ Add Asset</button>' : '') + '</span>';
    $('ac-scan-top').addEventListener('click', () => ctx.scan());
    if ($('ac-add-top')) $('ac-add-top').addEventListener('click', () => ctx.openForm({}));
  }
  function renderTabs() {
    $('ac-tabs').innerHTML = tabDefs().map((t) =>
      '<button type="button" class="lv-tab' + (t.id === activeTab ? ' lv-tab-active' : '') + '" role="tab" aria-selected="' + (t.id === activeTab) + '" data-tab="' + t.id + '">' + esc(t.label) +
      (t.badge ? ' <span class="lv-tab-badge">' + t.badge + '</span>' : '') + '</button>').join('');
    $('ac-tabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
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
  /** open the Assets tab already filtered (dashboard cards and alert counts use this) */
  ctx.applyView = (viewId, q) => { const t = ctx.ui.assets; t.view = viewId || 'active'; t.page = 1; if (q) Object.assign(t.q, q); return showTab('assets'); };

  // ---- refresh: reload everything and redraw, without stealing focus from someone typing ----
  let inflight = null, again = null, pendingRender = false;
  const typing = () => panel.contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  const anyDrawer = () => ['side', 'form', 'aux'].some(isDrawerOpen);
  ctx.refresh = (opts = {}) => {
    if (inflight) { again = opts; return inflight; }
    inflight = (async () => {
      try {
        await ctx.loadData(); lastLoad = Date.now(); ctx.dash = null;
        ctx.ui.audit.loaded = false;
        if (!visibleTab(activeTab)) activeTab = homeTab();
        renderWhoami(); renderTabs();
        if (opts.quiet && (typing() || anyDrawer())) pendingRender = true; else { pendingRender = false; await renderPanel(); }
        // a card that is open (and not in the middle of a confirmation) follows the new data
        if (opts.quiet && ctx.detail && !$('ac-act-ok') && !anyDrawer()) ctx.detail.reopen();
      } catch (err) { ctx.toast(err.message || String(err), true); } finally { inflight = null; }
      if (again) { const next = again; again = null; return ctx.refresh(next); }
    })();
    return inflight;
  };
  panel.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !typing() && !anyDrawer()) { pendingRender = false; renderPanel(); } }, 80));

  // ---- drawers: close buttons, backdrops, Escape; and the "⋯" menus close when you click elsewhere ----
  const closeDetail = () => { ctx.detail = null; closeAsset(); closeDrawer('detail'); };
  ctx.closeDetail = closeDetail;
  $('ac-detail-close').addEventListener('click', closeDetail); $('ac-detail-backdrop').addEventListener('click', closeDetail);
  $('ac-form-close').addEventListener('click', requestCloseForm); $('ac-form-backdrop').addEventListener('click', requestCloseForm);
  $('ac-side-close').addEventListener('click', () => closeDrawer('side')); $('ac-side-backdrop').addEventListener('click', () => closeDrawer('side'));
  $('ac-aux-close').addEventListener('click', () => { closeDrawer('aux'); document.dispatchEvent(new CustomEvent('ac-aux-closed')); }); $('ac-aux-backdrop').addEventListener('click', () => { closeDrawer('aux'); document.dispatchEvent(new CustomEvent('ac-aux-closed')); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !$('ac-side-drawer')) return;
    if (isDrawerOpen('aux')) { closeDrawer('aux'); document.dispatchEvent(new CustomEvent('ac-aux-closed')); } else if (isDrawerOpen('side')) closeDrawer('side'); else if (isDrawerOpen('form')) requestCloseForm(); else if (isDrawerOpen('detail')) closeDetail();
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
    $('ac-tabs').innerHTML = '';
    return ctx;
  }
  renderWhoami();
  const wanted = String(hash || '').replace('#', '');
  await showTab(visibleTab(wanted) ? wanted : homeTab());

  // a scanned QR code / typed link (?asset=AST-2026-00001) or an activity notification (?open=<id>) opens the asset card in place
  window.__kmOpenRecord = (tableName, id) => {
    if (tableName !== 'assets') return false;
    if (ctx.byId.has(id)) ctx.openAsset(id); else ctx.refresh().then(() => { if (ctx.byId.has(id)) ctx.openAsset(id); else ctx.toast('That asset is no longer available to you.', true); });
    return true;
  };
  if (params.get('asset')) {
    const n = params.get('asset');
    ctx.goAsset(n);
    try { history.replaceState(null, '', location.pathname + '#' + activeTab); } catch (e) { /* harmless */ }
  } else if (params.get('open')) {
    const id = Number(params.get('open'));
    if (ctx.byId.has(id)) ctx.openAsset(id); else ctx.toast('That asset is not available to you.', true);
    try { history.replaceState(null, '', location.pathname + '#' + activeTab); } catch (e) { /* harmless */ }
  }

  // live: another person's assignment, return, report, repair or stock change -- debounced, quiet while typing
  let liveTimer = null;
  try {
    api.subscribe(['assets', 'asset_assignments', 'asset_transfers', 'asset_repairs', 'asset_incidents', 'asset_disposals', 'supplies', 'supply_branch_balances', 'supply_requests'], () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => ctx.refresh({ quiet: true }), 900); });
  } catch (e) { /* the page still works without live updates */ }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastLoad > 90000) ctx.refresh({ quiet: true }); });
  return ctx;
}
