// Leave Management -- Leave Credits: every employee's balances, HR's manual adjustments and the
// immutable credit ledger. Anyone with view_all can read; only HR can change (the database
// refuses anyone else, and HR cannot change their own credits -- only the Final Approver can).
import { esc, fmtDate, fmtDateTime, manilaDate, num, daysText, errorsText, kv } from './leaveUi.js?v=20261007e';
import {
  activeFiltersHtml, emptyStateHtml, wireProxyButtons, sortControlHtml, wireSortControl, applySort, byText, byNumber,
} from './uiKit.js?v=20261007e';
import { openSide, closeSide, sideBody, confirmPanel } from './leaveSide.js?v=20261007e';

const $ = (id) => document.getElementById(id);
const cf = { search: '', department: 'all', show: 'all', sort: { field: 'name', dir: 'asc' } };
const SORT = [{ key: 'name', label: 'Employee' }, { key: 'remaining', label: 'Remaining Credits' }, { key: 'used', label: 'Credits Used' }, { key: 'department', label: 'Department' }];

// Which sign each transaction type applies (mirrors leave_adjust_credit)
const ADD_TYPES = ['Initial Credit', 'Annual Credit', 'Manual Credit', 'Carry Over'];
const SUBTRACT_TYPES = ['Manual Deduction', 'Expiration'];
const TXN_TYPES = [...ADD_TYPES, ...SUBTRACT_TYPES, 'Correction'];

function balanceMap(ctx) {
  const m = {};
  (ctx.data.balances || []).forEach((b) => { (m[b.employee_id] = m[b.employee_id] || {})[b.leave_type_id] = b; });
  return m;
}

export function renderCredits(ctx, root) {
  const bals = balanceMap(ctx);
  const creditTypes = ctx.types.filter((t) => t.active && t.requires_credit);
  // always the first three types (Vacation/Sick/Emergency); any other type only once someone holds credits in it
  const cols = creditTypes.filter((t, i) => i < 3 || (ctx.data.balances || []).some((b) => b.leave_type_id === t.id && Number(b.total_credits) > 0));
  const people = ctx.dir.filter((e) => e.status === 'Active').map((e) => {
    const mine = bals[e.employee_id] || {};
    let used = 0, remaining = 0, updated = '';
    creditTypes.forEach((t) => { const b = mine[t.id]; if (b) { used += Number(b.used_credits); remaining += Number(b.available_credits); if (b.updated_at > updated) updated = b.updated_at; } });
    const total = creditTypes.reduce((s, t) => s + (mine[t.id] ? Number(mine[t.id].total_credits) : 0), 0);
    return Object.assign({}, e, { name: e.full_name, used, remaining, total, updated, mine });
  });
  const depts = Array.from(new Set(people.map((p) => p.department).filter(Boolean))).sort();

  root.innerHTML =
    '<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">' +
      '<div class="field" style="min-width:180px;"><label>Search</label><input type="text" id="cr-search" placeholder="Employee name or ID…" value="' + esc(cf.search) + '"></div>' +
      '<div class="field"><label>Department</label><select id="cr-department"><option value="all">All</option>' + depts.map((d) => '<option' + (cf.department === d ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Show</label><select id="cr-show"><option value="all">Everyone</option><option value="has"' + (cf.show === 'has' ? ' selected' : '') + '>With credits</option><option value="none"' + (cf.show === 'none' ? ' selected' : '') + '>No credits yet</option></select></div>' +
      sortControlHtml(SORT, cf.sort, 'cr-sort', 'cr-sort-dir') +
      '<button type="button" class="btn small secondary" id="cr-clear">Clear Filters</button></div></div>' +
    '<div id="cr-active"></div><div id="cr-list"></div>' +
    (ctx.flags.hr ? '' : '<p class="muted">You can see everyone\'s credits and history. Only HR can change them.</p>');

  const draw = () => drawList(ctx, people, cols);
  $('cr-search').addEventListener('input', (e) => { cf.search = e.target.value; draw(); });
  $('cr-department').addEventListener('change', (e) => { cf.department = e.target.value; draw(); });
  $('cr-show').addEventListener('change', (e) => { cf.show = e.target.value; draw(); });
  $('cr-clear').addEventListener('click', () => {
    cf.search = ''; cf.department = 'all'; cf.show = 'all';
    $('cr-search').value = ''; $('cr-department').value = 'all'; $('cr-show').value = 'all'; draw();
  });
  wireSortControl('cr-sort', 'cr-sort-dir', cf.sort, draw);
  draw();
}

function drawList(ctx, people, cols) {
  const q = cf.search.trim().toLowerCase();
  let rows = people.filter((p) => (cf.department === 'all' || p.department === cf.department) &&
    (cf.show === 'all' || (cf.show === 'has' ? p.total > 0 : p.total === 0)) &&
    (!q || (p.full_name + ' ' + (p.employee_code || '')).toLowerCase().includes(q)));
  rows = applySort(rows, cf.sort, { name: byText('name'), department: byText('department'), remaining: byNumber('remaining'), used: byNumber('used') });
  $('cr-active').innerHTML = activeFiltersHtml([
    { label: 'Search', value: esc(cf.search.trim()) }, { label: 'Department', value: esc(cf.department) },
    { label: 'Show', value: cf.show === 'all' ? '' : (cf.show === 'has' ? 'With credits' : 'No credits yet') },
  ], 'cr-clear');
  wireProxyButtons($('cr-active'));
  const list = $('cr-list');
  if (!rows.length) {
    list.innerHTML = emptyStateHtml({ message: 'No employees match these filters.', hasFilters: true, clearId: 'cr-clear' });
    wireProxyButtons(list);
    return;
  }
  list.innerHTML = '<div class="card"><div class="muted" style="margin-bottom:8px;">Showing remaining credits per leave type. Hover a number for total and used.</div><div class="table-scroll table-2col"><table><thead><tr><th>Employee</th><th>Department</th>' +
    cols.map((t) => '<th>' + esc(t.name.replace(/ Leave$/, '')) + '</th>').join('') + '<th>Used</th><th>Remaining</th><th>Last Updated</th><th>Action</th></tr></thead><tbody>' +
    rows.map((p) => {
      const own = p.employee_id === ctx.me.employee_id;
      const canAdjust = ctx.flags.hr && (!own || ctx.flags.final);
      return '<tr><td data-label="Employee"><b>' + esc(p.full_name) + '</b><div class="muted">' + esc(p.employee_code || '') + '</div></td>' +
        '<td data-label="Department">' + esc(p.department || '—') + '</td>' +
        cols.map((t) => { const b = p.mine[t.id]; return '<td data-label="' + esc(t.name.replace(/ Leave$/, '')) + '" title="' + (b ? 'Total ' + num(b.total_credits) + ', used ' + num(b.used_credits) : 'No credits') + '">' + (b ? esc(num(b.available_credits)) : '0') + '</td>'; }).join('') +
        '<td data-label="Used">' + esc(num(p.used)) + '</td><td data-label="Remaining"><b>' + esc(num(p.remaining)) + '</b></td>' +
        '<td data-label="Last Updated">' + (p.updated ? esc(fmtDate(manilaDate(p.updated))) : '<span class="muted">—</span>') + '</td>' +
        '<td data-label="Action" class="full-row"><div class="lv-row-actions">' +
          (canAdjust ? '<button type="button" class="btn small" data-adjust="' + esc(p.employee_id) + '">Adjust Credits</button>' : '') +
          '<button type="button" class="btn small secondary" data-history="' + esc(p.employee_id) + '">History</button></div>' +
          (ctx.flags.hr && own && !ctx.flags.final ? '<div class="muted" style="margin-top:4px;">You cannot change your own credits.</div>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
  list.querySelectorAll('[data-adjust]').forEach((b) => b.addEventListener('click', () => openAdjust(ctx, b.dataset.adjust)));
  list.querySelectorAll('[data-history]').forEach((b) => b.addEventListener('click', () => openLedger(ctx, b.dataset.history)));
}

// ---------------- adjust ----------------
/** opts.txn pre-selects the transaction type ('Manual Credit' for "Add Credit", 'Correction' for "Adjust Credit"). */
export function openAdjust(ctx, employeeId, opts = {}) {
  const e = ctx.dirById[employeeId] || {};
  const types = ctx.types.filter((t) => t.active);
  const st = { typeId: types.length ? String(types[0].id) : '', txn: TXN_TYPES.includes(opts.txn) ? opts.txn : 'Manual Credit', sign: 'add', amount: '', date: ctx.today, reason: '', notes: '' };
  const bal = () => {
    const b = (ctx.data.balances || []).find((x) => x.employee_id === employeeId && x.leave_type_id === Number(st.typeId));
    return b ? Number(b.available_credits) : 0;
  };
  const signed = () => {
    const a = Math.abs(Number(st.amount) || 0);
    if (SUBTRACT_TYPES.includes(st.txn)) return -a;
    if (st.txn === 'Correction') return st.sign === 'deduct' ? -a : a;
    return a;
  };
  openSide({
    title: 'Adjust Leave Credits', sub: e.full_name || '',
    body: '<div id="lv-side-msg"></div><div class="drawer-section"><h4>Employee</h4>' + kv('Name', esc(e.full_name || '—')) + kv('Department', esc(e.department || '—')) + '</div>' +
      '<div class="drawer-section"><h4>Change</h4><div class="lv-grid">' +
        '<div class="field"><label>Leave Type *</label><select id="adj-type">' + types.map((t) => '<option value="' + t.id + '">' + esc(t.name) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Transaction Type *</label><select id="adj-txn">' + TXN_TYPES.map((t) => '<option' + (t === st.txn ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></div>' +
        '<div class="field" id="adj-sign-wrap" hidden><label>Correction Direction *</label><select id="adj-sign"><option value="add">Add credits</option><option value="deduct">Deduct credits</option></select></div>' +
        '<div class="field"><label>Number of Days *</label><input type="number" id="adj-amount" min="0" step="0.5" inputmode="decimal"></div>' +
        '<div class="field"><label>Effective Date *</label><input type="date" id="adj-date" value="' + esc(st.date) + '"></div></div>' +
      '<div class="field" style="margin-top:8px;"><label>Reason *</label><textarea id="adj-reason" rows="2" placeholder="Why are you changing these credits?"></textarea></div>' +
      '<div class="field" style="margin-top:8px;"><label>Notes (optional — the employee can see these in their credit history)</label><textarea id="adj-notes" rows="2"></textarea></div></div>' +
      '<div class="drawer-section"><h4>Result</h4><div id="adj-preview"></div></div>',
    footer: '<button type="button" class="btn" id="adj-apply">Apply Change</button><button type="button" class="btn secondary" id="adj-cancel">Cancel</button>',
  });
  const type = () => ctx.typeById[Number(st.typeId)] || {};
  const preview = () => {
    const s = signed(), prev = bal(), next = prev + s;
    $('adj-preview').innerHTML = kv('Current balance (' + esc(type().name || '') + ')', esc(daysText(prev))) +
      kv('This change', esc((s >= 0 ? '+' : '') + num(s) + (Math.abs(s) === 1 ? ' day' : ' days'))) +
      kv('Balance after', '<span class="' + (next < 0 ? 'lv-neg' : '') + '">' + esc(daysText(next)) + '</span>') +
      (type().requires_credit === false ? '<p class="muted" style="margin:6px 0 0;">This leave type does not use credits, so a balance has no effect on filing.</p>' : '');
  };
  $('adj-type').addEventListener('change', (ev) => { st.typeId = ev.target.value; preview(); });
  $('adj-txn').addEventListener('change', (ev) => { st.txn = ev.target.value; $('adj-sign-wrap').hidden = st.txn !== 'Correction'; preview(); });
  $('adj-sign').addEventListener('change', (ev) => { st.sign = ev.target.value; preview(); });
  $('adj-amount').addEventListener('input', (ev) => { st.amount = ev.target.value; preview(); });
  $('adj-date').addEventListener('change', (ev) => { st.date = ev.target.value; });
  $('adj-reason').addEventListener('input', (ev) => { st.reason = ev.target.value; });
  $('adj-notes').addEventListener('input', (ev) => { st.notes = ev.target.value; });
  $('adj-cancel').addEventListener('click', closeSide);
  $('adj-sign-wrap').hidden = st.txn !== 'Correction';
  preview();
  $('adj-apply').addEventListener('click', () => {
    const slot = $('lv-side-msg');
    slot.innerHTML = '';
    const s = signed();
    const problems = [];
    if (!st.typeId) problems.push('Choose a leave type.');
    if (!s) problems.push('Enter the number of days (it cannot be zero).');
    if (!st.date) problems.push('Choose an effective date.');
    if (!st.reason.trim()) problems.push('A reason is required for every credit change.');
    if (bal() + s < 0) problems.push('That would take the balance below zero.');
    if (problems.length) { slot.innerHTML = '<div class="msg error">' + esc(problems.join(' ')) + '</div>'; sideBody().scrollTop = 0; return; }
    confirmPanel({
      title: 'Confirm credit change',
      message: esc((e.full_name || 'This employee') + ': ' + st.txn + ' — ' + (s >= 0 ? 'add ' : 'deduct ') + daysText(Math.abs(s)) + ' of ' + (type().name || 'leave') + '. New balance: ' + num(bal() + s) + ' days. This is recorded permanently in the credit history.'),
      okLabel: 'Confirm Change',
      onOk: async () => {
        const res = await ctx.api.adjustCredit({
          employeeId, leaveTypeId: Number(st.typeId), transactionType: st.txn, amount: st.txn === 'Correction' ? s : Math.abs(s),
          reason: st.reason.trim(), effectiveDate: st.date, notes: st.notes.trim() || null,
        });
        if (res && res.ok === false) throw new Error(errorsText(res));
        ctx.toast('Leave credits updated.', false);
        closeSide();
        await ctx.refresh();
      },
    });
  });
}

// ---------------- ledger ----------------
export async function openLedger(ctx, employeeId) {
  const e = ctx.dirById[employeeId] || {};
  openSide({ title: 'Leave Credit History', sub: e.full_name || '', body: '<p class="muted">Loading…</p>' });
  try {
    const rows = await ctx.api.listLedger(employeeId, 300);
    sideBody().innerHTML = !rows.length ? '<p class="muted">No credit changes recorded yet.</p>' :
      '<p class="muted" style="margin-top:0;">Every credit change is permanent — entries cannot be edited or deleted.</p>' +
      '<div class="table-scroll table-2col"><table><thead><tr><th>Date</th><th>Leave Type</th><th>Transaction</th><th>Change</th><th>Balance</th><th>Reason</th><th>By</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><td data-label="Date">' + esc(fmtDate(r.effective_date)) + '<div class="muted">' + esc(fmtDateTime(r.created_at)) + '</div></td>' +
        '<td data-label="Leave Type">' + esc((ctx.typeById[r.leave_type_id] || {}).name || '—') + '</td>' +
        '<td data-label="Transaction">' + esc(r.transaction_type) + '</td>' +
        '<td data-label="Change"><b class="' + (Number(r.amount) < 0 ? 'lv-neg' : 'lv-pos') + '">' + (Number(r.amount) > 0 ? '+' : '') + esc(num(r.amount)) + '</b></td>' +
        '<td data-label="Balance">' + esc(num(r.previous_balance)) + ' → ' + esc(num(r.new_balance)) + '</td>' +
        '<td data-label="Reason" class="full-row">' + esc(r.reason) + (r.notes ? '<div class="muted">' + esc(r.notes) + '</div>' : '') + '</td>' +
        '<td data-label="By">' + esc(r.created_by ? ((ctx.dirById[r.created_by] || {}).full_name || 'HR') : 'System') + '</td></tr>').join('') + '</tbody></table></div>';
  } catch (err) {
    sideBody().innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>';
  }
}
