// Transfers -- the Reports tab: the twelve reports, each with a preview and CSV / Excel / PDF export.
// Every export covers exactly what the filters above show ("right now" reports ignore the Month / Year filter).
import { esc, qty, fmtDate, plural } from './transfersUi.js?v=20261006d';
import { filterBarHtml, bindFilterBar, scopedLive, scopedPeriod, periodLabel, scopeLabel } from './transfersFilters.js?v=20261006d';
import { REPORTS, buildReport, exportReport } from './transfersExport.js?v=20261006d';

const $ = (id) => document.getElementById(id);
const PREVIEW = {
  list: ['transfer_no', 'from', 'to', 'status', 'skus', 'requested', 'released', 'received', 'requested_date'],
  branch: ['label', 'out_count', 'out_pcs', 'in_count', 'in_pcs', 'transit_out', 'incoming'],
  sku: ['label', 'name', 'transfers', 'requested', 'released', 'received', 'damaged', 'missing'],
  product: ['label', 'category', 'transfers', 'requested', 'released', 'received', 'damaged', 'missing'],
  date: ['label', 'count', 'requested', 'released', 'received', 'closed'],
  user: ['label', 'requests', 'approvals', 'releases', 'receipts', 'receive_pcs'],
  discrepancy: ['transfer_no', 'sku', 'type', 'quantity', 'status', 'explanation'],
  movement: ['date', 'type', 'transfer_no', 'sku', 'branch', 'change', 'before', 'after'],
};
function cell(c, v) {
  if (v === null || v === undefined || v === '') return '—';
  return c.type === 'date' ? esc(fmtDate(v)) : c.type === 'number' ? esc(qty(v)) : esc(String(v));
}
function previewHtml(rep) {
  const kind = rep.def.kind || 'list';
  const cols = rep.columns.filter((c) => (PREVIEW[kind] || PREVIEW.list).includes(c.key));
  const rows = rep.preview.slice(0, 10);
  if (!rows.length) return '<p class="muted">Nothing to show for these filters.</p>';
  return '<div class="table-scroll table-2col"><table class="lv-mini tf-prevtable"><thead><tr>' + cols.map((c) => '<th>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map((r) => '<tr>' + cols.map((c) => '<td data-label="' + esc(c.label) + '">' + cell(c, r[c.key]) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>' + (rep.preview.length > 10 ? '<p class="muted">Showing 10 of ' + rep.preview.length + ' — export to get them all.</p>' : '');
}
const summaryLine = (rep) => (rep.subtitle && rep.subtitle[1]) || plural(rep.preview.length, 'row');

export function renderReports(ctx, panel) {
  const live = scopedLive(ctx), period = scopedPeriod(ctx);
  const reps = REPORTS.map((d) => buildReport(d.id, ctx, { period, live }));
  const open = ctx.ui.repOpen;
  panel.innerHTML = '<div id="tf-reports">' + filterBarHtml(ctx) +
    '<p class="muted bl-rep-note">Period: <b>' + esc(periodLabel(ctx)) + '</b> · ' + esc(scopeLabel(ctx)) + '. The In-Transit report is always as of today. Quantities are pieces; cancelled and rejected transfers are listed but never counted in a total. Excel and CSV keep numbers as numbers so they can be summed.</p>' +
    '<div class="bl-reports">' + reps.map((rep) =>
      '<div class="card bl-report" data-rep="' + rep.def.id + '"><h3>' + esc(rep.title) + '</h3><p class="muted">' + esc(rep.def.blurb) + '</p><div class="bl-rep-sum">' + esc(summaryLine(rep)) + '</div>' +
      '<div class="bl-btnrow"><button type="button" class="btn small secondary" data-prev="' + rep.def.id + '">' + (open.has(rep.def.id) ? 'Hide preview' : 'Preview') + '</button>' +
      ['csv', 'xlsx', 'pdf'].map((f) => '<button type="button" class="btn small" data-export="' + f + '" data-id="' + rep.def.id + '">' + (f === 'xlsx' ? 'Excel' : f.toUpperCase()) + '</button>').join('') + '</div>' +
      (open.has(rep.def.id) ? '<div class="bl-rep-preview">' + previewHtml(rep) + '</div>' : '') + '</div>').join('') + '</div></div>';
  const root = $('tf-reports');
  bindFilterBar(ctx, root, () => ctx.rerender());
  root.querySelectorAll('[data-prev]').forEach((el) => el.addEventListener('click', () => { const id = el.dataset.prev; if (open.has(id)) open.delete(id); else open.add(id); ctx.rerender(); }));
  root.querySelectorAll('[data-export]').forEach((el) => el.addEventListener('click', async () => {
    const rep = reps.find((r) => r.def.id === el.dataset.id), label = el.textContent;
    el.disabled = true; el.textContent = 'Preparing…';
    try { await exportReport(rep, el.dataset.export); } catch (err) { ctx.toast(err, true); } finally { el.disabled = false; el.textContent = label; }
  }));
}
