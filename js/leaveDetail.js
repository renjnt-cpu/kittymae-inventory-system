// Leave Management -- the one request-details drawer used by every tab (My Leave, HR Dashboard,
// Final Approval). What it shows and which buttons appear depends on who is looking and what
// state the request is in -- but that is only the UI: every action is re-checked by the
// database function behind it, so a hidden button is a convenience, not the security.
import {
  esc, statusBadge, fmtDate, fmtDateTime, rangeText, num, daysText, fmtBytes, kv, errorsText,
  EMPLOYEE_EDITABLE, OPEN_STATUSES, PENDING_HR, DECISION_STATUSES, DOC_KINDS, yearOf,
} from './leaveUi.js?v=20261007g';

const $ = (id) => document.getElementById(id);
let cur = null; // { ctx, id, req, timeline, comments, attachments }

export function closeDetail() {
  $('lv-detail-backdrop').classList.remove('open');
  $('lv-detail-drawer').classList.remove('open');
  cur = null;
}

/** opts.action pre-opens an action panel ('cancel') -- used by the table's Cancel button. */
export async function openDetail(ctx, id, opts = {}) {
  cur = { ctx, id, req: null, timeline: [], comments: [], attachments: [], pendingAction: opts.action || null };
  $('lv-detail-title').textContent = 'Leave Request';
  $('lv-detail-sub').textContent = '';
  $('lv-detail-body').innerHTML = '<p class="muted">Loading…</p>';
  $('lv-detail-footer').innerHTML = '';
  $('lv-detail-backdrop').classList.add('open');
  $('lv-detail-drawer').classList.add('open');
  try {
    await loadAll();
    render();
    // Recording "HR/Final Approver viewed this" is best-effort and never blocks reading it.
    if ((ctx.flags.hr || ctx.flags.final) && cur && cur.req && cur.req.employee_id !== ctx.me.employee_id) {
      ctx.api.markViewed(id).then(async () => {
        // refresh only the timeline: a full re-render here would wipe an action panel or
        // comment the person has already started on
        if (cur && cur.id === id) {
          cur.timeline = await ctx.api.listTimeline(id);
          const sec = $('lv-tl-section');
          if (sec && cur && cur.id === id) sec.innerHTML = timelineHtml();
        }
      }).catch(() => {});
    }
  } catch (err) {
    $('lv-detail-body').innerHTML = '<div class="msg error">' + esc(err.message || err) + '</div>';
  }
}

async function loadAll() {
  const { ctx, id } = cur;
  const [req, timeline, comments, attachments, internal] = await Promise.all([
    ctx.api.getRequest(id), ctx.api.listTimeline(id), ctx.api.listComments(id), ctx.api.listAttachments(id),
    ctx.flags.view_all ? ctx.api.getInternal(id).catch(() => null) : Promise.resolve(null),
  ]);
  if (!req) throw new Error('This leave request was not found, or you do not have access to it.');
  req.hr_comments = internal ? internal.hr_comments : null;
  Object.assign(cur, { req, timeline, comments, attachments });
}

async function reload() {
  if (!cur) return;
  await loadAll();
  render();
  await cur.ctx.refresh({ keepDetail: true });
}

// An employee's directory only contains themselves, so anyone else (HR, the Final Approver)
// is shown by role instead of by name.
function who(ctx, employeeId, fallback) {
  const e = ctx.dirById[employeeId];
  return e ? e.full_name : (employeeId ? (fallback || 'HR') : '—');
}

/** HR / Final Approver only: other people in the same department who already have approved leave
 * overlapping this request. Purely informational -- nothing is ever rejected because of it. */
export function overlapInfo(ctx, r) {
  if (!ctx.flags.view_all || !OPEN_STATUSES.includes(r.status)) return null;
  const dept = (ctx.dirById[r.employee_id] || {}).department;
  if (!dept) return null;
  const people = new Map();
  (ctx.data.requests || []).forEach((x) => {
    if (x.id === r.id || x.employee_id === r.employee_id || !['Approved', 'Completed'].includes(x.status)) return;
    if (x.start_date > r.end_date || x.end_date < r.start_date) return;
    if ((ctx.dirById[x.employee_id] || {}).department !== dept) return;
    const list = people.get(x.employee_id) || [];
    list.push(rangeText(x.start_date, x.end_date));
    people.set(x.employee_id, list);
  });
  if (!people.size) return null;
  return { dept, people: Array.from(people.entries()).map(([id, ranges]) => ({ name: who(ctx, id), ranges })) };
}
const overlapText = (o) => o.people.length + (o.people.length === 1 ? ' employee from ' : ' employees from ') + o.dept +
  (o.people.length === 1 ? ' already has' : ' already have') + ' approved leave during these dates.';

function render() {
  const { ctx, req: r } = cur;
  const f = ctx.flags;
  const me = ctx.me.employee_id;
  const emp = ctx.dirById[r.employee_id] || {};
  const type = ctx.typeById[r.leave_type_id] || { name: 'Leave' };
  const isOwner = r.employee_id === me || r.filed_by === me;
  const ownRequest = r.employee_id === me;
  const bal = (ctx.data.balances || []).find((b) => b.employee_id === r.employee_id && b.leave_type_id === r.leave_type_id);
  const avail = bal ? Number(bal.available_credits) : 0;
  const isPaidOpen = r.payment_type === 'Paid' && type.requires_credit && OPEN_STATUSES.includes(r.status);

  $('lv-detail-title').textContent = r.leave_request_number || 'Draft leave request';
  $('lv-detail-sub').innerHTML = statusBadge(r.status, r.cancellation_status) + ' <span class="muted">' + esc(type.name) + '</span>';

  const parts = [];
  parts.push('<div id="lv-action-slot"></div>');

  // Employee
  let empHtml = kv('Name', esc(emp.full_name || '—')) + kv('Employee ID', esc(emp.employee_code || '—')) +
    kv('Department', esc(emp.department || '—')) + kv('Position', esc(emp.job_title || '—'));
  if (f.view_all) {
    empHtml += kv('Employment Start Date', fmtDate(emp.hire_date)) + kv('Employment Status', esc(emp.employment_status || '—')) +
      kv('Immediate Supervisor', esc(emp.supervisor_name || '—'));
  }
  parts.push('<div class="drawer-section"><h4>Employee</h4>' + empHtml + '</div>');

  // Leave details
  const times = (r.start_time || r.end_time) ? ' (' + esc(String(r.start_time || '').slice(0, 5)) + ' – ' + esc(String(r.end_time || '').slice(0, 5)) + ')' : '';
  let leaveHtml = kv('Leave Type', esc(type.name)) + kv('Payment', esc(r.payment_type) + ' leave') + kv('Dates', esc(rangeText(r.start_date, r.end_date))) +
    kv('Duration', esc(r.duration_type) + (r.duration_type === 'Custom Hours' ? times : '')) + kv('Leave Days', esc(daysText(r.requested_days))) +
    kv('Date Filed', fmtDateTime(r.submitted_at || r.created_at));
  if (r.filed_by !== r.employee_id) leaveHtml += kv('Filed By', esc(who(ctx, r.filed_by)) + ' <span class="muted">(on behalf)</span>');
  parts.push('<div class="drawer-section"><h4>Leave Details</h4>' + leaveHtml + '</div>');

  const ov = overlapInfo(ctx, r);
  if (ov) {
    parts.push('<div class="msg lv-warn"><b>Warning:</b> ' + esc(overlapText(ov)) +
      '<details class="exp"><summary><span class="exp-arrow" aria-hidden="true">▸</span>Who</summary><div class="exp-body">' +
      ov.people.map((p) => '<div>' + esc(p.name) + ' <span class="muted">· ' + esc(p.ranges.join(', ')) + '</span></div>').join('') +
      '</div></details><div class="muted">For information only — the request is not rejected automatically.</div></div>');
  }

  // How the days were counted
  const bd = Array.isArray(r.calc_breakdown) ? r.calc_breakdown : [];
  if (bd.length) {
    parts.push('<div class="drawer-section"><details class="exp"><summary><span class="exp-arrow" aria-hidden="true">▸</span>How the days were counted</summary><div class="exp-body">' +
      '<table class="lv-mini"><tbody>' + bd.map((d) =>
        '<tr class="' + (Number(d.counted) > 0 ? '' : 'lv-skip') + '"><td>' + esc(fmtDate(d.date)) + '</td><td>' + esc(d.reason) + '</td><td style="text-align:right;">' + esc(num(d.counted)) + '</td></tr>').join('') +
      '</tbody></table></div></details></div>');
  }

  // Reason / contact / notes
  let reasonHtml = '<div class="lv-text">' + esc(r.reason || '—') + '</div>';
  if (r.emergency_contact_name || r.emergency_contact_number) {
    reasonHtml += '<div class="drawer-kv"><span>Emergency Contact</span><b>' + esc([r.emergency_contact_name, r.emergency_contact_number].filter(Boolean).join(' · ')) + '</b></div>';
  }
  if (r.employee_notes) reasonHtml += '<div class="drawer-kv"><span>Employee Notes</span><b>' + esc(r.employee_notes) + '</b></div>';
  parts.push('<div class="drawer-section"><h4>Reason</h4>' + reasonHtml + '</div>');

  // Credits
  let credHtml = kv('Available Leave Credits (' + esc(type.name) + ')', esc(num(avail)) + (avail === 1 ? ' day' : ' days')) + kv('Requested Days', esc(daysText(r.requested_days)));
  if (isPaidOpen) credHtml += kv('Expected Balance After Approval', esc(num(avail - Number(r.requested_days))) + ' days');
  if (Number(r.deducted_credits) > 0) credHtml += kv('Credits Deducted', esc(daysText(r.deducted_credits)));
  if (f.view_all) {
    const yr = yearOf(ctx.today);
    const used = (ctx.data.requests || []).filter((x) => x.employee_id === r.employee_id && ['Approved', 'Completed'].includes(x.status) && yearOf(x.start_date) === yr)
      .reduce((s, x) => s + Number(x.requested_days), 0);
    credHtml += kv('Used Leave This Year (paid + unpaid)', esc(daysText(used)));
  }
  parts.push('<div class="drawer-section"><h4>Leave Credits</h4>' + credHtml + '</div>');

  // Decisions
  let decHtml = '';
  if (f.view_all && r.hr_recommendation) {
    decHtml += kv('HR Recommendation', esc(r.hr_recommendation)) + kv('Reviewed By', esc(who(ctx, r.hr_reviewed_by)) + ' · ' + esc(fmtDateTime(r.hr_reviewed_at)));
    if (r.hr_comments) decHtml += kv('HR Comments', esc(r.hr_comments));
  }
  if (['Approved', 'Rejected', 'Completed'].includes(r.status) || r.final_reviewed_at) {
    decHtml += kv('Final Decision', esc(r.status === 'Rejected' ? 'Rejected' : 'Approved')) + kv('Decided By', esc(who(ctx, r.final_reviewed_by, 'Final Approver')) + ' · ' + esc(fmtDateTime(r.final_reviewed_at)));
    if (r.final_approver_comments) decHtml += kv('Comments', esc(r.final_approver_comments));
    if (r.rejection_reason) decHtml += kv('Rejection Reason', esc(r.rejection_reason));
  }
  if (r.cancellation_status) {
    decHtml += kv('Cancellation', esc(r.cancellation_status)) + (r.cancellation_reason ? kv('Cancellation Reason', esc(r.cancellation_reason)) : '');
  }
  if (decHtml) parts.push('<div class="drawer-section"><h4>Decision</h4>' + decHtml + '</div>');

  // Documents
  // documents can only change while the request is open (the database enforces the same rule)
  const canDocs = (isOwner && EMPLOYEE_EDITABLE.includes(r.status)) || (f.hr && OPEN_STATUSES.includes(r.status));
  parts.push('<div class="drawer-section"><h4>Supporting Documents</h4>' +
    (cur.attachments.length ? cur.attachments.map((a) =>
      '<div class="lv-doc"><div><b>' + esc(a.file_name) + '</b><div class="muted">' + esc(a.kind) + ' · ' + esc(fmtBytes(a.file_size)) + ' · ' +
      esc(who(ctx, a.uploaded_by)) + ' · ' + esc(fmtDateTime(a.created_at)) + '</div></div><div class="lv-doc-actions">' +
      '<button type="button" class="btn small secondary" data-doc-view="' + esc(a.file_path) + '">View</button>' +
      (canDocs ? '<button type="button" class="btn small secondary" data-doc-del="' + a.id + '">Remove</button>' : '') + '</div></div>').join('')
      : '<p class="muted">No documents attached.</p>') +
    (canDocs ? '<div class="lv-upload"><select id="lv-doc-kind">' + DOC_KINDS.map((k) => '<option>' + esc(k) + '</option>').join('') + '</select>' +
      '<input type="file" id="lv-doc-file" accept=".pdf,.jpg,.jpeg,.png"><button type="button" class="btn small" id="lv-doc-upload">Upload</button></div>' +
      '<div class="muted" style="margin-top:4px;">PDF, JPG or PNG, up to ' + esc(ctx.settings.max_attachment_mb || 5) + ' MB.</div>' : '') +
    '</div>');

  // Employee's recent leave (HR / Final Approver / Auditor)
  if (f.view_all) {
    const hist = (ctx.data.requests || []).filter((x) => x.employee_id === r.employee_id && x.id !== r.id && x.status !== 'Draft')
      .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date))).slice(0, 6);
    parts.push('<div class="drawer-section"><h4>Recent Leave History</h4>' + (hist.length
      ? '<table class="lv-mini"><tbody>' + hist.map((x) => '<tr data-open-req="' + x.id + '" class="lv-click"><td>' + esc(fmtDate(x.start_date)) + '</td><td>' +
        esc((ctx.typeById[x.leave_type_id] || {}).name || '') + '</td><td>' + esc(num(x.requested_days)) + 'd</td><td>' + statusBadge(x.status) + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="muted">No other leave on file.</p>') + '</div>');
  }

  // Timeline (its own element so the "viewed" bookkeeping can refresh just this section)
  parts.push('<div class="drawer-section" id="lv-tl-section">' + timelineHtml() + '</div>');

  // Comments
  const pub = cur.comments.filter((c) => c.comment_type === 'public');
  const internal = cur.comments.filter((c) => c.comment_type === 'internal');
  const canComment = isOwner || f.hr;
  parts.push('<div class="drawer-section"><h4>Comments</h4>' + (pub.length ? pub.map(commentHtml).join('') : '<p class="muted">No comments yet.</p>') +
    (canComment ? '<div class="lv-comment-form"><textarea id="lv-comment-text" rows="2" placeholder="Write a comment visible to the employee, HR and the Final Approver…"></textarea>' +
      '<button type="button" class="btn small" id="lv-comment-add">Add Comment</button></div>' : '') + '</div>');
  if (f.view_all) {
    parts.push('<div class="drawer-section"><h4>Internal Notes <span class="muted" style="text-transform:none;">— HR and Final Approver only; the employee never sees these</span></h4>' +
      (internal.length ? internal.map(commentHtml).join('') : '<p class="muted">No internal notes.</p>') +
      (f.hr ? '<div class="lv-comment-form"><textarea id="lv-note-text" rows="2" placeholder="Add an internal note…"></textarea><button type="button" class="btn small secondary" id="lv-note-add">Add Internal Note</button></div>' : '') +
      '</div>');
  }
  // keep half-typed comments across a re-render (e.g. after posting the *other* kind of comment)
  const typed = { comment: ($('lv-comment-text') || {}).value, note: ($('lv-note-text') || {}).value };
  $('lv-detail-body').innerHTML = parts.join('');
  if (typed.comment && $('lv-comment-text')) $('lv-comment-text').value = typed.comment;
  if (typed.note && $('lv-note-text')) $('lv-note-text').value = typed.note;

  // Footer: the actions this person can take on this request right now
  const btns = [];
  const act = (key, label, cls) => btns.push('<button type="button" class="btn' + (cls ? ' ' + cls : '') + '" data-act="' + key + '">' + esc(label) + '</button>');
  if (isOwner && EMPLOYEE_EDITABLE.includes(r.status)) act('edit', r.status === 'Draft' ? 'Continue Editing' : (r.status === 'Needs Employee Information' ? 'Update & Resubmit' : 'Edit Request'));
  if (isOwner && r.status === 'Draft') act('delete_draft', 'Delete Draft', 'secondary');
  if (f.hr && !ownRequest && PENDING_HR.includes(r.status)) {
    act('hr_approve', 'Recommend Approval'); act('hr_reject', 'Recommend Rejection', 'secondary'); act('hr_info', 'Request More Information', 'secondary');
  }
  if (f.final && !ownRequest && DECISION_STATUSES.includes(r.status)) {
    act('final_approve', 'Approve'); act('final_reject', 'Reject', 'secondary');
    if (!PENDING_HR.includes(r.status)) act('final_return', 'Return to HR', 'secondary');
    act('final_info', 'Request More Information', 'secondary');
  }
  if (f.hr && (!ownRequest || f.final) && r.status === 'Approved' && r.cancellation_status === 'Requested') {
    act('cancel_approve', 'Approve Cancellation'); act('cancel_reject', 'Decline Cancellation', 'secondary');
  }
  if (f.hr && !ownRequest && OPEN_STATUSES.includes(r.status)) {
    act('pay_switch', r.payment_type === 'Paid' ? 'Change to Unpaid' : 'Change to Paid', 'secondary');
  }
  const canCancel = (isOwner || f.hr) && (OPEN_STATUSES.includes(r.status) ||
    (r.status === 'Approved' && r.cancellation_status !== 'Requested' && r.end_date >= ctx.today));
  if (canCancel) act('cancel', r.status === 'Approved' ? 'Request Cancellation' : 'Cancel Request', 'secondary');
  btns.push('<button type="button" class="btn secondary" data-act="close">Close</button>');
  $('lv-detail-footer').innerHTML = btns.join('');

  wire();
  if (cur.pendingAction) { const a = cur.pendingAction; cur.pendingAction = null; startAction(a); }
}

function timelineHtml() {
  return '<h4>Timeline</h4><div class="lv-timeline">' + (cur.timeline.length ? cur.timeline.map((t) =>
    '<div class="lv-tl-item' + (t.is_internal ? ' lv-internal' : '') + '"><div class="lv-tl-when">' + esc(fmtDateTime(t.created_at)) + '</div>' +
    '<div class="lv-tl-what"><b>' + esc(t.action) + '</b>' + (t.is_internal ? ' <span class="badge lv-gray">Internal</span>' : '') +
    (t.description ? '<div>' + esc(t.description) + '</div>' : '') +
    '<div class="muted">' + esc(t.performed_by_name || 'System') + ' · ' + esc(t.performed_by_role) + '</div></div></div>').join('') : '<p class="muted">No activity yet.</p>') + '</div>';
}

function commentHtml(c) {
  return '<div class="lv-comment"><div class="muted"><b>' + esc(c.user_name || '—') + '</b> · ' + esc(c.user_role || '') + ' · ' + esc(fmtDateTime(c.created_at)) + '</div>' +
    '<div class="lv-text">' + esc(c.comment) + '</div></div>';
}

function wire() {
  const body = $('lv-detail-body'), foot = $('lv-detail-footer');
  foot.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => startAction(b.dataset.act)));
  body.querySelectorAll('[data-open-req]').forEach((row) => row.addEventListener('click', () => openDetail(cur.ctx, row.dataset.openReq)));
  body.querySelectorAll('[data-doc-view]').forEach((b) => b.addEventListener('click', async () => {
    try { window.open(await cur.ctx.api.getAttachmentUrl(b.dataset.docView), '_blank'); } catch (err) { cur.ctx.toast(err.message || String(err), true); }
  }));
  body.querySelectorAll('[data-doc-del]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await cur.ctx.api.deleteAttachment(Number(b.dataset.docDel)); await reload(); } catch (err) { cur.ctx.toast(err.message || String(err), true); b.disabled = false; }
  }));
  const up = $('lv-doc-upload');
  if (up) up.addEventListener('click', async () => {
    const file = $('lv-doc-file').files[0];
    if (!file) { cur.ctx.toast('Choose a file first.', true); return; }
    const err = fileProblem(cur.ctx, file);
    if (err) { cur.ctx.toast(err, true); return; }
    up.disabled = true;
    try {
      const res = await cur.ctx.api.uploadAttachment(cur.id, file, $('lv-doc-kind').value);
      if (res && res.ok === false) cur.ctx.toast(errorsText(res), true); else { cur.ctx.toast('Document uploaded.', false); await reload(); }
    } catch (e) { cur.ctx.toast(e.message || String(e), true); }
    up.disabled = false;
  });
  const addC = $('lv-comment-add');
  if (addC) addC.addEventListener('click', () => postComment('lv-comment-text', 'public', addC));
  const addN = $('lv-note-add');
  if (addN) addN.addEventListener('click', () => postComment('lv-note-text', 'internal', addN));
}

export function fileProblem(ctx, file) {
  const ok = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) && /\.(pdf|jpe?g|png)$/i.test(file.name);
  if (!ok) return 'Only PDF, JPG, JPEG and PNG files are allowed.';
  const max = Number(ctx.settings.max_attachment_mb || 5);
  if (file.size > max * 1024 * 1024) return 'That file is too large. The limit is ' + max + ' MB.';
  return null;
}

async function postComment(textId, type, btn) {
  const text = $(textId).value.trim();
  if (!text) { cur.ctx.toast('Please write a comment first.', true); return; }
  btn.disabled = true;
  try {
    const res = await cur.ctx.api.addComment(cur.id, text, type);
    if (res && res.ok === false) cur.ctx.toast(errorsText(res), true); else { $(textId).value = ''; await reload(); }
  } catch (err) { cur.ctx.toast(err.message || String(err), true); }
  btn.disabled = false;
}

// ---- actions: each opens a confirmation panel at the top of the drawer ----
function startAction(key) {
  const { ctx, req: r } = cur;
  const type = ctx.typeById[r.leave_type_id] || { name: 'leave' };
  const emp = who(ctx, r.employee_id);
  const bal = (ctx.data.balances || []).find((b) => b.employee_id === r.employee_id && b.leave_type_id === r.leave_type_id);
  const avail = bal ? Number(bal.available_credits) : 0;
  const reqId = cur.id;
  const API = ctx.api;
  const defs = {
    close: null,
    edit: null,
    hr_approve: { title: 'Recommend approval', msg: 'Recommend that ' + emp + '\'s leave be approved? It will go to the Final Approver for the decision.', label: 'Comment for the Final Approver (optional)', required: false, ok: 'Recommend Approval', done: 'Recommendation sent to the Final Approver.', run: (v) => API.hrAction(reqId, 'recommend_approval', v) },
    hr_reject: { title: 'Recommend rejection', msg: 'Recommend that this leave be rejected? It will go to the Final Approver, who makes the final decision.', label: 'Why are you recommending rejection? (required)', required: true, ok: 'Recommend Rejection', danger: true, done: 'Rejection recommendation sent to the Final Approver.', run: (v) => API.hrAction(reqId, 'recommend_rejection', v) },
    hr_info: { title: 'Request more information', msg: 'The employee will be notified and asked to update the request.', label: 'What information do you need? (required)', required: true, ok: 'Send Request', done: 'Request for information sent to the employee.', run: (v) => API.hrAction(reqId, 'request_info', v) },
    final_approve: { title: 'Approve leave', msg: 'Are you sure you want to approve this leave request?' + (r.payment_type === 'Paid' && type.requires_credit
      ? (avail < Number(r.requested_days)
        ? ' Heads up: ' + emp + ' only has ' + daysText(avail) + ' of ' + type.name + ' credits, so this cannot be approved as paid leave. Change it to Unpaid first, or add credits.'
        : ' ' + daysText(r.requested_days) + ' will be deducted from ' + emp + '\'s ' + type.name + ' credits (' + num(avail) + ' now, ' + num(avail - Number(r.requested_days)) + ' after).')
      : r.payment_type === 'Unpaid' ? ' This is unpaid leave, so no credits will be deducted.' : '') +
      (overlapInfo(ctx, r) ? ' Note: ' + overlapText(overlapInfo(ctx, r)) : ''), label: 'Comment (optional)', required: false, ok: 'Approve Leave', done: 'Leave approved.', run: (v) => API.finalAction(reqId, 'approve', v, null) },
    final_reject: { title: 'Reject leave', msg: 'Are you sure you want to reject this leave request?', label: 'Rejection reason (required — the employee will see it)', required: true, ok: 'Reject Leave', danger: true, done: 'Leave rejected.', run: (v) => API.finalAction(reqId, 'reject', null, v) },
    final_return: { title: 'Return to HR', msg: 'Send this request back to HR for another review?', label: 'Note for HR (optional)', required: false, ok: 'Return to HR', done: 'Returned to HR.', run: (v) => API.finalAction(reqId, 'return_to_hr', v, null) },
    final_info: { title: 'Request more information', msg: 'The employee will be notified and asked to update the request.', label: 'What information do you need? (required)', required: true, ok: 'Send Request', done: 'Request for information sent to the employee.', run: (v) => API.finalAction(reqId, 'request_info', v, null) },
    cancel: { title: r.status === 'Approved' ? 'Request cancellation' : 'Cancel this request',
      msg: r.status === 'Approved'
        ? 'This leave is already approved. A cancellation request goes to HR and the Final Approver for a decision, and the credits are only restored once it is approved.'
        : 'Cancel this leave request? Nothing has been deducted from ' + (r.employee_id === ctx.me.employee_id ? 'your' : emp + '\'s') + ' credits.',
      label: 'Reason for cancellation (required)', required: true, ok: r.status === 'Approved' ? 'Send Cancellation Request' : 'Cancel Request', danger: true, done: r.status === 'Approved' ? 'Cancellation request sent.' : 'Leave request cancelled.', run: (v) => API.cancelRequest(reqId, v) },
    cancel_approve: { title: 'Approve cancellation', msg: 'Approve the cancellation?' + (Number(r.deducted_credits) > 0 ? ' ' + daysText(r.deducted_credits) + ' will be restored to ' + emp + '\'s ' + type.name + ' balance.' : ''), label: 'Comment (optional)', required: false, ok: 'Approve Cancellation', done: 'Cancellation approved.', run: (v) => API.decideCancellation(reqId, 'approve', v) },
    cancel_reject: { title: 'Decline cancellation', msg: 'Decline the cancellation? The leave stays approved.', label: 'Comment (optional)', required: false, ok: 'Decline Cancellation', done: 'Cancellation declined — the leave stays approved.', run: (v) => API.decideCancellation(reqId, 'reject', v) },
    pay_switch: { title: 'Change payment type', msg: 'Change this request to ' + (r.payment_type === 'Paid' ? 'Unpaid' : 'Paid') + ' leave?' + (r.payment_type === 'Paid' ? ' No credits will be deducted.' : ' Credits are re-checked, and deducted on approval.'), label: 'Reason (optional)', required: false, ok: 'Change to ' + (r.payment_type === 'Paid' ? 'Unpaid' : 'Paid'), done: 'Payment type changed.', run: (v) => API.changePaymentType(reqId, r.payment_type === 'Paid' ? 'Unpaid' : 'Paid', v) },
    delete_draft: { title: 'Delete draft', msg: 'Delete this draft? This cannot be undone.', required: false, ok: 'Delete Draft', danger: true, noInput: true, done: 'Draft deleted.', run: () => API.deleteDraft(reqId), closeAfter: true },
  };
  if (key === 'close') { closeDetail(); return; }
  if (key === 'edit') { const req = r; closeDetail(); ctx.openForm({ request: req }); return; }
  const d = defs[key];
  if (!d) return;
  const slot = $('lv-action-slot');
  slot.innerHTML = '<div class="lv-action-panel' + (d.danger ? ' lv-danger' : '') + '"><h4>' + esc(d.title) + '</h4><p>' + esc(d.msg) + '</p>' +
    (d.noInput ? '' : '<div class="field"><label>' + esc(d.label) + '</label><textarea id="lv-action-text" rows="3"></textarea></div>') +
    '<div id="lv-action-err"></div><div class="lv-action-buttons"><button type="button" class="btn' + (d.danger ? ' lv-btn-danger' : '') + '" id="lv-action-ok">' + esc(d.ok) +
    '</button><button type="button" class="btn secondary" id="lv-action-cancel">Back</button></div></div>';
  $('lv-detail-body').scrollTop = 0;
  const txt = $('lv-action-text');
  if (txt) txt.focus();
  $('lv-action-cancel').addEventListener('click', () => { slot.innerHTML = ''; });
  $('lv-action-ok').addEventListener('click', async () => {
    const value = txt ? txt.value.trim() : '';
    const errBox = $('lv-action-err');
    if (d.required && !value) { errBox.innerHTML = '<div class="msg error">' + esc(d.label.replace(/ \(.*\)$/, '')) + ' — please fill this in.</div>'; txt.focus(); return; }
    const ok = $('lv-action-ok');
    ok.disabled = true;
    try {
      const res = await d.run(value);
      if (res && res.ok === false) { errBox.innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; ok.disabled = false; return; }
      ctx.toast(d.done || (d.title + ' — done.'), false);
      if (d.closeAfter) { closeDetail(); await ctx.refresh(); return; }
      await reload();
    } catch (err) {
      errBox.innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>';
      ok.disabled = false;
    }
  });
}
