// Refund Management -- the rules and the arithmetic. No DOM and no Supabase in this file, so every number on the
// dashboard comes from one place and can be checked on its own.
//
// Two separate questions are tracked for every refund: was it APPROVED (approval_status) and how much of it has been PAID
// (payment_status). The status people see (r.status) combines the two and is kept up to date by the database.
// "Today" is always the Manila day the database reports (ctx.today).
import { addDays, daysBetween, yearOf, monthOf, monthName, MONTHS, addMonths, ymd, sum, group, round2, weekday } from './billsLogic.js?v=20261007f';
import { manilaDate } from './leaveUi.js?v=20261007f';
export { addDays, daysBetween, yearOf, monthOf, monthName, MONTHS, addMonths, ymd, sum, group, round2, weekday };

export const AWAITING = ['Pending Approval', 'Under Review', 'Needs Information', 'On Hold'];
export const STATUSES = ['Pending Approval', 'Under Review', 'Needs Information', 'On Hold', 'Approved - Waiting Payment', 'Partially Refunded', 'Completed', 'Rejected', 'Cancelled'];
export const APPROVAL_STATUSES = ['Pending Approval', 'Under Review', 'Needs Information', 'On Hold', 'Approved', 'Rejected', 'Cancelled'];
export const PAYMENT_STATUSES = ['Not Yet Refunded', 'Partially Refunded', 'Fully Refunded'];
export const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];
export const PRIORITY_RANK = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
export const METHODS = ['GCash', 'Maya', 'BDO', 'BPI', 'GoTyme', 'Maribank', 'Union Bank', 'Bank Transfer', 'Cash', 'Credit Card Reversal', 'Original Payment Method', 'Other'];
// these need a transfer reference number; cash and "other" do not
export const NEEDS_REFERENCE = METHODS.filter((m) => !['Cash', 'Original Payment Method', 'Other'].includes(m));
export const COMM_METHODS = ['Call', 'SMS', 'Messenger', 'Email', 'In-person', 'Other'];
// proof files: JPG / PNG / PDF, 10 MB at most (the database checks both again)
export const FILE_TYPES = /^(image\/(jpeg|png)|application\/pdf)$/;
export const MAX_FILE = 10 * 1024 * 1024;
export const AGING = [{ key: '0-3', label: '0–3 days', from: 0, to: 3 }, { key: '4-7', label: '4–7 days', from: 4, to: 7 }, { key: '8-14', label: '8–14 days', from: 8, to: 14 },
  { key: '15-30', label: '15–30 days', from: 15, to: 30 }, { key: '30+', label: '30+ days', from: 31, to: 99999 }];
export const agingKey = (days) => (AGING.find((b) => days >= b.from && days <= b.to) || AGING[0]).key;

// ---------------------------------------------------------------- enrichment
/** Adds the working fields (_req, _remaining, _age, _proof, ...) every screen reads. The raw row is left alone. */
export function enrichRefunds(data, ctx) {
  const items = group(data.items || [], 'refund_id'), pays = group(data.payments || [], 'refund_id'), files = group(data.files || [], 'refund_id');
  return (data.refunds || []).map((raw) => {
    const r = { ...raw };
    r._req = Number(r.refund_amount) || 0;
    r._appr = r.approved_amount === null || r.approved_amount === undefined ? null : Number(r.approved_amount);
    r._paid = Number(r.paid_amount || 0);
    r._approved = r.approval_status === 'Approved';
    r._remaining = r._approved ? Math.max(round2((r._appr || 0) - r._paid), 0) : 0;
    r._effPaid = r._appr === null ? r._paid : Math.min(r._paid, r._appr); // what counts as refunded when old records hold more payments than the refund
    r._over = r._appr !== null && r._paid > r._appr + 0.004 ? round2(r._paid - r._appr) : 0;
    r._awaiting = AWAITING.includes(r.approval_status);
    r._open = r._awaiting || (r._approved && r.payment_status !== 'Fully Refunded');
    r._closedOn = r.completed_date || (r.rejected_at ? manilaDate(r.rejected_at) : null) || (r.cancelled_at ? manilaDate(r.cancelled_at) : null);
    r._age = Math.max(daysBetween(r.requested_date, r._open ? ctx.today : (r._closedOn || ctx.today)), 0);
    r._exposure = r._awaiting ? r._req : r._remaining; // money still at stake while the refund is open
    r._branch = r.branch_id ? ((ctx.branchById[r.branch_id] || {}).name || 'Branch ' + r.branch_id) : 'Not set';
    r._items = (items[r.id] || []).slice().sort((a, b) => a.id - b.id);
    r._pays = (pays[r.id] || []).slice().sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)) || b.id - a.id);
    r._livePays = r._pays.filter((p) => !p.voided_at);
    r._files = (files[r.id] || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const hasFile = (p) => r._files.some((f) => f.payment_id === p.id);
    const live = r._livePays, withFile = live.filter(hasFile).length, verified = live.filter((p) => p.proof_verified_at).length;
    r._proof = !live.length ? 'n/a' : verified === live.length ? 'Verified' : withFile === live.length ? 'Proof Uploaded' : withFile > 0 ? 'Partial Proof' : 'No Proof';
    r._missingProof = live.length > 0 && withFile < live.length;
    r._processedBy = [...new Set(live.map((p) => p.processed_by_name).filter(Boolean))].join(', ');
    r._lastPayDate = live.length ? live.map((p) => p.payment_date).sort().pop() : null;
    r._high = (r._appr ?? r._req) >= ctx.highAmount;
    r._followWarn = r._open && r.follow_up_count >= ctx.followWarn;
    r._followDue = r._open && !!r.next_follow_up_date && r.next_follow_up_date <= ctx.today;
    r._selfApproved = !!r.approved_by && r.approved_by === r.created_by && !r.legacy;
    r._search = [r.refund_request_number, r.customer_name, r.order_reference, r.customer_contact, r.item_description, r.notes, r.reason, r.reason_category, r.internal_notes,
      r._items.map((i) => i.item_name).join(' '), r.id].join(' ').toLowerCase();
    return r;
  });
}

// ---------------------------------------------------------------- priority
/** A suggestion only -- it never approves, rejects or changes anything by itself. */
export function suggestPriority(r, ctx) {
  let score = 0; const why = [];
  if ((r._appr ?? r._req) >= ctx.highAmount) { score += 1; why.push('high amount'); }
  if (r._open && r._age >= 30) { score += 2; why.push('open ' + r._age + ' days'); } else if (r._open && r._age >= 14) { score += 1; why.push('open ' + r._age + ' days'); }
  if (r.follow_up_count >= 3) { score += 2; why.push(r.follow_up_count + ' customer follow-ups'); } else if (r.follow_up_count >= 2) { score += 1; why.push(r.follow_up_count + ' customer follow-ups'); }
  if (r.flagged) { score += 3; why.push('flagged by management'); }
  const level = score >= 4 ? 'Urgent' : score >= 2 ? 'High' : (score === 0 && r._req < 500 && r._age < 7 ? 'Low' : 'Normal');
  return { level, why };
}
/** Bigger = needs attention sooner (drives the default sort and the queue order). */
export function attentionScore(r) {
  if (!r._open) return 0;
  // priority first, then how long it has waited -- a request and an unpaid approved refund of the same age rank together
  const pr = 400 - (PRIORITY_RANK[r.priority] ?? 2) * 100;
  return 100 + pr + Math.min(r._age, 200) + (r.flagged ? 300 : 0) + (r._followWarn ? 50 : 0);
}

// ---------------------------------------------------------------- filtering
export function inPeriod(r, f) {
  if (!f.year && !f.month) return true;
  return (!f.year || yearOf(r.requested_date) === f.year) && (!f.month || monthOf(r.requested_date) === f.month);
}
export function matchesScope(r, f) {
  if (f.branch === 'none') { if (r.branch_id) return false; } else if (f.branch && String(r.branch_id) !== String(f.branch)) return false;
  if (f.method && r.refund_method !== f.method) return false;
  return true;
}
// `live` views describe "right now" (a refund that is 20 days old is old whatever month it was requested), so they ignore the Month / Year filter
export const SAVED_VIEWS = [
  { id: 'all', label: 'All Refunds', test: () => true },
  { id: 'pending', label: 'Pending Approval', live: true, test: (r) => r._awaiting },
  { id: 'waiting', label: 'Approved – Waiting Payment', live: true, test: (r) => r.status === 'Approved - Waiting Payment' },
  { id: 'partial', label: 'Partially Refunded', live: true, test: (r) => r.status === 'Partially Refunded' },
  { id: 'completed', label: 'Completed', test: (r) => r.status === 'Completed' },
  { id: 'rejected', label: 'Rejected', test: (r) => r.status === 'Rejected' },
  { id: 'age7', label: '7+ Days Pending', live: true, test: (r) => r._open && r._age >= 7 },
  { id: 'age14', label: '14+ Days Pending', live: true, test: (r) => r._open && r._age >= 14 },
  { id: 'high', label: 'High Amount', test: (r) => r._high },
  { id: 'proof', label: 'Missing Proof', live: true, test: (r) => r._missingProof },
  { id: 'approved', label: 'Approved (all)', hidden: true, test: (r) => r._approved },
  { id: 'owed', label: 'Still Owed', hidden: true, live: true, test: (r) => r._approved && r._remaining > 0 },
  { id: 'cancelled', label: 'Cancelled', hidden: true, test: (r) => r.status === 'Cancelled' },
  { id: 'followup', label: 'Follow-up Due', hidden: true, live: true, test: (r) => r._followDue || r._followWarn },
  { id: 'open', label: 'Open Refunds', hidden: true, live: true, test: (r) => r._open },
  { id: 'data', label: 'Needs a Data Check', hidden: true, live: true, test: (r) => r._over > 0 },
];
export const viewById = (id) => SAVED_VIEWS.find((v) => v.id === id) || SAVED_VIEWS[0];

const lc = (s) => String(s || '').toLowerCase();
/** The extra filters from the "More filters" panel. */
export function matchesQuery(r, q) {
  if (q.search) { const words = q.search.toLowerCase().split(/\s+/).filter(Boolean); if (!words.every((w) => r._search.includes(w))) return false; }
  if (q.status && r.status !== q.status) return false;
  if (q.approval && r.approval_status !== q.approval) return false;
  if (q.payment && r.payment_status !== q.payment) return false;
  if (q.proof && r._proof !== q.proof) return false;
  if (q.approvedBy && lc(r.approved_by_name) !== lc(q.approvedBy)) return false;
  if (q.priority && r.priority !== q.priority) return false;
  if (q.reason && r.reason_category !== q.reason) return false;
  if (q.reqFrom && r.requested_date < q.reqFrom) return false;
  if (q.reqTo && r.requested_date > q.reqTo) return false;
  if (q.apprFrom && !(r.approved_date && r.approved_date >= q.apprFrom)) return false;
  if (q.apprTo && !(r.approved_date && r.approved_date <= q.apprTo)) return false;
  if (q.payFrom && !r._livePays.some((p) => p.payment_date >= q.payFrom)) return false;
  if (q.payTo && !r._livePays.some((p) => p.payment_date <= q.payTo)) return false;
  if (q.min !== '' && q.min !== undefined && r._req < Number(q.min)) return false;
  if (q.max !== '' && q.max !== undefined && r._req > Number(q.max)) return false;
  if (q.age && !(r._open && r._age >= Number(q.age))) return false;
  if (q.high && !r._high) return false;
  if (q.requestedBy && lc(r.created_by_name) !== lc(q.requestedBy)) return false;
  return true;
}

const cmpText = (a, b) => String(a || '').localeCompare(String(b || ''));
const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);
const STATUS_RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));
export const SORT_FIELDS = [
  { key: 'attention', label: 'Needs attention first' }, { key: 'requested_date', label: 'Requested Date' }, { key: 'amount', label: 'Amount' }, { key: 'customer', label: 'Customer' },
  { key: 'status', label: 'Status' }, { key: 'age', label: 'Days Pending' }, { key: 'remaining', label: 'Remaining Balance' }, { key: 'priority', label: 'Priority' }, { key: 'order', label: 'Order ID' },
];
export const SORT_COMPARATORS = {
  attention: (a, b) => attentionScore(a) - attentionScore(b),
  requested_date: (a, b) => cmpText(a.requested_date, b.requested_date) || a.id - b.id,
  amount: (a, b) => cmpNum(a._req, b._req), customer: (a, b) => cmpText(a.customer_name, b.customer_name),
  status: (a, b) => (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99), age: (a, b) => (a._open ? a._age : -1) - (b._open ? b._age : -1),
  remaining: (a, b) => cmpNum(a._remaining, b._remaining), priority: (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9), order: (a, b) => cmpText(a.order_reference, b.order_reference),
};

// ---------------------------------------------------------------- dashboard numbers
export function refundKpis(rows, ctx) {
  const live = rows.filter((r) => r.status !== 'Cancelled');
  const cnt = (f) => rows.filter(f).length;
  const thisMonth = rows.filter((r) => yearOf(r.requested_date) === yearOf(ctx.today) && monthOf(r.requested_date) === monthOf(ctx.today));
  const approved = rows.filter((r) => r._approved);
  return {
    total: rows.length, requested: sum(live, (r) => r._req), approved: sum(approved, (r) => r._appr), refunded: sum(approved, (r) => r._effPaid),
    remaining: sum(approved, (r) => r._remaining),
    awaiting: cnt((r) => r._awaiting), pending: cnt((r) => r.status === 'Pending Approval'), review: cnt((r) => ['Under Review', 'Needs Information', 'On Hold'].includes(r.status)),
    waiting: cnt((r) => r.status === 'Approved - Waiting Payment'), partial: cnt((r) => r.status === 'Partially Refunded'), completed: cnt((r) => r.status === 'Completed'),
    rejected: cnt((r) => r.status === 'Rejected'), cancelled: cnt((r) => r.status === 'Cancelled'), old7: cnt((r) => r._open && r._age > 7),
    monthCount: thisMonth.length, monthAmount: sum(thisMonth.filter((r) => r.status !== 'Cancelled'), (r) => r._req),
    awaitingAmount: sum(rows.filter((r) => r._awaiting), (r) => r._req),
  };
}

const bySeverity = (a, b) => b._age - a._age || b._exposure - a._exposure;
/** The six "attention needed" groups. */
export function buildAlerts(rows, ctx) {
  const open = rows.filter((r) => r._open);
  return {
    oldPending: open.filter((r) => r._awaiting && r._age >= 7).sort(bySeverity),
    waiting: open.filter((r) => r.status === 'Approved - Waiting Payment').sort(bySeverity),
    partial: open.filter((r) => r.status === 'Partially Refunded').sort((a, b) => b._remaining - a._remaining),
    high: open.filter((r) => r._high).sort((a, b) => b._exposure - a._exposure),
    proof: rows.filter((r) => r._missingProof && r.status !== 'Cancelled').sort((a, b) => String(b._lastPayDate).localeCompare(String(a._lastPayDate))),
    long: open.filter((r) => r._age >= 30).sort(bySeverity),
  };
}

/** What the company still owes customers, and when it is meant to be paid. */
export function liability(rows, ctx) {
  const owed = rows.filter((r) => r._approved && r._remaining > 0);
  const notPaid = owed.filter((r) => r.payment_status === 'Not Yet Refunded'), partial = owed.filter((r) => r.payment_status === 'Partially Refunded');
  const bucket = (f) => { const l = owed.filter(f); return { count: l.length, amount: sum(l, (r) => r._remaining), rows: l }; };
  const d = (r) => r.target_payment_date ? daysBetween(ctx.today, r.target_payment_date) : null;
  return {
    unpaid: { count: notPaid.length, amount: sum(notPaid, (r) => r._remaining) }, partial: { count: partial.length, amount: sum(partial, (r) => r._remaining) },
    total: sum(owed, (r) => r._remaining), count: owed.length,
    late: bucket((r) => d(r) !== null && d(r) < 0), week: bucket((r) => d(r) !== null && d(r) >= 0 && d(r) <= 7), month: bucket((r) => d(r) !== null && d(r) > 7 && d(r) <= 30),
    later: bucket((r) => d(r) !== null && d(r) > 30), none: bucket((r) => d(r) === null),
    upcoming: owed.filter((r) => d(r) !== null).sort((a, b) => a.target_payment_date.localeCompare(b.target_payment_date)),
  };
}

export function agingBuckets(rows) {
  const open = rows.filter((r) => r._open);
  return AGING.map((b) => { const l = open.filter((r) => agingKey(r._age) === b.key); return { ...b, count: l.length, amount: sum(l, (r) => r._exposure), rows: l }; });
}

/** Requests and refunded money for each of the last n months (requests by requested month, money by payment month). */
export function monthlySeries(rows, ctx, n) {
  const y0 = yearOf(ctx.today), m0 = monthOf(ctx.today);
  return Array.from({ length: n }, (_, i) => {
    const { y, m } = addMonths(y0, m0, i - (n - 1));
    const reqs = rows.filter((r) => r.status !== 'Cancelled' && yearOf(r.requested_date) === y && monthOf(r.requested_date) === m);
    const refunded = sum(rows.flatMap((r) => r._livePays).filter((p) => yearOf(p.payment_date) === y && monthOf(p.payment_date) === m), (p) => p.amount);
    return { y, m, label: monthName(m).slice(0, 3) + (m === 1 || i === 0 ? ' ' + String(y).slice(2) : ''), count: reqs.length, requested: sum(reqs, (r) => r._req), refunded };
  });
}

/** Totals per reason / branch / method / status. */
export function groupTotals(rows, keyFn, labelFn) {
  const g = {};
  rows.filter((r) => r.status !== 'Cancelled').forEach((r) => {
    const k = keyFn(r), e = g[k] || (g[k] = { key: k, label: labelFn(r), count: 0, requested: 0, approved: 0, refunded: 0, remaining: 0, pending: 0, completed: 0, rejected: 0 });
    e.count++; e.requested += r._req; e.approved += r._approved ? r._appr : 0; e.refunded += r._approved ? r._effPaid : 0; e.remaining += r._remaining;
    if (r._awaiting) e.pending++; if (r.status === 'Completed') e.completed++; if (r.status === 'Rejected') e.rejected++;
  });
  return Object.values(g).sort((a, b) => b.requested - a.requested);
}
export function statusCounts(rows) { const g = {}; rows.forEach((r) => { g[r.status] = (g[r.status] || 0) + 1; }); return g; }

const avg = (arr) => arr.length ? Math.round((sum(arr, (x) => x) / arr.length) * 10) / 10 : null;
/** How fast refunds are being handled. Approval time is only known for requests approved since the upgrade. */
export function refundPerformance(rows, ctx) {
  const decided = rows.filter((r) => r.status !== 'Cancelled');
  const withApproval = rows.filter((r) => r.approved_date && !r.legacy);
  const completed = rows.filter((r) => r.status === 'Completed' && r.completed_date);
  const awaiting = rows.filter((r) => r._awaiting);
  const pct = (n) => decided.length ? Math.round((n / decided.length) * 100) : 0;
  return {
    avgApproval: avg(withApproval.map((r) => Math.max(daysBetween(r.requested_date, r.approved_date), 0))), approvalSample: withApproval.length,
    avgCompletion: avg(completed.map((r) => Math.max(daysBetween(r.requested_date, r.completed_date), 0))), completionSample: completed.length,
    pendingAge: avg(awaiting.map((r) => r._age)), pendingCount: awaiting.length,
    completedPct: pct(decided.filter((r) => r.status === 'Completed').length), rejectedPct: pct(decided.filter((r) => r.status === 'Rejected').length),
    partialPct: pct(decided.filter((r) => r.status === 'Partially Refunded').length), liability: liability(rows, ctx).total,
  };
}

/** One month's report, for the month-against-month comparison. */
export function monthReport(rows, ctx, y, m) {
  const inMonth = rows.filter((r) => yearOf(r.requested_date) === y && monthOf(r.requested_date) === m);
  const live = inMonth.filter((r) => r.status !== 'Cancelled'), approved = live.filter((r) => r._approved), completed = live.filter((r) => r.status === 'Completed' && r.completed_date);
  const open = rows.filter((r) => r._open).sort((a, b) => b._age - a._age)[0] || null;
  return {
    y, m, requests: live.length, requested: sum(live, (r) => r._req), approved: sum(approved, (r) => r._appr), paid: sum(approved, (r) => r._effPaid), remaining: sum(approved, (r) => r._remaining),
    rejected: live.filter((r) => r.status === 'Rejected').length, completed: completed.length, completionRate: live.length ? Math.round((live.filter((r) => r.status === 'Completed').length / live.length) * 100) : 0,
    avgProcessing: avg(completed.map((r) => Math.max(daysBetween(r.requested_date, r.completed_date), 0))), oldestOpen: open,
  };
}

/** Totals for a report on the filtered rows. */
export function totals(rows) {
  const live = rows.filter((r) => r.status !== 'Cancelled'), ap = rows.filter((r) => r._approved);
  return { count: rows.length, requested: sum(live, (r) => r._req), approved: sum(ap, (r) => r._appr), paid: sum(ap, (r) => r._effPaid), remaining: sum(ap, (r) => r._remaining) };
}
export const uniqueSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
export { cmpText };

// ---------------------------------------------------------------- order limits (a hint only -- the database decides)
/** "#42486", "42486" and " 42486 " are the same order (matches the database's own key). */
export const orderKey = (s) => String(s || '').toLowerCase().replace(/[^0-9a-z]/g, '');
/** What can still be refunded on this request's order: the most the customer could have paid, less the other live requests on it (null = order amounts unknown). */
export function refundableLeft(r, refunds) {
  const total = Number(r.order_total) || 0, paid = Number(r.order_paid) || 0;
  if (total <= 0 && paid <= 0) return null;
  const k = orderKey(r.order_reference);
  const others = refunds.filter((x) => x.id !== r.id && orderKey(x.order_reference) === k && !['Rejected', 'Cancelled'].includes(x.approval_status));
  return round2(Math.max(total, paid) - sum(others, (x) => Number(x.refund_amount) || 0));
}
