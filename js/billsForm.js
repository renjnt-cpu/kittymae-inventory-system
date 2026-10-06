// Bills Management -- the add / edit bill drawer, plus the small drawers for recording a payment,
// attaching a proof file and snoozing a reminder. Forms open in drawers (never a permanent column);
// nothing here uses confirm() or prompt() -- confirmations are inline panels.
import { esc, money, openDrawer, closeDrawer, drawerBody, drawerFooter, actionPanel, friendly, errorsText, fmtDate, fmtBytes, setDrawerTitle } from './billsUi.js?v=20261007h';
import { PRIORITIES, METHODS, FREQUENCIES, REMINDER_CHOICES, suggestPriority, addDays, uniqueSorted, FILE_TYPES, MAX_FILE } from './billsLogic.js?v=20261007h';
import { flagInvalid } from './uiKit.js?v=20261007h';

const $ = (id) => document.getElementById(id);
const val = (id) => { const el = $(id); return el ? el.value : ''; };
const field = (label, inner, extra) => '<div class="field"' + (extra && extra.id ? ' id="' + extra.id + '"' : '') + (extra && extra.hidden ? ' hidden' : '') + '><label>' + label + '</label>' + inner + '</div>';

// ================================================================ add / edit bill
let formState = null; // { id, snapshot }

function categoryOptions(ctx, selected) {
  const groups = {};
  ctx.cats.filter((c) => c.active || c.id === selected).forEach((c) => { (groups[c.group_name] = groups[c.group_name] || []).push(c); });
  return '<option value="">Choose a category…</option>' + Object.keys(groups).map((g) =>
    '<optgroup label="' + esc(g) + '">' + groups[g].map((c) => '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.name) + (c.active ? '' : ' (inactive)') + '</option>').join('') + '</optgroup>').join('');
}
const branchOptions = (ctx, selected) => '<option value="">Not assigned / company-wide</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (b.id === selected ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');

function formHtml(ctx, b) {
  const editing = !!b;
  const templated = !!(b && b.recurring_template_id);
  const rem = b ? (b.reminder_days || []) : [7, 3, 1];
  const remChoices = [...new Set([...REMINDER_CHOICES, ...rem])].sort((x, y) => y - x);
  const branchLocked = ctx.access.branch_only;
  const names = uniqueSorted(ctx.data.bills.map((x) => x.name)).slice(0, 400);
  const prioNow = b && b.priority_source === 'manual' ? b.priority : 'auto';
  return '<div id="bl-form-msg"></div><div id="bf-errors"></div>' +
    '<datalist id="bf-names">' + names.map((n) => '<option value="' + esc(n) + '"></option>').join('') + '</datalist>' +
    '<div class="drawer-section"><h4>The expense</h4><div class="bl-formgrid">' +
      field('Expense name *', '<input type="text" id="bf-name" list="bf-names" maxlength="120" autocomplete="off" value="' + esc(b ? b.name : '') + '" placeholder="e.g. Meralco — Pacific Mall">') +
      field('Category *', '<select id="bf-category">' + categoryOptions(ctx, b ? b.category_id : null) + '</select>') +
      field('Branch', '<select id="bf-branch"' + (branchLocked ? ' disabled' : '') + '>' + branchOptions(ctx, branchLocked ? ctx.access.branch_id : (b ? b.branch_id : null)) + '</select>' +
        (branchLocked ? '<span class="muted">Expenses you add are saved under your own branch.</span>' : '')) +
      field('Provider / supplier', '<input type="text" id="bf-provider" maxlength="120" value="' + esc(b ? b.provider_name || '' : '') + '" placeholder="Who gets paid">') +
    '</div></div>' +
    '<div class="drawer-section"><h4>Account</h4><div class="bl-formgrid">' +
      field('Account name', '<input type="text" id="bf-acname" maxlength="120" value="' + esc(b ? b.account_name || '' : '') + '">') +
      field('Account number', '<input type="text" id="bf-acnum" maxlength="80" value="' + esc(b ? b.account_number || '' : '') + '">') +
    '</div></div>' +
    '<div class="drawer-section"><h4>Amount and due date</h4><div class="bl-formgrid">' +
      field('Amount (PHP)', '<input type="number" id="bf-amount" step="0.01" min="0" inputmode="decimal" value="' + (b && b._amount !== null ? b._amount : '') + '">' +
        '<span class="muted">' + (editing && b._paid > 0 ? 'Already paid ' + money(b._paid) + ' — the amount cannot go below that.' : 'Leave blank if the invoice has not arrived yet.') + '</span>') +
      field('Due date *', '<input type="date" id="bf-due" value="' + esc(b ? b.due_date || '' : '') + '">') +
      field('How it is paid', '<select id="bf-paytype"><option value="Manual"' + (!b || b.payment_type !== 'Auto-Debit' ? ' selected' : '') + '>Paid by hand (bank transfer, cash, GCash…)</option>' +
        '<option value="Auto-Debit"' + (b && b.payment_type === 'Auto-Debit' ? ' selected' : '') + '>Auto-debited from an account</option></select>') +
    '</div></div>' +
    '<div class="drawer-section"><h4>Priority and reminders</h4><div class="bl-formgrid">' +
      field('Priority', '<select id="bf-priority"><option value="auto"' + (prioNow === 'auto' ? ' selected' : '') + '>Automatic</option>' +
        PRIORITIES.map((p) => '<option' + (prioNow === p ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><span class="muted" id="bf-prio-hint"></span>') +
      field('Remind me before the due date', '<div class="bl-checks">' + remChoices.map((d) => '<label class="bl-chk"><input type="checkbox" name="bf-rem" value="' + d + '"' + (rem.includes(d) ? ' checked' : '') + '> ' + d + (d === 1 ? ' day' : ' days') + '</label>').join('') + '</div>' +
        '<span class="muted">Reminders appear in the Expenses notification bell. Email is not turned on.</span>') +
    '</div></div>' +
    (ctx.access.branch_only ? '' : '<div class="drawer-section"><h4>Repeats</h4>' +
      (templated
        ? '<div class="msg lv-warn">This expense is part of a recurring series (' + esc(b.recurring_frequency || 'Monthly') + '). To change the schedule, edit or pause its template in the <b>Recurring</b> tab.</div>'
        : '<label class="lv-check"><input type="checkbox" id="bf-recurring"' + (b && b.is_recurring ? ' checked' : '') + '> This expense repeats</label>' +
          '<div id="bf-rec-fields" class="bl-formgrid" hidden>' +
            field('How often', '<select id="bf-freq">' + FREQUENCIES.map((f) => '<option>' + f + '</option>').join('') + '</select>') +
            field('Every', '<div class="bl-inline"><input type="number" id="bf-int" min="1" max="366" value="1" style="width:80px"><select id="bf-unit"><option value="day">days</option><option value="week">weeks</option><option value="month" selected>months</option><option value="year">years</option></select></div>', { id: 'bf-custom', hidden: true }) +
            '<label class="lv-check bl-span2"><input type="checkbox" id="bf-auto"> Create each next expense automatically <span class="muted">(off by default — you can still generate it by hand)</span></label>' +
            field('Create it this many days before it is due', '<input type="number" id="bf-gen" min="0" max="90" value="10" style="width:100px">', { id: 'bf-gen-wrap', hidden: true }) +
          '</div>') + '</div>') +
    '<div class="drawer-section"><h4>Notes</h4><div class="field"><textarea id="bf-notes" rows="3" maxlength="4000" placeholder="Anything the next person should know">' + esc(b ? b.notes || '' : '') + '</textarea></div></div>' +
    (editing ? '' : '<div class="drawer-section"><h4>Proof or invoice (optional)</h4><div class="field"><input type="file" id="bf-file" accept="image/*,application/pdf"><span class="muted">A photo or PDF, up to 15 MB. You can add more later from the expense.</span></div></div>');
}

function readForm(ctx, b) {
  const rem = [...document.querySelectorAll('input[name="bf-rem"]:checked')].map((x) => Number(x.value));
  const p = {
    name: val('bf-name').trim(), category_id: val('bf-category') || null, provider_name: val('bf-provider').trim(),
    account_name: val('bf-acname').trim(), account_number: val('bf-acnum').trim(), amount: val('bf-amount') === '' ? null : Number(val('bf-amount')),
    due_date: val('bf-due') || null, payment_type: val('bf-paytype'), priority: val('bf-priority'), reminder_days: rem, notes: val('bf-notes').trim(),
  };
  if (!ctx.access.branch_only) p.branch_id = val('bf-branch') || null;
  if (!ctx.access.branch_only && $('bf-recurring')) {
    p.is_recurring = $('bf-recurring').checked;
    if (p.is_recurring) {
      p.frequency = val('bf-freq'); p.auto_generate = $('bf-auto').checked; p.generate_days_before = Number(val('bf-gen') || 10);
      if (p.frequency === 'Custom') { p.interval_count = Number(val('bf-int') || 1); p.interval_unit = val('bf-unit'); }
    }
  }
  return p;
}
const snapshot = () => JSON.stringify([...document.querySelectorAll('#bl-form-body input, #bl-form-body select, #bl-form-body textarea')].map((el) => el.type === 'checkbox' ? el.checked : el.type === 'file' ? (el.files[0] && el.files[0].name) : el.value));

function clientValidate(p, editing) {
  const bad = [];
  if (!p.name) bad.push(['bf-name', 'Give the expense a name.']);
  if (!p.category_id) bad.push(['bf-category', 'Choose a category.']);
  if (!p.due_date && (!editing || p.is_recurring)) bad.push(['bf-due', editing ? 'A recurring expense needs a due date.' : 'Enter the due date so the expense shows in alerts and the calendar.']);
  if (p.amount !== null && (!Number.isFinite(p.amount) || p.amount < 0 || Math.abs(p.amount * 100 - Math.round(p.amount * 100)) > 1e-6)) bad.push(['bf-amount', 'Enter a valid amount (up to two decimal places).']);
  return bad;
}

export function openBillForm(ctx, opts = {}) {
  const b = opts.id ? ctx.byId.get(Number(opts.id)) : null;
  if (opts.id && !b) { ctx.toast('That expense is no longer available.', true); return; }
  if (b ? !ctx.canWrite : !ctx.canAdd) { ctx.toast('Your account cannot ' + (b ? 'edit' : 'add') + ' expenses.', true); return; }
  openDrawer('form', {
    title: b ? 'Edit Expense' : 'Add Expense', sub: b ? '#' + b.id + ' · ' + b._cat : 'Fill in what you know — you can edit it later.',
    body: formHtml(ctx, b),
    footer: '<button type="button" class="btn" id="bf-save">' + (b ? 'Save Changes' : 'Save Expense') + '</button>' +
      (b ? '' : '<button type="button" class="btn secondary" id="bf-save-more">Save & Add Another</button>') + '<button type="button" class="btn secondary" id="bf-cancel">Cancel</button>',
  });
  formState = { id: b ? b.id : null };

  const cat = () => ctx.catById[val('bf-category')];
  const hint = () => { const h = $('bf-prio-hint'); if (!h) return; h.textContent = val('bf-priority') === 'auto' ? (cat() ? 'Suggested: ' + suggestPriority(cat(), val('bf-amount')) + ' (from the category' + (Number(val('bf-amount')) >= 50000 ? ' and amount' : '') + ')' : 'Choose a category to see the suggestion.') : ''; };
  const syncRecurring = () => {
    if (!$('bf-recurring')) return;
    const on = $('bf-recurring').checked;
    $('bf-rec-fields').hidden = !on;
    $('bf-custom').hidden = !on || val('bf-freq') !== 'Custom';
    $('bf-gen-wrap').hidden = !on || !$('bf-auto').checked;
  };
  ['bf-category', 'bf-priority', 'bf-amount'].forEach((id) => $(id).addEventListener('input', hint));
  ['bf-recurring', 'bf-freq', 'bf-auto'].forEach((id) => { if ($(id)) $(id).addEventListener('change', syncRecurring); });
  hint(); syncRecurring();
  formState.snapshot = snapshot();

  const submit = async (again) => {
    const btns = [$('bf-save'), $('bf-save-more')].filter(Boolean);
    const p = readForm(ctx, b);
    const bad = clientValidate(p, !!b);
    $('bf-errors').innerHTML = '';
    if (bad.length) {
      $('bf-errors').innerHTML = '<div class="msg error">' + bad.map((x) => esc(x[1])).join('<br>') + '</div>';
      flagInvalid($(bad[0][0]));
      return;
    }
    btns.forEach((x) => { x.disabled = true; });
    try {
      const res = await ctx.api.saveBill(b ? b.id : null, p);
      if (!res || res.ok === false) { $('bf-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; drawerBody('form').scrollTop = 0; return; }
      let fileNote = '';
      const file = $('bf-file') && $('bf-file').files[0];
      if (file) {
        try { const up = await ctx.api.uploadAttachment(res.id, file, 'Proof'); if (up && up.ok === false) fileNote = ' The file could not be attached: ' + errorsText(up); }
        catch (err) { fileNote = ' The file could not be attached: ' + friendly(err); }
      }
      formState = null;
      closeDrawer('form');
      ctx.toast((b ? 'Expense updated.' : 'Expense added.') + fileNote, !!fileNote);
      await ctx.refresh();
      if (b && ctx.detailOpenId() === b.id) ctx.openDetail(b.id, { keep: true });
      if (again && !b) openBillForm(ctx, {});
    } catch (err) {
      $('bf-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>';
    } finally { btns.forEach((x) => { if (x) x.disabled = false; }); }
  };
  $('bf-save').addEventListener('click', () => submit(false));
  if ($('bf-save-more')) $('bf-save-more').addEventListener('click', () => submit(true));
  $('bf-cancel').addEventListener('click', () => requestCloseForm(ctx));
  $('bf-name').focus();
}

/** Close button / backdrop / Escape: asks first when something was typed. */
export function requestCloseForm() {
  if (!formState) { closeDrawer('form'); return; }
  if (snapshot() === formState.snapshot) { formState = null; closeDrawer('form'); return; }
  actionPanel('form', { title: 'Discard your changes?', message: 'What you typed has not been saved.', okLabel: 'Discard', danger: true, onOk: () => { formState = null; closeDrawer('form'); } });
}

// ================================================================ record a payment
export function openPayment(ctx, billId) {
  const b = ctx.byId.get(Number(billId));
  if (!b) return;
  if (!ctx.canWrite) { ctx.toast('Only Finance or Admin can record payments.', true); return; }
  if (b._eff === 'Archived') { ctx.toast('This expense is archived. Unarchive it before recording a payment.', true); return; }
  if (b._eff === 'Cancelled') { ctx.toast('This expense is cancelled.', true); return; }
  if (b._amount === null || b._amount <= 0) { ctx.toast('Set the expense amount first (Edit), then record the payment.', true); return; }
  if (b._remaining <= 0) { ctx.toast('This expense is already fully paid.', true); return; }
  const people = ctx.people.length ? ctx.people : [{ employee_id: ctx.access.employee_id, full_name: ctx.access.name }];
  const defMethod = b.payment_type === 'Auto-Debit' ? 'Auto-Debit' : 'Bank Transfer';
  const live = b._livePays;
  openDrawer('side', {
    title: 'Record Payment', sub: b.name + ' · #' + b.id,
    body: '<div id="bl-side-msg"></div><div id="bp-errors"></div>' +
      '<div class="bl-paysummary"><div><span class="muted">Expense amount</span><b>' + money(b._amount) + '</b></div><div><span class="muted">Already paid</span><b>' + money(b._paid) + '</b></div><div><span class="muted">Remaining</span><b>' + money(b._remaining) + '</b></div></div>' +
      (live.length ? '<p class="muted">' + live.length + ' earlier payment' + (live.length === 1 ? '' : 's') + ' recorded. This adds another one.</p>' : '') +
      '<div class="bl-formgrid">' +
        field('Amount paid (PHP) *', '<input type="number" id="bp-amount" step="0.01" min="0.01" inputmode="decimal" value="' + b._remaining + '">' +
          '<div class="bl-quick"><button type="button" class="btn small secondary" data-pay-frac="1">Pay in full</button><button type="button" class="btn small secondary" data-pay-frac="0.5">Half</button></div>') +
        field('Payment date *', '<input type="date" id="bp-date" value="' + ctx.today + '" max="' + ctx.today + '">') +
        field('Method *', '<select id="bp-method">' + METHODS.map((m) => '<option' + (m === defMethod ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>') +
        field('Reference number', '<input type="text" id="bp-ref" maxlength="80" placeholder="Receipt / transaction no.">') +
        field('Paid by', '<select id="bp-by">' + people.map((p) => '<option value="' + p.employee_id + '"' + (p.employee_id === ctx.access.employee_id ? ' selected' : '') + '>' + esc(p.full_name) + '</option>').join('') + '</select>') +
        field('Proof of payment', '<input type="file" id="bp-file" accept="image/*,application/pdf"><span class="muted">Optional — a photo or PDF, up to 15 MB.</span>') +
      '</div>' +
      field('Notes', '<textarea id="bp-notes" rows="2" maxlength="500"></textarea>') +
      '<div class="lv-preview" id="bp-preview"></div>',
    footer: '<button type="button" class="btn" id="bp-save">Record Payment</button><button type="button" class="btn secondary" id="bp-cancel">Cancel</button>',
  });
  const preview = () => {
    const a = Number(val('bp-amount'));
    const left = Math.round((b._remaining - (Number.isFinite(a) ? a : 0)) * 100) / 100;
    $('bp-preview').innerHTML = !Number.isFinite(a) || a <= 0 ? 'Enter the amount paid.' : left < 0 ? '<span class="lv-neg">That is more than the remaining ' + money(b._remaining) + '.</span>'
      : left === 0 ? '<b class="lv-pos">✓ This pays the expense in full.</b>' : 'Remaining after this payment: <b>' + money(left) + '</b> — the expense will show as Partially Paid.';
  };
  $('bp-amount').addEventListener('input', preview); preview();
  drawerBody('side').querySelectorAll('[data-pay-frac]').forEach((x) => x.addEventListener('click', () => {
    $('bp-amount').value = Math.round(b._remaining * Number(x.dataset.payFrac) * 100) / 100; preview();
  }));
  $('bp-cancel').addEventListener('click', () => closeDrawer('side'));
  $('bp-save').addEventListener('click', async () => {
    const amount = Number(val('bp-amount'));
    if (!Number.isFinite(amount) || amount <= 0) { flagInvalid($('bp-amount')); $('bp-errors').innerHTML = '<div class="msg error">Enter the amount paid.</div>'; return; }
    if (!val('bp-date')) { flagInvalid($('bp-date')); return; }
    const btn = $('bp-save'); btn.disabled = true; $('bp-errors').innerHTML = '';
    try {
      const res = await ctx.api.recordPayment({ billId: b.id, amount, date: val('bp-date'), method: val('bp-method'), reference: val('bp-ref').trim(), paidBy: val('bp-by'), notes: val('bp-notes').trim() });
      if (!res || res.ok === false) { $('bp-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      let note = '';
      const file = $('bp-file').files[0];
      if (file) {
        try { const up = await ctx.api.uploadAttachment(b.id, file, 'Proof', res.payment_id); if (up && up.ok === false) note = ' The proof could not be attached: ' + errorsText(up); }
        catch (err) { note = ' The proof could not be attached: ' + friendly(err); }
      }
      closeDrawer('side');
      ctx.toast(res.payment_status === 'Paid' ? 'Payment recorded — the expense is fully paid.' + note : 'Payment recorded — ' + money(res.remaining) + ' still to pay.' + note, !!note);
      await ctx.refresh();
      if (ctx.detailOpenId() === b.id) ctx.openDetail(b.id, { keep: true });
    } catch (err) { $('bp-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
  $('bp-amount').focus();
}

// ================================================================ attach a proof / invoice file
export function openUpload(ctx, billId) {
  const b = ctx.byId.get(Number(billId));
  if (!b) return;
  const own = ctx.access.branch_only && b.branch_id && b.branch_id === ctx.access.branch_id;
  if (!ctx.canWrite && !own) { ctx.toast('You can only add files to your own branch’s expenses.', true); return; }
  const pays = b._livePays;
  openDrawer('side', {
    title: 'Upload Proof', sub: b.name + ' · #' + b.id,
    body: '<div id="bl-side-msg"></div><div id="bu-errors"></div><div class="bl-formgrid">' +
      field('What is this file?', '<select id="bu-kind"><option value="Proof">Proof of payment</option><option value="Invoice">Invoice / statement</option><option value="Other">Other</option></select>') +
      (pays.length ? field('Belongs to', '<select id="bu-pay"><option value="">The whole expense</option>' + pays.map((p) => '<option value="' + p.id + '">Payment of ' + money(p.amount) + (p.payment_date ? ' on ' + fmtDate(p.payment_date) : '') + '</option>').join('') + '</select>') : '') +
      field('File *', '<input type="file" id="bu-file" accept="image/*,application/pdf"><span class="muted">A photo or PDF, up to 15 MB.</span>') + '</div>',
    footer: '<button type="button" class="btn" id="bu-save">Upload</button><button type="button" class="btn secondary" id="bu-cancel">Cancel</button>',
  });
  $('bu-cancel').addEventListener('click', () => closeDrawer('side'));
  $('bu-save').addEventListener('click', async () => {
    const file = $('bu-file').files[0];
    if (!file) { flagInvalid($('bu-file')); $('bu-errors').innerHTML = '<div class="msg error">Choose a photo or PDF first.</div>'; return; }
    if (!FILE_TYPES.test(file.type || '')) { $('bu-errors').innerHTML = '<div class="msg error">Only photos (JPG, PNG, WEBP, HEIC) and PDF files can be attached.</div>'; return; }
    if (file.size > MAX_FILE) { $('bu-errors').innerHTML = '<div class="msg error">That file is ' + esc(fmtBytes(file.size)) + ' — the limit is 15 MB.</div>'; return; }
    const btn = $('bu-save'); btn.disabled = true; btn.textContent = 'Uploading…'; $('bu-errors').innerHTML = '';
    try {
      const res = await ctx.api.uploadAttachment(b.id, file, val('bu-kind'), $('bu-pay') && val('bu-pay') ? Number(val('bu-pay')) : null);
      if (res && res.ok === false) { $('bu-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; btn.textContent = 'Upload'; return; }
      closeDrawer('side');
      ctx.toast('File attached.');
      await ctx.refresh();
      if (ctx.detailOpenId() === b.id) ctx.openDetail(b.id, { keep: true });
    } catch (err) { $('bu-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; btn.textContent = 'Upload'; }
  });
}

// ================================================================ snooze a reminder
export function openSnooze(ctx, billId) {
  const b = ctx.byId.get(Number(billId));
  if (!b || !ctx.canWrite) return;
  const quick = [1, 3, 7];
  openDrawer('side', {
    title: 'Snooze Reminder', sub: b.name + ' · #' + b.id,
    body: '<div id="bl-side-msg"></div><div id="bz-errors"></div>' +
      '<p>Stops the reminder notifications for this expense until the date you pick. The expense still shows in alerts and reports.</p>' +
      (b.snoozed_until && b.snoozed_until >= ctx.today ? '<div class="msg lv-warn">Snoozed until <b>' + esc(fmtDate(b.snoozed_until)) + '</b>.</div>' : '') +
      '<div class="bl-quick">' + quick.map((d) => '<button type="button" class="btn small secondary" data-snooze-days="' + d + '">' + d + (d === 1 ? ' day' : ' days') + '</button>').join('') + '</div>' +
      field('Snooze until', '<input type="date" id="bz-date" min="' + ctx.today + '" value="' + addDays(ctx.today, 3) + '">'),
    footer: '<button type="button" class="btn" id="bz-save">Snooze</button>' + (b.snoozed_until && b.snoozed_until >= ctx.today ? '<button type="button" class="btn secondary" id="bz-clear">Turn reminders back on</button>' : '') + '<button type="button" class="btn secondary" id="bz-cancel">Cancel</button>',
  });
  drawerBody('side').querySelectorAll('[data-snooze-days]').forEach((x) => x.addEventListener('click', () => { $('bz-date').value = addDays(ctx.today, Number(x.dataset.snoozeDays)); }));
  const apply = async (until, msg) => {
    try {
      const res = await ctx.api.snoozeBill(b.id, until);
      if (res && res.ok === false) { $('bz-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; return; }
      closeDrawer('side'); ctx.toast(msg); await ctx.refresh();
      if (ctx.detailOpenId() === b.id) ctx.openDetail(b.id, { keep: true });
    } catch (err) { $('bz-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; }
  };
  $('bz-cancel').addEventListener('click', () => closeDrawer('side'));
  $('bz-save').addEventListener('click', () => { if (!val('bz-date')) { flagInvalid($('bz-date')); return; } apply(val('bz-date'), 'Reminders snoozed until ' + fmtDate(val('bz-date')) + '.'); });
  if ($('bz-clear')) $('bz-clear').addEventListener('click', () => apply(null, 'Reminders are back on.'));
}
