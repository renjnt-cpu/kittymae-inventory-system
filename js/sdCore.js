// Sales & Profit Dashboard -- shared plumbing: money / number formatting (never NaN or undefined on screen), date-range maths
// (the previous comparable period), the green / red / gray rules for the KPI change arrows, and every database call.
// Every figure on the dashboard is worked out by the database (migrations 141-148); nothing here recomputes a business number.
import { supabase } from './supabaseClient.js?v=20261007h';

// ---------------------------------------------------------------- formatting
export const esc = (s) => (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** A finite number, or null -- nothing that is NaN / Infinity / undefined ever reaches the screen. */
export const fin = (n) => { if (n === null || n === undefined || n === '') return null; const v = Number(n); return Number.isFinite(v) ? v : null; };
const PESO = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INT = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });
/** ₱1,250,500.00  (a minus sign in front for a loss: -₱1,250.00) */
export const money = (n) => { const v = fin(n); return v === null ? '—' : (v < 0 ? '-₱' : '₱') + PESO.format(Math.abs(v)); };
/** ₱1.2M / ₱35K for chart labels and tight spots */
export const moneyShort = (n) => {
  const v = fin(n); if (v === null) return '—';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return s + '₱' + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return s + '₱' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return s + '₱' + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return s + '₱' + Math.round(a);
};
export const int = (n) => { const v = fin(n); return v === null ? '—' : INT.format(v); };
export const pct = (n, d = 2) => { const v = fin(n); return v === null ? '—' : v.toFixed(d) + '%'; };
export const plural = (n, one, many) => INT.format(fin(n) || 0) + ' ' + (Number(n) === 1 ? one : (many || one + 's'));

// ---------------------------------------------------------------- dates (YYYY-MM-DD strings; never run through the browser's own timezone)
const P2 = (n) => String(n).padStart(2, '0');
const toStr = (d) => d.getUTCFullYear() + '-' + P2(d.getUTCMonth() + 1) + '-' + P2(d.getUTCDate());
const toDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return toStr(d); };
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
export const startOfMonth = (s) => s.slice(0, 7) + '-01';
export const endOfMonth = (s) => { const d = toDate(startOfMonth(s)); d.setUTCMonth(d.getUTCMonth() + 1, 0); return toStr(d); };
export const addMonths = (s, n) => { const d = toDate(startOfMonth(s)); d.setUTCMonth(d.getUTCMonth() + n, 1); return toStr(d); };
export const startOfWeek = (s) => addDays(s, -((toDate(s).getUTCDay() + 6) % 7)); // Monday
export const startOfYear = (s) => s.slice(0, 4) + '-01-01';
export const todayIn = (tz) => new Date().toLocaleDateString('en-CA', { timeZone: tz || 'Asia/Manila' });
export const fmtDate = (s) => !s ? '—' : toDate(s).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
export const fmtDateTime = (iso, tz) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: tz || 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
export const rangeText = (a, b) => (!b || a === b) ? fmtDate(a) : fmtDate(a) + ' – ' + fmtDate(b);
const sameYm = (a, b) => a.slice(0, 7) === b.slice(0, 7);

export const PRESETS = [
  { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'this_week', label: 'This Week' }, { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' }, { id: 'this_year', label: 'This Year' }, { id: 'custom', label: 'Custom Date Range' },
];

/** The date range of a preset (a custom range is passed through). */
export function presetRange(preset, today, custom) {
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y = addDays(today, -1); return { from: y, to: y }; }
    case 'this_week': return { from: startOfWeek(today), to: today };
    case 'this_month': return { from: startOfMonth(today), to: today };
    case 'last_month': { const s = addMonths(today, -1); return { from: s, to: endOfMonth(s) }; }
    case 'this_year': return { from: startOfYear(today), to: today };
    default: return custom && custom.from && custom.to ? { from: custom.from, to: custom.to } : { from: startOfMonth(today), to: today };
  }
}

/** The comparable period the figures are measured against.
 *  Today / Yesterday -> the day before. This Week / This Month / This Year (so far) -> the same stretch of the previous week / month / year.
 *  Last Month, or any custom range that is exactly a calendar month or year -> the previous full month / year (Oct 1-31 against Sep 1-30).
 *  Any other custom range -> the same number of days straight before it. */
export function previousPeriod(from, to, preset) {
  if (preset === 'today' || preset === 'yesterday') { const d = addDays(from, -1); return { from: d, to: d }; }
  if (preset === 'this_week') return { from: addDays(from, -7), to: addDays(to, -7) };
  if (preset === 'this_month') {
    const ps = addMonths(from, -1), span = daysBetween(from, to);
    const pe = addDays(ps, span); return { from: ps, to: pe > endOfMonth(ps) ? endOfMonth(ps) : pe };
  }
  if (preset === 'this_year') {
    const py = String(Number(from.slice(0, 4)) - 1), md = to.slice(5);
    return { from: py + '-01-01', to: py + '-' + (md === '02-29' ? '02-28' : md) };
  }
  if (from === startOfMonth(from) && to === endOfMonth(from) && sameYm(from, to)) { const ps = addMonths(from, -1); return { from: ps, to: endOfMonth(ps) }; }
  if (from === startOfYear(from) && to === from.slice(0, 4) + '-12-31') { const py = String(Number(from.slice(0, 4)) - 1); return { from: py + '-01-01', to: py + '-12-31' }; }
  const len = daysBetween(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

/** A sensible grouping for the trend charts. */
export function defaultGrain(from, to) {
  const days = daysBetween(from, to) + 1;
  return days <= 45 ? 'day' : days <= 190 ? 'week' : days <= 1100 ? 'month' : 'year';
}
export const GRAINS = [{ id: 'day', label: 'Daily' }, { id: 'week', label: 'Weekly' }, { id: 'month', label: 'Monthly' }, { id: 'year', label: 'Yearly' }];
export function bucketLabel(b, grain) {
  const d = toDate(b);
  if (grain === 'year') return String(d.getUTCFullYear());
  if (grain === 'month') return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------- KPI change (green / red / gray, never blind)
/** How a figure moved against the previous period. `kind` 'pp' compares percentages in points. */
export function change(cur, prev, kind) {
  const c = fin(cur), p = fin(prev);
  if (c === null || p === null) return { dir: 'na', pct: null, diff: null, text: 'No comparison' };
  const diff = c - p;
  if (Math.abs(diff) < 0.005) return { dir: 'flat', pct: 0, diff: 0, text: 'No change' };
  if (kind === 'pp') return { dir: diff > 0 ? 'up' : 'down', pct: null, diff, text: (diff > 0 ? '+' : '') + diff.toFixed(2) + ' pp' };
  if (p === 0) return { dir: diff > 0 ? 'up' : 'down', pct: null, diff, text: 'New (nothing before)' };
  const pc = diff / Math.abs(p) * 100;
  return { dir: diff > 0 ? 'up' : 'down', pct: pc, diff, text: (pc > 0 ? '+' : '') + pc.toFixed(1) + '%' };
}
/** What a rise means for this figure: 'up' = good, 'down' = bad (expenses, refunds ...), 'neutral' = neither. */
export function toneOf(good, dir) {
  if (dir === 'na' || dir === 'flat') return 'gray';
  if (good === 'neutral') return 'blue';
  return (dir === 'up') === (good === 'up') ? 'green' : 'red';
}
export const ARROW = { up: '▲', down: '▼', flat: '▬', na: '' };

// ---------------------------------------------------------------- the database calls
async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params || {});
  if (error) throw new Error(error.message);
  if (data && data.ok === false) { const e = new Error((data.errors || ['Something went wrong.']).join(' ')); e.errors = data.errors || []; e.denied = true; throw e; }
  return data;
}
export const api = {
  meta: () => rpc('dash_meta'),
  overview: (f) => rpc('dash_overview', { p_f: f }),
  trend: (f, grain) => rpc('dash_trend', { p_f: f, p_grain: grain }),
  breakdown: (f, kind) => rpc('dash_breakdown', { p_f: f, p_kind: kind }),
  payments: (f) => rpc('dash_payments', { p_f: f }),
  expenseSummary: (f) => rpc('dash_expense_summary', { p_f: f }),
  purchaseSummary: (f) => rpc('dash_purchase_summary', { p_f: f }),
  inventorySummary: (f) => rpc('dash_inventory_summary', { p_f: f }),
  inventoryTrend: (f, grain) => rpc('dash_inventory_trend', { p_f: f, p_grain: grain }),
  capitalSummary: (f) => rpc('dash_capital_summary', { p_f: f }),
  quality: (f) => rpc('dash_quality', { p_f: f }),
  table: (kind, f, o) => rpc('dash_table', { p_kind: kind, p_f: f, p_sort: (o && o.sort) || null, p_dir: (o && o.dir) || 'desc', p_page: (o && o.page) || 1, p_size: (o && o.size) || 25, p_search: (o && o.search) || null }),
  refreshNow: () => rpc('dash_refresh_now'),
  saveSettings: (values) => rpc('dash_save_settings', { p_values: values }),
  capitalSave: (e) => rpc('dash_capital_save', { p_id: e.id || null, p_date: e.date, p_type: e.type, p_amount: e.amount, p_account: e.account || null, p_reference: e.reference || null, p_notes: e.notes || null, p_client_key: e.client_key || null }),
  capitalVoid: (id, reason) => rpc('dash_capital_void', { p_id: id, p_reason: reason }),
  auditList: (n) => rpc('dash_audit_list', { p_limit: n || 50 }),
};

/** A friendly sentence for any thrown error. */
export function friendly(err) {
  const t = String((err && err.message) || err);
  return /violates|constraint|relation "|syntax error|null value|permission denied|JSON|invalid input|duplicate key|does not exist|PGRST|JWT|Failed to fetch|NetworkError|timeout/i.test(t)
    ? 'Something went wrong while loading this. Please try again — if it keeps happening, tell an Admin. (Details: ' + t + ')' : t;
}

export const KPI_KEYS = ['gross_sales', 'net_sales', 'gross_profit', 'net_profit', 'net_margin', 'total_orders', 'total_purchases', 'cogs', 'opex', 'inventory_value', 'receivables', 'payables',
  'items_sold', 'aov', 'capital_invested', 'refunds', 'discounts'];
