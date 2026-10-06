// Refund Management -- the eleven reports and their exports (CSV, Excel, PDF), the Requests table as it is filtered on screen,
// the audit log, and the one-request "refund summary" PDF. Everything is built in the browser from the data already
// loaded; nothing is sent anywhere. The Excel / PDF libraries load from cdnjs only when someone clicks Export
// (pinned and integrity-checked in leaveExport.js).
//
// Money columns hold what is COUNTED as refunded: if an older record has more payments than the approved amount, only the
// approved amount is counted (the Decision Notes column says so), so a report's total always equals the dashboard.
import { exportCsv, exportXlsx, exportPdf, download, ensureLib } from './leaveExport.js?v=20261007e';
import { groupTotals, sum, monthName, round2, agingKey, AGING, yearOf, monthOf, inPeriod } from './refundsLogic.js?v=20261007e';

const FOOTER = 'Kittymae Jewels - Refund Management';
const col = (key, label, type) => ({ key, label, type: type || 'text' });

// ---------------------------------------------------------------- refund rows
export const REFUND_COLUMNS = [
  col('refund_no', 'Refund ID'), col('order', 'Order ID'), col('customer', 'Customer'), col('contact', 'Contact'), col('branch', 'Branch'), col('item', 'Item'), col('reason', 'Reason'),
  col('requested_date', 'Requested Date', 'date'), col('days', 'Days Pending', 'number'), col('requested', 'Requested Amount', 'money'), col('approved', 'Approved Amount', 'money'),
  col('paid', 'Paid Amount', 'money'), col('remaining', 'Remaining Balance', 'money'), col('method', 'Refund Method'), col('status', 'Status'), col('approval', 'Approval Status'),
  col('payment', 'Payment Status'), col('priority', 'Priority'), col('requested_by', 'Requested By'), col('approved_by', 'Approved By'), col('processed_by', 'Processed By'),
  col('proof', 'Proof Status'), col('approved_date', 'Approved Date', 'date'), col('completed_date', 'Completed Date', 'date'), col('target', 'Target Payment Date', 'date'), col('decision', 'Decision Notes'),
];
// the PDF page is only so wide: the same report, fewer columns
const PDF_KEYS = ['refund_no', 'order', 'customer', 'branch', 'reason', 'requested_date', 'requested', 'approved', 'paid', 'remaining', 'status'];
const pdfCols = (cols) => cols.filter((c) => PDF_KEYS.includes(c.key));

function decisionNote(r) {
  const parts = [];
  if (r.rejection_reason) parts.push('Rejected: ' + r.rejection_reason);
  if (r.cancel_reason) parts.push('Cancelled: ' + r.cancel_reason);
  if (r.approval_notes) parts.push('Approval notes: ' + r.approval_notes);
  if (r._over > 0) parts.push('Payments recorded (' + r._paid.toFixed(2) + ') are more than the approved amount; only the approved amount is counted.');
  return parts.join(' | ');
}
export function refundRow(r) {
  return {
    refund_no: r.refund_request_number, order: r.order_reference || '', customer: r.customer_name, contact: r.customer_contact || '', branch: r._branch, item: r.item_description || '', reason: r.reason_category || '',
    requested_date: r.requested_date || '', days: r._open ? r._age : '', requested: r._req, approved: r._appr, paid: r._approved ? r._effPaid : null, remaining: r._approved ? r._remaining : null,
    method: r.refund_method || '', status: r.status, approval: r.approval_status, payment: r.payment_status, priority: r.priority, requested_by: r.created_by_name || '', approved_by: r.approved_by_name || '',
    processed_by: r._processedBy || '', proof: r._proof === 'n/a' ? '' : r._proof, approved_date: r.approved_date || '', completed_date: r.completed_date || '', target: r.target_payment_date || '', decision: decisionNote(r),
    _cancelled: r.status === 'Cancelled', _bucket: r._open ? (AGING.find((b) => b.key === agingKey(r._age)) || {}).label : '',
  };
}
// cancelled requests are listed but never counted in a total
const totalRow = (rows, label) => {
  const live = rows.filter((r) => !r._cancelled);
  return { refund_no: label || 'TOTAL', requested: round2(sum(live, (r) => r.requested)), approved: round2(sum(live, (r) => r.approved || 0)), paid: round2(sum(live, (r) => r.paid || 0)), remaining: round2(sum(live, (r) => r.remaining || 0)) };
};
const strip = ({ _cancelled, _bucket, ...rest }) => rest;
const clean = (rows) => rows.map(strip);

const GROUP_COLUMNS = (first) => [col('label', first), col('count', 'Requests', 'number'), col('requested', 'Requested', 'money'), col('approved', 'Approved', 'money'), col('refunded', 'Refunded', 'money'),
  col('remaining', 'Still Owed', 'money'), col('pending', 'Pending', 'number'), col('completed', 'Completed', 'number'), col('rejected', 'Rejected', 'number')];
const groupRows = (g) => g.map((e) => ({ ...e, requested: round2(e.requested), approved: round2(e.approved), refunded: round2(e.refunded), remaining: round2(e.remaining) }));
const MONTH_COLUMNS = [col('label', 'Month'), col('count', 'Requests', 'number'), col('requested', 'Requested', 'money'), col('approved', 'Approved', 'money'), col('refunded', 'Refunded', 'money'),
  col('remaining', 'Still Owed', 'money'), col('rejected', 'Rejected', 'number'), col('completed', 'Completed', 'number'), col('rate', 'Completion %', 'number')];

// ---------------------------------------------------------------- the reports
export const REPORTS = [
  { id: 'summary', title: 'Refund Summary Report', blurb: 'Every request in the chosen period with its amounts and status.', scope: 'period', pick: () => true },
  { id: 'pending', title: 'Pending Refund Report', blurb: 'Requests still waiting for a decision — right now.', scope: 'live', pick: (r) => r._awaiting, sort: 'age' },
  { id: 'approved', title: 'Approved Refund Report', blurb: 'Requests that were approved in the chosen period, paid or not.', scope: 'period', pick: (r) => r._approved },
  { id: 'liability', title: 'Outstanding Refund Liability', blurb: 'Approved refunds with a balance still owed to the customer — right now.', scope: 'live', pick: (r) => r._approved && r._remaining > 0, sort: 'target' },
  { id: 'completed', title: 'Completed Refund Report', blurb: 'Refunds paid in full in the chosen period.', scope: 'period', pick: (r) => r.status === 'Completed' },
  { id: 'rejected', title: 'Rejected Refund Report', blurb: 'Requests that were declined, with the reason.', scope: 'period', pick: (r) => r.status === 'Rejected' },
  { id: 'branch', title: 'Refunds by Branch', blurb: 'Requests, amounts and balances for each branch.', scope: 'period', kind: 'group' },
  { id: 'reason', title: 'Refunds by Reason', blurb: 'Why customers ask for refunds, and how much it costs.', scope: 'period', kind: 'group' },
  { id: 'method', title: 'Refunds by Method', blurb: 'How refunds are paid out (GCash, bank transfer, cash …).', scope: 'period', kind: 'group' },
  { id: 'aging', title: 'Refund Aging Report', blurb: 'Open requests grouped by how long they have waited — right now.', scope: 'live', pick: (r) => r._open, sort: 'age', bucket: true },
  { id: 'monthly', title: 'Monthly Refund Report', blurb: 'Requests, refunds and completion rate month by month.', scope: 'live', kind: 'monthly' },
];

export function periodText(f) {
  if (!f.year && !f.month) return 'All time';
  return (f.month ? monthName(f.month) + ' ' : '') + (f.year || 'all years');
}
export function scopeText(ctx) {
  const f = ctx.filters;
  const br = !f.branch ? 'All branches' : f.branch === 'none' ? 'No branch set' : (ctx.branchById[f.branch] || {}).name || 'Branch';
  return br + ' · ' + (f.method || 'All methods');
}
const fmt2 = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });

/** Builds one report. `lists` = { period: refunds in the chosen period / branch / method, live: refunds in the branch / method only }. */
export function buildReport(id, ctx, lists) {
  const def = REPORTS.find((r) => r.id === id);
  const f = ctx.filters, generated = 'Generated ' + ctx.today + (ctx.access.name ? ' by ' + ctx.access.name : '');
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = def.scope === 'live' && def.kind !== 'monthly' ? ctx.today : (f.year ? f.year + (f.month ? '-' + String(f.month).padStart(2, '0') : '') : 'all');
  const base = { def, title: def.title, filename: 'refunds-' + slug(def.title) + '-' + suffix };
  const when = def.scope === 'live' && def.kind !== 'monthly' ? 'As of ' + ctx.today : periodText(f);
  const about = (rows) => [{ k: 'Report', v: def.title }, { k: 'Period', v: when }, { k: 'Scope', v: scopeText(ctx) }, { k: 'Generated', v: ctx.today + (ctx.access.name ? ' by ' + ctx.access.name : '') }, ...rows];

  if (def.kind === 'group') {
    const key = { branch: [(r) => r.branch_id || 0, (r) => r._branch], reason: [(r) => r.reason_category || 'No reason set', (r) => r.reason_category || 'No reason set'], method: [(r) => r.refund_method || 'Not set', (r) => r.refund_method || 'Not set'] }[id];
    const rows = groupRows(groupTotals(lists.period, key[0], key[1]));
    const total = { label: 'TOTAL', count: sum(rows, (r) => r.count), requested: round2(sum(rows, (r) => r.requested)), approved: round2(sum(rows, (r) => r.approved)), refunded: round2(sum(rows, (r) => r.refunded)),
      remaining: round2(sum(rows, (r) => r.remaining)), pending: sum(rows, (r) => r.pending), completed: sum(rows, (r) => r.completed), rejected: sum(rows, (r) => r.rejected) };
    const columns = GROUP_COLUMNS({ branch: 'Branch', reason: 'Reason', method: 'Refund Method' }[id]);
    return { ...base, columns, pdfColumns: columns, rows: [...rows, total], preview: rows, total, subtitle: [when + ' · ' + scopeText(ctx), generated], about: about([{ k: 'Requests counted', v: String(total.count) }, { k: 'Total requested', v: String(total.requested) }]) };
  }
  if (def.kind === 'monthly') {
    const byMonth = {};
    lists.live.filter((r) => inPeriod(r, f) && r.requested_date).forEach((r) => { const k = r.requested_date.slice(0, 7); (byMonth[k] = byMonth[k] || []).push(r); });
    const rows = Object.keys(byMonth).sort().reverse().map((k) => {
      const rs = byMonth[k].filter((r) => r.status !== 'Cancelled'), ap = rs.filter((r) => r._approved);
      return { label: monthName(monthOf(k + '-01')) + ' ' + yearOf(k + '-01'), count: rs.length, requested: round2(sum(rs, (r) => r._req)), approved: round2(sum(ap, (r) => r._appr)), refunded: round2(sum(ap, (r) => r._effPaid)),
        remaining: round2(sum(ap, (r) => r._remaining)), rejected: rs.filter((r) => r.status === 'Rejected').length, completed: rs.filter((r) => r.status === 'Completed').length, rate: rs.length ? Math.round((rs.filter((r) => r.status === 'Completed').length / rs.length) * 100) : 0 };
    });
    const total = { label: 'TOTAL', count: sum(rows, (r) => r.count), requested: round2(sum(rows, (r) => r.requested)), approved: round2(sum(rows, (r) => r.approved)), refunded: round2(sum(rows, (r) => r.refunded)),
      remaining: round2(sum(rows, (r) => r.remaining)), rejected: sum(rows, (r) => r.rejected), completed: sum(rows, (r) => r.completed), rate: 0 };
    total.rate = total.count ? Math.round((total.completed / total.count) * 100) : 0;
    return { ...base, columns: MONTH_COLUMNS, pdfColumns: MONTH_COLUMNS, rows: [...rows, total], preview: rows, total, subtitle: [when + ' · ' + scopeText(ctx), generated], about: about([{ k: 'Months', v: String(rows.length) }, { k: 'Requests counted', v: String(total.count) }]) };
  }
  const src = def.scope === 'live' ? lists.live : lists.period;
  const picked = src.filter((r) => def.pick(r)).sort((a, b) => def.sort === 'age' ? b._age - a._age || a.id - b.id : def.sort === 'target' ? String(a.target_payment_date || '9').localeCompare(String(b.target_payment_date || '9')) || a.id - b.id : String(a.requested_date).localeCompare(String(b.requested_date)) || a.id - b.id);
  const rows = picked.map(refundRow), t = totalRow(rows);
  const shape = (r) => def.bucket ? { ...strip(r), bucket: r._bucket } : strip(r);
  const columns = def.bucket ? [...REFUND_COLUMNS.slice(0, 9), col('bucket', 'Age Group'), ...REFUND_COLUMNS.slice(9)] : REFUND_COLUMNS;
  const pdf = def.bucket ? [...pdfCols(columns).slice(0, 6), col('bucket', 'Age Group'), ...pdfCols(columns).slice(6)] : pdfCols(columns);
  const summary = rows.length + ' request' + (rows.length === 1 ? '' : 's') + ' · Requested ' + fmt2(t.requested) + ' · Refunded ' + fmt2(t.paid) + ' · Still owed ' + fmt2(t.remaining);
  return { ...base, columns, pdfColumns: pdf, rows: [...rows.map(shape), t], preview: rows.map(shape), total: t,
    subtitle: [when + ' · ' + scopeText(ctx), summary, generated], about: about([{ k: 'Requests', v: String(rows.length) }, { k: 'Total requested', v: String(t.requested) }, { k: 'Total refunded', v: String(t.paid) }, { k: 'Still owed', v: String(t.remaining) }]) };
}

/** format: 'csv' | 'xlsx' | 'pdf' */
export async function exportReport(report, format) {
  if (format === 'csv') return exportCsv(report.filename, report.columns, report.rows);
  if (format === 'xlsx') return exportXlsx(report.filename, report.title, report.columns, report.rows, report.about);
  return exportPdf(report.filename, report.title, report.subtitle, report.pdfColumns, report.rows, FOOTER);
}

// ---------------------------------------------------------------- the Requests table as it is filtered on screen
export function exportRefundList(ctx, refunds, format, label) {
  const rows = refunds.map(refundRow), t = totalRow(rows), out = [...clean(rows), t];
  return exportReport({ title: label || 'Refunds', filename: 'refunds-list-' + ctx.today, columns: REFUND_COLUMNS, pdfColumns: pdfCols(REFUND_COLUMNS), rows: out,
    subtitle: [(label || 'Refunds') + ' · ' + rows.length + ' request' + (rows.length === 1 ? '' : 's'), 'Generated ' + ctx.today], about: [{ k: 'Report', v: label || 'Refunds' }, { k: 'Generated', v: ctx.today }] }, format);
}

// ---------------------------------------------------------------- audit log
export const LOG_COLUMNS = [col('when', 'When'), col('who', 'User'), col('role', 'Role'), col('refund', 'Refund'), col('action', 'Action'), col('field', 'Field'), col('before', 'Before'), col('after', 'After')];
export function logRow(l, ctx) {
  const r = l.refund_id && ctx ? ctx.byId.get(l.refund_id) : null;
  return { when: l.created_at ? new Date(l.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
    who: l.user_name || 'System', role: l.user_role || '', refund: r ? r.refund_request_number : (l.refund_id ? '#' + l.refund_id : ''), action: l.action || '', field: l.field_name || '', before: l.old_value ?? '', after: l.new_value ?? '' };
}

// ---------------------------------------------------------------- one request: the refund summary as a PDF
const safe = (s) => String(s ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/₱/g, 'PHP ').replace(/[^ -ÿ]/g, '?');
const fm = (n) => n === null || n === undefined ? '-' : 'PHP ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (iso) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
/** extras = { timeline: [], communications: [] } -- whatever the detail card has already loaded. */
export async function refundSummaryPdf(ctx, r, extras = {}) {
  await ensureLib('jspdf'); await ensureLib('autotable');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const margin = 36, head = { fillColor: [255, 241, 188], textColor: 30 };
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text(safe('Refund Summary - ' + r.refund_request_number), margin, 42);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(safe(r.customer_name + ' · Order ' + (r.order_reference || '-') + ' · ' + r.status + ' · Priority ' + r.priority), margin, 58);
  const table = (title, body, opts = {}) => {
    const y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 22 : 76;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(safe(title), margin, y);
    doc.autoTable({ startY: y + 6, margin: { left: margin, right: margin, bottom: 60 }, head: opts.head ? [opts.head] : [['Field', 'Value']], body: body.map((row) => row.map(safe)), styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: head, columnStyles: opts.head ? {} : { 0: { cellWidth: 130, fontStyle: 'bold' } } });
  };
  table('A. Customer', [['Name', r.customer_name], ['Contact', r.customer_contact || '-'], ['Email', r.customer_email || '-'], ['Address', r.customer_address || '-']]);
  table('B. Order', [['Order ID', r.order_reference || '-'], ['Order date', r.order_date || r.purchase_date || '-'], ['Sales channel', r.sales_channel || '-'], ['Branch', r._branch], ['Original payment method', r.original_payment_method || '-'],
    ['Order total', fm(r.order_total)], ['Order paid', fm(r.order_paid)], ['Order found in system', r.order_verified ? 'Yes (' + (r.order_source || '') + ')' : 'No - entered by hand']]);
  if (r._items.length) table('Items', r._items.map((i) => [i.item_name + (i.sku ? ' (' + i.sku + ')' : ''), i.quantity, fm(i.unit_price), fm(i.refund_amount)]), { head: ['Item', 'Qty', 'Unit price', 'Refund'] });
  table('C. Refund request', [['Refund ID', r.refund_request_number], ['Requested on', r.requested_date], ['Requested by', r.created_by_name || '-'], ['Reason', r.reason_category || '-'], ['Details', r.reason || '-'], ['Notes', r.notes || '-'],
    ['Amount requested', fm(r._req)], ['Refund method', r.refund_method || '-'], ['Account', [r.account_name, r.account_number].filter(Boolean).join(' · ') || '-']]);
  table('D. Approval', [['Approval status', r.approval_status], ['Reviewed by', r.reviewed_by_name ? r.reviewed_by_name + ' on ' + shortDate(r.reviewed_at) : '-'], ['Approved by', r.approved_by_name ? r.approved_by_name + ' on ' + (r.approved_date || '-') : '-'],
    ['Approved amount', fm(r._appr)], ['Approval notes', r.approval_notes || '-'], ['Rejection reason', r.rejection_reason || '-'], ['Target payment date', r.target_payment_date || '-']]);
  table('E. Payments  (paid ' + fm(r._effPaid) + ' · remaining ' + fm(r._remaining) + ')', r._pays.length ? r._pays.map((p) => [p.payment_date, fm(p.amount) + (p.voided_at ? ' (VOIDED)' : ''), p.payment_method, p.reference_number || '-', p.processed_by_name || '-',
    p.voided_at ? 'Voided: ' + (p.void_reason || '') : (r._files.some((f) => f.payment_id === p.id) ? (p.proof_verified_at ? 'Proof verified' : 'Proof uploaded') : 'No proof')]) : [['No payments recorded', '', '', '', '', '']], { head: ['Date', 'Amount', 'Method', 'Reference', 'Processed by', 'Proof'] });
  if (extras.communications && extras.communications.length) table('Customer communication', extras.communications.slice(0, 20).map((c) => [shortDate(c.occurred_at), c.communication_type + (c.customer_followup ? ' (customer follow-up)' : ''), c.created_by_name || '-', c.message]), { head: ['When', 'How', 'By', 'What was said'] });
  if (extras.timeline && extras.timeline.length) table('F. Timeline', extras.timeline.slice(0, 40).map((t) => [shortDate(t.created_at), t.performed_by_name || 'System', t.action + (t.description ? ' - ' + t.description : '')]), { head: ['When', 'Who', 'What happened'] });
  // sign-off
  let y = doc.lastAutoTable.finalY + 40;
  if (y > doc.internal.pageSize.getHeight() - 110) { doc.addPage(); y = 60; }
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Sign-off', margin, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const w = (doc.internal.pageSize.getWidth() - margin * 2 - 40) / 3;
  ['Prepared by', 'Approved by', 'Received by (customer)'].forEach((label, i) => {
    const x = margin + i * (w + 20);
    doc.line(x, y + 44, x + w, y + 44); doc.text(label, x, y + 57); doc.text('Date: ____________', x, y + 72);
  });
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(FOOTER + ' · printed ' + ctx.today, margin, doc.internal.pageSize.getHeight() - 20);
    doc.text('Page ' + p + ' of ' + pages, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
  download(doc.output('blob'), String(r.refund_request_number).toLowerCase() + '-refund-summary.pdf');
}
