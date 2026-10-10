// Transfers -- the rules and the arithmetic. No DOM and no Supabase in this file, so every number on the dashboard comes from
// one place and can be checked on its own.
//
// Stock is NOT calculated here: quantities in stock come from the real inventory (ctx.stock) and the stock ledger (ctx.ledger).
// What this file adds up is the transfer's own lines: requested, approved, released ("sent"), received, damaged, missing.
// Who may do what mirrors the database rules exactly (the database still re-checks every action).
import { addDays, daysBetween, yearOf, monthOf, monthName, MONTHS, addMonths, ymd, sum, group, round2 } from './billsLogic.js?v=20261011a';
import { manilaDate } from './leaveUi.js?v=20261011a';
export { addDays, daysBetween, yearOf, monthOf, monthName, MONTHS, addMonths, ymd, sum, group, round2 };

export const STATUSES = ['Draft', 'Requested', 'Approved', 'Preparing', 'In Transit', 'Partially Received', 'Received', 'Rejected', 'Cancelled'];
export const ACTIVE = ['Draft', 'Requested', 'Approved', 'Preparing', 'In Transit', 'Partially Received'];
export const READY = ['Approved', 'Preparing'];
export const FINISHED = ['Received', 'Rejected', 'Cancelled'];
export const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];
export const PRIORITY_RANK = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
export const DISC_TYPES = ['Missing', 'Damaged', 'Extra Item', 'Wrong SKU', 'Wrong Quantity', 'Other'];
export const RESOLUTIONS = ['Written off', 'Found and received', 'Returned to source', 'Replaced', 'Other'];
export const FILE_KINDS = ['Transfer Slip', 'Packing Photo', 'Receiving Photo', 'Courier Receipt', 'Damage Photo', 'Other'];
export const REASONS = ['Restock the branch', 'Customer order', 'Rebalance stock', 'Display / event', 'Return to warehouse', 'Other'];
export const FILE_TYPES = /^(image\/(jpeg|png)|application\/pdf)$/;
export const MAX_FILE = 10 * 1024 * 1024;
const UNSCOPED_POSITIONS = ['Sales Admin Associate', 'Operations Supervisor', 'Inventory Supervisor', 'Admin Assistant'];
export const DEFAULTS = { approval_days: 2, release_days: 2, transit_days: 3, high_dest_qty: 100 };

const lc = (s) => String(s || '').toLowerCase();
const last = (a) => (a.length ? a[a.length - 1] : null);

// ---------------------------------------------------------------- enrichment
/** Adds the working fields (_items, _pcs, _attention, ...) every screen reads. The raw row is left alone. */
export function enrichTransfers(data, ctx) {
  const disc = group(data.discrepancies || [], 'transfer_id'), receipts = group(data.receipts || [], 'transfer_id'), ledger = group(data.ledger || [], 'transfer_item_id');
  const nm = (id) => (id ? ctx.names[id] || 'Unknown' : null);
  return (data.transfers || []).map((raw) => {
    const t = { ...raw };
    t._from = (ctx.branchById[t.from_branch_id] || {}).name || 'Branch ' + t.from_branch_id;
    t._to = (ctx.branchById[t.to_branch_id] || {}).name || 'Branch ' + t.to_branch_id;
    t._items = (t.inventory_transfer_items || []).map((i) => {
      const rows = (ledger[i.id] || []).slice().sort((a, b) => a.id - b.id);
      const outRow = rows.find((x) => x.transaction_type === 'Branch Transfer Out') || null, inRows = rows.filter((x) => x.transaction_type === 'Branch Transfer In');
      const sent = i.sent_qty === null || i.sent_qty === undefined ? null : Number(i.sent_qty), rec = Number(i.received_qty || 0), dam = Number(i.damaged_qty || 0), mis = Number(i.missing_qty || 0);
      return {
        ...i, name: (i.products && i.products.item_name) || i.sku, category: (i.products && i.products.category) || '', reorder: i.products ? i.products.reorder_level : null,
        req: Number(i.requested_qty), appr: i.approved_qty === null || i.approved_qty === undefined ? null : Number(i.approved_qty), sent, rec, dam, mis,
        outstanding: sent > 0 ? Math.max(sent - rec - dam - mis, 0) : 0,
        srcBefore: outRow ? outRow.qty_before : null, srcAfter: outRow ? outRow.qty_after : null,
        dstBefore: inRows.length ? inRows[0].qty_before : null, dstAfter: inRows.length ? last(inRows).qty_after : null, _out: outRow, _in: inRows,
      };
    }).sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    t._skus = t._items.length;
    t._reqPcs = sum(t._items, (i) => i.req);
    t._apprPcs = sum(t._items, (i) => (i.appr === null ? 0 : i.appr));
    t._sentPcs = sum(t._items, (i) => i.sent || 0);
    t._recPcs = sum(t._items, (i) => i.rec);
    t._outstanding = sum(t._items, (i) => i.outstanding);
    t._pcs = t.received_at || t.last_received_at ? t._recPcs : t.shipped_at ? t._sentPcs : t._apprPcs > 0 && t.status !== 'Requested' ? t._apprPcs : t._reqPcs;
    t._discs = (disc[t.id] || []).slice().sort((a, b) => a.id - b.id);
    t._openDiscs = t._discs.filter((d) => d.status === 'Open');
    t._openDiscQty = sum(t._openDiscs, (d) => d.quantity);
    t._receipts = (receipts[t.id] || []).slice().sort((a, b) => a.id - b.id);
    t._requestedOn = manilaDate(t.requested_at || t.created_at);
    t._shippedOn = t.shipped_at ? manilaDate(t.shipped_at) : null;
    t._receivedOn = t.received_at ? manilaDate(t.received_at) : (t.last_received_at ? manilaDate(t.last_received_at) : null);
    t._active = ACTIVE.includes(t.status);
    t._requester = nm(t.requested_by); t._approver = nm(t.approved_by); t._releaser = nm(t.shipped_by); t._receiver = nm(t.received_by); t._preparer = nm(t.prepared_by);
    t._age = Math.max(daysBetween(t._requestedOn, ctx.today), 0);
    const since = t.status === 'Requested' ? t._requestedOn : READY.includes(t.status) ? manilaDate(t.approved_at || t.requested_at) : ['In Transit', 'Partially Received'].includes(t.status) ? t._shippedOn : null;
    t._stageDays = since ? Math.max(daysBetween(since, ctx.today), 0) : 0;
    t._search = [t.transfer_number, t._from, t._to, t._requester, t._approver, t._receiver, t.reason, t.notes, t.id, t._items.map((i) => i.sku + ' ' + i.name).join(' ')].join(' ').toLowerCase();
    t._attention = attentionFor(t, ctx);
    return t;
  });
}

/** Why a transfer needs somebody's attention right now (empty list = nothing). */
export function attentionFor(t, ctx) {
  const s = ctx.settings, out = [];
  if (t.status === 'Requested' && t._stageDays >= s.approval_days) out.push({ code: 'approval', tone: 'orange', text: 'Waiting ' + t._stageDays + ' days for approval' });
  if (READY.includes(t.status) && t._stageDays >= s.release_days) out.push({ code: 'release', tone: 'orange', text: (t.status === 'Preparing' ? 'Ready' : 'Approved') + ' ' + t._stageDays + ' days ago and not released' });
  if (t.status === 'In Transit' && t._stageDays >= s.transit_days) out.push({ code: 'transit', tone: 'red', text: 'In transit for ' + t._stageDays + ' days' });
  if (t.status === 'Partially Received') out.push({ code: 'partial', tone: 'orange', text: t._outstanding + ' pc(s) still expected' });
  if (t._openDiscs.length) {
    const miss = sum(t._openDiscs.filter((d) => d.type === 'Missing'), (d) => d.quantity), dam = sum(t._openDiscs.filter((d) => d.type === 'Damaged'), (d) => d.quantity);
    out.push({ code: 'discrepancy', tone: 'red', text: 'Open discrepancy: ' + [miss ? miss + ' missing' : '', dam ? dam + ' damaged' : '', t._openDiscs.some((d) => !['Missing', 'Damaged'].includes(d.type)) ? 'other' : ''].filter(Boolean).join(', ') });
  }
  if (['Requested', 'Approved', 'Preparing'].includes(t.status)) {
    const bad = t._items.filter((i) => (i.appr ?? i.req) > stockOf(ctx, i.sku, t.from_branch_id));
    if (bad.length) out.push({ code: 'stock', tone: 'red', text: 'Not enough stock at ' + t._from + ' for ' + bad.map((i) => i.sku).slice(0, 3).join(', ') + (bad.length > 3 ? ' +' + (bad.length - 3) : '') });
  }
  return out;
}
export const stockOf = (ctx, sku, branchId) => Number(((ctx.stock[sku] || {})[branchId]) || 0);

// ---------------------------------------------------------------- who may do what (the database enforces the same rules)
export function makeCaps(ctx) {
  const e = ctx.employee || {}, mgr = e.role === 'Admin' || e.role === 'Manager', admin = e.role === 'Admin';
  const unscoped = !(e.role === 'None' && !UNSCOPED_POSITIONS.includes(e.position || ''));
  const srcOk = (t) => mgr || (e.role === 'Branch Supervisor' && e.branch_id === t.from_branch_id);
  const dstOk = (t) => mgr || (e.role === 'Branch Supervisor' && e.branch_id === t.to_branch_id) || !!ctx.recvAny;
  const own = (t) => t.requested_by === e.id;
  const involved = (t) => mgr || own(t) || (e.branch_id && [t.from_branch_id, t.to_branch_id].includes(e.branch_id)) || (e.role === 'None' && UNSCOPED_POSITIONS.includes(e.position || ''));
  return {
    mgr, admin, own, involved,
    canRequest: (from, to) => unscoped || (e.branch_id && [from, to].includes(e.branch_id)),
    canEdit: (t) => (t.status === 'Draft' && (own(t) || mgr)) || (t.status === 'Requested' && admin),
    canSubmit: (t) => t.status === 'Draft' && (own(t) || mgr),
    canSendBack: (t) => mgr && t.status === 'Requested',
    canApprove: (t) => mgr && t.status === 'Requested' && !own(t) && !(t.revision_count > 0 && t.revised_by === e.id),
    canReject: (t) => mgr && ['Requested', 'Approved'].includes(t.status),
    canPrepare: (t) => srcOk(t) && t.status === 'Approved',
    canRelease: (t) => srcOk(t) && ['Approved', 'Preparing'].includes(t.status) && !own(t),
    canRevise: (t) => mgr && ['Approved', 'Preparing'].includes(t.status),
    canReceive: (t) => dstOk(t) && ['In Transit', 'Partially Received'].includes(t.status),
    canReport: (t) => (dstOk(t) || srcOk(t)) && ['In Transit', 'Partially Received', 'Received'].includes(t.status),
    canResolve: () => mgr,
    canCancel: (t) => (mgr || own(t)) && ['Draft', 'Requested', 'Approved', 'Preparing'].includes(t.status),
    canReturn: (t) => ['Received', 'Partially Received'].includes(t.status) && t._recPcs > 0 && (unscoped || (e.branch_id && [t.from_branch_id, t.to_branch_id].includes(e.branch_id))),
    canAttach: (t) => involved(t),
  };
}

// ---------------------------------------------------------------- filtering and sorting
export const SAVED_VIEWS = [
  { id: 'all', label: 'All Transfers', test: () => true },
  { id: 'active', label: 'Active', live: true, test: (t) => t._active },
  { id: 'requested', label: 'Requested', live: true, test: (t) => t.status === 'Requested' },
  { id: 'ready', label: 'Ready for Release', live: true, test: (t) => READY.includes(t.status) },
  { id: 'transit', label: 'In Transit', live: true, test: (t) => t.status === 'In Transit' },
  { id: 'partial', label: 'Partially Received', live: true, test: (t) => t.status === 'Partially Received' },
  { id: 'received', label: 'Received', test: (t) => t.status === 'Received' },
  { id: 'disc', label: 'Open Discrepancy', live: true, test: (t) => t._openDiscs.length > 0 },
  { id: 'attention', label: 'Needs Attention', live: true, test: (t) => t._attention.length > 0 },
  { id: 'rejected', label: 'Rejected', test: (t) => t.status === 'Rejected' },
  { id: 'cancelled', label: 'Cancelled', test: (t) => t.status === 'Cancelled' },
  { id: 'draft', label: 'Drafts', hidden: true, live: true, test: (t) => t.status === 'Draft' },
  { id: 'waiting', label: 'Waiting for Approval', hidden: true, live: true, test: (t) => t.status === 'Requested' && t._attention.some((a) => a.code === 'approval') },
  { id: 'hadisc', label: 'Had a Discrepancy', hidden: true, test: (t) => t.has_discrepancy },
  { id: 'closed', label: 'Cancelled / Rejected', hidden: true, test: (t) => ['Cancelled', 'Rejected'].includes(t.status) },
];
export const viewById = (id) => SAVED_VIEWS.find((v) => v.id === id) || SAVED_VIEWS[0];

export function inPeriod(t, f) {
  if (!f.year && !f.month) return true;
  return (!f.year || yearOf(t._requestedOn) === f.year) && (!f.month || monthOf(t._requestedOn) === f.month);
}
export function matchesScope(t, f) {
  if (f.from && String(t.from_branch_id) !== String(f.from)) return false;
  if (f.to && String(t.to_branch_id) !== String(f.to)) return false;
  return true;
}
export function matchesQuery(t, q) {
  if (q.search) { const words = q.search.toLowerCase().split(/\s+/).filter(Boolean); if (!words.every((w) => t._search.includes(w))) return false; }
  if (q.status && t.status !== q.status) return false;
  if (q.priority && t.priority !== q.priority) return false;
  if (q.category && !t._items.some((i) => i.category === q.category)) return false;
  if (q.sku && !t._items.some((i) => lc(i.sku).includes(lc(q.sku)) || lc(i.name).includes(lc(q.sku)))) return false;
  if (q.reqFrom && t._requestedOn < q.reqFrom) return false;
  if (q.reqTo && t._requestedOn > q.reqTo) return false;
  if (q.requestedBy && t._requester !== q.requestedBy) return false;
  if (q.receivedBy && t._receiver !== q.receivedBy) return false;
  return true;
}
export const attentionScore = (t) => (t._attention.length ? 1000 + t._attention.length * 100 + t._stageDays + (t.priority === 'Urgent' ? 200 : t.priority === 'High' ? 100 : 0) : (t._active ? 500 + t._stageDays : 0));
const cmpText = (a, b) => String(a || '').localeCompare(String(b || ''));
const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);
export const SORT_FIELDS = [
  { key: 'attention', label: 'Needs attention first' }, { key: 'requested', label: 'Requested Date' }, { key: 'number', label: 'Transfer ID' }, { key: 'status', label: 'Status' },
  { key: 'source', label: 'Source Branch' }, { key: 'destination', label: 'Destination Branch' }, { key: 'skus', label: 'Number of SKUs' }, { key: 'pcs', label: 'Pieces' }, { key: 'priority', label: 'Priority' },
];
const STATUS_RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));
export const SORT_COMPARATORS = {
  attention: (a, b) => attentionScore(a) - attentionScore(b), requested: (a, b) => cmpText(a.requested_at || a.created_at, b.requested_at || b.created_at), number: (a, b) => cmpText(a.transfer_number, b.transfer_number),
  status: (a, b) => (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99), source: (a, b) => cmpText(a._from, b._from), destination: (a, b) => cmpText(a._to, b._to),
  skus: (a, b) => cmpNum(a._skus, b._skus), pcs: (a, b) => cmpNum(a._pcs, b._pcs), priority: (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9),
};

// ---------------------------------------------------------------- dashboard numbers
export function transferKpis(rows, ctx) {
  const cnt = (f) => rows.filter(f).length;
  const openDisc = rows.filter((t) => t._openDiscs.length);
  return {
    total: rows.length, requested: cnt((t) => t.status === 'Requested'), waiting: cnt((t) => t._attention.some((a) => a.code === 'approval')), ready: cnt((t) => READY.includes(t.status)),
    transit: cnt((t) => t.status === 'In Transit'), partial: cnt((t) => t.status === 'Partially Received'), received: cnt((t) => t.status === 'Received'),
    closed: cnt((t) => ['Rejected', 'Cancelled'].includes(t.status)), discrepancies: openDisc.length, discQty: sum(openDisc, (t) => t._openDiscQty), drafts: cnt((t) => t.status === 'Draft'),
    pcsInTransit: sum(rows.filter((t) => t.status === 'In Transit'), (t) => t._outstanding), pcsPartial: sum(rows.filter((t) => t.status === 'Partially Received'), (t) => t._outstanding),
  };
}

export function buildAlerts(rows) {
  const att = rows.filter((t) => t._attention.length).sort((a, b) => attentionScore(b) - attentionScore(a));
  return att;
}

/** Received by branch: what each destination has taken in. */
export function receivedByBranch(rows, branches) {
  return branches.map((b) => {
    const mine = rows.filter((t) => t.to_branch_id === b.id && t._recPcs > 0);
    const dates = mine.map((t) => t._receivedOn).filter(Boolean).sort();
    return {
      branch: b, transfers: mine, count: mine.length, skus: new Set(mine.flatMap((t) => t._items.filter((i) => i.rec > 0).map((i) => i.sku))).size, units: sum(mine, (t) => t._recPcs),
      lastReceipt: dates.length ? last(dates) : null, openDiscs: sum(rows.filter((t) => t.to_branch_id === b.id), (t) => t._openDiscs.length),
    };
  });
}

/** Movement analytics: busiest SKUs and branches, this month's volume, how often a receipt comes up short. */
export function movementStats(rows, ctx) {
  const moved = rows.filter((t) => t._sentPcs > 0);
  const bySku = {};
  moved.forEach((t) => t._items.forEach((i) => { if (i.sent > 0) { const e = bySku[i.sku] || (bySku[i.sku] = { sku: i.sku, name: i.name, units: 0, transfers: 0 }); e.units += i.sent; e.transfers++; } }));
  const tally = (key) => { const g = {}; moved.forEach((t) => { const k = t[key]; const e = g[k] || (g[k] = { id: k, units: 0, count: 0 }); e.units += t._sentPcs; e.count++; }); return Object.values(g).sort((a, b) => b.units - a.units); };
  const y = yearOf(ctx.today), m = monthOf(ctx.today);
  const thisMonth = rows.filter((t) => yearOf(t._requestedOn) === y && monthOf(t._requestedOn) === m && t.status !== 'Cancelled' && t.status !== 'Rejected');
  const released = moved.filter((t) => t._shippedOn && yearOf(t._shippedOn) === y && monthOf(t._shippedOn) === m);
  const finished = rows.filter((t) => t.status === 'Received');
  return {
    topSkus: Object.values(bySku).sort((a, b) => b.units - a.units).slice(0, 8), topSource: tally('from_branch_id')[0] || null, topDest: tally('to_branch_id')[0] || null,
    monthTransfers: thisMonth.length, monthUnits: sum(released, (t) => t._sentPcs), open: rows.filter((t) => t._active).length,
    discRate: finished.length ? Math.round((finished.filter((t) => t.has_discrepancy).length / finished.length) * 100) : 0, discCount: finished.filter((t) => t.has_discrepancy).length, finishedCount: finished.length,
  };
}
export function monthlySeries(rows, ctx, n) {
  const y0 = yearOf(ctx.today), m0 = monthOf(ctx.today);
  return Array.from({ length: n }, (_, i) => {
    const { y, m } = addMonths(y0, m0, i - (n - 1));
    const sent = rows.filter((t) => t._shippedOn && yearOf(t._shippedOn) === y && monthOf(t._shippedOn) === m);
    const rec = rows.filter((t) => t._receivedOn && t._recPcs > 0 && yearOf(t._receivedOn) === y && monthOf(t._receivedOn) === m);
    return { label: monthName(m).slice(0, 3) + (m === 1 || i === 0 ? ' ' + String(y).slice(2) : ''), a: sum(sent, (t) => t._sentPcs), b: sum(rec, (t) => t._recPcs), transfers: sent.length };
  });
}

export const uniqueSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
export { cmpText };

/** Stock before/after for one line, as the preview and the warnings need it. */
export function previewLine(ctx, sku, fromId, toId, qty) {
  const src = stockOf(ctx, sku, fromId), dst = stockOf(ctx, sku, toId);
  const prod = ctx.products[sku] || {};
  const reorder = prod.reorder_level === null || prod.reorder_level === undefined ? null : Number(prod.reorder_level);
  return { sku, src, dst, srcAfter: src - qty, dstAfter: dst + qty, insufficient: qty > src, low: qty <= src && reorder !== null && reorder > 0 && src - qty < reorder, reorder,
    highDest: dst >= ctx.settings.high_dest_qty };
}
