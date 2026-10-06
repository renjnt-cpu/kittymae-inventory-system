// Transfers -- the twelve reports and their exports (CSV, Excel, PDF), the Transfers table as it is filtered on screen, the SKU trace,
// the audit log, and the one-transfer "transfer slip" PDF. Everything is built in the browser from the data already loaded; nothing is
// sent anywhere. The Excel / PDF libraries load from cdnjs only when someone clicks Export (pinned and integrity-checked in leaveExport.js).
//
// Quantities are pieces. A cancelled or rejected transfer is listed but its pieces are never added into a total, so a report's total
// always equals the dashboard.
import { exportCsv, exportXlsx, exportPdf, download, ensureLib } from './leaveExport.js?v=20261006a';
import { manilaDate } from './leaveUi.js?v=20261006a';
import { sum, group, monthName } from './transfersLogic.js?v=20261006a';

const FOOTER = 'Kittymae Jewels - Transfers';
const col = (key, label, type) => ({ key, label, type: type || 'text' });
const CLOSED = ['Cancelled', 'Rejected', 'Draft'];

// ---------------------------------------------------------------- transfer rows
export const TRANSFER_COLUMNS = [
  col('transfer_no', 'Transfer ID'), col('from', 'Source Branch'), col('to', 'Destination Branch'), col('status', 'Status'), col('priority', 'Priority'), col('skus', 'SKUs', 'number'),
  col('requested', 'Pieces Requested', 'number'), col('approved', 'Pieces Approved', 'number'), col('released', 'Pieces Released', 'number'), col('received', 'Pieces Received', 'number'), col('expected', 'Still Expected', 'number'),
  col('damaged', 'Damaged', 'number'), col('missing', 'Missing', 'number'), col('open_disc', 'Open Discrepancies', 'number'), col('requested_by', 'Requested By'), col('requested_date', 'Requested Date', 'date'),
  col('approved_by', 'Approved By'), col('approved_date', 'Approved Date', 'date'), col('released_by', 'Released By'), col('released_date', 'Release Date', 'date'), col('received_by', 'Received By'),
  col('received_date', 'Received Date', 'date'), col('reason', 'Reason'), col('notes', 'Notes / Decision'),
];
const PDF_KEYS = ['transfer_no', 'from', 'to', 'status', 'skus', 'requested', 'released', 'received', 'open_disc', 'requested_date'];
const pdfCols = (cols) => cols.filter((c) => PDF_KEYS.includes(c.key));
const dateOf = (iso) => (iso ? manilaDate(iso) : '');
function decisionNote(t) {
  const p = [];
  if (t.rejection_reason) p.push('Rejected: ' + t.rejection_reason);
  if (t.cancel_reason) p.push('Cancelled: ' + t.cancel_reason);
  if (t.approval_note) p.push('Approval note: ' + t.approval_note);
  if (t.override_reason) p.push('Stock override: ' + t.override_reason);
  if (t.notes) p.push(t.notes);
  return p.join(' | ');
}
export function transferRow(t) {
  return {
    transfer_no: t.transfer_number, from: t._from, to: t._to, status: t.status, priority: t.priority, skus: t._skus, requested: t._reqPcs, approved: t.approved_at ? t._apprPcs : null, released: t.shipped_at ? t._sentPcs : null,
    received: t._recPcs, expected: t._outstanding, damaged: sum(t._items, (i) => i.dam), missing: sum(t._items, (i) => i.mis), open_disc: t._openDiscs.length, requested_by: t._requester || '', requested_date: t._requestedOn || '',
    approved_by: t._approver || '', approved_date: dateOf(t.approved_at), released_by: t._releaser || '', released_date: t._shippedOn || '', received_by: t._receiver || '', received_date: t._receivedOn || '', reason: t.reason || '', notes: decisionNote(t),
    _closed: ['Cancelled', 'Rejected'].includes(t.status),
  };
}
const strip = ({ _closed, ...rest }) => rest;
const totalRow = (rows, label, includeClosed) => {
  const live = includeClosed ? rows : rows.filter((r) => !r._closed), s = (k) => sum(live, (r) => r[k] || 0);
  return { transfer_no: label || 'TOTAL', skus: s('skus'), requested: s('requested'), approved: s('approved'), released: s('released'), received: s('received'), expected: s('expected'), damaged: s('damaged'), missing: s('missing'), open_disc: s('open_disc') };
};

// ---------------------------------------------------------------- the reports
export const REPORTS = [
  { id: 'summary', title: 'Transfer Summary Report', blurb: 'Every transfer in the chosen period with its quantities, people and dates.', scope: 'period', pick: (t) => t.status !== 'Draft' },
  { id: 'branch', title: 'Transfers by Branch', blurb: 'What each branch sent and received, and what is on its way right now.', scope: 'period', kind: 'branch' },
  { id: 'sku', title: 'Transfers by SKU', blurb: 'For each SKU: how many transfers, and how many pieces were requested, released and received.', scope: 'period', kind: 'sku' },
  { id: 'product', title: 'Transfers by Product', blurb: 'The same, grouped by product name and category.', scope: 'period', kind: 'product' },
  { id: 'date', title: 'Transfers by Date', blurb: 'One row per day: requests made, pieces requested, released and received.', scope: 'period', kind: 'date' },
  { id: 'user', title: 'Transfers by User', blurb: 'Who requested, approved, released and received transfers — accountability by person.', scope: 'period', kind: 'user' },
  { id: 'transit', title: 'In-Transit Report', blurb: 'Released transfers that have not been fully received — right now.', scope: 'live', pick: (t) => ['In Transit', 'Partially Received'].includes(t.status), sort: 'transit' },
  { id: 'received', title: 'Received Transfers Report', blurb: 'Transfers that were received in full in the chosen period.', scope: 'period', pick: (t) => t.status === 'Received' },
  { id: 'cancelled', title: 'Cancelled Transfers Report', blurb: 'Transfers that were cancelled before release, with the reason.', scope: 'period', pick: (t) => t.status === 'Cancelled', includeClosed: true },
  { id: 'rejected', title: 'Rejected Transfers Report', blurb: 'Transfers that were declined, with the reason.', scope: 'period', pick: (t) => t.status === 'Rejected', includeClosed: true },
  { id: 'discrepancy', title: 'Discrepancy Report', blurb: 'Every missing, damaged or wrong item reported on a transfer, and how it was resolved.', scope: 'period', kind: 'discrepancy' },
  { id: 'movement', title: 'Stock Movement Report', blurb: 'Every stock-ledger entry made by a transfer: what left, what arrived, with the quantity before and after.', scope: 'period', kind: 'movement' },
];

export const periodText = (f) => (!f.year && !f.month ? 'All time' : (f.month ? monthName(f.month) + ' ' : '') + (f.year || 'all years'));
export const scopeText = (ctx) => {
  const f = ctx.filters, parts = [];
  parts.push(f.from ? 'from ' + ((ctx.branchById[f.from] || {}).name || 'branch') : 'any source');
  parts.push(f.to ? 'to ' + ((ctx.branchById[f.to] || {}).name || 'branch') : 'any destination');
  return parts.join(' · ');
};
const fmt0 = (n) => Number(n).toLocaleString('en-US');

const BRANCH_COLS = [col('label', 'Branch'), col('out_count', 'Transfers Sent', 'number'), col('out_pcs', 'Pieces Sent', 'number'), col('in_count', 'Transfers Received', 'number'), col('in_pcs', 'Pieces Received', 'number'),
  col('transit_out', 'Sent, Still On the Way', 'number'), col('incoming', 'Incoming Now', 'number'), col('open_disc', 'Open Discrepancies', 'number')];
const SKU_COLS = (first) => [col('label', first), col('name', 'Item'), col('category', 'Category'), col('transfers', 'Transfers', 'number'), col('requested', 'Requested', 'number'), col('approved', 'Approved', 'number'),
  col('released', 'Released', 'number'), col('received', 'Received', 'number'), col('damaged', 'Damaged', 'number'), col('missing', 'Missing', 'number'), col('last', 'Last Transfer', 'date')];
const DATE_COLS = [col('label', 'Date Requested', 'date'), col('count', 'Transfers', 'number'), col('skus', 'SKUs', 'number'), col('requested', 'Pieces Requested', 'number'), col('approved', 'Pieces Approved', 'number'),
  col('released', 'Pieces Released', 'number'), col('received', 'Pieces Received', 'number'), col('closed', 'Cancelled / Rejected', 'number')];
const USER_COLS = [col('label', 'Person'), col('requests', 'Requested', 'number'), col('request_pcs', 'Pieces Requested', 'number'), col('approvals', 'Approved', 'number'), col('releases', 'Released', 'number'),
  col('release_pcs', 'Pieces Released', 'number'), col('receipts', 'Received', 'number'), col('receive_pcs', 'Pieces Received', 'number')];
export const DISC_COLUMNS = [col('transfer_no', 'Transfer ID'), col('from', 'Source Branch'), col('to', 'Destination Branch'), col('sku', 'SKU'), col('item', 'Item'), col('type', 'Type'), col('quantity', 'Quantity', 'number'),
  col('status', 'Status'), col('explanation', 'What Happened'), col('reported_by', 'Reported By'), col('reported_date', 'Reported Date', 'date'), col('resolution', 'Resolution'), col('resolution_notes', 'Resolution Notes'),
  col('resolved_by', 'Resolved By'), col('resolved_date', 'Resolved Date', 'date')];
export const MOVEMENT_COLUMNS = [col('date', 'Date', 'date'), col('time', 'Time'), col('type', 'Entry Type'), col('transfer_no', 'Transfer ID'), col('sku', 'SKU'), col('item', 'Item'), col('branch', 'Branch'), col('related', 'Other Branch'),
  col('change', 'Quantity Change', 'number'), col('before', 'Stock Before', 'number'), col('after', 'Stock After', 'number'), col('by', 'Recorded By'), col('reference', 'Reference')];
const PDF_SPECIAL = {
  discrepancy: ['transfer_no', 'sku', 'type', 'quantity', 'status', 'explanation', 'reported_date'], movement: ['date', 'type', 'transfer_no', 'sku', 'branch', 'change', 'before', 'after'],
};

/** All the lines of the given transfers, one row each (used by the SKU / product reports and the SKU trace). */
export function lineRows(transfers) {
  return transfers.flatMap((t) => t._items.map((i) => ({ t, i })));
}
export function discRow(t, d, names = {}) {
  const i = t._items.find((x) => x.id === d.transfer_item_id);
  return { transfer_no: t.transfer_number, from: t._from, to: t._to, sku: i ? i.sku : '', item: i ? i.name : '', type: d.type, quantity: d.quantity, status: d.status === 'Open' ? 'Open' : 'Resolved', explanation: d.explanation,
    reported_by: names[d.reported_by] || '', reported_date: dateOf(d.reported_at), resolution: d.resolution || '', resolution_notes: d.resolution_notes || '', resolved_by: names[d.resolved_by] || '', resolved_date: dateOf(d.resolved_at) };
}
export const discRows = (transfers, names = {}) => transfers.flatMap((t) => t._discs.map((d) => discRow(t, d, names)));

/** Builds one report. `lists` = { period: transfers in the chosen period / route, live: transfers on the chosen route only }. */
export function buildReport(id, ctx, lists) {
  const def = REPORTS.find((r) => r.id === id);
  const f = ctx.filters, who = ctx.employee && (ctx.names[ctx.employee.id] || ctx.employee.full_name), generated = 'Generated ' + ctx.today + (who ? ' by ' + who : '');
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = def.scope === 'live' ? ctx.today : (f.year ? f.year + (f.month ? '-' + String(f.month).padStart(2, '0') : '') : 'all');
  const when = def.scope === 'live' ? 'As of ' + ctx.today : periodText(f);
  const base = { def, title: def.title, filename: 'transfers-' + slug(def.title) + '-' + suffix };
  const about = (rows) => [{ k: 'Report', v: def.title }, { k: 'Period', v: when }, { k: 'Routes', v: scopeText(ctx) }, { k: 'Generated', v: ctx.today + (who ? ' by ' + who : '') }, ...rows];
  const period = lists.period.filter((t) => t.status !== 'Draft');
  const wrap = (columns, pdfColumns, rows, total, extraAbout, summary) => ({ ...base, columns, pdfColumns, rows: total ? [...rows, total] : rows, preview: rows, total: total || {}, subtitle: [when + ' · ' + scopeText(ctx), summary, generated].filter(Boolean), about: about(extraAbout || []) });

  if (def.kind === 'branch') {
    const rows = ctx.branches.map((b) => {
      const out = period.filter((t) => t.from_branch_id === b.id && t._sentPcs > 0), inn = period.filter((t) => t.to_branch_id === b.id && t._recPcs > 0);
      const liveAll = lists.live;
      return { label: b.name, out_count: out.length, out_pcs: sum(out, (t) => t._sentPcs), in_count: inn.length, in_pcs: sum(inn, (t) => t._recPcs),
        transit_out: sum(liveAll.filter((t) => t.from_branch_id === b.id && ['In Transit', 'Partially Received'].includes(t.status)), (t) => t._outstanding),
        incoming: sum(liveAll.filter((t) => t.to_branch_id === b.id && ['In Transit', 'Partially Received'].includes(t.status)), (t) => t._outstanding), open_disc: sum(liveAll.filter((t) => t.to_branch_id === b.id), (t) => t._openDiscs.length) };
    }).filter((r) => r.out_count || r.in_count || r.transit_out || r.incoming || r.open_disc);
    const total = { label: 'TOTAL', out_count: sum(rows, (r) => r.out_count), out_pcs: sum(rows, (r) => r.out_pcs), in_count: sum(rows, (r) => r.in_count), in_pcs: sum(rows, (r) => r.in_pcs), transit_out: sum(rows, (r) => r.transit_out), incoming: sum(rows, (r) => r.incoming), open_disc: sum(rows, (r) => r.open_disc) };
    return wrap(BRANCH_COLS, BRANCH_COLS, rows, total, [{ k: 'Branches', v: String(rows.length) }], rows.length + ' branches · ' + fmt0(total.out_pcs) + ' pcs sent · ' + fmt0(total.in_pcs) + ' pcs received');
  }
  if (def.kind === 'sku' || def.kind === 'product') {
    const key = def.kind === 'sku' ? (x) => x.i.sku : (x) => (x.i.name || x.i.sku) + '|' + (x.i.category || '');
    const g = {};
    lineRows(period.filter((t) => !CLOSED.includes(t.status))).forEach((x) => {
      const e = g[key(x)] || (g[key(x)] = { label: def.kind === 'sku' ? x.i.sku : x.i.name || x.i.sku, name: x.i.name, category: x.i.category || '', ids: new Set(), requested: 0, approved: 0, released: 0, received: 0, damaged: 0, missing: 0, last: '' });
      e.ids.add(x.t.id); e.requested += x.i.req; e.approved += x.i.appr || 0; e.released += x.i.sent || 0; e.received += x.i.rec; e.damaged += x.i.dam; e.missing += x.i.mis;
      if (x.t._requestedOn > e.last) e.last = x.t._requestedOn;
    });
    const rows = Object.values(g).map(({ ids, ...r }) => ({ ...r, transfers: ids.size, name: def.kind === 'sku' ? r.name : r.category })).sort((a, b) => b.released - a.released || b.requested - a.requested || String(a.label).localeCompare(String(b.label)));
    const cols = def.kind === 'sku' ? SKU_COLS('SKU') : SKU_COLS('Product').filter((c) => c.key !== 'name');
    const total = { label: 'TOTAL', transfers: '', requested: sum(rows, (r) => r.requested), approved: sum(rows, (r) => r.approved), released: sum(rows, (r) => r.released), received: sum(rows, (r) => r.received), damaged: sum(rows, (r) => r.damaged), missing: sum(rows, (r) => r.missing) };
    return wrap(cols, cols.filter((c) => !['approved', 'category', 'last'].includes(c.key) || c.key === 'category' && def.kind === 'product'), rows, total, [{ k: def.kind === 'sku' ? 'SKUs' : 'Products', v: String(rows.length) }], rows.length + (def.kind === 'sku' ? ' SKUs' : ' products') + ' · ' + fmt0(total.released) + ' pcs released · ' + fmt0(total.received) + ' pcs received');
  }
  if (def.kind === 'date') {
    const byDay = {};
    period.forEach((t) => { (byDay[t._requestedOn] = byDay[t._requestedOn] || []).push(t); });
    const rows = Object.keys(byDay).sort().reverse().map((d) => { const ts = byDay[d], live = ts.filter((t) => !CLOSED.includes(t.status));
      return { label: d, count: ts.length, skus: sum(live, (t) => t._skus), requested: sum(live, (t) => t._reqPcs), approved: sum(live, (t) => t._apprPcs), released: sum(live, (t) => t._sentPcs), received: sum(live, (t) => t._recPcs), closed: ts.filter((t) => ['Cancelled', 'Rejected'].includes(t.status)).length }; });
    const total = { label: 'TOTAL', count: sum(rows, (r) => r.count), skus: sum(rows, (r) => r.skus), requested: sum(rows, (r) => r.requested), approved: sum(rows, (r) => r.approved), released: sum(rows, (r) => r.released), received: sum(rows, (r) => r.received), closed: sum(rows, (r) => r.closed) };
    return wrap(DATE_COLS, DATE_COLS, rows, total, [{ k: 'Days', v: String(rows.length) }], rows.length + ' days · ' + total.count + ' transfers · ' + fmt0(total.requested) + ' pcs requested');
  }
  if (def.kind === 'user') {
    const g = {}, items = group(ctx.receiptItems || [], 'receipt_id');
    const at = (name) => name && (g[name] || (g[name] = { label: name, requests: 0, request_pcs: 0, approvals: 0, releases: 0, release_pcs: 0, receipts: 0, receive_pcs: 0 }));
    period.forEach((t) => {
      const a = at(t._requester); if (a && t.status !== 'Draft') { a.requests++; if (!['Cancelled', 'Rejected'].includes(t.status)) a.request_pcs += t._reqPcs; }
      const b = at(t._approver); if (b && t.approved_at) b.approvals++;
      const c = at(t._releaser); if (c && t.shipped_at) { c.releases++; c.release_pcs += t._sentPcs; }
      t._receipts.forEach((r) => { const d = at(ctx.names[r.received_by]); if (d) { d.receipts++; d.receive_pcs += sum(items[r.id] || [], (x) => x.received_qty); } });
    });
    const rows = Object.values(g).sort((a, b) => b.requests + b.releases + b.receipts - (a.requests + a.releases + a.receipts) || String(a.label).localeCompare(String(b.label)));
    const total = { label: 'TOTAL', requests: sum(rows, (r) => r.requests), request_pcs: sum(rows, (r) => r.request_pcs), approvals: sum(rows, (r) => r.approvals), releases: sum(rows, (r) => r.releases), release_pcs: sum(rows, (r) => r.release_pcs), receipts: sum(rows, (r) => r.receipts), receive_pcs: sum(rows, (r) => r.receive_pcs) };
    return wrap(USER_COLS, USER_COLS, rows, total, [{ k: 'People', v: String(rows.length) }], rows.length + ' people · ' + total.requests + ' requests · ' + total.releases + ' releases');
  }
  if (def.kind === 'discrepancy') {
    const rows = discRows(period, ctx.names).sort((a, b) => String(b.reported_date).localeCompare(String(a.reported_date)) || a.transfer_no.localeCompare(b.transfer_no));
    const open = rows.filter((r) => r.status === 'Open');
    const total = { transfer_no: 'TOTAL', quantity: sum(rows, (r) => r.quantity) };
    return wrap(DISC_COLUMNS, DISC_COLUMNS.filter((c) => PDF_SPECIAL.discrepancy.includes(c.key)), rows, total, [{ k: 'Discrepancies', v: String(rows.length) }, { k: 'Still open', v: String(open.length) }], rows.length + ' discrepancies · ' + open.length + ' still open · ' + fmt0(total.quantity) + ' pcs');
  }
  if (def.kind === 'movement') {
    const ids = new Map(period.map((t) => [t.id, t]));
    const skuName = {};
    lists.period.forEach((t) => t._items.forEach((i) => { skuName[i.sku] = i.name; }));
    const rows = ctx.ledger.filter((x) => ids.has(x.transfer_id)).sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)) || a.id - b.id).map((x) => ({ date: dateOf(x.occurred_at), time: x.occurred_at ? new Date(x.occurred_at).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) : '',
      type: x.transaction_type, transfer_no: ids.get(x.transfer_id).transfer_number, sku: x.sku, item: skuName[x.sku] || '', branch: (ctx.branchById[x.branch_id] || {}).name || x.branch_id, related: x.related_branch_id ? (ctx.branchById[x.related_branch_id] || {}).name || '' : '',
      change: x.qty_change, before: x.qty_before, after: x.qty_after, by: ctx.names[x.employee_id] || '', reference: x.reference_number || '' }));
    const total = { date: 'NET', type: 'Net change', change: sum(rows, (r) => r.change) };
    return wrap(MOVEMENT_COLUMNS, MOVEMENT_COLUMNS.filter((c) => PDF_SPECIAL.movement.includes(c.key)), rows, total, [{ k: 'Ledger entries', v: String(rows.length) }], rows.length + ' ledger entries');
  }
  // transfer lists
  const src = def.scope === 'live' ? lists.live : lists.period;
  const sorted = src.filter((t) => def.pick(t)).sort((a, b) => def.sort === 'transit' ? b._stageDays - a._stageDays || a.transfer_number.localeCompare(b.transfer_number) : String(a._requestedOn).localeCompare(String(b._requestedOn)) || a.transfer_number.localeCompare(b.transfer_number));
  const rows = sorted.map(transferRow), tot = totalRow(rows, 'TOTAL', def.includeClosed);
  const cols = def.id === 'transit' ? [...TRANSFER_COLUMNS.slice(0, 5), col('days', 'Days Since Release', 'number'), ...TRANSFER_COLUMNS.slice(5)] : TRANSFER_COLUMNS;
  const shape = (r, t) => (def.id === 'transit' ? { ...strip(r), days: t._stageDays } : strip(r));
  const data = rows.map((r, i) => shape(r, sorted[i]));
  const summary = rows.length + ' transfer' + (rows.length === 1 ? '' : 's') + ' · ' + fmt0(tot.requested) + ' pcs requested · ' + fmt0(tot.released) + ' released · ' + fmt0(tot.received) + ' received';
  return { ...base, columns: cols, pdfColumns: def.id === 'transit' ? [...pdfCols(cols).slice(0, 5), cols.find((c) => c.key === 'days'), ...pdfCols(cols).slice(5)] : pdfCols(cols), rows: [...data, tot], preview: data, total: tot,
    subtitle: [when + ' · ' + scopeText(ctx), summary, generated], about: about([{ k: 'Transfers', v: String(rows.length) }, { k: 'Pieces requested', v: String(tot.requested) }, { k: 'Pieces released', v: String(tot.released) }, { k: 'Pieces received', v: String(tot.received) }]) };
}

/** format: 'csv' | 'xlsx' | 'pdf' */
export async function exportReport(report, format) {
  if (format === 'csv') return exportCsv(report.filename, report.columns, report.rows);
  if (format === 'xlsx') return exportXlsx(report.filename, report.title, report.columns, report.rows, report.about);
  return exportPdf(report.filename, report.title, report.subtitle, report.pdfColumns, report.rows, FOOTER);
}

// ---------------------------------------------------------------- the Transfers table as it is filtered on screen
export function exportTransferList(ctx, transfers, format, label) {
  const rows = transfers.map(transferRow), t = totalRow(rows, 'TOTAL'), out = [...rows.map(strip), t];
  return exportReport({ title: label || 'Transfers', filename: 'transfers-list-' + ctx.today, columns: TRANSFER_COLUMNS, pdfColumns: pdfCols(TRANSFER_COLUMNS), rows: out,
    subtitle: [(label || 'Transfers') + ' · ' + rows.length + ' transfer' + (rows.length === 1 ? '' : 's'), 'Generated ' + ctx.today], about: [{ k: 'Report', v: label || 'Transfers' }, { k: 'Generated', v: ctx.today }] }, format);
}
/** Any list of plain rows (SKU trace, a single SKU's movements ...). */
export const exportRows = (title, filename, columns, rows, format, subtitle, pdfColumns) => exportReport({ title, filename, columns, pdfColumns: pdfColumns || columns, rows,
  subtitle: [...(subtitle || []), 'Generated ' + manilaDate(new Date().toISOString())], about: [{ k: 'Report', v: title }, ...(subtitle || []).map((s, i) => ({ k: 'Note ' + (i + 1), v: s }))] }, format);

// ---------------------------------------------------------------- audit log
export const LOG_COLUMNS = [col('when', 'When'), col('who', 'User'), col('role', 'Role'), col('transfer', 'Transfer'), col('action', 'Action'), col('field', 'Field'), col('before', 'Before'), col('after', 'After')];
export function logRow(l, ctx) {
  const t = l.transfer_id && ctx ? ctx.byId.get(l.transfer_id) : null;
  return { when: l.created_at ? new Date(l.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
    who: l.user_name || l.performed_by_name || 'System', role: l.user_role || l.performed_by_role || '', transfer: t ? t.transfer_number : '', action: l.action || '', field: l.field_name || l.description || '', before: l.old_value ?? '', after: l.new_value ?? '' };
}

// ---------------------------------------------------------------- one transfer: the transfer slip as a PDF
const safe = (s) => String(s ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/→/g, '->').replace(/[^ -ÿ]/g, '?');
const shortDate = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-');
/** extras = { timeline, receiptItems } -- whatever the transfer card has already loaded. */
export async function transferSlipPdf(ctx, t, extras = {}) {
  await ensureLib('jspdf'); await ensureLib('autotable');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const margin = 36, head = { fillColor: [255, 241, 188], textColor: 30 };
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text(safe('Stock Transfer - ' + t.transfer_number), margin, 42);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(safe(t._from + ' -> ' + t._to + ' · ' + t.status + ' · Priority ' + t.priority), margin, 58);
  const table = (title, body, opts = {}) => {
    const y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 22 : 76;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(safe(title), margin, y);
    doc.autoTable({ startY: y + 6, margin: { left: margin, right: margin, bottom: 60 }, head: opts.head ? [opts.head] : [['Field', 'Value']], body: body.map((row) => row.map(safe)), styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: head, columnStyles: opts.head ? {} : { 0: { cellWidth: 130, fontStyle: 'bold' } } });
  };
  const by = (id) => (id ? ctx.names[id] || 'Unknown' : '-');
  table('A. Request', [['Transfer ID', t.transfer_number], ['Requested by', (t._requester || '-') + ' on ' + shortDate(t.requested_at)], ['Reason', t.reason || '-'], ['Expected date', t.expected_date || '-'], ['Notes', t.notes || '-']]);
  table('B. Approval', [['Approved by', t.approved_at ? (t._approver || '-') + ' on ' + shortDate(t.approved_at) : '-'], ['Approval note', t.approval_note || '-'], ['Rejection reason', t.rejection_reason || '-'], ['Cancel reason', t.cancel_reason || '-'], ['Stock override', t.override_reason || '-']]);
  table('C. Items', t._items.map((i) => [i.sku + ' - ' + i.name, i.req, i.appr === null ? '-' : i.appr, i.sent === null ? '-' : i.sent, i.sent === null ? '-' : i.rec, (i.dam || 0) + ' / ' + (i.mis || 0),
    (i.srcBefore !== null ? i.srcBefore + ' -> ' + i.srcAfter : '-') + ' | ' + (i.dstBefore !== null ? i.dstBefore + ' -> ' + i.dstAfter : '-')]), { head: ['Item', 'Req.', 'Appr.', 'Rel.', 'Recv.', 'Dam./Miss.', 'Stock before -> after (source | destination)'] });
  table('D. Release', [['Released by', t.shipped_at ? (t._releaser || '-') + ' on ' + shortDate(t.shipped_at) : '-'], ['Courier', t.release_courier || '-'], ['Vehicle', t.release_vehicle || '-'], ['Driver', t.release_driver || '-'], ['Tracking', t.release_tracking || '-'], ['Release notes', t.release_notes || '-']]);
  if (t._receipts.length) table('E. Receiving', t._receipts.map((r, n) => ['Receipt ' + (n + 1), shortDate(r.received_at), by(r.received_by), r.is_final ? 'Closed receiving' : '', r.notes || '']), { head: ['Receipt', 'When', 'By', 'Note', 'Notes'] });
  if (t._discs.length) table('F. Discrepancies', t._discs.map((d) => { const i = t._items.find((x) => x.id === d.transfer_item_id); return [d.type, i ? i.sku : '-', d.quantity, d.explanation, d.status === 'Open' ? 'OPEN' : 'Resolved: ' + (d.resolution || '')]; }), { head: ['Type', 'SKU', 'Qty', 'What happened', 'Status'] });
  if (extras.timeline && extras.timeline.length) table('G. Timeline', extras.timeline.slice(0, 40).map((x) => [shortDate(x.created_at), x.performed_by_name || 'System', x.action + (x.description ? ' - ' + x.description : '')]), { head: ['When', 'Who', 'What happened'] });
  let y = doc.lastAutoTable.finalY + 40;
  if (y > doc.internal.pageSize.getHeight() - 110) { doc.addPage(); y = 60; }
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Sign-off', margin, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const w = (doc.internal.pageSize.getWidth() - margin * 2 - 40) / 3;
  ['Prepared / released by', 'Courier / carried by', 'Received by (' + t._to + ')'].forEach((label, i) => { const x = margin + i * (w + 20); doc.line(x, y + 44, x + w, y + 44); doc.text(safe(label), x, y + 57); doc.text('Date: ____________', x, y + 72); });
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(FOOTER + ' · printed ' + ctx.today, margin, doc.internal.pageSize.getHeight() - 20);
    doc.text('Page ' + p + ' of ' + pages, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
  download(doc.output('blob'), String(t.transfer_number).toLowerCase() + '-transfer-slip.pdf');
}
