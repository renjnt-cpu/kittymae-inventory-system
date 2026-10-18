// Payment Verification page -- the six list tabs (Pending Verification, Possible Duplicates, Verified, Unverified / Rejected, Needs Review, All Payment Proofs).
// They share one component: the tab only decides which payments the database returns (pv_list's `tab`); the filters, the sort, the paging and the row look are the same.
// The table collapses to one card per payment on a phone (the app-wide .table-scroll rule).
import { esc, money, fmtShortDateTime, fmtDate, manilaToday, statusBadge, riskBadge, sourceLabel, STATUS, SOURCES, debounce, friendly, imgTag,
  SHOPS, shopChip, orderRefHtml, pancakeStatusBadge, pancakeStatusLabel, PANCAKE_STATUS_ORDER, attachedWhere } from './pvFormat.js?v=20261018b';
import { hydrateImages } from './pvApi.js?v=20261018b';
import { openLightbox, emptyBox } from './pvUi.js?v=20261018b';

export const LIST_TABS = {
  pending: { label: 'Pending Verification', sort: 'risk', hint: 'Payment proofs waiting for a person to check them — the ones waiting longest first.' },
  duplicates: { label: 'Possible Duplicates', sort: 'risk', hint: 'The reference number or the picture is already used by another payment. A person must decide; a supervisor can override.' },
  verified: { label: 'Verified', sort: 'newest', hint: 'Payments a person checked and credited to their order.' },
  unverified: { label: 'Unverified / Rejected', sort: 'newest', hint: 'Payments that were rejected, confirmed as duplicates, or had their verification taken back.' },
  needs_review: { label: 'Needs Review', sort: 'oldest', hint: 'Payments someone asked a supervisor to look at again.' },
  all: { label: 'All Payment Proofs', sort: 'newest', hint: 'Every payment proof the system holds, from every source.' },
};
const SORTS = [['risk', 'Riskiest first'], ['newest', 'Newest first'], ['oldest', 'Oldest first'], ['amount', 'Highest amount'], ['branch', 'Branch']];
export const newListState = (key) => ({ filters: blankFilters(), sort: (LIST_TABS[key] || {}).sort || 'newest', page: 1, pageSize: 50, rows: [], total: 0, more: false, seq: 0, loaded: false });
const blankFilters = () => ({ q: '', date_from: '', date_to: '', branch_id: '', shop_id: '', source: '', method: '', account_id: '', status: '', customer: '', order_ref: '', reference: '', verified_by: '', attached_by: '', pancake_status: '', amount_min: '', amount_max: '', dup_only: false, risk: '', pancake: '', no_reference: false, drift: false });
export const blankListFilters = blankFilters;

const cleanFilters = (f, tab) => {
  const out = { tab };
  for (const [k, v] of Object.entries(f)) if (v !== '' && v !== false && v !== null && v !== undefined) out[k] = v;
  return out;
};

const FILTER_LABELS = { q: 'Search', date_from: 'From', date_to: 'To', branch_id: 'Branch', shop_id: 'Shop', source: 'Source', method: 'Method', account_id: 'Account', status: 'Status', customer: 'Customer',
  order_ref: 'Order #', reference: 'Reference', verified_by: 'Verified by', attached_by: 'Attached by', pancake_status: 'Order status in Pancake', amount_min: 'Min amount', amount_max: 'Max amount', dup_only: 'Duplicates only', risk: 'Risk at least', pancake: 'Verified in Pancake',
  no_reference: 'No reference number', drift: 'Changed in Pancake' };

function chips(ctx, f) {
  const nice = (k, v) => k === 'branch_id' ? ((ctx.branches.find((b) => String(b.id) === String(v)) || {}).name || v) : k === 'shop_id' ? ((SHOPS.find((s) => String(s[0]) === String(v)) || [])[1] || v) : k === 'pancake_status' ? pancakeStatusLabel(v)
    : k === 'source' ? sourceLabel(v) : k === 'status' ? STATUS[v] ? STATUS[v].label : v
    : k === 'account_id' ? ((ctx.accounts.find((a) => String(a.id) === String(v)) || {}).name || v) : (k === 'dup_only' || k === 'no_reference' || k === 'drift') ? 'yes' : k === 'pancake' ? (v === 'yes' ? 'yes' : 'no')
      : k === 'risk' ? String(v).replace('_', ' ').toLowerCase() : (k === 'amount_min' || k === 'amount_max') ? money(v) : (k === 'date_from' || k === 'date_to') ? fmtDate(v) : v;
  const on = Object.entries(f).filter(([, v]) => v !== '' && v !== false);
  if (!on.length) return '';
  return '<div class="active-filters" role="status"><span class="active-filters-label">Active filters:</span>' +
    on.map(([k, v]) => '<span class="filter-chip">' + esc(FILTER_LABELS[k] || k) + ': <b>' + esc(nice(k, v)) + '</b></span>').join('') +
    ' <button type="button" class="act-link" id="pv-clear-filters">Clear all</button></div>';
}

function filterBar(ctx, s) {
  const f = s.filters, sel = (id, label, opts, cur) => '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '"><option value="">All</option>' +
    opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>';
  const inp = (id, label, type, val, ph, extra) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + type + '" value="' + esc(val) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (extra || '') + '></div>';
  const t = manilaToday();
  const daysAgo = (n) => { const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const showBranch = ctx.branches.length > 1 && ctx.scope.allBranches;
  return '<div class="card pv-toolbar' + (s.more ? ' pv-open' : '') + '"><div class="pv-toolrow">' +
    '<div class="field pv-grow"><label for="pv-q">Search</label><input id="pv-q" type="search" placeholder="Customer, order #, reference, PV number or phone…" value="' + esc(f.q) + '"></div>' +
    '<div class="pv-primary-extra">' + inp('pv-from', 'From', 'date', f.date_from) + inp('pv-to', 'To', 'date', f.date_to) +
    '<div class="field"><label>&nbsp;</label><div class="pv-btnrow"><button type="button" class="btn small secondary" data-range="today">Today</button><button type="button" class="btn small secondary" data-range="7">7 days</button>' +
    '<button type="button" class="btn small secondary" data-range="30">30 days</button></div></div>' +
    (showBranch ? sel('pv-branch', 'Branch', ctx.branches.map((b) => [b.id, b.name]), f.branch_id) : '') +
    sel('pv-shop', 'Shop', SHOPS, f.shop_id) +
    sel('pv-source', 'Source', Object.entries(SOURCE_OPTIONS), f.source) +
    '<div class="field"><label for="pv-sort">Sort by</label><select id="pv-sort">' + SORTS.map(([v, l]) => '<option value="' + v + '"' + (s.sort === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div></div>' +
    '<div class="field"><label>&nbsp;</label><div class="pv-btnrow"><button type="button" class="btn small secondary" id="pv-more-btn" aria-expanded="' + s.more + '">' + (s.more ? 'Fewer filters' : 'More filters') + '</button>' +
    '<button type="button" class="btn small secondary" id="pv-reload">↻ Refresh</button></div></div></div>' +
    (s.more ? '<div class="pv-toolrow pv-morerow">' +
      sel('pv-method', 'Payment method', ctx.methods.map((m) => [m.method, m.method]), f.method) +
      sel('pv-account', 'Account', ctx.accounts.map((a) => [a.id, a.name]), f.account_id) +
      sel('pv-status', 'Status', Object.entries(STATUS).filter(([k]) => !['NO_PROOF', 'OVERPAID'].includes(k)).map(([k, v]) => [k, v.label]), f.status) +
      inp('pv-customer', 'Customer name', 'text', f.customer) + inp('pv-order', 'Order #', 'text', f.order_ref) + inp('pv-reference', 'Reference number', 'text', f.reference) +
      inp('pv-attby', 'Reference attached by', 'text', f.attached_by, 'Name') + sel('pv-pstatus', 'Order status in Pancake', PANCAKE_STATUS_ORDER.map((k) => [k, pancakeStatusLabel(k)]), f.pancake_status) +
      inp('pv-verifier', 'Verified by', 'text', f.verified_by) + inp('pv-amin', 'Amount from (₱)', 'number', f.amount_min, '', ' min="0" step="0.01"') + inp('pv-amax', 'Amount to (₱)', 'number', f.amount_max, '', ' min="0" step="0.01"') +
      sel('pv-risk', 'Duplicate risk at least', [['LOW', 'Low'], ['MEDIUM', 'Medium'], ['HIGH', 'High'], ['VERY_HIGH', 'Very high']], f.risk) +
      sel('pv-pancake', 'Verified in Pancake', [['yes', 'Yes'], ['no', 'No']], f.pancake) +
      '<div class="field pv-checks"><label class="pv-check"><input type="checkbox" id="pv-dup"' + (f.dup_only ? ' checked' : '') + '> Duplicates only</label>' +
      '<label class="pv-check"><input type="checkbox" id="pv-noref"' + (f.no_reference ? ' checked' : '') + '> No reference number</label>' +
      '<label class="pv-check"><input type="checkbox" id="pv-drift"' + (f.drift ? ' checked' : '') + '> Changed in Pancake</label></div>' +
    '</div>' : '') + '</div>';
}
const SOURCE_OPTIONS = { ONLINE_ORDER: SOURCES.ONLINE_ORDER, PANCAKE: SOURCES.PANCAKE, MANUAL_ENTRY: SOURCES.MANUAL_ENTRY, OTHER: SOURCES.OTHER };

// ---------------------------------------------------------------- one row
const td = (label, html, cls) => '<td' + (label ? ' data-label="' + label + '"' : '') + (cls ? ' class="' + cls + '"' : '') + '>' + html + '</td>';

export function referenceHtml(r) {
  if (!r.reference) return '<span class="pv-miss">no reference</span>';
  return '<span class="pv-ref">' + esc(r.reference) + '</span>' + (r.ref_usable === false ? '<div class="pv-miss">too short to rely on</div>' : '');
}
export function proofCell(r, ctx) {
  const t = r.thumb;
  if (!t) return ctx.scope.proof ? '<span class="pv-noimg">No picture</span>' : '<span class="muted">hidden</span>';
  return '<button type="button" class="pv-thumbbtn" data-zoom="' + esc(r.id) + '" aria-label="Open the picture of ' + esc(r.pv_code) + '">' + imgTag(t, { cls: 'pv-thumb' }) + (r.images > 1 ? '<span class="pv-thumbcount">' + r.images + '</span>' : '') + '</button>';
}
export function statusCell(r) {
  let h = statusBadge(r.status) + ' ' + riskBadge(r.risk);
  if (r.pancake_verified && r.status !== 'VERIFIED') h += ' <span class="badge pv-badge pv-tag-pancake" title="Verified inside Pancake POS by ' + esc(r.pancake_verified_by || 'staff') + '">✓ Pancake</span>';
  if (r.override_applied) h += ' <span class="badge pv-badge pv-st-over" title="Verified with a supervisor override">Override</span>';
  if (r.drift) h += ' <span class="badge pv-badge pv-st-dup" title="Pancake changed this payment after it was verified here">Changed in Pancake</span>';
  return h;
}
function verifiedCell(r) {
  if (!['VERIFIED', 'PARTIALLY_VERIFIED'].includes(r.status)) return '<span class="muted">—</span>';
  return '<b>' + esc(r.verified_by || '—') + '</b><div class="muted">' + esc(fmtShortDateTime(r.verified_at)) + (r.verified_via ? ' · ' + (r.verified_via === 'PANCAKE' ? 'in Pancake' : 'in the ERP') : '') + '</div>';
}
/** who attached the reference, when, and where (a Pancake admin inside Pancake for the Online Orders proofs, ERP staff otherwise) */
export function attachedCell(r) {
  return '<b>' + esc(r.submitted_by || '—') + '</b><div class="muted">' + esc(fmtShortDateTime(r.submitted_at)) + ' · ' + attachedWhere(r.source) + '</div>';
}
/** the Pancake order: its shop, its number (opens the order in Pancake), its status there, and the customer */
export function pancakeOrderCell(r) {
  return (r.order_ref ? '<div class="pv-ordline">' + shopChip(r.shop_name) + ' ' + orderRefHtml(r) + '</div>' : '<span class="muted">no order</span> ') + esc(r.customer_name || '—') +
    (r.customer_phone ? '<div class="muted">' + esc(r.customer_phone) + '</div>' : '') + (r.order_status ? '<div class="pv-ordstat">' + pancakeStatusBadge(r.order_status) + '</div>' : '');
}
function rowHtml(r, ctx) {
  const part = r.status === 'PARTIALLY_VERIFIED' || (r.verified_amount != null && Number(r.verified_amount) !== Number(r.amount));
  return '<tr data-id="' + esc(r.id) + '" class="pv-row pv-row-' + esc(String(r.status).toLowerCase()) + (r.risk === 'VERY_HIGH' || r.risk === 'HIGH' ? ' pv-row-risky' : '') + '">' +
    td('Proof', proofCell(r, ctx), 'pv-c-proof') +
    td('PV #', '<button type="button" class="bl-link" data-open="' + esc(r.id) + '">' + esc(r.pv_code) + '</button><div class="muted">' + esc(sourceLabel(r.source)) + (r.historical ? ' · imported' : '') + '</div>') +
    td('Attached by', attachedCell(r)) +
    td('Pancake order / Customer', pancakeOrderCell(r), 'pv-c-cust') +
    td('Branch', esc(r.branch_name || '—')) +
    td('Amount', '<b>' + esc(money(r.amount)) + '</b>' + (part && r.verified_amount != null ? '<div class="muted">verified ' + esc(money(r.verified_amount)) + '</div>' : (r.expected_amount != null && Number(r.expected_amount) !== Number(r.amount) ? '<div class="muted">order needs ' + esc(money(r.expected_amount)) + '</div>' : ''))) +
    td('Method / Account', esc(r.method || '—') + (r.account_name ? '<div class="muted">' + esc(r.account_name) + (r.account_masked ? ' ' + esc(r.account_masked) : '') + '</div>' : '')) +
    td('Reference', referenceHtml(r)) +
    td('Status', statusCell(r), 'pv-c-status') +
    td('Verified', verifiedCell(r)) +
    td('', '<div class="pv-rowact"><button type="button" class="btn small' + (['PENDING', 'POSSIBLE_DUPLICATE', 'NEEDS_REVIEW', 'MISSING_INFORMATION'].includes(r.status) ? '' : ' secondary') + '" data-open="' + esc(r.id) + '">' +
      (['PENDING', 'POSSIBLE_DUPLICATE', 'NEEDS_REVIEW', 'MISSING_INFORMATION'].includes(r.status) ? 'Review' : 'View') + '</button></div>', 'full-row') + '</tr>';
}
export const tableHtml = (rows, ctx) => '<div class="table-scroll table-2col pv-tablewrap"><table class="pv-table"><thead><tr><th>Proof</th><th>PV #</th><th>Attached by</th><th>Pancake order / Customer</th><th>Branch</th><th>Amount</th>' +
  '<th>Method / Account</th><th>Reference</th><th>Status</th><th>Verified</th><th></th></tr></thead><tbody>' + rows.map((r) => rowHtml(r, ctx)).join('') + '</tbody></table></div>';

// ---------------------------------------------------------------- the tab
export async function renderList(ctx, panel, key) {
  const def = LIST_TABS[key], s = ctx.ui.lists[key] || (ctx.ui.lists[key] = newListState(key));
  panel.innerHTML = '<p class="pv-tabhint muted">' + esc(def.hint) + '</p><div id="pv-filterhost"></div><div id="pv-chips"></div><div id="pv-listbody"><p class="muted">Loading…</p></div>';
  const host = panel.querySelector('#pv-filterhost');
  const paint = () => { host.innerHTML = filterBar(ctx, s); panel.querySelector('#pv-chips').innerHTML = chips(ctx, s.filters); wire(); };

  async function load(resetPage) {
    if (resetPage) s.page = 1;
    const seq = ++s.seq;
    const body = panel.querySelector('#pv-listbody');
    if (!body) return;
    body.classList.add('pv-loading');
    let res;
    try { res = await ctx.api.list(cleanFilters(s.filters, key), s.pageSize, (s.page - 1) * s.pageSize, s.sort); }
    catch (err) { if (seq === s.seq) body.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
    if (seq !== s.seq || !panel.contains(body)) return;
    body.classList.remove('pv-loading');
    if (!res || res.ok === false) { body.innerHTML = '<div class="msg error">' + esc((res && res.message) || 'The list could not be loaded.') + '</div>'; return; }
    s.rows = res.rows || []; s.total = Number(res.total || 0); s.loaded = true;
    ctx.listIds = s.rows.map((r) => r.id);
    const pages = Math.max(1, Math.ceil(s.total / s.pageSize));
    if (s.page > pages && s.total) { s.page = pages; return load(); }
    const from = s.total ? (s.page - 1) * s.pageSize + 1 : 0, to = Math.min(s.total, s.page * s.pageSize);
    const hasFilters = Object.values(s.filters).some((v) => v !== '' && v !== false);
    body.innerHTML = '<div class="pv-summary muted">' + (s.total ? 'Showing <b>' + from + '–' + to + '</b> of <b>' + s.total.toLocaleString('en-PH') + '</b>' : 'Nothing to show') + '</div>' +
      (s.rows.length ? tableHtml(s.rows, ctx) : emptyBox(hasFilters ? 'No payments match these filters.' : key === 'pending' ? 'Nothing is waiting for verification. 🎉' : 'Nothing here yet.')) +
      (s.total > s.pageSize ? '<div class="pv-pager"><span class="muted">Page ' + s.page + ' of ' + pages + '</span><span class="pv-btnrow">' +
        '<button type="button" class="btn small secondary" data-page="prev"' + (s.page <= 1 ? ' disabled' : '') + '>← Previous</button><button type="button" class="btn small secondary" data-page="next"' + (s.page >= pages ? ' disabled' : '') + '>Next →</button></span></div>' : '');
    hydrateImages(body);
    wireBody(body);
  }

  function wireBody(body) {
    body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => ctx.openDetail(b.dataset.open, { rows: s.rows.map((r) => ({ id: r.id, status: r.status })) })));
    body.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
      const r = s.rows.find((x) => String(x.id) === b.dataset.zoom);
      if (r && r.thumb) openLightbox(ctx.api, [{ label: r.pv_code + ' · ' + (r.customer_name || ''), image: r.thumb, caption: money(r.amount) }]);
    }));
    body.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { s.page += b.dataset.page === 'next' ? 1 : -1; load(); body.scrollIntoView({ block: 'start' }); }));
  }

  function wire() {
    const f = s.filters, $ = (id) => panel.querySelector('#' + id);
    const apply = () => { chipsRefresh(); load(true); };
    const chipsRefresh = () => { panel.querySelector('#pv-chips').innerHTML = chips(ctx, s.filters); const c = panel.querySelector('#pv-clear-filters'); if (c) c.addEventListener('click', clear); };
    const clear = () => { s.filters = blankFilters(); paint(); load(true); };
    const bindSelect = (id, key2) => { const el = $(id); if (el) el.addEventListener('change', () => { f[key2] = el.value; apply(); }); };
    const bindText = (id, key2) => { const el = $(id); if (el) el.addEventListener('input', debounce(() => { f[key2] = el.value.trim(); apply(); }, 450)); };
    bindText('pv-q', 'q'); bindSelect('pv-from', 'date_from'); bindSelect('pv-to', 'date_to'); bindSelect('pv-branch', 'branch_id'); bindSelect('pv-shop', 'shop_id'); bindSelect('pv-source', 'source');
    bindSelect('pv-method', 'method'); bindSelect('pv-account', 'account_id'); bindSelect('pv-status', 'status'); bindSelect('pv-risk', 'risk'); bindSelect('pv-pancake', 'pancake'); bindSelect('pv-pstatus', 'pancake_status');
    bindText('pv-customer', 'customer'); bindText('pv-order', 'order_ref'); bindText('pv-reference', 'reference'); bindText('pv-verifier', 'verified_by'); bindText('pv-attby', 'attached_by'); bindText('pv-amin', 'amount_min'); bindText('pv-amax', 'amount_max');
    [['pv-dup', 'dup_only'], ['pv-noref', 'no_reference'], ['pv-drift', 'drift']].forEach(([id, k2]) => { const el = $(id); if (el) el.addEventListener('change', () => { f[k2] = el.checked; apply(); }); });
    $('pv-sort').addEventListener('change', (e) => { s.sort = e.target.value; load(true); });
    $('pv-reload').addEventListener('click', () => { ctx.refreshCounts(); load(); });
    $('pv-more-btn').addEventListener('click', () => { s.more = !s.more; paint(); });
    panel.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
      const t = manilaToday(), r = b.dataset.range;
      f.date_to = t;
      if (r === 'today') f.date_from = t; else { const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - Number(r)); f.date_from = d.toISOString().slice(0, 10); }
      paint(); load(true);
    }));
    const c = panel.querySelector('#pv-clear-filters'); if (c) c.addEventListener('click', clear);
  }

  paint();
  ctx.reloadList = () => load();
  await load();
}

/** A short list (used on the Dashboard): the first few rows of a tab. */
export async function compactList(ctx, host, tab, limit, sort, emptyText) {
  host.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await ctx.api.list({ tab }, limit, 0, sort);
    if (!res || res.ok === false) { host.innerHTML = '<div class="msg error">' + esc((res && res.message) || 'Could not load.') + '</div>'; return; }
    if (!res.rows.length) { host.innerHTML = '<p class="muted">' + esc(emptyText) + '</p>'; return; }
    host.innerHTML = '<div class="pv-compact">' + res.rows.map((r) => '<button type="button" class="pv-compact-row" data-open="' + esc(r.id) + '"><span class="pv-compact-main"><b>' + esc(r.pv_code) + '</b> ' + esc(r.customer_name || '—') +
      (r.order_ref ? ' <span class="muted">· order #' + esc(r.order_ref) + (r.shop_name ? ' (' + esc(r.shop_name) + ')' : '') + '</span>' : '') + '</span><span class="pv-compact-side">' + esc(money(r.amount)) + ' ' + statusBadge(r.status) + ' ' + riskBadge(r.risk) +
      '<span class="muted"> ' + esc(fmtShortDateTime(r.submitted_at)) + '</span></span></button>').join('') + '</div>';
    host.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => ctx.openDetail(b.dataset.open, { rows: res.rows.map((r) => ({ id: r.id, status: r.status })) })));
  } catch (err) { host.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; }
}
