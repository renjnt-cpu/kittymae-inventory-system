// Refund Management -- the filter bar shared by the Dashboard, Requests, Payments, Completed, Analytics and Reports
// tabs (Month / Year / Branch / Refund method), and the helpers that turn those choices into a list of refunds.
// One set of choices (ctx.filters) drives every tab, so switching tabs never changes what you are looking at.
// The page opens on "all months": the old Refunds page showed everything, and a month default would look like missing records.
import { esc } from './refundsUi.js?v=20261007g';
import { inPeriod, matchesScope, MONTHS, METHODS, yearOf } from './refundsLogic.js?v=20261007g';

/** Refunds for the chosen branch / method only -- used for "right now" numbers (waiting, owed, old), which ignore the month. */
export const scopedLive = (ctx) => ctx.refunds.filter((r) => matchesScope(r, ctx.filters));
/** Refunds requested in the chosen month / year, for the chosen branch / method. */
export const scopedPeriod = (ctx) => ctx.refunds.filter((r) => inPeriod(r, ctx.filters) && matchesScope(r, ctx.filters));

const years = (ctx) => {
  const ys = new Set([yearOf(ctx.today)]);
  ctx.refunds.forEach((r) => { if (r.requested_date) ys.add(yearOf(r.requested_date)); });
  return [...ys].sort((a, b) => b - a);
};

export function filterBarHtml(ctx, opts = {}) {
  const f = ctx.filters;
  const showPeriod = opts.period !== false;
  const methods = [...new Set([...METHODS, ...ctx.refunds.map((r) => r.refund_method).filter(Boolean)])];
  return '<div class="card bl-filterbar"><div class="bl-filters">' +
    (showPeriod ? '<div class="field"><label>Month</label><select data-flt="month"><option value="0">All months</option>' + MONTHS.map((m, i) => '<option value="' + (i + 1) + '"' + (f.month === i + 1 ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Year</label><select data-flt="year"><option value="0">All years</option>' + years(ctx).map((y) => '<option value="' + y + '"' + (f.year === y ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></div>' : '') +
    '<div class="field"><label>Branch</label><select data-flt="branch"><option value="">All branches</option><option value="none"' + (f.branch === 'none' ? ' selected' : '') + '>No branch set</option>' +
      ctx.branches.map((b) => '<option value="' + b.id + '"' + (String(f.branch) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Refund method</label><select data-flt="method"><option value="">All methods</option>' +
      methods.map((m) => '<option' + (f.method === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></div>' +
    '<div class="field bl-flt-reset"><label>&nbsp;</label><button type="button" class="btn small secondary" data-flt-reset="1">Reset</button></div>' +
    '</div></div>';
}

export function defaultFilters() {
  return { year: 0, month: 0, branch: '', method: '' };
}

/** Wires the controls inside `root`; `onChange` redraws the tab. */
export function bindFilterBar(ctx, root, onChange) {
  root.querySelectorAll('[data-flt]').forEach((el) => el.addEventListener('change', () => {
    const k = el.dataset.flt;
    ctx.filters[k] = (k === 'month' || k === 'year') ? Number(el.value) : el.value;
    onChange();
  }));
  const reset = root.querySelector('[data-flt-reset]');
  if (reset) reset.addEventListener('click', () => { ctx.filters = defaultFilters(); onChange(); });
}

export function periodLabel(ctx) {
  const f = ctx.filters;
  if (!f.year && !f.month) return 'All time';
  return (f.month ? MONTHS[f.month - 1] + ' ' : '') + (f.year || 'all years');
}
export function scopeLabel(ctx) {
  const f = ctx.filters, parts = [];
  if (f.branch) parts.push(f.branch === 'none' ? 'refunds with no branch' : (ctx.branchById[f.branch] || {}).name || 'branch');
  if (f.method) parts.push(f.method);
  return parts.length ? parts.join(' · ') : 'all branches and methods';
}
