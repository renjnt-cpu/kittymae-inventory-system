// Bills Management -- the filter bar shared by the Dashboard, Bills, Calendar, Cash Planning and Reports tabs
// (Month / Year / Branch / Category / Status), and the helpers that turn those choices into a list of bills.
// One set of choices (ctx.filters) drives every tab, so switching tabs never changes what you are looking at.
import { esc } from './billsUi.js?v=20261011a';
import { inPeriod, matchesScope, matchesStatus, MONTHS, STATUSES, yearOf } from './billsLogic.js?v=20261011a';

/** Bills for the chosen branch / category only -- used for "right now" numbers (overdue, due today, ...), which ignore the month. */
export const scopedLive = (ctx) => ctx.bills.filter((b) => !b.archived_at && matchesScope(b, ctx.filters));
/** Bills for the chosen month / year / branch / category (and status when asked). Archived bills only appear when Status = Archived. */
export function scopedPeriod(ctx, { status = false } = {}) {
  const f = ctx.filters;
  return ctx.bills.filter((b) => inPeriod(b, f) && matchesScope(b, f) && (status ? matchesStatus(b, f) : !b.archived_at));
}

const years = (ctx) => {
  const ys = new Set([yearOf(ctx.today), yearOf(ctx.today) + 1]);
  ctx.bills.forEach((b) => { if (b.due_date) ys.add(yearOf(b.due_date)); });
  return [...ys].sort((a, b) => b - a);
};

/** opts: { status: bool, period: bool } -- which of the controls to show. */
export function filterBarHtml(ctx, opts = {}) {
  const f = ctx.filters;
  const showPeriod = opts.period !== false;
  return '<div class="card bl-filterbar"><div class="bl-filters">' +
    (showPeriod ? '<div class="field"><label>Month</label><select data-flt="month"><option value="0">All months</option>' + MONTHS.map((m, i) => '<option value="' + (i + 1) + '"' + (f.month === i + 1 ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Year</label><select data-flt="year"><option value="0">All years</option>' + years(ctx).map((y) => '<option value="' + y + '"' + (f.year === y ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></div>' : '') +
    '<div class="field"><label>Branch</label><select data-flt="branch"><option value="">All branches</option><option value="none"' + (f.branch === 'none' ? ' selected' : '') + '>Not assigned yet</option>' +
      ctx.branches.map((b) => '<option value="' + b.id + '"' + (String(f.branch) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Category</label><select data-flt="category"><option value="">All categories</option>' +
      ctx.cats.filter((c) => c.active || String(f.category) === String(c.id)).map((c) => '<option value="' + c.id + '"' + (String(f.category) === String(c.id) ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' +
    (opts.status ? '<div class="field"><label>Status</label><select data-flt="status"><option value="">All statuses</option>' +
      STATUSES.map((s) => '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' : '') +
    '<div class="field bl-flt-reset"><label>&nbsp;</label><button type="button" class="btn small secondary" data-flt-reset="1">Reset</button></div>' +
    '</div></div>';
}

export function defaultFilters(ctx) {
  return { year: yearOf(ctx.today), month: Number(ctx.today.slice(5, 7)), branch: '', category: '', status: '' };
}

/** Wires the controls inside `root`; `onChange` redraws the tab. */
export function bindFilterBar(ctx, root, onChange) {
  root.querySelectorAll('[data-flt]').forEach((el) => el.addEventListener('change', () => {
    const k = el.dataset.flt;
    ctx.filters[k] = (k === 'month' || k === 'year') ? Number(el.value) : el.value;
    onChange();
  }));
  const reset = root.querySelector('[data-flt-reset]');
  if (reset) reset.addEventListener('click', () => { ctx.filters = defaultFilters(ctx); onChange(); });
}

export function periodLabel(ctx) {
  const f = ctx.filters;
  if (!f.year && !f.month) return 'All periods';
  return (f.month ? MONTHS[f.month - 1] + ' ' : '') + (f.year || 'all years');
}
export function scopeLabel(ctx) {
  const f = ctx.filters, parts = [];
  if (f.branch) parts.push(f.branch === 'none' ? 'unassigned expenses' : (ctx.branchById[f.branch] || {}).name || 'branch');
  if (f.category) parts.push((ctx.catById[f.category] || {}).name || 'category');
  return parts.length ? parts.join(' · ') : 'all branches and categories';
}
