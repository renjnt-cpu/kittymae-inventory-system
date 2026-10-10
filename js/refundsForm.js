// Refund Management -- the new / edit request drawer (order details fill in from the Order ID), and the small drawers for
// recording a refund payment, attaching proof, adding a note, logging customer contact, setting priority and follow-ups.
// Forms open in drawers (never a permanent column); nothing here uses confirm() or prompt() -- confirmations are inline panels.
// The database re-checks every rule (order exists, amount within the order, duplicates, payment never above the approved amount);
// when it says "ask first", the question appears here as an inline panel and the request is sent again with the answer.
import { esc, money, fmtDate, fmtBytes, plural, openDrawer, closeDrawer, drawerBody, actionPanel, friendly, errorsText } from './refundsUi.js?v=20261011a';
import { METHODS, NEEDS_REFERENCE, PRIORITIES, COMM_METHODS, FILE_TYPES, MAX_FILE, suggestPriority, refundableLeft, round2 } from './refundsLogic.js?v=20261011a';
import { flagInvalid } from './uiKit.js?v=20261011a';

const $ = (id) => document.getElementById(id);
const val = (id) => { const el = $(id); return el ? el.value : ''; };
const field = (label, inner, extra) => '<div class="field"' + (extra && extra.id ? ' id="' + extra.id + '"' : '') + (extra && extra.hidden ? ' hidden' : '') + '><label>' + label + '</label>' + inner + '</div>';
const ACCEPT = 'image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf';
const FILE_HINT = 'JPG, JPEG, PNG or PDF, up to 10 MB.';
const fileProblem = (file) => !FILE_TYPES.test(file.type || '') ? 'Only JPG, JPEG, PNG and PDF files can be attached.' : file.size > MAX_FILE ? 'That file is ' + fmtBytes(file.size) + ' — the limit is 10 MB.' : '';
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
/** Reload everything, then bring the open request card up to date. */
async function afterChange(ctx, id) {
  await ctx.refresh();
  if (id && ctx.detailOpenId() === id && ctx.byId.has(id)) ctx.openDetail(id, { keep: true });
}

// ================================================================ new / edit request
let formState = null; // { id, snapshot, order, items, amountTouched, manual }

const branchOptions = (ctx, selected) => '<option value="">Not set</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (b.id === selected ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
const reasonOptions = (ctx, selected) => '<option value="">Choose a reason…</option>' + [...ctx.reasons.filter((x) => x.active).map((x) => x.name), ...(selected && !ctx.reasons.some((x) => x.name === selected && x.active) ? [selected] : [])]
  .map((n) => '<option' + (n === selected ? ' selected' : '') + '>' + esc(n) + '</option>').join('');

function formHtml(ctx, r) {
  const editing = !!r, locked = !!(r && r._approved);
  const mgr = ctx.access.approve;
  return '<div id="rf-form-msg"></div><div id="rf-fm-errors"></div>' +
    '<div class="drawer-section"><h4>The order</h4><div class="bl-formgrid">' +
      field('Order ID *', '<div class="bl-inline"><input type="text" id="rf-fm-order" maxlength="60" autocomplete="off" value="' + esc(r ? r.order_reference || '' : '') + '" placeholder="e.g. 42486"' + (editing ? ' readonly' : '') + '>' +
        (editing ? '' : '<button type="button" class="btn small secondary" id="rf-fm-find">Find order</button>') + '</div><div id="rf-fm-orderinfo" class="muted rf-orderinfo">' +
        (editing ? (r.order_verified ? 'Found in the system when the request was made.' : 'Entered by hand — the order was not checked.') : 'Enter the Order ID — the customer and items fill in automatically.') + '</div>') +
      field('Branch', '<select id="rf-fm-branch"' + (editing && !mgr ? ' disabled' : '') + '>' + branchOptions(ctx, r ? r.branch_id : ctx.access.branch_id) + '</select>') +
    '</div><div id="rf-fm-others"></div></div>' +
    '<div class="drawer-section"><h4>Customer</h4><div class="bl-formgrid">' +
      field('Customer name *', '<input type="text" id="rf-fm-name" maxlength="120" value="' + esc(r ? r.customer_name : '') + '">') +
      field('Contact number', '<input type="tel" id="rf-fm-contact" maxlength="40" value="' + esc(r ? r.customer_contact || '' : '') + '">') +
      field('Email', '<input type="email" id="rf-fm-email" maxlength="120" value="' + esc(r ? r.customer_email || '' : '') + '">') +
      field('Address', '<input type="text" id="rf-fm-address" maxlength="300" value="' + esc(r ? r.customer_address || '' : '') + '">') +
    '</div></div>' +
    '<div class="drawer-section"><h4>Items being refunded</h4>' + (locked ? '<div class="msg lv-warn">The items and amount are locked once a request is approved.</div>' : '') +
      '<div id="rf-fm-items"></div>' + (locked ? '' : '<p><button type="button" class="btn small secondary" id="rf-fm-additem">+ Add an item</button></p>') + '</div>' +
    '<div class="drawer-section"><h4>The refund</h4><div class="bl-formgrid">' +
      field('Amount to refund (PHP) *', '<input type="number" id="rf-fm-amount" step="0.01" min="0.01" inputmode="decimal" value="' + (r ? r._req : '') + '"' + (locked ? ' readonly' : '') + '><span class="muted" id="rf-fm-amthint"></span>') +
      field('Refund method *', '<select id="rf-fm-method">' + [...new Set([...METHODS, r && r.refund_method].filter(Boolean))].map((m) => '<option' + (m === (r ? r.refund_method : 'GCash') ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select>') +
      field('Send to — account name', '<input type="text" id="rf-fm-acname" maxlength="120" value="' + esc(r ? r.account_name || '' : '') + '">') +
      field('Send to — account / mobile number', '<input type="text" id="rf-fm-acnum" maxlength="80" value="' + esc(r ? r.account_number || '' : '') + '">') +
      field('Reason *', '<select id="rf-fm-reason">' + reasonOptions(ctx, r ? r.reason_category : '') + '</select>') +
      (editing ? '' : field('Date requested', '<input type="date" id="rf-fm-date" value="' + ctx.today + '" max="' + ctx.today + '">')) +
      (!editing || mgr ? field('Priority', '<select id="rf-fm-priority">' + PRIORITIES.map((p) => '<option' + (p === (r ? r.priority : 'Normal') ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><span class="muted" id="rf-fm-priohint"></span>') : '') +
    '</div>' +
      field('Details of the problem', '<textarea id="rf-fm-reasontext" rows="2" maxlength="500" placeholder="What happened?">' + esc(r ? r.reason || '' : '') + '</textarea>') +
      field('Notes', '<textarea id="rf-fm-notes" rows="2" maxlength="1000">' + esc(r ? r.notes || '' : '') + '</textarea>') +
      (ctx.access.view_all ? field('Internal notes (not shown to the requester)', '<textarea id="rf-fm-internal" rows="2" maxlength="1000">' + esc(r ? r.internal_notes || '' : '') + '</textarea>') : '') + '</div>' +
    (editing ? '' : '<div class="drawer-section"><h4>Attachment (optional)</h4><div class="field"><input type="file" id="rf-fm-file" accept="' + ACCEPT + '"><span class="muted">A photo or document that supports the request. ' + FILE_HINT + ' You can add more later.</span></div></div>');
}

const itemRowHtml = (it, i, locked) => {
  const tick = '<label class="bl-chk"><input type="checkbox" data-it="include"' + (it.include ? ' checked' : '') + (locked ? ' disabled' : '') + ' aria-label="Include this item">';
  const head = it.fromOrder
    ? tick + ' <b>' + esc(it.name) + '</b>' + (it.sku ? ' <span class="muted">' + esc(it.sku) + '</span>' : '') + '</label>'
    : tick + '</label><input type="text" data-it="name" maxlength="160" placeholder="Item name" value="' + esc(it.name) + '"' + (locked ? ' readonly' : '') + '>' +
      (locked ? '' : '<button type="button" class="btn small secondary" data-it-remove="' + i + '">Remove</button>');
  return '<div class="rf-item" data-i="' + i + '"><div class="rf-item-top">' + head + '</div><div class="rf-item-fields">' +
    field('Qty' + (it.maxQty ? ' <span class="muted">(of ' + it.maxQty + ')</span>' : ''), '<input type="number" data-it="qty" min="1"' + (it.maxQty ? ' max="' + it.maxQty + '"' : '') + ' step="1" value="' + it.qty + '"' + (locked ? ' readonly' : '') + '>') +
    field('Unit price', '<input type="number" data-it="unit" min="0" step="0.01" value="' + (it.unit ?? '') + '"' + (locked || it.fromOrder ? ' readonly' : '') + '>') +
    field('Refund (PHP)', '<input type="number" data-it="amt" min="0" step="0.01" value="' + (it.amt ?? '') + '"' + (locked ? ' readonly' : '') + '>') + '</div></div>';
};

export function openRefundForm(ctx, opts = {}) {
  const r = opts.id ? ctx.byId.get(Number(opts.id)) : null;
  if (opts.id && !r) { ctx.toast('That refund request is no longer available.', true); return; }
  if (r && !ctx.canEdit(r)) { ctx.toast('You can only edit your own request while it is waiting for review.', true); return; }
  const locked = !!(r && r._approved), mgr = ctx.access.approve;
  openDrawer('form', {
    title: r ? 'Edit Refund Request' : 'New Refund Request', sub: r ? r.refund_request_number + ' · ' + r.customer_name : 'Enter the Order ID — the rest fills in for you.',
    body: formHtml(ctx, r),
    footer: '<button type="button" class="btn" id="rf-fm-save">' + (r ? 'Save Changes' : 'Submit Request') + '</button><button type="button" class="btn secondary" id="rf-fm-cancel">Cancel</button>',
  });
  formState = { id: r ? r.id : null, order: null, manual: false, amountTouched: !!r,
    items: r ? r._items.map((i) => ({ include: true, fromOrder: false, sku: i.sku || '', name: i.item_name, qty: i.quantity, unit: i.unit_price, amt: i.refund_amount })) : [] };
  const S = formState;

  // ---- items ----
  const drawItems = () => {
    $('rf-fm-items').innerHTML = S.items.length ? S.items.map((it, i) => itemRowHtml(it, i, locked)).join('') : '<p class="muted">' + (r ? 'No item details were recorded.' : 'Items appear here once the order is found. You can also add them by hand.') + '</p>';
    $('rf-fm-items').querySelectorAll('.rf-item').forEach((row) => {
      const it = S.items[Number(row.dataset.i)];
      row.querySelectorAll('[data-it]').forEach((el) => el.addEventListener('input', () => {
        const k = el.dataset.it;
        if (k === 'include') { it.include = el.checked; } else if (k === 'name') { it.name = el.value; }
        else {
          const v = el.value === '' ? null : Number(el.value);
          if (k === 'qty') { it.qty = v || 1; if (it.unit !== null && it.unit !== undefined && !it.amtTouched) { it.amt = round2(it.unit * it.qty); row.querySelector('[data-it="amt"]').value = it.amt; } }
          if (k === 'unit') { it.unit = v; if (!it.amtTouched && v !== null) { it.amt = round2(v * it.qty); row.querySelector('[data-it="amt"]').value = it.amt; } }
          if (k === 'amt') { it.amt = v; it.amtTouched = true; }
        }
        syncAmount();
      }));
    });
    $('rf-fm-items').querySelectorAll('[data-it-remove]').forEach((b) => b.addEventListener('click', () => { S.items.splice(Number(b.dataset.itRemove), 1); drawItems(); syncAmount(); }));
  };
  const itemsTotal = () => round2(S.items.filter((i) => i.include).reduce((s, i) => s + (Number(i.amt) || 0), 0));
  const syncAmount = () => {
    const t = itemsTotal();
    if (!S.amountTouched && !locked && t > 0) $('rf-fm-amount').value = t;
    hints();
  };
  const hints = () => {
    const amt = Number(val('rf-fm-amount')), t = itemsTotal(), h = $('rf-fm-amthint');
    const parts = [];
    if (t > 0) parts.push('Selected items add up to ' + money(t) + '.');
    const o = S.order;
    if (o && o.found && Number(o.order_total) > 0) {
      const others = (o.other_refunds || []).filter((x) => x.status !== 'Rejected' && x.status !== 'Cancelled' && (!r || x.number !== r.refund_request_number)).reduce((s, x) => s + Number(x.amount || 0), 0);
      const left = round2(Math.max(Number(o.order_total) || 0, Number(o.order_paid) || 0) - others);
      parts.push('Order total ' + money(o.order_total) + ' · still refundable ' + money(Math.max(left, 0)) + '.');
    } else if (r) { const left = refundableLeft(r, ctx.refunds); if (left !== null) parts.push('Still refundable on this order: ' + money(Math.max(left, 0)) + '.'); }
    h.textContent = parts.join(' ');
    h.classList.toggle('lv-neg', Number.isFinite(amt) && t > 0 && t > amt + 0.004);
    if (Number.isFinite(amt) && t > amt + 0.004) h.textContent += ' That is more than the amount to refund.';
    const ph = $('rf-fm-priohint');
    if (ph && $('rf-fm-priority')) {
      const s = suggestPriority({ _appr: null, _req: Number.isFinite(amt) ? amt : 0, _open: true, _age: r ? r._age : 0, follow_up_count: r ? r.follow_up_count : 0, flagged: r ? r.flagged : false }, ctx);
      ph.textContent = 'Suggested: ' + s.level + (s.why.length ? ' (' + s.why.join(', ') + ')' : '') + '. You choose — nothing is changed automatically.';
    }
  };

  // ---- finding the order ----
  const lookup = async () => {
    const ref = val('rf-fm-order').trim();
    if (!ref || r) return;
    const info = $('rf-fm-orderinfo'), btn = $('rf-fm-find');
    info.className = 'muted rf-orderinfo'; info.textContent = 'Looking for order ' + ref + '…'; btn.disabled = true;
    try {
      const o = await ctx.api.lookupOrder(ref);
      if (val('rf-fm-order').trim() !== ref) return; // the number changed while we looked
      S.order = o; S.manual = false;
      const others = (o.other_refunds || []).filter((x) => x.status !== 'Cancelled');
      $('rf-fm-others').innerHTML = others.length ? '<div class="msg lv-warn"><b>Other refund requests already exist on this order:</b> ' + others.map((x) => esc(x.number) + ' (' + esc(x.status) + ', ' + money(x.amount) + (x.customer ? ', ' + esc(x.customer) : '') + ')').join('; ') + '. You can still continue — you will be asked to confirm.</div>' : '';
      if (!o.found) { info.className = 'lv-neg rf-orderinfo'; info.textContent = 'This Order ID was not found in the system. Check the number — or fill in the details by hand and you will be asked to confirm.'; S.items = S.items.filter((i) => !i.fromOrder); drawItems(); hints(); return; }
      info.className = 'lv-pos rf-orderinfo';
      info.textContent = '✓ Found — ' + ({ online: 'online order', pos: 'walk-in sale', layaway: 'layaway' }[o.source] || 'order') + (o.order_date ? ' of ' + fmtDate(o.order_date) : '') + ' · total ' + money(o.order_total) + ' · paid ' + money(o.order_paid) + (o.original_payment_method ? ' · ' + o.original_payment_method : '') + '.';
      const setIf = (id, v) => { if (v && !val(id).trim()) $(id).value = v; };
      setIf('rf-fm-name', o.customer_name); setIf('rf-fm-contact', o.customer_contact); setIf('rf-fm-email', o.customer_email); setIf('rf-fm-address', o.customer_address);
      if (o.branch_id && !val('rf-fm-branch')) $('rf-fm-branch').value = String(o.branch_id);
      S.items = [...(o.items || []).map((i) => ({ include: false, fromOrder: true, sku: i.sku || '', name: i.name || i.sku || 'Item', qty: Number(i.quantity) || 1, maxQty: Number(i.quantity) || 1, unit: i.unit_price === null || i.unit_price === undefined ? null : Number(i.unit_price),
        amt: i.unit_price === null || i.unit_price === undefined ? null : round2(Number(i.unit_price) * (Number(i.quantity) || 1)) })), ...S.items.filter((i) => !i.fromOrder)];
      if ((o.items || []).length === 1) S.items[0].include = true;
      drawItems(); syncAmount();
    } catch (err) { info.className = 'lv-neg rf-orderinfo'; info.textContent = friendly(err); } finally { if ($('rf-fm-find')) $('rf-fm-find').disabled = false; }
  };

  drawItems(); hints();
  if (!r) {
    $('rf-fm-find').addEventListener('click', lookup);
    $('rf-fm-order').addEventListener('change', lookup);
    $('rf-fm-order').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
    $('rf-fm-additem').addEventListener('click', () => { S.items.push({ include: true, fromOrder: false, sku: '', name: '', qty: 1, unit: null, amt: null }); drawItems(); });
  } else if ($('rf-fm-additem')) $('rf-fm-additem').addEventListener('click', () => { S.items.push({ include: true, fromOrder: false, sku: '', name: '', qty: 1, unit: null, amt: null }); drawItems(); });
  $('rf-fm-amount').addEventListener('input', () => { S.amountTouched = true; hints(); });
  if ($('rf-fm-priority')) $('rf-fm-priority').addEventListener('change', hints);

  const snapshot = () => JSON.stringify([...document.querySelectorAll('#rf-form-body input, #rf-form-body select, #rf-form-body textarea')].map((el) => el.type === 'checkbox' ? el.checked : el.type === 'file' ? (el.files[0] && el.files[0].name) : el.value));
  S.snapshot = snapshot(); S.snap = snapshot;

  // ---- reading + checking the form ----
  const readItems = () => S.items.filter((i) => i.include && String(i.name).trim()).map((i) => ({ sku: i.sku || null, item_name: String(i.name).trim(), quantity: Number(i.qty) || 1, unit_price: i.unit === null || i.unit === undefined || i.unit === '' ? null : Number(i.unit), refund_amount: Number(i.amt) || 0 }));
  const check = () => {
    const bad = [], amt = Number(val('rf-fm-amount'));
    if (!r && !val('rf-fm-order').trim()) bad.push(['rf-fm-order', 'Enter the Order ID.']);
    if (!val('rf-fm-name').trim()) bad.push(['rf-fm-name', 'Enter the customer name.']);
    if (!Number.isFinite(amt) || amt <= 0 || Math.abs(amt * 100 - Math.round(amt * 100)) > 1e-6) bad.push(['rf-fm-amount', 'Enter the amount to refund (more than 0, up to two decimal places).']);
    if (!val('rf-fm-reason')) bad.push(['rf-fm-reason', 'Choose the reason for the refund.']);
    if (!r && val('rf-fm-date') && val('rf-fm-date') > ctx.today) bad.push(['rf-fm-date', 'The requested date cannot be in the future.']);
    const items = S.items.filter((i) => i.include);
    if (items.some((i) => !String(i.name).trim())) bad.push(['rf-fm-items', 'Give each item a name, or remove the row.']);
    if (!bad.length && Number.isFinite(amt) && itemsTotal() > amt + 0.004) bad.push(['rf-fm-amount', 'The items add up to ' + money(itemsTotal()) + ', which is more than the amount to refund.']);
    return bad;
  };
  const read = () => {
    const items = readItems();
    const p = {
      customer_name: val('rf-fm-name').trim(), customer_contact: val('rf-fm-contact').trim(), customer_email: val('rf-fm-email').trim(), customer_address: val('rf-fm-address').trim(),
      refund_amount: Number(val('rf-fm-amount')), refund_method: val('rf-fm-method'), account_name: val('rf-fm-acname').trim(), account_number: val('rf-fm-acnum').trim(),
      reason_category: val('rf-fm-reason'), reason: val('rf-fm-reasontext').trim(), notes: val('rf-fm-notes').trim(),
    };
    if ($('rf-fm-internal')) p.internal_notes = val('rf-fm-internal').trim();
    if ($('rf-fm-priority')) p.priority = val('rf-fm-priority');
    if (!r) { p.order_reference = val('rf-fm-order').trim(); p.requested_date = val('rf-fm-date') || ctx.today; p.branch_id = val('rf-fm-branch') || null; p.item_description = items.map((i) => i.item_name).join(', '); }
    else if (mgr) p.branch_id = val('rf-fm-branch') || null;
    if (!locked) p.items = items;
    return p;
  };

  // ---- saving ----
  const errBox = (html) => { $('rf-fm-errors').innerHTML = html ? '<div class="msg error">' + html + '</div>' : ''; if (html) drawerBody('form').scrollTop = 0; };
  const lines = (list) => (list || []).map((x) => '<div>' + esc(x) + '</div>').join('');
  const dupList = (matches) => (matches || []).map((m) => '<div>' + esc(m.number) + ' · ' + esc(m.status) + ' · ' + money(m.amount) + ' · ' + esc(fmtDate(m.requested_date)) + (m.customer ? ' · ' + esc(m.customer) : '') + (m.reasons && m.reasons.length ? ' <span class="muted">(' + esc(m.reasons.join(', ')) + ')</span>' : '') + '</div>').join('');
  const submit = async (acks = {}) => {
    const btn = $('rf-fm-save'); $('rf-form-msg').innerHTML = ''; errBox('');
    const bad = check();
    if (bad.length) { errBox(bad.map((x) => esc(x[1])).join('<br>')); flagInvalid($(bad[0][0])); return; }
    const p = { ...read(), ...acks };
    if (S.manual) p.manual_order = true;
    btn.disabled = true;
    try {
      const res = r ? await ctx.api.updateRefund(r.id, p) : await ctx.api.createRefund(p);
      if (res && res.ok === false) {
        if (res.order_not_found) {
          actionPanel('form', { title: 'Order ID not found', message: esc(res.errors[0]), okLabel: 'Continue — I am entering the order by hand', onOk: async () => { S.manual = true; await submit(acks); } });
        } else if (res.over_limit) {
          if (mgr) actionPanel('form', { title: 'More than can still be refunded', wide: true, message: esc(res.errors[0]) + ' As a manager you can continue with a written reason, which is kept in the history.',
            fields: field('Reason *', '<textarea id="rf-fm-overreason" rows="2" maxlength="300" placeholder="Why is this more than the order allows?"></textarea>'), okLabel: 'Continue Anyway',
            onOk: async () => { const t = val('rf-fm-overreason').trim(); if (t.length < 5) throw new Error('Explain briefly why this is more than the order allows.'); await submit({ ...acks, over_limit_ack: true, over_limit_reason: t }); } });
          else { errBox(lines(res.errors) + '<div>Ask a manager if this refund really is more than the order total.</div>'); flagInvalid($('rf-fm-amount')); }
        } else if (res.duplicate) {
          actionPanel('form', { title: 'Possible duplicate refund request detected.', wide: true, message: 'There is already a refund request on this order. Check that this is not the same one entered twice:', fields: '<div class="rf-dups">' + dupList(res.matches) + '</div>', okLabel: 'This Is Not a Duplicate — Submit',
            onOk: async () => { await submit({ ...acks, duplicate_ack: true }); } });
        } else errBox(lines(res.errors));
        return;
      }
      let note = '';
      const file = $('rf-fm-file') && $('rf-fm-file').files[0];
      if (!r && file) {
        const problem = fileProblem(file);
        if (problem) note = ' The file could not be attached: ' + problem;
        else try { const up = await ctx.api.uploadFile(res.id, file, 'Request attachment'); if (up && up.ok === false) note = ' The file could not be attached: ' + errorsText(up); } catch (err) { note = ' The file could not be attached: ' + friendly(err); }
      }
      formState = null; closeDrawer('form');
      ctx.toast(r ? 'Request updated.' + note : 'Refund request ' + res.refund_request_number + ' created.' + note, !!note);
      await ctx.refresh();
      if (r && ctx.detailOpenId() === r.id) ctx.openDetail(r.id, { keep: true });
      else if (!r) ctx.openDetail(res.id);
    } catch (err) { errBox(esc(friendly(err))); } finally { if ($('rf-fm-save')) $('rf-fm-save').disabled = false; }
  };
  $('rf-fm-save').addEventListener('click', () => submit());
  $('rf-fm-cancel').addEventListener('click', () => requestCloseForm());
  ($('rf-fm-order') && !r ? $('rf-fm-order') : $('rf-fm-name')).focus();
}

/** Close button / backdrop / Escape: asks first when something was typed. */
export function requestCloseForm() {
  if (!formState) { closeDrawer('form'); return; }
  if (formState.snap() === formState.snapshot) { formState = null; closeDrawer('form'); return; }
  actionPanel('form', { title: 'Discard your changes?', message: 'What you typed has not been saved.', okLabel: 'Discard', danger: true, onOk: () => { formState = null; closeDrawer('form'); } });
}

// ================================================================ record a refund payment
export function openPayment(ctx, refundId) {
  const r = ctx.byId.get(Number(refundId));
  if (!r) return;
  if (!ctx.access.pay) { ctx.toast('Only Finance or a manager can record a refund payment.', true); return; }
  if (!r._approved) { ctx.toast('This refund has not been approved yet, so no payment can be recorded.', true); return; }
  if (r._remaining <= 0) { ctx.toast('This refund has already been paid in full.', true); return; }
  const defMethod = METHODS.includes(r.refund_method) ? r.refund_method : 'Bank Transfer';
  openDrawer('side', {
    title: 'Record Refund Payment', sub: r.refund_request_number + ' · ' + r.customer_name,
    body: '<div id="rf-side-msg"></div><div id="rp-errors"></div>' +
      '<div class="bl-paysummary"><div><span class="muted">Approved</span><b>' + money(r._appr) + '</b></div><div><span class="muted">Already refunded</span><b>' + money(r._effPaid) + '</b></div><div><span class="muted">Remaining</span><b>' + money(r._remaining) + '</b></div></div>' +
      (r.account_name || r.account_number ? '<p class="muted">Send to: <b>' + esc([r.account_name, r.account_number].filter(Boolean).join(' · ')) + '</b> by ' + esc(r.refund_method || '—') + '</p>' : '') +
      (r._livePays.length ? '<p class="muted">' + plural(r._livePays.length, 'earlier payment') + ' recorded. This adds another one.</p>' : '') +
      '<div class="bl-formgrid">' +
        field('Amount paid (PHP) *', '<input type="number" id="rp-amount" step="0.01" min="0.01" max="' + r._remaining + '" inputmode="decimal" value="' + r._remaining + '"><div class="bl-quick"><button type="button" class="btn small secondary" data-pay-frac="1">Pay the full balance</button><button type="button" class="btn small secondary" data-pay-frac="0.5">Half</button></div>') +
        field('Payment date *', '<input type="date" id="rp-date" value="' + ctx.today + '" min="' + esc(r.requested_date) + '" max="' + ctx.today + '">') +
        field('Method *', '<select id="rp-method">' + METHODS.map((m) => '<option' + (m === defMethod ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select>') +
        field('<span id="rp-reflabel">Reference number</span>', '<input type="text" id="rp-ref" maxlength="80" placeholder="Transfer / transaction no.">') +
        field('Proof of refund', '<input type="file" id="rp-file" accept="' + ACCEPT + '"><span class="muted">Screenshot or receipt. ' + FILE_HINT + ' You can add it later.</span>') + '</div>' +
      field('Notes', '<textarea id="rp-notes" rows="2" maxlength="500"></textarea>') + '<div class="lv-preview" id="rp-preview"></div>',
    footer: '<button type="button" class="btn" id="rp-save">Record Payment</button><button type="button" class="btn secondary" id="rp-cancel">Cancel</button>',
  });
  const needsRef = () => NEEDS_REFERENCE.includes(val('rp-method'));
  const preview = () => {
    const a = Number(val('rp-amount')), left = round2(r._remaining - (Number.isFinite(a) ? a : 0));
    $('rp-preview').innerHTML = !Number.isFinite(a) || a <= 0 ? 'Enter the amount paid.' : left < 0 ? '<span class="lv-neg">That is more than the remaining ' + money(r._remaining) + ' — a refund can never be paid more than the approved amount.</span>'
      : left === 0 ? '<b class="lv-pos">✓ This pays the refund in full — it will be marked Completed.</b>' : 'Remaining after this payment: <b>' + money(left) + '</b> — the refund will show as Partially Refunded.';
  };
  const refLabel = () => { $('rp-reflabel').textContent = needsRef() ? 'Reference number *' : 'Reference number'; };
  $('rp-amount').addEventListener('input', preview); $('rp-method').addEventListener('change', refLabel); preview(); refLabel();
  drawerBody('side').querySelectorAll('[data-pay-frac]').forEach((x) => x.addEventListener('click', () => { $('rp-amount').value = round2(r._remaining * Number(x.dataset.payFrac)); preview(); }));
  $('rp-cancel').addEventListener('click', () => closeDrawer('side'));
  const send = async (ack) => {
    const amount = Number(val('rp-amount')), btn = $('rp-save'), box = $('rp-errors');
    $('rf-side-msg').innerHTML = ''; box.innerHTML = '';
    const bad = (id, msg) => { box.innerHTML = '<div class="msg error">' + esc(msg) + '</div>'; flagInvalid($(id)); };
    if (!Number.isFinite(amount) || amount <= 0) return bad('rp-amount', 'Enter the amount paid.');
    if (amount > r._remaining + 0.004) return bad('rp-amount', 'That is more than the remaining ' + money(r._remaining) + '.');
    if (!val('rp-date')) return bad('rp-date', 'Enter the payment date.');
    if (needsRef() && !val('rp-ref').trim()) return bad('rp-ref', 'Enter the reference number of the transfer.');
    const file = $('rp-file').files[0], problem = file ? fileProblem(file) : '';
    if (problem) return bad('rp-file', problem);
    btn.disabled = true;
    try {
      const res = await ctx.api.recordPayment(r.id, { amount, payment_date: val('rp-date'), payment_method: val('rp-method'), reference_number: val('rp-ref').trim(), notes: val('rp-notes').trim(), reference_ack: !!ack });
      if (!res || res.ok === false) {
        if (res && res.duplicate_reference) {
          actionPanel('side', { title: 'Reference number already used', message: esc(res.errors[0]), fields: '<div class="rf-dups">' + (res.matches || []).map((m) => '<div>' + esc(m.number) + ' · ' + money(m.amount) + ' · ' + esc(fmtDate(m.payment_date)) + '</div>').join('') + '</div>',
            okLabel: 'Use It Anyway', onOk: async () => { await send(true); } });
        } else box.innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>';
        btn.disabled = false; return;
      }
      let note = '';
      if (file) {
        try { const up = await ctx.api.uploadFile(r.id, file, 'Proof of refund', res.payment_id); if (up && up.ok === false) note = ' The proof could not be attached: ' + errorsText(up); } catch (err) { note = ' The proof could not be attached: ' + friendly(err); }
      } else note = ' No proof is attached yet — upload it from the refund.';
      closeDrawer('side');
      ctx.toast((res.completed ? 'Payment recorded — the refund is paid in full and marked Completed.' : 'Payment recorded — ' + money(res.remaining) + ' still to refund.') + note, !!note && !!file);
      await afterChange(ctx, r.id);
    } catch (err) { box.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  };
  $('rp-save').addEventListener('click', () => send(false));
  $('rp-amount').focus();
}

// ================================================================ correct a payment (the amount is never edited: void and re-record)
export function openEditPayment(ctx, paymentId) {
  let p = null, r = null;
  for (const x of ctx.refunds) { const f = x._pays.find((y) => y.id === paymentId); if (f) { p = f; r = x; break; } }
  if (!p) return;
  if (!ctx.access.pay) { ctx.toast('Only Finance or a manager can edit a payment.', true); return; }
  openDrawer('side', {
    title: 'Edit Payment', sub: r.refund_request_number + ' · ' + money(p.amount),
    body: '<div id="rf-side-msg"></div><div id="re-errors"></div><p class="muted">The amount cannot be changed. If it is wrong, an Admin voids this payment and a new one is recorded — both stay in the history.</p><div class="bl-formgrid">' +
      field('Payment date *', '<input type="date" id="re-date" value="' + esc(p.payment_date) + '" max="' + ctx.today + '">') +
      field('Method *', '<select id="re-method">' + [...new Set([...METHODS, p.payment_method])].map((m) => '<option' + (m === p.payment_method ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select>') +
      field('Reference number', '<input type="text" id="re-ref" maxlength="80" value="' + esc(p.reference_number || '') + '">') + '</div>' +
      field('Notes', '<textarea id="re-notes" rows="2" maxlength="500">' + esc(p.notes || '') + '</textarea>'),
    footer: '<button type="button" class="btn" id="re-save">Save</button><button type="button" class="btn secondary" id="re-cancel">Cancel</button>',
  });
  $('re-cancel').addEventListener('click', () => closeDrawer('side'));
  $('re-save').addEventListener('click', async () => {
    if (!val('re-date')) { flagInvalid($('re-date')); return; }
    const btn = $('re-save'); btn.disabled = true; $('re-errors').innerHTML = '';
    try {
      const res = await ctx.api.editPayment(p.id, { payment_date: val('re-date'), payment_method: val('re-method'), reference_number: val('re-ref').trim(), notes: val('re-notes').trim() });
      if (!res || res.ok === false) { $('re-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      closeDrawer('side'); ctx.toast('Payment updated.'); await afterChange(ctx, r.id);
    } catch (err) { $('re-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
}

// ================================================================ attach a file
export function openUpload(ctx, refundId, opts = {}) {
  const r = ctx.byId.get(Number(refundId));
  if (!r) return;
  const pay = ctx.access.pay;
  if (!pay && !ctx.isOwn(r)) { ctx.toast('You can only add files to your own requests.', true); return; }
  const pays = r._livePays;
  const kinds = [...(pay && pays.length ? [['Proof of refund', 'Proof of refund payment']] : []), ['Request attachment', 'Supporting document for the request'], ['Other', 'Other']];
  const firstNoProof = (pays.find((p) => !r._files.some((f) => f.payment_id === p.id)) || pays[0] || {}).id;
  openDrawer('side', {
    title: 'Attach a File', sub: r.refund_request_number + ' · ' + r.customer_name,
    body: '<div id="rf-side-msg"></div><div id="ru-errors"></div><div class="bl-formgrid">' +
      field('What is this file?', '<select id="ru-kind">' + kinds.map((k) => '<option value="' + k[0] + '"' + ((opts.paymentId || (r._missingProof && pay && pays.length)) && k[0] === 'Proof of refund' ? ' selected' : '') + '>' + k[1] + '</option>').join('') + '</select>') +
      (pay && pays.length ? field('Which payment?', '<select id="ru-pay">' + pays.map((p) => '<option value="' + p.id + '"' + ((opts.paymentId || firstNoProof) === p.id ? ' selected' : '') + '>' + money(p.amount) + ' on ' + esc(fmtDate(p.payment_date)) + ' (' + esc(p.payment_method) + ')' + (r._files.some((f) => f.payment_id === p.id) ? ' — has proof' : '') + '</option>').join('') + '</select>', { id: 'ru-pay-wrap' }) : '') +
      field('File *', '<input type="file" id="ru-file" accept="' + ACCEPT + '"><span class="muted">' + FILE_HINT + '</span>') + '</div>',
    footer: '<button type="button" class="btn" id="ru-save">Upload</button><button type="button" class="btn secondary" id="ru-cancel">Cancel</button>',
  });
  const sync = () => { const w = $('ru-pay-wrap'); if (w) w.hidden = val('ru-kind') !== 'Proof of refund'; };
  $('ru-kind').addEventListener('change', sync); sync();
  $('ru-cancel').addEventListener('click', () => closeDrawer('side'));
  $('ru-save').addEventListener('click', async () => {
    const file = $('ru-file').files[0], box = $('ru-errors');
    if (!file) { flagInvalid($('ru-file')); box.innerHTML = '<div class="msg error">Choose a file first.</div>'; return; }
    const problem = fileProblem(file);
    if (problem) { box.innerHTML = '<div class="msg error">' + esc(problem) + '</div>'; return; }
    const btn = $('ru-save'); btn.disabled = true; btn.textContent = 'Uploading…'; box.innerHTML = '';
    const kind = val('ru-kind');
    try {
      const res = await ctx.api.uploadFile(r.id, file, kind, kind === 'Proof of refund' && $('ru-pay') ? Number(val('ru-pay')) : null);
      if (res && res.ok === false) { box.innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; btn.textContent = 'Upload'; return; }
      closeDrawer('side'); ctx.toast('File attached.'); await afterChange(ctx, r.id);
    } catch (err) { box.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; btn.textContent = 'Upload'; }
  });
}

// ================================================================ a note
export function openNote(ctx, refundId) {
  const r = ctx.byId.get(Number(refundId));
  if (!r) return;
  openDrawer('side', {
    title: 'Add a Note', sub: r.refund_request_number + ' · ' + r.customer_name,
    body: '<div id="rf-side-msg"></div><div id="rn-errors"></div>' +
      (ctx.access.pay ? field('Who can see it?', '<select id="rn-type"><option value="Note">Everyone who can see this request</option><option value="Internal">Internal — refund staff only</option></select>') : '') +
      field('Note *', '<textarea id="rn-text" rows="4" maxlength="2000" placeholder="Write the note…"></textarea>'),
    footer: '<button type="button" class="btn" id="rn-save">Add Note</button><button type="button" class="btn secondary" id="rn-cancel">Cancel</button>',
  });
  $('rn-cancel').addEventListener('click', () => closeDrawer('side'));
  $('rn-save').addEventListener('click', async () => {
    const text = val('rn-text').trim();
    if (!text) { flagInvalid($('rn-text')); return; }
    const btn = $('rn-save'); btn.disabled = true; $('rn-errors').innerHTML = '';
    try {
      const res = await ctx.api.addComment(r.id, text, $('rn-type') ? val('rn-type') : 'Note');
      if (!res || res.ok === false) { $('rn-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      closeDrawer('side'); ctx.toast('Note added.'); await afterChange(ctx, r.id);
    } catch (err) { $('rn-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
  $('rn-text').focus();
}

// ================================================================ customer communication
export function openComm(ctx, refundId) {
  const r = ctx.byId.get(Number(refundId));
  if (!r) return;
  openDrawer('side', {
    title: 'Log Customer Contact', sub: r.refund_request_number + ' · ' + r.customer_name + (r.customer_contact ? ' · ' + r.customer_contact : ''),
    body: '<div id="rf-side-msg"></div><div id="rc-errors"></div><div class="bl-formgrid">' +
      field('How were they contacted? *', '<select id="rc-method">' + COMM_METHODS.map((m) => '<option>' + m + '</option>').join('') + '</select>') +
      field('When', '<input type="datetime-local" id="rc-when" value="' + nowLocal() + '" max="' + nowLocal() + '">') + '</div>' +
      field('What was said or agreed? *', '<textarea id="rc-msg" rows="3" maxlength="2000" placeholder="e.g. Told the customer the refund will go out Friday."></textarea>') +
      '<label class="lv-check"><input type="checkbox" id="rc-cust"> The customer contacted us asking about this refund <span class="muted">(counts as a customer follow-up)</span></label>' +
      field('Our next follow-up', '<input type="date" id="rc-next" min="' + ctx.today + '" value="' + esc(r.next_follow_up_date || '') + '">'),
    footer: '<button type="button" class="btn" id="rc-save">Save</button><button type="button" class="btn secondary" id="rc-cancel">Cancel</button>',
  });
  $('rc-cancel').addEventListener('click', () => closeDrawer('side'));
  $('rc-save').addEventListener('click', async () => {
    const msg = val('rc-msg').trim();
    if (!msg) { flagInvalid($('rc-msg')); $('rc-errors').innerHTML = '<div class="msg error">Write what was said or agreed.</div>'; return; }
    const btn = $('rc-save'); btn.disabled = true; $('rc-errors').innerHTML = '';
    try {
      const res = await ctx.api.logCommunication({ refundId: r.id, method: val('rc-method'), message: msg, followup: $('rc-cust').checked, next: val('rc-next') || null, when: val('rc-when') ? new Date(val('rc-when')).toISOString() : null });
      if (!res || res.ok === false) { $('rc-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      closeDrawer('side'); ctx.toast('Contact logged.'); await afterChange(ctx, r.id);
    } catch (err) { $('rc-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
  $('rc-msg').focus();
}

export function openFollowUp(ctx, refundId) {
  const r = ctx.byId.get(Number(refundId));
  if (!r) return;
  openDrawer('side', {
    title: 'Set Follow-up Date', sub: r.refund_request_number + ' · ' + r.customer_name,
    body: '<div id="rf-side-msg"></div><div id="rfu-errors"></div><p>When should someone next follow up on this refund?</p>' + field('Next follow-up', '<input type="date" id="rfu-date" min="' + ctx.today + '" value="' + esc(r.next_follow_up_date || '') + '">'),
    footer: '<button type="button" class="btn" id="rfu-save">Save</button>' + (r.next_follow_up_date ? '<button type="button" class="btn secondary" id="rfu-clear">Clear it</button>' : '') + '<button type="button" class="btn secondary" id="rfu-cancel">Cancel</button>',
  });
  const apply = async (next, msg) => {
    try {
      const res = await ctx.api.setFollowUp(r.id, next);
      if (!res || res.ok === false) { $('rfu-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; return; }
      closeDrawer('side'); ctx.toast(msg); await afterChange(ctx, r.id);
    } catch (err) { $('rfu-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; }
  };
  $('rfu-cancel').addEventListener('click', () => closeDrawer('side'));
  $('rfu-save').addEventListener('click', () => { if (!val('rfu-date')) { flagInvalid($('rfu-date')); return; } apply(val('rfu-date'), 'Follow-up set for ' + fmtDate(val('rfu-date')) + '.'); });
  if ($('rfu-clear')) $('rfu-clear').addEventListener('click', () => apply(null, 'Follow-up date cleared.'));
}

// ================================================================ priority and flag (managers)
export function openPriority(ctx, refundId) {
  const r = ctx.byId.get(Number(refundId));
  if (!r || !ctx.access.approve) return;
  const sug = suggestPriority(r, ctx);
  openDrawer('side', {
    title: 'Priority & Flag', sub: r.refund_request_number + ' · ' + r.customer_name,
    body: '<div id="rf-side-msg"></div><div id="rq-errors"></div>' +
      field('Priority', '<select id="rq-prio">' + PRIORITIES.map((p) => '<option' + (p === r.priority ? ' selected' : '') + '>' + p + '</option>').join('') + '</select>') +
      '<p class="muted">Suggested: <b>' + esc(sug.level) + '</b>' + (sug.why.length ? ' — ' + esc(sug.why.join(', ')) : ' — nothing unusual') + '. The suggestion never changes anything by itself.</p>' +
      '<label class="lv-check"><input type="checkbox" id="rq-flag"' + (r.flagged ? ' checked' : '') + '> Flag for management attention</label>' +
      field('Why is it flagged? *', '<textarea id="rq-reason" rows="2" maxlength="300">' + esc(r.flag_reason || '') + '</textarea>', { id: 'rq-reason-wrap', hidden: !r.flagged }),
    footer: '<button type="button" class="btn" id="rq-save">Save</button><button type="button" class="btn secondary" id="rq-cancel">Cancel</button>',
  });
  $('rq-flag').addEventListener('change', () => { $('rq-reason-wrap').hidden = !$('rq-flag').checked; });
  $('rq-cancel').addEventListener('click', () => closeDrawer('side'));
  $('rq-save').addEventListener('click', async () => {
    const flagged = $('rq-flag').checked;
    if (flagged && val('rq-reason').trim().length < 3) { flagInvalid($('rq-reason')); $('rq-errors').innerHTML = '<div class="msg error">Say why this request is flagged.</div>'; return; }
    const btn = $('rq-save'); btn.disabled = true; $('rq-errors').innerHTML = '';
    try {
      const res = await ctx.api.setPriority(r.id, val('rq-prio'), flagged, val('rq-reason').trim());
      if (!res || res.ok === false) { $('rq-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      closeDrawer('side'); ctx.toast('Priority saved.'); await afterChange(ctx, r.id);
    } catch (err) { $('rq-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
}
