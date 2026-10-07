// Access & Performance Control Center -- the three ranking tabs: Sales Ranking (who rings up the most, with the quality figures beside it so a big number is never the whole story),
// POS Performance (the counter, with gentle "Needs Review" alerts), and Scrap Performance (who encodes scrap, plus grams by purity).
// Attribution is explicit: POS sales go to the person who rang the sale up, scrap goes to whoever created the entry (never whoever edited it last), online orders to their own fields.
import { esc, panel, money, int, rate, grams, emptyBox, loadingBox, errorBox, friendly, accuracyOf, NOT_ENOUGH, empLink, wireLinks, drillLink, badge, btn } from './apcCore.js?v=20261008a';
import { createClientTable } from './apcTable.js?v=20261008a';
import { qualityScore, weightsOf, signalCounts } from './apcMetrics.js?v=20261008a';

const pref = { get() { try { return localStorage.getItem('apc-scores') === '1'; } catch (e) { return false; } }, set(v) { try { localStorage.setItem('apc-scores', v ? '1' : '0'); } catch (e) { /* not remembered */ } } };
const rankBadge = (i) => '<span class="apc-rank apc-rank-' + (i <= 3 ? i : 'n') + '">' + i + '</span>';
const n = (v) => Number(v) || 0;
const sampleOk = (r, th) => r.workload.total >= th.min_sample;
function add(root, html) { const t = document.createElement('div'); t.innerHTML = html; const el = t.firstElementChild; root.appendChild(el); return el; }

// ---------------------------------------------------------------- Sales Ranking
export async function renderSales(root, A) {
  const th = A.th(), people = A.people().filter((p) => p.perf && p.perf.pos.orders > 0);
  const all = A.perfRows(), showScore = pref.get(), w = weightsOf(A.ctx, 'sales_quality_weights');
  const ranked = people.slice().sort((a, b) => n(b.perf.pos.net) - n(a.perf.pos.net)).map((p, i) => {
    const r = p.perf, q = qualityScore(r, all, w, th);
    return { id: p.id, rank: i + 1, name: p.name, position: p.job_title || p.position || '—', branch: p.branch_name || 'All branches', orders: r.pos.orders, items: r.pos.items, gross: r.pos.gross, net: r.pos.net, aov: r.pos.aov,
      discount: r.pos.discount, voids: r.pos.voids, void_rate: r.pos.void_rate, discount_rate: r.pos.discount_rate, error_rate: sampleOk(r, th) ? r.rates.error : null, accuracy: accuracyOf(r, th), score: q ? q.score : null };
  });
  root.innerHTML = panel('Sales ranking', '<p class="muted sd-small">Ranked by <b>net sales</b> (gross − discounts) for the person who <b>rang the sale up</b> at the counter. The quality columns sit beside it so a high total is read together with voids, discounts and errors. ' +
    'Refunds and returns cannot be tied to the seller yet (a refund names the order, not who sold it), so they are not ranked here.</p><div id="sr-table"></div>', {
    actions: '<label class="sd-inline"><input type="checkbox" id="sr-score"' + (showScore ? ' checked' : '') + '> Show Sales Quality Score</label> <button type="button" class="act-link" id="sr-weights">Weights</button>' });
  const cols = [{ key: 'rank', label: 'Rank', type: 'int', render: (r) => rankBadge(r.rank) }, { key: 'name', label: 'Employee', render: (r) => empLink(r.id, r.name, 'people') }, { key: 'position', label: 'Position' }, { key: 'branch', label: 'Branch', hide: true },
    { key: 'orders', label: 'Orders', type: 'int', render: (r) => drillLink(r.id, 'pos_orders', 'POS sales rung up', int(r.orders)) }, { key: 'items', label: 'Items Sold', type: 'int' }, { key: 'gross', label: 'Gross Sales', type: 'money' },
    { key: 'net', label: 'Net Sales', type: 'money' }, { key: 'aov', label: 'Average Order Value', type: 'money' }, { key: 'discount', label: 'Discounts', type: 'money' },
    { key: 'voids', label: 'Voids', type: 'int', render: (r) => drillLink(r.id, 'voids', 'Sales voided or deleted', int(r.voids)) },
    { key: 'void_rate', label: 'Void Rate', type: 'pct', render: (r) => (n(r.orders) + n(r.voids) >= th.min_sample ? rate(r.void_rate) : NOT_ENOUGH) }, { key: 'discount_rate', label: 'Discount Rate', type: 'pct', render: (r) => (n(r.orders) >= th.min_sample ? rate(r.discount_rate) : NOT_ENOUGH) },
    { key: 'error_rate', label: 'Error Rate', type: 'pct', render: (r) => (r.error_rate === null ? NOT_ENOUGH : rate(r.error_rate)) }, { key: 'accuracy', label: 'Accuracy', render: (r) => (r.accuracy === null ? NOT_ENOUGH : r.accuracy.toFixed(1) + '%') }]
    .concat(showScore ? [{ key: 'score', label: 'Quality Score', render: (r) => (r.score === null ? NOT_ENOUGH : '<b>' + r.score.toFixed(1) + '</b>') }] : []);
  createClientTable({ root: root.querySelector('#sr-table'), rows: ranked, size: 25, sort: { key: 'net', dir: 'desc' }, exportName: 'sales-ranking', title: 'Sales ranking', subtitle: () => A.filters.describe(), columns: cols,
    rowClass: (r) => (r.rank === 1 ? 'apc-top1' : r.rank <= 3 ? 'apc-top3' : ''), emptyText: 'No POS sales in this period.', afterDraw: (wr) => wireLinks(wr, A),
    totals: (list) => ({ orders: list.reduce((s, r) => s + n(r.orders), 0), items: list.reduce((s, r) => s + n(r.items), 0), gross: list.reduce((s, r) => s + n(r.gross), 0), net: list.reduce((s, r) => s + n(r.net), 0), discount: list.reduce((s, r) => s + n(r.discount), 0), voids: list.reduce((s, r) => s + n(r.voids), 0) }) });
  root.querySelector('#sr-score').addEventListener('change', (e) => { pref.set(e.target.checked); A.go('sales'); });
  root.querySelector('#sr-weights').addEventListener('click', () => A.openSettings());
  loadOnline(A, root);
  return { destroy() {} };
}

// Online orders (Pancake) keep their own attribution fields -- they are never mixed into the POS ranking above.
const CARE_ALIASES = { NISSY: 'Nissa Kittymae' };
async function loadOnline(A, root) {
  const f = A.filters.server();
  const p1 = add(root, panel('Online orders — packed by', '<div id="on-packed">' + loadingBox() + '</div>', { sub: 'Who marked Pancake order items as Packing (the credit stays with the packer even after delivery).' }));
  const p2 = add(root, panel('Online orders — customer care (Pancake)', '<div id="on-care">' + loadingBox() + '</div>', { sub: 'Who is assigned to the order inside Pancake (the staff who handled the sale). Names are Pancake’s own account names, shown as they are.' }));
  try {
    const rows = await A.api.packedOrders(f), by = {};
    rows.forEach((r) => { const nm = (r.packer && r.packer.full_name) || 'Unknown'; const e = by[nm] || (by[nm] = { name: nm, refs: new Set(), qty: 0 }); e.refs.add(r.order_reference); e.qty += n(r.qty); });
    const list = Object.values(by).map((e) => ({ name: e.name, orders: e.refs.size, qty: e.qty })).sort((a, b) => b.orders - a.orders).map((r, i) => Object.assign(r, { rank: i + 1 }));
    createClientTable({ root: p1.querySelector('#on-packed'), rows: list, size: 10, noSearch: true, sort: { key: 'orders', dir: 'desc' }, exportName: 'online-packed-by', title: 'Online orders packed by', subtitle: () => A.filters.describe(),
      columns: [{ key: 'rank', label: 'Rank', type: 'int', render: (r) => rankBadge(r.rank) }, { key: 'name', label: 'Employee' }, { key: 'orders', label: 'Orders Packed', type: 'int' }, { key: 'qty', label: 'Qty Packed', type: 'int' }], emptyText: 'No packed items in this period.' });
  } catch (err) { p1.querySelector('#on-packed').innerHTML = errorBox(friendly(err)); }
  try {
    const rows = await A.api.careAssignments(f), by = {};
    rows.forEach((r) => { const raw = (r.care && r.care.name || '').trim(), nm = CARE_ALIASES[raw] || raw || 'Unknown'; const e = by[nm] || (by[nm] = { name: nm, refs: new Set(), qty: 0, amount: 0 }); if (!e.refs.has(r.order_reference)) e.amount += n(r.amount); e.refs.add(r.order_reference); e.qty += n(r.qty); });
    const list = Object.values(by).map((e) => ({ name: e.name, orders: e.refs.size, qty: e.qty, amount: e.amount })).sort((a, b) => b.orders - a.orders).map((r, i) => Object.assign(r, { rank: i + 1 }));
    createClientTable({ root: p2.querySelector('#on-care'), rows: list, size: 10, noSearch: true, sort: { key: 'orders', dir: 'desc' }, exportName: 'online-customer-care', title: 'Online orders by customer care', subtitle: () => A.filters.describe(),
      columns: [{ key: 'rank', label: 'Rank', type: 'int', render: (r) => rankBadge(r.rank) }, { key: 'name', label: 'Staff (Pancake account)' }, { key: 'orders', label: 'Orders', type: 'int' }, { key: 'qty', label: 'Qty', type: 'int' }, { key: 'amount', label: 'Total Amount', type: 'money' }], emptyText: 'No Pancake care assignments in this period.' });
  } catch (err) { p2.querySelector('#on-care').innerHTML = errorBox(friendly(err)); }
}

// ---------------------------------------------------------------- POS Performance
export async function renderPos(root, A) {
  const th = A.th(), people = A.people().filter((p) => p.perf && (p.perf.pos.orders > 0 || p.perf.pos.voids > 0)), signals = signalCounts(A.S.errs.rows);
  const ranked = people.slice().sort((a, b) => n(b.perf.pos.net) - n(a.perf.pos.net)).map((p, i) => { const r = p.perf; return { id: p.id, rank: i + 1, name: p.name, branch: p.branch_name || 'All branches', orders: r.pos.orders, gross: r.pos.gross, net: r.pos.net, items: r.pos.items,
    basket: r.pos.aov, discount: r.pos.discount, voids: r.pos.voids, errors: r.errors.pos, manual: (signals[p.id] || {}).manual || 0, void_rate: r.pos.void_rate, discount_rate: r.pos.discount_rate }; });
  root.innerHTML = panel('POS performance', '<p class="muted sd-small">The counter, by the person who rang the sale up. The branch comes from the global filter above. Not recorded anywhere yet: POS terminal, cash difference at close, and refunds per seller — those columns are left out rather than shown as zero.</p>' +
    '<div class="sd-fb-row" style="margin-bottom:8px;"><div class="field"><label for="pos-emp">Employee</label><select id="pos-emp"><option value="">All who sold</option>' + ranked.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="pos-term">POS terminal</label><select id="pos-term" disabled><option>Not recorded</option></select></div></div><div id="pos-table"></div>');
  const tbl = createClientTable({ root: root.querySelector('#pos-table'), rows: ranked, size: 25, sort: { key: 'net', dir: 'desc' }, exportName: 'pos-ranking', title: 'POS ranking', subtitle: () => A.filters.describe(), emptyText: 'No POS sales in this period.',
    columns: [{ key: 'rank', label: 'Rank', type: 'int', render: (r) => rankBadge(r.rank) }, { key: 'name', label: 'Employee', render: (r) => empLink(r.id, r.name, 'people') }, { key: 'branch', label: 'Branch' },
      { key: 'orders', label: 'Transactions', type: 'int', render: (r) => drillLink(r.id, 'pos_orders', 'POS sales rung up', int(r.orders)) }, { key: 'gross', label: 'Gross Sales', type: 'money' }, { key: 'net', label: 'Net Sales', type: 'money' },
      { key: 'items', label: 'Items Sold', type: 'int' }, { key: 'basket', label: 'Average Basket', type: 'money' }, { key: 'discount', label: 'Discounts', type: 'money' },
      { key: 'voids', label: 'Voids', type: 'int', render: (r) => drillLink(r.id, 'voids', 'Sales voided or deleted', int(r.voids)) }, { key: 'errors', label: 'Errors', type: 'int', render: (r) => drillLink(r.id, 'errors', 'Errors', int(r.errors)) }],
    afterDraw: (wr) => wireLinks(wr, A), rowClass: (r) => (r.rank === 1 ? 'apc-top1' : '') });
  root.querySelector('#pos-emp').addEventListener('change', (e) => { const id = e.target.value; tbl.setRows(id ? ranked.filter((r) => r.id === id) : ranked); });
  // alerts: "Needs Review", never an accusation
  const alerts = [];
  ranked.forEach((r) => {
    if (n(r.orders) + n(r.voids) >= th.min_sample && n(r.void_rate) >= th.void_rate_pct) alerts.push([r, 'High void rate', rate(r.void_rate) + ' of their sales were voided or deleted']);
    if (n(r.orders) >= th.min_sample && n(r.discount_rate) >= th.discount_rate_pct) alerts.push([r, 'High discount rate', rate(r.discount_rate) + ' of gross sales given as discount']);
    if (r.manual >= th.repeat_error_count) alerts.push([r, 'Too many manual price changes', r.manual + ' price edits after the sale']);
    if (r.voids >= th.repeat_error_count) alerts.push([r, 'Too many cancelled transactions', r.voids + ' voided or deleted']);
  });
  const ap = add(root, panel('POS alerts', alerts.length ? '<div class="table-scroll"><table class="sd-tbl"><thead><tr><th>Employee</th><th>Alert</th><th>Detail</th></tr></thead><tbody>' + alerts.map(([r, a, d]) =>
    '<tr><td>' + empLink(r.id, r.name, 'people') + '</td><td>' + badge('Needs Review', 'orange') + ' ' + esc(a) + '</td><td class="sd-small">' + d + '</td></tr>').join('') + '</tbody></table></div>' : emptyBox('Nothing unusual at the counter in this period.'),
    { sub: 'These are prompts to look, using your thresholds (Settings). High refund rate and cash variance cannot be checked yet — refunds are not tied to a seller and there is no cash-count record.' }));
  wireLinks(ap, A);
  return { destroy() {} };
}

// ---------------------------------------------------------------- Scrap Performance
const KARATS = ['10K', '14K', '16K', '18K', '21K', '22K', '24K', 'Other'];
const scrapSel = { karats: new Set(), employee: '' };
export async function renderScrap(root, A) {
  const th = A.th();
  root.innerHTML = panel('Scrap performance', '<p class="muted sd-small">Who encodes scrap, credited to whoever <b>created</b> the entry. Grams and value come from the entry lines, so an entry with two purities counts under each. Date range and branch follow the filters above.</p>' +
    '<div class="sd-fb-row"><div class="field"><label for="sc-emp">Employee</label><select id="sc-emp"><option value="">All encoders</option></select></div>' +
    '<div class="field"><label>Purity / Karat <span class="muted">(click to filter)</span></label><div class="apc-cats">' + KARATS.map((k) => '<button type="button" class="cat-pill' + (scrapSel.karats.has(k) ? ' active' : '') + '" data-k="' + k + '">' + k + '</button>').join('') +
    (scrapSel.karats.size ? ' <button type="button" class="btn small secondary" id="sc-clear">Clear</button>' : '') + '</div></div>' +
    '<div class="field"><label for="sc-sort">Sort by</label><select id="sc-sort"><option value="entries">Entries encoded</option><option value="value">Total value</option><option value="grams">Grams received</option><option value="avg_grams">Average grams</option><option value="avg_value">Average value</option><option value="errors">Errors</option><option value="name">Employee</option></select></div>' +
    '<div class="field"><label for="sc-dir">Direction</label><select id="sc-dir"><option value="desc">Highest first</option><option value="asc">Lowest first</option></select></div></div><div id="sc-table">' + loadingBox() + '</div>');
  root.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { if (scrapSel.karats.has(b.dataset.k)) scrapSel.karats.delete(b.dataset.k); else scrapSel.karats.add(b.dataset.k); A.go('scrap'); }));
  const clr = root.querySelector('#sc-clear'); if (clr) clr.addEventListener('click', () => { scrapSel.karats.clear(); A.go('scrap'); });
  const f = Object.assign({}, A.filters.server(), { karats: [...scrapSel.karats].filter((k) => k !== 'Other') });
  let data;
  try { data = await A.api.scrapPerformance(f); } catch (err) { root.querySelector('#sc-table').innerHTML = errorBox(friendly(err)); return { destroy() {} }; }
  const mk = (r, i) => ({ id: r.id, rank: i + 1, name: r.name, position: r.position || '—', branch: r.branch_name || 'All branches', entries: r.entries, value: r.value, grams: r.grams, avg_grams: r.avg_grams, avg_value: r.avg_value,
    corrections: r.corrections, errors: r.errors, error_rate: r.error_rate, accuracy: r.entries >= th.min_sample && r.error_rate !== null ? Math.max(0, 100 - r.error_rate) : null });
  const rows = (data.rows || []).map(mk), sel = root.querySelector('#sc-emp');
  rows.forEach((r) => sel.insertAdjacentHTML('beforeend', '<option value="' + esc(r.id) + '"' + (scrapSel.employee === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'));
  const tableRoot = root.querySelector('#sc-table');
  const tbl = createClientTable({ root: tableRoot, rows: scrapSel.employee ? rows.filter((r) => r.id === scrapSel.employee) : rows, size: 25, sort: { key: 'entries', dir: 'desc' }, exportName: 'scrap-ranking', title: 'Scrap ranking',
    subtitle: () => A.filters.describe().concat(['Purity: ' + (scrapSel.karats.size ? [...scrapSel.karats].join(', ') : 'all')]), emptyText: 'No scrap entries for these filters.',
    columns: [{ key: 'rank', label: 'Rank', type: 'int', render: (r) => rankBadge(r.rank) }, { key: 'name', label: 'Employee', render: (r) => empLink(r.id, r.name, 'people') }, { key: 'entries', label: 'Entries Encoded', type: 'int', render: (r) => drillLink(r.id, 'scrap_entries', 'Scrap entries encoded', int(r.entries)) },
      { key: 'value', label: 'Total Value', type: 'money' }, { key: 'grams', label: 'Grams Received', type: 'num', render: (r) => grams(r.grams) }, { key: 'avg_grams', label: 'Average Grams per Entry', type: 'num', render: (r) => grams(r.avg_grams) },
      { key: 'avg_value', label: 'Average Value per Entry', type: 'money' }, { key: 'corrections', label: 'Corrections', type: 'int' }, { key: 'errors', label: 'Errors', type: 'int', render: (r) => drillLink(r.id, 'errors', 'Errors', int(r.errors)) },
      { key: 'accuracy', label: 'Accuracy Rate', render: (r) => (r.accuracy === null ? NOT_ENOUGH : '<b>' + r.accuracy.toFixed(1) + '%</b>') }],
    totals: (list) => ({ entries: list.reduce((s, r) => s + n(r.entries), 0), value: list.reduce((s, r) => s + n(r.value), 0), grams: list.reduce((s, r) => s + n(r.grams), 0) }), afterDraw: (wr) => wireLinks(wr, A) });
  sel.addEventListener('change', (e) => { scrapSel.employee = e.target.value; tbl.setRows(scrapSel.employee ? rows.filter((r) => r.id === scrapSel.employee) : rows); loadPurity(); });
  root.querySelector('#sc-sort').addEventListener('change', () => tbl.setSort(root.querySelector('#sc-sort').value, root.querySelector('#sc-dir').value));
  root.querySelector('#sc-dir').addEventListener('change', () => tbl.setSort(root.querySelector('#sc-sort').value, root.querySelector('#sc-dir').value));
  const pp = add(root, panel('Total grams received, by purity', '<div id="sc-purity">' + loadingBox() + '</div>', { sub: 'Same range, branch and employee as above. “Other” holds anything that is not one of the standard karats (the actual values are listed).' }));
  async function loadPurity() {
    const el = pp.querySelector('#sc-purity');
    try {
      const r = await A.api.scrapPurity(Object.assign({}, A.filters.server(), { employee: scrapSel.employee || null }));
      const metals = [...new Set((r.rows || []).map((x) => x.metal))]; if (!metals.length) { el.innerHTML = emptyBox('No scrap received for these filters.'); return; }
      const out = []; metals.forEach((m) => KARATS.forEach((k) => { const hit = r.rows.find((x) => x.metal === m && x.karat === k); out.push({ metal: m, karat: k, grams: hit ? hit.grams : 0, value: hit ? hit.value : 0, entries: hit ? hit.entries : 0, raw: hit && hit.raw ? hit.raw : '' }); }));
      createClientTable({ root: el, rows: out, size: 25, noSearch: true, sort: { key: null }, exportName: 'scrap-by-purity', title: 'Scrap received by purity', subtitle: () => A.filters.describe(), emptyText: 'No scrap received.',
        columns: [{ key: 'metal', label: 'Metal' }, { key: 'karat', label: 'Karat / Purity', render: (r) => esc(r.karat) + (r.raw ? ' <span class="muted">(' + esc(r.raw) + ')</span>' : '') }, { key: 'grams', label: 'Total Grams', type: 'num', render: (r) => grams(r.grams) }, { key: 'value', label: 'Total Value', type: 'money' }, { key: 'entries', label: 'Entry Count', type: 'int' }],
        totals: (list) => ({ grams: list.reduce((s, r) => s + n(r.grams), 0), value: list.reduce((s, r) => s + n(r.value), 0), entries: list.reduce((s, r) => s + n(r.entries), 0) }) });
    } catch (err) { el.innerHTML = errorBox(friendly(err)); }
  }
  loadPurity();
  return { destroy() {} };
}
