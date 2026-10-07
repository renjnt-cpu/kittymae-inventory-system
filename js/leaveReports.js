// Leave Management -- Reports (spec section 23). HR / Final Approver / Auditor only: the tab is not
// even shown to anyone else, and the data it reads is the same all-employees data the database
// already limits to those roles. Ten reports, the filters the spec lists, and CSV / Excel / PDF export.
import { esc, fmtDate, num, daysText, addDays, manilaDate, yearOf, OPEN_STATUSES } from './leaveUi.js?v=20261007i';
import { exportCsv, exportXlsx, exportPdf } from './leaveExport.js?v=20261007i';

const $ = (id) => document.getElementById(id);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DONE = ['Approved', 'Completed'];
const SHOW_LIMIT = 500;

const col = (key, label, type) => ({ key, label, type: type || 'text' });
const C = {
  number: col('number', 'Request No.'), employee: col('employee', 'Employee'), dept: col('dept', 'Department'), type: col('type', 'Leave Type'),
  from: col('from', 'From', 'date'), to: col('to', 'To', 'date'), days: col('days', 'Days', 'number'), payment: col('payment', 'Paid / Unpaid'), status: col('status', 'Status'),
};
const requestColumns = [C.number, C.employee, C.dept, C.type, C.from, C.to, C.days, C.payment, C.status];

// What each report is, and which of the spec's filters make sense for it.
const REPORTS = [
  { id: 'usage', title: 'Leave Usage Report', desc: 'Every approved or completed leave: who, when, how many days.', uses: ['employee', 'department', 'type', 'status', 'year', 'month', 'range'] },
  { id: 'balances', title: 'Employee Leave Balance Report', desc: 'Credits granted, used and remaining for each employee and leave type.', uses: ['employee', 'department', 'type'] },
  { id: 'department', title: 'Department Leave Report', desc: 'Requests and leave days per department.', uses: ['department', 'type', 'year', 'month', 'range'] },
  { id: 'paid', title: 'Paid Leave Report', desc: 'Approved paid leave, with the credits it used.', uses: ['employee', 'department', 'type', 'year', 'month', 'range'] },
  { id: 'unpaid', title: 'Unpaid Leave Report', desc: 'Approved unpaid leave.', uses: ['employee', 'department', 'type', 'year', 'month', 'range'] },
  { id: 'type', title: 'Leave Type Report', desc: 'Requests and days for each kind of leave.', uses: ['employee', 'department', 'type', 'year', 'month', 'range'] },
  { id: 'monthly', title: 'Monthly Leave Report', desc: 'Month-by-month totals for one year (by the month leave starts).', uses: ['employee', 'department', 'type', 'year'] },
  { id: 'annual', title: 'Annual Leave Report', desc: 'One year per employee: requests, days taken and credits left.', uses: ['employee', 'department', 'type', 'year'] },
  { id: 'current', title: 'Employees Currently on Leave', desc: 'Everyone on approved leave today.', uses: ['employee', 'department', 'type'] },
  { id: 'upcoming', title: 'Upcoming Leave Report', desc: 'Approved leave that has not started yet, soonest first.', uses: ['employee', 'department', 'type', 'range'] },
];
const rf = { report: 'usage', employee: 'all', department: 'all', type: 'all', status: 'all', year: 'all', month: 'all', from: '', to: '' };

function dataset(ctx) {
  return ctx.data.requests.filter((r) => r.status !== 'Draft').map((r) => {
    const e = ctx.dirById[r.employee_id] || {};
    return Object.assign({}, r, { _emp: e.full_name || '—', _dept: e.department || '—', _type: (ctx.typeById[r.leave_type_id] || {}).name || '—' });
  });
}
function applyFilters(rows, f) {
  return rows.filter((r) => (f.employee === 'all' || r.employee_id === f.employee) && (f.department === 'all' || r._dept === f.department) &&
    (f.type === 'all' || String(r.leave_type_id) === f.type) && (f.year === 'all' || String(yearOf(r.start_date)) === String(f.year)) &&
    (f.month === 'all' || Number(r.start_date.slice(5, 7)) === Number(f.month)) && (!f.from || r.end_date >= f.from) && (!f.to || r.start_date <= f.to));
}
const toReqRow = (r) => ({ number: r.leave_request_number || '', employee: r._emp, dept: r._dept, type: r._type, from: r.start_date, to: r.end_date, days: Number(r.requested_days), payment: r.payment_type, status: r.status });
const sum = (rows, fn) => Math.round(rows.reduce((s, r) => s + fn(r), 0) * 100) / 100;
const byStart = (dir) => (a, b) => dir * String(a.start_date).localeCompare(String(b.start_date));

function build(ctx, f) {
  const all = dataset(ctx);
  const today = ctx.today;
  const year = f.year === 'all' ? String(yearOf(today)) : String(f.year);
  switch (f.report) {
    case 'usage': {
      const rows = applyFilters(all, f).filter((r) => (f.status === 'all' ? DONE.includes(r.status) : r.status === f.status)).sort(byStart(-1));
      return { columns: requestColumns, rows: rows.map(toReqRow) };
    }
    case 'paid': case 'unpaid': {
      const want = f.report === 'paid' ? 'Paid' : 'Unpaid';
      const rows = applyFilters(all, f).filter((r) => DONE.includes(r.status) && r.payment_type === want).sort(byStart(-1));
      const cols = f.report === 'paid' ? [...requestColumns, col('deducted', 'Credits Deducted', 'number')] : requestColumns;
      return { columns: cols, rows: rows.map((r) => Object.assign(toReqRow(r), { deducted: Number(r.deducted_credits || 0) })) };
    }
    case 'balances': {
      const types = ctx.typeById;
      const rows = (ctx.data.balances || []).map((b) => {
        const e = ctx.dirById[b.employee_id] || {};
        return { employee_id: b.employee_id, leave_type_id: b.leave_type_id, employee: e.full_name || '—', dept: e.department || '—', type: (types[b.leave_type_id] || {}).name || '—',
          total: Number(b.total_credits), used: Number(b.used_credits), remaining: Number(b.available_credits), updated: manilaDate(b.updated_at) };
      }).filter((r) => (f.employee === 'all' || r.employee_id === f.employee) && (f.department === 'all' || r.dept === f.department) && (f.type === 'all' || String(r.leave_type_id) === f.type))
        .sort((a, b) => a.employee.localeCompare(b.employee) || a.type.localeCompare(b.type));
      return { columns: [C.employee, C.dept, C.type, col('total', 'Total Credits', 'number'), col('used', 'Used', 'number'), col('remaining', 'Remaining', 'number'), col('updated', 'Last Updated', 'date')], rows };
    }
    case 'department': {
      const rows = applyFilters(all, f);
      const names = new Set([...rows.map((r) => r._dept), ...ctx.dir.filter((e) => e.status === 'Active' && e.department).map((e) => e.department)]);
      const out = Array.from(names).filter((d) => f.department === 'all' || d === f.department).sort().map((d) => {
        const mine = rows.filter((r) => r._dept === d), done = mine.filter((r) => DONE.includes(r.status));
        return { dept: d, employees: ctx.dir.filter((e) => e.status === 'Active' && e.department === d).length, requests: mine.length, approved: done.length,
          pending: mine.filter((r) => OPEN_STATUSES.includes(r.status)).length, rejected: mine.filter((r) => r.status === 'Rejected').length, cancelled: mine.filter((r) => r.status === 'Cancelled').length,
          days: sum(done, (r) => Number(r.requested_days)), paidDays: sum(done.filter((r) => r.payment_type === 'Paid'), (r) => Number(r.requested_days)), unpaidDays: sum(done.filter((r) => r.payment_type === 'Unpaid'), (r) => Number(r.requested_days)) };
      });
      return { columns: [C.dept, col('employees', 'Employees', 'number'), col('requests', 'Requests', 'number'), col('approved', 'Approved', 'number'), col('pending', 'Pending', 'number'), col('rejected', 'Rejected', 'number'), col('cancelled', 'Cancelled', 'number'), col('days', 'Approved Days', 'number'), col('paidDays', 'Paid Days', 'number'), col('unpaidDays', 'Unpaid Days', 'number')], rows: out };
    }
    case 'type': {
      const rows = applyFilters(all, f);
      const out = ctx.types.filter((t) => f.type === 'all' || String(t.id) === f.type).map((t) => {
        const mine = rows.filter((r) => r.leave_type_id === t.id), done = mine.filter((r) => DONE.includes(r.status));
        return { type: t.name, requests: mine.length, approved: done.length, pending: mine.filter((r) => OPEN_STATUSES.includes(r.status)).length, rejected: mine.filter((r) => r.status === 'Rejected').length,
          cancelled: mine.filter((r) => r.status === 'Cancelled').length, days: sum(done, (r) => Number(r.requested_days)), paidDays: sum(done.filter((r) => r.payment_type === 'Paid'), (r) => Number(r.requested_days)), unpaidDays: sum(done.filter((r) => r.payment_type === 'Unpaid'), (r) => Number(r.requested_days)) };
      });
      return { columns: [C.type, col('requests', 'Requests', 'number'), col('approved', 'Approved', 'number'), col('pending', 'Pending', 'number'), col('rejected', 'Rejected', 'number'), col('cancelled', 'Cancelled', 'number'), col('days', 'Approved Days', 'number'), col('paidDays', 'Paid Days', 'number'), col('unpaidDays', 'Unpaid Days', 'number')], rows: out };
    }
    case 'monthly': {
      const rows = applyFilters(all, Object.assign({}, f, { year, month: 'all' }));
      const out = MONTHS.map((m, i) => {
        const mine = rows.filter((r) => Number(r.start_date.slice(5, 7)) === i + 1), done = mine.filter((r) => DONE.includes(r.status));
        return { month: m + ' ' + year, requests: mine.length, approved: done.length, pending: mine.filter((r) => OPEN_STATUSES.includes(r.status)).length, rejected: mine.filter((r) => r.status === 'Rejected').length,
          cancelled: mine.filter((r) => r.status === 'Cancelled').length, days: sum(done, (r) => Number(r.requested_days)), paidDays: sum(done.filter((r) => r.payment_type === 'Paid'), (r) => Number(r.requested_days)), unpaidDays: sum(done.filter((r) => r.payment_type === 'Unpaid'), (r) => Number(r.requested_days)) };
      });
      return { columns: [col('month', 'Month'), col('requests', 'Requests', 'number'), col('approved', 'Approved', 'number'), col('pending', 'Pending', 'number'), col('rejected', 'Rejected', 'number'), col('cancelled', 'Cancelled', 'number'), col('days', 'Approved Days', 'number'), col('paidDays', 'Paid Days', 'number'), col('unpaidDays', 'Unpaid Days', 'number')], rows: out, title: 'Monthly Leave Report — ' + year };
    }
    case 'annual': {
      const rows = applyFilters(all, Object.assign({}, f, { year, month: 'all' }));
      const people = new Map();
      rows.forEach((r) => people.set(r.employee_id, { employee: r._emp, dept: r._dept }));
      const out = Array.from(people.entries()).map(([id, p]) => {
        const mine = rows.filter((r) => r.employee_id === id), done = mine.filter((r) => DONE.includes(r.status));
        const left = (ctx.data.balances || []).filter((b) => b.employee_id === id && (ctx.typeById[b.leave_type_id] || {}).requires_credit && (f.type === 'all' || String(b.leave_type_id) === f.type)).reduce((s, b) => s + Number(b.available_credits), 0);
        return { employee: p.employee, dept: p.dept, requests: mine.length, days: sum(done, (r) => Number(r.requested_days)), paidDays: sum(done.filter((r) => r.payment_type === 'Paid'), (r) => Number(r.requested_days)),
          unpaidDays: sum(done.filter((r) => r.payment_type === 'Unpaid'), (r) => Number(r.requested_days)), remaining: left };
      }).sort((a, b) => a.employee.localeCompare(b.employee));
      return { columns: [C.employee, C.dept, col('requests', 'Requests', 'number'), col('days', 'Approved Days', 'number'), col('paidDays', 'Paid Days', 'number'), col('unpaidDays', 'Unpaid Days', 'number'), col('remaining', 'Credits Remaining Now', 'number')], rows: out, title: 'Annual Leave Report — ' + year };
    }
    case 'current': {
      const rows = applyFilters(all, f).filter((r) => r.status === 'Approved' && r.start_date <= today && r.end_date >= today).sort(byStart(1));
      return { columns: [C.employee, C.dept, C.type, C.from, C.to, C.days, col('back', 'Back On', 'date'), C.number], rows: rows.map((r) => ({ employee: r._emp, dept: r._dept, type: r._type, from: r.start_date, to: r.end_date, days: Number(r.requested_days), back: addDays(r.end_date, 1), number: r.leave_request_number || '' })) };
    }
    case 'upcoming': {
      const rows = applyFilters(all, f).filter((r) => r.status === 'Approved' && r.start_date > today).sort(byStart(1));
      return { columns: [C.employee, C.dept, C.type, C.from, C.to, C.days, C.payment, C.number], rows: rows.map((r) => ({ employee: r._emp, dept: r._dept, type: r._type, from: r.start_date, to: r.end_date, days: Number(r.requested_days), payment: r.payment_type, number: r.leave_request_number || '' })) };
    }
    default: return { columns: [], rows: [] };
  }
}

export function renderReports(ctx, root) {
  const emps = Array.from(new Set(ctx.dir.map((e) => e.employee_id))).map((id) => ctx.dirById[id]).filter(Boolean).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  const depts = Array.from(new Set(ctx.dir.map((e) => e.department).filter(Boolean))).sort();
  const years = Array.from(new Set([yearOf(ctx.today), ...ctx.data.requests.map((r) => yearOf(r.start_date))])).sort((a, b) => b - a);
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
  const field = (key, label, html) => '<div class="field" data-use="' + key + '"><label>' + label + '</label>' + html + '</div>';

  root.innerHTML = '<div class="card"><h4 class="lv-h">Report</h4>' +
    '<div class="field" style="max-width:420px;"><label>Choose a report</label><select id="rp-report">' + REPORTS.map((r) => opt(r.id, r.title, rf.report)).join('') + '</select></div>' +
    '<p class="muted" id="rp-desc" style="margin:6px 0 10px;"></p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">' +
      field('employee', 'Employee', '<select id="rp-employee"><option value="all">All</option>' + emps.map((e) => opt(e.employee_id, e.full_name, rf.employee)).join('') + '</select>') +
      field('department', 'Department', '<select id="rp-department"><option value="all">All</option>' + depts.map((d) => opt(d, d, rf.department)).join('') + '</select>') +
      field('type', 'Leave Type', '<select id="rp-type"><option value="all">All</option>' + ctx.types.map((t) => opt(t.id, t.name, rf.type)).join('') + '</select>') +
      field('status', 'Status', '<select id="rp-status"><option value="all">Approved &amp; Completed</option>' + ['Approved', 'Completed', 'Pending HR Review', 'Pending Final Approval', 'Rejected', 'Cancelled'].map((s) => opt(s, s, rf.status)).join('') + '</select>') +
      field('year', 'Year', '<select id="rp-year"><option value="all">All</option>' + years.map((y) => opt(y, y, rf.year)).join('') + '</select>') +
      field('month', 'Month', '<select id="rp-month"><option value="all">All</option>' + MONTHS.map((m, i) => opt(i + 1, m, rf.month)).join('') + '</select>') +
      field('range', 'From', '<input type="date" id="rp-from" value="' + esc(rf.from) + '">') + field('range', 'To', '<input type="date" id="rp-to" value="' + esc(rf.to) + '">') +
      '<button type="button" class="btn small secondary" id="rp-clear">Clear Filters</button></div></div>' +
    '<div id="rp-out"></div>';

  const read = (id, key) => $(id).addEventListener('change', (e) => { rf[key] = e.target.value; draw(); });
  $('rp-report').addEventListener('change', (e) => { rf.report = e.target.value; draw(); });
  read('rp-employee', 'employee'); read('rp-department', 'department'); read('rp-type', 'type'); read('rp-status', 'status');
  read('rp-year', 'year'); read('rp-month', 'month'); read('rp-from', 'from'); read('rp-to', 'to');
  $('rp-clear').addEventListener('click', () => {
    Object.assign(rf, { employee: 'all', department: 'all', type: 'all', status: 'all', year: 'all', month: 'all', from: '', to: '' });
    renderReports(ctx, root);
  });

  function appliedFilters(def) {
    const out = [];
    if (def.uses.includes('employee') && rf.employee !== 'all') out.push('Employee: ' + ((ctx.dirById[rf.employee] || {}).full_name || ''));
    if (def.uses.includes('department') && rf.department !== 'all') out.push('Department: ' + rf.department);
    if (def.uses.includes('type') && rf.type !== 'all') out.push('Leave type: ' + ((ctx.typeById[Number(rf.type)] || {}).name || ''));
    if (def.uses.includes('status') && rf.status !== 'all') out.push('Status: ' + rf.status);
    if (def.uses.includes('year') && rf.year !== 'all') out.push('Year: ' + rf.year);
    if (def.uses.includes('month') && rf.month !== 'all') out.push('Month: ' + MONTHS[Number(rf.month) - 1]);
    if (def.uses.includes('range') && (rf.from || rf.to)) out.push('Dates: ' + (rf.from ? fmtDate(rf.from) : 'start') + ' to ' + (rf.to ? fmtDate(rf.to) : 'end'));
    return out;
  }

  function draw() {
    const def = REPORTS.find((r) => r.id === rf.report);
    $('rp-desc').textContent = def.desc;
    root.querySelectorAll('[data-use]').forEach((el) => { el.hidden = !def.uses.includes(el.dataset.use); });
    const { columns, rows, title } = build(ctx, rf);
    const reportTitle = title || def.title;
    const filters = appliedFilters(def);
    const dayCol = columns.find((c) => c.key === 'days');
    const stamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
    const fileBase = reportTitle.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '_' + ctx.today;
    const clipped = rows.length > SHOW_LIMIT;
    const incomplete = ctx.data.requests.length >= 3000;

    $('rp-out').innerHTML = '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px;">' +
        '<div><h3 style="margin:0;">' + esc(reportTitle) + '</h3><div class="muted">' + rows.length + ' row' + (rows.length === 1 ? '' : 's') +
          (dayCol ? ' · ' + esc(daysText(rows.reduce((s, r) => s + Number(r.days || 0), 0))) + ' total' : '') + (filters.length ? ' · ' + esc(filters.join(' · ')) : '') + '</div></div>' +
        '<div class="lv-row-actions"><button type="button" class="btn small" data-export="csv"' + (rows.length ? '' : ' disabled') + '>Download CSV</button>' +
          '<button type="button" class="btn small" data-export="xlsx"' + (rows.length ? '' : ' disabled') + '>Download Excel</button>' +
          '<button type="button" class="btn small" data-export="pdf"' + (rows.length ? '' : ' disabled') + '>Download PDF</button></div></div>' +
      (incomplete ? '<div class="msg lv-warn">This system holds a very large number of requests, so this report may not include the oldest ones.</div>' : '') +
      (rows.length ? '<div class="table-scroll table-2col"><table><thead><tr>' + columns.map((c) => '<th' + (c.type === 'number' ? ' style="text-align:right;"' : '') + '>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.slice(0, SHOW_LIMIT).map((r) => '<tr>' + columns.map((c) => {
          const v = r[c.key];
          const text = v === null || v === undefined || v === '' ? '—' : c.type === 'date' ? fmtDate(v) : c.type === 'number' ? num(v) : v;
          return '<td data-label="' + esc(c.label) + '"' + (c.type === 'number' ? ' style="text-align:right;"' : '') + '>' + esc(text) + '</td>';
        }).join('') + '</tr>').join('') + '</tbody></table></div>' +
        (clipped ? '<p class="muted" style="margin:8px 0 0;">Showing the first ' + SHOW_LIMIT + ' of ' + rows.length + ' rows. The downloads include every row.</p>' : '')
        : '<div class="empty-state"><div class="empty-state-msg">No records match this report and these filters.</div></div>') + '</div>';

    $('rp-out').querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', async () => {
      const kind = b.dataset.export, label = b.textContent;
      b.disabled = true; b.textContent = 'Preparing…';
      try {
        const about = [{ k: 'Report', v: reportTitle }, { k: 'Rows', v: rows.length }, { k: 'Filters', v: filters.join('; ') || 'None' }, { k: 'Generated', v: stamp + ' (Manila)' }, { k: 'Generated by', v: ctx.me.full_name }];
        if (kind === 'csv') exportCsv(fileBase, columns, rows);
        else if (kind === 'xlsx') await exportXlsx(fileBase, reportTitle, columns, rows, about);
        else await exportPdf(fileBase, reportTitle, [filters.length ? filters.join('  |  ') : 'No filters', 'Generated ' + stamp + ' by ' + ctx.me.full_name + '  |  ' + rows.length + ' row(s)'], columns, rows);
        ctx.toast(label.replace('Download ', '') + ' file downloaded.', false);
      } catch (err) { ctx.toast(err.message || String(err), true); }
      b.disabled = false; b.textContent = label;
    }));
  }
  draw();
}
