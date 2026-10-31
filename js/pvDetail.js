// Payment Verification page -- one payment in full (the right-hand drawer): the proof pictures, the payment details, the duplicate warnings with the exact earlier order and
// customer, the order's payment summary, and every decision a person may make (verify, override, reject, mark duplicate, needs review, mark unverified, correct,
// move to another order, add a picture) with the history underneath. Buttons follow what the person's keys allow, but the database decides: every action is checked
// again on the server, which also re-runs the duplicate check at the moment of verifying.
import {
  esc, money, fmtDate, fmtDateTime, fmtShortDateTime, fmtTime, manilaDay, ago, statusBadge, riskBadge, sourceLabel, matchCardHtml, matchSentence, imgTag,
  eventLabel, eventDetail, orderSummaryLines, REJECT_REASONS, friendly, debounce, shopChip, pancakeStatusBadge, pancakeStatusLabel, orderRefHtml, attachedWhere,
} from './pvFormat.js?v=20261031a';
import { prepareImage } from './pvImage.js?v=20261031a';
import { hydrateImages } from './pvApi.js?v=20261031a';
import { openDrawer, closeDrawer, drawerBody, drawerFooter, isDrawerOpen, actionPanel, openLightbox, kv } from './pvUi.js?v=20261031a';

const $ = (id) => document.getElementById(id);
let cur = null;   // { id, d, ids }

const OPEN = ['PENDING', 'MISSING_INFORMATION', 'NEEDS_REVIEW', 'POSSIBLE_DUPLICATE', 'UNVERIFIED'];
const DONE = ['VERIFIED', 'PARTIALLY_VERIFIED'];
const CLOSED = ['REJECTED', 'DUPLICATE_CONFIRMED'];
const realMatches = (d) => (d.matches || []).filter((m) => m.severity !== 'INFO' && !m.same_order);
const isBlocked = (d) => realMatches(d).some((m) => m.blocking);

export const detailOpenId = () => (cur && isDrawerOpen('detail') ? cur.id : null);
export function closeDetail() { closeDrawer('detail'); }

/** opts: { rows: [{id, status}] } is the list the person came from (for the ◀ ▶ buttons and "open the next one after verifying"); { keep } redraws in place. */
export async function openDetail(ctx, id, opts = {}) {
  const keep = !!opts.keep;
  const rows = opts.rows || (opts.ids ? opts.ids.map((x) => ({ id: String(x), status: null })) : (cur && cur.rows) || []);
  const scroll = keep && drawerBody('detail') ? drawerBody('detail').scrollTop : 0;
  if (!keep) openDrawer('detail', { title: 'Payment', sub: 'Loading…', body: '<p class="muted">Loading…</p>', footer: '' });
  cur = { id: String(id), d: null, rows: rows.map((r) => ({ id: String(r.id), status: r.status })), ids: rows.map((r) => String(r.id)) };
  let d;
  try { d = await ctx.api.get(id); } catch (err) { drawerBody('detail').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return; }
  if (!cur || cur.id !== String(id)) return;
  if (!d || d.ok === false) { openDrawer('detail', { title: 'Payment', sub: '', body: '<div class="msg error">' + esc((d && d.message) || 'This payment could not be opened.') + '</div>', footer: '' }); return; }
  cur.d = d;
  render(ctx, d);
  if (keep) drawerBody('detail').scrollTop = scroll;
  hydrateImages(drawerBody('detail'));
  fingerprintHistory(ctx, d);
}

// ---------------------------------------------------------------- picture fingerprints for pictures that live on Pancake's servers
async function fingerprintHistory(ctx, d) {
  if (!d.can.proof || !OPEN.includes(d.payment.status)) return;
  const todo = (d.images || []).filter((i) => i.url && !i.has_hash).slice(0, 3);
  if (!todo.length) return;
  let changed = false;
  for (const im of todo) {
    try {
      const res = await fetch(im.url, { mode: 'cors', referrerPolicy: 'no-referrer', cache: 'force-cache' });
      if (!res.ok) continue;
      const blob = await res.blob();
      const p = await prepareImage(new File([blob], 'pancake.jpg', { type: blob.type || 'image/jpeg' }));
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      if (!p.sha256 && !p.phash) continue;
      const r = await ctx.api.setImageHash(im.id, p.sha256, p.phash);
      if (r && r.ok && !r.unchanged) changed = true;
    } catch (e) { /* a picture the browser may not read (network / permission) is simply left unfingerprinted */ }
  }
  if (changed && cur && cur.id === String(d.payment.id) && isDrawerOpen('detail') && !$('pv-act-ok')) openDetail(ctx, d.payment.id, { keep: true });
}

// ---------------------------------------------------------------- the drawer
function badgesLine(p) {
  let h = statusBadge(p.status) + ' ' + riskBadge(p.risk) + ' <span class="badge pv-badge pv-tag-src">' + esc(sourceLabel(p.source)) + '</span>';
  if (p.pancake_verified) h += ' <span class="badge pv-badge pv-tag-pancake">✓ Verified in Pancake' + (p.pancake_verified_by ? ' by ' + esc(p.pancake_verified_by) : '') + '</span>';
  if (p.override_applied) h += ' <span class="badge pv-badge pv-st-over">Supervisor override</span>';
  if (p.historical) h += ' <span class="badge pv-badge pv-st-none">Imported history</span>';
  if (p.pancake_drift) h += ' <span class="badge pv-badge pv-st-dup">Changed in Pancake after verification</span>';
  return h;
}

function gallery(d) {
  if (!d.can.proof) return '<p class="muted">You do not have permission to see the proof pictures.</p>';
  if (!d.images.length) return '<div class="pv-banner pv-banner-warn">No picture was added for this payment.</div>';
  return '<div class="pv-gallery">' + d.images.map((im, i) => '<figure class="pv-gal"><button type="button" class="pv-galbtn" data-zoom-img="' + i + '" aria-label="Open picture ' + (i + 1) + ' full size">' + imgTag(im, { cls: 'pv-galimg', alt: 'Payment proof ' + (i + 1) }) + '</button>' +
    '<figcaption class="muted">' + (im.primary ? 'Main picture' : 'Picture ' + (i + 1)) + (im.by ? ' · added by ' + esc(im.by) : '') + (im.at ? ' · ' + esc(fmtShortDateTime(im.at)) : '') + (im.has_hash ? ' · fingerprinted' : '') + '</figcaption></figure>').join('') + '</div>';
}

function paymentRows(d) {
  const p = d.payment;
  const rows = [];
  rows.push(kv('Customer', esc(p.customer_name || '—') + (p.customer_phone ? ' <span class="muted">' + esc(p.customer_phone) + '</span>' : '')));
  // the order as Pancake knows it: shop, order number (opens it in Pancake), Pancake's own id, and its status there right now
  rows.push(kv('Shop', p.shop_name ? shopChip(p.shop_name) : '<span class="muted">not known</span>'));
  rows.push(kv('Pancake order', p.order_ref
    ? orderRefHtml(p) + (p.pancake_order_id ? ' <span class="muted">Pancake ID ' + esc(p.pancake_order_id) + '</span>' : '') + (p.order_date ? ' <span class="muted">· ordered ' + esc(fmtDate(manilaDay(p.order_date))) + '</span>' : '')
      + (p.pancake_url && /^https:\/\//.test(p.pancake_url) ? '<div><a class="pv-orderlink" href="' + esc(p.pancake_url) + '" target="_blank" rel="noopener noreferrer">Open this order in Pancake ↗</a></div>' : '')
    : '<span class="muted">not linked to an order</span>'));
  if (p.order_ref) rows.push(kv('Order status in Pancake', p.order_status ? pancakeStatusBadge(p.order_status) : '<span class="muted">not known</span>'));
  rows.push(kv('Branch', esc(p.branch_name || '—')));
  rows.push(kv('Amount on the proof', '<span class="pv-big">' + esc(money(p.amount)) + '</span>'));
  if (p.verified_amount != null) rows.push(kv('Verified amount', esc(money(p.verified_amount))));
  if (p.order_amount != null) rows.push(kv('Order total', esc(money(p.order_amount)) + (p.expected_amount != null && Number(p.expected_amount) !== Number(p.order_amount) ? ' <span class="muted">· paid online ' + esc(money(p.expected_amount)) + '</span>' : '')));
  rows.push(kv('Payment method', esc(p.method || '—')));
  rows.push(kv('Paid to account', p.account ? esc(p.account.name) + (p.account.masked ? ' <span class="muted">' + esc(p.account.masked) + '</span>' : '') : '<span class="muted">not known</span>'));
  rows.push(kv('Reference number', p.reference ? '<span class="pv-ref">' + esc(p.reference) + '</span>' + (p.reference_edited && p.reference_original && p.reference_original !== p.reference ? ' <span class="muted">(corrected from ' + esc(p.reference_original) + ')</span>' : '') + (p.ref_usable ? '' : ' <span class="pv-miss">too short to rely on</span>') : '<span class="pv-miss">none</span>'));
  rows.push(kv('Reference attached by', p.submitted_by ? '<b>' + esc(p.submitted_by) + '</b> <span class="muted">' + attachedWhere(p.source) + ' · ' + esc(fmtDateTime(p.submitted_at)) + '</span>'
    : '<span class="muted">not known</span> <span class="muted">· ' + esc(fmtDateTime(p.submitted_at)) + '</span>'));
  rows.push(kv('Date & time paid', p.payment_date ? esc(fmtDate(p.payment_date)) + (p.payment_time ? ' ' + esc(fmtTime(p.payment_time)) : '') : '<span class="muted">not given</span>'));
  rows.push(kv('Source', esc(sourceLabel(p.source))));
  if (p.notes) rows.push(kv('Notes', esc(p.notes)));
  if (DONE.includes(p.status)) {
    rows.push(kv('Verified by', esc(p.verified_by || '—') + ' <span class="muted">' + esc(fmtDateTime(p.verified_at)) + (p.verified_via ? ' · ' + (p.verified_via === 'PANCAKE' ? 'in Pancake' : 'in the ERP') : '') + '</span>'));
    if (p.override_applied) rows.push(kv('Override', esc(p.override_by || '') + ' <span class="muted">' + esc(fmtDateTime(p.override_at)) + '</span><div class="muted pv-wrap">' + esc(p.override_reason || '') + '</div>'));
  }
  if (p.pancake_verified && p.verified_via !== 'PANCAKE') rows.push(kv('In Pancake', 'verified by ' + esc(p.pancake_verified_by || 'staff') + (p.pancake_verified_at ? ' <span class="muted">' + esc(fmtDateTime(p.pancake_verified_at)) + '</span>' : '')));
  if (p.reject_reason) rows.push(kv('Rejected because', esc(p.reject_reason)));
  if (p.duplicate_reason) rows.push(kv('Confirmed as duplicate', esc(p.duplicate_reason)));
  rows.push(kv('Duplicate check', p.dup_checked_at ? (p.risk && p.risk !== 'NONE' ? riskBadge(p.risk) + ' ' : 'Nothing found · ') + '<span class="muted">checked ' + esc(ago(p.dup_checked_at)) + '</span>' : '<span class="muted">not checked yet</span>'));
  return rows.join('');
}

function orderSection(d) {
  const s = d.order_summary;
  if (!d.payment.order_ref) return '<p class="muted">This payment is not linked to an order yet. Use “Move to an order” to attach it.</p>';
  if (!s || s.ok === false) return '<p class="muted">' + esc((s && s.message) || 'The order summary is not available.') + '</p>';
  const state = s.state;
  const lines = orderSummaryLines(s).map((l) => '<div class="drawer-kv"><span>' + esc(l[0]) + '</span><b>' + esc(l[1]) + '</b></div>').join('');
  const others = (s.payments || []).filter((x) => x.id !== d.payment.id);
  return '<div class="pv-ordersummary"><div class="pv-ordersummary-head">Order #' + esc(d.payment.order_ref) + ' ' + shopChip(d.payment.shop_name) + ' payments: ' + statusBadge(state) + '</div>' + lines +
    (others.length ? '<div class="pv-otherpay"><div class="muted">Other payments on this order</div>' + others.map((x) => '<button type="button" class="pv-compact-row" data-open-payment="' + esc(x.id) + '"><span class="pv-compact-main"><b>' + esc(x.pv_code) + '</b> ' +
      esc(money(x.amount)) + ' <span class="pv-ref">' + esc(x.reference || '') + '</span>' + (x.submitted_by ? ' <span class="muted">· attached by ' + esc(x.submitted_by) + '</span>' : '') + '</span><span class="pv-compact-side">' + statusBadge(x.status) + '</span></button>').join('') + '</div>' : '') + '</div>';
}

function timeline(d) {
  const ev = [...(d.events || [])].reverse();
  if (!ev.length) return '<p class="muted">No history yet.</p>';
  return '<ol class="pv-tl">' + ev.map((e) => {
    const txt = eventDetail(e);
    const good = ['VERIFIED', 'OVERRIDE', 'VERIFIED_IN_PANCAKE'].includes(e.type), bad = ['REJECTED', 'DUPLICATE_CONFIRMED', 'UNVERIFIED'].includes(e.type), warn = ['DUPLICATE_DETECTED', 'NEEDS_REVIEW'].includes(e.type);
    return '<li class="pv-tl-' + (good ? 'good' : bad ? 'bad' : warn ? 'warn' : 'plain') + '"><div class="pv-tl-head"><b>' + esc(eventLabel(e.type)) + '</b><span class="muted"> · ' + esc(e.by || '—') + (e.role ? ' (' + esc(e.role) + ')' : '') + ' · ' + esc(fmtDateTime(e.at)) + '</span></div>' +
      (txt ? '<div class="pv-tl-text">' + esc(txt) + '</div>' : '') + '</li>';
  }).join('') + '</ol>';
}

function actionButtons(d, ctx) {
  const p = d.payment, c = d.can, s = p.status, btn = (act, label, cls) => '<button type="button" class="btn' + (cls ? ' ' + cls : '') + '" data-act="' + act + '">' + label + '</button>';
  const out = [];
  const idx = cur.ids.indexOf(p.id);
  if (OPEN.includes(s) && c.verify) out.push(btn('verify', s === 'UNVERIFIED' ? 'Verify again' : 'Verify…'));
  if (OPEN.includes(s) && c.override && isBlocked(d)) out.push(btn('override', 'Override & verify…', 'lv-btn-danger'));
  if (OPEN.includes(s) && c.verify && s !== 'NEEDS_REVIEW') out.push(btn('review', 'Needs review…', 'secondary'));
  if (OPEN.includes(s) && c.reject) out.push(btn('reject', 'Reject…', 'secondary'));
  if (OPEN.includes(s) && c.reject && realMatches(d).some((m) => m.other && m.other.id)) out.push(btn('duplicate', 'Mark as duplicate…', 'secondary'));
  if (OPEN.includes(s) && c.edit) out.push(btn('edit', 'Correct details…', 'secondary'));
  if (OPEN.includes(s) && c.move) out.push(btn('move', 'Move to an order…', 'secondary'));
  if (DONE.includes(s) && c.verify) out.push(btn('unverify', 'Mark unverified…', 'secondary'));
  if (CLOSED.includes(s) && c.verify) out.push(btn('review', 'Reopen for review', 'secondary'));
  if (c.submit && c.proof && !CLOSED.includes(s)) out.push(btn('addpic', 'Add picture', 'secondary'));
  if (cur.ids.length > 1 && idx >= 0) out.push('<span class="pv-navbtns"><button type="button" class="btn small secondary" data-act="prev"' + (idx <= 0 ? ' disabled' : '') + ' aria-label="Previous payment">◀</button>' +
    '<span class="muted">' + (idx + 1) + ' / ' + cur.ids.length + '</span><button type="button" class="btn small secondary" data-act="next"' + (idx >= cur.ids.length - 1 ? ' disabled' : '') + ' aria-label="Next payment">▶</button></span>');
  return out.join('');
}

function render(ctx, d) {
  const p = d.payment, real = realMatches(d);
  const miss = (d.missing || []).length && OPEN.includes(p.status) ? '<div class="pv-banner pv-banner-warn"><b>Missing:</b> ' + esc(d.missing.join(' and ')) + '. It cannot be verified until this is added.</div>' : '';
  const dupBanner = real.length ? '<div class="pv-banner pv-banner-' + (isBlocked(d) ? 'error' : 'warn') + '"><b>' + (isBlocked(d) ? 'POSSIBLE DUPLICATE — verification is blocked.' : 'Review before verifying.') + '</b> ' +
    esc(matchSentence(real[0], p.reference)) + (real.length > 1 ? ' <span class="muted">(+' + (real.length - 1) + ' more below)</span>' : '') + '</div>' : '';
  const drift = p.pancake_drift ? '<div class="pv-banner pv-banner-warn">Pancake changed this payment after it was verified here. What you see is what was verified in the ERP; the change is in the history.</div>' : '';
  const alreadyP = p.pancake_verified && !DONE.includes(p.status) ? '<div class="pv-banner pv-banner-info">Verified inside Pancake POS by <b>' + esc(p.pancake_verified_by || 'staff') + '</b>. It still needs to be verified here.</div>' : '';
  const body = '<div id="pv-detail-msg"></div><div class="pv-badges">' + badgesLine(p) + '</div>' + dupBanner + miss + drift + alreadyP +
    '<section class="drawer-section"><h4>Proof</h4>' + gallery(d) + '</section>' +
    '<section class="drawer-section"><h4>Payment</h4>' + paymentRows(d) + '</section>' +
    '<section class="drawer-section"><h4>Order</h4>' + orderSection(d) + '</section>' +
    '<section class="drawer-section"><h4>Duplicate check' + (real.length ? ' — ' + real.length + ' found' : '') + '</h4>' +
      (d.matches && d.matches.length ? d.matches.map((m) => matchCardHtml(m, { reference: p.reference, open: true, compare: d.can.proof })).join('') : '<p class="muted">No other payment uses this reference number or picture.</p>') + '</section>' +
    '<section class="drawer-section"><h4>History</h4>' + timeline(d) + '</section>';
  openDrawer('detail', { title: p.pv_code + ' · ' + (p.customer_name || 'Customer'), sub: (p.order_ref ? 'Order #' + p.order_ref + (p.shop_name ? ' (' + p.shop_name + ')' : '') + ' · ' : '') + (p.branch_name || '') + ' · ' + money(p.amount), body, footer: actionButtons(d, ctx) });
  wire(ctx, d);
}

// ---------------------------------------------------------------- wiring
async function afterChange(ctx, id, { advance } = {}) {
  ctx.afterChange();
  if (advance && cur && cur.rows.length) {
    // the next payment in the list that is still waiting for a decision (after this one, else before it)
    const i = cur.ids.indexOf(String(id));
    const waiting = (r) => r.id !== String(id) && (r.status === null || OPEN.includes(r.status)) && r.status !== 'UNVERIFIED';
    const next = cur.rows.slice(i + 1).find(waiting) || cur.rows.slice(0, Math.max(i, 0)).reverse().find(waiting);
    const rest = cur.rows.filter((r) => r.id !== String(id));
    if (next) return openDetail(ctx, next.id, { rows: rest });
    closeDetail(); return;
  }
  return openDetail(ctx, id, { keep: true });
}

function wire(ctx, d) {
  const body = drawerBody('detail'), foot = drawerFooter('detail'), p = d.payment, api = ctx.api;
  const slotOk = () => !!$('pv-detail-msg');
  body.querySelectorAll('[data-zoom-img]').forEach((b) => b.addEventListener('click', () => {
    const im = d.images[Number(b.dataset.zoomImg)];
    openLightbox(api, [{ label: p.pv_code + ' · ' + (p.customer_name || ''), image: im, caption: money(p.amount) }]);
  }));
  body.querySelectorAll('[data-open-payment]').forEach((b) => b.addEventListener('click', () => openDetail(ctx, b.dataset.openPayment, { rows: cur.rows })));
  body.querySelectorAll('[data-compare]').forEach((b) => b.addEventListener('click', () => {
    const m = d.matches.find((x) => x.other && x.other.id === b.dataset.compare);
    const mine = d.images[0];
    if (!m || !m.other.image) return;
    const items = [{ label: p.pv_code + ' (this payment)', image: mine, caption: (p.customer_name || '') + ' · ' + money(p.amount) },
      { label: m.other.pv_code + ' (earlier)', image: m.other.image, caption: (m.other.customer_name || '') + ' · Order #' + (m.other.order_ref || '—') }];
    if (!mine) { ctx.toast('This payment has no picture to compare.', true); return; }
    openLightbox(api, items);
  }));
  foot.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(ctx, d, b.dataset.act)));
}

// ---------------------------------------------------------------- the decisions
function act(ctx, d, name) {
  const p = d.payment, api = ctx.api, id = p.id;
  if (name === 'prev' || name === 'next') {
    const i = cur.ids.indexOf(id), t = cur.ids[name === 'next' ? i + 1 : i - 1];
    if (t) openDetail(ctx, t, { rows: cur.rows });
    return;
  }
  if (name === 'verify') return verifyPanel(ctx, d);
  if (name === 'override') return overridePanel(ctx, d);
  if (name === 'addpic') return addPicture(ctx, d);
  if (name === 'review') {
    const closed = CLOSED.includes(p.status);
    return actionPanel('detail', {
      title: closed ? 'Reopen for review' : 'Ask for a review', message: closed ? 'The payment goes back to <b>Needs Review</b> so it can be looked at again.' : 'The payment goes to <b>Needs Review</b> so a supervisor can look at it.',
      fields: '<div class="field"><label for="pv-a-note">Note (optional)</label><textarea id="pv-a-note" rows="2" maxlength="500"></textarea></div>', okLabel: 'Confirm',
      onOk: async (slot) => { const r = await api.needsReview(id, slot.querySelector('#pv-a-note').value); if (r.ok === false) throw new Error(r.message); ctx.toast('Marked for review.'); await afterChange(ctx, id); },
    });
  }
  if (name === 'reject') {
    return actionPanel('detail', {
      title: 'Reject this payment', danger: true, message: 'The proof is not accepted. Anything credited to the order is taken back, and the reason is kept in the history.',
      fields: '<div class="field"><label for="pv-a-code">Reason</label><select id="pv-a-code">' + REJECT_REASONS.map(([k, l]) => '<option value="' + k + '">' + esc(l) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="pv-a-note">Details (required for “Other”)</label><textarea id="pv-a-note" rows="2" maxlength="500"></textarea></div>', okLabel: 'Reject payment',
      onOk: async (slot) => { const r = await api.reject(id, slot.querySelector('#pv-a-code').value, slot.querySelector('#pv-a-note').value); if (r.ok === false) throw new Error(r.message); ctx.toast('Payment rejected.'); await afterChange(ctx, id, { advance: true }); },
    });
  }
  if (name === 'unverify') {
    return actionPanel('detail', {
      title: 'Mark this payment unverified', danger: true, message: 'The credit to ' + (p.order_ref ? 'Order #' + esc(p.order_ref) : 'the order') + ' is taken back (a reversal is recorded) and the payment returns to the queue.',
      fields: '<div class="field"><label for="pv-a-note">Reason (required)</label><textarea id="pv-a-note" rows="2" maxlength="500"></textarea></div>', okLabel: 'Mark unverified',
      onOk: async (slot) => { const r = await api.unverify(id, slot.querySelector('#pv-a-note').value); if (r.ok === false) throw new Error(r.message); ctx.toast('Marked unverified. The credit was taken back.'); await afterChange(ctx, id); },
    });
  }
  if (name === 'duplicate') {
    const opts = realMatches(d).filter((m) => m.other && m.other.id);
    return actionPanel('detail', {
      title: 'Confirm this is a duplicate', danger: true, message: 'Choose the earlier payment it repeats. This payment is closed as <b>Duplicate Confirmed</b> and nothing is credited.',
      fields: '<div class="field"><label for="pv-a-orig">It repeats</label><select id="pv-a-orig">' + opts.map((m) => '<option value="' + esc(m.other.id) + '">' + esc(m.other.pv_code) + ' · Order #' + esc(m.other.order_ref || '—') + (m.other.shop_name ? ' (' + esc(m.other.shop_name) + ')' : '') + ' · ' + esc(m.other.customer_name || '') + ' · ' + esc(money(m.other.amount)) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="pv-a-reason">Why is it a duplicate? (required)</label><input id="pv-a-reason" type="text" maxlength="200" placeholder="e.g. same receipt sent again"></div><div class="field"><label for="pv-a-note">Notes (optional)</label><textarea id="pv-a-note" rows="2" maxlength="500"></textarea></div>',
      okLabel: 'Confirm duplicate',
      onOk: async (slot) => { const r = await api.markDuplicate(id, slot.querySelector('#pv-a-orig').value, slot.querySelector('#pv-a-reason').value, slot.querySelector('#pv-a-note').value); if (r.ok === false) throw new Error(r.message); ctx.toast('Confirmed as a duplicate.'); await afterChange(ctx, id, { advance: true }); },
    });
  }
  if (name === 'edit') return editPanel(ctx, d);
  if (name === 'move') return movePanel(ctx, d);
}

// ---- verify
function verifyPanel(ctx, d, state = {}) {
  const p = d.payment, id = p.id, api = ctx.api;
  const fields = '<div class="pv-checklist"><div>' + esc(money(p.amount)) + ' · ' + esc(p.method || 'method not set') + ' · reference <span class="pv-ref">' + esc(p.reference || '—') + '</span></div>' +
    '<div class="muted">Check the picture: the amount, the reference number and the account that received it.</div></div>' +
    '<div class="field"><label for="pv-a-amt">Amount to credit (₱) — leave as is unless only part of it is valid</label><input id="pv-a-amt" type="number" min="0" step="0.01" value="' + esc(state.amount != null ? state.amount : (p.amount != null ? p.amount : '')) + '"></div>' +
    '<div class="field"><label for="pv-a-note">Note (optional)</label><textarea id="pv-a-note" rows="2" maxlength="500">' + esc(state.note || '') + '</textarea></div>' + (state.extra || '');
  actionPanel('detail', {
    title: state.title || 'Verify this payment', message: state.message || 'You are confirming that you checked the picture and this payment is real. It is credited to ' + (p.order_ref ? 'Order #' + esc(p.order_ref) : 'its order') + '.',
    fields, okLabel: state.okLabel || 'Confirm — verify',
    onOk: async (slot) => {
      const amtRaw = slot.querySelector('#pv-a-amt').value, note = slot.querySelector('#pv-a-note').value;
      const amount = amtRaw === '' ? null : Number(amtRaw);
      const ackBox = slot.querySelector('#pv-a-ack');
      if (state.needAck && ackBox && !ackBox.checked) throw new Error('Tick the box to confirm you reviewed the warning.');
      const r = await api.verify(id, !!state.ack || !!state.needAck, note, amount !== null && p.amount != null && Math.abs(amount - Number(p.amount)) < 0.005 ? null : amount);
      if (r.ok) {
        const extra = r.underpaid ? ' Still to be paid on the order: ' + money(r.remaining) + '.' : '';
        ctx.toast('Verified ' + money(r.amount) + '.' + extra);
        await afterChange(ctx, id, { advance: ctx.autoAdvance });
        return;
      }
      if (r.code === 'ACK_REQUIRED') { verifyPanel(ctx, d, { ...state, needAck: true, ack: true, amount, note, title: 'Review the warning first', okLabel: 'I reviewed it — verify', message: 'This payment has possible matches. Read them, then confirm they are different payments.',
        extra: '<div class="pv-ack">' + (r.matches || []).filter((m) => m.severity !== 'INFO' && !m.same_order).map((m) => matchCardHtml(m, { reference: p.reference })).join('') +
          '<label class="pv-check"><input type="checkbox" id="pv-a-ack"> I reviewed these earlier payments and this is a different payment.</label></div>' }); return; }
      if (r.code === 'OVERPAYMENT_ACK_REQUIRED') { verifyPanel(ctx, d, { ...state, needAck: true, ack: true, amount, note, title: 'Overpayment', okLabel: 'Verify anyway', message: esc(r.message),
        extra: '<label class="pv-check"><input type="checkbox" id="pv-a-ack"> The customer really paid this much (or it will be refunded / used for another order).</label>' }); return; }
      if (r.code === 'REFERENCE_ALREADY_VERIFIED') { blockedPanel(ctx, d, r); return; }
      if (r.code === 'MISSING_INFORMATION') throw new Error(r.message + ' Use “Correct details” or “Add picture”.');
      throw new Error(r.message || 'It could not be verified.');
    },
  });
}

function blockedPanel(ctx, d, r) {
  const p = d.payment, id = p.id, api = ctx.api, can = d.can;
  const blocking = (r.blocking && r.blocking.length ? r.blocking : (r.matches || []).filter((m) => m.blocking));
  const msg = '<div class="pv-banner pv-banner-error"><b>' + esc(r.message || 'VERIFICATION BLOCKED.') + '</b></div>' + blocking.map((m) => matchCardHtml(m, { reference: p.reference, open: true, compare: can.proof })).join('');
  actionPanel('detail', {
    title: 'Verification blocked', danger: true, message: can.override ? 'You can override this because you are a supervisor or admin. A clear reason is required and is kept forever in the audit trail.' : 'Only a supervisor or admin can override this. You can reject the payment or mark it as a duplicate instead.',
    fields: msg + (can.override ? '<div class="field"><label for="pv-a-reason">Why is this a genuine, separate payment? (required)</label><textarea id="pv-a-reason" rows="2" maxlength="500" placeholder="e.g. customer paid two orders with one transfer; confirmed with the GCash app"></textarea></div>' : ''),
    okLabel: can.override ? 'Override and verify' : 'OK',
    onOk: async (slot) => {
      if (!can.override) { slot.innerHTML = ''; return; }
      const rr = await api.overrideVerify(id, slot.querySelector('#pv-a-reason').value, null);
      if (rr.ok === false) throw new Error(rr.message);
      ctx.toast('Verified with a supervisor override. The original order is recorded.');
      await afterChange(ctx, id, { advance: ctx.autoAdvance });
    },
  });
}

function overridePanel(ctx, d) { blockedPanel(ctx, d, { message: 'VERIFICATION BLOCKED. ' + (realMatches(d)[0] ? matchSentence(realMatches(d)[0], d.payment.reference) : ''), matches: d.matches, blocking: d.matches.filter((m) => m.blocking) }); }

// ---- correct the details
function editPanel(ctx, d) {
  const p = d.payment, id = p.id, api = ctx.api;
  const methodOpts = (ctx.methods.length ? ctx.methods.map((m) => m.method) : ['GCash']).map((m) => '<option value="' + esc(m) + '"' + (m === p.method ? ' selected' : '') + '>' + esc(m) + '</option>').join('');
  const acctOpts = ctx.accounts.map((a) => '<option value="' + esc(a.id) + '"' + (p.account && String(p.account.id) === String(a.id) ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('');
  actionPanel('detail', {
    title: 'Correct the details', message: 'Fix what was typed or read wrongly. The original value stays in the history together with your reason, and the duplicate check runs again.',
    fields: '<div class="pv-grid"><div class="field"><label for="pv-e-ref">Reference number</label><input id="pv-e-ref" type="text" value="' + esc(p.reference || '') + '" autocomplete="off" spellcheck="false"></div>' +
      '<div class="field"><label for="pv-e-amt">Amount (₱)</label><input id="pv-e-amt" type="number" min="0" step="0.01" value="' + esc(p.amount != null ? p.amount : '') + '"></div>' +
      '<div class="field"><label for="pv-e-method">Method</label><select id="pv-e-method"><option value="">—</option>' + methodOpts + '</select></div>' +
      '<div class="field"><label for="pv-e-acct">Account</label><select id="pv-e-acct"><option value="">Not sure</option>' + acctOpts + '</select></div>' +
      '<div class="field"><label for="pv-e-date">Date paid</label><input id="pv-e-date" type="date" value="' + esc(p.payment_date || '') + '"></div>' +
      '<div class="field"><label for="pv-e-time">Time paid</label><input id="pv-e-time" type="time" value="' + esc(p.payment_time ? String(p.payment_time).slice(0, 5) : '') + '"></div>' +
      '<div class="field"><label for="pv-e-name">Customer</label><input id="pv-e-name" type="text" value="' + esc(p.customer_name || '') + '"></div>' +
      '<div class="field"><label for="pv-e-phone">Phone</label><input id="pv-e-phone" type="text" value="' + esc(p.customer_phone || '') + '"></div></div>' +
      '<div class="field"><label for="pv-e-reason">Why are you correcting it? (required)</label><input id="pv-e-reason" type="text" maxlength="200" placeholder="e.g. the scan misread the last digits"></div>',
    okLabel: 'Save correction',
    onOk: async (slot) => {
      const v = (k) => slot.querySelector('#pv-e-' + k).value;
      const patch = {};
      const same = (a, b) => String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
      if (!same(v('ref'), p.reference)) patch.reference = v('ref');
      if (!same(v('amt'), p.amount)) patch.amount = v('amt');
      if (!same(v('method'), p.method)) patch.method = v('method');
      if (!same(v('acct'), p.account ? p.account.id : '')) patch.account_id = v('acct');
      if (!same(v('date'), p.payment_date)) patch.payment_date = v('date');
      if (!same(v('time'), p.payment_time ? String(p.payment_time).slice(0, 5) : '')) patch.payment_time = v('time');
      if (!same(v('name'), p.customer_name)) patch.customer_name = v('name');
      if (!same(v('phone'), p.customer_phone)) patch.customer_phone = v('phone');
      if (!Object.keys(patch).length) throw new Error('Nothing was changed.');
      const r = await api.edit(id, patch, v('reason'));
      if (r.ok === false) throw new Error(r.message);
      ctx.toast(r.unchanged ? 'Nothing was changed.' : 'Corrected. The duplicate check was run again.' + (r.risk && r.risk !== 'NONE' ? ' Duplicate risk: ' + r.risk.toLowerCase().replace('_', ' ') + '.' : ''));
      await afterChange(ctx, id);
    },
  });
}

// ---- move to another order
function movePanel(ctx, d) {
  const p = d.payment, id = p.id, api = ctx.api;
  let picked = null, found = [];
  actionPanel('detail', {
    title: 'Move to the correct order', message: 'Use this when the customer paid for a different order. The payment, its picture and its history move together; nothing is deleted.',
    fields: '<div class="field"><label for="pv-m-q">Find the order — number, customer name or phone</label><input id="pv-m-q" type="search" autocomplete="off" value="' + esc(p.customer_phone || p.customer_name || '') + '"></div><div id="pv-m-res" class="pv-orderres"></div>' +
      '<div id="pv-m-pick" class="muted">No order chosen yet.</div><div class="field"><label for="pv-m-reason">Why? (required)</label><input id="pv-m-reason" type="text" maxlength="200" placeholder="e.g. customer paid the wrong order number"></div>',
    okLabel: 'Move payment',
    onOk: async (slot) => {
      if (!picked) throw new Error('Choose the order first.');
      const r = await api.moveToOrder(id, picked.order_ref, picked.order_shop_id, slot.querySelector('#pv-m-reason').value);
      if (r.ok === false) throw new Error(r.message);
      ctx.toast(r.unchanged ? 'It is already on that order.' : 'Moved to Order #' + picked.order_ref + '. The duplicate check was run again.');
      await afterChange(ctx, id);
    },
  });
  const q = $('pv-m-q'), res = $('pv-m-res');
  const search = debounce(async () => {
    if (!$('pv-m-q')) return;
    const text = $('pv-m-q').value.trim();
    if (text.length < 2) { res.innerHTML = ''; return; }
    res.innerHTML = '<div class="muted">Looking…</div>';
    try {
      found = await api.findOrders(text, 12);
      found = Array.isArray(found) ? found : [];
      res.innerHTML = found.length ? found.map((o, i) => '<button type="button" class="pv-orderpick" data-pick="' + i + '"><b>#' + esc(o.order_ref) + '</b> ' + shopChip(o.shop_name) + ' ' + esc(o.customer_name || '') +
        '<span class="muted"> · ' + [o.customer_phone, pancakeStatusLabel(o.status), o.order_amount != null ? money(o.order_amount) : ''].filter(Boolean).map(esc).join(' · ') + '</span></button>').join('') : '<div class="muted">No order found.</div>';
    } catch (e) { res.innerHTML = '<div class="msg error">' + esc(friendly(e)) + '</div>'; }
  }, 350);
  q.addEventListener('input', search); search();
  res.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    picked = found[Number(b.dataset.pick)];
    $('pv-m-pick').innerHTML = 'Move to <b>Order #' + esc(picked.order_ref) + '</b> ' + shopChip(picked.shop_name) + ' — ' + esc(picked.customer_name || '') + ' · ' + esc(money(picked.order_amount));
  });
}

// ---- add a picture
async function addPicture(ctx, d) {
  const p = d.payment, api = ctx.api;
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    ctx.toast('Reading ' + (files.length === 1 ? 'the picture' : files.length + ' pictures') + '…');
    try {
      let last = null;
      for (const f of files) {
        const prepared = await prepareImage(f);
        if (prepared.problem) throw new Error(prepared.problem);
        const [uploaded] = await api.uploadImages([prepared]);
        if (prepared.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
        last = await api.addImage(p.id, uploaded);
        if (last && last.ok === false) throw new Error(last.message);
      }
      const dup = last && (last.matches || []).filter((m) => m.severity !== 'INFO' && !m.same_order);
      ctx.toast(dup && dup.length ? 'Picture added — it matches an earlier payment, see the duplicate check.' : 'Picture added.');
      ctx.afterChange();
      await openDetail(ctx, p.id, { keep: true });
    } catch (e) { ctx.toast(e.message || String(e), true); }
  });
  input.click();
}
