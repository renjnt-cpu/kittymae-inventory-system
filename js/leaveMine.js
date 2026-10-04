// Leave Management -- "My Leave": the employee's own dashboard. Only ever shows the signed-in
// person's rows (the database would not return anyone else's anyway).
import {
  esc, statusBadge, fmtDate, manilaDate, rangeText, num, daysText, tile, yearOf, STATUSES, OPEN_STATUSES, EMPLOYEE_EDITABLE,
} from './leaveUi.js?v=20261004g';
import {
  activeFiltersHtml, emptyStateHtml, wireProxyButtons, sortControlHtml, wireSortControl, applySort, byText, byNumber, byDate,
} from './uiKit.js?v=20260928a';
import { openLedger } from './leaveCredits.js?v=20261004g';

const SORT_FIELDS = [
  { key: 'created_at', label: 'Date Filed' }, { key: 'start_date', label: 'Leave Dates' }, { key: 'leave_request_number', label: 'Request No.' },
  { key: 'requested_days', label: 'Days' }, { key: 'status', label: 'Status' },
];
const COMPARATORS = {
  created_at: byDate('created_at'), start_date: byDate('start_date'), leave_request_number: byText('leave_request_number'),
  requested_days: byNumber('requested_days'), status: byText('status'),
};
const f = { status: 'all', year: 'all', search: '', sort: { field: 'created_at', dir: 'desc' } };

export function renderMine(ctx, root) {
  const me = ctx.me;
  const mine = (ctx.data.requests || []).filter((r) => r.employee_id === me.employee_id);
  const myBal = (ctx.data.balances || []).filter((b) => b.employee_id === me.employee_id);
  const balOf = (typeId) => myBal.find((b) => b.leave_type_id === typeId) || { total_credits: 0, used_credits: 0, available_credits: 0 };
  const creditTypes = ctx.types.filter((t) => t.active && t.requires_credit);
  const sum = (key) => creditTypes.reduce((s, t) => s + Number(balOf(t.id)[key] || 0), 0);
  const pending = mine.filter((r) => OPEN_STATUSES.includes(r.status));
  const approvedYear = mine.filter((r) => ['Approved', 'Completed'].includes(r.status) && yearOf(r.start_date) === yearOf(ctx.today));
  const upcoming = mine.filter((r) => r.status === 'Approved' && r.end_date >= ctx.today && !r.cancellation_status);
  const upDays = upcoming.reduce((s, r) => s + Number(r.requested_days), 0);

  root.innerHTML =
    '<div class="card lv-empcard"><div class="lv-empcard-main"><div class="lv-empname">' + esc(me.full_name) + '</div>' +
      '<div class="muted">' + esc([me.employee_code, me.department, me.job_title].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="muted">Immediate Supervisor: <b>' + esc(me.supervisor_name || 'Not set') + '</b> &nbsp;·&nbsp; Today: <b>' + esc(fmtDate(ctx.today)) + '</b></div></div>' +
      '<div><button type="button" class="btn" id="mine-file-btn">+ File Leave Request</button></div></div>' +
    '<div class="tiles">' +
      tile(esc(num(sum('total_credits'))), 'Leave Credits Granted', 'paid leave, all types') +
      tile(esc(num(sum('used_credits'))), 'Credits Used') +
      tile(esc(num(sum('available_credits'))), 'Remaining Credits') +
      tile(pending.length, 'Pending Requests') +
      tile(approvedYear.length, 'Approved This Year') +
      tile(upcoming.length, 'Upcoming Leave', upcoming.length ? daysText(upDays) : '') +
    '</div>' +
    '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;"><h4 class="lv-h" style="margin:0;">My Leave Credits</h4>' +
      '<button type="button" class="btn small secondary" id="mine-ledger-btn">Credit History</button></div><div class="lv-credit-grid">' +
      (ctx.types.filter((t) => t.active).map((t) => {
        const b = balOf(t.id);
        return '<div class="lv-credit-card"><div class="lv-credit-name">' + esc(t.name) + '</div>' +
          (t.requires_credit
            ? '<div class="lv-credit-rem"><b>' + esc(num(b.available_credits)) + '</b> <span class="muted">remaining</span></div>' +
              '<div class="muted">Total ' + esc(num(b.total_credits)) + ' · Used ' + esc(num(b.used_credits)) + '</div>'
            : '<div class="muted" style="margin-top:8px;">No credits needed</div>') + '</div>';
      }).join('') || '<p class="muted">No leave types are set up yet.</p>') +
    '</div>' + (sum('total_credits') === 0 && creditTypes.length ? '<p class="muted" style="margin:10px 0 0;">No leave credits have been added for you yet. HR adds them — you can still file unpaid leave.</p>' : '') + '</div>' +
    '<div id="mine-requests"><div class="card"><h4 class="lv-h">My Leave Requests</h4>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">' +
        '<div class="field" style="min-width:180px;"><label>Search</label><input type="text" id="mine-search" placeholder="Request no., leave type, reason…" value="' + esc(f.search) + '"></div>' +
        '<div class="field"><label>Status</label><select id="mine-status"><option value="all">All</option>' + STATUSES.map((s) => '<option' + (f.status === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Year</label><select id="mine-year">' + yearOptions(mine, ctx.today) + '</select></div>' +
        sortControlHtml(SORT_FIELDS, f.sort, 'mine-sort', 'mine-sort-dir') +
        '<button type="button" class="btn small secondary" id="mine-clear">Clear Filters</button>' +
      '</div></div><div id="mine-active"></div><div id="mine-list"></div></div>';

  $('mine-file-btn').addEventListener('click', () => ctx.openForm({}));
  $('mine-ledger-btn').addEventListener('click', () => openLedger(ctx, me.employee_id));
  $('mine-search').addEventListener('input', (e) => { f.search = e.target.value; renderList(ctx, mine); });
  $('mine-status').addEventListener('change', (e) => { f.status = e.target.value; renderList(ctx, mine); });
  $('mine-year').addEventListener('change', (e) => { f.year = e.target.value; renderList(ctx, mine); });
  $('mine-clear').addEventListener('click', () => {
    f.status = 'all'; f.year = 'all'; f.search = '';
    $('mine-search').value = ''; $('mine-status').value = 'all'; $('mine-year').value = 'all';
    renderList(ctx, mine);
  });
  wireSortControl('mine-sort', 'mine-sort-dir', f.sort, () => renderList(ctx, mine));
  renderList(ctx, mine);
}

const $ = (id) => document.getElementById(id);

function yearOptions(mine, today) {
  const years = Array.from(new Set([yearOf(today), ...mine.map((r) => yearOf(r.start_date))])).sort((a, b) => b - a);
  return '<option value="all">All</option>' + years.map((y) => '<option' + (f.year === String(y) ? ' selected' : '') + '>' + y + '</option>').join('');
}

function renderList(ctx, mine) {
  const q = f.search.trim().toLowerCase();
  const rows = mine.filter((r) => {
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.year !== 'all' && String(yearOf(r.start_date)) !== f.year) return false;
    if (q) {
      const type = (ctx.typeById[r.leave_type_id] || {}).name || '';
      if (!(String(r.leave_request_number || '') + ' ' + type + ' ' + (r.reason || '') + ' ' + r.status).toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const sorted = applySort(rows, f.sort, COMPARATORS);
  $('mine-active').innerHTML = activeFiltersHtml([
    { label: 'Search', value: esc(f.search.trim()) }, { label: 'Status', value: esc(f.status) }, { label: 'Year', value: esc(f.year) },
  ], 'mine-clear');
  wireProxyButtons($('mine-active'));

  const list = $('mine-list');
  if (!sorted.length) {
    list.innerHTML = emptyStateHtml({
      message: mine.length ? 'No leave requests match these filters.' : 'You have not filed any leave requests yet.',
      hasFilters: mine.length > 0, clearId: 'mine-clear', createLabel: '+ File Leave Request', createId: 'mine-file-btn',
    });
    wireProxyButtons(list);
    return;
  }
  list.innerHTML = '<div class="card"><div class="table-scroll table-2col"><table><thead><tr>' +
    '<th>Request No.</th><th>Leave Type</th><th>Dates</th><th>Days</th><th>Paid / Unpaid</th><th>Status</th><th>Date Filed</th><th>Action</th></tr></thead><tbody>' +
    sorted.map((r) => {
      const type = (ctx.typeById[r.leave_type_id] || {}).name || '—';
      const canEdit = EMPLOYEE_EDITABLE.includes(r.status);
      const canCancel = OPEN_STATUSES.includes(r.status) || (r.status === 'Approved' && r.cancellation_status !== 'Requested' && r.end_date >= ctx.today);
      return '<tr><td data-label="Request No.">' + (r.leave_request_number ? esc(r.leave_request_number) : '<span class="muted">Draft</span>') + '</td>' +
        '<td data-label="Leave Type">' + esc(type) + '</td>' +
        '<td data-label="Dates">' + esc(rangeText(r.start_date, r.end_date)) + '</td>' +
        '<td data-label="Days">' + esc(num(r.requested_days)) + '</td>' +
        '<td data-label="Paid / Unpaid">' + esc(r.payment_type) + '</td>' +
        '<td data-label="Status">' + statusBadge(r.status, r.cancellation_status) + '</td>' +
        '<td data-label="Date Filed">' + esc(fmtDate(manilaDate(r.submitted_at || r.created_at))) + '</td>' +
        '<td data-label="Action" class="full-row"><div class="lv-row-actions">' +
          '<button type="button" class="btn small secondary" data-view="' + r.id + '">View Details</button>' +
          (canEdit ? '<button type="button" class="btn small secondary" data-edit="' + r.id + '">Edit</button>' : '') +
          (r.status === 'Draft' ? '<button type="button" class="btn small secondary" data-del="' + r.id + '">Delete Draft</button>' : '') +
          (canCancel && r.status !== 'Draft' ? '<button type="button" class="btn small secondary" data-cancel="' + r.id + '">' + (r.status === 'Approved' ? 'Request Cancellation' : 'Cancel') + '</button>' : '') +
        '</div></td></tr>';
    }).join('') + '</tbody></table></div></div>';
  list.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => ctx.openDetail(b.dataset.view)));
  list.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => ctx.openForm({ request: mine.find((r) => r.id === b.dataset.edit) })));
  list.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => ctx.openDetail(b.dataset.cancel, { action: 'cancel' })));
  list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => ctx.openDetail(b.dataset.del, { action: 'delete_draft' })));
}
