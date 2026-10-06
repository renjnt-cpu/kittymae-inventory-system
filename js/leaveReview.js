// Leave Management -- the HR Dashboard and the Final Approver dashboard. Both are read-only
// views over what the database already allowed this person to see; every button just opens
// the shared request drawer (optionally with its confirmation panel pre-opened).
import {
  esc, statusBadge, fmtDate, rangeText, num, daysText, manilaDate, addDays, yearOf,
  PENDING_HR, FINAL_QUEUE, DECISION_STATUSES, STATUSES,
} from './leaveUi.js?v=20261007c';
import {
  activeFiltersHtml, emptyStateHtml, wireProxyButtons, sortControlHtml, wireSortControl, applySort, byText, byNumber, byDate,
} from './uiKit.js?v=20261007c';

const $ = (id) => document.getElementById(id);
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A "quick filter" is what clicking a summary card does -- the same result the filters
// below would give, so the numbers on the cards and the rows in the table always agree.
const QUICK = (today) => ({
  pending_hr: { label: 'Pending HR Review', test: (r) => PENDING_HR.includes(r.status) },
  pending_final: { label: 'Pending Final Approval', test: (r) => FINAL_QUEUE.includes(r.status) },
  approved_today: { label: 'Approved Today', test: (r) => r.approved_at && manilaDate(r.approved_at) === today },
  rejected_today: { label: 'Rejected Today', test: (r) => r.rejected_at && manilaDate(r.rejected_at) === today },
  on_leave: { label: 'Currently on Leave', test: (r) => r.status === 'Approved' && r.start_date <= today && r.end_date >= today },
  soon: { label: 'Going on Leave Soon', test: (r) => r.status === 'Approved' && r.start_date > today && r.start_date <= addDays(today, 7) },
  month: { label: 'Filed This Month', test: (r) => r.submitted_at && manilaDate(r.submitted_at).slice(0, 7) === today.slice(0, 7) },
  cancel: { label: 'Cancellation Requests', test: (r) => r.cancellation_status === 'Requested' },
});

const qtile = (key, active, n, label, sub) => '<div class="tile lv-clickable' + (active ? ' lv-tile-active' : '') + '" data-quick="' + key + '" role="button" tabindex="0">' +
  '<div class="num">' + n + '</div><div class="lbl">' + esc(label) + '</div>' + (sub ? '<div class="muted" style="font-size:10px;">' + esc(sub) + '</div>' : '') + '</div>';

function wireQuick(root, onPick) {
  root.querySelectorAll('[data-quick]').forEach((el) => {
    const go = () => onPick(el.dataset.quick);
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

const empName = (ctx, id) => (ctx.dirById[id] || {}).full_name || '—';
const empDept = (ctx, id) => (ctx.dirById[id] || {}).department || '—';
const typeName = (ctx, id) => (ctx.typeById[id] || {}).name || '—';
const balanceOf = (ctx, empId, typeId) => {
  const b = (ctx.data.balances || []).find((x) => x.employee_id === empId && x.leave_type_id === typeId);
  return b ? Number(b.available_credits) : 0;
};

// =====================================================================================
// HR Dashboard
// =====================================================================================
const hf = {
  quick: null, employee: 'all', department: 'all', type: 'all', status: 'all', payment: 'all', from: '', to: '', month: 'all', year: 'all', search: '',
  sort: { field: 'created_at', dir: 'desc' },
};
const HR_SORT = [
  { key: 'created_at', label: 'Date Filed' }, { key: 'start_date', label: 'Leave Dates' }, { key: 'employee', label: 'Employee' },
  { key: 'leave_request_number', label: 'Request No.' }, { key: 'requested_days', label: 'Days' }, { key: 'status', label: 'Status' },
];

/** Deep link from the HR 201-File "View Full Leave Record" button: show only this employee's requests. */
export function setHrEmployeeFilter(employeeId) {
  Object.assign(hf, { quick: null, employee: employeeId, department: 'all', type: 'all', status: 'all', payment: 'all', from: '', to: '', month: 'all', year: 'all', search: '' });
}

export function renderHr(ctx, root) {
  const all = (ctx.data.requests || []).filter((r) => r.status !== 'Draft');
  const today = ctx.today;
  const quick = QUICK(today);
  const cnt = (k) => all.filter(quick[k].test).length;
  const ids = new Set(all.map((r) => r.employee_id));
  if (hf.employee !== 'all') ids.add(hf.employee); // keep a deep-linked employee selectable even if they have no requests yet
  const employees = Array.from(ids).map((id) => ({ id, name: empName(ctx, id) })).sort((a, b) => a.name.localeCompare(b.name));
  const depts = Array.from(new Set(all.map((r) => empDept(ctx, r.employee_id)).filter((d) => d !== '—'))).sort();
  const years = Array.from(new Set([yearOf(today), ...all.map((r) => yearOf(r.start_date))])).sort((a, b) => b - a);
  const opt = (value, label, cur) => '<option value="' + esc(value) + '"' + (String(cur) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>';

  root.innerHTML =
    '<div class="tiles">' + [
      ['pending_hr', cnt('pending_hr'), 'Pending HR Review'], ['pending_final', cnt('pending_final'), 'Pending Final Approval'],
      ['approved_today', cnt('approved_today'), 'Approved Today'], ['rejected_today', cnt('rejected_today'), 'Rejected Today'],
      ['on_leave', cnt('on_leave'), 'Currently on Leave'], ['soon', cnt('soon'), 'Going on Leave Soon', 'next 7 days'],
      ['month', cnt('month'), 'Filed This Month'], ['cancel', cnt('cancel'), 'Cancellation Requests'],
    ].map((t) => qtile(t[0], hf.quick === t[0], t[1], t[2], t[3])).join('') + '</div>' +
    '<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">' +
      '<div class="field" style="min-width:180px;"><label>Search</label><input type="text" id="hr-search" placeholder="Name, request no., reason…" value="' + esc(hf.search) + '"></div>' +
      '<div class="field"><label>Employee</label><select id="hr-employee">' + opt('all', 'All', hf.employee) + employees.map((e) => opt(e.id, e.name, hf.employee)).join('') + '</select></div>' +
      '<div class="field"><label>Department</label><select id="hr-department">' + opt('all', 'All', hf.department) + depts.map((d) => opt(d, d, hf.department)).join('') + '</select></div>' +
      '<div class="field"><label>Leave Type</label><select id="hr-type">' + opt('all', 'All', hf.type) + ctx.types.map((t) => opt(t.id, t.name, hf.type)).join('') + '</select></div>' +
      '<div class="field"><label>Status</label><select id="hr-status">' + opt('all', 'All', hf.status) + STATUSES.filter((s) => s !== 'Draft').map((s) => opt(s, s, hf.status)).join('') + '</select></div>' +
      '<div class="field"><label>Paid / Unpaid</label><select id="hr-payment">' + opt('all', 'All', hf.payment) + opt('Paid', 'Paid', hf.payment) + opt('Unpaid', 'Unpaid', hf.payment) + '</select></div>' +
      '<div class="field"><label>Leave From</label><input type="date" id="hr-from" value="' + esc(hf.from) + '"></div>' +
      '<div class="field"><label>Leave To</label><input type="date" id="hr-to" value="' + esc(hf.to) + '"></div>' +
      '<div class="field"><label>Month</label><select id="hr-month">' + opt('all', 'All', hf.month) + MONTHS.map((m, i) => opt(i + 1, m, hf.month)).join('') + '</select></div>' +
      '<div class="field"><label>Year</label><select id="hr-year">' + opt('all', 'All', hf.year) + years.map((y) => opt(y, y, hf.year)).join('') + '</select></div>' +
      sortControlHtml(HR_SORT, hf.sort, 'hr-sort', 'hr-sort-dir') +
      '<button type="button" class="btn small secondary" id="hr-clear">Clear Filters</button>' +
    '</div></div><div id="hr-active"></div><div id="hr-list"></div>';

  const bind = (id, key, evt) => $(id).addEventListener(evt || 'change', (e) => { hf[key] = e.target.value; renderHrList(ctx, all); });
  bind('hr-search', 'search', 'input'); bind('hr-employee', 'employee'); bind('hr-department', 'department'); bind('hr-type', 'type');
  bind('hr-status', 'status'); bind('hr-payment', 'payment'); bind('hr-from', 'from'); bind('hr-to', 'to'); bind('hr-month', 'month'); bind('hr-year', 'year');
  $('hr-clear').addEventListener('click', () => {
    Object.assign(hf, { quick: null, employee: 'all', department: 'all', type: 'all', status: 'all', payment: 'all', from: '', to: '', month: 'all', year: 'all', search: '' });
    renderHr(ctx, root);
  });
  wireSortControl('hr-sort', 'hr-sort-dir', hf.sort, () => renderHrList(ctx, all));
  wireQuick(root, (k) => { hf.quick = hf.quick === k ? null : k; renderHr(ctx, root); });
  renderHrList(ctx, all);
}

function renderHrList(ctx, all) {
  const quick = QUICK(ctx.today);
  const q = hf.search.trim().toLowerCase();
  let rows = all.filter((r) => {
    if (hf.quick && !quick[hf.quick].test(r)) return false;
    if (hf.employee !== 'all' && r.employee_id !== hf.employee) return false;
    if (hf.department !== 'all' && empDept(ctx, r.employee_id) !== hf.department) return false;
    if (hf.type !== 'all' && String(r.leave_type_id) !== hf.type) return false;
    if (hf.status !== 'all' && r.status !== hf.status) return false;
    if (hf.payment !== 'all' && r.payment_type !== hf.payment) return false;
    if (hf.from && r.end_date < hf.from) return false;
    if (hf.to && r.start_date > hf.to) return false;
    if (hf.year !== 'all' && String(yearOf(r.start_date)) !== hf.year) return false;
    if (hf.month !== 'all' && Number(r.start_date.slice(5, 7)) !== Number(hf.month)) return false;
    if (q && !(empName(ctx, r.employee_id) + ' ' + (r.leave_request_number || '') + ' ' + (r.reason || '') + ' ' + typeName(ctx, r.leave_type_id)).toLowerCase().includes(q)) return false;
    return true;
  });
  const comps = {
    created_at: byDate('created_at'), start_date: byDate('start_date'), leave_request_number: byText('leave_request_number'),
    requested_days: byNumber('requested_days'), status: byText('status'),
    employee: (a, b) => empName(ctx, a.employee_id).localeCompare(empName(ctx, b.employee_id)),
  };
  rows = applySort(rows, hf.sort, comps);

  const typeLabel = hf.type === 'all' ? 'all' : typeName(ctx, Number(hf.type));
  $('hr-active').innerHTML = activeFiltersHtml([
    { label: 'Showing', value: hf.quick ? esc(quick[hf.quick].label) : '' }, { label: 'Search', value: esc(hf.search.trim()) },
    { label: 'Employee', value: hf.employee === 'all' ? 'all' : esc(empName(ctx, hf.employee)) }, { label: 'Department', value: esc(hf.department) },
    { label: 'Leave Type', value: esc(typeLabel) }, { label: 'Status', value: esc(hf.status) }, { label: 'Payment', value: esc(hf.payment) },
    { label: 'From', value: esc(hf.from) }, { label: 'To', value: esc(hf.to) },
    { label: 'Month', value: hf.month === 'all' ? 'all' : MONTHS[Number(hf.month) - 1] }, { label: 'Year', value: esc(hf.year) },
  ], 'hr-clear');
  wireProxyButtons($('hr-active'));

  const list = $('hr-list');
  if (!rows.length) {
    list.innerHTML = emptyStateHtml({ message: all.length ? 'No leave requests match these filters.' : 'No leave requests have been filed yet.', hasFilters: all.length > 0, clearId: 'hr-clear' });
    wireProxyButtons(list);
    return;
  }
  list.innerHTML = '<div class="card"><div class="muted" style="margin-bottom:8px;">' + rows.length + ' request' + (rows.length === 1 ? '' : 's') + '</div>' +
    '<div class="table-scroll table-2col"><table><thead><tr><th>Request No.</th><th>Employee</th><th>Department</th><th>Leave Type</th><th>Dates</th><th>Days</th><th>Paid / Unpaid</th><th>Status</th><th>HR Recommendation</th><th>Date Filed</th><th>Action</th></tr></thead><tbody>' +
    rows.map((r) => {
      const needsHr = ctx.flags.hr && PENDING_HR.includes(r.status) && r.employee_id !== ctx.me.employee_id;
      return '<tr><td data-label="Request No.">' + esc(r.leave_request_number || '') + '</td>' +
        '<td data-label="Employee"><b>' + esc(empName(ctx, r.employee_id)) + '</b>' + (r.filed_by !== r.employee_id ? '<div class="muted">filed by ' + esc(empName(ctx, r.filed_by)) + '</div>' : '') + '</td>' +
        '<td data-label="Department">' + esc(empDept(ctx, r.employee_id)) + '</td>' +
        '<td data-label="Leave Type">' + esc(typeName(ctx, r.leave_type_id)) + '</td>' +
        '<td data-label="Dates">' + esc(rangeText(r.start_date, r.end_date)) + '</td>' +
        '<td data-label="Days">' + esc(num(r.requested_days)) + '</td>' +
        '<td data-label="Paid / Unpaid">' + esc(r.payment_type) + '</td>' +
        '<td data-label="Status">' + statusBadge(r.status, r.cancellation_status) + '</td>' +
        '<td data-label="HR Recommendation">' + (r.hr_recommendation ? esc(r.hr_recommendation) : '<span class="muted">—</span>') + '</td>' +
        '<td data-label="Date Filed">' + esc(fmtDate(manilaDate(r.submitted_at || r.created_at))) + '</td>' +
        '<td data-label="Action" class="full-row"><button type="button" class="btn small' + (needsHr ? '' : ' secondary') + '" data-open="' + r.id + '">' + (needsHr ? 'Review' : 'View') + '</button></td></tr>';
    }).join('') + '</tbody></table></div></div>';
  list.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => ctx.openDetail(b.dataset.open)));
}

// =====================================================================================
// Final Approver dashboard
// =====================================================================================
const ff = { search: '', department: 'all' };

export function renderFinal(ctx, root) {
  const all = (ctx.data.requests || []).filter((r) => r.status !== 'Draft');
  const today = ctx.today;
  const quick = QUICK(today);
  const queue = all.filter((r) => DECISION_STATUSES.includes(r.status) && r.employee_id !== ctx.me.employee_id)
    .sort((a, b) => String(a.submitted_at || a.created_at).localeCompare(String(b.submitted_at || b.created_at)));
  const cancels = all.filter(quick.cancel.test);
  const depts = Array.from(new Set(queue.map((r) => empDept(ctx, r.employee_id)).filter((d) => d !== '—'))).sort();
  const cutoff = addDays(today, -30);
  const decided = all.filter((r) => ['Approved', 'Rejected', 'Completed'].includes(r.status) && r.final_reviewed_at && manilaDate(r.final_reviewed_at) >= cutoff)
    .sort((a, b) => String(b.final_reviewed_at).localeCompare(String(a.final_reviewed_at)));
  const onLeave = all.filter(quick.on_leave.test);
  const soon = all.filter((r) => r.status === 'Approved' && r.start_date > today && r.start_date <= addDays(today, 14)).sort((a, b) => a.start_date.localeCompare(b.start_date));

  // by department: pending, approved this month, on leave now
  const byDept = {};
  const bump = (r, k) => { const d = empDept(ctx, r.employee_id); (byDept[d] = byDept[d] || { pending: 0, approved: 0, onLeave: 0 })[k]++; };
  queue.forEach((r) => bump(r, 'pending'));
  all.filter((r) => ['Approved', 'Completed'].includes(r.status) && r.start_date.slice(0, 7) === today.slice(0, 7)).forEach((r) => bump(r, 'approved'));
  onLeave.forEach((r) => bump(r, 'onLeave'));

  root.innerHTML =
    '<div class="tiles">' +
      '<div class="tile"><div class="num">' + queue.length + '</div><div class="lbl">Awaiting Final Decision</div></div>' +
      '<div class="tile"><div class="num">' + cancels.length + '</div><div class="lbl">Cancellation Requests</div></div>' +
      '<div class="tile"><div class="num">' + all.filter(quick.approved_today.test).length + '</div><div class="lbl">Approved Today</div></div>' +
      '<div class="tile"><div class="num">' + all.filter(quick.rejected_today.test).length + '</div><div class="lbl">Rejected Today</div></div>' +
      '<div class="tile"><div class="num">' + onLeave.length + '</div><div class="lbl">Currently on Leave</div></div>' +
      '<div class="tile"><div class="num">' + all.filter(quick.soon.test).length + '</div><div class="lbl">Going on Leave Soon</div><div class="muted" style="font-size:10px;">next 7 days</div></div>' +
    '</div>' +
    '<div class="card"><h4 class="lv-h">Awaiting Your Decision</h4>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px;">' +
        '<div class="field" style="min-width:180px;"><label>Search</label><input type="text" id="fa-search" placeholder="Name, request no., leave type…" value="' + esc(ff.search) + '"></div>' +
        '<div class="field"><label>Department</label><select id="fa-department"><option value="all">All</option>' + depts.map((d) => '<option' + (ff.department === d ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select></div>' +
        '<button type="button" class="btn small secondary" id="fa-clear">Clear Filters</button></div>' +
      '<div id="fa-queue"></div></div>' +
    (cancels.length ? '<div class="card"><h4 class="lv-h">Cancellation Requests</h4>' + simpleTable(ctx, cancels, true) + '</div>' : '') +
    '<div class="card"><h4 class="lv-h">Who Is on Leave</h4>' +
      '<div class="lv-two-col"><div><div class="muted" style="margin-bottom:4px;"><b>Today</b></div>' + peopleList(ctx, onLeave, 'No one is on approved leave today.') + '</div>' +
      '<div><div class="muted" style="margin-bottom:4px;"><b>Next 14 days</b></div>' + peopleList(ctx, soon, 'No approved leave starting in the next 14 days.') + '</div></div></div>' +
    '<div class="card"><h4 class="lv-h">By Department</h4>' + (Object.keys(byDept).length
      ? '<div class="table-scroll"><table><thead><tr><th>Department</th><th>Awaiting Decision</th><th>Approved Leave This Month</th><th>On Leave Now</th></tr></thead><tbody>' +
        Object.keys(byDept).sort().map((d) => '<tr><td data-label="Department">' + esc(d) + '</td><td data-label="Awaiting Decision">' + byDept[d].pending + '</td><td data-label="Approved Leave This Month">' + byDept[d].approved + '</td><td data-label="On Leave Now">' + byDept[d].onLeave + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p class="muted">Nothing to summarise yet.</p>') + '</div>' +
    '<div class="card"><h4 class="lv-h">Recent Decisions <span class="muted" style="text-transform:none;">— last 30 days</span></h4>' +
      (decided.length ? simpleTable(ctx, decided.slice(0, 50), false) : '<p class="muted">No decisions in the last 30 days.</p>') + '</div>';

  $('fa-search').addEventListener('input', (e) => { ff.search = e.target.value; renderQueue(ctx, queue); });
  $('fa-department').addEventListener('change', (e) => { ff.department = e.target.value; renderQueue(ctx, queue); });
  $('fa-clear').addEventListener('click', () => { ff.search = ''; ff.department = 'all'; $('fa-search').value = ''; $('fa-department').value = 'all'; renderQueue(ctx, queue); });
  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => ctx.openDetail(b.dataset.open)));
  renderQueue(ctx, queue);
}

function peopleList(ctx, rows, empty) {
  if (!rows.length) return '<p class="muted" style="margin:0;">' + esc(empty) + '</p>';
  return '<ul class="lv-people">' + rows.map((r) => '<li data-open="' + r.id + '"><b>' + esc(empName(ctx, r.employee_id)) + '</b> <span class="muted">' + esc(empDept(ctx, r.employee_id)) + '</span>' +
    '<div class="muted">' + esc(typeName(ctx, r.leave_type_id)) + ' · ' + esc(rangeText(r.start_date, r.end_date)) + '</div></li>').join('') + '</ul>';
}

function simpleTable(ctx, rows, cancellation) {
  return '<div class="table-scroll table-2col"><table><thead><tr><th>Request No.</th><th>Employee</th><th>Leave Type</th><th>Dates</th><th>Days</th><th>Status</th><th>' + (cancellation ? 'Cancellation Reason' : 'Decision') + '</th><th>Action</th></tr></thead><tbody>' +
    rows.map((r) => '<tr><td data-label="Request No.">' + esc(r.leave_request_number || '') + '</td><td data-label="Employee"><b>' + esc(empName(ctx, r.employee_id)) + '</b></td>' +
      '<td data-label="Leave Type">' + esc(typeName(ctx, r.leave_type_id)) + '</td><td data-label="Dates">' + esc(rangeText(r.start_date, r.end_date)) + '</td>' +
      '<td data-label="Days">' + esc(num(r.requested_days)) + '</td><td data-label="Status">' + statusBadge(r.status, r.cancellation_status) + '</td>' +
      '<td data-label="' + (cancellation ? 'Cancellation Reason' : 'Decision') + '">' + esc(clip(cancellation ? r.cancellation_reason : (r.status === 'Rejected' ? r.rejection_reason : r.final_approver_comments) || '—', 70)) +
        (cancellation ? '' : '<div class="muted">' + esc(fmtDate(manilaDate(r.final_reviewed_at))) + '</div>') + '</td>' +
      '<td data-label="Action" class="full-row"><button type="button" class="btn small secondary" data-open="' + r.id + '">View</button></td></tr>').join('') +
    '</tbody></table></div>';
}

function renderQueue(ctx, queue) {
  const q = ff.search.trim().toLowerCase();
  const rows = queue.filter((r) => (ff.department === 'all' || empDept(ctx, r.employee_id) === ff.department) &&
    (!q || (empName(ctx, r.employee_id) + ' ' + (r.leave_request_number || '') + ' ' + typeName(ctx, r.leave_type_id)).toLowerCase().includes(q)));
  const box = $('fa-queue');
  if (!rows.length) {
    box.innerHTML = emptyStateHtml({ message: queue.length ? 'No requests match these filters.' : 'Nothing is waiting for your decision.', hasFilters: queue.length > 0, clearId: 'fa-clear' });
    wireProxyButtons(box);
    return;
  }
  box.innerHTML = '<div class="table-scroll table-2col"><table><thead><tr><th>Request No.</th><th>Employee</th><th>Department</th><th>Leave Type</th><th>Dates</th><th>Days</th><th>Paid / Unpaid</th><th>Credits Available</th><th>HR Recommendation</th><th>HR Comments</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
    rows.map((r) => {
      const t = ctx.typeById[r.leave_type_id] || {};
      const avail = balanceOf(ctx, r.employee_id, r.leave_type_id);
      const short = r.payment_type === 'Paid' && t.requires_credit && Number(r.requested_days) > avail;
      return '<tr><td data-label="Request No.">' + esc(r.leave_request_number || '') + '</td>' +
        '<td data-label="Employee"><b>' + esc(empName(ctx, r.employee_id)) + '</b></td>' +
        '<td data-label="Department">' + esc(empDept(ctx, r.employee_id)) + '</td>' +
        '<td data-label="Leave Type">' + esc(t.name || '—') + '</td>' +
        '<td data-label="Dates">' + esc(rangeText(r.start_date, r.end_date)) + '</td>' +
        '<td data-label="Days">' + esc(num(r.requested_days)) + '</td>' +
        '<td data-label="Paid / Unpaid">' + esc(r.payment_type) + '</td>' +
        '<td data-label="Credits Available">' + (r.payment_type === 'Paid' && t.requires_credit ? '<span class="' + (short ? 'lv-neg' : '') + '">' + esc(num(avail)) + '</span>' : '<span class="muted">n/a</span>') + '</td>' +
        '<td data-label="HR Recommendation">' + (r.hr_recommendation ? esc(r.hr_recommendation) : '<span class="muted">Not yet reviewed</span>') + '</td>' +
        '<td data-label="HR Comments">' + (r.hr_comments ? esc(clip(r.hr_comments, 60)) : '<span class="muted">—</span>') + '</td>' +
        '<td data-label="Status">' + statusBadge(r.status, r.cancellation_status) + '</td>' +
        '<td data-label="Action" class="full-row"><div class="lv-row-actions">' +
          '<button type="button" class="btn small" data-act="final_approve" data-id="' + r.id + '">Approve</button>' +
          '<button type="button" class="btn small secondary" data-act="final_reject" data-id="' + r.id + '">Reject</button>' +
          '<button type="button" class="btn small secondary" data-open="' + r.id + '">View</button></div></td></tr>';
    }).join('') + '</tbody></table></div>';
  box.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => ctx.openDetail(b.dataset.open)));
  box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => ctx.openDetail(b.dataset.id, { action: b.dataset.act })));
}
