// Item Monitoring -- page controller. item-monitoring.html is a short shell; everything the page does is wired here. The data layer is passed in (`api`), so the same code runs against the real
// Supabase functions in production and against a stand-in object in tests.
//
// One rule holds everywhere: the screen only hides buttons a person could not use. Who may record a purchase, who may count which branch, and above all who may APPROVE a purchase or a reversal
// is decided -- and enforced -- by the database (migrations 264-269); a purchase never becomes stock until the Final Approver approves it.
import { esc, num, friendly, ago, fmtDateTime } from './imFormat.js?v=20261030b';
import { decorateStock, whoAmI } from './imData.js?v=20261030b';
import { shellHtml, makeToast, wireDrawerClose, closeDrawer, isDrawerOpen, modalOpen, closeModal } from './imUi.js?v=20261030b';
import { renderOverview } from './imOverview.js?v=20261030b';
import { renderForm } from './imForm.js?v=20261030b';
import { renderApprovals } from './imApprovals.js?v=20261030b';
import { renderStock } from './imStock.js?v=20261030b';
import { renderTrace } from './imTrace.js?v=20261030b';
import { renderCounts } from './imCounts.js?v=20261030b';
import { renderHistory } from './imHistory.js?v=20261030b';
import { renderChanges } from './imChanges.js?v=20261030b';
import { openRequestReview, openDeleteReview } from './imReview.js?v=20261030b';

const $ = (id) => document.getElementById(id);
const newForm = () => ({ clientId: '', requestId: null, requestNumber: '', status: '', returnedReason: '', pendingFiles: [], serverFiles: [], saved: null, done: null });

/** Every tab: how it is drawn and who sees it. */
const TABS = [
  { id: 'overview', label: 'Overview', render: renderOverview },
  { id: 'purchase', label: 'Factory Purchase', render: renderForm, show: (c) => c.who.canRecord },
  { id: 'approvals', label: 'Approvals', render: renderApprovals, show: (c) => c.who.canRecord || c.who.canSeeAll, badge: (c) => Number((c.data.overview || {}).pending_requests || 0) + Number((c.data.overview || {}).pending_deletes || 0) },
  { id: 'stock', label: 'Stock by Branch', render: renderStock },
  { id: 'trace', label: 'Trace Product', render: renderTrace },
  { id: 'counts', label: 'Physical Counts', render: renderCounts },
  { id: 'history', label: 'Purchase History', render: renderHistory },
  { id: 'changes', label: 'Product Changes', render: renderChanges },
];

export async function startImPage({ root, api, employee, search, hash }) {
  root.innerHTML = '<div class="im-top" id="im-top"></div><div class="lv-tabs im-tabs" id="im-tabs" role="tablist" aria-label="Item Monitoring sections"></div><div id="im-notice"></div>' +
    '<div id="im-panel" role="tabpanel"><p class="muted">Loading…</p></div>' + shellHtml();
  wireDrawerClose();
  const panel = $('im-panel');

  const ctx = {
    api, employee, root, branches: [], branchById: {}, who: whoAmI(employee, null), errors: [],
    data: { stock: [], counts: [], latest: {}, changes: [], purchases: [], requests: [], deletes: [], meta: { posted: new Map(), deletes: new Map() }, overview: {}, notes: { unread: 0, items: [] } },
    ui: {
      tab: 'overview',
      stock: { search: '', branch: 'all', status: 'all', sort: { field: 'sku', dir: 'desc' }, shown: 100 },
      trace: { search: '', cat: 'all', from: '', to: '' },
      history: { search: '', branch: '', cat: 'all', sub: '', app: '', status: '', from: '', to: '', all: false },
      approvals: { sub: 'purchases', f: { search: '', branch: '', by: '', status: '', from: '', to: '', min: '', max: '', newOnly: false, sort: 'newest' } },
      counts: { view: 'recent', sku: '', formBranch: '', branch: '', varianceOnly: false, inv: '', dueSearch: '', dueShown: 100 },
      changes: { search: '', action: '' },
      form: newForm(), formLeave: null, lastRegister: [],
    },
  };
  ctx.toast = makeToast();
  ctx.openMovement = (sku, branchId) => api.openMovement(sku, branchId);
  ctx.openRequest = (id, opts) => openRequestReview(ctx, id, opts);
  ctx.openDelete = (id, opts) => openDeleteReview(ctx, id, opts);
  let histCache = { src: null, map: null };
  ctx.histBySku = () => {
    if (histCache.src !== ctx.data.purchases) {
      const m = new Map();
      ctx.data.purchases.forEach((p) => { const h = m.get(p.sku) || { n: 0, max: 0 }; h.n += 1; h.max = Math.max(h.max, Number(p.qty) || 0); m.set(p.sku, h); });
      histCache = { src: ctx.data.purchases, map: m };
    }
    return histCache.map;
  };

  // ---------------------------------------------------------------- loading (each part on its own, so one failing part never blanks the page)
  const fail = (what, err) => { ctx.errors = ctx.errors.filter((e) => e.what !== what); ctx.errors.push({ what, text: friendly(err) }); };
  const ok = (what) => { ctx.errors = ctx.errors.filter((e) => e.what !== what); };
  async function loadPart(kind) {
    try {
      if (kind === 'stock') {
        const [rows, latest] = await Promise.all([api.listStock(), api.latestCounts()]);
        ctx.data.latest = latest; ctx.data.stock = decorateStock(rows, latest, ctx.branchById);
      } else if (kind === 'counts') {
        const [counts, latest] = await Promise.all([api.recentCounts(300), api.latestCounts()]);
        ctx.data.counts = counts; ctx.data.latest = latest; decorateStock(ctx.data.stock, latest, ctx.branchById);
      } else if (kind === 'purchases') {
        ctx.data.purchases = await api.listPurchases();
      } else if (kind === 'changes') {
        ctx.data.changes = await api.productChanges(300);
      } else if (kind === 'approvals') {
        const [ov, reqs, dels, meta, notes] = await Promise.all([api.overview(), api.requestsList(), api.deleteList(), api.historyMeta(), api.notifications()]);
        ctx.data.overview = ov || {}; ctx.data.requests = reqs || []; ctx.data.deletes = dels || [];
        ctx.data.meta = { posted: new Map((meta.posted || []).map((m) => [m.purchase_id, m])), deletes: new Map((meta.deletes || []).map((d) => [d.purchase_id, d])) };
        ctx.data.notes = notes || { unread: 0, items: [] };
        ctx.who = whoAmI(employee, ctx.data.overview);
      }
      ok(kind);
    } catch (err) { fail(kind, err); }
  }
  ctx.reload = async (kind) => {
    const parts = kind === 'all' ? ['stock', 'counts', 'purchases', 'changes', 'approvals'] : Array.isArray(kind) ? kind : [kind];
    await Promise.all([...new Set(parts)].map(loadPart));
    renderTop(); renderTabs(); renderNotice();
    if (ctx.ui.tab !== 'purchase') rerender();
  };
  ctx.afterReview = () => { renderTop(); renderTabs(); if (ctx.ui.tab !== 'purchase') rerender(); };

  // ---------------------------------------------------------------- the header: quick search, quick buttons, summary, notices
  function renderTop() {
    const keepQ = $('im-q') ? $('im-q').value : '';
    const o = ctx.data.overview || {};
    const low = ctx.data.stock.filter((r) => r._low).length, due = ctx.data.stock.filter((r) => r._overdue).length;
    const pend = Number(o.pending_requests || 0);
    const unread = Number((ctx.data.notes || {}).unread || 0);
    $('im-top').innerHTML = '<div class="im-top-row"><form class="im-qsearch" id="im-qform" role="search"><input type="search" id="im-q" placeholder="Search SKU or product name…" aria-label="Search SKU or product name" autocomplete="off"><button type="submit" class="btn">Search</button></form>' +
      '<div class="im-bellwrap"><button type="button" class="btn secondary" id="im-bell" aria-expanded="false">Notifications' + (unread ? ' <span class="lv-tab-badge">' + unread + '</span>' : '') + '</button><div class="im-bellpanel" id="im-bellpanel" hidden></div></div></div>' +
      '<div class="im-quick"><button type="button" class="im-chip" data-q="stock">Stock by Branch</button><button type="button" class="im-chip" data-q="low">Low stock <span class="im-chip-n">' + num(low) + '</span></button>' +
      '<button type="button" class="im-chip" data-q="due">Count overdue <span class="im-chip-n">' + num(due) + '</span></button>' +
      (ctx.who.canRecord || ctx.who.canSeeAll ? '<button type="button" class="im-chip' + (pend ? ' im-chip-attn' : '') + '" data-q="pending">Pending approvals <span class="im-chip-n">' + num(pend) + '</span></button>' : '') + '</div>' +
      '<div class="im-summary">' + [['Monitored', num(ctx.data.stock.length), 'stock:all'], ['Low stock', num(low), 'stock:low'], ['Counts overdue', num(due), 'stock:overdue']].concat(ctx.who.canRecord || ctx.who.canSeeAll ? [['Pending approvals', num(pend), 'approvals:purchases'], ['Delete requests', num(o.pending_deletes || 0), 'approvals:reversals']] : [])
        .map(([l, v, g]) => '<button type="button" class="im-sum" data-go="' + g + '"><span>' + l + '</span><b>' + v + '</b></button>').join('') + '</div>';
    $('im-q').value = keepQ;
    $('im-qform').addEventListener('submit', (e) => { e.preventDefault(); const q = $('im-q').value.trim(); if (!q) { $('im-q').focus(); return; } ctx.showTab('stock', { search: q, status: 'all', branch: 'all' }); });
    $('im-top').querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.q;
      if (k === 'stock') ctx.showTab('stock', { status: 'all' }); else if (k === 'low') ctx.showTab('stock', { status: 'low' }); else if (k === 'due') ctx.showTab('stock', { status: 'overdue' }); else ctx.showTab('approvals', { sub: 'purchases' });
    }));
    $('im-top').querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { const [t, a] = b.dataset.go.split(':'); if (t === 'stock') ctx.showTab('stock', { status: a, search: '', branch: 'all' }); else ctx.showTab('approvals', { sub: a }); }));
    $('im-bell').addEventListener('click', toggleBell);
  }

  function toggleBell() {
    const p = $('im-bellpanel');
    if (!p.hidden) { p.hidden = true; $('im-bell').setAttribute('aria-expanded', 'false'); return; }
    const items = (ctx.data.notes || {}).items || [];
    p.innerHTML = '<div class="im-bell-head"><b>Notifications</b>' + (Number(ctx.data.notes.unread) ? '<button type="button" class="im-link" id="im-bell-read">Mark all read</button>' : '') + '</div>' +
      (items.length ? items.map((n) => '<button type="button" class="im-note' + (n.read_at ? '' : ' im-note-new') + '" data-nid="' + n.id + '" data-req="' + (n.request_id || '') + '" data-del="' + (n.delete_request_id || '') + '"><b>' + esc(n.title) + '</b><span>' + esc(n.body || '') + '</span><small class="muted">' + ago(n.created_at) + ' · ' + fmtDateTime(n.created_at) + '</small></button>').join('') : '<p class="muted" style="padding:8px 10px;">No notifications yet.</p>');
    p.hidden = false; $('im-bell').setAttribute('aria-expanded', 'true');
    const rd = $('im-bell-read');
    if (rd) rd.addEventListener('click', async () => { try { await api.notificationsRead(null); await loadPart('approvals'); renderTop(); } catch (err) { ctx.toast(err, true); } });
    p.querySelectorAll('[data-nid]').forEach((b) => b.addEventListener('click', async () => {
      p.hidden = true;
      try { await api.notificationsRead([Number(b.dataset.nid)]); } catch (e) { /* a notice that cannot be marked read must not stop it opening */ }
      if (b.dataset.req) ctx.openRequest(Number(b.dataset.req)); else if (b.dataset.del) ctx.openDelete(Number(b.dataset.del));
      loadPart('approvals').then(renderTop);
    }));
  }
  document.addEventListener('click', (e) => { const p = $('im-bellpanel'); if (p && !p.hidden && !e.target.closest('.im-bellwrap')) { p.hidden = true; const b = $('im-bell'); if (b) b.setAttribute('aria-expanded', 'false'); } });

  function renderNotice() {
    $('im-notice').innerHTML = ctx.errors.length ? '<div class="msg error">Some information could not be loaded: ' + ctx.errors.map((e) => esc(e.what) + ' — ' + esc(e.text)).join('; ') + '</div>' : '';
  }

  // ---------------------------------------------------------------- tabs
  const visibleTabs = () => TABS.filter((t) => !t.show || t.show(ctx));
  function renderTabs() {
    if (!visibleTabs().some((t) => t.id === ctx.ui.tab)) ctx.ui.tab = 'overview';
    $('im-tabs').innerHTML = visibleTabs().map((t) => {
      const b = t.badge ? t.badge(ctx) : 0;
      return '<button type="button" class="lv-tab' + (ctx.ui.tab === t.id ? ' lv-tab-active' : '') + '" role="tab" aria-selected="' + (ctx.ui.tab === t.id) + '" data-tab="' + t.id + '">' + esc(t.label) + (b ? ' <span class="lv-tab-badge">' + b + '</span>' : '') + '</button>';
    }).join('');
    $('im-tabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => ctx.showTab(b.dataset.tab)));
  }
  function rerender(opts) {
    const t = TABS.find((x) => x.id === ctx.ui.tab) || TABS[0];
    t.render(ctx, panel, opts);
  }
  ctx.showTab = (id, opts) => {
    if (!visibleTabs().some((t) => t.id === id)) id = 'overview';
    if (ctx.ui.tab === 'purchase' && id !== 'purchase' && ctx.ui.formLeave) ctx.ui.formLeave();
    closeDrawer(); if (modalOpen()) closeModal();
    ctx.ui.tab = id;
    try { history.replaceState(null, '', location.pathname + location.search + '#' + id); } catch (e) { /* the address bar is a convenience */ }
    renderTabs();
    rerender(opts);
    const main = document.querySelector('main'); if (main) main.scrollTop = 0;
  };

  // Escape closes the drawer; the shell's own handlers close dialogs
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isDrawerOpen() && !modalOpen()) closeDrawer(); });

  // ---------------------------------------------------------------- start: the branches first (everything shows branch names), then everything else
  try {
    const branches = await api.getBranches();
    ctx.branches = branches; ctx.branchById = Object.fromEntries(branches.map((b) => [String(b.id), b.name]).concat(branches.map((b) => [b.id, b.name])));
  } catch (err) { fail('branches', err); }
  await Promise.all(['stock', 'counts', 'purchases', 'changes', 'approvals'].map(loadPart));
  ctx.who = whoAmI(employee, ctx.data.overview);
  renderTop(); renderTabs(); renderNotice();

  const params = new URLSearchParams(search || '');
  const h = String(hash || '').replace('#', '');
  const q = params.get('q');
  if (q) ctx.showTab('stock', { search: q, status: 'all', branch: 'all' });          // the "Open in Item Monitoring" link on the Transfers SKU trace
  else if (visibleTabs().some((t) => t.id === h)) ctx.showTab(h);
  else ctx.showTab('overview');

  // ---------------------------------------------------------------- live updates (one reload for a burst of changes)
  const pending = new Set(); let timer = null;
  const KIND = { inventory: ['stock'], cycle_counts: ['counts', 'stock'], product_change_log: ['changes'], factory_purchases: ['purchases'], fpr_pings: ['approvals', 'purchases'] };
  if (api.subscribe) {
    api.subscribe((table) => {
      (KIND[table] || []).forEach((k) => pending.add(k));
      clearTimeout(timer);
      timer = setTimeout(async () => { const parts = [...pending]; pending.clear(); if (parts.includes('stock') && parts.includes('counts')) parts.splice(parts.indexOf('stock'), 1); await ctx.reload(parts); }, 900);
    });
  }
  return ctx;
}
