// Access & Performance Control Center -- the judgement calls, kept in one place and kept plain: thresholds and weights come from the owner's settings (never hard-coded),
// every statement is worked out from the figures on screen, and the wording is "Needs Review" -- never a verdict on a person.
// Rates and counts come from the database (apc_performance); this file only compares them.
import { fin, accuracyOf, needsSample, pctChange, money } from './apcCore.js?v=20261011a';

export const DEFAULT_TH = { void_rate_pct: 5, refund_rate_pct: 5, discount_rate_pct: 10, error_rate_pct: 5, min_sample: 10, repeat_error_count: 3, low_activity_events: 3, inactive_days: 30, low_stock_qty: 2 };
export const DEFAULT_WEIGHTS = {
  sales_quality_weights: { sales: 40, accuracy: 30, low_void_rate: 15, low_discount_rate: 15 },
  performance_weights: { productivity: 25, accuracy: 25, sales: 20, task_completion: 15, error_rate: 15 },
};
export const WEIGHT_LABELS = {
  sales: 'Sales (compared with the top seller)', accuracy: 'Accuracy (100 − error rate)', low_void_rate: 'Low void rate', low_discount_rate: 'Low discount rate',
  productivity: 'Productivity (work done compared with the busiest person)', task_completion: 'Task completion', error_rate: 'Fewest errors (compared with the most)',
};
export const thresholds = (ctx) => Object.assign({}, DEFAULT_TH, ((ctx && ctx.settings) || {}).thresholds || {});
export const weightsOf = (ctx, kind) => Object.assign({}, DEFAULT_WEIGHTS[kind], ((ctx && ctx.settings) || {})[kind] || {});

const n = (v) => fin(v) || 0;
export const workloadOf = (r) => n(r.workload && r.workload.total);
/** Work of every kind this person did in the period -- the base for "very low activity" and for productivity. */
export const unitsOf = (r) => workloadOf(r) + n(r.inventory && r.inventory.total) + n(r.other && r.other.approvals) + n(r.tasks && r.tasks.completed) + n(r.other && r.other.refund_requests) + n(r.other && r.other.purchases);
export const FAMILIES = [
  { id: 'pos', label: 'POS', has: (r) => n(r.pos.orders) + n(r.pos.voids) > 0 },
  { id: 'scrap', label: 'Scrap', has: (r) => n(r.scrap.entries) > 0 },
  { id: 'inventory', label: 'Inventory', has: (r) => n(r.inventory.total) > 0 || n(r.other.purchases) > 0 },
  { id: 'approvals', label: 'Approvals', has: (r) => n(r.other.approvals) > 0 },
  { id: 'tasks', label: 'Data Fix tasks', has: (r) => n(r.tasks.completed) + n(r.tasks.open) > 0 },
  { id: 'layaway', label: 'Layaway', has: (r) => n(r.other.layaway) > 0 },
];
export const familiesOf = (r) => FAMILIES.filter((f) => f.has(r)).map((f) => f.id);

// ---------------------------------------------------------------- optional scores (owner-configured weights; never used for pay or discipline)
function blend(parts) {
  const used = parts.filter((p) => p.value !== null && p.weight > 0);
  if (used.length < 2) return null;
  const sum = used.reduce((s, p) => s + p.weight, 0);
  return { score: Math.round(used.reduce((s, p) => s + p.value * p.weight, 0) / sum * 10) / 10, parts, used: used.length };
}
const peersOf = (rows) => rows.filter((r) => r.status === 'Active' && unitsOf(r) > 0);
const posNet = (r) => n(r.pos && r.pos.net);
export function qualityScore(row, rows, w, th) {
  const peers = peersOf(rows), top = Math.max(0, ...peers.map(posNet));
  const orders = n(row.pos.orders), attempted = orders + n(row.pos.voids);
  const parts = [
    { key: 'sales', value: orders > 0 && top > 0 ? Math.min(100, posNet(row) / top * 100) : null },
    { key: 'accuracy', value: accuracyOf(row, th) },
    { key: 'low_void_rate', value: attempted >= th.min_sample && fin(row.pos.void_rate) !== null ? Math.max(0, 100 - row.pos.void_rate) : null },
    { key: 'low_discount_rate', value: orders >= th.min_sample && fin(row.pos.discount_rate) !== null ? Math.max(0, 100 - row.pos.discount_rate) : null },
  ].map((p) => Object.assign(p, { weight: n(w[p.key]) }));
  return blend(parts);
}
export function performanceScore(row, rows, w, th) {
  const peers = peersOf(rows), topUnits = Math.max(0, ...peers.map(unitsOf)), topNet = Math.max(0, ...peers.map(posNet)), topErr = Math.max(0, ...peers.map((r) => n(r.errors.counted)));
  const done = n(row.tasks.completed), open = n(row.tasks.open);
  const parts = [
    { key: 'productivity', value: topUnits > 0 && unitsOf(row) > 0 ? Math.min(100, unitsOf(row) / topUnits * 100) : null },
    { key: 'accuracy', value: accuracyOf(row, th) },
    { key: 'sales', value: n(row.pos.orders) > 0 && topNet > 0 ? Math.min(100, posNet(row) / topNet * 100) : null },
    { key: 'task_completion', value: done + open > 0 ? done / (done + open) * 100 : null },
    { key: 'error_rate', value: !needsSample(workloadOf(row), th) ? (topErr > 0 ? 100 - n(row.errors.counted) / topErr * 100 : 100) : null },
  ].map((p) => Object.assign(p, { weight: n(w[p.key]) }));
  return blend(parts);
}

// ---------------------------------------------------------------- what the figures say about one person (data only -- no personality judgements)
const rankBy = (rows, fn, row) => { const r = rows.filter((x) => fn(x) > 0).sort((a, b) => fn(b) - fn(a)); const i = r.findIndex((x) => x.id === row.id); return i < 0 ? null : { rank: i + 1, of: r.length }; };
export function reviewPanel(row, rows, th, signals) {
  const strengths = [], attention = [], active = rows.filter((r) => r.status === 'Active');
  const sales = rankBy(active, posNet, row), scrap = rankBy(active, (r) => n(r.scrap.entries), row), acc = accuracyOf(row, th);
  if (sales && sales.rank <= 3) strengths.push({ text: sales.rank === 1 ? 'Top sales in this period' : 'High sales (#' + sales.rank + ' of ' + sales.of + ')', metric: money(n(row.pos.net)) });
  if (scrap && scrap.rank <= 3) strengths.push({ text: 'Fast encoding — scrap entries (#' + scrap.rank + ' of ' + scrap.of + ')', metric: n(row.scrap.entries) + ' entries' });
  if (acc !== null && acc >= 100 - th.error_rate_pct / 2) strengths.push({ text: 'Low error rate', metric: acc.toFixed(1) + '% accurate' });
  if (n(row.tasks.completed) > 0) strengths.push({ text: 'Completed Data Fix tasks', metric: n(row.tasks.completed) });
  if (n(row.inventory.total) >= 50) strengths.push({ text: 'Heavy inventory encoding', metric: n(row.inventory.total) + ' entries' });
  const err = fin(row.rates.error);
  if (row.errors.repeat_type) attention.push({ key: 'repeat', severity: 'orange', text: 'Repeated data corrections: ' + row.errors.repeat_type, metric: '× ' + row.errors.repeat_count });
  if (err !== null && !needsSample(workloadOf(row), th) && err >= th.error_rate_pct) attention.push({ key: 'error', severity: 'red', text: 'High error rate this period', metric: err.toFixed(1) + '%' });
  const attempted = n(row.pos.orders) + n(row.pos.voids);
  if (attempted >= th.min_sample && n(row.pos.void_rate) >= th.void_rate_pct) attention.push({ key: 'void', severity: 'orange', text: 'Higher than normal void rate', metric: row.pos.void_rate.toFixed(1) + '%' });
  if (n(row.pos.orders) >= th.min_sample && n(row.pos.discount_rate) >= th.discount_rate_pct) attention.push({ key: 'discount', severity: 'orange', text: 'Higher than normal discount rate', metric: row.pos.discount_rate.toFixed(1) + '%' });
  if (signals && signals.manual >= th.repeat_error_count) attention.push({ key: 'manual', severity: 'yellow', text: 'Many manual price changes', metric: signals.manual });
  if (n(row.errors.open) > 0) attention.push({ key: 'open', severity: n(row.errors.critical) > 0 ? 'red' : 'orange', text: 'Errors still waiting to be corrected', metric: n(row.errors.open) });
  if (n(row.tasks.open) > 0) attention.push({ key: 'tasks', severity: 'yellow', text: 'Data Fix tasks assigned and still open', metric: n(row.tasks.open) });
  if (row.status === 'Active' && row.has_login && unitsOf(row) < th.low_activity_events) attention.push({ key: 'quiet', severity: 'gray', text: 'Very low activity in this period', metric: unitsOf(row) + ' actions' });
  return { strengths, attention };
}

/** Everyone who needs a second look, one line per reason (employees = merged people rows; ownerId is never listed for access reasons). */
export function needsReview(people, th, signalsOf, ownerId) {
  const out = [];
  people.filter((p) => p.status === 'Active' && p.perf).forEach((p) => {
    reviewPanel(p.perf, people.map((x) => x.perf).filter(Boolean), th, signalsOf ? signalsOf(p.id) : null).attention
      .filter((a) => a.key !== 'quiet' || (p.has_login && p.id !== ownerId))
      .forEach((a) => out.push({ id: p.id, name: p.name, reason: a.text, metric: a.metric, severity: a.severity, kind: 'performance' }));
    const s = p.snap && p.snap.verify_status;
    if (s === 'ACCESS MISMATCH') out.push({ id: p.id, name: p.name, reason: p.snap.title_conflict ? 'Position and 201-file job title differ' : 'Access differs from the last review', metric: '', severity: 'red', kind: 'access' });
    else if (s === 'NEEDS REVIEW') out.push({ id: p.id, name: p.name, reason: 'Role, job title or branch changed since access was checked', metric: '', severity: 'orange', kind: 'access' });
  });
  const rank = { red: 0, orange: 1, yellow: 2, gray: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- this period against the one before
export const TREND_METRICS = [
  { key: 'sales', label: 'Sales (net)', kind: 'money', good: 'up', get: (r) => n(r.pos.net), has: (r) => n(r.pos.orders) + n(r.pos.voids) > 0 },
  { key: 'tasks', label: 'Tasks completed', kind: 'int', good: 'up', get: (r) => n(r.tasks.completed), has: (r) => n(r.tasks.completed) + n(r.tasks.open) > 0 },
  { key: 'errors', label: 'Errors', kind: 'int', good: 'down', get: (r) => n(r.errors.counted), has: () => true },
  { key: 'accuracy', label: 'Accuracy', kind: 'pct', good: 'up', get: (r, th) => accuracyOf(r, th), has: () => true },
  { key: 'scrap', label: 'Scrap entries', kind: 'int', good: 'up', get: (r) => n(r.scrap.entries), has: (r) => n(r.scrap.entries) > 0 },
];
export function trendFor(cur, prev, th) {
  return TREND_METRICS.filter((m) => m.has(cur) || (prev && m.has(prev))).map((m) => {
    const c = m.get(cur, th), p = prev ? m.get(prev, th) : null, ch = pctChange(c, p);
    const dir = ch === null ? 'na' : Math.abs(ch) < 0.05 ? 'flat' : ch > 0 ? 'up' : 'down';
    const tone = dir === 'na' || dir === 'flat' ? 'gray' : (dir === m.good ? 'green' : 'red');
    return { key: m.key, label: m.label, kind: m.kind, cur: c, prev: p, change: ch, dir, tone };
  });
}
/** Counts of the "signal" error types per person, for the POS alerts (manual price changes, cancelled sales). */
export function signalCounts(errRows) {
  const by = {};
  (errRows || []).forEach((e) => { if (!e.employee_id || e.status === 'IGNORED') return; const o = by[e.employee_id] || (by[e.employee_id] = { manual: 0, voided: 0 }); if (e.error_type === 'Manual Override') o.manual++; if (e.error_type === 'Voided Transaction') o.voided++; });
  return by;
}
