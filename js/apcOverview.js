// Access & Performance Control Center -- Overview: the owner's one-screen answer to "who has access to what, who performs, who needs a second look".
import { esc, panel, stat, statGrid, money, int, rate, dash, emptyBox, loadingBox, errorBox, friendly, accuracyOf, empLink, wireLinks, fmtDate, btn } from './apcCore.js?v=20261011a';
import { createClientTable } from './apcTable.js?v=20261011a';
import { needsReview, signalCounts } from './apcMetrics.js?v=20261011a';

function add(root, html) { const t = document.createElement('div'); t.innerHTML = html; const el = t.firstElementChild; root.appendChild(el); return el; }
const n = (v) => Number(v) || 0;
/** The top few by a figure (people with none of it are not ranked). */
const top = (people, fn, count = 3) => people.map((p) => ({ p, v: fn(p) })).filter((x) => x.v !== null && x.v !== undefined && x.v > 0).sort((a, b) => b.v - a.v || a.p.name.localeCompare(b.p.name)).slice(0, count);
const first = (list) => list.length ? '<b>' + empLink(list[0].p.id, list[0].p.name) + '</b>' : dash;
const line = (list, fmt) => list.length ? '<span>' + fmt(list[0]) + '</span>' : '<span class="muted">No data yet</span>';

export async function renderOverview(root, A) {
  const { can, S } = A, th = A.th(), people = A.people(), active = people.filter((p) => p.status === 'Active'), perfd = active.filter((p) => p.perf);
  const rows = perfd.map((p) => p.perf);
  const range = A.filters.range();
  const signals = signalCounts(S.errs.rows);

  // ---- headcount
  const posUsers = active.filter((p) => p.perf && (p.perf.pos.orders > 0 || /sales admin associate|cashier/i.test(p.job_title || p.position || '')));
  const encoders = active.filter((p) => p.perf && (p.perf.scrap.entries + p.perf.inventory.total + p.perf.other.purchases + p.perf.other.catalog > 0));
  const supervisors = active.filter((p) => p.role === 'Branch Supervisor' || /supervisor|team leader/i.test(p.job_title || p.position || ''));
  const heads = statGrid([
    stat('Total Active Employees', int(active.length), { sub: 'in this view', tone: 'blue' }),
    stat('Admin Users', int(active.filter((p) => p.role === 'Admin').length), { sub: 'role Admin' }),
    stat('POS Users', can.analytics ? int(posUsers.length) : dash, { sub: can.analytics ? 'rang a sale this period, or hold a sales position' : 'needs staff analytics' }),
    stat('Supervisors', int(supervisors.length), { sub: 'by role or job title' }),
    stat('Managers', int(active.filter((p) => p.role === 'Manager').length), { sub: 'role Manager' }),
    stat('Encoders', can.analytics ? int(encoders.length) : dash, { sub: can.analytics ? 'encoded scrap, stock, purchases or catalog this period' : 'needs staff analytics' }),
  ]);

  // ---- headline performers (one winner each; the lists below show the top three)
  const bySales = top(perfd, (p) => n(p.perf.pos.net)), byPos = top(perfd, (p) => n(p.perf.pos.orders)), byScrap = top(perfd, (p) => n(p.perf.scrap.entries)), byTasks = top(perfd, (p) => n(p.perf.tasks.completed));
  const byAcc = perfd.map((p) => ({ p, v: accuracyOf(p.perf, th) })).filter((x) => x.v !== null).sort((a, b) => b.v - a.v || n(b.p.perf.workload.total) - n(a.p.perf.workload.total)).slice(0, 3);
  const byErr = top(perfd, (p) => n(p.perf.errors.counted));
  const perfCards = statGrid(can.analytics ? [
    stat('Top Sales Employee', first(bySales), { sub: line(bySales, (x) => money(x.v)), tone: 'green' }),
    stat('Top POS Employee', first(byPos), { sub: line(byPos, (x) => int(x.v) + ' transactions'), tone: 'green' }),
    stat('Top Scrap Encoder', first(byScrap), { sub: line(byScrap, (x) => int(x.v) + ' entries'), tone: 'green' }),
    stat('Most Accurate Employee', first(byAcc), { sub: line(byAcc, (x) => x.v.toFixed(1) + '% accurate'), tone: 'green' }),
    stat('Highest Error Count', first(byErr), { sub: line(byErr, (x) => int(x.v) + ' errors (see the rate on Errors)'), tone: byErr.length ? 'orange' : 'gray' }),
    stat('Highest Task Completion', first(byTasks), { sub: line(byTasks, (x) => int(x.v) + ' Data Fix tasks'), tone: 'green' }),
  ] : []);

  // ---- access + data cards
  const conflictsAll = active.map((p) => ({ p, c: A.conflictsOf(p).filter((c) => c.level === 'warn') })).filter((x) => x.c.length);
  const accessIssues = new Set(active.filter((p) => p.snap && ['NEEDS REVIEW', 'ACCESS MISMATCH'].includes(p.snap.verify_status)).map((p) => p.id));
  conflictsAll.forEach((x) => accessIssues.add(x.p.id));
  const outside = active.filter((p) => p.snap && (p.snap.overrides || []).some((o) => o.active && !['access_perf.view', 'staff_analytics.view'].includes(o.key) && p.snap.default_keys.includes(o.key) !== o.granted));
  const inactive = A.allPeople().filter((p) => p.status === 'Inactive' && A.filters.matches(Object.assign({}, p, { status: 'Inactive' })));
  const errRows = S.errs.rows || [];
  const dataCards = statGrid([
    can.analytics ? stat('Open Data Errors', int((S.errs.open_now || 0) + (S.errs.in_review_now || 0)), { sub: (S.errs.open_now || 0) + ' open · ' + (S.errs.in_review_now || 0) + ' in review (all time)', tone: (S.errs.open_now + S.errs.in_review_now) ? 'orange' : 'green', attrs: 'data-go="errors"' }) : '',
    can.analytics ? stat('Resolved Errors', int(errRows.filter((e) => e.status === 'CORRECTED').length), { sub: 'corrected in this period', tone: 'green', attrs: 'data-go="errors"' }) : '',
    stat('Pending Approval Tasks', '<span id="apc-pending">…</span>', { sub: 'waiting on a Supervisor, Manager or Admin' }),
    stat('Employees With Access Issues', int(accessIssues.size), { sub: 'mismatch, changed since review, or unusual combination', tone: accessIssues.size ? 'orange' : 'green', attrs: 'data-go="access"' }),
    stat('Inactive Accounts', int(inactive.length), { sub: 'cannot sign in' }),
    stat('Recently Changed Permissions', '<span id="apc-recent-n">…</span>', { sub: 'in the last 7 days', attrs: 'data-go="activity"' }),
  ]);

  root.innerHTML = '<div id="ov-heads"></div><div id="ov-perf"></div><div id="ov-data"></div><div class="sd-grid" id="ov-grid"></div><div id="ov-branch"></div><div id="ov-inv"></div>';
  root.querySelector('#ov-heads').innerHTML = panel('Team', heads, { sub: 'Who is on the team in this view' });
  if (can.analytics) root.querySelector('#ov-perf').innerHTML = panel('Top of the team', perfCards, { sub: range.from === range.to ? range.from : range.from + ' → ' + range.to });
  root.querySelector('#ov-data').innerHTML = panel('Data and access', dataCards);
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => A.go(b.dataset.go)));
  wireLinks(root.querySelector('#ov-perf'), A);
  const grid = root.querySelector('#ov-grid');

  // ---- top three lists
  if (can.analytics) {
    const list = (title, items, fmt) => '<div class="apc-top"><h4>' + esc(title) + '</h4>' + (items.length ? '<ol>' + items.map((x) => '<li>' + empLink(x.p.id, x.p.name) + ' <span class="muted">' + fmt(x) + '</span></li>').join('') + '</ol>' : '<p class="muted">No data yet.</p>') + '</div>';
    const el = add(grid, panel('Top performers', '<div class="apc-top-grid">' + list('Sales', bySales, (x) => money(x.v)) + list('POS', byPos, (x) => int(x.v) + ' sales') + list('Scrap', byScrap, (x) => int(x.v) + ' entries') +
      list('Best accuracy', byAcc, (x) => x.v.toFixed(1) + '%') + list('Most tasks completed', byTasks, (x) => int(x.v)) + '</div>', { cls: 'sd-span-7', sub: 'Click a name to open the full profile' }));
    wireLinks(el, A);
  }

  // ---- needs review (spec: Employee / Reason / Metric / Action)
  const reviewList = needsReview(A.people(), th, (id) => signals[id] || null, A.ctx.me.id);
  const rev = add(grid, panel('Employees needing review', '<div id="ov-review"></div>', { cls: 'sd-span-5', sub: 'A prompt to look, not a verdict' }));
  if (!reviewList.length) rev.querySelector('#ov-review').innerHTML = emptyBox('Nobody needs a second look right now.');
  else createClientTable({ root: rev.querySelector('#ov-review'), rows: reviewList.map((r) => Object.assign({}, r, { action: r.kind })), size: 10, noSearch: true, sort: { key: 'sev', dir: 'asc' }, noExport: false, exportName: 'needs-review', title: 'Employees needing review',
    columns: [{ key: 'name', label: 'Employee', render: (r) => empLink(r.id, r.name, r.kind === 'access' ? 'access' : 'people') }, { key: 'reason', label: 'Reason', render: (r) => '<span class="sd-small">' + esc(r.reason) + '</span>' },
      { key: 'metric', label: 'Metric' }, { key: 'sev', label: '', hide: true, sort: (r) => ({ red: 0, orange: 1, yellow: 2, gray: 3 }[r.severity]), noExport: true },
      { key: 'action', label: 'Action', noExport: true, render: (r) => btn('Review', 'data-go-emp="' + esc(r.id) + '" data-tab="' + (r.kind === 'access' ? 'access' : 'people') + '"', 'secondary') }],
    afterDraw: (w) => wireLinks(w, A) });

  const accessSummary = add(grid, panel('Access review', '<p><b>' + outside.length + '</b> ' + (outside.length === 1 ? 'person has' : 'people have') + ' access outside their position defaults.' +
    (conflictsAll.length ? ' <b>' + conflictsAll.length + '</b> ' + (conflictsAll.length === 1 ? 'has an' : 'have an') + ' unusual combination — <span class="apc-flag">ACCESS REVIEW NEEDED</span>.' : '') + '</p>' +
    (outside.length ? '<ul class="apc-plain">' + outside.slice(0, 6).map((p) => '<li>' + empLink(p.id, p.name, 'access') + ' <span class="muted">— ' + p.snap.overrides.filter((o) => o.active).length + ' custom setting(s)</span></li>').join('') + '</ul>' : '') +
    btn('Review Access', 'data-go="access"'), { cls: 'sd-span-5', sub: 'Compared with what their role and position normally give' }));
  accessSummary.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => A.go('access')));
  wireLinks(accessSummary, A);

  const recent = add(grid, panel('Recent changes', '<div id="ov-recent">' + loadingBox() + '</div>', { cls: 'sd-span-7', sub: 'Last 7 days: permissions, roles, branches, account activations' }));
  // ---- lazy panels
  loadRecent(A, recent.querySelector('#ov-recent'));
  api_pending(A, root);
  if (can.analytics) { loadBranches(A, root.querySelector('#ov-branch')); loadInventory(A, root.querySelector('#ov-inv')); }
  return { destroy() {} };
}

async function loadRecent(A, el) {
  try {
    const to = A.ctx.today, d = new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 6);
    const from = d.toISOString().slice(0, 10);
    const rows = await A.api.history({ from, to });
    const by = (k) => rows.filter((r) => r.kind === k).length;
    const nEl = document.getElementById('apc-recent-n'); if (nEl) nEl.textContent = String(by('permission') + by('position_grant'));
    el.innerHTML = '<div class="sd-mini"><div><span>Permission changes</span><b>' + (by('permission') + by('position_grant')) + '</b></div><div><span>Role changes</span><b>' + by('role') + '</b></div><div><span>Branch changes</span><b>' + by('branch') + '</b></div>' +
      '<div><span>Account (de)activations</span><b>' + by('status') + '</b></div></div>' +
      (rows.length ? '<ul class="apc-plain">' + rows.slice(0, 6).map((r) => '<li><span class="muted">' + esc(fmtDate(String(r.at).slice(0, 10))) + '</span> ' + esc(r.permission_label || r.details || r.action) + ' <span class="muted">— ' + esc(r.employee_name || r.position_key || '') + ' · by ' + esc(r.changed_by_name || 'System') + '</span></li>').join('') + '</ul>' : '<p class="muted">No access changes in the last 7 days.</p>');
  } catch (err) { el.innerHTML = errorBox(friendly(err)); }
}
async function api_pending(A, root) {
  const el = root.querySelector('#apc-pending'); if (!el) return;
  try { const r = A.api.pending ? await A.api.pending() : null; el.textContent = r ? String(r.total) : '—'; if (r && el.parentElement) el.parentElement.title = r.detail || ''; } catch (e) { el.textContent = '—'; }
}
async function loadBranches(A, el) {
  const p = add(el, panel('Branch ranking', '<div id="ov-br">' + loadingBox() + '</div>', { sub: 'Which locations do best — sales, POS transactions, stock, scrap, people and error rate' }));
  try {
    const r = await A.api.branchSummary(A.filters.server());
    createClientTable({ root: p.querySelector('#ov-br'), rows: r.rows.map((b, i) => Object.assign({}, b, { rank: i + 1 })), size: 10, noSearch: true, sort: { key: 'net', dir: 'desc' }, exportName: 'branch-ranking', title: 'Branch ranking', subtitle: () => A.filters.describe(),
      columns: [{ key: 'name', label: 'Branch' }, { key: 'net', label: 'Sales (net)', type: 'money' }, { key: 'orders', label: 'POS Transactions', type: 'int' }, { key: 'inventory_value', label: 'Inventory Value (retail)', type: 'money' },
        { key: 'scrap_value', label: 'Scrap Value', type: 'money' }, { key: 'scrap_entries', label: 'Scrap Entries', type: 'int', hide: true }, { key: 'employees', label: 'Employees', type: 'int' },
        { key: 'error_rate', label: 'Error Rate', type: 'pct', title: 'Counted errors ÷ the branch\'s transactions (POS sales + voids + scrap + layaway)' }], totals: null });
  } catch (err) { p.querySelector('#ov-br').innerHTML = errorBox(friendly(err)); }
}
let invCats = new Set();
async function loadInventory(A, el) {
  const p = add(el, panel('Inventory Value by Branch', '<div id="ov-inv-body">' + loadingBox() + '</div>', { sub: 'Active SKUs only. Retail = selling price × pieces on hand' + (A.can.cost ? '; cost uses the Supplier Price.' : '.') }));
  async function draw() {
    const body = p.querySelector('#ov-inv-body');
    try {
      const r = await A.api.inventoryValue([...invCats]);
      body.innerHTML = '<div class="apc-cats">' + (r.categories || []).map((c) => '<button type="button" class="cat-pill' + (invCats.has(c) ? ' active' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join('') +
        (invCats.size ? ' <button type="button" class="btn small secondary" id="inv-clear">Clear</button>' : '') + '</div><div id="ov-inv-table"></div>';
      body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { if (invCats.has(b.dataset.cat)) invCats.delete(b.dataset.cat); else invCats.add(b.dataset.cat); draw(); }));
      const clr = body.querySelector('#inv-clear'); if (clr) clr.addEventListener('click', () => { invCats.clear(); draw(); });
      createClientTable({ root: body.querySelector('#ov-inv-table'), rows: r.rows, size: 10, noSearch: true, sort: { key: 'retail_value', dir: 'desc' }, exportName: 'inventory-value-by-branch', title: 'Inventory value by branch',
        subtitle: () => ['Categories: ' + (invCats.size ? [...invCats].join(', ') : 'all'), 'Low stock = at or below ' + r.low_stock_qty + ' pieces (no product has its own reorder level yet)'],
        columns: [{ key: 'name', label: 'Branch' }, { key: 'pieces', label: 'Total Pieces', type: 'int' }, { key: 'cost_value', label: 'Cost Value', type: 'money', hide: !r.can_cost, noExport: !r.can_cost }, { key: 'retail_value', label: 'Retail Value', type: 'money' },
          { key: 'active_skus', label: 'Active SKUs', type: 'int' }, { key: 'low_stock', label: 'Low Stock', type: 'int' }, { key: 'out_of_stock', label: 'Out of Stock', type: 'int' }].filter((c) => r.can_cost || c.key !== 'cost_value') });
    } catch (err) { body.innerHTML = errorBox(friendly(err)); }
  }
  draw();
}
