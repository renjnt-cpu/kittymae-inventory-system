// Item Monitoring -- the review screens. One drawer shows a purchase request (everything the Final Approver needs to decide: who entered it, which SKUs, what is new, the stock before and after,
// the catalog beside what was typed, possible duplicates, proof, the discussion and the timeline); another shows a reversal request. The same drawers serve staff, who see their own request
// and its history. Buttons only appear for what the person may do -- the database refuses everything else (migrations 265-268).
import { esc, money, weight, num, plural, fmtDate, fmtDateTime, reqBadge, delBadge, itemBadge, newSkuBadge, FILE_TYPES, DELETE_REASONS, friendly } from './imFormat.js?v=20261030b';
import { materialOf } from './imData.js?v=20261030b';
import { banner, kv, openDrawer, closeDrawer, drawerBody, drawerFooter, actionPanel, clearActionPanel, filesHtml, wireFiles, showModal } from './imUi.js?v=20261030b';
import { showPostingResults } from './imForm.js?v=20261030b';

const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const safeName = (n) => String(n || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- shared blocks
function commentsHtml(comments, canWrite) {
  return '<div class="im-comments">' + (comments.length ? comments.map((c) =>
    '<div class="im-comment im-comment-' + (c.author_role === 'APPROVER' ? 'approver' : 'staff') + '"><div class="im-comment-head"><b>' + esc(c.author_name || '—') + '</b> <span class="badge lv-' + (c.author_role === 'APPROVER' ? 'orange' : 'gray') + '">' +
    (c.author_role === 'APPROVER' ? 'Final Approver' : 'Staff') + '</span> <span class="muted">' + fmtDateTime(c.created_at) + '</span></div><div class="lv-text">' + esc(c.body) + '</div></div>').join('') : '<p class="muted">No comments yet.</p>') + '</div>' +
    (canWrite ? '<div class="im-comment-new"><textarea id="im-cm-text" rows="2" placeholder="Write a comment…" maxlength="1000"></textarea><button type="button" class="btn small" id="im-cm-send">Post comment</button></div>' : '');
}
function timelineHtml(logs) {
  if (!logs.length) return '<p class="muted">Nothing recorded yet.</p>';
  return '<div class="lv-timeline">' + logs.map((l) => {
    const nv = l.new_value || {};
    const detail = l.action === 'Stock posted' || l.action === 'Posting finished with problems' ? ' (' + (nv.items_posted || 0) + ' of ' + (nv.items_total || 0) + ' items posted, ' + num(nv.pieces_posted || 0) + ' pcs)'
      : l.action === 'Submitted' || l.action === 'Resubmitted' ? ' (' + plural(nv.items || 0, 'item') + ', ' + num(nv.pieces || 0) + ' pcs)' : '';
    return '<div class="lv-tl-item"><div class="lv-tl-when">' + fmtDateTime(l.created_at) + '</div><div><b>' + esc(l.action) + '</b>' + esc(detail) + ' <span class="muted">— ' + esc(l.actor_name || 'System') + (l.actor_role ? ' (' + esc(l.actor_role) + ')' : '') + '</span>' +
      (l.reason ? '<div class="lv-text muted">' + esc(l.reason) + '</div>' : '') + '</div></div>';
  }).join('') + '</div>';
}
function uploadRowHtml() {
  return '<div class="lv-upload"><select id="im-up-type">' + FILE_TYPES.map((t) => '<option value="' + t[0] + '">' + esc(t[1]) + '</option>').join('') + '</select><input type="file" id="im-up-file" accept="image/*,.pdf" multiple>' +
    '<button type="button" class="btn small" id="im-up-go">Attach</button></div>';
}

function wireCommon(ctx, d, repaint) {
  const body = drawerBody();
  wireFiles(body, ctx.api, ctx.toast);
  const send = $('im-cm-send');
  if (send) send.addEventListener('click', async () => {
    const t = $('im-cm-text').value.trim(); if (!t) return;
    send.disabled = true;
    try { await ctx.api.commentAdd(d.requestId || null, d.deleteId || null, t); await repaint(); } catch (err) { ctx.toast(err, true); send.disabled = false; }
  });
  const go = $('im-up-go');
  if (go) go.addEventListener('click', async () => {
    const files = [...$('im-up-file').files]; if (!files.length) { ctx.toast('Choose a file first.', true); return; }
    go.disabled = true;
    try {
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) { ctx.toast(f.name + ' is bigger than 15 MB.', true); continue; }
        const path = (d.requestId ? 'R' + d.requestId : 'D' + d.deleteId) + '/' + uuid().slice(0, 8) + '-' + safeName(f.name);
        await ctx.api.uploadFile(path, f);
        await ctx.api.fileAdd(d.requestId || null, d.deleteId || null, $('im-up-type').value, f.name, path, f.type, f.size);
      }
      ctx.toast('File attached.', false); await repaint();
    } catch (err) { ctx.toast(err, true); go.disabled = false; }
  });
}

// ---------------------------------------------------------------- the purchase request
function itemCardHtml(it, r) {
  const cat = it.catalog;
  const isNew = it.is_new_sku;
  const cur = it.post_status === 'PENDING' || it.post_status === 'FAILED';
  const expected = Number(it.stock_branch || 0) + Number(it.request_qty_same_sku || 0);
  const mat = materialOf(it.category || (cat && cat.category), it.product_name || (cat && cat.item_name));
  const f = (l, v) => '<div class="im-f"><span>' + l + '</span><b>' + v + '</b></div>';
  const dups = (it.possible_duplicates || []);
  return '<div class="im-rv-card' + (isNew ? ' im-rv-new' : '') + (it.post_status === 'FAILED' ? ' im-rv-failed' : '') + '">' +
    '<div class="im-rv-head"><div><b>' + esc(it.sku) + '</b> <span class="muted">' + esc(it.product_name || (cat && cat.item_name) || '') + '</span></div><div class="im-badges">' +
      (isNew ? newSkuBadge(1) : '<span class="badge lv-green">EXISTING SKU</span>') + (dups.length ? '<span class="badge lv-red">POSSIBLE DUPLICATE SKU</span>' : '') + (it.post_status !== 'PENDING' ? itemBadge(it.post_status) : '') + '</div></div>' +
    '<div class="im-fgrid">' + f('Category', esc(it.category || (cat && cat.category) || '—')) + f('Material', esc(mat)) + f('Product line', esc((cat && cat.product_line) || '—')) + f('Metal purity', esc((cat && cat.metal_purity) || '—')) +
      f('Pcs', '<span class="im-big">' + num(it.qty) + '</span>') + f('Supplier price', money(it.sup_price)) + f('Pancake price', money(it.pancake_price)) + f('Grams (each)', weight(it.grams)) + f('Total grams', weight(it.total_grams)) +
      f('Factory / g', money(it.availed_factory_gram)) + f('Current / g', money(it.current_per_gram)) + f('Est. sales', money(it.est_sales)) + f('Purchased', money(it.purchased_amount)) + f('Profit', money(it.profit)) +
      (it.tag_note ? f('Tag / note', esc(it.tag_note)) : '') + '</div>' +
    (cur || it.post_status === 'POSTED' ? '<div class="im-stock"><div class="im-stock-title">STOCK IMPACT at ' + esc(r.branch_name) + '</div><div class="im-stock-row"><div><span>Current stock</span><b>' + num(it.stock_branch) + '</b>' + (it.reserved_branch ? '<small>' + num(it.reserved_branch) + ' reserved</small>' : '') + '</div>' +
      (cur ? '<div><span>This request</span><b class="im-pos">+' + num(it.request_qty_same_sku) + '</b>' + (it.other_pending_qty ? '<small>+' + num(it.other_pending_qty) + ' more in other pending requests</small>' : '') + '</div><div><span>Expected stock after approval</span><b>' + num(expected) + '</b></div>'
        : '<div><span>Posted</span><b class="im-pos">+' + num(it.qty) + '</b><small>purchase #' + esc(it.purchase_id) + '</small></div>') +
      '<div><span>Company stock</span><b>' + num(it.company_stock) + '</b>' + (it.company_reserved ? '<small>' + num(it.company_reserved) + ' reserved</small>' : '') + '</div></div>' +
      (cur ? '<div class="muted im-preview-note">Preview only — nothing is added until this is approved.</div>' : '') + '</div>' : '') +
    (cat ? '<div class="im-compare"><div class="im-cmp-title">EXISTING SKU — what the catalog has now, and what was submitted</div><table class="lv-mini"><thead><tr><th></th><th>Catalog now</th><th>Submitted</th></tr></thead><tbody>' +
      '<tr><td>Product</td><td>' + esc(cat.item_name || '—') + '</td><td>' + esc(it.product_name || '—') + '</td></tr>' +
      '<tr><td>Category</td><td>' + esc(cat.category || '—') + '</td><td>' + esc(it.category || '—') + '</td></tr>' +
      '<tr' + (cat.system_selling_price != null && it.pancake_price != null && Number(cat.system_selling_price) !== Number(it.pancake_price) ? ' class="im-diff"' : '') + '><td>Pancake price</td><td>' + money(cat.system_selling_price) + '</td><td>' + money(it.pancake_price) + '</td></tr>' +
      '<tr' + (cat.gross_weight_g != null && it.grams != null && Number(cat.gross_weight_g) !== Number(it.grams) ? ' class="im-diff"' : '') + '><td>Gross weight</td><td>' + weight(cat.gross_weight_g) + '</td><td>' + weight(it.grams) + '</td></tr>' +
      (cat.supplier_price !== undefined && cat.supplier_price !== null ? '<tr><td>Supplier price</td><td>' + money(cat.supplier_price) + '</td><td>' + money(it.sup_price) + '</td></tr>' : '') +
      '</tbody></table><div class="muted im-preview-note">The catalog is never overwritten by a purchase. Changing a price or weight there is done in the SKU Catalog.</div></div>' : '') +
    (isNew && cur ? '<div class="im-compare"><div class="im-cmp-title">NEW SKU — approving creates it in the SKU Catalog</div><div class="im-fgrid">' + f('SKU', esc(it.sku)) + f('Product name', esc(it.product_name || it.sku)) + f('Category', esc(it.category || '—')) + f('Pancake price', money(it.pancake_price)) + f('Supplier price', money(it.sup_price)) + f('Grams', weight(it.grams)) + f('Material', esc(mat)) + '</div></div>' : '') +
    (dups.length ? '<div class="im-dups"><b>Possible duplicates already in the catalog</b>' + dups.map((p) => '<div class="im-dup"><span><b>' + esc(p.sku) + '</b> — ' + esc(p.item_name || '') + (p.category ? ' · ' + esc(p.category) : '') + ' <span class="muted">(' + esc(p.reason) + ')</span></span><a class="btn small secondary" href="products.html?q=' + encodeURIComponent(p.sku) + '" target="_blank" rel="noopener">View SKU</a></div>').join('') + '</div>' : '') +
    ((it.warnings || []).filter((w) => !/^NEW SKU|^POSSIBLE DUPLICATE/.test(w)).length ? '<div class="im-item-warn">' + it.warnings.filter((w) => !/^NEW SKU|^POSSIBLE DUPLICATE/.test(w)).map((w) => '<div class="im-warn-line">⚠ ' + esc(w) + '</div>').join('') + '</div>' : '') +
    (it.post_error ? '<div class="im-fail">Could not be posted: ' + esc(it.post_error) + '</div>' : '') +
    '<div class="im-links"><a class="btn small secondary" href="products.html?q=' + encodeURIComponent(it.sku) + '" target="_blank" rel="noopener">View SKU</a>' +
      '<button type="button" class="btn small secondary" data-go-stock="' + esc(it.sku) + '">View branch stock</button><button type="button" class="btn small secondary" data-go-hist="' + esc(it.sku) + '">View purchase history</button>' +
      (it.post_status === 'POSTED' && r._canDelete ? '<button type="button" class="btn small secondary" data-req-delete="' + esc(it.purchase_id) + '">Request reversal</button>' : '') + '</div></div>';
}

export async function openRequestReview(ctx, id, opts) {
  const api = ctx.api;
  openDrawer({ title: 'Loading…', body: '<p class="muted">Loading…</p>' });
  let res;
  try { res = await api.requestGet(id); } catch (err) { closeDrawer(); ctx.toast(err, true); return; }
  const paint = async (keepPanel) => {
    if (keepPanel !== true) res = await api.requestGet(id);
    const r = res.request, t = res.totals || {}, can = res.can || {};
    r._canDelete = !!can.request_delete && ctx.who.canDelete(r.branch_id);
    const failedItems = (res.items || []).filter((i) => i.post_status === 'FAILED');
    const infoRows = [['Branch', esc(r.branch_name)], ['Submitted by', esc(r.submitted_by_name || r.created_by_name || '—')], ['Submitted', r.submitted_at ? fmtDateTime(r.submitted_at) : 'not submitted yet'],
      ['Date delivered', fmtDate(r.date_delivered)], ['Current per gram', r.current_per_gram != null ? money(r.current_per_gram) : '—'], ['Entered by', esc(r.created_by_name || '—') + ' · ' + fmtDateTime(r.created_at)]];
    if (r.reviewed_at) infoRows.push(['Opened by the Final Approver', esc(r.reviewed_by_name || '') + ' · ' + fmtDateTime(r.reviewed_at)]);
    if (r.final_approved_at) infoRows.push(['Approved', esc(r.final_approved_by_name || '') + ' · ' + fmtDateTime(r.final_approved_at)]);
    if (r.resubmit_count) infoRows.push(['Resubmitted', plural(r.resubmit_count, 'time')]);
    const sumGrid = [['SKUs', num(t.skus)], ['Pieces', num(t.pieces)], ['Total grams', t.grams ? weight(t.grams) : '—'], ['Total purchased', money(t.purchased)], ['Est. sales', money(t.est_sales)], ['Expected profit', money(t.profit)], ['New SKUs', num(t.new_skus)]]
      .map(([l, v]) => '<div class="im-sumcell"><span>' + l + '</span><b>' + v + '</b></div>').join('');
    let status = '';
    if (r.status === 'RETURNED FOR CORRECTION') status = banner('blue', '<b>Returned for correction</b> by ' + esc(r.returned_by_name || 'the Final Approver') + (r.returned_at ? ' · ' + fmtDateTime(r.returned_at) : '') + '<div class="lv-text">' + esc(r.return_for_correction_reason || '') + '</div>');
    else if (r.status === 'REJECTED') status = banner('red', '<b>Rejected</b> by ' + esc(r.rejected_by_name || 'the Final Approver') + (r.rejected_at ? ' · ' + fmtDateTime(r.rejected_at) : '') + '<div class="lv-text">' + esc(r.rejection_reason || '') + '</div><div class="muted">No stock was added.</div>');
    else if (r.status === 'CANCELLED') status = banner('gray', '<b>Cancelled</b>' + (r.cancel_reason ? ' — ' + esc(r.cancel_reason) : '') + '. No stock was added.');
    else if (r.status === 'PENDING FINAL APPROVAL') status = banner('amber', '<b>Waiting for the Final Approver.</b> No stock has been added yet.');
    else if (['APPROVED', 'PARTIALLY POSTED'].includes(r.status)) status = banner('amber', '<b>' + (r.status === 'APPROVED' ? 'Approved, but nothing could be posted.' : 'Partly posted.') + '</b> ' + plural(failedItems.length, 'item') + ' failed — see the reason on each item. The posted items are in stock; the failed ones changed nothing.');
    else if (r.status === 'POSTED') status = banner('green', '<b>Posted.</b> The stock was added' + (r.final_approved_at ? ' on ' + fmtDateTime(r.final_approved_at) : '') + '.');
    if (res.delete_requests && res.delete_requests.length) status += banner('gray', 'Reversal requests: ' + res.delete_requests.map((d) => '<button type="button" class="im-link" data-open-del="' + d.id + '">' + esc(d.request_number) + '</button> (' + esc(d.status.toLowerCase()) + ')').join(', '));

    const body = '<div id="im-act-slot"></div>' + status +
      '<div class="drawer-section"><h4>Request</h4>' + infoRows.map(([l, v]) => kv(l, v)).join('') + (r.notes ? kv('Note from the staff', '<span class="lv-text">' + esc(r.notes) + '</span>') : '') + '</div>' +
      '<div class="drawer-section"><h4>Summary</h4><div class="im-sumgrid">' + sumGrid + '</div></div>' +
      '<div class="drawer-section"><h4>Items — review each one (' + (res.items || []).length + ')</h4>' + (res.items || []).map((it) => itemCardHtml(it, r)).join('') + '</div>' +
      '<div class="drawer-section"><h4>Proof &amp; attachments</h4>' + filesHtml(res.files) + (can.attach ? uploadRowHtml() : '') + '</div>' +
      '<div class="drawer-section"><h4>Discussion — Final Approver and staff</h4>' + commentsHtml(res.comments || [], true) + '</div>' +
      '<div class="drawer-section"><h4>Timeline</h4>' + timelineHtml(res.logs || []) + '</div>';
    const foot = [];
    if (can.approve) foot.push('<button type="button" class="btn" id="im-do-approve">' + (r.status === 'PENDING FINAL APPROVAL' ? 'APPROVE &amp; POST' : 'RETRY POSTING') + '</button>');
    if (can.return) foot.push('<button type="button" class="btn secondary" id="im-do-return">RETURN FOR CORRECTION</button>');
    if (can.reject) foot.push('<button type="button" class="btn secondary lv-btn-danger" id="im-do-reject">REJECT</button>');
    if (can.discard_failed) foot.push('<button type="button" class="btn secondary" id="im-do-discard">Discard failed items</button>');
    if (can.edit) foot.push('<button type="button" class="btn" id="im-do-edit">' + (r.status === 'RETURNED FOR CORRECTION' ? 'Correct &amp; resubmit' : 'Edit') + '</button>');
    if (can.cancel && !can.approve) foot.push('<button type="button" class="btn secondary" id="im-do-cancel">Cancel request</button>');
    foot.push('<button type="button" class="btn secondary" id="im-do-close">Close</button>');
    openDrawer({ title: r.request_number, sub: reqBadge(r.status) + (t.new_skus ? ' ' + newSkuBadge(t.new_skus) : '') + ' <span class="muted">' + esc(r.branch_name) + '</span>', body, footer: foot.join(''), onClose: () => { if (ctx.afterReview) ctx.afterReview(); } });
    wire(r, can, failedItems);
    wireCommon(ctx, { requestId: id }, paint);
  };

  function wire(r, can, failedItems) {
    const body = drawerBody();
    $('im-do-close').addEventListener('click', closeDrawer);
    body.querySelectorAll('[data-go-stock]').forEach((b) => b.addEventListener('click', () => { closeDrawer(); ctx.showTab('stock', { search: b.dataset.goStock, status: 'all', branch: String(r.branch_id) }); }));
    body.querySelectorAll('[data-go-hist]').forEach((b) => b.addEventListener('click', () => { closeDrawer(); ctx.showTab('history', { search: b.dataset.goHist }); }));
    body.querySelectorAll('[data-open-del]').forEach((b) => b.addEventListener('click', () => openDeleteReview(ctx, Number(b.dataset.openDel))));
    body.querySelectorAll('[data-req-delete]').forEach((b) => b.addEventListener('click', () => openReversalRequest(ctx, { id: Number(b.dataset.reqDelete) })));
    const edit = $('im-do-edit'); if (edit) edit.addEventListener('click', () => { closeDrawer(); ctx.showTab('purchase', { requestId: id }); });
    const cancel = $('im-do-cancel');
    if (cancel) cancel.addEventListener('click', () => actionPanel({ title: 'Cancel ' + esc(r.request_number) + '?', message: 'It will be cancelled and nothing is added to stock. The record stays in the history.', fields: '<div class="field"><label>Reason (optional)</label><input type="text" id="im-act-reason"></div>', okLabel: 'Cancel the request', danger: true,
      onOk: async () => { await api.requestCancel(id, $('im-act-reason').value); ctx.toast('Cancelled.', false); await ctx.reload('approvals'); await paint(); } }));

    const approve = $('im-do-approve');
    if (approve) approve.addEventListener('click', () => {
      const pendingItems = (res.items || []).filter((i) => ['PENDING', 'FAILED'].includes(i.post_status));
      const pcs = pendingItems.reduce((s, i) => s + Number(i.qty), 0);
      const warned = pendingItems.filter((i) => (i.warnings || []).some((w) => !/^NEW SKU/.test(w)) || (i.possible_duplicates || []).length).length;
      const t = res.totals || {};
      actionPanel({
        title: 'APPROVE FACTORY PURCHASE?',
        message: '<div class="im-confirm-grid">' + [['Request', esc(r.request_number)], ['Branch', esc(r.branch_name)], ['Items', num(pendingItems.length)], ['Pieces', num(pcs)], ['Purchased', money(t.purchased)], ['Estimated sales', money(t.est_sales)],
          ['Expected profit', money(t.profit)], ['New SKUs', num(t.new_skus)], ['Expected stock impact', '<b>' + num(pcs) + ' total pieces added</b>']].map(([l, v]) => '<div><span>' + l + '</span><b>' + v + '</b></div>').join('') + '</div>' +
          (warned ? '<div class="im-warn-line">⚠ ' + plural(warned, 'item') + (warned === 1 ? ' carries' : ' carry') + ' a warning or a possible duplicate — check ' + (warned === 1 ? 'it' : 'them') + ' above before posting.</div>' : '') + '<p class="muted">Approving adds this stock to the branch right away and cannot be taken back except by a reversal request.</p>',
        okLabel: 'APPROVE &amp; POST STOCK',
        onOk: async () => {
          const out = await api.requestApprove(id);
          await ctx.reload('all');
          if ((out.failed || 0) > 0 || out.already) showPostingResults(ctx, out, r.request_number);
          else ctx.toast(r.request_number + ' approved — ' + num(out.pieces) + ' pcs added to ' + r.branch_name + '.', false);
          await paint();
        },
      });
    });

    const reasonPanel = (title, message, label, okLabel, danger, run, quick) => actionPanel({
      title, message, okLabel, danger,
      fields: (quick ? '<div class="im-quick-reasons">' + quick.map((q) => '<button type="button" class="btn small secondary" data-q="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' : '') +
        '<div class="field"><label>' + label + ' *</label><textarea id="im-act-reason" rows="3" maxlength="500"></textarea></div>',
      onOk: async () => { const v = $('im-act-reason').value.trim(); if (!v) throw new Error('Write the reason first.'); await run(v); },
    });
    const ret = $('im-do-return');
    if (ret) ret.addEventListener('click', () => {
      reasonPanel('RETURN FOR CORRECTION', 'The staff member is told what to fix, edits the request and resubmits it. Their earlier version stays in the history.', 'What needs correcting', 'Return to staff', false,
        async (v) => { await api.requestReturn(id, v); ctx.toast('Returned for correction.', false); await ctx.reload('approvals'); await paint(); },
        ['Incorrect supplier price.', 'Please confirm grams.', 'Possible duplicate SKU.', 'Wrong branch.']);
      $('im-drawer-body').querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { const ta = $('im-act-reason'); ta.value = (ta.value ? ta.value + ' ' : '') + b.dataset.q; ta.focus(); }));
    });
    const rej = $('im-do-reject');
    if (rej) rej.addEventListener('click', () => reasonPanel('REJECT THIS PURCHASE', 'No stock is added and the request stays in the history for good. The staff member is told why.', 'Reason for rejecting', 'Reject', true,
      async (v) => { await api.requestReject(id, v); ctx.toast('Rejected. No stock was added.', false); await ctx.reload('approvals'); await paint(); }));
    const disc = $('im-do-discard');
    if (disc) disc.addEventListener('click', () => reasonPanel('DISCARD THE FAILED ITEMS', plural(failedItems.length, 'item') + ' could not be posted (' + failedItems.map((i) => esc(i.sku)).join(', ') + '). Discarding gives up on them for good; the items already posted stay.', 'Why are they being discarded', 'Discard', true,
      async (v) => { const out = await api.requestDiscardFailed(id, v); ctx.toast('Discarded. The request is now ' + String(out.status).toLowerCase() + '.', false); await ctx.reload('approvals'); await paint(); }));
  }

  if (opts && opts.action) {
    await paint(true);
    const btn = { approve: 'im-do-approve', return: 'im-do-return', reject: 'im-do-reject' }[opts.action];
    if (btn && $(btn)) $(btn).click();
  } else await paint(true);
}

// ---------------------------------------------------------------- the reversal request (the Final Approver decides)
export async function openDeleteReview(ctx, id, opts) {
  const api = ctx.api;
  openDrawer({ title: 'Loading…', body: '<p class="muted">Loading…</p>' });
  let res;
  const load = async () => { res = await api.deleteGet(id); };
  try { await load(); } catch (err) { closeDrawer(); ctx.toast(err, true); return; }
  const paint = async (fresh) => {
    if (fresh !== true) await load();
    const d = res.request, can = res.can || {};
    const stillFrom = Math.min(Number(res.on_hand_now || 0), Number(d.qty || 0));
    const status = d.status === 'REVERSED' ? banner('green', '<b>Reversed.</b> ' + esc(d.database_result || ''))
      : d.status === 'REVERSAL BLOCKED' ? banner('amber', '<b>Reversal blocked by the database.</b><div class="lv-text">' + esc(d.database_result || '') + '</div><div class="muted">Nothing was changed. Stock that was used is corrected with an Adjustment, not by forcing the reversal.</div>')
      : d.status === 'REJECTED' ? banner('red', '<b>Rejected</b> by ' + esc(d.reviewed_by_name || 'the Final Approver') + (d.reviewed_at ? ' · ' + fmtDateTime(d.reviewed_at) : '') + '<div class="lv-text">' + esc(d.decision_comment || '') + '</div><div class="muted">The purchase stays as it was.</div>')
      : d.status === 'CANCELLED' ? banner('gray', '<b>Withdrawn.</b> The purchase stays as it was.')
      : banner('amber', '<b>Waiting for the Final Approver.</b> The purchase stays active and its stock stays until this is decided.');
    const usage = d.status === 'REVERSED' ? '' : '<div class="drawer-section"><h4>Stock usage status</h4><div class="im-usage ' + (res.safe_now ? 'im-usage-ok' : 'im-usage-bad') + '">' +
      '<div><span>Original stock in</span><b>' + num(d.qty) + ' pcs</b></div><div><span>Still available from this purchase</span><b>' + num(stillFrom) + '</b></div><div><span>Held at the branch now</span><b>' + num(res.on_hand_now) + '</b></div>' +
      '<div><span>Safe to reverse</span><b>' + (res.safe_now ? 'Yes' : 'No') + '</b></div></div><div class="muted" style="margin-top:6px;">' + esc(res.safety_message || '') + '</div></div>';
    const body = '<div id="im-act-slot"></div>' + status +
      '<div class="drawer-section"><h4>Purchase to reverse</h4>' + [['Factory purchase ID', '#' + esc(d.purchase_id)], ['Delivered', fmtDate(d.date_delivered)], ['Branch', esc(d.branch_name)], ['SKU', esc(d.sku)], ['Product', esc(d.product_name || '—')],
        ['Original qty', num(d.qty) + ' pcs'], ['Supplier price', money(d.sup_price)], ['Purchased amount', money(d.purchased_amount)], ['Entered by', esc(d.purchase_created_by_name || '—') + (d.purchase_created_at ? ' · ' + fmtDateTime(d.purchase_created_at) : '')],
        ['Inventory transaction', d.inventory_transaction_id ? '#' + esc(d.inventory_transaction_id) : '—'], ['Branch stock when asked', d.stock_at_request != null ? num(d.stock_at_request) : '—']].map(([l, v]) => kv(l, v)).join('') +
        (d.source_request_number ? kv('Came from', esc(d.source_request_number)) : '') + '</div>' +
      usage +
      '<div class="drawer-section"><h4>Reason</h4>' + kv('Reason', esc(d.reason_category)) + (d.reason ? '<div class="lv-text">' + esc(d.reason) + '</div>' : '') + kv('Requested by', esc(d.requested_by_name || '—') + ' · ' + fmtDateTime(d.requested_at)) + '</div>' +
      '<div class="drawer-section"><h4>Proof &amp; attachments</h4>' + filesHtml(res.files) + (can.attach ? uploadRowHtml() : '') + '</div>' +
      '<div class="drawer-section"><h4>Discussion</h4>' + commentsHtml(res.comments || [], true) + '</div>' +
      '<div class="drawer-section"><h4>Timeline</h4>' + timelineHtml(res.logs || []) + '</div>';
    const foot = [];
    if (can.approve) foot.push('<button type="button" class="btn" id="im-del-approve">' + (d.status === 'REVERSAL BLOCKED' ? 'TRY THE REVERSAL AGAIN' : 'APPROVE REVERSAL') + '</button>');
    if (can.reject) foot.push('<button type="button" class="btn secondary lv-btn-danger" id="im-del-reject">REJECT</button>');
    if (can.cancel && !can.approve) foot.push('<button type="button" class="btn secondary" id="im-del-cancel">Withdraw request</button>');
    foot.push('<button type="button" class="btn secondary" id="im-del-close">Close</button>');
    openDrawer({ title: d.request_number, sub: delBadge(d.status) + ' <span class="muted">' + esc(d.branch_name) + ' · ' + esc(d.sku) + '</span>', body, footer: foot.join(''), onClose: () => { if (ctx.afterReview) ctx.afterReview(); } });
    $('im-del-close').addEventListener('click', closeDrawer);
    wireCommon(ctx, { deleteId: id }, paint);
    const ap = $('im-del-approve');
    if (ap) ap.addEventListener('click', () => actionPanel({
      title: 'APPROVE FACTORY PURCHASE REVERSAL?',
      message: '<div class="im-confirm-grid">' + [['Purchase', '#' + esc(d.purchase_id)], ['SKU', esc(d.sku)], ['Branch', esc(d.branch_name)], ['Qty originally added', num(d.qty)], ['Reason', esc(d.reason_category)], ['Requested by', esc(d.requested_by_name || '—')],
        ['Database safety', res.safe_now ? '<b>Eligible for reversal</b>' : '<b>The database will refuse (stock used)</b>']].map(([l, v]) => '<div><span>' + l + '</span><b>' + v + '</b></div>').join('') + '</div>' +
        '<p class="muted">The existing reversal removes exactly ' + num(d.qty) + ' pcs from ' + esc(d.branch_name) + ' and deletes the purchase row. It is refused if any of it was already sold or moved — there is no way to force it.</p>',
      okLabel: 'APPROVE REVERSAL', danger: true,
      onOk: async () => {
        const out = await api.deleteApprove(id);
        await ctx.reload('all');
        if (out.blocked) ctx.toast('The database blocked the reversal: ' + out.error, true); else ctx.toast(d.request_number + ' reversed — ' + num(d.qty) + ' pcs removed from ' + d.branch_name + '.', false);
        await paint();
      },
    }));
    const rj = $('im-del-reject');
    if (rj) rj.addEventListener('click', () => actionPanel({ title: 'REJECT THE REVERSAL', message: 'The purchase stays exactly as it is and no stock changes.', fields: '<div class="field"><label>Why *</label><textarea id="im-act-reason" rows="3" maxlength="500"></textarea></div>', okLabel: 'Reject', danger: true,
      onOk: async () => { const v = $('im-act-reason').value.trim(); if (!v) throw new Error('Write the reason first.'); await api.deleteReject(id, v); ctx.toast('Reversal rejected.', false); await ctx.reload('approvals'); await paint(); } }));
    const cn = $('im-del-cancel');
    if (cn) cn.addEventListener('click', () => actionPanel({ title: 'Withdraw this request?', message: 'The purchase stays active.', fields: '', okLabel: 'Withdraw', onOk: async () => { await api.deleteCancel(id, ''); ctx.toast('Request withdrawn.', false); await ctx.reload('approvals'); await paint(); } }));
  };
  if (opts && opts.action === 'approve') { await paint(true); const b = $('im-del-approve'); if (b) b.click(); } else await paint(true);
}

// ---------------------------------------------------------------- ask for a reversal (from Purchase History or a posted item)
export async function openReversalRequest(ctx, purchase) {
  const api = ctx.api;
  let st;
  try { st = await api.deleteStatus(purchase.id); } catch (err) { ctx.toast(err, true); return; }
  if (!st.found) { ctx.toast(st.message || 'This factory purchase no longer exists.', true); return; }
  const rows = [['Factory purchase ID', '#' + esc(st.purchase_id)], ['Delivered', fmtDate(st.date_delivered)], ['Branch', esc(st.branch_name)], ['SKU', esc(st.sku)], ['Product', esc(st.product_name || '—')], ['Original qty', num(st.qty) + ' pcs'],
    ['Supplier price', money(st.sup_price)], ['Purchased amount', money(st.purchased_amount)], ['Created by', esc(st.created_by_name || '—')], ['Created', fmtDateTime(st.created_at)], ['Current stock at the branch', num(st.on_hand)],
    ['Inventory transaction', st.inventory_transaction_id ? '#' + esc(st.inventory_transaction_id) : '—']];
  const usage = '<div class="im-usage ' + (st.safe ? 'im-usage-ok' : 'im-usage-bad') + '"><div><span>Original stock in</span><b>' + num(st.qty) + ' pcs</b></div><div><span>Still available from this purchase</span><b>' + num(st.still_from_purchase) + '</b></div><div><span>Safe to reverse</span><b>' + (st.safe ? 'Yes' : 'No') + '</b></div></div>' +
    '<div class="' + (st.safe ? 'muted' : 'im-fail') + '" style="margin-top:6px;">' + esc(st.message) + '</div>';
  const open = st.open_request_id ? banner('amber', 'A reversal request is already open for this purchase: <b>' + esc(st.open_request_number) + '</b> (' + esc(String(st.open_request_status).toLowerCase()) + ').') : '';
  const canAsk = st.safe && !st.open_request_id;
  const form = canAsk ? '<div class="field"><label>Reason *</label><select id="im-rv-cat">' + DELETE_REASONS.map((x) => '<option>' + esc(x) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Details (required for “Other”)</label><textarea id="im-rv-text" rows="3" maxlength="500"></textarea></div>' : '';
  const buttons = [{ label: canAsk ? 'Cancel' : 'Close', kind: 'secondary' }];
  if (st.open_request_id) buttons.push({ label: 'Open that request', kind: 'primary', onClick: (m) => { m.close(); openDeleteReview(ctx, st.open_request_id); } });
  if (canAsk) buttons.push({ label: 'REQUEST REVERSAL', kind: 'primary', onClick: async (m) => {
    const cat = m.el.querySelector('#im-rv-cat').value, text = m.el.querySelector('#im-rv-text').value.trim();
    if (cat === 'Other' && !text) throw new Error('Write the reason (you chose Other).');
    const out = await api.deleteRequest(uuid(), st.purchase_id, cat, text);
    m.close(); ctx.toast(out.request_number + ' sent to the Final Approver. The purchase stays active until it is decided.', false);
    await ctx.reload('all');
    if (ctx.who.isApprover) openDeleteReview(ctx, out.delete_request_id);
  } });
  showModal({ title: 'REQUEST REVERSAL OF A FACTORY PURCHASE', wide: true, body: '<p class="muted">This is not a simple delete: the Final Approver decides, and the existing safety check removes the stock only if none of it was used.</p>' + open +
    '<div class="im-rv-kv">' + rows.map(([l, v]) => '<div><span>' + l + '</span><b>' + v + '</b></div>').join('') + '</div><h4 class="im-h">Stock usage status</h4>' + usage + form, buttons });
  void friendly;
}
