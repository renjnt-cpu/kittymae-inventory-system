// Payment Verification -- page controller. payment-verification.html is a one-line shell; everything the page does is wired here. The data layer is passed in
// (`api`), so the same code runs against the real Supabase functions in production and against a stand-in object in tests.
//
// One module-wide rule holds everywhere in this page: the screen only hides buttons a person could not use; who may see, verify, override, reject, move or change
// anything is decided -- and enforced -- by the database (the payment_verify.* keys in the Position Access Matrix, migrations 234-244).
import { esc, friendly, money, statusBadge, riskBadge, sourceLabel, fmtShortDateTime, fmtDateTime, ago, manilaToday, debounce, shopChip, orderRefHtml, pancakeStatusBadge, attachedWhere } from './pvFormat.js?v=20261026c';
import { drawersHtml, makeToast, closeDrawer, isDrawerOpen, closeLightbox, lightboxOpen } from './pvUi.js?v=20261026c';
import { hydrateImages } from './pvApi.js?v=20261026c';
import { renderDashboard } from './pvDashboard.js?v=20261026c';
import { renderList, LIST_TABS, newListState, blankListFilters } from './pvTable.js?v=20261026c';
import { renderAccounts } from './pvAccounts.js?v=20261026c';
import { renderReports, renderAudit } from './pvReports.js?v=20261026c';
import { openDetail, closeDetail } from './pvDetail.js?v=20261026c';
import { openProofForm } from './pvProofForm.js?v=20261026c';

const $ = (id) => document.getElementById(id);

export function createPvContext(api, employee) {
  const perms = new Set(employee.permissions || []);
  // the person's own list of keys decides: an Admin can be held to read-only (the Auditor) by a personal override. The role alone only decides when the list could not be loaded.
  const can = (k) => perms.size ? perms.has(k) : employee.role === 'Admin';
  const ctx = {
    api, employee, can, today: manilaToday(), branches: [], accounts: [], methods: [], counts: null, listIds: [],
    scope: { allBranches: can('payment_verify.view_all_branches'), ownBranch: can('payment_verify.view_own_branch'), proof: can('payment_verify.view_proof') },
    ui: { lists: {}, report: { kind: 'verified', from: '', to: '', branch: '' }, audit: { q: '', from: '', to: '', actor: '', type: '' }, dashBranch: '' },
    autoAdvance: true,
  };
  try { ctx.autoAdvance = localStorage.getItem('pv-auto-advance') !== '0'; } catch (e) { /* storage may be blocked; the default is fine */ }
  ctx.toast = makeToast();
  ctx.openDetail = (id, opts) => openDetail(ctx, id, opts);
  ctx.reloadList = null;
  ctx.afterChange = () => {};
  ctx.refreshCounts = async () => {};
  ctx.gotoList = () => {};
  return ctx;
}

export async function startPvPage({ root, api, employee, search, hash }) {
  root.innerHTML = '<div id="pv-whoami" class="lv-whoami pv-whoami"></div>' +
    '<form class="pv-searchbar" id="pv-refform" role="search" autocomplete="off"><div class="pv-search-field"><label for="pv-refq">Search payment reference</label>' +
      '<input id="pv-refq" type="search" placeholder="Paste or type the reference number from the receipt — see where it was used before" inputmode="text" spellcheck="false"></div>' +
      '<div class="pv-search-actions"><button type="submit" class="btn">Search</button><button type="button" class="btn secondary" id="pv-add" hidden>+ Add payment proof</button></div></form>' +
    '<div id="pv-refout"></div><div class="lv-tabs" id="pv-tabs" role="tablist" aria-label="Payment Verification sections"></div><div id="pv-panel" role="tabpanel"><p class="muted">Loading…</p></div>' + drawersHtml();
  const panel = $('pv-panel');
  const ctx = createPvContext(api, employee);
  const params = new URLSearchParams(search || '');

  if (!ctx.can('payment_verify.view')) {
    root.innerHTML = '<div class="center-screen"><div><h2>No access</h2><p class="muted">Payment Verification is for the people who check customer payments. Ask an Admin to give you access.</p></div></div>';
    return ctx;
  }

  // ---- reference data (every one of these is a convenience: the page still opens without it)
  const [branches, accounts, rules] = await Promise.all([
    api.listBranches().catch(() => []), api.accountsList().catch(() => null), api.methodRulesList().catch(() => null),
  ]);
  ctx.branches = branches || [];
  ctx.accounts = accounts && accounts.ok !== false ? (accounts.accounts || []).filter((a) => a.active) : [];
  ctx.methods = rules && rules.ok !== false ? (rules.rules || []).filter((r) => r.active) : [];
  try { ctx.counts = await api.dashboard(null); } catch (e) { ctx.counts = null; }
  if (ctx.counts && ctx.counts.ok === false) {
    root.innerHTML = '<div class="center-screen"><div><h2>No access</h2><p class="muted">' + esc(ctx.counts.message || 'You do not have access to payment verification.') + '</p></div></div>';
    return ctx;
  }

  const count = (k) => (ctx.counts && Number(ctx.counts[k])) || 0;
  const tabDefs = () => [
    { id: 'dashboard', label: 'Dashboard', render: renderDashboard },
    { id: 'pending', label: LIST_TABS.pending.label, badge: count('pending'), list: true },
    { id: 'duplicates', label: LIST_TABS.duplicates.label, badge: count('possible_duplicates'), list: true },
    { id: 'verified', label: LIST_TABS.verified.label, list: true },
    { id: 'unverified', label: LIST_TABS.unverified.label, list: true },
    { id: 'needs_review', label: LIST_TABS.needs_review.label, badge: count('needs_review'), list: true },
    { id: 'all', label: LIST_TABS.all.label, list: true },
    { id: 'accounts', label: 'Payment Accounts', render: renderAccounts },
    { id: 'reports', label: 'Reports', show: ctx.can('payment_verify.view_reports'), render: renderReports },
    { id: 'audit', label: 'Audit Log', show: ctx.can('payment_verify.view_reports'), render: renderAudit },
  ].filter((t) => t.show !== false);
  let activeTab = null;
  const visibleTab = (id) => tabDefs().find((t) => t.id === id);

  function renderWhoami() {
    const roleBits = [ctx.scope.allBranches ? 'all branches' : ctx.scope.ownBranch ? 'your branch' : 'payments you sent', ctx.scope.proof ? 'with proof pictures' : 'pictures hidden'];
    $('pv-whoami').innerHTML = '<span>Signed in as <b>' + esc(employee.full_name) + '</b> <span class="muted">· you can see ' + esc(roleBits.join(', ')) + '</span></span>' +
      (ctx.can('payment_verify.verify') || ctx.can('payment_verify.reject')
        ? '<span class="pv-whoami-right"><label class="pv-check pv-small" title="After you verify or reject a payment, open the next one waiting"><input type="checkbox" id="pv-adv"' + (ctx.autoAdvance ? ' checked' : '') + '> Open the next one after deciding</label></span>' : '');
    const adv = $('pv-adv');
    if (adv) adv.addEventListener('change', (e) => { ctx.autoAdvance = e.target.checked; try { localStorage.setItem('pv-auto-advance', e.target.checked ? '1' : '0'); } catch (err) { /* harmless */ } });
    $('pv-add').hidden = !ctx.can('payment_verify.submit');
  }
  function renderTabs() {
    $('pv-tabs').innerHTML = tabDefs().map((t) =>
      '<button type="button" class="lv-tab' + (t.id === activeTab ? ' lv-tab-active' : '') + '" role="tab" aria-selected="' + (t.id === activeTab) + '" data-tab="' + t.id + '">' + esc(t.label) +
      (t.badge ? ' <span class="lv-tab-badge">' + (t.badge > 999 ? '999+' : t.badge) + '</span>' : '') + '</button>').join('');
    $('pv-tabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  }
  async function renderPanel() {
    const tab = visibleTab(activeTab);
    if (!tab) return;
    try {
      if (tab.list) await renderList(ctx, panel, tab.id); else await tab.render(ctx, panel);
      hydrateImages(panel);
    } catch (err) {
      panel.innerHTML = '<div class="msg error">Could not show this section: ' + esc(err.message || String(err)) + '</div>';
      if (typeof console !== 'undefined') console.error(err);
    }
  }
  function showTab(id) {
    if (!visibleTab(id)) id = 'dashboard';
    activeTab = id;
    if (LIST_TABS[id] && !ctx.ui.lists[id]) ctx.ui.lists[id] = newListState(id);
    ctx.reloadList = null;
    try { history.replaceState(null, '', location.pathname + '#' + id); } catch (e) { /* harmless */ }
    renderTabs();
    panel.innerHTML = '';
    return renderPanel();
  }
  ctx.gotoList = (tab, patch) => {
    ctx.ui.lists[tab] = newListState(tab);
    Object.assign(ctx.ui.lists[tab].filters, blankListFilters(), patch || {});
    if (patch && (patch.no_reference || patch.drift || patch.pancake || patch.source)) ctx.ui.lists[tab].more = true;
    return showTab(tab);
  };
  ctx.refreshCounts = async () => {
    try {
      const c = await api.dashboard(null);
      if (c && c.ok !== false) {
        const before = count('pending');
        ctx.counts = c; renderTabs();
        return before;
      }
    } catch (e) { /* the badges are a convenience */ }
    return null;
  };
  ctx.afterChange = () => { ctx.refreshCounts(); if (ctx.reloadList) ctx.reloadList(); if (activeTab === 'dashboard') renderPanel(); };

  // ---- the prominent reference search
  const out = $('pv-refout');
  async function runSearch(q) {
    q = String(q || '').trim();
    if (!q) { out.innerHTML = ''; return; }
    out.innerHTML = '<div class="card pv-refresult"><p class="muted">Looking for “' + esc(q) + '” in every payment…</p></div>';
    try {
      const res = await api.searchReference(q, 50);
      if (!res || res.ok === false) { out.innerHTML = '<div class="msg error">' + esc((res && res.message) || 'The search did not work.') + '</div>'; return; }
      if (res.message && !res.payments.length) { out.innerHTML = '<div class="card pv-refresult"><div class="muted">' + esc(res.message) + '</div></div>'; return; }
      const pays = res.payments || [], other = res.other || [];
      const orders = new Set(pays.map((p) => (p.order_ref || p.pv_code) + '|' + (p.order_shop_id || ''))).size;
      out.innerHTML = '<div class="card pv-refresult ' + (orders > 1 ? 'pv-refresult-dup' : pays.length ? 'pv-refresult-found' : 'pv-refresult-none') + '">' +
        '<div class="pv-cardhead"><div><h3 class="pv-h3">Reference “' + esc(q) + '”</h3>' +
          '<div>' + (pays.length || other.length ? '<b>Found in ' + pays.length + ' payment' + (pays.length === 1 ? '' : 's') + (other.length ? ' and ' + other.length + ' POS / layaway payment' + (other.length === 1 ? '' : 's') : '') + '</b>' + (orders > 1 ? ' — <span class="pv-dup-note">used on ' + orders + ' different orders' + (new Set(pays.map((p) => p.shop_name).filter(Boolean)).size > 1 ? ' in both Pancake shops' : '') + '</span>' : '')
            : '<b>No payment uses this reference.</b> <span class="muted">It is not in Payment Verification, the POS or the layaway payments.</span>') + '</div></div>' +
          '<button type="button" class="btn small secondary" id="pv-ref-close">Close ✕</button></div>' +
        (pays.length ? '<div class="table-scroll table-2col"><table class="pv-table"><thead><tr><th>Proof</th><th>PV #</th><th>Pancake order / Customer</th><th>Amount</th><th>Method</th><th>Reference</th><th>Attached by</th><th>Status</th><th>Verified</th><th></th></tr></thead><tbody>' +
          pays.map((p) => '<tr><td data-label="Proof" class="pv-c-proof">' + (p.thumb ? '<button type="button" class="pv-thumbbtn" data-open="' + esc(p.id) + '">' + imgTagFor(p.thumb) + '</button>' : '<span class="pv-noimg">—</span>') + '</td>' +
            '<td data-label="PV #"><b>' + esc(p.pv_code) + '</b><div class="muted">' + esc(sourceLabel(p.source)) + '</div></td>' +
            '<td data-label="Pancake order / Customer" class="pv-c-cust">' + (p.order_ref ? '<div class="pv-ordline">' + shopChip(p.shop_name) + ' ' + orderRefHtml(p) + '</div>' : '') + esc(p.customer_name || '—') + '<div class="muted">' + esc(p.branch_name || '') + '</div>' +
              (p.order_status ? '<div class="pv-ordstat">' + pancakeStatusBadge(p.order_status) + '</div>' : '') + '</td>' +
            '<td data-label="Amount"><b>' + esc(money(p.amount)) + '</b></td><td data-label="Method">' + esc(p.method || '—') + '</td><td data-label="Reference"><span class="pv-ref">' + esc(p.reference || '—') + '</span></td>' +
            '<td data-label="Attached by"><b>' + esc(p.submitted_by || '—') + '</b><div class="muted">' + esc(fmtShortDateTime(p.submitted_at)) + ' · ' + attachedWhere(p.source) + '</div></td>' +
            '<td data-label="Status">' + statusBadge(p.status) + ' ' + riskBadge(p.risk) + '</td>' +
            '<td data-label="Verified">' + (p.verified_at ? '<b>' + esc(p.verified_by || '—') + '</b><div class="muted">' + esc(fmtShortDateTime(p.verified_at)) + '</div>' : '<span class="muted">—</span>') + '</td>' +
            '<td class="full-row"><button type="button" class="btn small secondary" data-open="' + esc(p.id) + '">Open</button></td></tr>').join('') + '</tbody></table></div>' : '') +
        (other.length ? '<h4 class="pv-h4">Also recorded in the POS / layaway payments</h4><div class="table-scroll table-2col"><table class="pv-table"><thead><tr><th>Where</th><th>Order</th><th>Customer</th><th>Amount</th><th>Method</th><th>Reference</th><th>Date</th></tr></thead><tbody>' +
          other.map((o) => '<tr><td data-label="Where">' + esc(sourceLabel(o.kind)) + '</td><td data-label="Order">' + (o.order_ref ? '#' + esc(o.order_ref) : '—') + '</td><td data-label="Customer">' + esc(o.customer_name || '—') + '<div class="muted">' + esc(o.branch_name || '') + '</div></td>' +
            '<td data-label="Amount">' + esc(money(o.amount)) + '</td><td data-label="Method">' + esc(o.method || '—') + '</td><td data-label="Reference"><span class="pv-ref">' + esc(o.reference || '') + '</span></td><td data-label="Date">' + esc(fmtShortDateTime(o.at)) + '</td></tr>').join('') + '</tbody></table></div>' : '') + '</div>';
      hydrateImages(out);
      $('pv-ref-close').addEventListener('click', () => { out.innerHTML = ''; $('pv-refq').value = ''; });
      out.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(ctx, b.dataset.open, { rows: pays.map((p) => ({ id: p.id, status: p.status })) })));
    } catch (err) { out.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; }
  }
  const imgTagFor = (t) => (t.url ? '<img class="pv-thumb" data-pv-url="' + esc(t.url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<img class="pv-thumb" data-pv-path="' + esc(t.thumb || t.path) + '" alt="" loading="lazy">');
  $('pv-refform').addEventListener('submit', (e) => { e.preventDefault(); runSearch($('pv-refq').value); });

  // ---- add a payment proof
  $('pv-add').addEventListener('click', () => openProofForm({
    api, source: 'MANUAL_ENTRY', askSource: true, title: 'Add payment proof', onSaved: () => ctx.afterChange(),
    onOpenPayment: (id) => openDetail(ctx, id, { rows: [] }),
  }));

  // ---- the drawers: close buttons, backdrops, Escape
  $('pv-detail-close').addEventListener('click', closeDetail); $('pv-detail-backdrop').addEventListener('click', closeDetail);
  $('pv-side-close').addEventListener('click', () => closeDrawer('side')); $('pv-side-backdrop').addEventListener('click', () => closeDrawer('side'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || lightboxOpen() || document.querySelector('.pv-modal-wrap')) return;
    if (isDrawerOpen('side')) closeDrawer('side'); else if (isDrawerOpen('detail')) closeDetail();
  });

  // ---- first draw
  renderWhoami();
  const wanted = String(hash || '').replace('#', '');
  await showTab(visibleTab(wanted) ? wanted : 'dashboard');
  if (params.get('ref')) { $('pv-refq').value = params.get('ref'); runSearch(params.get('ref')); }
  if (params.get('open')) { openDetail(ctx, params.get('open'), { rows: [] }); try { history.replaceState(null, '', location.pathname + '#' + activeTab); } catch (e) { /* harmless */ } }

  // bring in the newest proofs from Online Orders in the background (the database throttles repeats), then refresh the badges
  api.syncNow().then(() => ctx.refreshCounts()).catch(() => { /* the scheduled job does this anyway */ });

  // every minute (while the page is visible): refresh the badges, and say so when new proofs arrived
  let lastPending = count('pending');
  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    const before = lastPending;
    await ctx.refreshCounts();
    const now = count('pending');
    if (now > before) { ctx.toast((now - before) + ' new payment proof' + (now - before === 1 ? '' : 's') + ' arrived.'); if (activeTab === 'pending' && ctx.reloadList && !panel.contains(document.activeElement)) ctx.reloadList(); }
    lastPending = now;
  }, 60000);
  return ctx;
}
