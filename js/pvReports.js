// Payment Verification page -- the Reports tab (verified, pending, rejected, duplicate references and pictures, by account / method / branch / source / customer / staff
// verifier, and a daily summary) and the Audit Log tab (every action: who, when, what changed, why). Both can be exported to a spreadsheet by people holding the export key.
import { esc, money, fmtDate, fmtDateTime, manilaToday, statusLabel, riskLabel, sourceLabel, eventLabel, eventDetail, EVENT_TYPES_FOR_FILTER, toCsv, downloadText, friendly, debounce, plural, pancakeStatusLabel } from './pvFormat.js?v=20261018b';
import { emptyBox } from './pvUi.js?v=20261018b';

const REPORTS = [
  ['verified', 'Verified payments', 'Everything a person verified in the period'],
  ['pending', 'Pending verification', 'What is still waiting, oldest first'],
  ['rejected', 'Rejected / unverified', 'Rejected, confirmed duplicates and taken-back verifications'],
  ['duplicate_references', 'Duplicate references', 'Reference numbers used on more than one order'],
  ['duplicate_images', 'Duplicate pictures', 'The same picture used on more than one order'],
  ['by_account', 'By account', 'Payments per account customers paid into'],
  ['by_method', 'By payment method', 'GCash, Maya, bank transfers…'],
  ['by_branch', 'By branch', 'Payments per branch'],
  ['by_source', 'By source', 'Pancake chat, Online Orders, manual entry'],
  ['by_shop', 'By Pancake shop', 'Miss Kittymae Jewels and Kittymae.co side by side'],
  ['by_attacher', 'By who attached it', 'The Pancake admins and ERP staff who attached the reference, and how much of it was verified'],
  ['by_customer', 'By customer', 'Payments per customer'],
  ['by_verifier', 'By staff verifier', 'Who verified how much'],
  ['daily', 'Daily summary', 'Received, verified, rejected and overridden each day'],
];
const AMOUNT_COL = /amount/i;

function cellText(col, v) {
  if (v === null || v === undefined || v === '') return '';
  if (col.key === 'status') return statusLabel(v);
  if (col.key === 'pancake_status') return pancakeStatusLabel(v);
  if (col.type === 'link') return 'Open ↗';
  if (col.key === 'resolution' || col.key === 'statuses') return String(v).split(', ').map(statusLabel).join(', ');
  if (col.key === 'risk') return v === 'NONE' ? '' : riskLabel(v);
  if (col.key === 'source' || col.key === 'sources') return String(v).split(', ').map(sourceLabel).join(', ');
  if (col.type === 'datetime') return fmtDateTime(v);
  if (col.type === 'number' && AMOUNT_COL.test(col.key)) return money(v);
  if (col.type === 'number') return Number(v).toLocaleString('en-PH');
  if (col.key === 'day') return fmtDate(v);
  return String(v);
}
const rawCell = (col, v) => (v === null || v === undefined) ? '' : (col.type === 'datetime' ? (v ? new Date(v).toISOString() : '') : col.key === 'status' ? statusLabel(v) : col.key === 'pancake_status' ? pancakeStatusLabel(v)
  : (col.key === 'resolution' || col.key === 'statuses') ? String(v).split(', ').map(statusLabel).join(', ') : col.key === 'risk' ? (v === 'NONE' ? '' : riskLabel(v)) : v);

/** a table cell: plain text, except a link column (the order in Pancake), which opens in a new tab when its address is a Pancake https address */
function cellHtml(col, v) {
  if (col.type === 'link') return v && /^https:\/\//.test(String(v)) ? '<a class="pv-orderlink" href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">Open ↗</a>' : '';
  return esc(cellText(col, v));
}

export async function renderReports(ctx, panel) {
  const st = ctx.ui.report;
  const t = manilaToday();
  if (!st.from) { const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 30); st.from = d.toISOString().slice(0, 10); st.to = t; }
  const canExport = ctx.can('payment_verify.export_reports');
  panel.innerHTML = '<div class="card"><div class="pv-reportpick" role="group" aria-label="Choose a report">' + REPORTS.map(([k, label, hint]) =>
      '<button type="button" class="bl-chip' + (st.kind === k ? ' bl-chip-on' : '') + '" data-kind="' + k + '" title="' + esc(hint) + '">' + esc(label) + '</button>').join('') + '</div>' +
    '<div class="pv-toolrow"><div class="field"><label for="pv-r-from">From</label><input id="pv-r-from" type="date" value="' + esc(st.from) + '"></div><div class="field"><label for="pv-r-to">To</label><input id="pv-r-to" type="date" value="' + esc(st.to) + '"></div>' +
    (ctx.scope.allBranches && ctx.branches.length > 1 ? '<div class="field"><label for="pv-r-branch">Branch</label><select id="pv-r-branch"><option value="">All branches</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (String(b.id) === String(st.branch) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' : '') +
    '<div class="field"><label>&nbsp;</label><div class="pv-btnrow"><button type="button" class="btn" id="pv-r-run">Show report</button>' + (canExport ? '<button type="button" class="btn secondary" id="pv-r-csv" disabled>Download spreadsheet (CSV)</button>' : '') + '</div></div></div></div>' +
    '<div id="pv-r-out"></div>';

  const out = panel.querySelector('#pv-r-out');
  let last = null;
  async function run() {
    st.from = panel.querySelector('#pv-r-from').value; st.to = panel.querySelector('#pv-r-to').value;
    const br = panel.querySelector('#pv-r-branch'); st.branch = br ? br.value : '';
    out.innerHTML = '<p class="muted">Working it out…</p>';
    try {
      const res = await ctx.api.report(st.kind, st.from, st.to, st.branch ? Number(st.branch) : null);
      if (!res || res.ok === false) { out.innerHTML = '<div class="msg error">' + esc((res && res.message) || 'The report could not be made.') + '</div>'; return; }
      last = res;
      const cols = res.columns, rows = res.rows;
      const totals = cols.map((c) => (c.type === 'number' ? rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0) : null));
      const summable = (c) => c.type === 'number' && !/days|waiting/i.test(c.key);
      out.innerHTML = '<div class="card"><div class="pv-cardhead"><div><h3 class="pv-h3">' + esc(res.title) + '</h3><div class="muted">' + esc(fmtDate(res.from)) + ' – ' + esc(fmtDate(res.to)) + ' · ' + esc(plural(rows.length, 'row')) + '</div></div></div>' +
        (rows.length ? '<div class="table-scroll pv-reporttable"><table class="pv-table"><thead><tr>' + cols.map((c) => '<th' + (c.type === 'number' ? ' class="pv-num"' : '') + '>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + cols.map((c) => '<td' + (c.type === 'number' ? ' class="pv-num"' : '') + ' data-label="' + esc(c.label) + '">' + cellHtml(c, r[c.key]) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
          (cols.some(summable) && rows.length > 1 ? '<tfoot><tr>' + cols.map((c, i) => '<td' + (c.type === 'number' ? ' class="pv-num"' : '') + '>' + (i === 0 ? '<b>Total</b>' : summable(c) ? '<b>' + esc(cellText(c, totals[i])) + '</b>' : '') + '</td>').join('') + '</tr></tfoot>' : '') + '</table></div>'
          : emptyBox('Nothing to report for this period.')) + '</div>';
      const csv = panel.querySelector('#pv-r-csv');
      if (csv) csv.disabled = !rows.length;
    } catch (err) { out.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; }
  }
  panel.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { st.kind = b.dataset.kind; panel.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('bl-chip-on', x === b)); run(); }));
  panel.querySelector('#pv-r-run').addEventListener('click', run);
  const csvBtn = panel.querySelector('#pv-r-csv');
  if (csvBtn) csvBtn.addEventListener('click', () => {
    if (!last) return;
    downloadText('payment-verification-' + st.kind + '-' + st.from + '-to-' + st.to + '.csv', toCsv(last.columns.map((c) => c.label), last.rows.map((r) => last.columns.map((c) => rawCell(c, r[c.key])))));
  });
  run();
}

// ---------------------------------------------------------------- the audit log
export async function renderAudit(ctx, panel) {
  const st = ctx.ui.audit;
  const canExport = ctx.can('payment_verify.export_reports');
  panel.innerHTML = '<div class="card pv-toolbar"><div class="pv-toolrow"><div class="field pv-grow"><label for="pv-au-q">Search</label><input id="pv-au-q" type="search" placeholder="PV number, order #, customer or reference…" value="' + esc(st.q) + '"></div>' +
    '<div class="field"><label for="pv-au-from">From</label><input id="pv-au-from" type="date" value="' + esc(st.from) + '"></div><div class="field"><label for="pv-au-to">To</label><input id="pv-au-to" type="date" value="' + esc(st.to) + '"></div>' +
    '<div class="field"><label for="pv-au-actor">Done by</label><input id="pv-au-actor" type="text" value="' + esc(st.actor) + '" placeholder="Name"></div>' +
    '<div class="field"><label for="pv-au-type">Action</label><select id="pv-au-type"><option value="">All actions</option>' + EVENT_TYPES_FOR_FILTER.map((k) => '<option value="' + k + '"' + (st.type === k ? ' selected' : '') + '>' + esc(eventLabel(k)) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>&nbsp;</label><div class="pv-btnrow"><button type="button" class="btn small secondary" id="pv-au-clear">Clear</button>' + (canExport ? '<button type="button" class="btn small secondary" id="pv-au-csv">Download spreadsheet (CSV)</button>' : '') + '</div></div></div></div>' +
    '<div id="pv-au-out"><p class="muted">Loading…</p></div>';
  const out = panel.querySelector('#pv-au-out');
  let rows = [], total = 0, seq = 0;
  const filters = () => { const f = {}; if (st.q) f.q = st.q; if (st.from) f.date_from = st.from; if (st.to) f.date_to = st.to; if (st.actor) f.actor = st.actor; if (st.type) f.type = st.type; return f; };
  async function load(more) {
    const my = ++seq;
    if (!more) { rows = []; out.innerHTML = '<p class="muted">Loading…</p>'; }
    try {
      const res = await ctx.api.auditList(filters(), 100, rows.length);
      if (my !== seq) return;
      if (!res || res.ok === false) { out.innerHTML = '<div class="msg error">' + esc((res && res.message) || 'The audit log could not be loaded.') + '</div>'; return; }
      rows = rows.concat(res.rows || []); total = Number(res.total || 0);
      draw();
    } catch (err) { if (my === seq) out.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; }
  }
  function draw() {
    out.innerHTML = '<div class="pv-summary muted">Showing <b>' + rows.length.toLocaleString('en-PH') + '</b> of <b>' + total.toLocaleString('en-PH') + '</b> actions, newest first</div>' +
      (rows.length ? '<div class="table-scroll table-2col"><table class="pv-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Payment</th><th>Order / Customer</th><th>What happened</th></tr></thead><tbody>' +
        rows.map((e) => '<tr><td data-label="When">' + esc(fmtDateTime(e.at)) + '</td><td data-label="Who"><b>' + esc(e.by || '—') + '</b>' + (e.role ? '<div class="muted">' + esc(e.role) + '</div>' : '') + '</td>' +
          '<td data-label="Action">' + esc(eventLabel(e.type)) + '</td><td data-label="Payment">' + (e.payment_id ? '<button type="button" class="bl-link" data-open="' + esc(e.payment_id) + '">' + esc(e.pv_code || 'open') + '</button>' : '<span class="muted">settings</span>') + '</td>' +
          '<td data-label="Order / Customer">' + (e.order_ref ? '#' + esc(e.order_ref) + ' ' : '') + esc(e.customer || '') + (e.shop_name ? '<div class="muted">' + esc(e.shop_name) + '</div>' : '') + '</td><td data-label="What happened" class="full-row pv-wrap">' + esc(eventDetail(e)) + '</td></tr>').join('') + '</tbody></table></div>' +
        (rows.length < total ? '<div class="pv-pager"><span class="muted">' + (total - rows.length).toLocaleString('en-PH') + ' older actions</span><button type="button" class="btn small secondary" id="pv-au-more">Load 100 more</button></div>' : '')
        : emptyBox('No actions match these filters.'));
    out.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => ctx.openDetail(b.dataset.open, { rows: [] })));
    const more = out.querySelector('#pv-au-more'); if (more) more.addEventListener('click', () => load(true));
  }
  const bind = (id, key, ev = 'change') => { const el = panel.querySelector('#' + id); el.addEventListener(ev, debounce(() => { st[key] = el.value.trim(); load(); }, ev === 'input' ? 450 : 0)); };
  bind('pv-au-q', 'q', 'input'); bind('pv-au-from', 'from'); bind('pv-au-to', 'to'); bind('pv-au-actor', 'actor', 'input'); bind('pv-au-type', 'type');
  panel.querySelector('#pv-au-clear').addEventListener('click', () => { Object.assign(st, { q: '', from: '', to: '', actor: '', type: '' }); renderAudit(ctx, panel); });
  const csv = panel.querySelector('#pv-au-csv');
  if (csv) csv.addEventListener('click', async () => {
    csv.disabled = true;
    try {
      let all = rows.slice(), guard = 0;
      while (all.length < total && guard++ < 30) { const res = await ctx.api.auditList(filters(), 300, all.length); if (!res || res.ok === false || !(res.rows || []).length) break; all = all.concat(res.rows); }
      downloadText('payment-verification-audit-' + manilaToday() + '.csv', toCsv(['When', 'Who', 'Role', 'Action', 'PV #', 'Shop', 'Order', 'Customer', 'Reference', 'What happened'],
        all.map((e) => [e.at ? new Date(e.at).toISOString() : '', e.by, e.role, eventLabel(e.type), e.pv_code, e.shop_name, e.order_ref, e.customer, e.reference, eventDetail(e)])));
    } catch (err) { ctx.toast(err.message || String(err), true); }
    csv.disabled = false;
  });
  load();
}
