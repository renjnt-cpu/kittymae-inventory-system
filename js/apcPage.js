// Access & Performance Control Center -- the page: the owner-only gate, the filter bar, the people-health strip, the nine tabs, and the shared state they read.
// Who may open it is decided by the database (keys access_perf.view and staff_analytics.view, held only by the owner); a person without the key gets {ok:false} from apc_context()
// and this page never asks for anything else -- so no staff data is ever sent to them.
import { esc, friendly, loadingBox, errorBox, mountShellOnce, openDrawer, toast, money } from './apcCore.js?v=20261008b';
import { createFilters } from './apcFilters.js?v=20261008b';
import { createClientTable } from './apcTable.js?v=20261008b';
import { thresholds } from './apcMetrics.js?v=20261008b';
import { accessConflicts } from './apcAccessModel.js?v=20261008b';
import { renderOverview } from './apcOverview.js?v=20261008b';
import { renderAccess } from './apcAccess.js?v=20261008b';
import { renderPeople } from './apcPeople.js?v=20261008b';
import { renderSales, renderPos, renderScrap } from './apcRank.js?v=20261008b';
import { renderErrors } from './apcErrors.js?v=20261008b';
import { renderActivity } from './apcActivity.js?v=20261008b';
import { renderMatrix } from './apcMatrix.js?v=20261008b';
import { openSettings } from './apcSettings.js?v=20261008b';

const TABS = [
  { id: 'overview', label: 'Overview', needs: 'access', make: renderOverview },
  { id: 'access', label: 'Access Control', needs: 'access', make: renderAccess },
  { id: 'people', label: 'Employee Performance', needs: 'analytics', make: renderPeople },
  { id: 'sales', label: 'Sales Ranking', needs: 'analytics', make: renderSales },
  { id: 'pos', label: 'POS Performance', needs: 'analytics', make: renderPos },
  { id: 'scrap', label: 'Scrap Performance', needs: 'analytics', make: renderScrap },
  { id: 'errors', label: 'Errors & Data Quality', needs: 'analytics', make: renderErrors },
  { id: 'activity', label: 'Activity Log', needs: 'analytics', make: renderActivity },
  { id: 'matrix', label: 'Role / Position Matrix', needs: 'access', make: renderMatrix },
];

export function denied(root, message) {
  root.innerHTML = '<div class="center-screen"><div><h2>403 — ACCESS DENIED</h2><p>' + esc(message || 'This page is for the owner only.') + '</p><p class="muted">Taking you back to your Dashboard…</p><p><a class="btn small" href="dashboard.html">Go to the Dashboard now</a></p></div></div>';
  setTimeout(() => { if (typeof location !== 'undefined' && !window.__apcNoRedirect) location.href = 'dashboard.html'; }, 5000);
}

export async function startApcPage({ root, api, employee, hash }) {
  mountShellOnce();
  root.innerHTML = loadingBox('Opening the Access & Performance Control Center…');
  let ctx;
  try { ctx = await api.context(); } catch (err) { root.innerHTML = errorBox(friendly(err)); return null; }
  if (!ctx || ctx.ok === false) { denied(root, ctx && ctx.errors && ctx.errors[0]); return null; }

  const can = { analytics: !!ctx.can.analytics, admin: !!ctx.can.admin, cost: !!ctx.can.cost };
  const S = { ctx, roster: [], snap: { keys: [], employees: [] }, perf: [], errs: { rows: [], open_now: 0, in_review_now: 0 }, notes: {}, selected: null, tab: 'overview', ver: 0, loading: false };
  const tabs = TABS.filter((t) => t.needs === 'access' || can.analytics);
  let merged = null, filters = null, panelEl = null, current = null, prevCache = { key: '', rows: null };

  // ---------------------------------------------------------------- shared data
  async function loadAccess() {
    const [roster, snap, notes] = await Promise.all([api.roster(), api.snapshot(), api.notes()]);
    S.roster = roster || []; S.snap = snap || { keys: [], employees: [] }; S.notes = notes || {}; S.ver++; merged = null;
  }
  async function loadData() {
    if (!can.analytics) return;
    const f = filters.server();
    const [perf, errs] = await Promise.all([api.performance(f), api.errors(f)]);
    S.perf = (perf && perf.rows) || []; S.errs = errs || S.errs; prevCache = { key: '', rows: null }; S.ver++; merged = null;
  }
  function allPeople() {
    if (merged && merged.ver === S.ver) return merged.rows;
    const snapBy = Object.fromEntries((S.snap.employees || []).map((e) => [e.id, e])), perfBy = Object.fromEntries(S.perf.map((r) => [r.id, r]));
    const rows = S.roster.map((r) => {
      const pr = perfBy[r.id];
      return Object.assign({}, r, { snap: snapBy[r.id] || null, perf: pr ? Object.assign({}, pr, { has_login: r.has_login, last_activity: r.last_activity }) : null });
    });
    merged = { ver: S.ver, rows }; return rows;
  }

  // ---------------------------------------------------------------- the app object every tab receives
  const A = {
    api, S, can, employee, ctx,
    get filters() { return filters; },
    th: () => thresholds(ctx),
    allPeople, people: () => allPeople().filter((p) => filters.matches(p)),
    byId: (id) => allPeople().find((p) => p.id === id) || null,
    perfRows: () => allPeople().filter((p) => p.perf).map((p) => p.perf),
    /** the previous period's figures (loaded once per range, on demand) */
    async prevPerf() {
      const f = filters.prevServer(), key = JSON.stringify(f);
      if (prevCache.key === key && prevCache.rows) return prevCache.rows;
      const r = await api.performance(f); prevCache = { key, rows: (r && r.rows) || [] }; return prevCache.rows;
    },
    select(id, tab) { S.selected = id; if (tab && tabs.some((t) => t.id === tab)) A.go(tab); else renderTab(); },
    go(tab) { if (tabs.some((t) => t.id === tab)) { S.tab = tab; history.replaceState(null, '', '#' + tab); renderTabs(); renderTab(); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
    toast,
    async reload(what) {
      try {
        if (what === 'access' || what === 'all') await loadAccess();
        if (what === 'data' || what === 'all') await loadData();
      } catch (err) { toast(friendly(err), true); }
      renderHealth(); renderTab();
    },
    drill, openSettings: () => openSettings(A), refreshHealth: renderHealth,
    conflictsOf: (p) => (p.snap ? accessConflicts(p.snap, ctx.me.id) : []),
    nextEmployee(dir, list) {
      const ids = (list || A.people()).map((p) => p.id), i = ids.indexOf(S.selected);
      if (!ids.length) return null;
      return ids[(i < 0 ? 0 : (i + dir + ids.length) % ids.length)];
    },
  };

  // ---------------------------------------------------------------- drill-down: the records behind a figure
  async function drill(empId, metric, label) {
    const who = (A.byId(empId) || {}).name || '';
    openDrawer({ wide: true, title: label || 'Records', sub: who + ' · ' + filters.describe()[0], body: loadingBox('Finding the records…') });
    const body = document.getElementById('sd-drawer-body');
    try {
      const r = await api.drill(Object.assign({ employee: empId, metric }, filters.server()));
      body.innerHTML = '<p class="muted">' + esc(r.title || '') + ' — the records this figure is made of.</p><div id="apc-drill-table"></div>';
      createClientTable({ root: body.querySelector('#apc-drill-table'), rows: r.rows || [], size: 25, sort: { key: 'at', dir: 'desc' }, title: (r.title || label || 'Records') + ' — ' + who, exportName: 'records-' + metric,
        subtitle: () => ['Employee: ' + who].concat(filters.describe()), emptyText: 'No records behind this figure for this period.',
        columns: [{ key: 'at', label: 'Date', type: 'dt' }, { key: 'ref', label: 'Reference' }, { key: 'branch', label: 'Branch' }, { key: 'summary', label: 'What', render: (x) => '<span class="sd-small">' + esc(x.summary) + '</span>' }, { key: 'amount', label: 'Amount', type: 'money' }] });
    } catch (err) { body.innerHTML = errorBox(friendly(err)); }
  }

  // ---------------------------------------------------------------- people health strip (spec: "18 Active Employees · 3 Need Access Review · 4 Open Data Errors · 2 High Error Rate · 1 Permission Conflict")
  function renderHealth() {
    const people = A.people(), th = A.th(), el = root.querySelector('#apc-health'); if (!el) return;
    const active = people.filter((p) => p.status === 'Active');
    const review = active.filter((p) => p.snap && ['NEEDS REVIEW', 'ACCESS MISMATCH'].includes(p.snap.verify_status)).length;
    const highErr = active.filter((p) => p.perf && p.perf.rates.error !== null && p.perf.workload.total >= th.min_sample && Number(p.perf.rates.error) >= th.error_rate_pct).length;
    const conflicts = active.filter((p) => A.conflictsOf(p).some((c) => c.level === 'warn')).length;
    const open = (S.errs.open_now || 0) + (S.errs.in_review_now || 0);
    const chip = (n, label, tone, tab) => '<button type="button" class="apc-health-chip apc-h-' + tone + '" data-tab="' + tab + '"><b>' + n + '</b> ' + esc(label) + '</button>';
    el.innerHTML = '<span class="apc-health-title">People health</span>' + chip(active.length, 'Active Employees', 'blue', 'people') + chip(review, review === 1 ? 'Needs Access Review' : 'Need Access Review', review ? 'orange' : 'green', 'access') +
      (can.analytics ? chip(open, 'Open Data Errors', open ? 'orange' : 'green', 'errors') + chip(highErr, 'High Error Rate', highErr ? 'red' : 'green', 'errors') : '') +
      chip(conflicts, conflicts === 1 ? 'Permission Conflict' : 'Permission Conflicts', conflicts ? 'red' : 'green', 'access');
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => A.go(b.dataset.tab)));
  }

  // ---------------------------------------------------------------- shell of the page
  root.innerHTML =
    '<div class="sd-head"><div><h2 class="sd-title">Access &amp; Performance Control Center</h2><div class="muted">Review staff access, performance, productivity, and data quality from one place.</div>' +
      '<div class="apc-confidential">🔒 Confidential — owner only. Figures are a review tool, never a verdict on a person, and are not used for pay or discipline.</div></div>' +
      '<div class="sd-head-right"><button type="button" class="btn small secondary" id="apc-settings">Settings</button><button type="button" class="btn small secondary" id="apc-refresh">Refresh</button></div></div>' +
    '<div id="apc-filters"></div><div id="apc-health" class="apc-health" role="status"></div>' +
    '<div class="sd-tabs" role="tablist" aria-label="Sections" id="apc-tabs"></div><div id="apc-panel" role="tabpanel"></div>';
  panelEl = root.querySelector('#apc-panel');
  const initial = (hash || location.hash || '').replace('#', '');
  S.tab = tabs.some((t) => t.id === initial) ? initial : 'overview';

  function renderTabs() {
    const el = root.querySelector('#apc-tabs');
    el.innerHTML = tabs.map((t) => '<button type="button" role="tab" class="sd-tab' + (t.id === S.tab ? ' active' : '') + '" data-tab="' + t.id + '" aria-selected="' + (t.id === S.tab) + '">' + esc(t.label) + '</button>').join('');
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => A.go(b.dataset.tab)));
  }
  let renderToken = 0;
  async function renderTab() {
    const t = tabs.find((x) => x.id === S.tab) || tabs[0], my = ++renderToken;
    if (current && current.destroy) { try { current.destroy(); } catch (e) { /* ignore */ } }
    panelEl.innerHTML = '';
    try { current = await t.make(panelEl, A); if (my !== renderToken && current && current.destroy) current.destroy(); }
    catch (err) { if (my === renderToken) panelEl.innerHTML = errorBox('This section could not be drawn: ' + friendly(err)); }
  }

  filters = createFilters({ root: root.querySelector('#apc-filters'), ctx, positions: ctx.positions || [], onChange: async (kind) => {
    if (kind === 'data') { panelEl.innerHTML = loadingBox('Updating the figures…'); try { await loadData(); } catch (err) { toast(friendly(err), true); } }
    renderHealth(); renderTab();
  } });
  root.querySelector('#apc-settings').addEventListener('click', () => openSettings(A));
  root.querySelector('#apc-refresh').addEventListener('click', async (ev) => { ev.target.disabled = true; await A.reload('all'); ev.target.disabled = false; toast('Refreshed.'); });

  panelEl.innerHTML = loadingBox('Loading people, access and figures…');
  try { await Promise.all([loadAccess(), loadData()]); } catch (err) { root.querySelector('#apc-panel').innerHTML = errorBox(friendly(err)); }
  renderTabs(); renderHealth(); await renderTab();
  return A;
}
