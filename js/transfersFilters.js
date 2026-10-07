// Transfers -- the filter bar shared by the Dashboard, Transfers, Discrepancies, Reports and Branch tabs (Month / Year / Source / Destination),
// and the helpers that turn those choices into a list of transfers. One set of choices (ctx.filters) drives every tab, so switching tabs never
// changes what you are looking at. The page opens on "all time": the old page showed everything, and a month default would look like missing records.
import { esc } from './transfersUi.js?v=20261008b';
import { inPeriod, matchesScope, MONTHS, yearOf } from './transfersLogic.js?v=20261008b';

/** Transfers for the chosen source / destination only -- used for "right now" numbers (in transit, waiting ...), which ignore the month. */
export const scopedLive = (ctx) => ctx.transfers.filter((t) => matchesScope(t, ctx.filters));
/** Transfers requested in the chosen month / year, for the chosen source / destination. */
export const scopedPeriod = (ctx) => ctx.transfers.filter((t) => inPeriod(t, ctx.filters) && matchesScope(t, ctx.filters));

const years = (ctx) => {
  const ys = new Set([yearOf(ctx.today)]);
  ctx.transfers.forEach((t) => { if (t._requestedOn) ys.add(yearOf(t._requestedOn)); });
  return [...ys].sort((a, b) => b - a);
};

export function filterBarHtml(ctx, opts = {}) {
  const f = ctx.filters;
  const showPeriod = opts.period !== false;
  const opt = (selected) => ctx.branches.map((b) => '<option value="' + b.id + '"' + (String(selected) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
  return '<div class="card bl-filterbar"><div class="bl-filters">' +
    (showPeriod ? '<div class="field"><label>Month</label><select data-flt="month"><option value="0">All months</option>' + MONTHS.map((m, i) => '<option value="' + (i + 1) + '"' + (f.month === i + 1 ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Year</label><select data-flt="year"><option value="0">All years</option>' + years(ctx).map((y) => '<option value="' + y + '"' + (f.year === y ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></div>' : '') +
    '<div class="field"><label>Source branch</label><select data-flt="from"><option value="">All branches</option>' + opt(f.from) + '</select></div>' +
    '<div class="field"><label>Destination branch</label><select data-flt="to"><option value="">All branches</option>' + opt(f.to) + '</select></div>' +
    '<div class="field bl-flt-reset"><label>&nbsp;</label><button type="button" class="btn small secondary" data-flt-reset="1">Reset</button></div>' +
    '</div></div>';
}

export function defaultFilters() {
  return { year: 0, month: 0, from: '', to: '' };
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
  if (f.from) parts.push('from ' + ((ctx.branchById[f.from] || {}).name || 'branch'));
  if (f.to) parts.push('to ' + ((ctx.branchById[f.to] || {}).name || 'branch'));
  return parts.length ? parts.join(' · ') : 'all routes';
}
