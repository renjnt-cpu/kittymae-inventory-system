// Access & Performance Control Center -- Errors & Data Quality: who creates bad data or mistakes, how many, how serious, how long they stayed open, and who keeps repeating the same one.
// Built from records that already exist (classified corrections, POS corrections, Data Fix tasks, transfer discrepancies) -- nothing is tracked twice. An error is credited to a person only when
// the record itself says who made it; otherwise it is "Unknown / System". The ranking is by error RATE against the person's workload, never by the raw count alone.
import { esc, panel, stat, statGrid, int, rate, dash, toast, guarded, dialog, btn, accuracyOf, NOT_ENOUGH, chipFor, empLink, wireLinks, drillLink, fmtDateTime, badge, openDrawer, closeDrawer } from './apcCore.js?v=20261011a';
import { createClientTable } from './apcTable.js?v=20261011a';
import { hbars } from './sdUi.js?v=20261011a';
import { unitsOf } from './apcMetrics.js?v=20261011a';

const f = { type: '', module: '', status: '', employee: '', signals: true };
const n = (v) => Number(v) || 0;
const COLORS = { Critical: '#b3261e', High: '#d9602a', Medium: '#e0a030', Low: '#9aa4ad' };

export async function renderErrors(root, A) {
  const th = A.th(), rowsAll = A.S.errs.rows || [], people = A.people().filter((p) => p.perf), signalTypes = (A.ctx.settings && A.ctx.settings.signal_error_types) || ['Voided Transaction', 'Manual Override'];
  const counted = rowsAll.filter((e) => e.counted), signals = rowsAll.filter((e) => !e.counted && e.status !== 'IGNORED'), ignored = rowsAll.filter((e) => e.status === 'IGNORED');
  const open = rowsAll.filter((e) => e.status === 'OPEN'), review = rowsAll.filter((e) => e.status === 'IN REVIEW'), fixed = rowsAll.filter((e) => e.status === 'CORRECTED');
  const unknown = rowsAll.filter((e) => !e.employee_id && e.status !== 'IGNORED');
  const fixedDays = fixed.map((e) => e.days_to_fix).filter((d) => d !== null && d !== undefined && e_isNum(d)), avgFix = fixedDays.length ? fixedDays.reduce((s, d) => s + Number(d), 0) / fixedDays.length : null;
  const oldest = [...open, ...review].map((e) => n(e.age_days)).sort((a, b) => b - a)[0];
  const repeats = {};
  counted.filter((e) => e.employee_id).forEach((e) => { const k = e.employee_id + '|' + e.error_type; repeats[k] = (repeats[k] || { id: e.employee_id, name: e.employee_name, type: e.error_type, c: 0 }); repeats[k].c++; });
  const repeatList = Object.values(repeats).filter((x) => x.c >= th.repeat_error_count).sort((a, b) => b.c - a.c);

  root.innerHTML = '<div id="er-sum"></div><div class="sd-grid" id="er-grid"></div><div id="er-rep"></div><div id="er-records"></div>';
  root.querySelector('#er-sum').innerHTML = panel('Data quality at a glance', statGrid([
    stat('Errors counted', int(counted.length), { sub: 'toward error rate and accuracy', tone: counted.length ? 'orange' : 'green' }),
    stat('Review signals', int(signals.length), { sub: signalTypes.join(', ') + ' — shown, not counted' }),
    stat('Open now', int(A.S.errs.open_now), { sub: 'all time', tone: A.S.errs.open_now ? 'red' : 'green' }), stat('In review', int(A.S.errs.in_review_now), { sub: 'all time', tone: A.S.errs.in_review_now ? 'orange' : 'green' }),
    stat('Corrected', int(fixed.length), { sub: 'in this period', tone: 'green' }), stat('Average time to correct', avgFix === null ? dash : avgFix.toFixed(1) + ' days', { sub: 'data-fix tasks: found → fixed; other corrections are fixed on the spot' }),
    stat('Oldest still open', oldest === undefined ? dash : oldest.toFixed(1) + ' days', { sub: 'how long an error has waited' }), stat('Not tied to a person', int(unknown.length), { sub: 'the record does not say who made it' }),
    stat('Ignored', int(ignored.length), { sub: 'marked as not a real mistake' }),
  ]), { sub: A.filters.describe()[0] + ' · ' + A.filters.describe()[1] });
  const grid = root.querySelector('#er-grid');
  const byType = {}; rowsAll.filter((e) => e.status !== 'IGNORED').forEach((e) => { byType[e.error_type] = (byType[e.error_type] || 0) + 1; });
  const sev = {}; counted.forEach((e) => { sev[e.severity] = (sev[e.severity] || 0) + 1; });
  addPanel(grid, panel('By error type', hbars(Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, sub: signalTypes.includes(k) ? '(signal)' : '' })), { format: int, color: '#e0a030' }), { cls: 'sd-span-6' }));
  addPanel(grid, panel('By severity (counted)', hbars(['Critical', 'High', 'Medium', 'Low'].map((k) => ({ label: k, value: sev[k] || 0, color: COLORS[k] })), { format: int }), { cls: 'sd-span-6', sub: 'Critical = an urgent data fix still open; High = money recorded wrong' }));

  // ---- employees with the most errors: by RATE against workload
  const rank = people.map((p) => { const r = p.perf, ok = r.workload.total >= th.min_sample; return { id: p.id, name: p.name, position: p.job_title || p.position || '—', total: r.errors.counted, critical: r.errors.critical, repeated: r.errors.repeated, resolved: r.errors.resolved,
    workload: r.workload.total, rate: ok ? r.rates.error : null, accuracy: accuracyOf(r, th), units: unitsOf(r) }; }).filter((x) => x.total > 0 || x.workload > 0);
  const er = addPanel(root.querySelector('#er-rep'), panel('Employees with the most errors', '<p class="muted sd-small">Ranked by <b>error rate</b> — errors ÷ the person’s own transactions — not by raw count: 10 errors in 1,000 entries (1%) is better than 8 in 100 (8%). A person with fewer than ' + th.min_sample +
    ' transactions shows “Not enough data” rather than an invented score.</p><div id="er-rank"></div>', { sub: 'Review prompts, not verdicts' }));
  const rt = createClientTable({ root: er.querySelector('#er-rank'), rows: rank, size: 10, noSearch: true, sort: { key: 'rate', dir: 'desc' }, exportName: 'employees-most-errors', title: 'Employees with the most errors', subtitle: () => A.filters.describe(), emptyText: 'No errors tied to anyone in this period.',
    columns: [{ key: 'name', label: 'Employee', render: (r) => empLink(r.id, r.name, 'people') }, { key: 'position', label: 'Position' }, { key: 'total', label: 'Total Errors', type: 'int', render: (r) => drillLink(r.id, 'errors', 'Errors', int(r.total)) }, { key: 'critical', label: 'Critical', type: 'int' },
      { key: 'repeated', label: 'Repeated', type: 'int' }, { key: 'resolved', label: 'Resolved', type: 'int' }, { key: 'workload', label: 'Transactions (workload)', type: 'int' },
      { key: 'rate', label: 'Error Rate', type: 'pct', sort: (r) => (r.rate === null ? -1 : r.rate), render: (r) => (r.rate === null ? NOT_ENOUGH : '<b>' + rate(r.rate) + '</b>') }, { key: 'accuracy', label: 'Accuracy Rate', render: (r) => (r.accuracy === null ? NOT_ENOUGH : r.accuracy.toFixed(1) + '%') }],
    afterDraw: (w) => wireLinks(w, A) });
  if (repeatList.length) addPanel(root.querySelector('#er-rep'), panel('Repeated issues', '<div class="table-scroll"><table class="sd-tbl"><thead><tr><th>Employee</th><th>Repeated issue</th><th>Count</th><th>Status</th></tr></thead><tbody>' +
    repeatList.map((x) => '<tr><td>' + empLink(x.id, x.name, 'people') + '</td><td>' + esc(x.type) + '</td><td class="sd-num"><b>' + x.c + '</b></td><td>' + badge('Needs Coaching / Review', 'orange') + '</td></tr>').join('') + '</tbody></table></div>', { sub: 'The same kind of error ' + th.repeat_error_count + ' or more times in this period' }));
  wireLinks(root, A);

  // ---- the records
  const rec = addPanel(root.querySelector('#er-records'), panel('Error records', '<div class="sd-fb-row" id="er-filters"></div><div id="er-table"></div>', { sub: 'Click a row for the details, and to mark one as not a real mistake.' }));
  const opts = (key) => [...new Set(rowsAll.map((e) => e[key]).filter(Boolean))].sort();
  const sel = (id, label, key, cur) => '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '"><option value="">All</option>' + opts(key).map((v) => '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select></div>';
  rec.querySelector('#er-filters').innerHTML = sel('ef-type', 'Error type', 'error_type', f.type) + sel('ef-module', 'Module', 'module', f.module) + sel('ef-status', 'Status', 'status', f.status) +
    '<div class="field"><label for="ef-emp">Employee</label><select id="ef-emp"><option value="">All</option><option value="__none"' + (f.employee === '__none' ? ' selected' : '') + '>Unknown / System</option>' + people.map((p) => '<option value="' + esc(p.id) + '"' + (f.employee === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>' +
    '<label class="sd-inline"><input type="checkbox" id="ef-sig"' + (f.signals ? ' checked' : '') + '> Include review signals</label>';
  const shape = (e) => Object.assign({}, e, { who: e.employee_name || '', date: e.found_at, fixed_date: e.fixed_at, counts: e.counted ? 'Yes' : (e.status === 'IGNORED' ? 'No (ignored)' : 'No (signal)'), repeat_txt: e.repeat ? 'Yes' : '', ord: { Critical: 0, High: 1, Medium: 2, Low: 3 }[e.severity] });
  const filtered = () => rowsAll.filter((e) => (!f.type || e.error_type === f.type) && (!f.module || e.module === f.module) && (!f.status || e.status === f.status) && (!f.employee || (f.employee === '__none' ? !e.employee_id : e.employee_id === f.employee)) && (f.signals || e.counted || e.status === 'IGNORED')).map(shape);
  const tbl = createClientTable({ root: rec.querySelector('#er-table'), rows: filtered(), size: 25, sort: { key: 'date', dir: 'desc' }, exportName: 'error-report', title: 'Error report', subtitle: () => A.filters.describe(), searchPlaceholder: 'Search employee, reference, description…', emptyText: 'No error records for these filters.',
    columns: [{ key: 'date', label: 'Date', type: 'dt' }, { key: 'who', label: 'Employee', render: (e) => empLink(e.employee_id, e.employee_name, 'people') }, { key: 'role', label: 'Role', render: (e) => esc(e.role || '—') }, { key: 'branch_name', label: 'Branch' }, { key: 'error_type', label: 'Error Type' }, { key: 'module', label: 'Module' },
      { key: 'reference', label: 'Reference' }, { key: 'severity', label: 'Severity', sort: (e) => e.ord, render: (e) => chipFor(e.severity) }, { key: 'description', label: 'Description', render: (e) => '<span class="sd-small">' + esc(e.description) + '</span>' }, { key: 'status', label: 'Status', render: (e) => chipFor(e.status) },
      { key: 'fixed_by_name', label: 'Corrected By' }, { key: 'fixed_date', label: 'Correction Date', type: 'dt', hide: true }, { key: 'repeat_txt', label: 'Repeat Error' }, { key: 'counts', label: 'Counts toward rate', hide: true }, { key: 'source', label: 'Source', hide: true }],
    onRow: (e) => showError(A, e), afterDraw: (w) => wireLinks(w, A) });
  ['ef-type:type', 'ef-module:module', 'ef-status:status', 'ef-emp:employee'].forEach((pair) => { const [id, key] = pair.split(':'); rec.querySelector('#' + id).addEventListener('change', (ev) => { f[key] = ev.target.value; tbl.setRows(filtered()); }); });
  rec.querySelector('#ef-sig').addEventListener('change', (ev) => { f.signals = ev.target.checked; tbl.setRows(filtered()); });
  addPanel(root.querySelector('#er-records'), panel('How errors are counted', '<ul class="apc-plain"><li>One record with one issue counts <b>once</b> per type — a sale corrected four times for the same reason is one “Correction Required”. Corrected errors stay in the history, marked CORRECTED.</li>' +
    '<li><b>Review signals</b> (' + esc(signalTypes.join(', ')) + ') are shown but not counted in error rate or accuracy — a void or a price change is not always a mistake. You can change this in Settings.</li>' +
    '<li>A person is named only when the record says who made it: the original entry on a classified correction, the person who rang the sale up, the person who created the purchase, or who added the SKU. Otherwise: Unknown / System.</li>' +
    '<li>“Mark as not a real mistake” keeps the record but stops it counting.</li></ul>', {}));
  return { destroy() {} };
}
const e_isNum = (d) => Number.isFinite(Number(d));
function addPanel(parent, html) { const t = document.createElement('div'); t.innerHTML = html; const el = t.firstElementChild; parent.appendChild(el); return el; }

function showError(A, e) {
  const body = '<div class="drawer-section">' + [['Error type', esc(e.error_type)], ['Status', chipFor(e.status)], ['Severity', chipFor(e.severity)], ['Employee', e.employee_id ? esc(e.employee_name) : '<span class="muted">Unknown / System — the record does not say who</span>'],
    ['Role / position', esc((e.role || '—') + ' · ' + (e.position || '—'))], ['Branch', esc(e.branch_name || '—')], ['Module', esc(e.module)], ['Reference', esc(e.reference)], ['Description', esc(e.description)],
    ['Found / logged', esc(fmtDateTime(e.found_at))], ['Corrected', e.fixed_at ? esc(fmtDateTime(e.fixed_at)) + (e.fixed_by_name ? ' by ' + esc(e.fixed_by_name) : '') : '—'], ['Time to correct', e.days_to_fix !== null && e.days_to_fix !== undefined ? esc(e.days_to_fix + ' days') : '—'],
    ['Waiting', e.age_days !== null && e.age_days !== undefined ? esc(e.age_days + ' days so far') : '—'], ['Repeat error', e.repeat ? 'Yes — not the first of its kind for this person' : 'No'], ['Counts toward error rate', e.counted ? 'Yes' : (e.status === 'IGNORED' ? 'No — ignored' + (e.ignored_reason ? ' (' + esc(e.ignored_reason) + ')' : '') : 'No — a review signal')], ['Source', esc(e.source)]]
    .map(([k, v]) => '<div class="drawer-kv"><span>' + esc(k) + '</span><b>' + v + '</b></div>').join('') + '</div>';
  openDrawer({ title: e.error_type, sub: e.reference, body, footer: e.status === 'IGNORED' ? btn('Count it again', 'id="er-unignore"') : btn('Mark as not a real mistake', 'id="er-ignore"', 'secondary') });
  const go = (ignore) => async (ev) => {
    const r = ignore ? await dialog({ title: 'Mark as not a real mistake', confirmLabel: 'Mark as ignored', reason: { label: 'Reason', required: true, placeholder: 'Why this is not a mistake' }, bodyHtml: '<p>' + esc(e.error_type) + ' — ' + esc(e.reference) + '. It stays in the list, marked IGNORED, and stops counting toward error rate and accuracy.</p>' }) : {};
    if (!r) return;
    guarded(ev.target, async () => { await A.api.ignoreError(e.error_key, ignore, r.reason); closeDrawer(); toast(ignore ? 'Marked as not a real mistake.' : 'Counting it again.'); await A.reload('data'); });
  };
  const a = document.getElementById('er-ignore'); if (a) a.addEventListener('click', go(true));
  const b = document.getElementById('er-unignore'); if (b) b.addEventListener('click', go(false));
}
