// Item Monitoring > Approvals -- the Final Approver's desk (and, for everyone else, the status of what they entered). Purchase requests, reversal requests, what was sent back, what was approved or
// rejected, and the reports. A list only shows what the signed-in person may see (the database decides); the buttons only appear for what they may do.
import { esc, money, num, fmtDate, fmtDateTime, ago, reqBadge, delBadge, newSkuBadge, toCsv, downloadText, dayOf, REQ_STATUS } from './imFormat.js?v=20261031a';
import { kpi, emptyBox } from './imUi.js?v=20261031a';

const SUBS = [
  ['purchases', 'Purchase approvals'], ['reversals', 'Delete / reversal approvals'], ['returned', 'Returned for correction'], ['approved', 'Recently approved'], ['rejected', 'Recently rejected'], ['all', 'All requests & reports'],
];
const SORTS = [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['value', 'Highest purchase value'], ['branch', 'Branch']];

const stateOf = (ctx) => ctx.ui.approvals;
const submittedAt = (r) => r.submitted_at || r.created_at;

function applyFilters(rows, f, withStatus) {
  const q = (f.search || '').trim().toLowerCase();
  let out = rows.filter((r) => {
    if (q && !(String(r.request_number).toLowerCase().includes(q) || String(r.skus || '').toLowerCase().includes(q) || String(r.submitted_by_name || r.created_by_name || '').toLowerCase().includes(q) || String(r.notes || '').toLowerCase().includes(q))) return false;
    if (f.branch && String(r.branch_id) !== f.branch) return false;
    if (f.by && String(r.created_by) !== f.by) return false;
    if (f.from && dayOf(submittedAt(r)) < f.from) return false;
    if (f.to && dayOf(submittedAt(r)) > f.to) return false;
    if (f.newOnly && !(Number(r.new_skus) > 0)) return false;
    if (withStatus && f.status && r.status !== f.status) return false;
    if (f.min !== '' && f.min !== undefined && Number(r.purchased) < Number(f.min)) return false;
    if (f.max !== '' && f.max !== undefined && Number(r.purchased) > Number(f.max)) return false;
    return true;
  });
  const cmp = {
    newest: (a, b) => new Date(submittedAt(b)) - new Date(submittedAt(a)), oldest: (a, b) => new Date(submittedAt(a)) - new Date(submittedAt(b)),
    value: (a, b) => Number(b.purchased) - Number(a.purchased), branch: (a, b) => String(a.branch_name).localeCompare(String(b.branch_name)) || new Date(submittedAt(b)) - new Date(submittedAt(a)),
  }[f.sort || 'newest'];
  out = out.slice().sort(cmp);
  return out;
}

function requestRows(ctx, rows) {
  const me = ctx.employee;
  return '<div class="table-scroll"><table><thead><tr><th>Request</th><th>Submitted</th><th>Branch</th><th>Submitted by</th><th>SKUs</th><th>Pcs</th><th>Purchased</th><th>Est. sales</th><th>Profit</th><th>New SKUs</th><th>Status</th><th></th></tr></thead><tbody>' +
    rows.map((r) => {
      const pend = r.status === 'PENDING FINAL APPROVAL';
      const act = [];
      act.push('<button type="button" class="btn small secondary" data-open="' + r.id + '">View</button>');
      if (ctx.who.isApprover && pend) act.push('<button type="button" class="btn small" data-act="approve" data-open="' + r.id + '">Approve</button><button type="button" class="btn small secondary" data-act="return" data-open="' + r.id + '">Return</button><button type="button" class="btn small secondary" data-act="reject" data-open="' + r.id + '">Reject</button>');
      else if (ctx.who.isApprover && ['APPROVED', 'PARTIALLY POSTED'].includes(r.status)) act.push('<button type="button" class="btn small" data-act="approve" data-open="' + r.id + '">Retry posting</button>');
      if (r.created_by === me.id && ['DRAFT', 'RETURNED FOR CORRECTION'].includes(r.status)) act.push('<button type="button" class="btn small" data-edit="' + r.id + '">' + (r.status === 'DRAFT' ? 'Continue' : 'Correct') + '</button>');
      return '<tr' + (pend && ctx.who.isApprover ? ' class="im-row-attn"' : '') + '><td data-label="Request"><b>' + esc(r.request_number) + '</b>' + (r.comments ? '<div class="muted" style="font-size:10px;">' + num(r.comments) + ' comment(s)</div>' : '') + '</td>' +
        '<td data-label="Submitted">' + (r.submitted_at ? fmtDateTime(r.submitted_at) + '<div class="muted" style="font-size:10px;">' + ago(r.submitted_at) + '</div>' : '<span class="muted">not submitted</span>') + '</td>' +
        '<td data-label="Branch">' + esc(r.branch_name) + '</td><td data-label="Submitted by">' + esc(r.submitted_by_name || r.created_by_name || '—') + '</td><td data-label="SKUs">' + num(r.items) + '</td><td data-label="Pcs">' + num(r.pcs) + '</td>' +
        '<td data-label="Purchased">' + money(r.purchased) + '</td><td data-label="Est. sales">' + money(r.est_sales) + '</td><td data-label="Profit">' + money(r.profit) + '</td>' +
        '<td data-label="New SKUs">' + (Number(r.new_skus) > 0 ? newSkuBadge(r.new_skus) : '—') + '</td><td data-label="Status">' + reqBadge(r.status) + (Number(r.failed) > 0 ? '<div class="im-fail" style="font-size:11px;">' + num(r.failed) + ' failed</div>' : '') + '</td>' +
        '<td data-label="" class="full-row"><div class="im-actions">' + act.join('') + '</div></td></tr>';
    }).join('') + '</tbody></table></div>';
}

function deleteRows(ctx, rows) {
  return '<div class="table-scroll"><table><thead><tr><th>Request</th><th>Requested</th><th>Purchase</th><th>SKU</th><th>Branch</th><th>Qty</th><th>Reason</th><th>Requested by</th><th>Stock usage</th><th>Status</th><th></th></tr></thead><tbody>' +
    rows.map((d) => {
      const open = ['PENDING FINAL APPROVAL', 'REVERSAL BLOCKED'].includes(d.status);
      const safe = d.purchase_exists && Number(d.on_hand_now) >= Number(d.qty);
      return '<tr' + (open && ctx.who.isApprover ? ' class="im-row-attn"' : '') + '><td data-label="Request"><b>' + esc(d.request_number) + '</b></td><td data-label="Requested">' + fmtDateTime(d.requested_at) + '</td>' +
        '<td data-label="Purchase">#' + esc(d.purchase_id) + '<div class="muted" style="font-size:10px;">delivered ' + fmtDate(d.date_delivered) + '</div></td><td data-label="SKU"><b>' + esc(d.sku) + '</b><div class="muted" style="font-size:10px;">' + esc(d.product_name || '') + '</div></td>' +
        '<td data-label="Branch">' + esc(d.branch_name) + '</td><td data-label="Qty">' + num(d.qty) + '</td><td data-label="Reason">' + esc(d.reason_category) + (d.reason ? '<div class="muted" style="font-size:10px;">' + esc(d.reason) + '</div>' : '') + '</td>' +
        '<td data-label="Requested by">' + esc(d.requested_by_name || '—') + '</td>' +
        '<td data-label="Stock usage">' + (d.status === 'REVERSED' ? '<span class="muted">reversed</span>' : !d.purchase_exists ? '<span class="muted">purchase gone</span>' : safe ? '<span class="badge lv-green">Safe to reverse</span>' : '<span class="badge lv-red">Stock was used</span>') + '</td>' +
        '<td data-label="Status">' + delBadge(d.status) + '</td>' +
        '<td data-label="" class="full-row"><div class="im-actions"><button type="button" class="btn small secondary" data-open-del="' + d.id + '">View</button>' +
        (ctx.who.isApprover && open ? '<button type="button" class="btn small" data-open-del="' + d.id + '" data-act="approve">Approve reversal</button>' : '') + '</div></td></tr>';
    }).join('') + '</tbody></table></div>';
}

function reportsHtml(ctx, rows, dels) {
  const group = (key, label) => {
    const m = new Map();
    rows.forEach((r) => { const k = (typeof key === 'function' ? key(r) : r[key]) || '—'; const g = m.get(k) || { n: 0, pcs: 0, amt: 0, newSkus: 0 }; g.n += 1; g.pcs += Number(r.pcs); g.amt += Number(r.purchased); g.newSkus += Number(r.new_skus) > 0 ? 1 : 0; m.set(k, g); });
    return '<div class="card"><h4 class="im-h">' + label + '</h4><div class="table-scroll table-mini"><table><thead><tr><th></th><th>Requests</th><th>Pcs</th><th>Purchased</th><th>With new SKUs</th></tr></thead><tbody>' +
      ([...m.entries()].sort((a, b) => b[1].amt - a[1].amt).map(([k, g]) => '<tr><td data-label="">' + esc(REQ_STATUS[k] ? REQ_STATUS[k].label : k) + '</td><td data-label="Requests">' + num(g.n) + '</td><td data-label="Pcs">' + num(g.pcs) + '</td><td data-label="Purchased">' + money(g.amt) + '</td><td data-label="With new SKUs">' + num(g.newSkus) + '</td></tr>').join('') || '<tr><td colspan="5" class="muted">Nothing in this view.</td></tr>') +
      '</tbody></table></div></div>';
  };
  const reversed = dels.filter((d) => d.status === 'REVERSED');
  const byStatus = new Map(); dels.forEach((d) => byStatus.set(d.status, (byStatus.get(d.status) || 0) + 1));
  return '<h3 class="im-h" style="margin-top:18px;">Reports (for the requests in the filter above)</h3><div class="im-reports">' +
    group('status', 'Requests by status') + group('branch_name', 'Factory purchases by branch') + group((r) => r.submitted_by_name || r.created_by_name, 'Factory purchases by user') + group((r) => r.final_approved_by_name || 'Not approved', 'Factory purchases by approver') +
    '<div class="card"><h4 class="im-h">Reversal requests</h4><p>' + (dels.length ? [...byStatus.entries()].map(([k, n]) => delBadge(k) + ' ' + num(n)).join(' &nbsp; ') : '<span class="muted">None yet.</span>') + '</p>' +
    (reversed.length ? '<div class="muted" style="font-size:12px;">Reversed purchases: ' + reversed.map((d) => esc(d.sku) + ' ×' + num(d.qty) + ' (' + esc(d.branch_name) + ')').join(', ') + '</div>' : '') + '</div></div>' +
    '<div style="margin-top:8px;"><button type="button" class="btn small secondary" id="im-ap-csv">Export this list (CSV)</button></div>';
}

export function renderApprovals(ctx, panel, opts) {
  const st = stateOf(ctx);
  if (opts && opts.sub) st.sub = opts.sub;
  if (opts && opts.filter) Object.assign(st.f, opts.filter);
  const o = ctx.data.overview || {};
  const reqs = ctx.data.requests || [];
  const dels = ctx.data.deletes || [];

  const cards = [
    kpi({ label: 'Pending purchase approval', value: num(o.pending_requests), tone: Number(o.pending_requests) ? 'yellow' : 'gray', go: 'purchases' }),
    kpi({ label: 'New SKUs awaiting approval', value: num(o.new_sku_awaiting), tone: Number(o.new_sku_awaiting) ? 'orange' : 'gray', go: 'purchases' }),
    kpi({ label: 'Purchase value pending', value: money(o.pending_value), tone: 'yellow', go: 'purchases' }),
    kpi({ label: 'Deletion requests pending', value: num(o.pending_deletes), tone: Number(o.pending_deletes) ? 'orange' : 'gray', go: 'reversals' }),
    kpi({ label: 'Returned for correction', value: num(o.returned), tone: Number(o.returned) ? 'blue' : 'gray', go: 'returned' }),
    kpi({ label: 'Approved today', value: num(o.approved_today), tone: 'green', go: 'approved' }),
    kpi({ label: 'Rejected today', value: num(o.rejected_today), tone: Number(o.rejected_today) ? 'red' : 'gray', go: 'rejected' }),
  ].join('');
  const counts = {
    purchases: reqs.filter((r) => ['PENDING FINAL APPROVAL', 'APPROVED', 'PARTIALLY POSTED'].includes(r.status)).length,
    reversals: dels.filter((d) => ['PENDING FINAL APPROVAL', 'REVERSAL BLOCKED'].includes(d.status)).length,
    returned: reqs.filter((r) => r.status === 'RETURNED FOR CORRECTION').length,
  };
  const people = [...new Map(reqs.map((r) => [r.created_by, r.created_by_name])).entries()].filter((x) => x[0]);

  panel.innerHTML = '<div class="im-cards">' + cards + '</div>' +
    '<div class="lv-tabs im-subtabs" role="tablist">' + SUBS.map(([id, label]) => '<button type="button" class="lv-tab' + (st.sub === id ? ' lv-tab-active' : '') + '" data-sub="' + id + '">' + esc(label) + (counts[id] ? ' <span class="lv-tab-badge">' + counts[id] + '</span>' : '') + '</button>').join('') + '</div>' +
    (st.sub === 'reversals' ? '' : '<div class="card im-filters"><div class="im-filter-row">' +
      '<div class="field im-grow"><label>Search</label><input type="search" id="im-ap-search" placeholder="Request number, SKU, person…" value="' + esc(st.f.search) + '"></div></div>' +
      '<details class="im-fdet"' + (window.innerWidth > 760 ? ' open' : '') + '><summary>More filters and sorting</summary><div class="im-filter-row">' +
      '<div class="field"><label>Branch</label><select id="im-ap-branch"><option value="">All branches</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (st.f.branch === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Submitted by</label><select id="im-ap-by"><option value="">Anyone</option>' + people.map(([id, n]) => '<option value="' + esc(id) + '"' + (st.f.by === id ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>' +
      (st.sub === 'all' ? '<div class="field"><label>Status</label><select id="im-ap-status"><option value="">Any status</option>' + Object.entries(REQ_STATUS).map(([k, v]) => '<option value="' + k + '"' + (st.f.status === k ? ' selected' : '') + '>' + esc(v.label) + '</option>').join('') + '</select></div>' : '') +
      '<div class="field"><label>From</label><input type="date" id="im-ap-from" value="' + esc(st.f.from) + '"></div><div class="field"><label>To</label><input type="date" id="im-ap-to" value="' + esc(st.f.to) + '"></div>' +
      '<div class="field"><label>Purchased from ₱</label><input type="number" id="im-ap-min" min="0" step="1" value="' + esc(st.f.min) + '" inputmode="decimal"></div><div class="field"><label>to ₱</label><input type="number" id="im-ap-max" min="0" step="1" value="' + esc(st.f.max) + '" inputmode="decimal"></div>' +
      '<div class="field"><label>Sort</label><select id="im-ap-sort">' + SORTS.map(([k, l]) => '<option value="' + k + '"' + (st.f.sort === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      '<label class="im-check"><input type="checkbox" id="im-ap-new"' + (st.f.newOnly ? ' checked' : '') + '> New SKU only</label><button type="button" class="btn small secondary" id="im-ap-clear">Clear</button></div></details></div>') +
    '<div id="im-ap-list"></div><div id="im-ap-reports"></div>';

  const $ = (id) => panel.querySelector('#' + id);
  const list = $('im-ap-list');

  function paint() {
    let html = '', rep = '';
    const f = st.f;
    if (st.sub === 'reversals') {
      const rows = dels.filter((d) => ['PENDING FINAL APPROVAL', 'REVERSAL BLOCKED'].includes(d.status));
      html = rows.length ? deleteRows(ctx, rows) : emptyBox('No reversal requests waiting.');
    } else {
      let rows;
      if (st.sub === 'purchases') rows = reqs.filter((r) => ['PENDING FINAL APPROVAL', 'APPROVED', 'PARTIALLY POSTED'].includes(r.status));
      else if (st.sub === 'returned') rows = reqs.filter((r) => r.status === 'RETURNED FOR CORRECTION');
      else if (st.sub === 'approved') rows = reqs.filter((r) => ['POSTED', 'PARTIALLY POSTED', 'APPROVED'].includes(r.status) && r.final_approved_at);
      else if (st.sub === 'rejected') rows = reqs.filter((r) => r.status === 'REJECTED');
      else rows = reqs;
      rows = applyFilters(rows, f, st.sub === 'all');
      if (st.sub === 'approved') rows = rows.slice().sort((a, b) => new Date(b.final_approved_at) - new Date(a.final_approved_at));
      if (st.sub === 'rejected') rows = rows.slice().sort((a, b) => new Date(b.rejected_at) - new Date(a.rejected_at));
      const filtered = !!(f.search || f.branch || f.by || f.from || f.to || f.newOnly || f.status || f.min !== '' || f.max !== '');
      html = rows.length ? '<div class="muted" style="margin:0 0 6px;">' + num(rows.length) + ' request(s)</div>' + requestRows(ctx, rows.slice(0, 300)) + (rows.length > 300 ? '<p class="muted">Showing the first 300 — narrow the filters to see the rest.</p>' : '')
        : emptyBox(filtered ? 'No requests match these filters.' : st.sub === 'purchases' ? 'Nothing is waiting for approval.' : st.sub === 'returned' ? 'Nothing was returned for correction.' : 'Nothing to show here yet.');
      if (st.sub === 'all') { rep = reportsHtml(ctx, rows, dels); ctx.ui.lastRegister = rows; }
    }
    list.innerHTML = html; $('im-ap-reports').innerHTML = rep;
    list.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => ctx.openRequest(Number(b.dataset.open), b.dataset.act ? { action: b.dataset.act } : undefined)));
    list.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => ctx.showTab('purchase', { requestId: Number(b.dataset.edit) })));
    list.querySelectorAll('[data-open-del]').forEach((b) => b.addEventListener('click', () => ctx.openDelete(Number(b.dataset.openDel), b.dataset.act ? { action: b.dataset.act } : undefined)));
    const csv = $('im-ap-csv');
    if (csv) csv.addEventListener('click', () => {
      const rows = ctx.ui.lastRegister || [];
      downloadText('factory-purchase-requests.csv', toCsv(['Request', 'Status', 'Branch', 'Date delivered', 'Entered by', 'Submitted by', 'Submitted', 'Approved by', 'Approved', 'SKUs', 'Pcs', 'Purchased', 'Est. sales', 'Expected profit', 'New SKUs'],
        rows.map((r) => [r.request_number, REQ_STATUS[r.status] ? REQ_STATUS[r.status].label : r.status, r.branch_name, r.date_delivered, r.created_by_name, r.submitted_by_name, r.submitted_at, r.final_approved_by_name, r.final_approved_at, r.items, r.pcs, r.purchased, r.est_sales, r.profit, r.new_skus])));
    });
  }

  panel.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { st.sub = b.dataset.sub; renderApprovals(ctx, panel); }));
  panel.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { st.sub = b.dataset.go; renderApprovals(ctx, panel); }));
  const bind = (id, key, ev, val) => { const el = $(id); if (el) el.addEventListener(ev, () => { st.f[key] = val ? val(el) : el.value; paint(); }); };
  bind('im-ap-search', 'search', 'input'); bind('im-ap-branch', 'branch', 'change'); bind('im-ap-by', 'by', 'change'); bind('im-ap-status', 'status', 'change');
  bind('im-ap-from', 'from', 'change'); bind('im-ap-to', 'to', 'change'); bind('im-ap-min', 'min', 'input'); bind('im-ap-max', 'max', 'input'); bind('im-ap-sort', 'sort', 'change'); bind('im-ap-new', 'newOnly', 'change', (el) => el.checked);
  const clear = $('im-ap-clear');
  if (clear) clear.addEventListener('click', () => { st.f = { search: '', branch: '', by: '', status: '', from: '', to: '', min: '', max: '', newOnly: false, sort: 'newest' }; renderApprovals(ctx, panel); });
  paint();
}
