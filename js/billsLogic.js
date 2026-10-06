// Bills Management -- the rules and the arithmetic. No DOM and no Supabase in this file, so every
// number on the dashboard comes from one place and can be checked on its own.
//
// "Today" is always the Manila calendar day the database reports (ctx.today), never the browser's clock.
// Urgency statuses (Overdue / Due Today / Due Soon) are worked out here from the due date; only
// Paid / Partially Paid / Auto-Debited / Cancelled / Archived are facts stored in the database.

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
export const METHODS = ['Bank Transfer', 'Cash', 'Check', 'GCash', 'Auto-Debit', 'Online Banking', 'Other'];
export const FREQUENCIES = ['Monthly', 'Quarterly', 'Annual', 'Custom'];
export const REMINDER_CHOICES = [1, 3, 7, 14];
export const STATUSES = ['Unpaid', 'Due Soon', 'Due Today', 'Overdue', 'Paid', 'Partially Paid', 'Auto-Debited', 'Cancelled', 'Archived'];
const STATUS_RANK = { Overdue: 0, 'Due Today': 1, 'Due Soon': 2, 'Partially Paid': 3, Unpaid: 4, 'Auto-Debited': 5, Paid: 6, Cancelled: 7, Archived: 8 };
export const CLOSED = ['Paid', 'Auto-Debited', 'Cancelled', 'Archived'];
// proof files: photos and PDFs only, 15 MB at most (the database re-checks both)
export const FILE_TYPES = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;
export const MAX_FILE = 15 * 1024 * 1024;

// ---------------------------------------------------------------- dates (date-only strings, never the local timezone)
const pad = (n) => String(n).padStart(2, '0');
const utc = (d) => { const [y, m, day] = String(d).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, day); };
export const ymd = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
export function addDays(d, n) {
  const t = new Date(utc(d) + n * 86400000);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
/** whole days from a to b (positive when b is later) */
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
export const weekday = (d) => new Date(utc(d)).getUTCDay(); // 0 = Sunday
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const monthOf = (d) => Number(String(d).slice(5, 7));
export const yearOf = (d) => Number(String(d).slice(0, 4));
export const addMonths = (y, m, n) => { const t = new Date(Date.UTC(y, m - 1 + n, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }; };
/** days from today to the coming Sunday (0 when today is Sunday) -- "this week" is today through Sunday */
export const daysToSunday = (today) => (7 - weekday(today)) % 7;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m) => MONTHS[m - 1];

const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const group = (rows, key) => rows.reduce((m, r) => { (m[r[key]] = m[r[key]] || []).push(r); return m; }, {});
const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- statuses
/** The status a person should see right now. */
export function effectiveStatus(b, today, soonDays) {
  if (b.archived_at) return 'Archived';
  if (b.status === 'Cancelled') return 'Cancelled';
  if (b.payment_status === 'Paid' || b.status === 'Paid' || b.status === 'Auto-debited') return b.status === 'Auto-debited' ? 'Auto-Debited' : 'Paid';
  if (b.due_date) {
    const d = daysBetween(today, b.due_date);
    if (d < 0) return 'Overdue';
    if (d === 0) return 'Due Today';
    if (d <= soonDays) return 'Due Soon';
  } else if (b.status === 'Overdue') return 'Overdue'; // an old manual "Overdue" flag on a bill with no due date
  return Number(b.paid_amount) > 0 ? 'Partially Paid' : 'Unpaid';
}

/** Adds the working fields (_cat, _branch, _eff, _days, _remaining, ...) every screen reads. The raw row is not touched. */
export function enrichBills(data, ctx) {
  const pays = group(data.payments || [], 'bill_id');
  const files = group(data.attachments || [], 'bill_id');
  return (data.bills || []).map((raw) => {
    const b = { ...raw };
    const cat = ctx.catById[b.category_id];
    b._cat = cat ? cat.name : (b.category || 'Other');
    b._group = cat ? cat.group_name : 'Other';
    b._personal = !!(cat && cat.is_personal);
    b._branch = b.branch_id ? ((ctx.branchById[b.branch_id] || {}).name || 'Branch ' + b.branch_id) : 'Unassigned';
    b._amount = b.amount === null || b.amount === undefined ? null : Number(b.amount);
    b._paid = Number(b.paid_amount || 0);
    b._remaining = b._amount === null ? 0 : Math.max(round2(b._amount - b._paid), 0);
    b._days = b.due_date ? daysBetween(ctx.today, b.due_date) : null;
    b._eff = effectiveStatus(b, ctx.today, ctx.soonDays);
    if (b._eff === 'Cancelled') b._remaining = 0; // nothing is left to pay on a cancelled bill
    b._open = !CLOSED.includes(b._eff);
    b._prio = b.priority || (cat ? cat.default_priority : 'Medium');
    b._pays = (pays[b.id] || []).slice().sort((x, y) => String(y.payment_date || '').localeCompare(String(x.payment_date || '')) || y.id - x.id);
    b._livePays = b._pays.filter((p) => !p.voided_at);
    b._files = (files[b.id] || []).slice().sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
    b._proof = b._files.length > 0 || !!b.attachment_path;
    b._paidPct = b._amount ? Math.min(100, Math.round((b._paid / b._amount) * 100)) : (b._eff === 'Paid' || b._eff === 'Auto-Debited' ? 100 : 0);
    b._search = [b.name, b.account_name, b.account_number, b.provider_name, b.notes, b._branch, b._cat, b.id].join(' ').toLowerCase();
    return b;
  });
}

/** Bigger = needs attention sooner. Drives the default "Urgency" sort and the recommended-to-pay order. */
export function urgencyScore(b) {
  const bonus = 3 - (PRIORITY_RANK[b._prio] ?? 2);
  switch (b._eff) {
    case 'Overdue': return 5000 + Math.min(Math.abs(b._days ?? 0), 999) + bonus;
    case 'Due Today': return 4000 + bonus;
    case 'Due Soon': return 3000 - (b._days ?? 0) + bonus;
    case 'Partially Paid':
    case 'Unpaid': return (b._days === null ? 1500 : 2000 - Math.min(b._days, 999)) + bonus;
    case 'Auto-Debited': return 500;
    case 'Paid': return 100;
    case 'Cancelled': return 50;
    default: return 0;
  }
}

// ---------------------------------------------------------------- filtering
/** period = { year, month }; 0 means "all". A bill with no due date only shows when the period is "all". */
export function inPeriod(b, f) {
  if (!f.year && !f.month) return true;
  if (!b.due_date) return false;
  return (!f.year || yearOf(b.due_date) === f.year) && (!f.month || monthOf(b.due_date) === f.month);
}
/** branch and category: '' = everything, 'none' (branch only) = not assigned yet */
export function matchesScope(b, f) {
  if (f.branch === 'none') { if (b.branch_id) return false; } else if (f.branch && String(b.branch_id) !== String(f.branch)) return false;
  if (f.category && String(b.category_id) !== String(f.category)) return false;
  return true;
}
export function matchesStatus(b, f) {
  if (f.status === 'Archived') return !!b.archived_at;
  if (b.archived_at) return false;
  return !f.status || b._eff === f.status;
}

export const SAVED_VIEWS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'overdue', label: 'Overdue', live: true, test: (b) => b._eff === 'Overdue' },
  { id: 'today', label: 'Due Today', live: true, test: (b) => b._eff === 'Due Today' },
  { id: 'week', label: 'Due This Week', live: true, test: (b, c) => b._open && b._days !== null && b._days >= 0 && b._days <= c.daysToSunday },
  { id: 'next7', label: 'Next 7 Days', live: true, hidden: true, test: (b) => b._open && b._days !== null && b._days >= 1 && b._days <= 7 },
  { id: 'outstanding', label: 'Outstanding', live: true, hidden: true, test: (b) => b._open },
  { id: 'unpaid', label: 'Unpaid', test: (b) => b._open },
  { id: 'paid', label: 'Paid', test: (b) => b._eff === 'Paid' || b._eff === 'Auto-Debited' },
  { id: 'recurring', label: 'Recurring', test: (b) => !!b.is_recurring },
  { id: 'high', label: 'High Amount', live: true, test: (b, c) => (b._amount || 0) >= c.highAmount },
  { id: 'rent', label: 'Rent Only', test: (b) => b._group === 'Rent' },
  { id: 'utilities', label: 'Utilities Only', test: (b) => b._group === 'Utilities' },
  // Ren, 2026-10-07: "add salary in the category" -- everything in the Payroll group (today that is the Salaries category), next to Rent / Utilities
  { id: 'salary', label: 'Salary Only', test: (b) => b._group === 'Payroll' },
  { id: 'nobranch', label: 'No Branch', test: (b) => !b.branch_id },
  { id: 'archived', label: 'Archived', live: true, test: (b) => !!b.archived_at },
];
export const viewById = (id) => SAVED_VIEWS.find((v) => v.id === id) || SAVED_VIEWS[0];

/** The extra filters from the "More filters" panel. */
export function matchesQuery(b, q, c) {
  if (q.search) {
    const words = q.search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every((w) => b._search.includes(w))) return false;
  }
  if (q.paymentStatus && b.payment_status !== q.paymentStatus) return false;
  if (q.recurring === '1' && !b.is_recurring) return false;
  if (q.recurring === '0' && b.is_recurring) return false;
  if (q.priority && b._prio !== q.priority) return false;
  if (q.dueToday && b._eff !== 'Due Today') return false;
  if (q.dueWeek && !(b._open && b._days !== null && b._days >= 0 && b._days <= c.daysToSunday)) return false;
  if (q.overdueOnly && b._eff !== 'Overdue') return false;
  if (q.min !== '' && q.min !== undefined && (b._amount || 0) < Number(q.min)) return false;
  if (q.max !== '' && q.max !== undefined && (b._amount || 0) > Number(q.max)) return false;
  if (q.addedBy && (b.created_by_name || '') !== q.addedBy) return false;
  return true;
}

const cmpText = (x, y) => String(x || '').localeCompare(String(y || ''));
const cmpNum = (x, y) => (Number(x) || 0) - (Number(y) || 0);
// (the Bills table keeps bills with no due date at the end of a date sort, in either direction)
export const SORT_FIELDS = [
  { key: 'urgency', label: 'Urgency (most urgent first)' }, { key: 'due_date', label: 'Due Date' }, { key: 'amount', label: 'Amount' },
  { key: 'category', label: 'Category' }, { key: 'branch', label: 'Branch' }, { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' }, { key: 'created_at', label: 'Date Added' }, { key: 'name', label: 'Name' },
];
export const SORT_COMPARATORS = {
  urgency: (a, b) => urgencyScore(a) - urgencyScore(b),
  due_date: (a, b) => cmpText(a.due_date, b.due_date),
  amount: (a, b) => cmpNum(a._amount, b._amount),
  category: (a, b) => cmpText(a._cat, b._cat),
  branch: (a, b) => cmpText(a._branch, b._branch),
  // ascending = most important first, like the other lists read top-down
  priority: (a, b) => (PRIORITY_RANK[a._prio] ?? 9) - (PRIORITY_RANK[b._prio] ?? 9),
  status: (a, b) => (STATUS_RANK[a._eff] ?? 9) - (STATUS_RANK[b._eff] ?? 9),
  created_at: (a, b) => cmpText(a.created_at, b.created_at),
  name: (a, b) => cmpText(a.name, b.name),
};

// ---------------------------------------------------------------- dashboard numbers
/** The "this period" cards: bills that fall due in the chosen month/year. Cancelled and archived bills are left out. */
export function periodKpis(rows) {
  const live = rows.filter((b) => !b.archived_at && b._eff !== 'Cancelled');
  const total = sum(live, (b) => b._amount);
  const paid = sum(live, (b) => Math.min(b._paid, b._amount ?? b._paid));
  const paidBills = live.filter((b) => b._eff === 'Paid' || b._eff === 'Auto-Debited');
  return {
    count: live.length, total, paid, paidCount: paidBills.length,
    unpaid: sum(live.filter((b) => b._open), (b) => b._remaining), unpaidCount: live.filter((b) => b._open).length,
    recurring: live.filter((b) => b.is_recurring).length,
    paidPct: total > 0 ? Math.round((paid / total) * 100) : (live.length ? Math.round((paidBills.length / live.length) * 100) : 0),
  };
}
/** The "right now" cards, as of today, across every month. */
export function liveKpis(rows, c) {
  const open = rows.filter((b) => b._open);
  const pick = (f) => { const r = open.filter(f); return { count: r.length, amount: sum(r, (b) => b._remaining) }; };
  return {
    overdue: pick((b) => b._eff === 'Overdue'),
    today: pick((b) => b._eff === 'Due Today'),
    week: pick((b) => b._days !== null && b._days >= 0 && b._days <= c.daysToSunday),
    next7: pick((b) => b._days !== null && b._days >= 1 && b._days <= 7),
    outstanding: { count: open.length, amount: sum(open, (b) => b._remaining) },
  };
}

const byUrgency = (a, b) => urgencyScore(b) - urgencyScore(a) || (b._remaining - a._remaining);
/** Sections A-E of the alert area. `templates` are the recurring templates (for "upcoming recurring"). */
export function buildAlerts(rows, templates, c) {
  const open = rows.filter((b) => b._open);
  // longest overdue first; an old "Overdue" flag with no due date has no age, so it goes after the dated ones
  const overdue = open.filter((b) => b._eff === 'Overdue').sort((a, b) => (a._days ?? 0) - (b._days ?? 0) || (PRIORITY_RANK[a._prio] - PRIORITY_RANK[b._prio]));
  const today = open.filter((b) => b._eff === 'Due Today').sort(byUrgency);
  const next7 = open.filter((b) => b._days !== null && b._days >= 1 && b._days <= 7).sort((a, b) => a._days - b._days || byUrgency(a, b));
  const high = open.filter((b) => b._remaining >= c.highAmount && b._days !== null && b._days <= 30).sort((a, b) => b._remaining - a._remaining);
  const billsWithTpl = new Set(rows.map((b) => b.recurring_template_id + '|' + b.due_date));
  const recurringBills = open.filter((b) => b.is_recurring && b._days !== null && b._days >= 0 && b._days <= 14).sort((a, b) => a._days - b._days)
    .map((b) => ({ kind: 'bill', bill: b }));
  const recurringTemplates = (templates || []).filter((t) => t.active && !t.archived_at && t.next_due_date && daysBetween(c.today, t.next_due_date) >= 0
      && daysBetween(c.today, t.next_due_date) <= 14 && !billsWithTpl.has(t.id + '|' + t.next_due_date))
    .map((t) => ({ kind: 'template', tpl: t, days: daysBetween(c.today, t.next_due_date) }));
  const recurring = [...recurringBills, ...recurringTemplates].sort((a, b) => (a.kind === 'bill' ? a.bill._days : a.days) - (b.kind === 'bill' ? b.bill._days : b.days));
  return { overdue, today, next7, high, recurring };
}

/** Everything still to pay, most urgent first, with a short reason. A budget (optional) marks what it covers. */
export function recommendedToPay(rows, budget) {
  const tier = (b) => b._eff === 'Overdue' ? 0 : b._eff === 'Due Today' ? 1 : (b._days !== null && b._days <= 7) ? 2 : b._days === null ? 4 : 3;
  const list = rows.filter((b) => b._open && b._remaining > 0).sort((a, b) =>
    tier(a) - tier(b) || (PRIORITY_RANK[a._prio] - PRIORITY_RANK[b._prio]) || ((a._days ?? 9999) - (b._days ?? 9999)) || (b._remaining - a._remaining));
  let left = budget === null || budget === undefined || budget === '' ? null : Number(budget);
  return list.map((b) => {
    const reason = (b._eff === 'Overdue' ? 'Overdue ' + Math.abs(b._days) + ' day' + (Math.abs(b._days) === 1 ? '' : 's')
      : b._eff === 'Due Today' ? 'Due today' : b._days === null ? 'No due date' : 'Due in ' + b._days + ' day' + (b._days === 1 ? '' : 's')) + ' · ' + b._prio;
    let covered = null;
    if (left !== null) { covered = b._remaining <= left + 0.004; if (covered) left = round2(left - b._remaining); }
    return { b, reason, covered };
  });
}

/** Open bills grouped by 7-day week starting today. Overdue bills are reported separately (they are already due). */
export function weekBuckets(rows, today, weeks) {
  const open = rows.filter((b) => b._open && b._remaining > 0);
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    index: i + 1, from: addDays(today, i * 7), to: addDays(today, i * 7 + 6), total: 0, count: 0, bills: [], byPriority: { Critical: 0, High: 0, Medium: 0, Low: 0 },
  }));
  const overdue = { total: 0, count: 0, bills: [], byPriority: { Critical: 0, High: 0, Medium: 0, Low: 0 } };
  let later = { total: 0, count: 0 }, undated = { total: 0, count: 0 };
  open.forEach((b) => {
    if (b._days === null) { undated.total += b._remaining; undated.count++; return; }
    if (b._days < 0) { overdue.total += b._remaining; overdue.count++; overdue.bills.push(b); overdue.byPriority[b._prio] = (overdue.byPriority[b._prio] || 0) + b._remaining; return; }
    const i = Math.floor(b._days / 7);
    if (i >= weeks) { later.total += b._remaining; later.count++; return; }
    const k = buckets[i];
    k.total += b._remaining; k.count++; k.bills.push(b); k.byPriority[b._prio] = (k.byPriority[b._prio] || 0) + b._remaining;
  });
  buckets.forEach((k) => k.bills.sort((a, b) => a._days - b._days || byUrgency(a, b)));
  overdue.bills.sort(byUrgency);
  return { buckets, overdue, later, undated };
}

/** Billed vs paid for each of the last `n` months (by due month), ending with today's month. */
export function monthlyTrend(rows, today, n) {
  const y0 = yearOf(today), m0 = monthOf(today);
  return Array.from({ length: n }, (_, i) => {
    const { y, m } = addMonths(y0, m0, i - (n - 1));
    const inMonth = rows.filter((b) => !b.archived_at && b._eff !== 'Cancelled' && b.due_date && yearOf(b.due_date) === y && monthOf(b.due_date) === m);
    return { y, m, label: monthName(m).slice(0, 3) + (m === 1 || i === 0 ? ' ' + String(y).slice(2) : ''), billed: sum(inMonth, (b) => b._amount), paid: sum(inMonth, (b) => Math.min(b._paid, b._amount ?? b._paid)), count: inMonth.length };
  });
}

/** Totals per category or branch for a set of bills. */
export function groupTotals(rows, keyFn, labelFn) {
  const live = rows.filter((b) => !b.archived_at && b._eff !== 'Cancelled');
  const g = {};
  live.forEach((b) => {
    const k = keyFn(b);
    const e = g[k] || (g[k] = { key: k, label: labelFn(b), count: 0, total: 0, paid: 0, unpaid: 0, overdue: 0, overdueCount: 0 });
    e.count++; e.total += b._amount || 0; e.paid += Math.min(b._paid, b._amount ?? b._paid); e.unpaid += b._open ? b._remaining : 0;
    if (b._eff === 'Overdue') { e.overdue += b._remaining; e.overdueCount++; }
  });
  return Object.values(g).sort((a, b) => b.total - a.total);
}
export function statusCounts(rows) {
  const g = {};
  rows.filter((b) => !b.archived_at).forEach((b) => { g[b._eff] = (g[b._eff] || 0) + 1; });
  return g;
}

/** Latest payments, newest first (voided ones are left out). */
export function recentPayments(bills, limit) {
  const byId = Object.fromEntries(bills.map((b) => [b.id, b]));
  const all = [];
  bills.forEach((b) => b._livePays.forEach((p) => all.push({ p, b: byId[p.bill_id] })));
  return all.sort((x, y) => String(y.p.payment_date || y.p.created_at).localeCompare(String(x.p.payment_date || x.p.created_at)) || y.p.id - x.p.id).slice(0, limit);
}

// ---------------------------------------------------------------- recurring
/** d + n units, holding the day of month at `anchor` (clamped to short months) -- the same rule the database uses. */
export function addInterval(d, n, unit, anchor) {
  if (unit === 'day') return addDays(d, n);
  if (unit === 'week') return addDays(d, 7 * n);
  const { y, m } = addMonths(yearOf(d), monthOf(d), unit === 'year' ? 12 * n : n);
  return ymd(y, m, Math.min(anchor || Number(String(d).slice(8, 10)), daysInMonth(y, m)));
}
/** Bills that the active templates WILL create up to `until` and have not created yet, shaped like bills so the planning
 * numbers can treat them the same way. Marked _projected. */
export function projectTemplates(templates, bills, ctx, until) {
  const made = new Set(bills.map((b) => b.recurring_template_id + '|' + b.due_date));
  const out = [];
  templates.filter((t) => t.active && !t.archived_at && t.next_due_date).forEach((t) => {
    let due = t.next_due_date;
    for (let i = 0; i < 24 && due <= until; i++) {
      // a date already in the past means the series is behind schedule: that is shown on the Recurring tab, not counted as cash still to come
      if (due >= ctx.today && !made.has(t.id + '|' + due)) {
        const cat = ctx.catById[t.category_id];
        out.push({ id: null, name: t.name, template_id: t.id, _projected: true, due_date: due, _open: true, _eff: 'Projected', _days: daysBetween(ctx.today, due), _amount: Number(t.default_amount || 0),
          _remaining: Number(t.default_amount || 0), _paid: 0, _cat: cat ? cat.name : 'Other', _branch: t.branch_id ? ((ctx.branchById[t.branch_id] || {}).name || '') : 'Unassigned',
          branch_id: t.branch_id, category_id: t.category_id, _prio: t.priority || (cat ? cat.default_priority : 'Medium'), is_recurring: true });
      }
      due = addInterval(due, t.interval_count, t.interval_unit, t.anchor_day);
    }
  });
  return out;
}
export const nextGenerationDate = (t) => t.next_due_date ? addDays(t.next_due_date, -(t.generate_days_before ?? 10)) : null;
export function recurringSummary(templates, today) {
  const live = templates.filter((t) => !t.archived_at);
  const active = live.filter((t) => t.active);
  const upcoming = active.filter((t) => t.next_due_date && daysBetween(today, t.next_due_date) >= 0 && daysBetween(today, t.next_due_date) <= 45)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  // the due date passed and no bill was made for it: the series has fallen behind
  const missed = active.filter((t) => t.next_due_date && daysBetween(today, t.next_due_date) < 0).sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  return { total: live.length, active: active.length, paused: live.length - active.length, auto: active.filter((t) => t.auto_generate).length, archived: templates.length - live.length, upcoming, missed };
}
export const frequencyText = (t) => t.frequency === 'Custom'
  ? 'Every ' + t.interval_count + ' ' + t.interval_unit + (t.interval_count === 1 ? '' : 's') : t.frequency;

// ---------------------------------------------------------------- branch suggestions (a helper for the one-time assignment)
const STOP = new Set(['mall', 'branch', 'store', 'shop', 'the', 'and']);
const branchTokens = (br) => String(br.name).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));
/** Returns a branch id only when exactly one branch is named in the bill's text; otherwise null. */
export function suggestBranch(b, branches) {
  const text = ' ' + [b.name, b.provider_name, b.account_name, b.notes].join(' ').toLowerCase() + ' ';
  const hits = branches.filter((br) => branchTokens(br).some((t) => new RegExp('[^a-z0-9]' + t + '[^a-z0-9]').test(text)));
  return hits.length === 1 ? hits[0].id : null;
}

// ---------------------------------------------------------------- calendar
/** 6 rows x 7 days (Sunday first) for a month. */
export function monthCells(y, m) {
  const first = ymd(y, m, 1), lead = weekday(first), start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => { const date = addDays(start, i); return { date, inMonth: monthOf(date) === m }; });
}
export const weekDates = (d) => { const s = addDays(d, -weekday(d)); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); };
export const groupByDue = (rows) => group(rows.filter((b) => b.due_date), 'due_date');

// ---------------------------------------------------------------- misc
/** Suggested priority for the add form's "Auto" choice (mirrors the database rule: category default, High from 50,000). */
export function suggestPriority(cat, amount) {
  const base = cat ? cat.default_priority : 'Medium';
  if (Number(amount) >= 50000 && PRIORITY_RANK[base] > PRIORITY_RANK.High) return 'High';
  return base;
}
export const uniqueSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
export { sum, group, round2 };
