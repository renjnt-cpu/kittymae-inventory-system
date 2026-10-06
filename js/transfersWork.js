// Transfers -- the work panels: approve (with partial quantities), release / dispatch, receive (with damaged and missing),
// revise an approved quantity, add a note, attach a file. Each opens in the side drawer so it works the same from a list row
// and from the transfer card. The database re-checks every rule (who, status, stock, quantities); a panel only helps people
// get it right the first time and shows what the stock will be before and after.
//
// Stock timing, as it has always been here: approving and preparing move NO stock. Releasing takes the pieces out of the source
// branch. Receiving adds only the good pieces to the destination; damaged and missing pieces become open discrepancies.
import { esc, qty, pcs, fmtBytes, openDrawer, closeDrawer, drawerBody, actionPanel, friendly, errorsText } from './transfersUi.js?v=20261007f';
import { stockOf, FILE_KINDS, FILE_TYPES, MAX_FILE } from './transfersLogic.js?v=20261007f';
import { flagInvalid } from './uiKit.js?v=20261007f';

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) ? $(id).value : '');
const field = (label, inner, extra) => '<div class="field"' + (extra && extra.id ? ' id="' + extra.id + '"' : '') + (extra && extra.hidden ? ' hidden' : '') + '><label>' + label + '</label>' + inner + '</div>';
const whole = (v) => { if (v === '' || v === null || v === undefined) return 0; const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : NaN; };
const errBox = (html) => { const b = $('tf-sd-errors'); if (b) b.innerHTML = html ? '<div class="msg error">' + html + '</div>' : ''; if (html && drawerBody('side')) drawerBody('side').scrollTop = 0; };
const must = (res) => { if (res && res.ok === false) { const e = new Error(errorsText(res)); e.res = res; throw e; } return res; };
const ACCEPT = 'image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf';
const fileProblem = (f) => (!FILE_TYPES.test(f.type || '') ? 'Only JPG, JPEG, PNG and PDF files can be attached.' : f.size > MAX_FILE ? 'That file is ' + fmtBytes(f.size) + ' — the limit is 10 MB.' : '');

/** Reload everything, then bring the open transfer card up to date. */
export async function afterChange(ctx, id) {
  await ctx.refresh();
  if (id && ctx.detailOpenId() === id && ctx.byId.has(id)) ctx.openDetail(id, { keep: true });
}
const gone = (ctx) => { ctx.toast('That transfer is no longer available.', true); };
const panel = (t, title, body, footer) => openDrawer('side', { title, sub: t.transfer_number + ' · ' + t._from + ' → ' + t._to + ' · ' + t.status, body: '<div id="tf-side-msg"></div><div id="tf-sd-errors"></div>' + body, footer });
const itemCell = (i) => '<b>' + esc(i.sku) + '</b><div class="muted bl-sub">' + esc(i.name) + '</div>';
const table = (head, rows) => '<div class="table-scroll table-2col"><table class="lv-mini tf-worktable"><thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
const beforeAfter = (now, after, bad) => '<span class="' + (bad ? 'lv-neg' : '') + '">' + qty(now) + ' → <b>' + qty(after) + '</b></span>';

// ================================================================ approve
export function openApprove(ctx, id) {
  const t = ctx.byId.get(id);
  if (!t) return gone(ctx);
  if (!ctx.caps.canApprove(t)) {
    ctx.toast(t.status !== 'Requested' ? 'Only a Requested transfer can be approved.' : ctx.caps.own(t) ? 'You cannot approve a transfer you requested yourself — ask another manager.'
      : t.revision_count > 0 && t.revised_by === ctx.employee.id ? 'You revised this transfer, so someone else has to approve it.' : 'Only an Admin or a Manager can approve transfers.', true);
    return;
  }
  const rows = t._items.map((i) => '<tr data-item="' + i.id + '" data-sku="' + esc(i.sku) + '"><td data-label="Item">' + itemCell(i) + '</td><td data-label="Requested"><b>' + qty(i.req) + '</b></td>' +
    '<td data-label="In stock at ' + esc(t._from) + '">' + qty(stockOf(ctx, i.sku, t.from_branch_id)) + '</td>' +
    '<td data-label="Approve"><input type="number" class="tf-qty" min="0" max="' + i.req + '" step="1" inputmode="numeric" data-k="q" value="' + (i.appr ?? i.req) + '" aria-label="Approved quantity for ' + esc(i.sku) + '"></td>' +
    '<td data-label="Stock after approval"><span data-k="after"></span></td>' +
    '<td data-label="Note" class="full-row"><input type="text" data-k="note" maxlength="200" placeholder="Note for this item (optional)"></td></tr>').join('');
  panel(t, 'Approve Transfer',
    '<p class="muted">Approving does not move any stock — the pieces leave ' + esc(t._from) + ' only when the transfer is released. Lower a quantity to approve part of a line; set it to 0 to leave a line out.</p>' +
    table(['Item', 'Requested', 'In stock at ' + esc(t._from), 'Approve', 'Source stock after', 'Note'], rows) +
    '<div id="tf-ap-sum" class="lv-preview"></div>' +
    field('<span id="tf-ap-reasonlabel">Note (optional)</span>', '<textarea id="tf-ap-reason" rows="2" maxlength="500" placeholder="Approval note"></textarea>') +
    '<div id="tf-ap-over" class="msg lv-warn" hidden><b>Not enough stock at ' + esc(t._from) + ' for some lines.</b> As an Admin or Manager you may approve anyway. The reason is kept in the history, and the pieces still cannot be released unless the stock is there at release time.' +
      '<label class="lv-check"><input type="checkbox" id="tf-ap-overtick"> Approve anyway (stock override)</label>' + field('Reason for the override *', '<textarea id="tf-ap-overreason" rows="2" maxlength="300"></textarea>') + '</div>',
    '<button type="button" class="btn" id="tf-ap-ok">Approve</button><button type="button" class="btn secondary" id="tf-ap-reject">Reject…</button><button type="button" class="btn secondary" id="tf-ap-back">Return for Editing…</button><button type="button" class="btn secondary" id="tf-ap-x">Close</button>');
  const root = drawerBody('side');
  const read = () => t._items.map((i) => { const tr = root.querySelector('tr[data-item="' + i.id + '"]'); return { i, tr, q: whole(tr.querySelector('[data-k="q"]').value), note: tr.querySelector('[data-k="note"]').value.trim() }; });
  const recalc = () => {
    const list = read(); let short = false, partial = false, total = 0, bad = false;
    list.forEach(({ i, tr, q }) => {
      const src = stockOf(ctx, i.sku, t.from_branch_id), ok = Number.isInteger(q) && q <= i.req;
      if (!ok) bad = true; else { total += q; if (q < i.req) partial = true; if (q > src) short = true; }
      tr.querySelector('[data-k="after"]').innerHTML = ok ? beforeAfter(src, src - q, q > src) + (q > src ? ' <span class="lv-neg">· only ' + qty(src) + ' in stock</span>' : '') : '<span class="lv-neg">Enter 0 to ' + i.req + '</span>';
    });
    $('tf-ap-over').hidden = !short && $('tf-ap-over').dataset.forced !== '1';
    $('tf-ap-reasonlabel').textContent = partial ? 'Why is the approved quantity lower than requested? *' : 'Note (optional)';
    $('tf-ap-sum').innerHTML = bad ? '' : (partial ? '<b>Partial approval</b> — ' : '') + 'Approving <b>' + pcs(total) + '</b> of ' + pcs(t._reqPcs) + ' requested.';
    return { list, short, partial, total, bad };
  };
  root.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', recalc));
  recalc();
  $('tf-ap-x').addEventListener('click', () => closeDrawer('side'));
  $('tf-ap-ok').addEventListener('click', async () => {
    const r = recalc(), btn = $('tf-ap-ok'); errBox('');
    if (r.bad) return errBox('Enter a whole number from 0 up to the requested quantity on every line.');
    if (!r.total) return errBox('Approve at least one item — or reject the transfer.');
    const reason = val('tf-ap-reason').trim();
    if (r.partial && reason.length < 3) { flagInvalid($('tf-ap-reason')); return errBox('Say why the approved quantity is lower than what was requested.'); }
    const p = { items: r.list.map((x) => ({ item_id: x.i.id, approved_qty: x.q, note: x.note || null })), reason };
    if (!$('tf-ap-over').hidden && $('tf-ap-overtick').checked) {
      p.override = true; p.override_reason = val('tf-ap-overreason').trim();
      if (p.override_reason.length < 5) { flagInvalid($('tf-ap-overreason')); return errBox('Write the reason for the stock override.'); }
    }
    btn.disabled = true;
    try {
      const res = await ctx.api.approveTransfer(t.id, p);
      if (res && res.ok === false) {
        if (res.insufficient) { $('tf-ap-over').dataset.forced = '1'; $('tf-ap-over').hidden = false; }
        errBox(esc(errorsText(res))); btn.disabled = false; return;
      }
      closeDrawer('side'); ctx.toast(t.transfer_number + ' approved — ' + pcs(res.approved_pcs) + (res.partial ? ' (partial)' : '') + '. No stock has moved yet.'); await afterChange(ctx, t.id);
    } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; }
  });
  const reasonPanel = (cfg) => actionPanel('side', { ...cfg, fields: '<textarea id="tf-rs-reason" rows="3" maxlength="500" placeholder="' + esc(cfg.placeholder) + '"></textarea>',
    onOk: async () => { const x = val('tf-rs-reason').trim(); if (x.length < 3) throw new Error(cfg.err); must(await cfg.call(x)); closeDrawer('side'); ctx.toast(cfg.done); await afterChange(ctx, t.id); } });
  $('tf-ap-reject').addEventListener('click', () => reasonPanel({ title: 'Reject this transfer?', message: 'Nothing moves. The reason is kept in the history and shown on the transfer, which can never be deleted.', placeholder: 'Reason for rejecting (required)', okLabel: 'Reject Transfer', danger: true,
    err: 'A rejection reason is required.', call: (x) => ctx.api.rejectTransfer(t.id, x), done: t.transfer_number + ' rejected.' }));
  $('tf-ap-back').addEventListener('click', () => reasonPanel({ title: 'Return for editing?', message: 'The transfer goes back to its requester as a Draft, with your note, so they can correct it and submit it again.', placeholder: 'What needs to change? (required)', okLabel: 'Return for Editing',
    err: 'Say what needs to change.', call: (x) => ctx.api.returnForEditing(t.id, x), done: t.transfer_number + ' returned for editing.' }));
}

// ================================================================ release / dispatch
export function openRelease(ctx, id) {
  const t = ctx.byId.get(id);
  if (!t) return gone(ctx);
  if (!ctx.caps.canRelease(t)) {
    ctx.toast(!['Approved', 'Preparing'].includes(t.status) ? 'This transfer is ' + t.status + ' — it can only be released while Approved or Preparing.' : ctx.caps.own(t) ? 'You cannot release a transfer you requested yourself.' : 'Only the ' + t._from + ' supervisor, an Admin or a Manager can release this transfer.', true);
    return;
  }
  const rows = t._items.filter((i) => (i.appr ?? i.req) > 0).map((i) => {
    const cap = i.appr ?? i.req;
    return '<tr data-item="' + i.id + '" data-sku="' + esc(i.sku) + '"><td data-label="Item">' + itemCell(i) + '</td><td data-label="Approved"><b>' + qty(cap) + '</b></td>' +
      '<td data-label="In stock at ' + esc(t._from) + '">' + qty(stockOf(ctx, i.sku, t.from_branch_id)) + '</td>' +
      '<td data-label="Release"><input type="number" class="tf-qty" min="0" max="' + cap + '" step="1" inputmode="numeric" data-k="q" value="' + cap + '" aria-label="Quantity released for ' + esc(i.sku) + '"></td>' +
      '<td data-label="Stock after release"><span data-k="after"></span></td></tr>';
  }).join('');
  panel(t, 'Release Transfer',
    '<div class="msg lv-warn"><b>Releasing takes the pieces out of ' + esc(t._from) + ' now.</b> They are written to the stock ledger and shown as in transit. Nothing is added to ' + esc(t._to) + ' until ' + esc(t._to) + ' confirms receipt. This cannot be undone — if something is wrong afterwards, report a discrepancy.</div>' +
    table(['Item', 'Approved', 'In stock at ' + esc(t._from), 'Release', 'Source stock after'], rows) + '<div id="tf-rl-sum" class="lv-preview"></div>' +
    '<h4 class="rf-sub">Dispatch details <span class="muted">(optional)</span></h4><div class="bl-formgrid">' +
      field('Courier', '<input type="text" id="tf-rl-courier" maxlength="80" placeholder="e.g. LBC, own driver" value="' + esc(t.release_courier || '') + '">') +
      field('Vehicle / plate', '<input type="text" id="tf-rl-vehicle" maxlength="60" value="' + esc(t.release_vehicle || '') + '">') +
      field('Driver / carried by', '<input type="text" id="tf-rl-driver" maxlength="80" value="' + esc(t.release_driver || '') + '">') +
      field('Tracking / reference no.', '<input type="text" id="tf-rl-track" maxlength="80" value="' + esc(t.release_tracking || '') + '">') + '</div>' +
    field('Release notes', '<textarea id="tf-rl-notes" rows="2" maxlength="500" placeholder="Packing, seal number, anything the receiver should know">' + esc(t.release_notes || '') + '</textarea>'),
    '<button type="button" class="btn" id="tf-rl-ok">Release Transfer</button><button type="button" class="btn secondary" id="tf-rl-x">Cancel</button>');
  const root = drawerBody('side');
  const read = () => t._items.filter((i) => (i.appr ?? i.req) > 0).map((i) => ({ i, cap: i.appr ?? i.req, tr: root.querySelector('tr[data-item="' + i.id + '"]'), q: whole(root.querySelector('tr[data-item="' + i.id + '"] [data-k="q"]').value) }));
  const recalc = () => {
    let total = 0, bad = false, short = false;
    read().forEach(({ i, cap, tr, q }) => {
      const src = stockOf(ctx, i.sku, t.from_branch_id), ok = Number.isInteger(q) && q <= cap;
      if (!ok) bad = true; else { total += q; if (q > src) short = true; }
      tr.querySelector('[data-k="after"]').innerHTML = ok ? beforeAfter(src, src - q, q > src) + (q > src ? ' <span class="lv-neg">· not enough stock — the system will refuse</span>' : '') : '<span class="lv-neg">Enter 0 to ' + cap + '</span>';
    });
    $('tf-rl-sum').innerHTML = bad ? '' : 'Releasing <b>' + pcs(total) + '</b> to ' + esc(t._to) + (short ? ' <span class="lv-neg">— stock at ' + esc(t._from) + ' is lower than the quantity entered</span>' : '');
    return { bad, total };
  };
  root.querySelectorAll('[data-k="q"]').forEach((el) => el.addEventListener('input', recalc));
  recalc();
  $('tf-rl-x').addEventListener('click', () => closeDrawer('side'));
  $('tf-rl-ok').addEventListener('click', async () => {
    const r = recalc(), btn = $('tf-rl-ok'); errBox('');
    if (r.bad) return errBox('Enter a whole number from 0 up to the approved quantity on every line.');
    if (!r.total) return errBox('Release at least one item — or cancel the transfer.');
    btn.disabled = true; btn.textContent = 'Releasing…';
    try {
      const res = must(await ctx.api.releaseTransfer(t.id, { items: read().map((x) => ({ item_id: x.i.id, released_qty: x.q })), courier: val('tf-rl-courier').trim(), vehicle: val('tf-rl-vehicle').trim(),
        driver: val('tf-rl-driver').trim(), tracking_number: val('tf-rl-track').trim(), notes: val('tf-rl-notes').trim() }));
      closeDrawer('side'); ctx.toast(t.transfer_number + ' released — ' + pcs(res.pcs) + ' now in transit to ' + t._to + '.'); await afterChange(ctx, t.id);
    } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; btn.textContent = 'Release Transfer'; }
  });
}

// ================================================================ receive (full, partial, damaged, missing)
export function openReceive(ctx, id) {
  const t = ctx.byId.get(id);
  if (!t) return gone(ctx);
  if (!ctx.caps.canReceive(t)) {
    ctx.toast(!['In Transit', 'Partially Received'].includes(t.status) ? 'This transfer is ' + t.status + ' — it can only be received while In Transit or Partially Received.' : 'Only the ' + t._to + ' supervisor, an Admin or a Manager can receive this transfer.', true);
    return;
  }
  const lines = t._items.filter((i) => i.outstanding > 0);
  if (!lines.length) { ctx.toast('Nothing is still expected on this transfer.', true); return; }
  const key = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const cards = lines.map((i) => '<div class="tf-rcv" data-item="' + i.id + '" data-sku="' + esc(i.sku) + '"><div class="tf-rcv-head"><div><b>' + esc(i.sku) + '</b> <span class="muted">' + esc(i.name) + '</span></div>' +
    '<div class="muted">Sent ' + qty(i.sent) + (i.rec + i.dam + i.mis ? ' · already counted ' + qty(i.rec + i.dam + i.mis) : '') + ' · <b>expecting ' + qty(i.outstanding) + '</b></div></div>' +
    '<div class="tf-rcv-inputs"><label>Received<input type="number" inputmode="numeric" min="0" max="' + i.outstanding + '" step="1" data-k="r" value="' + i.outstanding + '"></label>' +
    '<label>Damaged<input type="number" inputmode="numeric" min="0" max="' + i.outstanding + '" step="1" data-k="d" value="0"></label>' +
    '<label>Missing<input type="number" inputmode="numeric" min="0" max="' + i.outstanding + '" step="1" data-k="m" value="0"></label></div>' +
    '<div class="field tf-rcv-note" hidden><label>What happened? *</label><input type="text" data-k="note" maxlength="200" placeholder="e.g. box was crushed, one piece not in the bag"></div>' +
    '<div class="tf-rcv-state muted"></div></div>').join('');
  panel(t, 'Receive Transfer',
    '<p class="muted">Count what actually arrived. Good pieces are added to <b>' + esc(t._to) + '</b> stock now. Damaged and missing pieces are <b>not</b> added — they are recorded as open discrepancies for a manager to resolve. Nothing is balanced for you silently.</p>' +
    '<p><button type="button" class="btn small secondary" id="tf-rc-all">Everything arrived in good condition</button></p>' + cards +
    '<div id="tf-rc-sum" class="lv-preview"></div>' +
    '<div id="tf-rc-finalwrap" class="tf-finalwrap" hidden><label class="lv-check"><input type="checkbox" id="tf-rc-final"> <span id="tf-rc-finaltext"></span></label></div>' +
    field('Receiving notes', '<textarea id="tf-rc-notes" rows="2" maxlength="500" placeholder="Anything about this delivery (optional)"></textarea>') +
    field('Photo of the delivery <span class="muted">(optional — JPG, PNG or PDF, up to 10 MB)</span>', '<input type="file" id="tf-rc-file" accept="' + ACCEPT + '" multiple>'),
    '<button type="button" class="btn" id="tf-rc-ok">Confirm Receiving</button><button type="button" class="btn secondary" id="tf-rc-x">Cancel</button>');
  const root = drawerBody('side');
  const read = () => lines.map((i) => { const c = root.querySelector('.tf-rcv[data-item="' + i.id + '"]'); const g = (k) => c.querySelector('[data-k="' + k + '"]');
    return { i, c, r: whole(g('r').value), d: whole(g('d').value), m: whole(g('m').value), note: g('note').value.trim() }; });
  const recalc = () => {
    let good = 0, counted = 0, expected = 0, bad = false, miss = false, issues = 0;
    read().forEach(({ i, c, r, d, m, note }) => {
      const ok = [r, d, m].every(Number.isInteger) && r + d + m <= i.outstanding;
      const st = c.querySelector('.tf-rcv-state'), nf = c.querySelector('.tf-rcv-note');
      expected += i.outstanding;
      if (!ok) { bad = true; st.innerHTML = '<span class="lv-neg">' + (Number.isInteger(r + d + m) && r + d + m > i.outstanding ? 'That is more than the ' + qty(i.outstanding) + ' still expected.' : 'Enter whole numbers, 0 or more.') + '</span>'; nf.hidden = true; c.classList.remove('tf-rcv-issue'); return; }
      counted += r + d + m; good += r;
      const problem = d > 0 || m > 0; if (problem) issues++;
      nf.hidden = !problem; c.classList.toggle('tf-rcv-issue', problem);
      const dst = stockOf(ctx, i.sku, t.to_branch_id), left = i.outstanding - r - d - m;
      st.innerHTML = (r === i.outstanding ? '<b class="lv-pos">✓ All ' + qty(r) + ' arrived</b>' : [r ? qty(r) + ' good' : '', d ? '<b class="lv-neg">' + qty(d) + ' damaged</b>' : '', m ? '<b class="lv-neg">' + qty(m) + ' missing</b>' : '', left ? qty(left) + ' not yet counted' : ''].filter(Boolean).join(' · ')) +
        ' · stock at ' + esc(t._to) + ': ' + beforeAfter(dst, dst + r, false);
      if (problem && note.length < 3) miss = true;
    });
    const partial = !bad && counted < expected;
    $('tf-rc-finalwrap').hidden = !partial;
    if (partial) $('tf-rc-finaltext').textContent = 'This is the last delivery — record the ' + qty(expected - counted) + ' pc(s) that did not arrive as missing (otherwise the transfer stays Partially Received and the rest is still expected).';
    $('tf-rc-sum').innerHTML = bad ? '' : 'Adding <b>' + pcs(good) + '</b> to ' + esc(t._to) + ' stock' + (issues ? ' · <b class="lv-neg">' + issues + ' line' + (issues === 1 ? '' : 's') + ' with a discrepancy</b>' : '') +
      (partial ? ($('tf-rc-final').checked ? ' · <b class="lv-neg">' + qty(expected - counted) + ' pc(s) will be recorded as missing</b>' : ' · ' + qty(expected - counted) + ' pc(s) still expected later') : '');
    return { bad, miss, good, counted, partial };
  };
  root.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', recalc));
  $('tf-rc-final').addEventListener('change', recalc);
  $('tf-rc-all').addEventListener('click', () => { lines.forEach((i) => { const c = root.querySelector('.tf-rcv[data-item="' + i.id + '"]'); c.querySelector('[data-k="r"]').value = i.outstanding; c.querySelector('[data-k="d"]').value = 0; c.querySelector('[data-k="m"]').value = 0; }); recalc(); });
  recalc();
  $('tf-rc-x').addEventListener('click', () => closeDrawer('side'));
  $('tf-rc-ok').addEventListener('click', async () => {
    const r = recalc(), btn = $('tf-rc-ok'); errBox('');
    if (r.bad) return errBox('Check the counts: whole numbers, and never more than what is still expected on a line.');
    if (!r.counted) return errBox('Enter what arrived (received, damaged or missing) before confirming.');
    if (r.miss) { const first = [...root.querySelectorAll('.tf-rcv-issue input[data-k="note"]')].find((x) => x.value.trim().length < 3); if (first) flagInvalid(first); return errBox('Explain what happened on every line with damaged or missing pieces.'); }
    const files = [...$('tf-rc-file').files], badFile = files.map(fileProblem).find(Boolean);
    if (badFile) { flagInvalid($('tf-rc-file')); return errBox(esc(badFile)); }
    const list = read(), anyDamage = list.some((x) => x.d > 0);
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const res = must(await ctx.api.receiveTransfer(t.id, { request_key: key, items: list.map((x) => ({ item_id: x.i.id, received_qty: x.r, damaged_qty: x.d, missing_qty: x.m, notes: x.note || null })),
        notes: val('tf-rc-notes').trim(), final: r.partial && $('tf-rc-final').checked }));
      let note = '';
      if (!res.duplicate && files.length) {
        for (const f of files) { try { const up = await ctx.api.uploadFile(t.id, f, anyDamage ? 'Damage Photo' : 'Receiving Photo', null); if (up && up.ok === false) note = ' A file could not be attached: ' + errorsText(up); } catch (err) { note = ' A file could not be attached: ' + friendly(err); } }
      }
      closeDrawer('side');
      ctx.toast(res.duplicate ? 'This receiving was already saved — nothing was added twice.' : t.transfer_number + ': ' + pcs(res.received) + ' added to ' + t._to + (res.discrepancies ? ' · ' + res.discrepancies + ' discrepanc' + (res.discrepancies === 1 ? 'y' : 'ies') + ' recorded' : '') +
        (res.status === 'Received' ? ' · transfer complete.' : ' · ' + qty(res.remaining) + ' pc(s) still expected.') + note, !!note);
      await afterChange(ctx, t.id);
    } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; btn.textContent = 'Confirm Receiving'; }
  });
}

// ================================================================ revise an approved quantity (goes back for approval)
export function openRevise(ctx, id) {
  const t = ctx.byId.get(id);
  if (!t) return gone(ctx);
  if (!ctx.caps.canRevise(t)) { ctx.toast('Only an Admin or Manager can revise a transfer, and only while it is Approved or Preparing.', true); return; }
  const rows = t._items.map((i) => '<tr data-item="' + i.id + '"><td data-label="Item">' + itemCell(i) + '</td><td data-label="Approved now"><b>' + qty(i.appr ?? i.req) + '</b></td>' +
    '<td data-label="New quantity"><input type="number" class="tf-qty" min="0" max="' + i.req + '" step="1" inputmode="numeric" data-k="q" value="' + (i.appr ?? i.req) + '"></td></tr>').join('');
  panel(t, 'Revise Approved Quantity',
    '<div class="msg lv-warn"><b>A revision sends the transfer back to Requested.</b> Someone other than you has to approve it again before it can be released. Every old and new quantity is kept in the history. No stock moves.</div>' +
    table(['Item', 'Approved now', 'New quantity'], rows) + field('Why is it being revised? *', '<textarea id="tf-rv-reason" rows="2" maxlength="500"></textarea>'),
    '<button type="button" class="btn" id="tf-rv-ok">Revise &amp; Send Back</button><button type="button" class="btn secondary" id="tf-rv-x">Cancel</button>');
  const root = drawerBody('side');
  $('tf-rv-x').addEventListener('click', () => closeDrawer('side'));
  $('tf-rv-ok').addEventListener('click', async () => {
    errBox('');
    const list = t._items.map((i) => ({ i, q: whole(root.querySelector('tr[data-item="' + i.id + '"] [data-k="q"]').value) }));
    if (list.some((x) => !Number.isInteger(x.q) || x.q > x.i.req)) return errBox('Enter a whole number from 0 up to the requested quantity on every line.');
    if (!list.some((x) => x.q > 0)) return errBox('A revision must leave at least one item — cancel the transfer instead.');
    if (!list.some((x) => x.q !== (x.i.appr ?? x.i.req))) return errBox('Nothing was changed.');
    const reason = val('tf-rv-reason').trim();
    if (reason.length < 3) { flagInvalid($('tf-rv-reason')); return errBox('Say why the quantity is being revised.'); }
    const btn = $('tf-rv-ok'); btn.disabled = true;
    try {
      must(await ctx.api.reviseTransfer(t.id, { items: list.map((x) => ({ item_id: x.i.id, approved_qty: x.q })), reason }));
      closeDrawer('side'); ctx.toast(t.transfer_number + ' revised and sent back for approval.'); await afterChange(ctx, t.id);
    } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; }
  });
}

// ================================================================ a note
export function openNote(ctx, id) {
  const t = ctx.byId.get(id);
  if (!t) return gone(ctx);
  panel(t, 'Add a Note',
    (ctx.caps.mgr ? field('Who can see it?', '<select id="tf-nt-type"><option value="0">Everyone involved in this transfer</option><option value="1">Internal — Admins and Managers only</option></select>') : '') +
    field('Note *', '<textarea id="tf-nt-text" rows="4" maxlength="2000" placeholder="Write the note…"></textarea>'),
    '<button type="button" class="btn" id="tf-nt-ok">Add Note</button><button type="button" class="btn secondary" id="tf-nt-x">Cancel</button>');
  $('tf-nt-x').addEventListener('click', () => closeDrawer('side'));
  $('tf-nt-ok').addEventListener('click', async () => {
    const text = val('tf-nt-text').trim(); errBox('');
    if (!text) { flagInvalid($('tf-nt-text')); return errBox('Write the note first.'); }
    const btn = $('tf-nt-ok'); btn.disabled = true;
    try { must(await ctx.api.addComment(t.id, text, val('tf-nt-type') === '1')); closeDrawer('side'); ctx.toast('Note added.'); await afterChange(ctx, t.id); } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; }
  });
  $('tf-nt-text').focus();
}

// ================================================================ attach a file
export function openUpload(ctx, id, opts = {}) {
  const t = ctx.byId.get(id);
  if (!t) return gone(ctx);
  if (!ctx.caps.canAttach(t)) { ctx.toast('You can only attach files to transfers your branch is part of.', true); return; }
  const kinds = opts.kind ? [opts.kind, ...FILE_KINDS.filter((k) => k !== opts.kind)] : FILE_KINDS;
  panel(t, 'Attach a File',
    '<div class="bl-formgrid">' + field('What is this file?', '<select id="tf-up-kind">' + kinds.map((k) => '<option>' + esc(k) + '</option>').join('') + '</select>') +
    (t._openDiscs.length ? field('About a discrepancy? <span class="muted">(optional)</span>', '<select id="tf-up-disc"><option value="">Not about a discrepancy</option>' + t._openDiscs.map((d) => '<option value="' + d.id + '"' + (opts.discrepancy === d.id ? ' selected' : '') + '>' + esc(d.type) + ' · ' + qty(d.quantity) + ' pc(s)</option>').join('') + '</select>') : '') + '</div>' +
    field('File *', '<input type="file" id="tf-up-file" accept="' + ACCEPT + '"><span class="muted">JPG, JPEG, PNG or PDF, up to 10 MB. Files can be removed from the transfer, never silently deleted from the history.</span>'),
    '<button type="button" class="btn" id="tf-up-ok">Upload</button><button type="button" class="btn secondary" id="tf-up-x">Cancel</button>');
  $('tf-up-x').addEventListener('click', () => closeDrawer('side'));
  $('tf-up-ok').addEventListener('click', async () => {
    const file = $('tf-up-file').files[0]; errBox('');
    if (!file) { flagInvalid($('tf-up-file')); return errBox('Choose a file first.'); }
    const problem = fileProblem(file); if (problem) return errBox(esc(problem));
    const btn = $('tf-up-ok'); btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      const res = await ctx.api.uploadFile(t.id, file, val('tf-up-kind'), $('tf-up-disc') && val('tf-up-disc') ? Number(val('tf-up-disc')) : null);
      must(res); closeDrawer('side'); ctx.toast('File attached.'); await afterChange(ctx, t.id);
    } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; btn.textContent = 'Upload'; }
  });
}
