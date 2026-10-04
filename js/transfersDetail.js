// Transfers -- the transfer "card": the visual route and status steps, the request, approval, item movement (with the stock before
// and after each step, read from the stock ledger), release, receiving, discrepancies, files, notes, the timeline and the audit trail,
// with every action a person is allowed to take. It opens as a drawer from anywhere. Confirmations and reasons are inline panels
// (the app never uses confirm() / prompt()).
import { esc, qty, pcs, fmtDate, fmtDateTime, fmtBytes, kv, openDrawer, closeDrawer, drawerBody, isDrawerOpen, actionPanel, errorsText, friendly, statusBadge, priorityBadge, tagBadge, discBadge, routeCard, statusSteps, routeText } from './transfersUi.js?v=20261004f';
import { stockOf, RESOLUTIONS, DISC_TYPES } from './transfersLogic.js?v=20261004f';
import { transferSlipPdf } from './transfersExport.js?v=20261004f';
import { flagInvalid } from './uiKit.js?v=20260928a';

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) ? $(id).value : '');
const field = (label, inner) => '<div class="field"><label>' + label + '</label>' + inner + '</div>';
const must = (res) => { if (res && res.ok === false) { const e = new Error(errorsText(res)); e.res = res; throw e; } return res; };
let currentId = null, activeHandlers = null, activeToast = () => {};
let extras ={ id: null, timeline: [], comments: [], files: [], revisions: [], receiptItems: [], loaded: false };

export const detailOpenId = () => (currentId !== null && isDrawerOpen('detail') ? currentId : null);
export function closeDetail() { currentId = null; closeDrawer('detail'); }
const when = (iso) => (iso ? fmtDateTime(iso) : '—');
const short = (s) => { const x = String(s ?? ''); return x.length > 160 ? x.slice(0, 157) + '…' : x; };
const who = (ctx, id) => (id ? ctx.names[id] || 'Unknown' : '—');

// ---------------------------------------------------------------- sections
function summaryHtml(t) {
  const cell = (label, v, cls) => '<div class="bl-sum-cell"><span class="muted">' + label + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>';
  return '<div class="bl-sum tf-sum5">' + cell('Requested', pcs(t._reqPcs)) + cell('Approved', ['Requested', 'Draft'].includes(t.status) && !t.approved_at ? '—' : pcs(t._apprPcs)) + cell('Released', t._sentPcs > 0 ? pcs(t._sentPcs) : '—') +
    cell('Received', t._recPcs > 0 ? pcs(t._recPcs) : '—', t._recPcs > 0 ? 'lv-pos' : '') + cell('Still expected', t._outstanding > 0 ? pcs(t._outstanding) : '—', t._outstanding > 0 ? 'lv-neg' : '') + '</div>';
}
function warningsHtml(t) {
  let h = t._attention.map((a) => '<div class="msg lv-warn"><b>Needs attention:</b> ' + esc(a.text) + '</div>').join('');
  if (t.override_reason) h += '<div class="msg lv-warn"><b>Stock override:</b> an Admin or Manager allowed this although the source branch did not have enough stock. Reason: ' + esc(t.override_reason) + '</div>';
  if (t.status === 'Draft') h += '<div class="msg lv-warn">This is a <b>Draft</b> — it has not been requested yet and nobody can approve it until it is submitted.</div>';
  if (t.status === 'Rejected') h += '<div class="msg lv-warn"><b>Rejected</b>' + (t.rejection_reason ? ' — ' + esc(t.rejection_reason) : '') + '. No stock moved. The record is kept for history.</div>';
  if (t.status === 'Cancelled') h += '<div class="msg lv-warn"><b>Cancelled</b>' + (t.cancel_reason ? ' — ' + esc(t.cancel_reason) : '') + '. No stock moved. The record is kept for history.</div>';
  return h;
}
function requestHtml(ctx, t) {
  const orig = t.return_of ? ctx.byId.get(t.return_of) : null, returns = ctx.transfers.filter((x) => x.return_of === t.id);
  return '<div class="drawer-section"><h4>A · Request</h4>' + kv('Transfer ID', '<b>' + esc(t.transfer_number) + '</b>') + kv('Route', routeText(ctx, t)) + kv('Requested by', esc(t._requester || '—')) +
    kv('Requested on', esc(t.requested_at ? fmtDateTime(t.requested_at) : 'not yet — still a draft')) + kv('Priority', priorityBadge(t.priority)) + kv('Reason', esc(t.reason || '—')) +
    kv('Expected date', esc(t.expected_date ? fmtDate(t.expected_date) : '—')) + (t.notes ? kv('Notes', esc(t.notes)) : '') +
    (orig ? kv('Return of', '<button type="button" class="bl-link" data-act="openref" data-id="' + orig.id + '">' + esc(orig.transfer_number) + '</button>') : '') +
    (returns.length ? kv('Return transfers', returns.map((x) => '<button type="button" class="bl-link" data-act="openref" data-id="' + x.id + '">' + esc(x.transfer_number) + '</button> ' + statusBadge(x.status)).join('<br>')) : '') + '</div>';
}
function approvalHtml(ctx, t) {
  const rev = extras.id === t.id ? extras.revisions : [], bySku = (id) => (t._items.find((i) => i.id === id) || {}).sku || '#' + id;
  const partial = t._items.some((i) => i.appr !== null && i.appr < i.req);
  return '<div class="drawer-section"><h4>B · Approval</h4>' + kv('Status', statusBadge(t.status)) +
    kv('Approved by', t.approved_at ? esc(t._approver || '—') + ' <span class="muted">' + esc(when(t.approved_at)) + '</span>' : '<span class="muted">not approved yet</span>') +
    (t.approved_at ? kv('Approved quantity', pcs(t._apprPcs) + (partial ? ' ' + tagBadge('Partial approval', 'bl-tag-yellow') : '')) : '') +
    (t.approval_note ? kv('Approval note', esc(t.approval_note)) : '') +
    (t.status === 'Rejected' ? kv('Rejected by', esc(who(ctx, t.rejected_by)) + ' <span class="muted">' + esc(when(t.rejected_at)) + '</span>') + kv('Rejection reason', esc(t.rejection_reason || '—')) : '') +
    (t.status === 'Cancelled' ? kv('Cancelled by', esc(who(ctx, t.cancelled_by)) + ' <span class="muted">' + esc(when(t.cancelled_at)) + '</span>') + kv('Reason', esc(t.cancel_reason || '—')) : '') +
    (t.prepared_at ? kv('Preparation started', esc(who(ctx, t.prepared_by)) + ' <span class="muted">' + esc(when(t.prepared_at)) + '</span>') : '') +
    (t.revision_count ? kv('Revisions', '<b>' + t.revision_count + '</b> <span class="muted">last by ' + esc(who(ctx, t.revised_by)) + ' ' + esc(when(t.revised_at)) + '</span>') : '') +
    (rev.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>When</th><th>Item</th><th>Change</th><th>By</th><th>Why</th></tr></thead><tbody>' + rev.map((r) => '<tr><td data-label="When">' + esc(when(r.created_at)) + '</td><td data-label="Item">' + esc(bySku(r.transfer_item_id)) + '</td><td data-label="Change"><span class="bl-before">' + qty(r.old_qty) + '</span> → <span class="bl-after">' + qty(r.new_qty) + '</span></td><td data-label="By">' + esc(who(ctx, r.revised_by)) + '</td><td data-label="Why" class="full-row">' + esc(r.reason) + '</td></tr>').join('') + '</tbody></table></div>' : '') + '</div>';
}
function lineStatus(i, t) {
  if (!i.sent) return ['Not released', 'bl-tag-gray'];
  if (i.outstanding > 0) return [qty(i.outstanding) + ' still expected', 'bl-tag-yellow'];
  if (i.dam || i.mis || i.rec < i.sent) return ['Counted — discrepancy', 'tf-tag-disc'];
  return ['Complete', 'bl-tag-green'];
}
function itemsHtml(ctx, t) {
  const released = t._sentPcs > 0, rows = t._items.map((i) => {
    const [label, cls] = lineStatus(i, t);
    const srcNow = stockOf(ctx, i.sku, t.from_branch_id), dstNow = stockOf(ctx, i.sku, t.to_branch_id);
    const src = i.srcBefore !== null ? qty(i.srcBefore) + ' → <b>' + qty(i.srcAfter) + '</b>' : '<span class="muted">now ' + qty(srcNow) + '</span>';
    const dst = i.dstBefore !== null ? qty(i.dstBefore) + ' → <b>' + qty(i.dstAfter) + '</b>' : '<span class="muted">now ' + qty(dstNow) + '</span>';
    return '<tr><td data-label="Item"><button type="button" class="bl-link" data-act="sku" data-sku="' + esc(i.sku) + '">' + esc(i.sku) + '</button><div class="muted bl-sub">' + esc(i.name) + '</div></td>' +
      '<td data-label="Requested">' + qty(i.req) + '</td><td data-label="Approved">' + (i.appr === null ? '—' : qty(i.appr)) + '</td><td data-label="Released">' + (i.sent === null ? '—' : qty(i.sent)) + '</td>' +
      '<td data-label="Received">' + (i.sent === null ? '—' : '<b class="' + (i.rec ? 'lv-pos' : '') + '">' + qty(i.rec) + '</b>') + '</td><td data-label="Damaged">' + (i.dam ? '<b class="lv-neg">' + qty(i.dam) + '</b>' : '—') + '</td><td data-label="Missing">' + (i.mis ? '<b class="lv-neg">' + qty(i.mis) + '</b>' : '—') + '</td>' +
      '<td data-label="' + esc(t._from) + ' stock">' + src + '</td><td data-label="' + esc(t._to) + ' stock">' + dst + '</td><td data-label="Line status" class="full-row">' + tagBadge(label, cls) + (i.approval_note ? ' <span class="muted">' + esc(i.approval_note) + '</span>' : '') + '</td></tr>';
  }).join('');
  return '<div class="drawer-section"><h4>C · Items &amp; stock movement</h4>' +
    '<div class="table-scroll table-2col"><table class="lv-mini tf-itemtable"><thead><tr><th>Item</th><th>Requested</th><th>Approved</th><th>Released</th><th>Received</th><th>Damaged</th><th>Missing</th><th>' + esc(t._from) + ' stock<br><span class="muted">before → after</span></th><th>' + esc(t._to) + ' stock<br><span class="muted">before → after</span></th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="muted">' + (released ? 'Stock numbers come from the stock ledger, so they are exactly what the inventory recorded at the time.' : 'No stock has moved yet. “now” is the live quantity in the inventory. Stock leaves ' + esc(t._from) + ' when the transfer is released, and reaches ' + esc(t._to) + ' only when it confirms receipt.') + '</p></div>';
}
function releaseHtml(ctx, t) {
  if (!t.shipped_at) return '<div class="drawer-section"><h4>D · Release / dispatch</h4><p class="muted">Not released yet.</p></div>';
  return '<div class="drawer-section"><h4>D · Release / dispatch</h4>' + kv('Released by', esc(t._releaser || '—') + ' <span class="muted">' + esc(when(t.shipped_at)) + '</span>') + kv('Pieces released', pcs(t._sentPcs)) +
    kv('Courier', esc(t.release_courier || '—')) + kv('Vehicle / plate', esc(t.release_vehicle || '—')) + kv('Driver / carried by', esc(t.release_driver || '—')) + kv('Tracking / reference', esc(t.release_tracking || '—')) + (t.release_notes ? kv('Notes', esc(t.release_notes)) : '') + '</div>';
}
function receivingHtml(ctx, t) {
  const rows = extras.id === t.id ? extras.receiptItems : [];
  const list = t._receipts.length ? t._receipts.map((r, n) => {
    const its = rows.filter((x) => x.receipt_id === r.id);
    return '<div class="tf-receipt"><div><b>Receipt ' + (n + 1) + '</b> · ' + esc(when(r.received_at)) + ' · ' + esc(who(ctx, r.received_by)) + (r.is_final ? ' ' + tagBadge('Closed receiving', 'bl-tag-gray') : '') + (r.legacy ? ' ' + tagBadge('Earlier record', 'bl-tag-gray') : '') + '</div>' +
      (r.notes ? '<div class="muted">' + esc(r.notes) + '</div>' : '') +
      (its.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Item</th><th>Good</th><th>Damaged</th><th>Missing</th><th>Note</th></tr></thead><tbody>' + its.map((x) => { const i = t._items.find((y) => y.id === x.transfer_item_id) || {};
        return '<tr><td data-label="Item">' + esc(i.sku || '#' + x.transfer_item_id) + '</td><td data-label="Good"><b class="lv-pos">' + qty(x.received_qty) + '</b></td><td data-label="Damaged">' + (x.damaged_qty ? '<b class="lv-neg">' + qty(x.damaged_qty) + '</b>' : '—') + '</td><td data-label="Missing">' + (x.missing_qty ? '<b class="lv-neg">' + qty(x.missing_qty) + '</b>' : '—') + '</td><td data-label="Note" class="full-row">' + esc(x.notes || '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : (extras.loaded ? '' : '<div class="muted">Loading…</div>')) + '</div>';
  }).join('') : '<p class="muted">Nothing has been received yet.</p>';
  return '<div class="drawer-section"><h4>E · Receiving</h4>' + (t._recPcs || t._receipts.length ? kv('Received so far', pcs(t._recPcs) + (t._outstanding > 0 ? ' · ' + qty(t._outstanding) + ' still expected' : '')) : '') + (t.received_at ? kv('Completed', esc(who(ctx, t.received_by)) + ' <span class="muted">' + esc(when(t.received_at)) + '</span>') : '') + list + '</div>';
}
function discrepanciesHtml(ctx, t) {
  const c = ctx.caps;
  const rows = t._discs.map((d) => {
    const i = t._items.find((x) => x.id === d.transfer_item_id);
    const files = extras.id === t.id ? extras.files.filter((f) => f.discrepancy_id === d.id) : [];
    return '<tr' + (d.status === 'Open' ? ' class="tf-row-open"' : '') + '><td data-label="Type">' + tagBadge(d.type, d.status === 'Open' ? 'tf-tag-disc' : 'bl-tag-gray') + (d.legacy ? ' ' + tagBadge('Earlier record', 'bl-tag-gray') : '') + '</td><td data-label="Item">' + esc(i ? i.sku : '—') + '</td><td data-label="Quantity"><b>' + qty(d.quantity) + '</b>' + (d.resolved_qty && d.resolved_qty !== d.quantity ? ' <span class="muted">(' + qty(d.resolved_qty) + ' resolved)</span>' : '') + '</td>' +
      '<td data-label="What happened" class="full-row">' + esc(d.explanation) + '<div class="muted bl-sub">Reported by ' + esc(who(ctx, d.reported_by)) + ' · ' + esc(when(d.reported_at)) + '</div>' +
      (files.length ? files.map((f) => '<div><button type="button" class="bl-link" data-act="viewfile" data-id="' + f.id + '">📎 ' + esc(f.file_name) + '</button></div>').join('') : '') + '</td>' +
      '<td data-label="Status" class="full-row">' + (d.status === 'Open' ? '<b class="lv-neg">Open</b>' : '<b class="lv-pos">Resolved</b> — ' + esc(d.resolution || '') + (d.resolution_notes ? '<div class="muted bl-sub">' + esc(d.resolution_notes) + '</div>' : '') + '<div class="muted bl-sub">' + esc(who(ctx, d.resolved_by)) + ' · ' + esc(when(d.resolved_at)) + '</div>') + '</td>' +
      '<td data-label="" class="full-row"><div class="bl-rowact">' + (d.status === 'Open' && c.canResolve() ? '<button type="button" class="btn small" data-act="resolve" data-id="' + d.id + '">Resolve</button>' : '') + (c.canAttach(t) ? '<button type="button" class="btn small secondary" data-act="upload" data-disc="' + d.id + '">Attach photo</button>' : '') + '</div></td></tr>';
  }).join('');
  return '<div class="drawer-section"><h4>F · Discrepancies' + (t._openDiscs.length ? ' <span class="badge tf-tag-disc">' + t._openDiscs.length + ' open</span>' : '') + '</h4>' +
    (t._discs.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Type</th><th>Item</th><th>Qty</th><th>What happened</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="muted">No discrepancy has been reported on this transfer.</p>') +
    (c.canReport(t) ? '<p><button type="button" class="btn small secondary" data-act="report">+ Report a discrepancy</button></p>' : '') +
    '<p class="muted">Damaged and missing pieces are never added to the destination silently. A manager resolves each one: written off, found and received, or returned to the source — and every step is recorded.</p></div>';
}
function ledgerHtml(ctx, t) {
  const rows = t._items.flatMap((i) => [...(i._out ? [i._out] : []), ...i._in]).sort((a, b) => a.id - b.id);
  if (!rows.length) return '';
  const extra = ctx.ledger.filter((x) => x.transfer_id === t.id && !t._items.some((i) => (i._out && i._out.id === x.id) || i._in.some((y) => y.id === x.id)));
  const all = [...rows, ...extra].sort((a, b) => a.id - b.id);
  return '<div class="drawer-section"><h4>G · Stock ledger entries</h4><div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>When</th><th>Type</th><th>SKU</th><th>Branch</th><th>Change</th><th>Before → after</th><th>Reference</th></tr></thead><tbody>' +
    all.map((x) => '<tr><td data-label="When">' + esc(when(x.occurred_at)) + '</td><td data-label="Type">' + esc(x.transaction_type) + '</td><td data-label="SKU">' + esc(x.sku) + '</td><td data-label="Branch">' + esc((ctx.branchById[x.branch_id] || {}).name || x.branch_id) + '</td>' +
      '<td data-label="Change"><b class="' + (x.qty_change < 0 ? 'lv-neg' : 'lv-pos') + '">' + (x.qty_change > 0 ? '+' : '') + qty(x.qty_change) + '</b></td><td data-label="Before → after">' + qty(x.qty_before) + ' → ' + qty(x.qty_after) + '</td><td data-label="Reference">' + esc(x.reference_number || '') + '</td></tr>').join('') + '</tbody></table></div>' +
    '<p class="muted">Every stock change is one row in the inventory ledger — nothing is edited and nothing is deleted. Click an item’s SKU above to see its whole movement history.</p></div>';
}
function filesHtml(ctx, t) {
  const files = extras.id === t.id ? extras.files : [];
  return '<div class="drawer-section"><h4>Attachments</h4>' + (files.length ? files.map((f) => '<div class="lv-doc" data-file="' + f.id + '"><div><b>' + esc(f.file_name) + '</b><div class="muted">' + esc(f.kind) + ' · ' + esc(fmtBytes(f.file_size || 0)) + ' · ' + esc(f.uploaded_by_name || '') + ' · ' + esc(fmtDate(String(f.created_at).slice(0, 10))) + '</div></div>' +
    '<div class="lv-doc-actions"><button type="button" class="btn small secondary" data-act="viewfile" data-id="' + f.id + '">View</button>' + (ctx.caps.mgr ? '<button type="button" class="btn small secondary" data-act="rmfile" data-id="' + f.id + '">Remove</button>' : '') + '</div></div>').join('') : '<p class="muted">' + (extras.loaded ? 'No attachments — transfer slips, packing photos, courier receipts and damage photos can be attached here.' : 'Loading…') + '</p>') +
    (ctx.caps.canAttach(t) ? '<div class="lv-upload"><button type="button" class="btn small" data-act="upload">+ Attach a file</button></div>' : '') + '</div>';
}
function commentsHtml(ctx, list) {
  if (!list.length) return '<p class="muted">No notes yet.</p>';
  return '<div class="lv-timeline">' + list.map((c) => '<div class="lv-tl-item"><div class="lv-tl-when">' + esc(fmtDateTime(c.created_at)) + '<br>' + esc(c.user_name || '—') + '</div><div>' + (c.internal ? tagBadge('Internal', 'bl-tag-gray') + ' ' : '') + '<span class="lv-text">' + esc(c.comment) + '</span></div></div>').join('') + '</div>';
}
function timelineHtml(list) {
  if (!list.length) return '<p class="muted">Nothing recorded yet.</p>';
  return '<div class="lv-timeline">' + list.map((t) => '<div class="lv-tl-item"><div class="lv-tl-when">' + esc(fmtDateTime(t.created_at)) + '<br>' + esc(t.performed_by_name || 'System') + (t.performed_by_role ? ' · ' + esc(t.performed_by_role) : '') +
    '</div><div><b>' + esc(t.action) + '</b>' + (t.description ? ' <span class="muted">— ' + esc(short(t.description)) + '</span>' : '') + '</div></div>').join('') + '</div>';
}
function auditHtml(list) {
  if (!list.length) return '<p class="muted">No field changes recorded.</p>';
  return '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>When</th><th>Person</th><th>Action</th><th>Change</th></tr></thead><tbody>' + list.map((l) =>
    '<tr><td data-label="When">' + esc(fmtDateTime(l.created_at)) + '</td><td data-label="Person">' + esc(l.user_name || 'System') + '</td><td data-label="Action">' + esc(l.action) + '</td><td data-label="Change" class="full-row">' +
    (l.field_name ? '<b>' + esc(String(l.field_name).replace(/_/g, ' ')) + '</b>: ' : '') + (l.old_value !== null && l.old_value !== undefined ? '<span class="bl-before">' + esc(short(l.old_value)) + '</span> → ' : '') + (l.new_value !== null && l.new_value !== undefined ? '<span class="bl-after">' + esc(short(l.new_value)) + '</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>';
}

function actionsMenu(ctx, t) {
  const c = ctx.caps, more = [];
  if (c.canPrepare(t)) more.push(['prepare', 'Start Preparing']);
  if (c.canRevise(t)) more.push(['revise', 'Revise Approved Quantity']);
  if (c.canSendBack(t)) more.push(['sendback', 'Return for Editing…']);
  if (c.canReport(t)) more.push(['report', 'Report a Discrepancy']);
  if (c.canReturn(t)) more.push(['return', 'Create Return Transfer']);
  if (c.involved(t)) more.push(['note', 'Add Note']);
  more.push(['print', 'Print Transfer Document'], ['pdf', 'Download PDF']);
  if (c.canCancel(t)) more.push(['cancel', 'Cancel Transfer…']);
  return '<details class="exp bl-more"><summary><span class="exp-arrow" aria-hidden="true">▸</span>More actions</summary><div class="exp-body"><div class="lv-row-actions">' +
    more.map((x) => '<button type="button" class="btn small secondary' + (x[0] === 'cancel' ? ' bl-danger-btn' : '') + '" data-act="' + x[0] + '">' + x[1] + '</button>').join('') + '</div></div></details>';
}
function footerHtml(ctx, t) {
  const c = ctx.caps; let h = '';
  if (c.canSubmit(t)) h += '<button type="button" class="btn" data-act="submit">Submit for Approval</button>';
  if (c.canApprove(t)) h += '<button type="button" class="btn" data-act="approve">Approve</button>';
  if (c.canReject(t)) h += '<button type="button" class="btn secondary" data-act="reject">Reject</button>';
  if (c.canRelease(t)) h += '<button type="button" class="btn" data-act="release">Release</button>';
  if (c.canReceive(t)) h += '<button type="button" class="btn" data-act="receive">Receive</button>';
  if (c.canEdit(t)) h += '<button type="button" class="btn secondary" data-act="edit">Edit</button>';
  return h + '<button type="button" class="btn secondary" data-act="close">Close</button>';
}
function bodyHtml(ctx, t) {
  return '<div id="tf-detail-msg"></div><div class="bl-d-head"><div class="bl-d-badges">' + statusBadge(t.status) + ' ' + priorityBadge(t.priority) + ' ' + discBadge(t) + (t.return_of ? ' ' + tagBadge('Return transfer', 'bl-tag-blue') : '') + (t.revision_count ? ' ' + tagBadge('Revised', 'bl-tag-yellow') : '') + '</div></div>' +
    routeCard(ctx, t) + statusSteps(t) + summaryHtml(t) + warningsHtml(t) + actionsMenu(ctx, t) + requestHtml(ctx, t) + '<div id="tf-d-approval">' + approvalHtml(ctx, t) + '</div>' + itemsHtml(ctx, t) + releaseHtml(ctx, t) + '<div id="tf-d-receiving">' + receivingHtml(ctx, t) + '</div>' +
    '<div id="tf-d-disc">' + discrepanciesHtml(ctx, t) + '</div>' + ledgerHtml(ctx, t) + '<div id="tf-d-files">' + filesHtml(ctx, t) + '</div>' +
    '<div class="drawer-section"><h4>Notes</h4><div id="tf-d-notes" class="muted">Loading…</div></div>' +
    '<div class="drawer-section"><h4>H · Timeline</h4><div id="tf-d-timeline" class="muted">Loading…</div>' +
    (ctx.caps.mgr ? '<details class="exp bl-more" id="tf-d-audit-wrap"><summary><span class="exp-arrow" aria-hidden="true">▸</span>Audit trail — every field change</summary><div class="exp-body" id="tf-d-audit"><span class="muted">Opens to load…</span></div></details>' : '') + '</div>';
}

async function loadExtras(ctx, t) {
  if (extras.id === t.id && extras.loaded) return extras;
  const [timeline, comments, files, revisions, receiptItems] = await Promise.all([ctx.api.listTimeline(t.id).catch(() => []), ctx.api.listComments(t.id).catch(() => []), ctx.api.listFiles(t.id).catch(() => []),
    ctx.api.listRevisions(t.id).catch(() => []), ctx.api.listReceiptItemsFor(t._receipts.map((r) => r.id)).catch(() => [])]);
  extras = { id: t.id, timeline, comments, files, revisions, receiptItems, loaded: true };
  return extras;
}
async function openFile(ctx, fileId) {
  const f = extras.files.find((x) => String(x.id) === String(fileId));
  if (!f) return;
  const w = window.open('', '_blank');
  try {
    const url = await ctx.api.getFileUrl(f.file_path);
    if (w) { w.location.href = url; return; }
    const row = document.querySelector('[data-file="' + f.id + '"] .lv-doc-actions') || $('tf-detail-msg');
    if (row) row.insertAdjacentHTML('afterbegin', '<a class="lv-linkbtn" href="' + esc(url) + '" target="_blank" rel="noopener">Open file</a>');
  } catch (err) { if (w) w.close(); ctx.toast(err, true); }
}

// ---------------------------------------------------------------- printing
function printBody(ctx, t) {
  const rows = t._items.map((i) => '<tr><td>' + esc(i.sku) + '</td><td>' + esc(i.name) + '</td><td>' + qty(i.req) + '</td><td>' + (i.appr === null ? '—' : qty(i.appr)) + '</td><td>' + (i.sent === null ? '—' : qty(i.sent)) + '</td><td>' + (i.sent === null ? '—' : qty(i.rec)) + '</td><td>' + (i.dam || i.mis ? qty(i.dam) + ' / ' + qty(i.mis) : '—') + '</td></tr>').join('');
  return '<h2>Stock Transfer — ' + esc(t.transfer_number) + '</h2><p><b>' + esc(t._from) + ' → ' + esc(t._to) + '</b> · ' + esc(t.status) + ' · Priority ' + esc(t.priority) + '</p>' +
    '<table class="lv-mini"><tbody><tr><td>Requested by</td><td>' + esc(t._requester || '—') + ' · ' + esc(t.requested_at ? fmtDateTime(t.requested_at) : '—') + '</td><td>Approved by</td><td>' + esc(t._approver || '—') + ' · ' + esc(t.approved_at ? fmtDateTime(t.approved_at) : '—') + '</td></tr>' +
    '<tr><td>Released by</td><td>' + esc(t._releaser || '—') + ' · ' + esc(t.shipped_at ? fmtDateTime(t.shipped_at) : '—') + '</td><td>Received by</td><td>' + esc(t._receiver || '—') + ' · ' + esc(t.received_at ? fmtDateTime(t.received_at) : '—') + '</td></tr>' +
    '<tr><td>Courier / driver</td><td>' + esc([t.release_courier, t.release_driver, t.release_vehicle].filter(Boolean).join(' · ') || '—') + '</td><td>Tracking</td><td>' + esc(t.release_tracking || '—') + '</td></tr>' +
    '<tr><td>Reason</td><td colspan="3">' + esc(t.reason || '—') + (t.notes ? ' · ' + esc(t.notes) : '') + '</td></tr></tbody></table>' +
    '<table class="lv-mini"><thead><tr><th>SKU</th><th>Item</th><th>Requested</th><th>Approved</th><th>Released</th><th>Received</th><th>Damaged / missing</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    (t._discs.length ? '<h4>Discrepancies</h4><table class="lv-mini"><tbody>' + t._discs.map((d) => '<tr><td>' + esc(d.type) + '</td><td>' + qty(d.quantity) + '</td><td>' + esc(d.explanation) + '</td><td>' + esc(d.status === 'Open' ? 'Open' : 'Resolved: ' + (d.resolution || '')) + '</td></tr>').join('') + '</tbody></table>' : '') +
    '<div class="rf-signoff tf-signoff"><div><span>Prepared / released by</span></div><div><span>Courier / carried by</span></div><div><span>Received by (' + esc(t._to) + ')</span></div></div>' +
    '<p class="muted">Kittymae Jewels — Transfers · printed ' + esc(ctx.today) + '</p>';
}
export async function printTransfer(ctx, id) {
  const t = ctx.byId.get(id);
  if (!t) return;
  let area = $('tf-print-root');
  if (!area) { area = document.createElement('div'); area.id = 'tf-print-root'; area.className = 'tf-print-area'; document.body.appendChild(area); }
  area.innerHTML = printBody(ctx, t);
  document.body.classList.add('tf-printing');
  const done = () => { document.body.classList.remove('tf-printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1500); }, 50);
}

// ---------------------------------------------------------------- the card
export async function openDetail(ctx, id, opts = {}) {
  const t = ctx.byId.get(id);
  if (!t) { ctx.toast('That transfer is no longer available.', true); return; }
  const keepScroll = opts.keep && isDrawerOpen('detail') && currentId === t.id ? drawerBody('detail').scrollTop : 0;
  currentId = t.id;
  extras = { id: t.id, timeline: [], comments: [], files: [], revisions: [], receiptItems: [], loaded: false };
  openDrawer('detail', { title: t.transfer_number, sub: t._from + ' → ' + t._to + ' · requested ' + (t._requestedOn ? fmtDate(t._requestedOn) : '—'), body: bodyHtml(ctx, t), footer: footerHtml(ctx, t) });
  if (keepScroll) drawerBody('detail').scrollTop = keepScroll;

  const reload = async () => { await ctx.refresh(); if (ctx.byId.has(t.id)) openDetail(ctx, t.id, { keep: true }); else closeDetail(); };
  const done = (msg) => async () => { ctx.toast(msg); await reload(); };
  const after = (res, msg) => { must(res); return done(msg)(); };

  loadExtras(ctx, t).then((x) => {
    if (currentId !== t.id) return;
    const set = (id2, html) => { if ($(id2)) $(id2).innerHTML = html; };
    set('tf-d-notes', commentsHtml(ctx, x.comments)); set('tf-d-timeline', timelineHtml(x.timeline)); set('tf-d-files', filesHtml(ctx, t)); set('tf-d-receiving', receivingHtml(ctx, t)); set('tf-d-disc', discrepanciesHtml(ctx, t)); set('tf-d-approval', approvalHtml(ctx, t));
  });
  const wrap = $('tf-d-audit-wrap');
  if (wrap) wrap.addEventListener('toggle', () => {
    if (!wrap.open || wrap.dataset.loaded) return;
    wrap.dataset.loaded = '1';
    ctx.api.listAudit({ transferId: t.id, limit: 300 }).then((l) => { if ($('tf-d-audit')) $('tf-d-audit').innerHTML = auditHtml(l); }).catch((err) => { if ($('tf-d-audit')) $('tf-d-audit').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; });
  });

  const reasonPanel = ({ title, message, placeholder, okLabel, call, doneMsg, danger, err }) => actionPanel('detail', {
    title, message, okLabel, danger, fields: '<textarea id="tf-act-reason" rows="3" maxlength="500" placeholder="' + esc(placeholder) + '"></textarea>',
    onOk: async () => { const x = val('tf-act-reason').trim(); if (x.length < 3) throw new Error(err); await after(await call(x), doneMsg); },
  });

  // submit a draft; the stock-short question appears only if the database raises it (Admin / Manager may continue with a reason)
  const submit = (extra) => actionPanel('detail', {
    title: 'Submit for approval?', message: 'The transfer becomes Requested and a manager can approve it. No stock moves until it is released.', okLabel: 'Submit Request',
    onOk: async () => {
      const res = await ctx.api.submitTransfer(t.id, extra || {});
      if (res && res.ok === false && res.insufficient && ctx.caps.mgr && !(extra && extra.override)) {
        actionPanel('detail', { title: 'Not enough stock at the source', wide: true, message: esc(errorsText(res)) + ' As an Admin or Manager you can continue with a written reason, which is kept in the history.',
          fields: field('Reason *', '<textarea id="tf-act-over" rows="2" maxlength="300"></textarea>'), okLabel: 'Submit Anyway',
          onOk: async () => { const r = val('tf-act-over').trim(); if (r.length < 5) throw new Error('Write the reason for the override (a few words at least).'); await after(await ctx.api.submitTransfer(t.id, { override: true, override_reason: r }), t.transfer_number + ' submitted for approval.'); } });
        return;
      }
      await after(res, t.transfer_number + ' submitted for approval.');
    } });

  // report a discrepancy on a line
  const reportPanel = () => {
    const lines = t._items.filter((i) => i.sent > 0);
    actionPanel('detail', {
      title: 'Report a discrepancy', wide: true, okLabel: 'Report Discrepancy',
      message: 'Use this for something found after receiving, or a problem that is not covered by counting at the door. Reporting does not change any stock by itself.',
      fields: '<div class="bl-formgrid">' + field('Line', '<select id="tf-rp-item"><option value="">The whole transfer</option>' + lines.map((i) => '<option value="' + i.id + '">' + esc(i.sku) + ' — ' + esc(i.name) + '</option>').join('') + '</select>') +
        field('Type *', '<select id="tf-rp-type">' + DISC_TYPES.map((x) => '<option>' + x + '</option>').join('') + '</select>') + field('Quantity affected *', '<input type="number" id="tf-rp-qty" min="0" step="1" value="1" inputmode="numeric">') + '</div>' +
        field('What happened? *', '<textarea id="tf-rp-expl" rows="3" maxlength="500"></textarea>'),
      onOk: async () => {
        const q = Number(val('tf-rp-qty')), expl = val('tf-rp-expl').trim();
        if (!Number.isInteger(q) || q < 0) { flagInvalid($('tf-rp-qty')); throw new Error('Quantity must be a whole number, 0 or more.'); }
        if (!expl) { flagInvalid($('tf-rp-expl')); throw new Error('Explain what happened.'); }
        await after(await ctx.api.reportDiscrepancy(t.id, { transfer_item_id: val('tf-rp-item') ? Number(val('tf-rp-item')) : null, type: val('tf-rp-type'), quantity: q, explanation: expl }), 'Discrepancy reported.');
      } });
  };

  // resolve one open discrepancy (managers); what each choice does to the stock is spelled out before anything is saved
  const resolvePanel = (discId) => {
    const d = t._discs.find((x) => x.id === Number(discId));
    if (!d) return;
    const i = t._items.find((x) => x.id === d.transfer_item_id);
    const stockType = !!i && ['Missing', 'Damaged'].includes(d.type);
    const options = RESOLUTIONS.filter((r) => stockType ? (r !== 'Found and received' || d.type === 'Missing') : !['Found and received', 'Returned to source'].includes(r));
    const effect = { 'Written off': 'No stock changes. The pieces are accepted as lost or damaged beyond use.', 'Found and received': 'Adds the pieces to ' + t._to + ' stock now (a new Transfer In entry in the ledger).',
      'Returned to source': 'Adds the pieces back to ' + t._from + ' stock (a ledger Correction entry).', Replaced: 'No stock changes here. If a replacement is sent, create a new transfer for it.', Other: 'No stock changes. Explain in the note.' };
    actionPanel('detail', {
      title: 'Resolve — ' + d.type + (i ? ' · ' + i.sku : ''), wide: true, okLabel: 'Resolve',
      message: esc(d.explanation) + ' · ' + qty(d.quantity) + ' pc(s). Resolving is permanent and recorded in the history.',
      fields: '<div class="bl-formgrid">' + field('How was it resolved? *', '<select id="tf-rs-kind">' + options.map((r) => '<option>' + r + '</option>').join('') + '</select>') +
        field('Quantity resolved *', '<input type="number" id="tf-rs-qty" min="1" max="' + d.quantity + '" step="1" value="' + d.quantity + '" inputmode="numeric">') + '</div><div id="tf-rs-effect" class="lv-preview"></div>' +
        field('Resolution note *', '<textarea id="tf-rs-notes" rows="3" maxlength="500" placeholder="What was found out, who agreed, where the pieces are"></textarea>'),
      onOk: async () => {
        const q = Number(val('tf-rs-qty')), notes = val('tf-rs-notes').trim();
        if (!Number.isInteger(q) || q < 1 || q > d.quantity) { flagInvalid($('tf-rs-qty')); throw new Error('The quantity must be a whole number between 1 and ' + d.quantity + '.'); }
        if (notes.length < 3) { flagInvalid($('tf-rs-notes')); throw new Error('Add a note about the resolution.'); }
        await after(await ctx.api.resolveDiscrepancy(d.id, { resolution: val('tf-rs-kind'), quantity: q, notes }), 'Discrepancy resolved.');
      } });
    const fx = () => { $('tf-rs-effect').innerHTML = '<b>What this does:</b> ' + esc(effect[val('tf-rs-kind')] || ''); };
    $('tf-rs-kind').addEventListener('change', fx); fx();
  };

  const handlers = {
    close: () => closeDetail(),
    submit: () => submit(),
    approve: () => ctx.openApprove(t.id),
    reject: () => reasonPanel({ title: 'Reject this transfer?', message: 'Nothing moves. The reason is kept in the history, and the transfer can never be deleted.', placeholder: 'Reason for rejecting (required)', okLabel: 'Reject Transfer', danger: true, err: 'A rejection reason is required.',
      call: (x) => ctx.api.rejectTransfer(t.id, x), doneMsg: t.transfer_number + ' rejected.' }),
    sendback: () => reasonPanel({ title: 'Return for editing?', message: 'It goes back to its requester as a Draft with your note, so it can be corrected and submitted again.', placeholder: 'What needs to change? (required)', okLabel: 'Return for Editing', err: 'Say what needs to change.',
      call: (x) => ctx.api.returnForEditing(t.id, x), doneMsg: t.transfer_number + ' returned for editing.' }),
    prepare: () => actionPanel('detail', { title: 'Start preparing?', message: 'This marks the transfer as being packed. It does not move any stock — stock leaves ' + esc(t._from) + ' only when you release it.', okLabel: 'Start Preparing', onOk: async () => after(await ctx.api.startPreparing(t.id), t.transfer_number + ' is being prepared.') }),
    release: () => ctx.openRelease(t.id),
    receive: () => ctx.openReceive(t.id),
    revise: () => ctx.openRevise(t.id),
    edit: () => ctx.openForm({ id: t.id }),
    return: () => ctx.openForm({ returnOf: t.id }),
    report: reportPanel,
    resolve: (el) => resolvePanel(el.dataset.id),
    discrepancies: () => { const first = t._openDiscs[0]; if (first && ctx.caps.canResolve()) resolvePanel(first.id); else { const s = $('tf-d-disc'); if (s) s.scrollIntoView({ block: 'start' }); } },
    cancel: () => reasonPanel({ title: 'Cancel this transfer?', message: 'Use this when the transfer is no longer needed. Nothing has left ' + esc(t._from) + ', so no stock changes. The record is kept in the history, never deleted. (A transfer that has been released cannot be cancelled — receive it, or report a discrepancy.)',
      placeholder: 'Why is it cancelled? (required)', okLabel: 'Cancel Transfer', danger: true, err: 'Tell us why this transfer is being cancelled.', call: (x) => ctx.api.cancelTransfer(t.id, x), doneMsg: t.transfer_number + ' cancelled.' }),
    note: () => ctx.openNote(t.id),
    upload: (el) => ctx.openUpload(t.id, el && el.dataset.disc ? { discrepancy: Number(el.dataset.disc), kind: 'Damage Photo' } : {}),
    print: () => printTransfer(ctx, t.id),
    pdf: async () => { try { const x = await loadExtras(ctx, t); await transferSlipPdf(ctx, t, x); } catch (err) { ctx.toast(err, true); } },
    viewfile: (el) => openFile(ctx, el.dataset.id),
    rmfile: (el) => actionPanel('detail', { title: 'Remove this file?', message: 'It is removed from the transfer. The change is recorded in the history.', okLabel: 'Remove', danger: true, onOk: async () => after(await ctx.api.removeFile(Number(el.dataset.id)), 'File removed.') }),
    sku: (el) => ctx.openSku(el.dataset.sku),
    openref: (el) => openDetail(ctx, el.dataset.id),
  };
  // one click handler for the drawer, bound once; it always runs the handlers of the card that is open now
  activeHandlers = handlers; activeToast = ctx.toast;
  const root = $('tf-detail-drawer');
  if (!root.dataset.bound) {
    root.dataset.bound = '1';
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || !root.contains(el) || el.closest('#tf-detail-msg')) return;
      e.preventDefault();
      const h = activeHandlers && activeHandlers[el.dataset.act];
      if (h) Promise.resolve(h(el)).catch((err) => activeToast(err, true));
    });
  }
  if (opts.action && handlers[opts.action]) handlers[opts.action](opts.discrepancy ? { dataset: { id: String(opts.discrepancy) } } : undefined);
}
