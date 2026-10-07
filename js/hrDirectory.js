// HR 201 File -- the employee directory: summary cards, HR alerts, search, filters, quick filters and the employee table.
// It only ever shows the columns the directory function returns (no salary, no government IDs).
import { esc, $, badge, emptyBox } from './hrUi.js?v=20261008b';
import {
  QUICK_FILTERS, SORTS, defaultFilters, filterRows, sortRows, distinct, statusLabel, statusTone, fmtDate, directoryCsv, plural,
  ALERT_TITLE, ALERT_QUICK, COMPANIES, DEPARTMENTS, STATUS_LABEL, EMPLOYMENT_STATUSES,
} from './hrLogic.js?v=20261008b';

export function newDirectoryState() {
  return { filters: defaultFilters(), sort: { field: 'employee_code', dir: 'asc' }, alertsOpen: false };
}

/** the alert wording is plural ("have", "are"); make it read right for a single person */
const agree = (m) => String(m).replace(/^have /, 'has ').replace(/^are /, 'is ').replace(/^do not /, 'does not ');
const opt = (value, label, current) => '<option value="' + esc(value) + '"' + (String(value) === String(current) ? ' selected' : '') + '>' + esc(label) + '</option>';

export function renderDirectory(ctx, host) {
  const st = ctx.ui.dir, f = st.filters, k = ctx.access.keys;
  const rows = ctx.rows;
  const docsOn = rows.some((r) => r.docs_required !== null && r.docs_required !== undefined);
  const s = ctx.summary || {};
  const cards = [
    { id: 'all', label: 'Employees', n: s.total, tone: '' },
    { id: 'active', label: 'Active accounts', n: s.active_accounts },
    { id: 'probationary', label: 'Probationary', n: s.probationary },
    { id: 'regular', label: 'Regular', n: s.regular },
    { id: 'separated', label: 'Left the company', n: s.separated },
    { id: 'new', label: 'New in 30 days', n: s.new_30_days },
    ...(docsOn ? [{ id: 'docs_missing', label: 'Missing documents', n: s.docs_missing, tone: Number(s.docs_missing) > 0 ? 'warn' : '' }, { id: 'docs_expiring', label: 'Documents expiring', n: s.docs_expiring, tone: Number(s.docs_expiring) > 0 ? 'warn' : '' }] : []),
    { id: 'incomplete', label: 'Incomplete profile', n: s.incomplete, tone: Number(s.incomplete) > 0 ? 'warn' : '' },
    { id: 'no_login', label: 'No sign-in yet', n: s.no_login },
    ...(Number(s.archived) > 0 ? [{ id: 'archived', label: 'Archived', n: s.archived }] : []),
  ];

  host.innerHTML =
    '<div class="hr-top"><h2>HR — 201 File</h2><div class="hr-top-actions">' +
      (k['hr.add_employee'] ? '<button type="button" class="btn" id="hr-add">+ Add Employee</button>' : '') +
      (k['hr.export_print'] ? '<button type="button" class="btn secondary" id="hr-export">Export list (CSV)</button>' : '') +
      (k['hr.view_audit_log'] ? '<button type="button" class="btn secondary" id="hr-audit-all">Audit log</button>' : '') +
      '<button type="button" class="btn secondary" id="hr-refresh">Refresh</button></div></div>' +
    '<div id="hr-asset-alert"></div><div id="hr-alerts-box"></div>' +
    '<div class="hr-stats" id="hr-stats"></div>' +
    '<div class="card"><div class="hr-filters">' +
      '<div class="field hr-search"><label for="hr-q">Search</label><input type="search" id="hr-q" placeholder="Name, employee #, department, job title…" value="' + esc(f.q) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="hr-f-company">Company</label><select id="hr-f-company"><option value="">All</option>' + COMPANIES.map((c) => opt(c, c, f.company)).join('') + '</select></div>' +
      '<div class="field"><label for="hr-f-dept">Department</label><select id="hr-f-dept"><option value="">All</option>' + distinct(rows, 'department').map((c) => opt(c, c, f.department)).join('') + '</select></div>' +
      '<div class="field"><label for="hr-f-branch">Branch</label><select id="hr-f-branch"><option value="">All</option>' + ctx.branches.map((b) => opt(b.id, b.name, f.branch)).join('') + '</select></div>' +
      '<div class="field"><label for="hr-f-status">Employment status</label><select id="hr-f-status"><option value="">All</option>' + EMPLOYMENT_STATUSES.map((c) => opt(c, STATUS_LABEL[c], f.employment_status)).join('') + '</select></div>' +
      '<div class="field"><label for="hr-sort">Sort by</label><select id="hr-sort">' + SORTS.map((x) => opt(x.key, x.label, st.sort.field)).join('') + '</select></div>' +
      '<div class="field"><label>Direction</label><button type="button" class="btn small secondary" id="hr-dir">' + (st.sort.dir === 'asc' ? '↑ Ascending' : '↓ Descending') + '</button></div>' +
      '<div class="field"><label>&nbsp;</label><button type="button" class="btn small secondary" id="hr-clear">Clear filters</button></div>' +
    '</div>' +
    '<details class="exp" id="hr-more"' + (f.job_title || f.login || f.docs || f.profile ? ' open' : '') + ' style="margin-top:8px;"><summary><span class="exp-arrow" aria-hidden="true">▸</span>More filters</summary><div class="exp-body"><div class="hr-filters">' +
      '<div class="field"><label for="hr-f-title">Job title</label><select id="hr-f-title"><option value="">All</option>' + distinct(rows, 'job_title').map((c) => opt(c, c, f.job_title)).join('') + '</select></div>' +
      '<div class="field"><label for="hr-f-login">Sign-in</label><select id="hr-f-login"><option value="">All</option>' + opt('yes', 'Has a sign-in', f.login) + opt('no', 'No sign-in yet', f.login) + '</select></div>' +
      (docsOn ? '<div class="field"><label for="hr-f-docs">Documents</label><select id="hr-f-docs"><option value="">All</option>' + opt('complete', 'Nothing missing', f.docs) + opt('missing', 'Something missing', f.docs) + opt('expiring', 'Expiring or expired', f.docs) + '</select></div>' : '') +
      '<div class="field"><label for="hr-f-profile">Profile</label><select id="hr-f-profile"><option value="">All</option>' + opt('complete', 'Complete', f.profile) + opt('incomplete', 'Incomplete', f.profile) + '</select></div>' +
    '</div></div></details>' +
    '<div class="hr-quick" id="hr-quick"></div></div>' +
    '<div id="hr-results"></div>';
  if (ctx.assetBanner && $('hr-asset-alert')) $('hr-asset-alert').innerHTML = ctx.assetBanner;

  const readFilters = () => {
    f.q = $('hr-q').value; f.company = $('hr-f-company').value; f.department = $('hr-f-dept').value; f.branch = $('hr-f-branch').value;
    f.job_title = $('hr-f-title').value; f.employment_status = $('hr-f-status').value; f.login = $('hr-f-login').value;
    f.docs = $('hr-f-docs') ? $('hr-f-docs').value : ''; f.profile = $('hr-f-profile').value;
    st.sort.field = $('hr-sort').value;
  };
  const setQuick = (id) => { f.quick = id; f.ids = null; f.idsLabel = ''; draw(); };

  function drawStats() {
    $('hr-stats').innerHTML = cards.map((c) =>
      '<button type="button" class="hr-stat' + (f.quick === c.id ? ' on' : '') + (c.tone ? ' hr-stat-' + c.tone : '') + '" data-quick="' + c.id + '"><b>' + (c.n === null || c.n === undefined ? '—' : esc(c.n)) + '</b><span>' + esc(c.label) + '</span></button>').join('');
    $('hr-stats').querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => setQuick(f.quick === b.dataset.quick && b.dataset.quick !== 'all' ? 'all' : b.dataset.quick)));
    $('hr-quick').innerHTML = QUICK_FILTERS.filter((q) => !q.docs || docsOn).map((q) => '<button type="button" class="hr-qbtn' + (f.quick === q.id ? ' on' : '') + '" data-quick="' + q.id + '">' + esc(q.label) + '</button>').join('') +
      '<label class="hr-qbtn"><input type="checkbox" id="hr-arch"' + (f.showArchived ? ' checked' : '') + '> Include archived</label>' +
      (f.ids ? '<button type="button" class="hr-qbtn on" id="hr-idsclear">' + esc(f.idsLabel) + ' ×</button>' : '');
    $('hr-quick').querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => setQuick(b.dataset.quick)));
    $('hr-arch').addEventListener('change', (e) => { f.showArchived = e.target.checked; drawResults(); });
    if ($('hr-idsclear')) $('hr-idsclear').addEventListener('click', () => { f.ids = null; f.idsLabel = ''; draw(); });
  }

  function drawResults() {
    const list = sortRows(filterRows(rows, f, ctx.today), st.sort);
    ctx.ui.dirShown = list;
    if (!rows.length) { $('hr-results').innerHTML = emptyBox('There are no employees yet.'); return; }
    if (!list.length) { $('hr-results').innerHTML = emptyBox('No employee matches these filters.<br><button type="button" class="btn small secondary" id="hr-clear2" style="margin-top:8px;">Clear filters</button>'); $('hr-clear2').addEventListener('click', clearAll); return; }
    const pctBar = (p) => { const n = Number(p || 0); return '<span class="hr-pct"><span class="hr-bar ' + (n >= 90 ? '' : n >= 60 ? 'mid' : 'low') + '"><i style="width:' + n + '%"></i></span>' + n + '%</span>'; };
    $('hr-results').innerHTML = '<div class="hr-count">' + plural(list.length, 'employee') + (list.length !== rows.length ? ' of ' + rows.length : '') + '</div>' +
      '<div class="table-scroll"><table class="hr-table"><thead><tr><th>Employee #</th><th>Name</th><th>Company</th><th>Department</th><th>Job title</th><th>Branch</th><th>Status</th><th>Date hired</th>' +
      (docsOn ? '<th>Documents</th>' : '') + '<th>Profile</th><th>Sign-in</th></tr></thead><tbody>' +
      list.map((r) => {
        const docsCell = r.docs_required === null || r.docs_required === undefined ? '' :
          '<td data-label="Documents">' + (Number(r.docs_expired) > 0 ? badge('Expired ' + r.docs_expired, 'low') + ' ' : '') + (Number(r.docs_expiring) > 0 ? badge('Expiring ' + r.docs_expiring, 'pending') + ' ' : '') +
          (Number(r.docs_required) === 0 ? '<span class="muted">No checklist</span>' : Number(r.docs_missing) > 0 ? badge(r.docs_ok + ' of ' + r.docs_required + ' on file', 'pending') : badge('Complete', 'ok')) + '</td>';
        return '<tr class="' + (r.archived ? 'hr-archived-row' : '') + '"><td data-label="Employee #">' + esc(r.employee_code || '—') + '</td>' +
          '<td data-label="Name"><button type="button" class="hr-name" data-open="' + esc(r.id) + '">' + esc(r.display_name) + '</button></td>' +
          '<td data-label="Company">' + esc(r.company || '—') + '</td><td data-label="Department">' + esc(r.department || '—') + '</td><td data-label="Job title">' + esc(r.job_title || '—') + '</td>' +
          '<td data-label="Branch">' + esc(r.branch_name || '—') + '</td>' +
          '<td data-label="Status">' + (r.archived ? badge('Archived', 'gray') + ' ' : '') + badge(statusLabel(r.employment_status), statusTone(r)) + (r.status !== 'Active' ? ' ' + badge('Account inactive', 'low') : '') + '</td>' +
          '<td data-label="Date hired">' + esc(fmtDate(r.hire_date)) + '</td>' + (docsOn ? docsCell : '') +
          '<td data-label="Profile">' + pctBar(r.profile_pct) + '</td>' +
          '<td data-label="Sign-in">' + (r.has_login ? badge('Yes', 'ok') : badge('Not yet', 'gray')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    $('hr-results').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => ctx.openEmployee(b.dataset.open)));
  }
  function draw() { drawStats(); drawResults(); }
  function clearAll() { st.filters = defaultFilters(); renderDirectory(ctx, host); }

  // alerts
  const alerts = ctx.alerts || [];
  if (alerts.length) {
    $('hr-alerts-box').innerHTML = '<details class="exp card"' + (st.alertsOpen ? ' open' : '') + '><summary><span class="exp-arrow" aria-hidden="true">▸</span>HR alerts <span class="exp-count">(' + alerts.length + ')</span></summary><div class="exp-body hr-alerts">' +
      alerts.map((a, i) => '<div class="hr-alert hr-alert-' + esc(a.severity) + '"><span><b>' + esc(a.count) + '</b> ' + (a.count === 1 ? 'employee ' + esc(agree(a.message)) : 'employees ' + esc(a.message)) + '</span>' +
        '<button type="button" class="btn small secondary" data-alert="' + i + '">Show</button></div>').join('') + '</div></details>';
    const det = $('hr-alerts-box').querySelector('details');
    det.addEventListener('toggle', () => { st.alertsOpen = det.open; });
    $('hr-alerts-box').querySelectorAll('[data-alert]').forEach((b) => b.addEventListener('click', () => {
      const a = alerts[Number(b.dataset.alert)];
      f.quick = 'all'; f.ids = a.employee_ids; f.idsLabel = (ALERT_TITLE[a.kind] || 'Alert');
      draw(); $('hr-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  // wiring
  ['hr-f-company', 'hr-f-dept', 'hr-f-branch', 'hr-f-title', 'hr-f-status', 'hr-f-login', 'hr-f-docs', 'hr-f-profile', 'hr-sort'].forEach((id) => { const el = $(id); if (el) el.addEventListener('change', () => { readFilters(); drawResults(); }); });
  let timer = null;
  $('hr-q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { readFilters(); drawResults(); }, 150); });
  $('hr-dir').addEventListener('click', () => { st.sort.dir = st.sort.dir === 'asc' ? 'desc' : 'asc'; $('hr-dir').textContent = st.sort.dir === 'asc' ? '↑ Ascending' : '↓ Descending'; drawResults(); });
  $('hr-clear').addEventListener('click', clearAll);
  $('hr-refresh').addEventListener('click', () => ctx.refresh());
  if ($('hr-add')) $('hr-add').addEventListener('click', () => ctx.openAdd());
  if ($('hr-audit-all')) $('hr-audit-all').addEventListener('click', () => ctx.openAuditAll());
  if ($('hr-export')) $('hr-export').addEventListener('click', () => ctx.exportCsv(ctx.ui.dirShown || rows));
  draw();
}

export { directoryCsv };
