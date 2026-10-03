// Leave Management -- page controller. leave.html is a one-line shell; everything the page does
// is wired here. The data layer is passed in (`api`), so the same code runs against the real
// Supabase functions in production and against a stand-in object in tests.
import { esc, fmtDate, OPEN_STATUSES, DECISION_STATUSES, PENDING_HR } from './leaveUi.js?v=20261004b';
import { openDetail, closeDetail } from './leaveDetail.js?v=20261004b';
import { openForm, closeForm, requestCloseForm } from './leaveForm.js?v=20261004b';
import { renderMine } from './leaveMine.js?v=20261004b';
import { renderHr, renderFinal } from './leaveReview.js?v=20261004b';
import { renderCredits } from './leaveCredits.js?v=20261004b';
import { renderSettings } from './leaveSettings.js?v=20261004b';
import { renderAudit } from './leaveAudit.js?v=20261004b';
import { closeSide } from './leaveSide.js?v=20261004b';

const SKELETON =
  '<div id="lv-toast" class="lv-toast" aria-live="polite"></div>' +
  '<div id="lv-whoami" class="lv-whoami"></div>' +
  '<div class="lv-tabs" id="lv-tabs" role="tablist" aria-label="Leave Management sections"></div>' +
  '<div id="lv-panel" role="tabpanel"><p class="muted">Loading…</p></div>' +
  drawer('form', 'File Leave Request', true) + drawer('detail', 'Leave Request', true) + drawer('side', '', true);

function drawer(name, title, footer) {
  return '<div class="drawer-backdrop" id="lv-' + name + '-backdrop"></div>' +
    '<div class="drawer lv-drawer" id="lv-' + name + '-drawer" role="dialog" aria-modal="true" aria-labelledby="lv-' + name + '-title">' +
    '<div class="drawer-header"><div><h3 id="lv-' + name + '-title">' + esc(title) + '</h3><div class="muted" id="lv-' + name + '-sub"></div></div>' +
    '<button type="button" class="drawer-close" id="lv-' + name + '-close" aria-label="Close">✕</button></div>' +
    '<div class="drawer-body" id="lv-' + name + '-body"></div>' +
    (footer ? '<div class="drawer-footer" id="lv-' + name + '-footer"></div>' : '') + '</div>';
}

const TECHNICAL_ERROR = /violates|constraint|relation "|syntax error|null value|permission denied|JSON|invalid input|duplicate key|does not exist|PGRST|JWT|Failed to fetch|NetworkError|timeout/i;

export async function startLeavePage({ root, api, search, hash }) {
  root.innerHTML = SKELETON;
  const $ = (id) => document.getElementById(id);
  const panel = $('lv-panel');

  const ctx = {
    api, flags: { hr: false, final: false, view_all: false, audit: false }, settings: {}, today: '', me: null,
    dir: [], dirById: {}, types: [], typeById: {}, data: { requests: [], balances: [] },
  };

  // ---- toast: fixed above the drawers, so a message is never hidden behind one ----
  let toastTimer = null;
  ctx.toast = (text, isError) => {
    let shown = String(text);
    if (isError && TECHNICAL_ERROR.test(shown)) shown = 'Something went wrong and the change was not saved. Please try again — if it keeps happening, tell an Admin. (Details: ' + shown + ')';
    $('lv-toast').innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(shown) + '</div>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('lv-toast').innerHTML = ''; }, isError ? 9000 : 4500);
  };

  // ---- data ----
  async function loadData() {
    const [prof, dir, types, balances, requests, internal] = await Promise.all([
      api.getMyProfile(), api.getDirectory(), api.listLeaveTypes(), api.listBalances(), api.listRequests(),
      // HR's private comments (an employee simply gets no rows); losing them is never fatal
      api.listInternal().catch(() => []),
    ]);
    const commentsById = Object.fromEntries((internal || []).map((i) => [i.leave_request_id, i.hr_comments]));
    (requests || []).forEach((r) => { r.hr_comments = commentsById[r.id] || null; });
    if (!prof || !prof.profile) throw new Error('Your login is not linked to an active employee record, so Leave Management cannot open. Ask an Admin to check your account.');
    ctx.me = prof.profile;
    ctx.flags = prof.flags;
    ctx.settings = prof.settings || {};
    ctx.today = prof.today;
    ctx.dir = dir || [];
    ctx.dirById = Object.fromEntries(ctx.dir.map((e) => [e.employee_id, e]));
    ctx.types = types || [];
    ctx.typeById = Object.fromEntries(ctx.types.map((t) => [t.id, t]));
    ctx.data = { requests: requests || [], balances: balances || [] };
  }

  // ---- tabs ----
  const mineNeedsAction = () => ctx.data.requests.filter((r) => r.employee_id === ctx.me.employee_id && r.status === 'Needs Employee Information').length;
  const hrPending = () => ctx.data.requests.filter((r) => PENDING_HR.includes(r.status) && r.employee_id !== ctx.me.employee_id).length;
  const finalPending = () => ctx.data.requests.filter((r) => DECISION_STATUSES.includes(r.status) && r.employee_id !== ctx.me.employee_id).length;
  const tabDefs = () => [
    { id: 'mine', label: 'My Leave', show: true, badge: mineNeedsAction(), render: renderMine },
    { id: 'hr', label: 'HR Dashboard', show: ctx.flags.view_all, badge: ctx.flags.hr ? hrPending() : 0, render: renderHr },
    { id: 'final', label: 'Final Approval', show: ctx.flags.final, badge: finalPending(), render: renderFinal },
    { id: 'credits', label: 'Leave Credits', show: ctx.flags.view_all, badge: 0, render: renderCredits },
    { id: 'settings', label: 'Settings', show: ctx.flags.hr, badge: 0, render: renderSettings },
    { id: 'audit', label: 'Audit Log', show: ctx.flags.audit, badge: 0, render: renderAudit },
  ].filter((t) => t.show);

  let activeTab = null;
  const visibleTab = (id) => tabDefs().find((t) => t.id === id);

  function renderWhoami() {
    const role = ctx.flags.final ? 'Final Approver' : ctx.flags.hr ? 'HR' : ctx.flags.view_all ? 'View only' : 'Employee';
    const cls = ctx.flags.final ? 'lv-orange' : ctx.flags.hr ? 'lv-blue' : ctx.flags.view_all ? 'lv-gray' : 'lv-green';
    $('lv-whoami').innerHTML = 'Signed in as <b>' + esc(ctx.me.full_name) + '</b> <span class="badge ' + cls + '">' + esc(role) + '</span>' +
      (ctx.flags.view_all && !ctx.flags.hr ? ' <span class="muted">You can see all leave records but cannot approve or change them.</span>' : '');
  }

  function renderTabs() {
    $('lv-tabs').innerHTML = tabDefs().map((t) =>
      '<button type="button" class="lv-tab' + (t.id === activeTab ? ' lv-tab-active' : '') + '" role="tab" aria-selected="' + (t.id === activeTab) + '" data-tab="' + t.id + '">' +
      esc(t.label) + (t.badge ? ' <span class="lv-tab-badge">' + t.badge + '</span>' : '') + '</button>').join('');
    $('lv-tabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  }

  async function renderPanel() {
    const tab = visibleTab(activeTab);
    if (!tab) return;
    try { await tab.render(ctx, panel); } catch (err) {
      panel.innerHTML = '<div class="msg error">Could not show this section: ' + esc(err.message || String(err)) + '</div>';
    }
  }

  function showTab(id, opts = {}) {
    if (!visibleTab(id)) id = 'mine';
    activeTab = id;
    try { history.replaceState(null, '', location.pathname + location.search + '#' + id); } catch (e) { /* harmless */ }
    renderTabs();
    panel.innerHTML = '';
    Promise.resolve(renderPanel()).then(() => {
      if (opts.scrollToList && $('mine-requests')) $('mine-requests').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  ctx.showMine = (opts) => showTab('mine', opts);
  ctx.openDetail = (id, opts) => openDetail(ctx, id, opts);
  ctx.openForm = (opts) => openForm(ctx, opts);

  // ---- refresh: reload everything and redraw, without stealing focus from someone typing ----
  let inflight = null, again = null, pendingRender = false;
  const typing = () => panel.contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  ctx.refresh = (opts = {}) => {
    if (inflight) { again = opts; return inflight; }
    inflight = (async () => {
      try {
        await loadData();
        if (!visibleTab(activeTab)) activeTab = 'mine';
        renderWhoami();
        renderTabs();
        if (opts.quiet && typing()) pendingRender = true; else { pendingRender = false; await renderPanel(); }
      } catch (err) {
        ctx.toast(err.message || String(err), true);
      } finally { inflight = null; }
      if (again) { const next = again; again = null; return ctx.refresh(next); }
    })();
    return inflight;
  };
  panel.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !typing()) { pendingRender = false; renderPanel(); } }, 80));

  // ---- drawers: close buttons, backdrops and Escape ----
  $('lv-form-close').addEventListener('click', requestCloseForm);
  $('lv-form-backdrop').addEventListener('click', requestCloseForm);
  $('lv-detail-close').addEventListener('click', closeDetail);
  $('lv-detail-backdrop').addEventListener('click', closeDetail);
  $('lv-side-close').addEventListener('click', closeSide);
  $('lv-side-backdrop').addEventListener('click', closeSide);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('lv-side-drawer').classList.contains('open')) closeSide();
    else if ($('lv-form-drawer').classList.contains('open')) requestCloseForm();
    else if ($('lv-detail-drawer').classList.contains('open')) closeDetail();
  });
  document.addEventListener('lv-open-request', (e) => { if (e.detail && e.detail.id) openDetail(ctx, e.detail.id); });

  // ---- first load ----
  try {
    await loadData();
  } catch (err) {
    panel.innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>';
    return ctx;
  }
  renderWhoami();
  const wanted = String(hash || '').replace('#', '');
  // Approvers land on whatever is waiting for them; everyone else on their own dashboard.
  const landing = visibleTab(wanted) ? wanted : (ctx.flags.final && finalPending() ? 'final' : ctx.flags.hr && hrPending() ? 'hr' : 'mine');
  showTab(landing);

  const openId = new URLSearchParams(search || '').get('open');
  if (openId) {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* harmless */ }
    openDetail(ctx, openId);
  }

  // live: someone else's decision, a new credit, a new request -- debounced, quiet while typing
  let liveTimer = null;
  try {
    api.subscribe(['leave_requests', 'employee_leave_balances', 'leave_credit_transactions'], () => {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => ctx.refresh({ quiet: true }), 700);
    });
  } catch (e) { /* the page still works without live updates */ }
  return ctx;
}
