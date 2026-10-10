// Assets & Supplies Custodian -- the Employee Accountability tab: who holds company property, who has not confirmed receipt, who has left and
// still holds something, and each person's full record (what they hold now, everything they have held, reports against it). The employee
// record itself is never copied or changed here -- names, branches, departments and employment status are read from the HR 201 File.
import { esc, plural, branchChip, dt, statusBadge, conditionBadge, flowBadge, tagBadge, openDrawer, kv, emptyBox, field, opts, setDetailHandlers } from './assetsUi.js?v=20261011a';
import { peopleRows } from './assetsLogic.js?v=20261011a';
import { exportPeople } from './assetsReports.js?v=20261011a';
import { exportMenu, pagerHtml } from './assetsList.js?v=20261011a';

const $ = (id) => document.getElementById(id);
export const newPeopleState = () => ({ view: 'holding', q: '', branch: '', page: 1, pageSize: 50 });
const VIEWS = [{ id: 'holding', label: 'Holding company property' }, { id: 'left', label: 'Left but still holding' }, { id: 'unack', label: 'Not yet confirmed' }, { id: 'all', label: 'Everyone with a record' }];

export function visiblePeople(ctx) {
  const t = ctx.ui.people, s = t.q.trim().toLowerCase();
  return peopleRows(ctx).filter((r) => ({ holding: r.outstanding > 0, left: r.left && r.outstanding > 0, unack: r.unacknowledged > 0, all: true }[t.view]) && (!t.branch || String(r.branch_id) === String(t.branch)) &&
    (!s || [r.name, r.person.position, r.person.job_title, r.department, r.person.employee_code].join(' ').toLowerCase().includes(s)));
}

export function renderPeople(ctx, panel) {
  const t = ctx.ui.people, all = peopleRows(ctx), rows = visiblePeople(ctx);
  const left = all.filter((r) => r.left && r.outstanding > 0);
  const pages = Math.max(1, Math.ceil(rows.length / t.pageSize)); if (t.page > pages) t.page = pages;
  const pageRows = rows.slice((t.page - 1) * t.pageSize, t.page * t.pageSize);
  const tr = (r) => '<tr data-row="' + r.id + '"><td data-label="Employee" class="full-row"><button type="button" class="bl-link" data-emp="' + r.id + '">' + esc(r.name) + '</button> ' + (r.left ? tagBadge('Left', 'ac-tag-bad') : '') +
    '<div class="muted bl-sub">' + esc([r.person.job_title || r.person.position, r.department].filter(Boolean).join(' · ')) + '</div></td>' +
    '<td data-label="Branch">' + branchChip(ctx, r.branch_id) + '</td><td data-label="Holds now">' + (r.outstanding ? '<b>' + r.outstanding + '</b><div class="muted bl-sub">' + esc(r.holding.slice(0, 3).map((a) => a.name).join(', ')) + (r.holding.length > 3 ? '…' : '') + '</div>' : '<span class="muted">—</span>') + '</td>' +
    '<td data-label="Not confirmed">' + (r.unacknowledged ? '<b class="lv-neg">' + r.unacknowledged + '</b>' : '—') + '</td><td data-label="Returned">' + (r.returned || '—') + '</td><td data-label="Transferred">' + (r.transferred || '—') + '</td>' +
    '<td data-label="Damaged">' + (r.damaged ? '<b class="lv-neg">' + r.damaged + '</b>' : '—') + '</td><td data-label="Lost / missing">' + (r.lost ? '<b class="lv-neg">' + r.lost + '</b>' : '—') + '</td></tr>';
  panel.innerHTML = '<div id="ac-ppl">' +
    (left.length ? '<div class="msg error"><b>' + plural(left.length, 'former employee') + ' still hold' + (left.length === 1 ? 's' : '') + ' company property:</b> ' + left.slice(0, 6).map((r) => '<button type="button" class="bl-link" data-emp="' + r.id + '">' + esc(r.name) + '</button> (' + r.outstanding + ')').join(', ') + (left.length > 6 ? '…' : '') + '. Receive the items back or transfer them — nothing is deleted.</div>' : '') +
    '<div class="bl-views" role="group" aria-label="Views">' + VIEWS.map((v) => '<button type="button" class="bl-chip' + (v.id === t.view ? ' bl-chip-on' : '') + '" data-view="' + v.id + '">' + esc(v.label) + '</button>').join('') + '</div>' +
    '<div class="card bl-toolbar"><div class="bl-toolrow"><div class="field bl-grow"><label>Search</label><input type="search" id="ac-ppl-q" placeholder="Name, position, department…" value="' + esc(t.q) + '"></div>' +
      field('Branch', '<select id="ac-ppl-branch">' + opts(ctx.branches.map((b) => ({ value: b.id, label: b.name })), t.branch, 'All branches') + '</select>') + '<div class="field"><label>&nbsp;</label>' + (ctx.caps.canExport || ctx.caps.reports ? exportMenu() : '') + '</div></div></div>' +
    '<div class="bl-summary"><b>' + plural(rows.length, 'person', 'people') + '</b><span>Holding <b>' + rows.reduce((s, r) => s + r.outstanding, 0) + '</b> items</span></div>' +
    (rows.length ? '<div class="table-scroll table-2col bl-tablewrap"><table class="bl-table"><thead><tr><th>Employee</th><th>Branch</th><th>Holds now</th><th>Not confirmed</th><th>Returned</th><th>Transferred</th><th>Damaged</th><th>Lost / missing</th></tr></thead><tbody>' + pageRows.map(tr).join('') + '</tbody></table></div>' + pagerHtml(t, rows.length, pages, 'ac-ppl') :
      emptyBox('Nobody matches. ' + (t.view !== 'all' ? 'Try “Everyone with a record”.' : ''))) + '</div>';
  const root = $('ac-ppl');
  root.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => { t.view = el.dataset.view; t.page = 1; ctx.rerender(); }));
  let st = null;
  $('ac-ppl-q').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { t.q = e.target.value; t.page = 1; ctx.rerender(); const s = $('ac-ppl-q'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 300); });
  $('ac-ppl-branch').addEventListener('change', (e) => { t.branch = e.target.value; t.page = 1; ctx.rerender(); });
  root.querySelectorAll('[data-emp]').forEach((el) => el.addEventListener('click', () => ctx.openEmployee(el.dataset.emp)));
  root.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => { t.page = Math.max(1, Math.min(pages, t.page + Number(el.dataset.page))); ctx.rerender(); }));
  if ($('ac-ppl-pagesize')) $('ac-ppl-pagesize').addEventListener('change', (e) => { t.pageSize = Number(e.target.value); t.page = 1; ctx.rerender(); });
  root.querySelectorAll('[data-exp]').forEach((el) => el.addEventListener('click', async () => { el.closest('details').open = false; try { await exportPeople(ctx, rows, el.dataset.exp); } catch (err) { ctx.toast(err, true); } }));
}

// ---------------------------------------------------------------- one person
export function openEmployee(ctx, id) {
  const person = ctx.personById[id];
  const r = peopleRows(ctx).find((x) => x.id === id) || (person ? { id, person, name: person.full_name, holding: [], outstanding: 0, returned: 0, transferred: 0, damaged: 0, lost: 0, unacknowledged: 0, left: !!person.left } : null);
  if (!r) { ctx.toast('That employee is not in the list.', true); return; }
  const p = r.person, c = ctx.caps;
  const hist = ctx.data.assignments.filter((x) => x.employee_id === id).sort((a, b) => b.id - a.id);
  const cur = r.holding.map((a) => '<tr><td data-label="Asset"><button type="button" class="bl-link" data-act="asset" data-id="' + a.id + '">' + esc(a.asset_number) + '</button><div class="muted bl-sub">' + esc(a.name) + (a.serial_number ? ' · S/N ' + esc(a.serial_number) : '') + '</div></td>' +
    '<td data-label="Issued">' + dt(a._asg.issued_on) + '</td><td data-label="Status">' + statusBadge(a.status) + ' ' + conditionBadge(a.condition) + '</td><td data-label="Confirmed">' + (a._ack ? '<b class="lv-pos">Yes</b>' : a._asg.legacy ? '<span class="muted">before the upgrade</span>' : '<b class="lv-neg">Not yet</b>') + '</td>' +
    '<td class="full-row"><div class="bl-rowact">' + (c.canReturnAsset(a) ? '<button type="button" class="btn small" data-act="return" data-id="' + a.id + '">Receive return</button>' : '') + (c.canCallBack(a) ? '<button type="button" class="btn small secondary" data-act="callback" data-id="' + a.id + '">Ask for return</button>' : '') +
    (c.canTransferEmployee(a) ? '<button type="button" class="btn small secondary" data-act="transferemp" data-id="' + a.id + '">Transfer</button>' : '') + '</div></td></tr>').join('');
  const hrow = hist.map((x) => { const a = ctx.byId.get(x.asset_id); return '<tr><td data-label="Asset">' + (a ? '<button type="button" class="bl-link" data-act="asset" data-id="' + a.id + '">' + esc(a.asset_number) + '</button> ' + esc(a.name) : '<span class="muted">asset you cannot see</span>') + '</td><td data-label="Issued">' + dt(x.issued_on) + '</td>' +
    '<td data-label="Returned">' + (x.returned_on ? dt(x.returned_on) : '<b class="lv-pos">holding</b>') + '</td><td data-label="How it ended">' + esc(x.end_reason || '—') + '</td></tr>'; }).join('');
  const inc = ctx.data.incidents.filter((i) => i.custodian_id === id);
  const irow = inc.map((i) => { const a = ctx.byId.get(i.asset_id); return '<tr><td data-label="Report"><b>' + esc(i.incident_number) + '</b> ' + esc(i.incident_type) + '</td><td data-label="Asset">' + (a ? esc(a.asset_number + ' ' + a.name) : '—') + '</td><td data-label="Status">' + flowBadge(i.status) + '</td><td data-label="Decision" class="full-row">' + esc(i.accountability_decision || i.resolution || '—') + '</td></tr>'; }).join('');
  const tbl = (head, rows) => '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  const body = '<div id="ac-detail-msg"></div>' + (r.left && r.outstanding ? '<div class="msg error"><b>' + esc(r.name) + ' is no longer an active employee</b> (' + esc(p.employment_status || p.status || 'left') + (p.end_of_employment_date ? ', ' + esc(dt(p.end_of_employment_date)) : '') + ') and still holds ' + plural(r.outstanding, 'item') + '. Receive them back, or transfer them — records are never deleted.</div>' : '') +
    '<div class="bl-sum ac-sum4"><div class="bl-sum-cell"><span class="muted">Holds now</span><b>' + r.outstanding + '</b></div><div class="bl-sum-cell"><span class="muted">Returned</span><b>' + r.returned + '</b></div><div class="bl-sum-cell"><span class="muted">Damaged reports</span><b class="' + (r.damaged ? 'lv-neg' : '') + '">' + r.damaged + '</b></div><div class="bl-sum-cell"><span class="muted">Lost / missing</span><b class="' + (r.lost ? 'lv-neg' : '') + '">' + r.lost + '</b></div></div>' +
    '<div class="drawer-section"><h4>Employee</h4>' + kv('Name', '<b>' + esc(r.name) + '</b>') + kv('Employee ID', esc(p.employee_code || '—')) + kv('Position', esc(p.job_title || p.position || '—')) + kv('Department', esc(p.department || '—')) + kv('Branch', branchChip(ctx, p.branch_id)) + kv('Employment', esc([p.employment_status, p.status].filter(Boolean).join(' · ') || '—')) + '</div>' +
    '<div class="drawer-section"><h4>Holds now</h4>' + (cur ? tbl(['Asset', 'Issued', 'Status', 'Confirmed', ''], cur) : '<p class="muted">Nothing is assigned to this person.</p>') +
    (r.outstanding ? '<p><button type="button" class="btn small secondary" data-act="statement">Print accountability statement</button></p>' : '') + '</div>' +
    '<div class="drawer-section"><h4>Everything they have held</h4>' + (hist.length ? tbl(['Asset', 'Issued', 'Returned', 'How it ended'], hrow) : '<p class="muted">No history.</p>') + '</div>' +
    (inc.length ? '<div class="drawer-section"><h4>Reports involving their assets</h4>' + tbl(['Report', 'Asset', 'Status', 'Decision'], irow) + '<p class="muted">Nobody is charged automatically; a manager records any decision.</p></div>' : '');
  openDrawer('detail', { title: r.name, sub: [p.job_title || p.position, p.department].filter(Boolean).join(' · ') + ' — company property', body, footer: '<button type="button" class="btn secondary" data-act="close">Close</button>' });
  ctx.detail = { kind: 'employee', id, reopen: () => openEmployee(ctx, id) };
  const idOf = (el) => Number(el.dataset.id);
  setDetailHandlers({ close: () => ctx.closeDetail(), asset: (el) => ctx.openAsset(idOf(el)), return: (el) => ctx.work.returnAsset(idOf(el)), callback: (el) => ctx.work.callBack(idOf(el)), transferemp: (el) => ctx.work.transferEmployee(idOf(el)), statement: () => ctx.print.statement(id) }, ctx.toast);
}
