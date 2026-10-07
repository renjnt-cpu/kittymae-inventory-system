// Bills Management -- the Reports tab: the eight reports (Monthly, Overdue, Due This Week, Paid, Unpaid,
// Branch, Category, Recurring) each with a preview and CSV / Excel / PDF export, plus the branch and
// category summaries with charts. Every export covers exactly what the filters above show.
import { esc, money, moneyShort, fmtDate, plural, donut, hbars, stackedHbars, lineChart, COLORS, statusColor, tagBadge } from './billsUi.js?v=20261008b';
import { monthlyTrend, groupTotals, statusCounts, STATUSES, sum } from './billsLogic.js?v=20261008b';
import { filterBarHtml, bindFilterBar, scopedLive, scopedPeriod, periodLabel, scopeLabel } from './billsFilters.js?v=20261008b';
import { REPORTS, buildReport, exportReport } from './billsExport.js?v=20261008b';

const $ = (id) => document.getElementById(id);
const PREVIEW = {
  bills: ['name', 'branch', 'due_date', 'amount', 'remaining', 'status'],
  group: ['label', 'count', 'total', 'unpaid', 'overdue'],
  templates: ['name', 'frequency', 'default_amount', 'next_due_date', 'auto', 'state'],
};
function cell(c, v) {
  if (v === null || v === undefined || v === '') return '—';
  return c.type === 'money' ? money(v) : c.type === 'date' ? esc(fmtDate(v)) : esc(String(v));
}
function previewHtml(rep) {
  const kind = rep.def.kind === 'group' ? 'group' : rep.def.kind === 'templates' ? 'templates' : 'bills';
  const cols = rep.columns.filter((c) => PREVIEW[kind].includes(c.key));
  const rows = rep.preview.slice(0, 10);
  if (!rows.length) return '<p class="muted">Nothing to show for these filters.</p>';
  return '<div class="table-scroll table-2col"><table class="lv-mini bl-prevtable"><thead><tr>' + cols.map((c) => '<th>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map((r) => '<tr>' + cols.map((c) => '<td data-label="' + esc(c.label) + '">' + cell(c, r[c.key]) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>' + (rep.preview.length > 10 ? '<p class="muted">Showing 10 of ' + rep.preview.length + ' — export to get them all.</p>' : '');
}
function summaryLine(rep) {
  if (rep.def.kind === 'templates') return plural(rep.preview.length, 'template') + ' · ' + rep.preview.filter((r) => r.state === 'Active').length + ' active';
  if (rep.def.kind === 'group') return plural(rep.preview.length, rep.def.id === 'branch' ? 'branch' : 'category', rep.def.id === 'branch' ? 'branches' : 'categories') + ' · ' + money(rep.total.total) + ' total · ' + money(rep.total.unpaid) + ' outstanding';
  return plural(rep.preview.length, 'expense') + ' · ' + money(rep.total.amount) + ' · ' + money(rep.total.remaining) + ' to pay';
}

export function renderReports(ctx, panel) {
  const live = scopedLive(ctx), period = scopedPeriod(ctx);
  const reps = REPORTS.map((d) => buildReport(d.id, ctx, { period, live }));
  const open = ctx.ui.repOpen || (ctx.ui.repOpen = new Set());
  const byBranch = groupTotals(period, (b) => b.branch_id || 0, (b) => b._branch);
  const byCat = groupTotals(period, (b) => b.category_id || 0, (b) => b._cat);
  const counts = statusCounts(period);
  const trend = monthlyTrend(live, ctx.today, 12).map((m) => ({ label: m.label, a: m.billed, b: m.paid }));
  const seg = [{ key: 'paid', label: 'Paid', color: COLORS.paid }, { key: 'unpaid', label: 'Unpaid', color: COLORS.unpaid }, { key: 'overdue', label: 'Overdue', color: COLORS.overdue }];

  panel.innerHTML = '<div id="bl-reports">' + filterBarHtml(ctx) +
    '<p class="muted bl-rep-note">Period: <b>' + esc(periodLabel(ctx)) + '</b> · ' + esc(scopeLabel(ctx)) + '. “Overdue” and “Due This Week” are always as of today; “Recurring” lists every template.</p>' +
    '<div class="bl-reports">' + reps.map((rep) =>
      '<div class="card bl-report" data-rep="' + rep.def.id + '"><h3>' + esc(rep.title) + '</h3><p class="muted">' + esc(rep.def.blurb) + '</p><div class="bl-rep-sum">' + summaryLine(rep) + '</div>' +
      '<div class="bl-btnrow"><button type="button" class="btn small secondary" data-prev="' + rep.def.id + '">' + (open.has(rep.def.id) ? 'Hide preview' : 'Preview') + '</button>' +
      ['csv', 'xlsx', 'pdf'].map((f) => '<button type="button" class="btn small" data-export="' + f + '" data-id="' + rep.def.id + '">' + (f === 'xlsx' ? 'Excel' : f.toUpperCase()) + '</button>').join('') + '</div>' +
      (open.has(rep.def.id) ? '<div class="bl-rep-preview">' + previewHtml(rep) + '</div>' : '') + '</div>').join('') + '</div>' +
    '<div class="bl-charts">' +
      '<div class="card bl-panel"><h3 class="bl-h">By branch <span class="muted">· paid / unpaid / overdue</span></h3>' +
        stackedHbars(byBranch.slice(0, 12).map((g) => ({ label: g.label, parts: { paid: g.paid, overdue: g.overdue, unpaid: Math.max(g.unpaid - g.overdue, 0) } })), seg, { format: moneyShort }) + '</div>' +
      '<div class="card bl-panel"><h3 class="bl-h">By category <span class="muted">· total amount</span></h3>' + hbars(byCat.slice(0, 12).map((g) => ({ label: g.label, value: g.total, sub: '(' + g.count + ')' })), { format: moneyShort }) + '</div>' +
      '<div class="card bl-panel"><h3 class="bl-h">By status <span class="muted">· number of expenses</span></h3>' + donut(STATUSES.filter((s) => counts[s]).map((s) => ({ label: s, value: counts[s], color: statusColor(s) })), { center: sum(Object.values(counts), (x) => x), centerSub: 'expenses' }) + '</div>' +
      '<div class="card bl-panel"><h3 class="bl-h">Total vs paid <span class="muted">· last 12 months</span></h3>' + lineChart(trend, { format: moneyShort }) + '</div></div></div>';

  const root = $('bl-reports');
  bindFilterBar(ctx, root, () => ctx.rerender());
  root.querySelectorAll('[data-prev]').forEach((el) => el.addEventListener('click', () => { const id = el.dataset.prev; if (open.has(id)) open.delete(id); else open.add(id); ctx.rerender(); }));
  root.querySelectorAll('[data-export]').forEach((el) => el.addEventListener('click', async () => {
    const rep = reps.find((r) => r.def.id === el.dataset.id), label = el.textContent;
    el.disabled = true; el.textContent = 'Preparing…';
    try { await exportReport(rep, el.dataset.export); } catch (err) { ctx.toast(err, true); } finally { el.disabled = false; el.textContent = label; }
  }));
}
