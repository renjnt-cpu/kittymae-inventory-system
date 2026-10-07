// Refund Management -- the refund "report card": customer, order, request, approval, payments and proof, customer
// communication, notes, and the full timeline, with the approval controls and every action a person is allowed to take.
// Opens as a drawer from anywhere. Confirmations and reasons are inline panels (the app never uses confirm() / prompt()).
import { esc, money, fmtDate, fmtDateTime, fmtBytes, kv, openDrawer, closeDrawer, drawerBody, isDrawerOpen, actionPanel, errorsText, statusBadge, approvalBadge, paymentBadge, priorityBadge, agingBadge, proofBadge, flagBadges, tagBadge, progressBar } from './refundsUi.js?v=20261008b';
import { METHODS, agingKey, refundableLeft } from './refundsLogic.js?v=20261008b';
import { refundSummaryPdf } from './refundsExport.js?v=20261008b';

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) ? $(id).value : '');
const field = (label, inner) => '<div class="field"><label>' + label + '</label>' + inner + '</div>';
let currentId = null;
let extras = { id: null, timeline: [], communications: [], comments: [] };

export const detailOpenId = () => (currentId !== null && isDrawerOpen('detail') ? currentId : null);
export function closeDetail() { currentId = null; closeDrawer('detail'); }

const short = (s) => { const t = String(s ?? ''); return t.length > 160 ? t.slice(0, 157) + '…' : t; };
const SOURCES = { online: 'Online order', pos: 'Walk-in (POS) sale', layaway: 'Layaway', manual: 'Entered by hand' };
const when = (iso) => iso ? fmtDateTime(iso) : '—';

// ---------------------------------------------------------------- sections
function summaryHtml(r) {
  const pct = r._appr ? Math.round((r._effPaid / r._appr) * 100) : 0;
  const cell = (label, v, cls) => '<div class="bl-sum-cell"><span class="muted">' + label + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>';
  return '<div class="bl-sum">' + cell('Requested', money(r._req)) + cell('Approved', r._appr === null ? '—' : money(r._appr)) + cell('Refunded', money(r._effPaid), r._effPaid > 0 ? 'lv-pos' : '') +
    cell('Remaining', r._approved ? money(r._remaining) : '—', r._remaining > 0 && r._age >= 14 ? 'lv-neg' : '') + '</div>' +
    (r._approved ? progressBar(pct, 'paid') : '') +
    (r._open ? '<p class="muted rf-age">' + agingBadge(agingKey(r._age), r._age) + ' since it was requested on ' + esc(fmtDate(r.requested_date)) + '</p>' : '');
}
function warningsHtml(ctx, r) {
  let h = '';
  if (r._over > 0) h += '<div class="msg lv-warn">Payments recorded on this refund (' + money(r._paid) + ') are more than the approved amount (' + money(r._appr) + '). The records are kept exactly as entered; only the approved amount is counted in totals. ' + (ctx.canAdmin ? 'Void the extra payment if it was a mistake.' : 'Ask an Admin to check them.') + '</div>';
  if (r.status_note && r._awaiting) h += '<div class="msg lv-warn"><b>' + esc(r.approval_status) + ':</b> ' + esc(r.status_note) + '</div>';
  if (r.flagged) h += '<div class="msg lv-warn">⚑ <b>Flagged for management attention</b>' + (r.flag_reason ? ' — ' + esc(r.flag_reason) : '') + '</div>';
  if (r._followWarn) h += '<div class="msg lv-warn">The customer has followed up on this refund <b>' + r.follow_up_count + ' times</b>' + (r.last_follow_up_date ? ' (last on ' + esc(fmtDate(r.last_follow_up_date)) + ')' : '') + '. Please give it priority.</div>';
  if (r.duplicate_flag) h += '<div class="msg lv-warn">Another refund request exists on this order. Check this one is not a duplicate before approving.</div>';
  if (r._selfApproved) h += '<div class="msg lv-warn">This request was approved by the person who requested it. It is recorded in the history.</div>';
  return h;
}
function customerHtml(r) {
  return '<div class="drawer-section"><h4>A · Customer</h4>' + kv('Name', esc(r.customer_name)) + kv('Contact number', esc(r.customer_contact || '—')) + kv('Email', esc(r.customer_email || '—')) +
    kv('Address', esc(r.customer_address || '—')) + (r.customer_ref ? kv('Customer reference', esc(r.customer_ref)) : '') + '</div>';
}
function orderHtml(r) {
  const items = r._items.length ? '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Refund</th></tr></thead><tbody>' +
    r._items.map((i) => '<tr><td data-label="Item">' + esc(i.item_name) + '</td><td data-label="SKU">' + esc(i.sku || '—') + '</td><td data-label="Qty">' + i.quantity + '</td><td data-label="Unit price">' + money(i.unit_price) + '</td><td data-label="Refund"><b>' + money(i.refund_amount) + '</b></td></tr>').join('') + '</tbody></table></div>'
    : (r.item_description ? '<p>' + esc(r.item_description) + '</p>' : '<p class="muted">No item details were entered.</p>');
  return '<div class="drawer-section"><h4>B · Order</h4>' + kv('Order ID', esc(r.order_reference || '—') + (r.order_verified ? ' ' + tagBadge('Found in system', 'bl-tag-green') : ' ' + tagBadge('Not checked', 'bl-tag-gray'))) +
    kv('Source', esc(SOURCES[r.order_source] || (r.order_verified ? r.order_source : 'Entered before the upgrade') || '—')) + kv('Order date', esc(r.order_date || r.purchase_date ? fmtDate(r.order_date || r.purchase_date) : '—')) +
    kv('Sales channel', esc(r.sales_channel || '—')) + kv('Branch', esc(r._branch)) + kv('Original payment', esc(r.original_payment_method || '—')) +
    kv('Order total / paid', r.order_total === null && r.order_paid === null ? '—' : money(r.order_total) + ' / ' + money(r.order_paid)) +
    '<h5 class="rf-sub">Items</h5>' + items + '</div>';
}
function requestHtml(ctx, r) {
  return '<div class="drawer-section"><h4>C · Refund request</h4>' + kv('Refund ID', '<b>' + esc(r.refund_request_number) + '</b>') + kv('Requested on', esc(fmtDate(r.requested_date))) + kv('Requested by', esc(r.created_by_name || '—')) +
    kv('Reason', esc(r.reason_category || '—')) + (r.reason ? kv('Reason details', esc(r.reason)) : '') + (r.notes ? kv('Notes', esc(r.notes)) : '') +
    kv('Amount requested', '<b>' + money(r._req) + '</b>') + kv('Refund method', esc(r.refund_method || '—')) + (r.account_name || r.account_number ? kv('Send to', esc([r.account_name, r.account_number].filter(Boolean).join(' · '))) : '') +
    kv('Priority', priorityBadge(r.priority)) + (ctx.access.view_all && r.internal_notes ? kv('Internal notes', esc(r.internal_notes)) : '') + '</div>';
}
function approvalHtml(r) {
  return '<div class="drawer-section"><h4>D · Approval</h4>' + kv('Approval status', approvalBadge(r.approval_status)) + kv('Payment status', paymentBadge(r.payment_status)) +
    kv('Reviewed by', r.reviewed_by_name ? esc(r.reviewed_by_name) + ' <span class="muted">' + esc(when(r.reviewed_at)) + '</span>' : '—') +
    (r._approved ? kv('Approved by', esc(r.approved_by_name || '—') + (r.approved_date ? ' <span class="muted">' + esc(fmtDate(r.approved_date)) + '</span>' : ' <span class="muted">date not recorded</span>')) + kv('Approved amount', '<b>' + money(r._appr) + '</b>')
      + (r.approval_notes ? kv('Approval notes', esc(r.approval_notes)) : '') + kv('Target payment date', esc(r.target_payment_date ? fmtDate(r.target_payment_date) : 'not set')) : '') +
    (r.approval_status === 'Rejected' ? kv('Rejected by', esc(r.rejected_by_name || '—') + ' <span class="muted">' + esc(when(r.rejected_at)) + '</span>') + kv('Rejection reason', esc(r.rejection_reason || '—')) : '') +
    (r.approval_status === 'Cancelled' ? kv('Cancelled', '<span class="muted">' + esc(when(r.cancelled_at)) + '</span>') + kv('Reason', esc(r.cancel_reason || '—')) : '') +
    (r.completed_date ? kv('Completed on', esc(fmtDate(r.completed_date))) : '') + '</div>';
}
function paymentsHtml(ctx, r) {
  const pay = ctx.access.pay, mgr = ctx.access.approve;
  const rows = r._pays.map((p) => {
    const files = r._files.filter((f) => f.payment_id === p.id);
    const proof = p.voided_at ? '<span class="badge bl-st bl-st-gray">Voided</span> <span class="muted">' + esc(p.void_reason || '') + '</span>'
      : proofBadge(p.proof_verified_at ? 'Verified' : files.length ? 'Proof Uploaded' : 'No Proof') + files.map((f) => ' <button type="button" class="bl-link" data-act="viewfile" data-id="' + f.id + '">📎 ' + esc(f.file_name.length > 18 ? f.file_name.slice(0, 15) + '…' : f.file_name) + '</button>' +
        (pay ? '<button type="button" class="bl-link rf-x" data-act="rmfile" data-id="' + f.id + '" title="Remove this file" aria-label="Remove ' + esc(f.file_name) + '">✕</button>' : '')).join('') +
        (p.proof_verified_at ? '<div class="muted bl-sub">verified by ' + esc(p.proof_verified_by_name || '—') + '</div>' : '');
    const acts = p.voided_at ? '' : [
      pay ? '<button type="button" class="btn small secondary" data-act="editpay" data-id="' + p.id + '">Edit</button>' : '',
      pay ? '<button type="button" class="btn small secondary" data-act="paypfile" data-id="' + p.id + '">Add proof</button>' : '',
      mgr && files.length ? '<button type="button" class="btn small secondary" data-act="verify" data-id="' + p.id + '" data-on="' + (p.proof_verified_at ? '0' : '1') + '">' + (p.proof_verified_at ? 'Unverify' : 'Verify proof') + '</button>' : '',
      ctx.canAdmin ? '<button type="button" class="btn small secondary bl-danger-btn" data-act="void" data-id="' + p.id + '">Void</button>' : ''].join('');
    return '<tr' + (p.voided_at ? ' class="bl-voided"' : '') + '><td data-label="Date">' + esc(fmtDate(p.payment_date)) + '</td><td data-label="Amount"><b>' + money(p.amount) + '</b></td><td data-label="Method">' + esc(p.payment_method) + '</td>' +
      '<td data-label="Reference">' + esc(p.reference_number || '—') + '</td><td data-label="Processed by">' + esc(p.processed_by_name || '—') + '</td><td data-label="Proof" class="full-row">' + proof + '</td>' +
      '<td data-label="" class="full-row">' + (p.notes ? '<div class="muted">' + esc(p.notes) + '</div>' : '') + '<div class="bl-rowact">' + acts + '</div></td></tr>';
  }).join('');
  return '<div class="drawer-section"><h4>E · Refund payments</h4>' +
    (r._approved ? '<div class="bl-paysummary"><div><span class="muted">Approved</span><b>' + money(r._appr) + '</b></div><div><span class="muted">Refunded so far</span><b>' + money(r._effPaid) + '</b></div><div><span class="muted">Remaining</span><b>' + money(r._remaining) + '</b></div></div>'
      : '<p class="muted">No payment can be recorded until the request is approved.</p>') +
    (r._pays.length ? '<div class="table-scroll table-2col"><table class="lv-mini bl-paytable"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Processed by</th><th>Proof</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : (r._approved ? '<p class="muted">No payments recorded yet.</p>' : '')) + '</div>';
}
function filesHtml(ctx, r) {
  const loose = r._files.filter((f) => !f.payment_id);
  const can = ctx.canNote(r);
  return '<div class="drawer-section"><h4>Files</h4>' +
    (loose.length ? loose.map((f) => '<div class="lv-doc" data-file="' + f.id + '"><div><b>' + esc(f.file_name) + '</b><div class="muted">' + esc(f.kind) + ' · ' + esc(fmtBytes(f.file_size || 0)) + ' · ' + esc(f.uploaded_by_name || '') + ' · ' + esc(fmtDate(String(f.created_at).slice(0, 10))) + '</div></div>' +
      '<div class="lv-doc-actions"><button type="button" class="btn small secondary" data-act="viewfile" data-id="' + f.id + '">View</button>' + (ctx.access.pay ? '<button type="button" class="btn small secondary" data-act="rmfile" data-id="' + f.id + '">Remove</button>' : '') + '</div></div>').join('')
      : '<p class="muted">No request attachments. Proof of each refund payment is shown with the payment above.</p>') +
    (can ? '<div class="lv-upload"><button type="button" class="btn small" data-act="upload">+ Attach a file</button></div>' : '') + '</div>';
}
function commHtml(ctx, r) {
  return '<div class="drawer-section"><h4>Customer communication &amp; follow-up</h4>' +
    kv('Customer follow-ups', r.follow_up_count ? '<b class="' + (r._followWarn ? 'lv-neg' : '') + '">' + r.follow_up_count + '</b>' + (r.last_follow_up_date ? ' <span class="muted">last ' + esc(fmtDate(r.last_follow_up_date)) + '</span>' : '') : 'none yet') +
    kv('Our next follow-up', r.next_follow_up_date ? esc(fmtDate(r.next_follow_up_date)) + (r._followDue ? ' <b class="lv-neg">due</b>' : '') : '<span class="muted">not set</span>') +
    (ctx.canNote(r) ? '<div class="bl-rowact rf-gap"><button type="button" class="btn small" data-act="comm">+ Log customer contact</button><button type="button" class="btn small secondary" data-act="followup">Set follow-up date</button></div>' : '') +
    '<div id="rf-d-comm" class="muted">Loading…</div></div>';
}
function actionsHtml(ctx, r) {
  const mgr = ctx.access.approve, more = [];
  const st = r.approval_status;
  if (mgr && ['Pending Approval', 'Needs Information', 'On Hold'].includes(st)) more.push('<button type="button" class="btn small secondary" data-act="review">Start Review</button>');
  if (mgr && ['Pending Approval', 'Under Review', 'On Hold'].includes(st)) more.push('<button type="button" class="btn small secondary" data-act="reqinfo">Request Information</button>');
  if (mgr && ['Pending Approval', 'Under Review', 'Needs Information'].includes(st)) more.push('<button type="button" class="btn small secondary" data-act="hold">Put On Hold</button>');
  if (st === 'Needs Information' && (mgr || ctx.isOwn(r))) more.push('<button type="button" class="btn small secondary" data-act="infoprov">I Added the Information</button>');
  if (ctx.canAdmin && st === 'Approved') more.push('<button type="button" class="btn small secondary" data-act="approve">Change Approved Amount</button>');
  if (mgr) more.push('<button type="button" class="btn small secondary" data-act="priority">Set Priority / Flag</button>');
  if (ctx.canNote(r)) more.push('<button type="button" class="btn small secondary" data-act="note">Add Note</button>');
  more.push('<button type="button" class="btn small secondary" data-act="print">Print Summary</button>', '<button type="button" class="btn small secondary" data-act="pdf">Download PDF</button>');
  if (ctx.canCancel(r)) more.push('<button type="button" class="btn small secondary bl-danger-btn" data-act="cancel">Cancel Request…</button>');
  if (ctx.canAdmin && ['Rejected', 'Cancelled', 'Approved'].includes(st) && !r._livePays.length) more.push('<button type="button" class="btn small secondary" data-act="reopen">Reopen…</button>');
  return '<details class="exp bl-more"><summary><span class="exp-arrow" aria-hidden="true">▸</span>More actions</summary><div class="exp-body"><div class="lv-row-actions">' + more.join('') + '</div></div></details>';
}
function footerHtml(ctx, r) {
  let h = '';
  if (ctx.access.approve && r._awaiting) h += '<button type="button" class="btn" data-act="approve">Approve</button><button type="button" class="btn secondary" data-act="reject">Reject</button>';
  if (ctx.access.pay && r._approved && r._remaining > 0) h += '<button type="button" class="btn" data-act="pay">Record Refund Payment</button>';
  if (ctx.canEdit(r)) h += '<button type="button" class="btn secondary" data-act="edit">Edit</button>';
  return h + '<button type="button" class="btn secondary" data-act="close">Close</button>';
}
function bodyHtml(ctx, r) {
  return '<div id="rf-detail-msg"></div><div class="bl-d-head"><div class="bl-d-badges">' + statusBadge(r.status) + ' ' + priorityBadge(r.priority) + flagBadges(r) + (r.legacy ? ' ' + tagBadge('Earlier record', 'bl-tag-gray') : '') + '</div></div>' +
    summaryHtml(r) + warningsHtml(ctx, r) + actionsHtml(ctx, r) + customerHtml(r) + orderHtml(r) + requestHtml(ctx, r) + approvalHtml(r) + paymentsHtml(ctx, r) + filesHtml(ctx, r) + commHtml(ctx, r) +
    '<div class="drawer-section"><h4>Notes</h4><div id="rf-d-notes" class="muted">Loading…</div></div>' +
    '<div class="drawer-section"><h4>F · Timeline</h4><div id="rf-d-timeline" class="muted">Loading…</div>' +
    (ctx.canAdmin ? '<details class="exp bl-more" id="rf-d-audit-wrap"><summary><span class="exp-arrow" aria-hidden="true">▸</span>Audit trail — every field change</summary><div class="exp-body" id="rf-d-audit"><span class="muted">Opens to load…</span></div></details>' : '') + '</div>';
}

function timelineHtml(list) {
  if (!list.length) return '<p class="muted">Nothing recorded yet.</p>';
  return '<div class="lv-timeline">' + list.map((t) => '<div class="lv-tl-item"><div class="lv-tl-when">' + esc(fmtDateTime(t.created_at)) + '<br>' + esc(t.performed_by_name || 'System') + (t.performed_by_role ? ' · ' + esc(t.performed_by_role) : '') +
    '</div><div><b>' + esc(t.action) + '</b>' + (t.description ? ' <span class="muted">— ' + esc(short(t.description)) + '</span>' : '') + '</div></div>').join('') + '</div>';
}
function commListHtml(list) {
  if (!list.length) return '<p class="muted">No customer contact has been logged.</p>';
  return '<div class="lv-timeline">' + list.map((c) => '<div class="lv-tl-item"><div class="lv-tl-when">' + esc(fmtDateTime(c.occurred_at)) + '<br>' + esc(c.created_by_name || '—') + '</div><div><b>' + esc(c.communication_type) + '</b>' +
    (c.customer_followup ? ' ' + tagBadge('Customer asked', 'bl-tag-yellow') : '') + '<div class="lv-text">' + esc(c.message) + '</div>' + (c.next_follow_up_date ? '<div class="muted">Next follow-up: ' + esc(fmtDate(c.next_follow_up_date)) + '</div>' : '') + '</div></div>').join('') + '</div>';
}
function notesHtml(list) {
  if (!list.length) return '<p class="muted">No notes yet.</p>';
  return '<div class="lv-timeline">' + list.map((c) => '<div class="lv-tl-item"><div class="lv-tl-when">' + esc(fmtDateTime(c.created_at)) + '<br>' + esc(c.user_name || '—') + '</div><div>' + (c.comment_type === 'Internal' ? tagBadge('Internal', 'bl-tag-gray') + ' ' : '') + '<span class="lv-text">' + esc(c.comment) + '</span></div></div>').join('') + '</div>';
}
function auditHtml(list) {
  if (!list.length) return '<p class="muted">No field changes recorded.</p>';
  return '<div class="table-scroll table-2col"><table class="lv-mini"><thead><tr><th>When</th><th>Person</th><th>Action</th><th>Change</th></tr></thead><tbody>' + list.map((l) =>
    '<tr><td data-label="When">' + esc(fmtDateTime(l.created_at)) + '</td><td data-label="Person">' + esc(l.user_name || 'System') + '</td><td data-label="Action">' + esc(l.action) + '</td><td data-label="Change" class="full-row">' +
    (l.field_name ? '<b>' + esc(String(l.field_name).replace(/_/g, ' ')) + '</b>: ' : '') + (l.old_value !== null && l.old_value !== undefined ? '<span class="bl-before">' + esc(short(l.old_value)) + '</span> → ' : '') + (l.new_value !== null && l.new_value !== undefined ? '<span class="bl-after">' + esc(short(l.new_value)) + '</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>';
}

async function openFile(ctx, fileId) {
  const r = ctx.byId.get(currentId);
  const f = r && r._files.find((x) => x.id === Number(fileId));
  if (!f) return;
  const w = window.open('', '_blank');
  try {
    const url = await ctx.api.getFileUrl(f.file_path);
    if (w) { w.location.href = url; return; }
    const row = document.querySelector('[data-file="' + f.id + '"] .lv-doc-actions') || document.getElementById('rf-detail-msg');
    if (row) row.insertAdjacentHTML('afterbegin', '<a class="lv-linkbtn" href="' + esc(url) + '" target="_blank" rel="noopener">Open file</a>');
  } catch (err) { if (w) w.close(); ctx.toast(err, true); }
}

// ---------------------------------------------------------------- printing
function printBody(ctx, r) {
  const pays = r._pays.length ? '<table class="lv-mini"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>By</th><th>Proof</th></tr></thead><tbody>' + r._pays.map((p) => '<tr' + (p.voided_at ? ' class="bl-voided"' : '') + '><td>' + esc(fmtDate(p.payment_date)) + '</td><td>' + money(p.amount) + (p.voided_at ? ' (voided)' : '') + '</td><td>' + esc(p.payment_method) + '</td><td>' + esc(p.reference_number || '—') + '</td><td>' + esc(p.processed_by_name || '—') + '</td><td>' +
    esc(p.voided_at ? '—' : r._files.some((f) => f.payment_id === p.id) ? (p.proof_verified_at ? 'Verified' : 'Uploaded') : 'None') + '</td></tr>').join('') + '</tbody></table>' : '<p>No payments recorded.</p>';
  return '<h2>Refund Summary — ' + esc(r.refund_request_number) + '</h2><p>' + esc(r.customer_name) + ' · Order ' + esc(r.order_reference || '—') + ' · ' + esc(r.status) + ' · Priority ' + esc(r.priority) + '</p>' +
    summaryHtml(r) + customerHtml(r) + orderHtml(r) + requestHtml({ ...ctx, access: { view_all: false } }, r) + approvalHtml(r) + '<div class="drawer-section"><h4>E · Refund payments</h4>' + pays + '</div>' +
    (extras.id === r.id && extras.timeline.length ? '<div class="drawer-section"><h4>F · Timeline</h4>' + timelineHtml(extras.timeline.slice(0, 30)) + '</div>' : '') +
    '<div class="rf-signoff"><div><span>Prepared by</span></div><div><span>Approved by</span></div><div><span>Received by (customer)</span></div></div>' +
    '<p class="muted">Kittymae Jewels — Refund Management · printed ' + esc(ctx.today) + '</p>';
}
async function loadExtras(ctx, r) {
  if (extras.id === r.id && extras.loaded) return extras;
  const [timeline, communications, comments] = await Promise.all([ctx.api.listTimeline(r.id).catch(() => []), ctx.api.listCommunications(r.id).catch(() => []), ctx.api.listComments(r.id).catch(() => [])]);
  extras = { id: r.id, timeline, communications, comments, loaded: true };
  return extras;
}
export async function printRefund(ctx, id) {
  const r = ctx.byId.get(Number(id));
  if (!r) return;
  await loadExtras(ctx, r);
  let area = $('rf-print-root');
  if (!area) { area = document.createElement('div'); area.id = 'rf-print-root'; area.className = 'rf-print-area'; document.body.appendChild(area); }
  area.innerHTML = printBody(ctx, r);
  document.body.classList.add('rf-printing');
  const done = () => { document.body.classList.remove('rf-printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1500); }, 50);
}

// ---------------------------------------------------------------- the card
export async function openDetail(ctx, id, opts = {}) {
  const r = ctx.byId.get(Number(id));
  if (!r) { ctx.toast('That refund request is no longer available.', true); return; }
  const keepScroll = opts.keep && isDrawerOpen('detail') && currentId === r.id ? drawerBody('detail').scrollTop : 0;
  currentId = r.id;
  extras = { id: r.id, timeline: [], communications: [], comments: [], loaded: false }; // always re-read: a note or payment may have just been added
  openDrawer('detail', { title: r.customer_name, sub: r.refund_request_number + ' · Order ' + (r.order_reference || '—') + ' · ' + r._branch, body: bodyHtml(ctx, r), footer: footerHtml(ctx, r) });
  if (keepScroll) drawerBody('detail').scrollTop = keepScroll;

  const reload = async () => { await ctx.refresh(); if (ctx.byId.has(r.id)) openDetail(ctx, r.id, { keep: true }); else closeDetail(); };
  const done = (msg) => async () => { ctx.toast(msg); await reload(); };
  const after = (res, msg) => { if (res && res.ok === false) throw new Error(errorsText(res)); return done(msg)(); };
  const review = async (action, p, msg) => after(await ctx.api.reviewRefund(r.id, action, p || {}), msg);

  // communication, notes and the timeline load after the card is on screen
  loadExtras(ctx, r).then((x) => {
    if (currentId !== r.id) return;
    if ($('rf-d-comm')) $('rf-d-comm').innerHTML = commListHtml(x.communications);
    if ($('rf-d-notes')) $('rf-d-notes').innerHTML = notesHtml(x.comments);
    if ($('rf-d-timeline')) $('rf-d-timeline').innerHTML = timelineHtml(x.timeline);
  });
  const wrap = $('rf-d-audit-wrap');
  if (wrap) wrap.addEventListener('toggle', () => {
    if (!wrap.open || wrap.dataset.loaded) return;
    wrap.dataset.loaded = '1';
    ctx.api.listAudit({ refundId: r.id, limit: 300 }).then((l) => { if ($('rf-d-audit')) $('rf-d-audit').innerHTML = auditHtml(l); }).catch((err) => { if ($('rf-d-audit')) $('rf-d-audit').innerHTML = '<div class="msg error">' + esc(errorsText({ errors: [err.message] })) + '</div>'; });
  });

  const reasonPanel = ({ title, message, placeholder, okLabel, action, doneMsg, danger, min, err }) => actionPanel('detail', {
    title, message, okLabel, danger, fields: '<textarea id="rf-act-reason" rows="3" maxlength="500" placeholder="' + esc(placeholder) + '"></textarea>',
    onOk: async () => { const t = val('rf-act-reason').trim(); if (t.length < (min || 3)) throw new Error(err); await review(action, { reason: t }, doneMsg); },
  });

  // ---- approving: amount, method, target date and notes; the over-limit and duplicate questions appear only if the database raises them
  const approvePanel = () => {
    const left = refundableLeft(r, ctx.refunds);
    const methods = [...new Set([...METHODS, r.refund_method].filter(Boolean))];
    actionPanel('detail', {
      title: r._approved ? 'Change the approved amount' : 'Approve this refund', okLabel: r._approved ? 'Save Approval' : 'Approve Refund', wide: true,
      message: 'Requested <b>' + money(r._req) + '</b>' + (left !== null ? ' · order total ' + money(r.order_total) + ', paid ' + money(r.order_paid) + ', still refundable ' + money(Math.max(left, 0)) : '') + '. Approving does not pay anything — record the payment once the money has gone out.',
      fields: '<div class="bl-formgrid">' + field('Approved amount (PHP) *', '<input type="number" id="rf-ap-amt" step="0.01" min="0.01" max="' + r._req + '" inputmode="decimal" value="' + (r._appr ?? r._req) + '">') +
        field('Refund method *', '<select id="rf-ap-method">' + methods.map((m) => '<option' + (m === r.refund_method ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select>') +
        field('Target payment date', '<input type="date" id="rf-ap-target" min="' + esc(r.requested_date) + '" value="' + esc(r.target_payment_date || '') + '">') + '</div>' +
        field('Approval notes *', '<textarea id="rf-ap-notes" rows="2" maxlength="500" placeholder="What was checked, and any condition?">' + esc(r.approval_notes || '') + '</textarea>') +
        '<div id="rf-ap-over" class="msg lv-warn" hidden><b>More than can still be refunded on this order.</b> A manager may approve it anyway with a written reason, which is kept in the history.' +
          field('Reason *', '<textarea id="rf-ap-overreason" rows="2" maxlength="300" placeholder="Why is this more than the order allows?"></textarea>') + '</div>' +
        '<div id="rf-ap-dup" class="msg lv-warn" hidden><b>Possible duplicate refund request detected.</b><div id="rf-ap-dupmatches"></div><label class="lv-check"><input type="checkbox" id="rf-ap-dupack"> I have checked — this is not a duplicate.</label></div>',
      onOk: async () => {
        const amt = Number(val('rf-ap-amt')), notes = val('rf-ap-notes').trim();
        if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter the approved amount.');
        if (notes.length < 3) throw new Error('Add approval notes (what was checked, and any condition).');
        const p = { approved_amount: amt, refund_method: val('rf-ap-method'), target_payment_date: val('rf-ap-target') || null, notes };
        if (!$('rf-ap-over').hidden) { p.over_limit_ack = true; p.over_limit_reason = val('rf-ap-overreason').trim(); if (p.over_limit_reason.length < 5) throw new Error('Explain briefly why this refund is more than the order allows.'); }
        if (!$('rf-ap-dup').hidden) { if (!$('rf-ap-dupack').checked) throw new Error('Tick the box to confirm this is not a duplicate.'); p.duplicate_ack = true; }
        const res = await ctx.api.reviewRefund(r.id, 'approve', p);
        if (res && res.ok === false) {
          if (res.over_limit) { $('rf-ap-over').hidden = false; $('rf-ap-overreason').focus(); }
          if (res.duplicate) { $('rf-ap-dup').hidden = false; $('rf-ap-dupmatches').innerHTML = (res.matches || []).map((m) => '<div>' + esc(m.number) + ' · ' + esc(m.status) + ' · ' + money(m.amount) + ' · ' + esc(fmtDate(m.requested_date)) + (m.reasons && m.reasons.length ? ' <span class="muted">(' + esc(m.reasons.join(', ')) + ')</span>' : '') + '</div>').join(''); }
          throw new Error(errorsText(res));
        }
        await done('Approved ' + money(amt) + '. Record the payment once it has been paid out.')();
      },
    });
  };

  const handlers = {
    close: () => closeDetail(),
    approve: approvePanel,
    reject: () => reasonPanel({ title: 'Reject this refund request?', message: 'The customer’s request is declined. The reason is kept in the history and shown on the request.', placeholder: 'Reason for rejecting (required)', okLabel: 'Reject Request', action: 'reject', doneMsg: 'Request rejected.', danger: true, min: 3, err: 'A rejection reason is required.' }),
    review: () => actionPanel('detail', { title: 'Start reviewing?', message: 'The request will show as Under Review with your name on it.', okLabel: 'Start Review', onOk: async () => review('start_review', {}, 'Marked as under review.') }),
    reqinfo: () => reasonPanel({ title: 'Ask for more information', message: 'The request goes back to the requester as “Needs Information”, with your question shown on it.', placeholder: 'What information is needed? (required)', okLabel: 'Request Information', action: 'request_info', doneMsg: 'Information requested.', min: 3, err: 'Say what information is needed.' }),
    hold: () => reasonPanel({ title: 'Put this request on hold?', message: 'It stays open but is clearly marked as on hold.', placeholder: 'Why is it on hold? (required)', okLabel: 'Put On Hold', action: 'hold', doneMsg: 'Request put on hold.', min: 3, err: 'Say why the request is on hold.' }),
    infoprov: () => actionPanel('detail', { title: 'Information added?', message: 'This sends the request back to the approval queue as Pending Approval. Add the details as a note or a file first.', okLabel: 'Send Back for Review', onOk: async () => review('info_provided', {}, 'Sent back for review.') }),
    cancel: () => reasonPanel({ title: 'Cancel this request?', message: 'Use this when the customer no longer wants the refund or it was raised by mistake. It stops counting in totals. The request is kept in the history, never deleted.', placeholder: 'Why is it cancelled? (required)', okLabel: 'Cancel Request', action: 'cancel', doneMsg: 'Request cancelled.', danger: true, min: 3, err: 'Tell us why this request is being cancelled.' }),
    reopen: () => reasonPanel({ title: 'Reopen this request?', message: 'It goes back to Under Review' + (r._approved ? ' and the approval is cleared' : '') + '. This is recorded in the history.', placeholder: 'Why is it being reopened? (required)', okLabel: 'Reopen', action: 'reopen', doneMsg: 'Request reopened.', min: 3, err: 'Say why the request is being reopened.' }),
    pay: () => ctx.openPayment(r.id),
    edit: () => ctx.openForm({ id: r.id }),
    upload: () => ctx.openUpload(r.id),
    paypfile: (el) => ctx.openUpload(r.id, { paymentId: Number(el.dataset.id) }),
    editpay: (el) => ctx.openEditPayment(Number(el.dataset.id)),
    note: () => ctx.openNote(r.id),
    comm: () => ctx.openComm(r.id),
    followup: () => ctx.openFollowUp(r.id),
    priority: () => ctx.openPriority(r.id),
    print: () => printRefund(ctx, r.id),
    pdf: async () => { try { const x = await loadExtras(ctx, r); await refundSummaryPdf(ctx, r, x); } catch (err) { ctx.toast(err, true); } },
    viewfile: (el) => openFile(ctx, el.dataset.id),
    verify: async (el) => { const on = el.dataset.on === '1'; await after(await ctx.api.verifyProof(Number(el.dataset.id), on), on ? 'Proof marked as verified.' : 'Verification removed.'); },
    void: (el) => actionPanel('detail', { title: 'Void this payment?', message: 'The payment stays in the history but no longer counts toward the refund. The refund’s status is recalculated.',
      fields: '<textarea id="rf-act-reason" rows="2" maxlength="500" placeholder="Why? (required)"></textarea>', okLabel: 'Void Payment', danger: true,
      onOk: async () => { const t = val('rf-act-reason').trim(); if (t.length < 3) throw new Error('A reason is required to void a payment.'); await after(await ctx.api.voidPayment(Number(el.dataset.id), t), 'Payment voided.'); } }),
    rmfile: (el) => actionPanel('detail', { title: 'Remove this file?', message: 'It is removed from the request. The change is recorded in the history.', okLabel: 'Remove', danger: true, onOk: async () => after(await ctx.api.removeFile(Number(el.dataset.id)), 'File removed.') }),
  };
  const root = $('rf-detail-drawer');
  root.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    const h = handlers[el.dataset.act];
    if (h) Promise.resolve(h(el)).catch((err) => ctx.toast(err, true));
  }));
  if (opts.action && handlers[opts.action]) handlers[opts.action]();
}
