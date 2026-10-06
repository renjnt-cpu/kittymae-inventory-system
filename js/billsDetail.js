// Bills Management -- the bill "report card": every field, the payment history, files, reminder history
// and a timeline, with the actions a person is allowed to take. Opens as a drawer from anywhere.
import { esc, money, fmtDate, fmtDateTime, fmtBytes, kv, openDrawer, closeDrawer, drawerBody, drawerFooter, isDrawerOpen, actionPanel, friendly, errorsText, daysText, billBadges, statusBadge, payBadge, prioBadge, progressBar, setDrawerTitle, say } from './billsUi.js?v=20261007g';
import { frequencyText } from './billsLogic.js?v=20261007g';
import { billReportPdf } from './billsExport.js?v=20261007g';

const $ = (id) => document.getElementById(id);
let currentId = null;
let timelineCache = null; // { id, log }

export const detailOpenId = () => (currentId !== null && isDrawerOpen('detail') ? currentId : null);
export function closeDetail() { currentId = null; closeDrawer('detail'); }

const REMINDER_TEXT = { due_today: 'Due-today reminder', due_tomorrow: '1-day reminder', overdue: 'Overdue reminder', overdue_summary: 'Overdue summary', recurring_generated: 'Created from the recurring template' };
const reminderText = (t) => REMINDER_TEXT[t] || (/^due_in_(\d+)$/.test(t) ? t.match(/(\d+)/)[1] + '-day reminder' : t);
const short = (s) => { const t = String(s ?? ''); return t.length > 70 ? t.slice(0, 67) + '…' : t; };

function logLine(l) {
  const field = l.field_name && l.field_name !== 'payment' && l.field_name !== 'archived_at' ? l.field_name.replace(/_/g, ' ') : '';
  const change = field && (l.before_value !== null || l.after_value !== null) ? ' — ' + esc(field) + ': ' + (l.before_value !== null && l.before_value !== undefined ? esc(short(l.before_value)) + ' → ' : '') + esc(short(l.after_value ?? '(cleared)'))
    : (l.field_name === 'payment' ? ' — ' + esc(short(l.after_value ?? l.before_value ?? '')) : '');
  return '<b>' + esc(say(l.action)) + '</b>' + change + (l.details && l.details.reason ? ' <span class="muted">(' + esc(short(l.details.reason)) + ')</span>' : '');
}

function summaryHtml(ctx, b) {
  return '<div class="bl-sum">' +
    '<div class="bl-sum-cell"><span class="muted">Amount</span><b>' + money(b._amount) + '</b></div>' +
    '<div class="bl-sum-cell"><span class="muted">Paid</span><b class="lv-pos">' + money(b._paid) + '</b></div>' +
    '<div class="bl-sum-cell"><span class="muted">Remaining</span><b class="' + (b._remaining > 0 && b._eff === 'Overdue' ? 'lv-neg' : '') + '">' + money(b._remaining) + '</b></div>' +
    '<div class="bl-sum-cell"><span class="muted">Due</span><b>' + esc(b.due_date ? fmtDate(b.due_date) : '—') + '</b><span class="muted">' + esc(daysText(b)) + '</span></div></div>' +
    progressBar(b._paidPct, b._eff === 'Overdue' ? 'overdue' : 'paid');
}

function detailsHtml(ctx, b) {
  const tpl = b.recurring_template_id ? ctx.data.templates.find((t) => t.id === b.recurring_template_id) : null;
  const rem = (b.reminder_days || []).slice().sort((x, y) => y - x);
  return '<div class="drawer-section"><h4>Details</h4>' +
    kv('Expense ID', '#' + b.id) + kv('Category', esc(b._cat)) + kv('Branch', esc(b._branch)) + kv('Provider / supplier', esc(b.provider_name || '—')) +
    kv('Account name', esc(b.account_name || '—')) + kv('Account number', esc(b.account_number || '—')) +
    kv('Payment type', esc(b.payment_type === 'Auto-Debit' ? 'Auto-debited' : 'Paid by hand')) +
    kv('Priority', prioBadge(b._prio) + ' <span class="muted">' + (b.priority_source === 'manual' ? 'set by hand' : 'automatic') + '</span>') +
    kv('Repeats', b.is_recurring ? esc(tpl ? frequencyText(tpl) : (b.recurring_frequency || 'Yes')) + (tpl && tpl.archived_at ? ' <span class="muted">(template archived)</span>' : tpl && !tpl.active ? ' <span class="muted">(paused)</span>' : '') : 'No') +
    kv('Reminders', rem.length ? esc(rem.join(', ')) + ' days before' + (b.snoozed_until && b.snoozed_until >= ctx.today ? ' <span class="muted">· snoozed until ' + esc(fmtDate(b.snoozed_until)) + '</span>' : '') : 'None') +
    kv('Added by', esc(b.created_by_name || '—') + ' <span class="muted">' + esc(b.created_at ? fmtDateTime(b.created_at) : '') + '</span>') +
    kv('Last updated', esc(b.updated_by_name || '—') + ' <span class="muted">' + esc(b.updated_at ? fmtDateTime(b.updated_at) : '') + '</span>') + '</div>' +
    (b.notes ? '<div class="drawer-section"><h4>Notes</h4><div class="lv-text">' + esc(b.notes) + '</div></div>' : '');
}

function paymentsHtml(ctx, b) {
  if (!b._pays.length) return '<div class="drawer-section"><h4>Payment history</h4><p class="muted">No payments recorded yet.</p></div>';
  return '<div class="drawer-section"><h4>Payment history</h4><div class="table-scroll table-2col"><table class="lv-mini bl-paytable"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Paid by</th><th></th></tr></thead><tbody>' +
    b._pays.map((p) => {
      const files = b._files.filter((f) => f.payment_id === p.id);
      return '<tr' + (p.voided_at ? ' class="bl-voided"' : '') + '><td data-label="Date">' + esc(p.payment_date ? fmtDate(p.payment_date) : 'Earlier record') + '</td><td data-label="Amount">' + money(p.amount) + '</td>' +
        '<td data-label="Method">' + esc(p.method || '—') + '</td><td data-label="Reference">' + esc(p.reference_number || '—') + '</td><td data-label="Paid by">' + esc(p.paid_by_name || '—') + '</td>' +
        '<td data-label="" class="full-row">' + (p.voided_at ? '<span class="badge bl-st bl-st-gray">Voided</span> <span class="muted">' + esc(p.void_reason || '') + '</span>' :
          (files.length ? '<span class="muted">📎 ' + files.length + '</span> ' : '') + (ctx.canAdmin ? '<button type="button" class="btn small secondary" data-act="void" data-id="' + p.id + '">Void</button>' : '')) +
        (p.notes ? '<div class="muted">' + esc(p.notes) + '</div>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

function filesHtml(ctx, b) {
  const own = ctx.access.branch_only && b.branch_id === ctx.access.branch_id;
  return '<div class="drawer-section"><h4>Files and proof</h4>' +
    (b._files.length ? b._files.map((f) => '<div class="lv-doc" data-file="' + f.id + '"><div><b>' + esc(f.file_name) + '</b><div class="muted">' + esc(f.kind) + ' · ' + esc(fmtBytes(f.file_size || 0)) + ' · ' + esc(f.uploaded_by_name || '') + ' · ' + esc(fmtDate(String(f.created_at).slice(0, 10))) + '</div></div>' +
      '<div class="lv-doc-actions"><button type="button" class="btn small secondary" data-act="viewfile" data-id="' + f.id + '">View</button>' +
      (ctx.canWrite ? '<button type="button" class="btn small secondary" data-act="rmfile" data-id="' + f.id + '">Remove</button>' : '') + '</div></div>').join('')
      : (b.attachment_path ? '<p class="muted">An older photo is attached to this expense.</p>' : '<p class="muted">No proof attached yet.</p>')) +
    (ctx.canWrite || own ? '<div class="lv-upload"><button type="button" class="btn small" data-act="upload">+ Upload proof</button></div>' : '') + '</div>';
}

function actionsHtml(ctx, b) {
  const more = [];
  if (ctx.canWrite) {
    more.push('<button type="button" class="btn small secondary" data-act="note">Add Note</button>');
    if (b._open) more.push('<button type="button" class="btn small secondary" data-act="snooze">Snooze Reminder</button>');
    more.push('<button type="button" class="btn small secondary" data-act="dup">Duplicate Next Month</button>');
    if (b.is_recurring || b.due_date) more.push('<button type="button" class="btn small secondary" data-act="gen">' + (b.is_recurring ? 'Generate Next Expense' : 'Make It Recurring & Generate Next') + '</button>');
  }
  more.push('<button type="button" class="btn small secondary" data-act="print">Print</button>', '<button type="button" class="btn small secondary" data-act="pdf">Download PDF</button>');
  if (ctx.canAdmin && (b._livePays.length || b._eff === 'Paid' || b._eff === 'Auto-Debited')) more.push('<button type="button" class="btn small secondary" data-act="unpaid">Mark Unpaid</button>');
  if (ctx.canWrite && b._eff === 'Cancelled') more.push('<button type="button" class="btn small secondary" data-act="restore">Restore Expense</button>');
  else if (ctx.canWrite && !b.archived_at && !b._livePays.length && b._eff !== 'Paid') more.push('<button type="button" class="btn small secondary" data-act="cancel">Cancel Expense</button>');
  if (ctx.canWrite) more.push('<button type="button" class="btn small secondary" data-act="archive">' + (b.archived_at ? 'Unarchive' : 'Archive') + '</button>');
  if (ctx.canDelete) more.push('<button type="button" class="btn small secondary bl-danger-btn" data-act="delete">Delete…</button>');
  return '<details class="exp bl-more"><summary><span class="exp-arrow" aria-hidden="true">▸</span>More actions</summary><div class="exp-body"><div class="lv-row-actions">' + more.join('') + '</div></div></details>';
}

function footerHtml(ctx, b) {
  const own = ctx.access.branch_only && b.branch_id === ctx.access.branch_id;
  let h = '';
  if (ctx.canWrite && b._open && b._remaining > 0) h += '<button type="button" class="btn" data-act="pay">' + (b._livePays.length ? 'Record Payment' : 'Mark as Paid') + '</button>';
  if (ctx.canWrite) h += '<button type="button" class="btn secondary" data-act="edit">Edit</button>';
  if (ctx.canWrite || own) h += '<button type="button" class="btn secondary" data-act="upload">Upload Proof</button>';
  return h + '<button type="button" class="btn secondary" data-act="close">Close</button>';
}

function bodyHtml(ctx, b) {
  return '<div id="bl-detail-msg"></div>' +
    '<div class="bl-d-head"><div class="bl-d-badges">' + billBadges(b) + (b.archived_at ? '' : '') + '</div></div>' +
    summaryHtml(ctx, b) + actionsHtml(ctx, b) + detailsHtml(ctx, b) + paymentsHtml(ctx, b) + filesHtml(ctx, b) +
    '<div class="drawer-section"><h4>Reminders sent</h4><div id="bl-d-reminders" class="muted">Loading…</div></div>' +
    '<div class="drawer-section"><h4>Timeline</h4><div id="bl-d-timeline" class="muted">Loading…</div></div>';
}

function timelineHtml(log, reminders) {
  const items = [
    ...log.map((l) => ({ at: l.created_at, who: l.user_name || 'System', html: logLine(l) })),
    ...reminders.map((r) => ({ at: r.sent_at, who: 'System', html: '<b>Reminder sent</b> — ' + esc(reminderText(r.reminder_type)) + ' <span class="muted">(' + r.recipients + ' ' + (r.recipients === 1 ? 'person' : 'people') + ')</span>' })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!items.length) return '<p class="muted">Nothing recorded yet.</p>';
  return '<div class="lv-timeline">' + items.map((i) => '<div class="lv-tl-item"><div class="lv-tl-when">' + esc(fmtDateTime(i.at)) + '<br>' + esc(i.who) + '</div><div>' + i.html + '</div></div>').join('') + '</div>';
}

async function openFile(ctx, fileId) {
  const b = ctx.byId.get(currentId);
  const f = b && b._files.find((x) => x.id === Number(fileId));
  if (!f) return;
  const w = window.open('', '_blank');
  try {
    const url = await ctx.api.getFileUrl(f.file_path);
    if (w) { w.location.href = url; return; }
    const row = document.querySelector('[data-file="' + f.id + '"] .lv-doc-actions');
    if (row) row.insertAdjacentHTML('afterbegin', '<a class="lv-linkbtn" href="' + esc(url) + '" target="_blank" rel="noopener">Open file</a>');
  } catch (err) { if (w) w.close(); ctx.toast(err, true); }
}

function printCard(ctx, b, log, reminders) {
  // the printable copy sits directly under <body> so the print stylesheet can hide the whole app around it
  let area = $('bl-print-root');
  if (!area) { area = document.createElement('div'); area.id = 'bl-print-root'; area.className = 'bl-print-area'; document.body.appendChild(area); }
  area.innerHTML = '<h2>' + esc(b.name) + '</h2><p>Expense #' + b.id + ' · ' + esc(b._cat) + ' · ' + esc(b._branch) + ' · ' + esc(b._eff) + ' · Priority ' + esc(b._prio) + '</p>' +
    summaryHtml(ctx, b) + detailsHtml(ctx, b) + paymentsHtml({ ...ctx, canAdmin: false }, b) + '<div class="drawer-section"><h4>Timeline</h4>' + timelineHtml(log, reminders) + '</div>' +
    '<p class="muted">Kittymae Jewels — Expense Management · printed ' + esc(ctx.today) + '</p>';
  document.body.classList.add('bl-printing');
  const done = () => { document.body.classList.remove('bl-printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1500); }, 50);
}

export async function openDetail(ctx, id, opts = {}) {
  const b = ctx.byId.get(Number(id));
  if (!b) { ctx.toast('That expense is no longer available.', true); return; }
  const keepScroll = opts.keep && isDrawerOpen('detail') && currentId === b.id ? drawerBody('detail').scrollTop : 0;
  currentId = b.id;
  openDrawer('detail', { title: b.name, sub: '#' + b.id + ' · ' + b._cat + ' · ' + b._branch, body: bodyHtml(ctx, b), footer: footerHtml(ctx, b) });
  if (keepScroll) drawerBody('detail').scrollTop = keepScroll;

  const reload = async () => { await ctx.refresh(); if (ctx.byId.has(b.id)) openDetail(ctx, b.id, { keep: true }); else closeDetail(); };
  const done = (msg) => async () => { ctx.toast(msg); await reload(); };
  const after = (res, msg) => { if (res && res.ok === false) throw new Error(errorsText(res)); return done(msg)(); };

  // timeline + reminder history load after the card is on screen
  let log = [], reminders = [];
  Promise.all([ctx.api.listActivity(b.id).catch(() => []), ctx.api.listReminders(b.id).catch(() => [])]).then(([l, r]) => {
    log = l; reminders = r; timelineCache = { id: b.id, log: l };
    if (currentId !== b.id) return;
    const rem = $('bl-d-reminders'), tl = $('bl-d-timeline');
    const sent = r.filter((x) => x.reminder_type !== 'recurring_generated').slice(0, 12);
    if (rem) rem.innerHTML = sent.length ? '<div class="lv-timeline">' + sent.map((x) => '<div class="lv-tl-item"><div class="lv-tl-when">' + esc(fmtDateTime(x.sent_at)) + '</div><div>' + esc(reminderText(x.reminder_type)) + ' <span class="muted">· ' + x.recipients + ' ' + (x.recipients === 1 ? 'person' : 'people') + '</span></div></div>').join('') + '</div>' : '<p class="muted">No reminders sent yet.</p>';
    if (tl) tl.innerHTML = timelineHtml(l, r);
  });

  const handlers = {
    close: () => closeDetail(),
    pay: () => ctx.openPayment(b.id),
    edit: () => ctx.openForm({ id: b.id }),
    upload: () => ctx.openUpload(b.id),
    snooze: () => ctx.openSnooze(b.id),
    print: () => printCard(ctx, b, log, reminders),
    pdf: async () => { try { await billReportPdf(ctx, b, log.length ? log : await ctx.api.listActivity(b.id).catch(() => [])); } catch (err) { ctx.toast(err, true); } },
    viewfile: (el) => openFile(ctx, el.dataset.id),
    note: () => actionPanel('detail', { title: 'Add a note', message: 'The note is added to the expense with your name and today’s date.', fields: '<textarea id="bl-act-note" rows="3" maxlength="500"></textarea>', okLabel: 'Add Note',
      onOk: async () => { const t = $('bl-act-note').value.trim(); if (!t) throw new Error('Write the note first.'); await after(await ctx.api.addNote(b.id, t), 'Note added.'); } }),
    dup: () => actionPanel('detail', { title: 'Duplicate for next month?', message: 'Makes a copy of “' + esc(b.name) + '” due one month after ' + esc(b.due_date ? fmtDate(b.due_date) : 'its due date') + ' — no payments or notes are copied.', okLabel: 'Duplicate',
      onOk: async () => { const res = await ctx.api.duplicateBill(b.id); if (res && res.ok === false) throw new Error(errorsText(res)); ctx.toast('Duplicated.'); await ctx.refresh(); ctx.openDetail(res.id); } }),
    gen: () => actionPanel('detail', { title: b.is_recurring ? 'Generate the next expense?' : 'Make this recurring?', message: b.is_recurring ? 'Creates the next expense in this series (copying the amount, branch and account). If it already exists you will be told.' : 'This expense will repeat monthly from now on (you can change the schedule in the Recurring tab), and the next one is created now.', okLabel: 'Generate',
      onOk: async () => { const res = await ctx.api.generateNext(b.id); if (res && res.ok === false) throw new Error(errorsText(res)); ctx.toast('Created the expense due ' + fmtDate(res.due_date) + '.'); await ctx.refresh(); ctx.openDetail(res.id); } }),
    archive: () => b.archived_at
      ? actionPanel('detail', { title: 'Unarchive this expense?', message: 'It will show in the dashboard and lists again.', okLabel: 'Unarchive', onOk: async () => after(await ctx.api.archiveBill(b.id, false), 'Expense unarchived.') })
      : actionPanel('detail', { title: 'Archive this expense?', message: 'Archived expenses are hidden from the dashboard, alerts, calendar and normal lists, but kept for records. You can unarchive it anytime.', okLabel: 'Archive', onOk: async () => after(await ctx.api.archiveBill(b.id, true), 'Expense archived.') }),
    cancel: () => actionPanel('detail', { title: 'Cancel this expense?', message: 'Use this when the expense will not be paid (cancelled service, wrong expense). It stops counting in totals and reminders.', fields: '<textarea id="bl-act-reason" rows="2" maxlength="500" placeholder="Why is it cancelled? (required)"></textarea>', okLabel: 'Cancel Expense', danger: true,
      onOk: async () => { const t = $('bl-act-reason').value.trim(); if (!t) throw new Error('Tell us why this expense is being cancelled.'); await after(await ctx.api.setCancelled(b.id, true, t), 'Expense cancelled.'); } }),
    restore: () => actionPanel('detail', { title: 'Restore this expense?', message: 'It will count as unpaid again.', okLabel: 'Restore', onOk: async () => after(await ctx.api.setCancelled(b.id, false, null), 'Expense restored.') }),
    unpaid: () => actionPanel('detail', { title: 'Mark this expense as unpaid?', message: 'All recorded payments on this expense are voided (kept in the history, no longer counted).', fields: '<textarea id="bl-act-reason" rows="2" maxlength="500" placeholder="Why? (required)"></textarea>', okLabel: 'Mark Unpaid', danger: true,
      onOk: async () => { const t = $('bl-act-reason').value.trim(); if (!t) throw new Error('A reason is required.'); await after(await ctx.api.markUnpaid(b.id, t), 'Expense marked unpaid.'); } }),
    void: (el) => actionPanel('detail', { title: 'Void this payment?', message: 'The payment stays in the history but no longer counts toward the expense.', fields: '<textarea id="bl-act-reason" rows="2" maxlength="500" placeholder="Why? (required)"></textarea>', okLabel: 'Void Payment', danger: true,
      onOk: async () => { const t = $('bl-act-reason').value.trim(); if (!t) throw new Error('A reason is required to void a payment.'); await after(await ctx.api.voidPayment(Number(el.dataset.id), t), 'Payment voided.'); } }),
    rmfile: (el) => actionPanel('detail', { title: 'Remove this file?', message: 'It is removed from the expense. The change is recorded in the history.', okLabel: 'Remove', danger: true, onOk: async () => after(await ctx.api.deleteAttachment(Number(el.dataset.id)), 'File removed.') }),
    delete: () => actionPanel('detail', { title: 'Delete this expense for good?', danger: true, okLabel: 'Delete Expense',
      message: 'This permanently deletes “' + esc(b.name) + '”' + (b._pays.length ? ' and its ' + b._pays.length + ' payment record' + (b._pays.length === 1 ? '' : 's') : '') + '. The deletion is kept in the history. <b>Archiving</b> is usually the better choice — it hides the expense but keeps everything.',
      fields: '<label class="lv-confirm"><input type="checkbox" id="bl-act-sure"> I understand this cannot be undone.</label>',
      onOk: async () => { if (!$('bl-act-sure').checked) throw new Error('Tick the box to confirm.'); const res = await ctx.api.deleteBill(b.id); if (res && res.ok === false) throw new Error(errorsText(res)); closeDetail(); ctx.toast('Expense deleted.'); await ctx.refresh(); } }),
  };
  const root = $('bl-detail-drawer');
  root.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    const h = handlers[el.dataset.act];
    if (h) Promise.resolve(h(el)).catch((err) => ctx.toast(err, true));
  }));
}
