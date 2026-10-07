// Refund Management -- the Reports tab: the eleven reports, each with a preview and CSV / Excel / PDF export.
// Every export covers exactly what the filters above show ("right now" reports ignore the Month / Year filter).
import { esc, money, fmtDate, plural } from './refundsUi.js?v=20261008a';
import { filterBarHtml, bindFilterBar, scopedLive, scopedPeriod, periodLabel, scopeLabel } from './refundsFilters.js?v=20261008a';
import { REPORTS, buildReport, exportReport } from './refundsExport.js?v=20261008a';

const $ = (id) => document.getElementById(id);
const PREVIEW = {
  list: ['refund_no', 'customer', 'branch', 'requested_date', 'requested', 'paid', 'remaining', 'status'],
  group: ['label', 'count', 'requested', 'refunded', 'remaining'],
  monthly: ['label', 'count', 'requested', 'refunded', 'rate'],
};
function cell(c, v) {
  if (v === null || v === undefined || v === '') return '—';
  return c.type === 'money' ? money(v) : c.type === 'date' ? esc(fmtDate(v)) : esc(String(v));
}
function previewHtml(rep) {
  const kind = rep.def.kind === 'group' ? 'group' : rep.def.kind === 'monthly' ? 'monthly' : 'list';
  const cols = rep.columns.filter((c) => PREVIEW[kind].includes(c.key));
  const rows = rep.preview.slice(0, 10);
  if (!rows.length) return '<p class="muted">Nothing to show for these filters.</p>';
  return '<div class="table-scroll table-2col"><table class="lv-mini rf-prevtable"><thead><tr>' + cols.map((c) => '<th>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map((r) => '<tr>' + cols.map((c) => '<td data-label="' + esc(c.label) + '">' + cell(c, r[c.key]) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>' + (rep.preview.length > 10 ? '<p class="muted">Showing 10 of ' + rep.preview.length + ' — export to get them all.</p>' : '');
}
function summaryLine(rep) {
  const n = rep.preview.length;
  if (rep.def.kind === 'group') return plural(n, 'group') + ' · ' + money(rep.total.requested) + ' requested · ' + money(rep.total.remaining) + ' still owed';
  if (rep.def.kind === 'monthly') return plural(n, 'month') + ' · ' + plural(rep.total.count, 'request') + ' · ' + money(rep.total.refunded) + ' refunded';
  return plural(n, 'request') + ' · ' + money(rep.total.requested) + ' requested · ' + money(rep.total.remaining) + ' still owed';
}

export function renderReports(ctx, panel) {
  const live = scopedLive(ctx), period = scopedPeriod(ctx);
  const reps = REPORTS.map((d) => buildReport(d.id, ctx, { period, live }));
  const open = ctx.ui.repOpen;
  panel.innerHTML = '<div id="rf-reports">' + filterBarHtml(ctx) +
    '<p class="muted bl-rep-note">Period: <b>' + esc(periodLabel(ctx)) + '</b> · ' + esc(scopeLabel(ctx)) + '. Pending, Outstanding Liability and Aging are always as of today; the Monthly report lists every month in the period. Excel and CSV keep amounts as numbers so they can be summed.</p>' +
    '<div class="bl-reports">' + reps.map((rep) =>
      '<div class="card bl-report" data-rep="' + rep.def.id + '"><h3>' + esc(rep.title) + '</h3><p class="muted">' + esc(rep.def.blurb) + '</p><div class="bl-rep-sum">' + summaryLine(rep) + '</div>' +
      '<div class="bl-btnrow"><button type="button" class="btn small secondary" data-prev="' + rep.def.id + '">' + (open.has(rep.def.id) ? 'Hide preview' : 'Preview') + '</button>' +
      ['csv', 'xlsx', 'pdf'].map((f) => '<button type="button" class="btn small" data-export="' + f + '" data-id="' + rep.def.id + '">' + (f === 'xlsx' ? 'Excel' : f.toUpperCase()) + '</button>').join('') + '</div>' +
      (open.has(rep.def.id) ? '<div class="bl-rep-preview">' + previewHtml(rep) + '</div>' : '') + '</div>').join('') + '</div></div>';
  const root = $('rf-reports');
  bindFilterBar(ctx, root, () => ctx.rerender());
  root.querySelectorAll('[data-prev]').forEach((el) => el.addEventListener('click', () => { const id = el.dataset.prev; if (open.has(id)) open.delete(id); else open.add(id); ctx.rerender(); }));
  root.querySelectorAll('[data-export]').forEach((el) => el.addEventListener('click', async () => {
    const rep = reps.find((r) => r.def.id === el.dataset.id), label = el.textContent;
    el.disabled = true; el.textContent = 'Preparing…';
    try { await exportReport(rep, el.dataset.export); } catch (err) { ctx.toast(err, true); } finally { el.disabled = false; el.textContent = label; }
  }));
}
