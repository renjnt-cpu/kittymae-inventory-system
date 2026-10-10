// Access & Performance Control Center -- the Employee Performance tab: the whole team in one sortable table, then one person in full -- profile, the figures that fit their kind of work,
// this period against the last, what the data says (strengths / needs attention), their errors and recent activity, and private owner notes.
// Every number opens the records behind it. Scores are optional, use the owner's weights, and never replace the raw figures.
import { esc, panel, stat, statGrid, money, int, rate, dash, emptyBox, loadingBox, errorBox, friendly, toast, guarded, btn, fmtDate, fmtDateTime, chipFor, accuracyHtml, accuracyOf, empLink, drillLink, wireLinks, NOT_ENOUGH, badge } from './apcCore.js?v=20261011b';
import { createClientTable } from './apcTable.js?v=20261011b';
import { mountEmployeeList } from './apcEmpList.js?v=20261011b';
import { METRICS, encoded } from './apcMetricRows.js?v=20261011b';
import { familiesOf, trendFor, reviewPanel, qualityScore, performanceScore, weightsOf, WEIGHT_LABELS, signalCounts, unitsOf } from './apcMetrics.js?v=20261011b';
import { renderCompare } from './apcCompare.js?v=20261011b';

const pref = { get(k) { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } }, set(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) { /* not remembered */ } } };
const RANKS = [['net', 'Highest Sales'], ['orders', 'Most Transactions'], ['tasks', 'Most Tasks'], ['encoded', 'Most Entries'], ['accuracy', 'Highest Accuracy'], ['errors_asc', 'Lowest Errors']];

export async function renderPeople(root, A) {
  const th = A.th(), all = A.people().filter((p) => p.perf);
  if (!A.can.analytics) { root.innerHTML = emptyBox('Staff analytics are not enabled for your account.'); return; }
  if (!all.length) { root.innerHTML = emptyBox('No employees match these filters.'); return; }
  if (!all.some((p) => p.id === A.S.selected)) A.S.selected = all[0].id;
  root.innerHTML = '<div id="pp-team"></div><div id="pp-compare"></div><div class="apc-layout"><aside class="card apc-emp-list" id="pp-list"></aside><div class="apc-emp-main" id="pp-main"></div></div>';
  const rows = all.map((p) => { const r = p.perf; return { id: p.id, name: p.name, position: p.job_title || p.position || '—', branch: p.branch_name || 'All branches', net: r.pos.net, orders: r.pos.orders, aov: r.pos.aov, items: r.pos.items,
    tasks: r.tasks.completed, encoded: encoded(r), approvals: r.other.approvals, refunds: r.other.refund_requests, voids_done: r.pos.voids_processed, adjustments: r.inventory.adjustments, scrap: r.scrap.entries,
    errors: r.errors.counted, error_rate: r.workload.total >= th.min_sample ? r.rates.error : null, accuracy: accuracyOf(r, th), units: unitsOf(r) }; });
  const team = root.querySelector('#pp-team');
  team.innerHTML = panel('Team performance', '<div id="pp-table"></div>', { sub: 'Click a name to open the full profile; click a number to see the records behind it.' });
  const tbl = createClientTable({ root: team.querySelector('#pp-table'), rows, size: 10, sort: { key: 'net', dir: 'desc' }, exportName: 'employee-performance', title: 'Employee performance', subtitle: () => A.filters.describe(),
    searchPlaceholder: 'Search employee or position…', toolbar: '<label class="sd-t-size-l">Rank by <select id="pp-rank">' + RANKS.map(([k, l]) => '<option value="' + k + '">' + l + '</option>').join('') + '</select></label>',
    onRow: (r) => A.select(r.id, 'people'), rowClass: (r) => r.id === A.S.selected ? 'apc-row-sel' : '',
    columns: [{ key: 'name', label: 'Employee', render: (r) => empLink(r.id, r.name, 'people') }, { key: 'position', label: 'Position' }, { key: 'branch', label: 'Branch', hide: true },
      { key: 'net', label: 'Total Sales', type: 'money', render: (r) => drillLink(r.id, 'pos_orders', 'POS sales rung up', money(r.net)) }, { key: 'orders', label: 'Transactions', type: 'int', render: (r) => drillLink(r.id, 'pos_orders', 'POS sales rung up', int(r.orders)) },
      { key: 'aov', label: 'Avg Transaction', type: 'money' }, { key: 'items', label: 'Items Sold', type: 'int' },
      { key: 'tasks', label: 'Tasks Completed', type: 'int', render: (r) => drillLink(r.id, 'tasks', 'Data Fix tasks completed', int(r.tasks)) }, { key: 'encoded', label: 'Entries Encoded', type: 'int' },
      { key: 'approvals', label: 'Approvals', type: 'int', render: (r) => drillLink(r.id, 'approvals', 'Approvals and decisions', int(r.approvals)) }, { key: 'refunds', label: 'Refund Requests', type: 'int' },
      { key: 'voids_done', label: 'Voids Processed', type: 'int' }, { key: 'adjustments', label: 'Inventory Adjustments', type: 'int' },
      { key: 'scrap', label: 'Scrap Entries', type: 'int', render: (r) => drillLink(r.id, 'scrap_entries', 'Scrap entries encoded', int(r.scrap)) },
      { key: 'errors', label: 'Errors', type: 'int', render: (r) => drillLink(r.id, 'errors', 'Errors', int(r.errors)) },
      { key: 'error_rate', label: 'Error Rate', type: 'pct', render: (r) => r.error_rate === null ? NOT_ENOUGH : rate(r.error_rate) }, { key: 'accuracy', label: 'Accuracy', render: (r) => r.accuracy === null ? NOT_ENOUGH : '<b>' + r.accuracy.toFixed(1) + '%</b>' }],
    afterDraw: (w) => wireLinks(w, A) });
  team.querySelector('#pp-rank').addEventListener('change', (e) => { const k = e.target.value; tbl.setSort(k === 'errors_asc' ? 'errors' : k, k === 'errors_asc' ? 'asc' : 'desc'); });
  A.compareHost = root.querySelector('#pp-compare');
  renderCompare(root.querySelector('#pp-compare'), A, all);

  const list = mountEmployeeList(root.querySelector('#pp-list'), A, { onPick: (id) => { A.S.selected = id; detail(); list.redraw(); } });
  const main = root.querySelector('#pp-main');
  async function detail() {
    const person = A.byId(A.S.selected); if (!person || !person.perf) { main.innerHTML = emptyBox('Choose an employee.'); return; }
    const r = person.perf, fams = familiesOf(r), signals = signalCounts(A.S.errs.rows)[person.id] || null;
    const rev = reviewPanel(r, A.perfRows(), th, signals), note = (A.S.notes[person.id] || {}).note || '';
    const showScores = pref.get('apc-scores');
    main.innerHTML =
      '<div class="card apc-head-card"><div class="apc-head-top"><div><h3 class="apc-emp-name">' + esc(person.name) + ' ' + chipFor(person.status) + (person.snap ? ' ' + chipFor(person.snap.verify_status) : '') + '</h3>' +
        '<div class="muted">' + esc(person.job_title || person.position || 'No position') + ' · Role: ' + esc(person.role === 'None' ? 'None (position only)' : person.role) + ' · ' + esc(person.branch_name || 'All branches') + '</div></div>' +
        '<div class="apc-nav-btns">' + btn('‹ Previous', 'id="pp-prev"', 'secondary') + btn('Next ›', 'id="pp-next"', 'secondary') + btn('Review access →', 'id="pp-access"') + '</div></div>' +
        '<div class="sd-mini apc-profile"><div><span>Last sign-in</span><b>' + (person.last_sign_in ? esc(fmtDateTime(person.last_sign_in)) : 'Never') + '</b></div><div><span>Last activity</span><b>' + (person.last_activity ? esc(fmtDateTime(person.last_activity)) : '—') + '</b></div>' +
        '<div><span>Date hired</span><b>' + (person.hire_date ? esc(fmtDate(person.hire_date)) : '—') + '</b></div><div><span>Employee code</span><b>' + esc(person.code || '—') + '</b></div></div></div>' +
      panel('This period', statGrid([
        stat('Sales', drillLink(person.id, 'pos_orders', 'POS sales rung up', money(r.pos.net)), { sub: int(r.pos.orders) + ' transactions' }), stat('Transactions', drillLink(person.id, 'pos_orders', 'POS sales rung up', int(r.pos.orders)), { sub: r.pos.aov === null ? 'no sales' : 'avg ' + money(r.pos.aov) }),
        stat('Tasks completed', drillLink(person.id, 'tasks', 'Data Fix tasks completed', int(r.tasks.completed)), { sub: int(r.tasks.open) + ' still open' }),
        stat('Errors made', drillLink(person.id, 'errors', 'Errors', int(r.errors.counted)), { sub: r.workload.total >= th.min_sample ? 'rate ' + (r.rates.error === null ? '—' : r.rates.error.toFixed(2) + '%') : 'Not enough data for a rate', tone: r.errors.counted ? 'orange' : 'green' }),
        stat('Errors resolved', int(r.errors.resolved), { sub: int(r.errors.open) + ' waiting', tone: 'green' }), stat('Approval actions', drillLink(person.id, 'approvals', 'Approvals and decisions', int(r.other.approvals))),
        stat('Encoding count', int(encoded(r)), { sub: 'scrap ' + int(r.scrap.entries) + ' · stock ' + int(r.inventory.total) + ' · other ' + int(encoded(r) - r.scrap.entries - r.inventory.total) }), stat('Accuracy', accuracyHtml(r, th), { sub: 'worked out from errors ÷ transactions' }),
      ]), { sub: A.filters.describe()[0] + ' · ' + A.filters.describe()[1] }) +
      '<div id="pp-trend"></div>' +
      panel('Figures for their kind of work', '<div id="pp-metrics"></div>', { sub: fams.length ? 'Showing the kinds of work they did in this period: ' + fams.join(', ') + '. Figures that do not apply to them are left out, not shown as zero.' : 'No recorded work in this period.',
        actions: '<label class="sd-inline"><input type="checkbox" id="pp-allm"> Show every figure</label>' }) +
      panel('Optional score', '<div id="pp-score"></div>', { sub: 'A review aid only — never used for pay or discipline. Weights are yours to set (Settings).', actions: '<label class="sd-inline"><input type="checkbox" id="pp-showscore"' + (showScores ? ' checked' : '') + '> Show scores</label>' }) +
      panel('What the data shows', '<div class="apc-review-cols"><div><h4>Strengths</h4>' + (rev.strengths.length ? '<ul class="apc-plain">' + rev.strengths.map((s) => '<li>' + esc(s.text) + ' <span class="muted">' + esc(s.metric) + '</span></li>').join('') + '</ul>' : '<p class="muted">Nothing stands out this period.</p>') + '</div>' +
        '<div><h4>Needs attention</h4>' + (rev.attention.length ? '<ul class="apc-plain">' + rev.attention.map((s) => '<li>' + badge('Needs Review', s.severity === 'red' ? 'red' : s.severity === 'gray' ? 'gray' : 'orange') + ' ' + esc(s.text) + ' <span class="muted">' + esc(s.metric) + '</span></li>').join('') + '</ul>' : '<p class="muted">Nothing needs attention.</p>') + '</div></div>', { sub: 'Based only on the figures — no judgement of character.' }) +
      panel('Errors', '<div id="pp-errors"></div>', { sub: 'Only errors the record ties to this person. Where the record does not say who, it is “Unknown / System”.' }) +
      panel('Recent activity', '<div id="pp-activity">' + loadingBox() + '</div>') +
      panel('Owner notes (private)', '<textarea id="pp-note" rows="3" maxlength="4000" placeholder="e.g. Needs training on supplier price encoding." style="width:100%;">' + esc(note) + '</textarea><p class="muted sd-small">Only you can see this. It is never shown to ' + esc(person.name.split(' ')[0]) + ' or anyone else.</p>' + btn('Save note', 'id="pp-savenote"', 'secondary'));
    wireLinks(main, A);
    main.querySelector('#pp-prev').addEventListener('click', () => { A.S.selected = A.nextEmployee(-1, all.filter((p) => list.ids().includes(p.id))); detail(); list.redraw(); });
    main.querySelector('#pp-next').addEventListener('click', () => { A.S.selected = A.nextEmployee(1, all.filter((p) => list.ids().includes(p.id))); detail(); list.redraw(); });
    main.querySelector('#pp-access').addEventListener('click', () => A.go('access'));
    const drawMetrics = () => {
      const every = main.querySelector('#pp-allm').checked, list2 = METRICS.filter((x) => every || x.fam === 'all' || fams.includes(x.fam));
      main.querySelector('#pp-metrics').innerHTML = '<div class="table-scroll"><table class="sd-tbl"><thead><tr><th>Figure</th><th class="sd-num">This period</th><th class="sd-num">Previous</th><th class="sd-num">Change</th></tr></thead><tbody>' +
        list2.map((x) => '<tr data-m="' + x.id + '"><td>' + esc(x.label) + '</td><td class="sd-num">' + (x.drill ? drillLink(person.id, x.drill, x.label, fmtM(x, r, th)) : fmtM(x, r, th)) + '</td><td class="sd-num" data-prev>…</td><td class="sd-num" data-chg></td></tr>').join('') + '</tbody></table></div>';
      wireLinks(main.querySelector('#pp-metrics'), A); fillPrev(list2);
    };
    let prevRow = null;
    function fillPrev(list2) {
      if (!prevRow && prevRow !== false) return;
      main.querySelectorAll('#pp-metrics tr[data-m]').forEach((tr) => {
        const x = list2.find((y) => y.id === tr.dataset.m); if (!x) return;
        tr.querySelector('[data-prev]').innerHTML = prevRow ? fmtM(x, prevRow, th) : dash;
        const c = prevRow ? Number(x.get(r, th)) - Number(x.get(prevRow, th)) : NaN;
        tr.querySelector('[data-chg]').innerHTML = Number.isFinite(c) && c !== 0 ? '<span class="sd-chip sd-c-' + (x.good ? ((c > 0) === (x.good === 'up') ? 'green' : 'red') : 'gray') + '">' + (c > 0 ? '▲' : '▼') + ' ' + (Math.abs(c) >= 100 ? int(Math.abs(c)) : Math.abs(c).toFixed(1)) + '</span>' : dash;
      });
    }
    main.querySelector('#pp-allm').addEventListener('change', drawMetrics);
    drawMetrics();
    A.prevPerf().then((rowsPrev) => {
      prevRow = rowsPrev.find((x) => x.id === person.id) || false; fillPrev(METRICS);
      const tr = trendFor(r, prevRow || null, th);
      main.querySelector('#pp-trend').innerHTML = panel('This period against the last', '<div class="sd-stats">' + tr.map((t) => '<div class="sd-stat sd-tone-' + (t.tone === 'green' ? 'green' : t.tone === 'red' ? 'red' : 'gray') + '"><span class="sd-stat-l">' + esc(t.label) + '</span><span class="sd-stat-v">' + fmtT(t, t.cur) + '</span>' +
        '<span class="sd-chip sd-c-' + t.tone + '">' + (t.dir === 'up' ? '▲' : t.dir === 'down' ? '▼' : t.dir === 'flat' ? '▬' : '') + ' ' + (t.change === null ? 'No comparison' : (t.change > 0 ? '+' : '') + t.change.toFixed(1) + '%') + '</span><span class="sd-stat-s">Previous: ' + fmtT(t, t.prev) + '</span></div>').join('') + '</div>', { sub: 'Previous period: ' + A.filters.prev().from + ' → ' + A.filters.prev().to });
    }).catch(() => { const e = main.querySelector('#pp-trend'); if (e) e.innerHTML = ''; });
    const drawScore = () => {
      const el = main.querySelector('#pp-score'); if (!main.querySelector('#pp-showscore').checked) { el.innerHTML = '<p class="muted">Hidden. Tick “Show scores” to see them — the raw figures above are always shown.</p>'; return; }
      const peers = A.perfRows(), q = qualityScore(r, peers, weightsOf(A.ctx, 'sales_quality_weights'), th), p = performanceScore(r, peers, weightsOf(A.ctx, 'performance_weights'), th);
      const block = (title, s) => '<div class="apc-score"><h4>' + esc(title) + '</h4>' + (s ? '<div class="apc-score-n">' + s.score.toFixed(1) + '<span class="muted"> / 100</span></div><ul class="apc-plain">' + s.parts.map((x) => '<li>' + esc(WEIGHT_LABELS[x.key] || x.key) + ': ' + (x.value === null ? '<span class="muted">not enough data</span>' : '<b>' + x.value.toFixed(0) + '</b>') + ' <span class="muted">(weight ' + x.weight + ')</span></li>').join('') + '</ul>' : '<p class="muted">Not enough data for a fair score.</p>') + '</div>';
      el.innerHTML = '<div class="apc-score-grid">' + block('Sales quality score', fams.includes('pos') ? q : null) + block('Performance score', p) + '</div>';
    };
    main.querySelector('#pp-showscore').addEventListener('change', (e) => { pref.set('apc-scores', e.target.checked); drawScore(); });
    drawScore();
    // errors + activity + note
    const mine = (A.S.errs.rows || []).filter((e) => e.employee_id === person.id);
    main.querySelector('#pp-errors').innerHTML = mine.length ? '<div class="table-scroll"><table class="sd-tbl"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Status</th><th>Severity</th></tr></thead><tbody>' + mine.slice(0, 10).map((e) => '<tr><td>' + esc(fmtDate(String(e.found_at).slice(0, 10))) + '</td><td>' + esc(e.error_type) + (e.repeat ? ' ' + badge('Repeat', 'orange') : '') + '</td><td>' + esc(e.reference) + '</td><td>' + chipFor(e.status) + '</td><td>' + chipFor(e.severity) + '</td></tr>').join('') + '</tbody></table></div>' + (mine.length > 10 ? '<p class="muted">+ ' + (mine.length - 10) + ' more — ' : '<p>') + '<button type="button" class="act-link" id="pp-all-err">Open the Errors tab</button></p>' : '<p class="muted">No errors tied to ' + esc(person.name) + ' in this period.</p>';
    const ae = main.querySelector('#pp-all-err'); if (ae) ae.addEventListener('click', () => A.go('errors'));
    A.api.activity(Object.assign({ employee: person.id, limit: 12 }, A.filters.server())).then((a) => {
      main.querySelector('#pp-activity').innerHTML = a.rows.length ? '<ul class="apc-plain">' + a.rows.map((x) => '<li><span class="muted">' + esc(fmtDateTime(x.at)) + '</span> <b>' + esc(x.module) + '</b> ' + esc(x.action) + ' <span class="muted">' + esc(x.title || '') + (x.branch_name ? ' · ' + esc(x.branch_name) : '') + '</span></li>').join('') + '</ul>' : '<p class="muted">No recorded activity in this period.</p>';
    }).catch((err) => { main.querySelector('#pp-activity').innerHTML = errorBox(friendly(err)); });
    main.querySelector('#pp-savenote').addEventListener('click', (e) => guarded(e.target, async () => { const v = main.querySelector('#pp-note').value; await A.api.setNote(person.id, v); A.S.notes[person.id] = v.trim() ? { note: v.trim() } : undefined; if (!v.trim()) delete A.S.notes[person.id]; toast('Note saved (private).'); }));
  }
  detail();
  return { destroy() {} };
}
function fmtM(x, r, th) { const v = x.get(r, th); return v === null || v === undefined ? '—' : (x.needsSample && r.workload.total < th.min_sample ? 'Not enough data' : x.fmt(v)); }
function fmtT(t, v) { if (v === null || v === undefined) return '—'; return t.kind === 'money' ? money(v) : t.kind === 'pct' ? Number(v).toFixed(1) + '%' : int(v); }
