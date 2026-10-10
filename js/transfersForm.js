// Transfers -- the new / edit transfer drawer (also used to start a return transfer). The route is chosen first; then SKUs are
// searched from the SKU Catalog (this screen only reads it -- there is no second catalog) and each line shows the live stock at the
// source and destination, what the stock will be before and after, and warnings: not enough stock at the source (blocked, unless an
// Admin / Manager overrides with a written reason), a low-stock warning, and a destination that already holds plenty.
// Nothing here moves stock: a request only asks. The database re-checks everything when it is saved.
import { esc, qty, pcs, openDrawer, closeDrawer, drawerBody, actionPanel, friendly, errorsText, branchBadge } from './transfersUi.js?v=20261011b';
import { stockOf, previewLine, REASONS, PRIORITIES } from './transfersLogic.js?v=20261011b';
import { flagInvalid } from './uiKit.js?v=20261011b';

const $ = (id) => document.getElementById(id);
const val = (id) => { const el = $(id); return el ? el.value : ''; };
const field = (label, inner, extra) => '<div class="field"' + (extra && extra.id ? ' id="' + extra.id + '"' : '') + (extra && extra.hidden ? ' hidden' : '') + '><label>' + label + '</label>' + inner + '</div>';
let S = null; // { id, t, returnOf, lines:[{sku,name,category,qty,max}], info:{sku:{pending_out,incoming}}, snapshot, snap }

const branchOptions = (ctx, selected, placeholder) => '<option value="">' + placeholder + '</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (String(b.id) === String(selected) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
const nameOf = (ctx, id) => (ctx.branchById[id] || {}).name || 'branch ' + id;
const chips = (ctx, sku) => ctx.branches.map((b) => '<span class="tf-chip' + (stockOf(ctx, sku, b.id) > 0 ? '' : ' tf-chip-zero') + '">' + esc(b.name) + ' <b>' + qty(stockOf(ctx, sku, b.id)) + '</b></span>').join('');

export function requestCloseForm() {
  if (!S) { closeDrawer('form'); return; }
  if (S.snap() === S.snapshot) { S = null; closeDrawer('form'); return; }
  actionPanel('form', { title: 'Discard your changes?', message: 'What you entered has not been saved.', okLabel: 'Discard', danger: true, onOk: () => { S = null; closeDrawer('form'); } });
}

export function openTransferForm(ctx, opts = {}) {
  const t = opts.id ? ctx.byId.get(opts.id) : null;
  const orig = opts.returnOf ? ctx.byId.get(opts.returnOf) : null;
  if (opts.id && !t) { ctx.toast('That transfer is no longer available.', true); return; }
  if (t && !ctx.caps.canEdit(t)) { ctx.toast('A transfer can be edited only while it is a Draft (by its requester or a manager) or Requested (by an Admin). After approval, use Revise.', true); return; }
  if (opts.returnOf && (!orig || !ctx.caps.canReturn(orig))) { ctx.toast('A return transfer can only be started for pieces that have actually been received, by someone whose branch is involved.', true); return; }
  const e = ctx.employee || {};
  const isReturn = !!orig, routeLocked = !!(t && t.status !== 'Draft') || isReturn;
  const fromInit = t ? t.from_branch_id : isReturn ? orig.to_branch_id : (e.branch_id && e.role !== 'Admin' && e.role !== 'Manager' ? e.branch_id : '');
  const toInit = t ? t.to_branch_id : isReturn ? orig.from_branch_id : '';
  const knownReason = t && REASONS.includes(t.reason);
  S = { id: t ? t.id : null, t, returnOf: orig ? orig.id : null, info: {}, lines: t ? t._items.map((i) => ({ sku: i.sku, name: i.name, category: i.category, qty: i.req })) :
    isReturn ? orig._items.filter((i) => i.rec > 0).map((i) => ({ sku: i.sku, name: i.name, category: i.category, qty: i.rec, max: i.rec })) : [] };
  S.lines.forEach((l) => { if (!ctx.products[l.sku]) ctx.products[l.sku] = { item_name: l.name, category: l.category, reorder_level: null }; });
  const title = t ? 'Edit Transfer' : isReturn ? 'New Return Transfer' : 'New Transfer';
  openDrawer('form', {
    title, sub: t ? t.transfer_number + ' · ' + t.status : isReturn ? 'Sending pieces back from ' + orig._to + ' to ' + orig._from + ' · return of ' + orig.transfer_number : 'Choose the route, then add the SKUs to move.',
    body: '<div id="tf-form-msg"></div><div id="tf-fm-errors"></div>' +
      (isReturn ? '<div class="msg lv-warn">This is a return of <b>' + esc(orig.transfer_number) + '</b>. Only pieces that were actually received can be sent back. It follows the normal approval, release and receiving steps — no stock moves until it is released.</div>' : '') +
      (t && t.status === 'Requested' ? '<div class="msg lv-warn">This transfer is already Requested. The route cannot change; quantities and notes can. Editing a requested transfer is recorded in the history.</div>' : '') +
      '<div class="drawer-section"><h4>Route</h4><div class="bl-formgrid">' +
        field('From (source branch) *', '<select id="tf-fm-from"' + (routeLocked ? ' disabled' : '') + '>' + branchOptions(ctx, fromInit, 'Choose the source…') + '</select>') +
        field('To (destination branch) *', '<select id="tf-fm-to"' + (routeLocked ? ' disabled' : '') + '>' + branchOptions(ctx, toInit, 'Choose the destination…') + '</select>') +
        field('Requested by', '<input type="text" id="tf-fm-by" readonly value="' + esc((t && t._requester) || ctx.names[e.id] || e.full_name || '') + '">') +
        field('Priority', '<select id="tf-fm-priority">' + PRIORITIES.map((p) => '<option' + (p === (t ? t.priority : 'Normal') ? ' selected' : '') + '>' + p + '</option>').join('') + '</select>') +
        field('Expected transfer date', '<input type="date" id="tf-fm-date" min="' + esc(ctx.today) + '" value="' + esc((t && t.expected_date) || '') + '">') +
        (isReturn ? field('Reason', '<input type="text" id="tf-fm-reason" maxlength="200" value="Return of ' + esc(orig.transfer_number) + '">') :
          field('Reason', '<select id="tf-fm-reason"><option value="">Choose a reason…</option>' + REASONS.map((r) => '<option' + (knownReason && r === t.reason ? ' selected' : (!knownReason && t && t.reason && r === 'Other' ? ' selected' : '')) + '>' + esc(r) + '</option>').join('') + '</select>')) +
        (isReturn ? '' : field('Tell us more', '<input type="text" id="tf-fm-reasonother" maxlength="200" value="' + esc(t && t.reason && !knownReason ? t.reason : '') + '">', { id: 'tf-fm-other-wrap', hidden: !(t && t.reason && !knownReason) })) +
      '</div><div id="tf-fm-route" class="tf-routehint"></div></div>' +
      '<div class="drawer-section"><h4>Items to transfer</h4>' +
        (isReturn ? '<p class="muted">Only the pieces that were received can be returned. Lower a quantity or remove a line you are not returning.</p>' :
          '<div class="field tf-search"><input type="search" id="tf-fm-sku" autocomplete="off" placeholder="Search the SKU Catalog by SKU or item name…" aria-label="Search SKU"><div id="tf-fm-results" class="tf-results" hidden></div></div>') +
        '<div id="tf-fm-lines"></div><div id="tf-fm-sum" class="lv-preview"></div>' +
        '<div id="tf-fm-over" class="msg lv-warn" hidden><b>Not enough stock at the source for some lines.</b> As an Admin or Manager you can still request it with a written reason, which is kept in the history. The pieces cannot be released unless the stock is there at release time.' +
          '<label class="lv-check"><input type="checkbox" id="tf-fm-overtick"> Request anyway (stock override)</label>' + field('Reason for the override *', '<textarea id="tf-fm-overreason" rows="2" maxlength="300"></textarea>') + '</div></div>' +
      '<div class="drawer-section"><h4>Notes</h4>' + field('Notes', '<textarea id="tf-fm-notes" rows="3" maxlength="1000" placeholder="Anything the approver or the receiving branch should know">' + esc((t && t.notes) || '') + '</textarea>') + '</div>',
    footer: (t && t.status === 'Requested' ? '<button type="button" class="btn" id="tf-fm-save">Save Changes</button>' :
      '<button type="button" class="btn" id="tf-fm-submit">' + (t ? 'Submit Request' : 'Submit Request') + '</button><button type="button" class="btn secondary" id="tf-fm-draft">' + (t ? 'Save Draft' : 'Save as Draft') + '</button>') +
      '<button type="button" class="btn secondary" id="tf-fm-cancel">Cancel</button>',
  });

  const route = () => ({ from: Number(val('tf-fm-from')) || null, to: Number(val('tf-fm-to')) || null });

  // ---- live stock info for the chosen SKUs (promised to other transfers / already on the way) ----
  let infoTimer = null;
  const loadInfo = () => {
    clearTimeout(infoTimer);
    infoTimer = setTimeout(async () => {
      if (!S || !$('tf-fm-lines')) return; // the form was closed in the meantime
      const { from, to } = route();
      if (!from || !to || !S.lines.length) return;
      try {
        const rows = await ctx.api.stockCheck(from, to, S.lines.map((l) => l.sku));
        if (!S) return;
        (rows || []).forEach((r) => { S.info[r.sku] = { pending_out: Number(r.pending_out || 0), incoming: Number(r.incoming || 0) }; if (!ctx.products[r.sku] || ctx.products[r.sku].reorder_level === null) ctx.products[r.sku] = { ...(ctx.products[r.sku] || {}), item_name: r.item_name, category: r.category, reorder_level: r.reorder_level }; });
        if ($('tf-fm-lines')) preview();
      } catch (err) { /* the numbers on screen still come from the live stock; this is only extra information */ }
    }, 250);
  };

  // ---- the lines ----
  const drawLines = () => {
    const { from, to } = route();
    if (!S.lines.length) { $('tf-fm-lines').innerHTML = '<p class="muted">' + (isReturn ? 'No lines left to return.' : 'No items yet — search for a SKU above and click it to add it.') + '</p>'; preview(); return; }
    $('tf-fm-lines').innerHTML = '<div class="table-scroll table-2col"><table class="lv-mini tf-worktable"><thead><tr><th>Item</th><th>Stock by branch</th><th>Quantity</th><th>Stock before → after</th><th></th></tr></thead><tbody>' +
      S.lines.map((l, i) => '<tr data-i="' + i + '"><td data-label="Item"><b>' + esc(l.sku) + '</b><div class="muted bl-sub">' + esc(l.name) + (l.category ? ' · ' + esc(l.category) : '') + '</div></td>' +
        '<td data-label="Stock by branch" class="full-row"><div class="tf-chips">' + chips(ctx, l.sku) + '</div><div class="muted bl-sub" data-k="info"></div></td>' +
        '<td data-label="Quantity"><input type="number" class="tf-qty" min="1"' + (l.max ? ' max="' + l.max + '"' : '') + ' step="1" inputmode="numeric" data-k="q" value="' + l.qty + '" aria-label="Quantity of ' + esc(l.sku) + '"></td>' +
        '<td data-label="Before → after" class="full-row"><div data-k="pv"></div><div data-k="fl" class="tf-flags"></div></td>' +
        '<td data-label="" class="full-row"><button type="button" class="btn small secondary" data-rm="' + i + '">Remove</button></td></tr>').join('') + '</tbody></table></div>';
    $('tf-fm-lines').querySelectorAll('[data-k="q"]').forEach((el) => el.addEventListener('input', () => { if (!S) return; const i = Number(el.closest('tr').dataset.i); const n = Number(el.value); S.lines[i].qty = Number.isFinite(n) ? n : 0; preview(); }));
    $('tf-fm-lines').querySelectorAll('[data-rm]').forEach((el) => el.addEventListener('click', () => { if (!S) return; S.lines.splice(Number(el.dataset.rm), 1); drawLines(); }));
    preview();
  };
  const preview = () => {
    const { from, to } = route();
    let short = false, total = 0, skus = 0, bad = false;
    S.lines.forEach((l, i) => {
      const tr = $('tf-fm-lines').querySelector('tr[data-i="' + i + '"]');
      if (!tr) return;
      const ok = Number.isInteger(l.qty) && l.qty >= 1;
      if (!ok) bad = true; else { total += l.qty; skus++; }
      if (!from || !to) { tr.querySelector('[data-k="pv"]').innerHTML = '<span class="muted">Choose the route to see the stock before and after.</span>'; tr.querySelector('[data-k="fl"]').innerHTML = ''; return; }
      const pv = previewLine(ctx, l.sku, from, to, ok ? l.qty : 0);
      if (ok && pv.insufficient) short = true;
      tr.querySelector('[data-k="pv"]').innerHTML = esc(nameOf(ctx, from)) + ': <span class="' + (pv.insufficient ? 'lv-neg' : '') + '">' + qty(pv.src) + ' → <b>' + qty(pv.srcAfter) + '</b></span><br>' + esc(nameOf(ctx, to)) + ': ' + qty(pv.dst) + ' → <b>' + qty(pv.dstAfter) + '</b>';
      tr.querySelector('[data-k="fl"]').innerHTML = (!ok ? '<span class="tf-flag tf-flag-red">Enter a whole number, 1 or more</span>' : '') +
        (ok && pv.insufficient ? '<span class="tf-flag tf-flag-red">INSUFFICIENT STOCK — only ' + qty(pv.src) + ' at ' + esc(nameOf(ctx, from)) + '</span>' : '') +
        (ok && pv.low ? '<span class="tf-flag tf-flag-amber">Low stock after this: ' + esc(nameOf(ctx, from)) + ' would be left with ' + qty(pv.srcAfter) + ' (reorder level ' + qty(pv.reorder) + ')</span>' : '') +
        (pv.highDest ? '<span class="tf-flag tf-flag-blue">' + esc(nameOf(ctx, to)) + ' already holds ' + qty(pv.dst) + ' pcs</span>' : '') +
        (l.max && ok && l.qty > l.max ? '<span class="tf-flag tf-flag-red">Only ' + qty(l.max) + ' were received</span>' : '');
      const inf = S.info[l.sku];
      tr.querySelector('[data-k="info"]').textContent = inf ? [inf.pending_out ? qty(inf.pending_out) + ' already approved to leave ' + nameOf(ctx, from) + ' on other transfers' : '', inf.incoming ? qty(inf.incoming) + ' already on the way to ' + nameOf(ctx, to) : ''].filter(Boolean).join(' · ') : '';
    });
    const over = $('tf-fm-over');
    over.hidden = !(short && ctx.caps.mgr) && over.dataset.forced !== '1';
    $('tf-fm-sum').innerHTML = S.lines.length ? (bad ? '' : '<b>' + skus + ' SKU' + (skus === 1 ? '' : 's') + ' · ' + pcs(total) + '</b>' + (short ? ' <span class="lv-neg">— some lines are more than the source branch has in stock' + (ctx.caps.mgr ? '' : '; ask a manager if this is intended') + '</span>' : '')) : '';
    const rt = $('tf-fm-route');
    if (rt) rt.innerHTML = from && to ? (from === to ? '<span class="lv-neg">The source and destination must be different branches.</span>' : branchBadge(esc, nameOf(ctx, from), from, ctx.branches) + ' <span class="tf-arrow">→</span> ' + branchBadge(esc, nameOf(ctx, to), to, ctx.branches) +
      (ctx.caps.canRequest(from, to) ? '' : ' <span class="lv-neg">You can only request transfers that involve your own branch.</span>')) : '';
  };

  // ---- searching the SKU Catalog ----
  let searchTimer = null, searchSeq = 0;
  const addSku = (p) => {
    const ex = S.lines.find((l) => l.sku === p.sku);
    if (ex) ex.qty += 1; else { S.lines.push({ sku: p.sku, name: p.item_name, category: p.category, qty: 1 }); ctx.products[p.sku] = { ...(ctx.products[p.sku] || {}), item_name: p.item_name, category: p.category, reorder_level: p.reorder_level }; }
    $('tf-fm-sku').value = ''; $('tf-fm-results').hidden = true; drawLines(); loadInfo();
  };
  if (!isReturn) {
    const box = $('tf-fm-sku'), res = $('tf-fm-results');
    let found = [];
    const show = (rows, msg) => {
      found = rows;
      const { from, to } = route();
      res.hidden = false;
      res.innerHTML = msg ? '<div class="muted tf-result-msg">' + esc(msg) + '</div>' : rows.map((p, i) => '<button type="button" class="tf-result" data-i="' + i + '"><div><b>' + esc(p.sku) + '</b> ' + esc(p.item_name) + '<div class="muted bl-sub">' + esc(p.category || '') + (p.product_status && p.product_status !== 'Active' ? ' · ' + esc(p.product_status) : '') + '</div></div>' +
        '<div class="tf-chips">' + (from ? '<span class="tf-chip' + (stockOf(ctx, p.sku, from) > 0 ? '' : ' tf-chip-zero') + '">' + esc(nameOf(ctx, from)) + ' <b>' + qty(stockOf(ctx, p.sku, from)) + '</b></span>' : '') + (to ? '<span class="tf-chip">' + esc(nameOf(ctx, to)) + ' <b>' + qty(stockOf(ctx, p.sku, to)) + '</b></span>' : '') +
        '<span class="tf-chip tf-chip-total">All branches <b>' + qty(ctx.branches.reduce((s, b) => s + stockOf(ctx, p.sku, b.id), 0)) + '</b></span></div></button>').join('');
      res.querySelectorAll('.tf-result').forEach((b) => b.addEventListener('click', () => addSku(found[Number(b.dataset.i)])));
    };
    box.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const text = box.value.trim();
      if (text.length < 2) { res.hidden = true; return; }
      searchTimer = setTimeout(async () => {
        const my = ++searchSeq;
        try { const rows = await ctx.api.searchProducts(text); if (my === searchSeq) show(rows, rows.length ? '' : 'No SKU matches “' + text + '”.'); } catch (err) { if (my === searchSeq) show([], friendly(err)); }
      }, 250);
    });
    box.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); if (found.length === 1 && !res.hidden) addSku(found[0]); } else if (ev.key === 'Escape') res.hidden = true; });
  }

  // ---- route, reason ----
  ['tf-fm-from', 'tf-fm-to'].forEach((id) => $(id).addEventListener('change', () => { drawLines(); loadInfo(); }));
  if ($('tf-fm-reason') && !isReturn) $('tf-fm-reason').addEventListener('change', () => { $('tf-fm-other-wrap').hidden = $('tf-fm-reason').value !== 'Other'; if ($('tf-fm-reason').value === 'Other') $('tf-fm-reasonother').focus(); });
  drawLines(); loadInfo();

  const snapshot = () => JSON.stringify([...document.querySelectorAll('#tf-form-body input, #tf-form-body select, #tf-form-body textarea')].map((el) => el.type === 'checkbox' ? el.checked : el.value).concat(S ? S.lines.map((l) => l.sku + ':' + l.qty) : []));
  S.snapshot = snapshot(); S.snap = snapshot;

  // ---- reading, checking and sending ----
  const errBox = (html) => { $('tf-fm-errors').innerHTML = html ? '<div class="msg error">' + html + '</div>' : ''; if (html) drawerBody('form').scrollTop = 0; };
  const check = () => {
    const { from, to } = route(), bad = [];
    if (!from) bad.push(['tf-fm-from', 'Choose the source branch.']);
    if (!to) bad.push(['tf-fm-to', 'Choose the destination branch.']);
    if (from && to && from === to) bad.push(['tf-fm-to', 'The source and destination must be different branches.']);
    if (from && to && from !== to && !ctx.caps.canRequest(from, to)) bad.push(['tf-fm-from', 'You can only request transfers that involve your own branch.']);
    if (!S.lines.length) bad.push([isReturn ? 'tf-fm-lines' : 'tf-fm-sku', 'Add at least one SKU to transfer.']);
    if (S.lines.some((l) => !Number.isInteger(l.qty) || l.qty < 1)) bad.push(['tf-fm-lines', 'Every quantity must be a whole number, 1 or more.']);
    if (S.lines.some((l) => l.max && l.qty > l.max)) bad.push(['tf-fm-lines', 'You cannot return more than was received.']);
    if (val('tf-fm-date') && val('tf-fm-date') < ctx.today) bad.push(['tf-fm-date', 'The expected date cannot be in the past.']);
    if (!isReturn && val('tf-fm-reason') === 'Other' && !val('tf-fm-reasonother').trim()) bad.push(['tf-fm-reasonother', 'Say what the reason is.']);
    return bad;
  };
  const read = () => {
    const { from, to } = route();
    const reason = isReturn ? val('tf-fm-reason').trim() : val('tf-fm-reason') === 'Other' ? val('tf-fm-reasonother').trim() : val('tf-fm-reason');
    const p = { from_branch_id: from, to_branch_id: to, items: S.lines.map((l) => ({ sku: l.sku, qty: l.qty })), reason: reason || null, priority: val('tf-fm-priority'), expected_date: val('tf-fm-date') || null, notes: val('tf-fm-notes').trim() || null };
    if (S.returnOf) p.return_of = S.returnOf;
    if (!$('tf-fm-over').hidden && $('tf-fm-overtick').checked) { p.override = true; p.override_reason = val('tf-fm-overreason').trim(); }
    return p;
  };
  const finish = async (res, msg) => {
    S = null; closeDrawer('form'); ctx.toast(msg); await ctx.refresh();
    if (res && res.id && !(ctx.detailOpenId())) ctx.openDetail(res.id);
    else if (ctx.detailOpenId() && ctx.byId.has(ctx.detailOpenId())) ctx.openDetail(ctx.detailOpenId(), { keep: true });
  };
  const send = async (mode, extra) => {
    errBox(''); $('tf-form-msg').innerHTML = '';
    const bad = check();
    if (bad.length) { errBox(bad.map((x) => esc(x[1])).join('<br>')); const el = $(bad[0][0]); if (el) flagInvalid(el); return; }
    const p = { ...read(), ...(extra || {}) };
    if (p.override && (p.override_reason || '').length < 5) { flagInvalid($('tf-fm-overreason')); return errBox('Write the reason for the stock override.'); }
    const buttons = ['tf-fm-submit', 'tf-fm-draft', 'tf-fm-save'].map($).filter(Boolean);
    buttons.forEach((b) => { b.disabled = true; });
    try {
      let res;
      if (!t) res = await ctx.api.createTransfer({ ...p, draft: mode === 'draft' });
      else {
        res = await ctx.api.updateTransfer(t.id, p);
        if (res && res.ok !== false && mode === 'submit' && t.status === 'Draft') { res = await ctx.api.submitTransfer(t.id, p.override ? { override: true, override_reason: p.override_reason } : {}); if (res && res.ok !== false) res.id = t.id; }
        else if (res && res.ok !== false) res.id = t.id;
      }
      if (res && res.ok === false) {
        if (res.insufficient && ctx.caps.mgr && !(p.override)) {
          $('tf-fm-over').dataset.forced = '1'; $('tf-fm-over').hidden = false;
          actionPanel('form', { title: 'Not enough stock at the source', wide: true, message: esc(errorsText(res)) + ' As an Admin or Manager you can continue with a written reason, which is kept in the history.',
            fields: field('Reason *', '<textarea id="tf-fm-overreason2" rows="2" maxlength="300" placeholder="Why is this more than the source branch has?"></textarea>'), okLabel: 'Continue Anyway',
            onOk: async () => { const r = val('tf-fm-overreason2').trim(); if (r.length < 5) throw new Error('Write the reason for the override (a few words at least).'); await send(mode, { override: true, override_reason: r }); } });
        } else errBox((res.errors || ['Could not save.']).map((x) => '<div>' + esc(x) + '</div>').join('') + (res.insufficient && !ctx.caps.mgr ? '<div>Ask a manager if this transfer really is more than the source branch has in stock.</div>' : ''));
        buttons.forEach((b) => { b.disabled = false; });
        return;
      }
      await finish(res, t ? (mode === 'submit' && t.status === 'Draft' ? t.transfer_number + ' submitted for approval.' : mode === 'draft' ? t.transfer_number + ' draft saved.' : t.transfer_number + ' updated.') : res.transfer_number + (res.status === 'Draft' ? ' saved as a draft.' : ' requested — waiting for approval. No stock has moved.'));
    } catch (err) { errBox(esc(friendly(err))); buttons.forEach((b) => { if ($(b.id)) b.disabled = false; }); }
  };
  if ($('tf-fm-submit')) $('tf-fm-submit').addEventListener('click', () => send('submit'));
  if ($('tf-fm-draft')) $('tf-fm-draft').addEventListener('click', () => send('draft'));
  if ($('tf-fm-save')) $('tf-fm-save').addEventListener('click', () => send('save'));
  $('tf-fm-cancel').addEventListener('click', requestCloseForm);
  (isReturn ? $('tf-fm-notes') : (fromInit ? $('tf-fm-sku') : $('tf-fm-from'))).focus();
}
