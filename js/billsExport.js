// Bills Management -- the eight reports and their exports (CSV, Excel, PDF). Everything is built in the
// browser from the bills already loaded; nothing is sent anywhere. The Excel / PDF libraries load from
// cdnjs only when someone clicks Export (pinned and integrity-checked in leaveExport.js).
import { exportCsv, exportXlsx, exportPdf, download, ensureLib } from './leaveExport.js?v=20261004h';
import { groupTotals, sum, monthName, frequencyText, nextGenerationDate, round2 } from './billsLogic.js?v=20261004h';
import { daysText } from './billsUi.js?v=20261004h';

const FOOTER = 'Kittymae Jewels - Bills Management';
const col = (key, label, type) => ({ key, label, type: type || 'text' });

// ---------------------------------------------------------------- bill rows
export const BILL_COLUMNS = [
  col('id', 'Bill ID', 'number'), col('name', 'Bill Name'), col('category', 'Category'), col('branch', 'Branch'), col('account_name', 'Account Name'),
  col('account_number', 'Account Number'), col('amount', 'Amount', 'money'), col('paid', 'Paid', 'money'), col('remaining', 'Remaining', 'money'),
  col('due_date', 'Due Date', 'date'), col('days', 'Days Until Due / Overdue'), col('status', 'Status'), col('payment_status', 'Payment Status'),
  col('recurring', 'Recurring'), col('priority', 'Priority'), col('payment_type', 'Payment Type'), col('added_by', 'Added By'), col('last_updated', 'Last Updated', 'date'), col('proof', 'Proof Attached'),
];
// the PDF page is only so wide: the same report, fewer columns
const PDF_KEYS = ['id', 'name', 'category', 'branch', 'amount', 'paid', 'remaining', 'due_date', 'days', 'status', 'priority'];

export function billRow(b) {
  return {
    id: b.id, name: b.name, category: b._cat, branch: b._branch, account_name: b.account_name || '', account_number: b.account_number || '',
    amount: b._amount, paid: b._paid, remaining: b._remaining, due_date: b.due_date || '', days: daysText(b), status: b._eff, payment_status: b.payment_status || 'Unpaid',
    recurring: b.is_recurring ? (b.recurring_frequency || 'Yes') : 'No', priority: b._prio, payment_type: b.payment_type || 'Manual',
    added_by: b.created_by_name || '', last_updated: b.updated_at ? String(b.updated_at).slice(0, 10) : '', proof: b._proof ? 'Yes' : 'No',
  };
}
// cancelled bills are listed but never counted in a total
const totalRow = (rows, label) => {
  const live = rows.filter((r) => r.status !== 'Cancelled');
  return { id: '', name: label || 'TOTAL', amount: round2(sum(live, (r) => r.amount)), paid: round2(sum(live, (r) => r.paid)), remaining: round2(sum(live, (r) => r.remaining)) };
};

const GROUP_COLUMNS = (first) => [col('label', first), col('count', 'Bills', 'number'), col('total', 'Total', 'money'), col('paid', 'Paid', 'money'),
  col('unpaid', 'Outstanding', 'money'), col('overdueCount', 'Overdue Bills', 'number'), col('overdue', 'Overdue Amount', 'money'), col('pct', 'Paid %', 'number')];
const groupRows = (g) => g.map((e) => ({ ...e, total: round2(e.total), paid: round2(e.paid), unpaid: round2(e.unpaid), overdue: round2(e.overdue), pct: e.total > 0 ? Math.round((e.paid / e.total) * 100) : 0 }));

const TPL_COLUMNS = [col('name', 'Template'), col('category', 'Category'), col('branch', 'Branch'), col('frequency', 'Repeats'), col('default_amount', 'Default Amount', 'money'),
  col('next_due_date', 'Next Due', 'date'), col('next_gen', 'Next Generation', 'date'), col('auto', 'Auto-generate'), col('state', 'Status'), col('last_generated', 'Last Generated', 'date')];

// ---------------------------------------------------------------- the reports
const open = (b) => b._open;
export const REPORTS = [
  { id: 'monthly', title: 'Monthly Bills Report', blurb: 'Every bill due in the chosen month, with totals.', scope: 'period', pick: () => true },
  { id: 'overdue', title: 'Overdue Bills', blurb: 'Everything past its due date and not fully paid — right now.', scope: 'live', pick: (b) => b._eff === 'Overdue' },
  { id: 'week', title: 'Due This Week', blurb: 'Unpaid bills due from today through Sunday.', scope: 'live', pick: (b, c) => b._open && b._days !== null && b._days >= 0 && b._days <= c.daysToSunday },
  { id: 'paid', title: 'Paid Bills', blurb: 'Bills in the chosen period that are fully paid.', scope: 'period', pick: (b) => b._eff === 'Paid' || b._eff === 'Auto-Debited' },
  { id: 'unpaid', title: 'Unpaid Bills', blurb: 'Bills in the chosen period that still have a balance.', scope: 'period', pick: open },
  { id: 'branch', title: 'Branch Report', blurb: 'Totals, payments and overdue per branch for the chosen period.', scope: 'period', kind: 'group' },
  { id: 'category', title: 'Category Report', blurb: 'Totals, payments and overdue per category for the chosen period.', scope: 'period', kind: 'group' },
  { id: 'recurring', title: 'Recurring Bills Report', blurb: 'Every recurring template: schedule, next due date and next generation date.', scope: 'templates', kind: 'templates' },
];

function periodText(f) {
  if (!f.year && !f.month) return 'All periods';
  return (f.month ? monthName(f.month) + ' ' : '') + (f.year || 'all years');
}
function scopeText(ctx) {
  const f = ctx.filters;
  const br = !f.branch ? 'All branches' : f.branch === 'none' ? 'Unassigned bills' : (ctx.branchById[f.branch] || {}).name || 'Branch';
  const ct = !f.category ? 'All categories' : (ctx.catById[f.category] || {}).name || 'Category';
  return br + ' · ' + ct;
}

/** Builds one report. `lists` = { period: bills for the chosen period/branch/category, live: bills for branch/category only }. */
export function buildReport(id, ctx, lists) {
  const def = REPORTS.find((r) => r.id === id);
  const c = { daysToSunday: ctx.daysToSunday, highAmount: ctx.highAmount };
  const generated = 'Generated ' + ctx.today + (ctx.access.name ? ' by ' + ctx.access.name : '');
  const f = ctx.filters;
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = def.scope === 'live' ? ctx.today : (f.year ? f.year + (f.month ? '-' + String(f.month).padStart(2, '0') : '') : 'all');
  const base = { def, filename: 'bills-' + slug(def.title) + '-' + suffix, about: [] };
  const about = (rows) => [{ k: 'Report', v: def.title }, { k: 'Period', v: def.scope === 'live' ? 'As of ' + ctx.today : def.scope === 'templates' ? 'All templates' : periodText(f) },
    { k: 'Scope', v: def.scope === 'templates' ? 'All branches' : scopeText(ctx) }, { k: 'Generated', v: ctx.today + (ctx.access.name ? ' by ' + ctx.access.name : '') }, ...rows];

  if (def.kind === 'templates') {
    const rows = ctx.data.templates.slice().sort((a, b) => String(a.next_due_date || '9').localeCompare(String(b.next_due_date || '9'))).map((t) => ({
      name: t.name, category: (ctx.catById[t.category_id] || {}).name || '', branch: t.branch_id ? (ctx.branchById[t.branch_id] || {}).name || '' : 'All / none',
      frequency: frequencyText(t), default_amount: t.default_amount === null ? null : Number(t.default_amount), next_due_date: t.next_due_date || '', next_gen: nextGenerationDate(t) || '',
      auto: t.auto_generate ? 'On' : 'Off', state: t.archived_at ? 'Archived' : t.active ? 'Active' : 'Paused', last_generated: t.last_generated_at ? String(t.last_generated_at).slice(0, 10) : '',
    }));
    return { ...base, title: def.title, columns: TPL_COLUMNS, pdfColumns: TPL_COLUMNS, rows, preview: rows, subtitle: [rows.length + ' recurring template' + (rows.length === 1 ? '' : 's'), generated], about: about([{ k: 'Templates', v: String(rows.length) }]) };
  }
  if (def.kind === 'group') {
    const byBranch = id === 'branch';
    const g = groupTotals(lists.period, byBranch ? (b) => b.branch_id || 0 : (b) => b.category_id || 0, byBranch ? (b) => b._branch : (b) => b._cat);
    const rows = groupRows(g);
    const total = { label: 'TOTAL', count: sum(rows, (r) => r.count), total: round2(sum(rows, (r) => r.total)), paid: round2(sum(rows, (r) => r.paid)), unpaid: round2(sum(rows, (r) => r.unpaid)),
      overdueCount: sum(rows, (r) => r.overdueCount), overdue: round2(sum(rows, (r) => r.overdue)) };
    total.pct = total.total > 0 ? Math.round((total.paid / total.total) * 100) : 0;
    const columns = GROUP_COLUMNS(byBranch ? 'Branch' : 'Category');
    return { ...base, title: def.title, columns, pdfColumns: columns, rows: [...rows, total], preview: rows, total,
      subtitle: [periodText(f) + ' · ' + scopeText(ctx), generated], about: about([{ k: 'Bills counted', v: String(total.count) }]) };
  }
  const src = def.scope === 'live' ? lists.live : lists.period;
  const picked = src.filter((b) => !b.archived_at && (def.id === 'monthly' ? true : def.pick(b, c))).sort((a, b) => String(a.due_date || '9').localeCompare(String(b.due_date || '9')) || a.id - b.id);
  const rows = picked.map(billRow);
  const t = totalRow(rows);
  const summary = rows.length + ' bill' + (rows.length === 1 ? '' : 's') + ' · Total ' + t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' · Paid ' + t.paid.toLocaleString('en-US', { minimumFractionDigits: 2 }) +
    ' · Outstanding ' + t.remaining.toLocaleString('en-US', { minimumFractionDigits: 2 });
  return { ...base, title: def.title, columns: BILL_COLUMNS, pdfColumns: BILL_COLUMNS.filter((x) => PDF_KEYS.includes(x.key)), rows: [...rows, t], preview: rows, total: t,
    subtitle: [(def.scope === 'live' ? 'As of ' + ctx.today : periodText(f)) + ' · ' + scopeText(ctx), summary, generated], about: about([{ k: 'Bills', v: String(rows.length) }, { k: 'Total amount', v: String(t.amount) }, { k: 'Total paid', v: String(t.paid) }, { k: 'Outstanding', v: String(t.remaining) }]) };
}

/** format: 'csv' | 'xlsx' | 'pdf' */
export async function exportReport(report, format) {
  if (format === 'csv') return exportCsv(report.filename, report.columns, report.rows);
  if (format === 'xlsx') return exportXlsx(report.filename, report.title, report.columns, report.rows, report.about);
  return exportPdf(report.filename, report.title, report.subtitle, report.pdfColumns, report.rows, FOOTER);
}

// ---------------------------------------------------------------- the Bills table as it is filtered on screen
export function exportBillList(ctx, bills, format, label) {
  const rows = bills.map(billRow);
  const t = totalRow(rows);
  const report = { title: label || 'Bills', filename: 'bills-list-' + ctx.today, columns: BILL_COLUMNS, pdfColumns: BILL_COLUMNS.filter((x) => PDF_KEYS.includes(x.key)), rows: [...rows, t],
    subtitle: [(label || 'Bills') + ' · ' + rows.length + ' bill' + (rows.length === 1 ? '' : 's'), 'Generated ' + ctx.today], about: [{ k: 'Report', v: label || 'Bills' }, { k: 'Generated', v: ctx.today }] };
  return exportReport(report, format);
}

// ---------------------------------------------------------------- the cash plan (Cash Planning tab)
const PLAN_COLUMNS = [col('week', 'Week'), col('due_date', 'Due Date', 'date'), col('name', 'Bill'), col('category', 'Category'), col('branch', 'Branch'), col('priority', 'Priority'), col('status', 'Status'), col('remaining', 'Amount To Pay', 'money')];
/** items = [{ week: 'Overdue' | 'Week 1' ..., b }] -- bills (or projected recurring bills) still to be paid. */
export function exportPlan(ctx, items, weeks, format) {
  const rows = items.map(({ week, b }) => ({ week, due_date: b.due_date || '', name: b.name + (b._projected ? ' (projected)' : ''), category: b._cat, branch: b._branch, priority: b._prio, status: b._projected ? 'Projected' : b._eff, remaining: b._remaining }));
  const total = { week: '', due_date: '', name: 'TOTAL', remaining: round2(sum(rows, (r) => r.remaining)) };
  const scope = scopeText(ctx);
  return exportReport({
    title: 'Cash Plan', filename: 'bills-cash-plan-' + ctx.today, columns: PLAN_COLUMNS, pdfColumns: PLAN_COLUMNS, rows: [...rows, total],
    subtitle: ['Overdue + the next ' + weeks + ' weeks · ' + scope, rows.length + ' item' + (rows.length === 1 ? '' : 's') + ' · ' + total.remaining.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' to pay', 'Generated ' + ctx.today + (ctx.access.name ? ' by ' + ctx.access.name : '')],
    about: [{ k: 'Report', v: 'Cash Plan' }, { k: 'Look-ahead', v: weeks + ' weeks from ' + ctx.today }, { k: 'Scope', v: scope }, { k: 'Total to pay', v: String(total.remaining) }],
  }, format);
}

// ---------------------------------------------------------------- activity log
export const LOG_COLUMNS = [col('when', 'When'), col('who', 'User'), col('bill', 'Bill'), col('action', 'Action'), col('field', 'Field'), col('before', 'Before'), col('after', 'After')];
export function logRow(l) {
  return { when: l.created_at ? new Date(l.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
    who: l.user_name || 'System', bill: l.bill_name || '', action: l.action || '', field: l.field_name || '', before: l.before_value ?? '', after: l.after_value ?? '' };
}

// ---------------------------------------------------------------- one bill: the "report card" as a PDF
export async function billReportPdf(ctx, b, log) {
  await ensureLib('jspdf'); await ensureLib('autotable');
  const { jsPDF } = window.jspdf;
  const safe = (s) => String(s ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/₱/g, 'PHP ').replace(/[^ -ÿ]/g, '?');
  const fm = (n) => n === null || n === undefined ? '-' : 'PHP ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const margin = 36;
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text(safe(b.name), margin, 42);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(safe('Bill #' + b.id + ' · ' + b._cat + ' · ' + b._branch + ' · ' + b._eff + ' · Priority ' + b._prio), margin, 58);
  const details = [
    ['Amount', fm(b._amount)], ['Paid', fm(b._paid)], ['Remaining', fm(b._remaining)], ['Due date', b.due_date || '-'], ['Payment status', b.payment_status || 'Unpaid'],
    ['Payment type', b.payment_type || 'Manual'], ['Account name', b.account_name || '-'], ['Account number', b.account_number || '-'], ['Provider / supplier', b.provider_name || '-'],
    ['Recurring', b.is_recurring ? (b.recurring_frequency || 'Yes') : 'No'], ['Added by', (b.created_by_name || '-') + (b.created_at ? ' on ' + String(b.created_at).slice(0, 10) : '')],
    ['Last updated', (b.updated_by_name || '-') + (b.updated_at ? ' on ' + String(b.updated_at).slice(0, 10) : '')], ['Notes', b.notes || '-'],
  ];
  doc.autoTable({ startY: 70, margin: { left: margin, right: margin, bottom: 40 }, head: [['Field', 'Value']], body: details.map((r) => r.map(safe)),
    styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [255, 241, 188], textColor: 30 }, columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold' } } });
  const pays = b._pays;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('Payment history', margin, doc.lastAutoTable.finalY + 22);
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 28, margin: { left: margin, right: margin, bottom: 40 }, head: [['Date', 'Amount', 'Method', 'Reference', 'Paid by', 'Notes']],
    body: pays.length ? pays.map((p) => [p.payment_date || '(older record)', fm(p.amount) + (p.voided_at ? ' (VOIDED)' : ''), p.method || '-', p.reference_number || '-', p.paid_by_name || '-', p.notes || '-'].map(safe)) : [['No payments recorded', '', '', '', '', '']],
    styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: [255, 241, 188], textColor: 30 } });
  if (log && log.length) {
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('History', margin, doc.lastAutoTable.finalY + 22);
    doc.autoTable({ startY: doc.lastAutoTable.finalY + 28, margin: { left: margin, right: margin, bottom: 40 }, head: [['When', 'User', 'Action', 'Change']],
      body: log.slice(0, 60).map((l) => [logRow(l).when, l.user_name || 'System', l.action, [l.field_name, l.before_value !== null && l.before_value !== undefined ? l.before_value + ' -> ' + (l.after_value ?? '') : (l.after_value ?? '')].filter(Boolean).join(': ')].map(safe)),
      styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [255, 241, 188], textColor: 30 } });
  }
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(FOOTER + ' · printed ' + ctx.today, margin, doc.internal.pageSize.getHeight() - 20);
    doc.text('Page ' + p + ' of ' + pages, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
  download(doc.output('blob'), 'bill-' + b.id + '-' + String(b.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '.pdf');
}
