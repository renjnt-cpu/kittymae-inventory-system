// Transfers -- shared display helpers: status / priority badges, the route picture and the status steps, the three drawers every screen
// uses, the inline confirmation panel (the app never uses confirm() / prompt()), and a few chart helpers. KPI cards, money-free number
// formatting and the generic charts come from billsUi.js / refundsUi.js -- the same look across the modules is deliberate, and so is the
// shared (bl-) layout CSS.
import { esc, fmtDate, fmtDateTime, fmtBytes, kv, errorsText, plural, friendly, emptyBox, progressBar, donut, hbars, stackedHbars, COLORS, kpiCard } from './billsUi.js?v=20261004g';
import { columnPairs, changeText } from './refundsUi.js?v=20261004g';
import { branchBadge, branchColor } from './branchColors.js?v=20260928a';
export { esc, fmtDate, fmtDateTime, fmtBytes, kv, errorsText, plural, friendly, emptyBox, progressBar, donut, hbars, stackedHbars, COLORS, kpiCard, columnPairs, changeText, branchBadge, branchColor };

export const qty = (n) => (n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('en-PH'));
export const pcs = (n) => qty(n) + ' pc' + (Number(n) === 1 ? '' : 's');

export const STATUS_COLOR = { Draft: '#9aa4ad', Requested: '#e0a030', Approved: '#1a56b0', Preparing: '#5b8bd4', 'In Transit': '#7b5fb5', 'Partially Received': '#e07b30', Received: '#2e7d32', Rejected: '#c62828', Cancelled: '#9aa4ad' };
export const statusColor = (s) => STATUS_COLOR[s] || COLORS.gray;
const ST = { Draft: 'draft', Requested: 'requested', Approved: 'approved', Preparing: 'preparing', 'In Transit': 'transit', 'Partially Received': 'partial', Received: 'received', Rejected: 'rejected', Cancelled: 'cancelled' };
export const statusBadge = (s) => '<span class="badge tf-st tf-st-' + (ST[s] || 'draft') + '">' + esc(s) + '</span>';
export const priorityBadge = (p) => '<span class="badge tf-pr tf-pr-' + String(p || 'Normal').toLowerCase() + '">' + esc(p || 'Normal') + '</span>';
export const tagBadge = (text, cls) => '<span class="badge bl-tag ' + (cls || '') + '">' + esc(text) + '</span>';
export const discBadge = (t) => (t._openDiscs.length ? tagBadge('Discrepancy · ' + t._openDiscs.length + ' open', 'tf-tag-disc') : t.has_discrepancy ? tagBadge('Had a discrepancy', 'bl-tag-gray') : '');

/** "APM Mall → Pristina" with each branch in its own colour (the same colours as the rest of the app). */
export const routeText = (ctx, t) => branchBadge(esc, t._from, t.from_branch_id, ctx.branches) + ' <span class="tf-arrow" aria-label="to">→</span> ' + branchBadge(esc, t._to, t.to_branch_id, ctx.branches);

/** The big route picture at the top of a transfer: source (items / pieces) → destination. */
export function routeCard(ctx, t) {
  const c1 = branchColor(t.from_branch_id, ctx.branches), c2 = branchColor(t.to_branch_id, ctx.branches);
  const box = (name, c, line) => '<div class="tf-route-box" style="background:' + c.bg + ';color:' + c.text + ';"><b>' + esc(String(name).toUpperCase()) + '</b><span>' + line + '</span></div>';
  return '<div class="tf-route">' + box(t._from, c1, t._skus + ' item' + (t._skus === 1 ? '' : 's') + ' / ' + pcs(t._sentPcs > 0 ? t._sentPcs : t._apprPcs > 0 && t.status !== 'Requested' ? t._apprPcs : t._reqPcs) + ' leaving') +
    '<div class="tf-route-arrow" aria-hidden="true">→</div>' + box(t._to, c2, t._recPcs > 0 ? pcs(t._recPcs) + ' received' : t._outstanding > 0 ? pcs(t._outstanding) + ' on the way' : 'receiving branch') + '</div>';
}

/** Requested ✓ Approved ✓ Prepared ✓ Released ✓ Received — what has happened and what is next. */
export function statusSteps(t) {
  const order = ['Requested', 'Approved', 'Preparing', 'In Transit', 'Received'];
  const labels = { Requested: 'Requested', Approved: 'Approved', Preparing: 'Prepared', 'In Transit': 'Released', Received: 'Received' };
  const done = { Requested: !!t.requested_at || t.status !== 'Draft', Approved: !!t.approved_at && !['Requested', 'Draft'].includes(t.status), Preparing: !!t.prepared_at || ['In Transit', 'Partially Received', 'Received'].includes(t.status),
    'In Transit': !!t.shipped_at, Received: t.status === 'Received' };
  const when = { Requested: t.requested_at, Approved: t.approved_at, Preparing: t.prepared_at, 'In Transit': t.shipped_at, Received: t.received_at };
  if (['Rejected', 'Cancelled'].includes(t.status)) {
    return '<ol class="tf-steps"><li class="tf-step tf-step-done"><span class="tf-dot">✓</span>Requested</li><li class="tf-step tf-step-stop"><span class="tf-dot">✕</span>' + esc(t.status) + '</li></ol>';
  }
  const cur = order.find((s) => !done[s]);
  return '<ol class="tf-steps">' + order.map((s) => {
    const isDone = done[s], isCur = s === cur || (s === 'Received' && t.status === 'Partially Received' && !isDone);
    const label = s === 'Received' && t.status === 'Partially Received' ? 'Partly received' : labels[s];
    return '<li class="tf-step' + (isDone ? ' tf-step-done' : isCur ? ' tf-step-cur' : '') + '"><span class="tf-dot">' + (isDone ? '✓' : isCur ? '●' : '') + '</span>' + esc(label) +
      (isDone && when[s] ? '<small>' + esc(fmtDate(String(when[s]).slice(0, 10))) + '</small>' : '') + '</li>';
  }).join('') + '</ol>';
}

// ---------------------------------------------------------------- drawers
const $ = (id) => document.getElementById(id);
function drawer(name, title, wide) {
  return '<div class="drawer-backdrop" id="tf-' + name + '-backdrop"></div>' +
    '<div class="drawer bl-drawer' + (wide ? ' bl-drawer-wide' : '') + '" id="tf-' + name + '-drawer" role="dialog" aria-modal="true" aria-labelledby="tf-' + name + '-title">' +
    '<div class="drawer-header"><div><h3 id="tf-' + name + '-title">' + esc(title) + '</h3><div class="muted" id="tf-' + name + '-sub"></div></div>' +
    '<button type="button" class="drawer-close" id="tf-' + name + '-close" aria-label="Close">✕</button></div>' +
    '<div class="drawer-body" id="tf-' + name + '-body"></div>' +
    '<div class="drawer-footer" id="tf-' + name + '-footer"></div></div>';
}
/** The toast area and the three drawers (transfer detail, new / edit form, and one more for approving, releasing, receiving, notes ...). */
export const drawersHtml = () => '<div id="tf-toast" class="bl-toast" aria-live="polite"></div>' + drawer('detail', 'Transfer', true) + drawer('form', 'Transfer', true) + drawer('side', '', true);

export function openDrawer(name, { title, sub, body, footer }) {
  $('tf-' + name + '-title').textContent = title || '';
  $('tf-' + name + '-sub').textContent = sub || '';
  $('tf-' + name + '-body').innerHTML = body || '';
  $('tf-' + name + '-footer').innerHTML = footer || '';
  $('tf-' + name + '-footer').hidden = !footer;
  $('tf-' + name + '-body').scrollTop = 0;
  $('tf-' + name + '-backdrop').classList.add('open');
  $('tf-' + name + '-drawer').classList.add('open');
}
export function closeDrawer(name) {
  const d = $('tf-' + name + '-drawer');
  if (!d) return;
  $('tf-' + name + '-backdrop').classList.remove('open');
  d.classList.remove('open');
}
export const isDrawerOpen = (name) => !!$('tf-' + name + '-drawer') && $('tf-' + name + '-drawer').classList.contains('open');
export const drawerBody = (name) => $('tf-' + name + '-body');
export const setDrawerTitle = (name, title, sub) => { $('tf-' + name + '-title').textContent = title || ''; $('tf-' + name + '-sub').textContent = sub || ''; };

export function makeToast() {
  let timer = null;
  return (text, isError) => {
    const el = $('tf-toast');
    if (!el) return;
    el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(isError ? friendly(text) : text) + '</div>';
    clearTimeout(timer);
    timer = setTimeout(() => { el.innerHTML = ''; }, isError ? 9000 : 4500);
  };
}

/** Clustered columns, one pair per month (pieces released next to pieces received). data = [{ label, a, b }] */
export function pairColumns(data, { aLabel, bLabel }) {
  const W = 560, H = 200, padL = 8, padB = 30, padT = 22, n = data.length || 1, step = (W - padL * 2) / n, bw = Math.max(6, Math.min(26, step / 2 - 4));
  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
  const Y = (v) => H - padB - (v / max) * (H - padB - padT);
  const A = '#7b5fb5', B = '#2e7d32';
  const cols = data.map((d, i) => {
    const cx = padL + i * step + step / 2;
    const bar = (v, x, color, label) => (v > 0 ? '<rect x="' + x.toFixed(1) + '" y="' + Y(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (H - padB - Y(v)).toFixed(1) + '" rx="2" fill="' + color + '"><title>' + esc(d.label + ' · ' + label + ': ' + qty(v) + ' pcs') + '</title></rect>' : '');
    return bar(d.a, cx - bw - 1, A, aLabel) + bar(d.b, cx + 1, B, bLabel) + '<text x="' + cx.toFixed(1) + '" y="' + (H - padB + 15) + '" text-anchor="middle" class="bl-axis">' + esc(d.label) + '</text>';
  }).join('');
  const grid = [0.5, 1].map((f) => '<line x1="' + padL + '" x2="' + (W - padL) + '" y1="' + Y(max * f).toFixed(1) + '" y2="' + Y(max * f).toFixed(1) + '" class="bl-grid"/><text x="' + padL + '" y="' + (Y(max * f) - 3).toFixed(1) + '" class="bl-axis">' + esc(qty(Math.round(max * f))) + '</text>').join('');
  return '<svg class="bl-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aLabel + ' and ' + bLabel + ' by month') + '">' + grid + '<line x1="' + padL + '" x2="' + (W - padL) + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '" class="bl-grid"/>' + cols + '</svg>' +
    '<ul class="bl-legend bl-legend-row"><li><span class="bl-swatch" style="background:' + A + '"></span>' + esc(aLabel) + '</li><li><span class="bl-swatch" style="background:' + B + '"></span>' + esc(bLabel) + '</li></ul>';
}

/** Inline confirmation / reason panel at the top of a drawer. `fields` is raw HTML for extra inputs (a reason box etc.).
 * onOk returns when done (throw to show the message and keep the panel open). */
export function actionPanel(drawerName, { title, message, fields, okLabel, danger, onOk, onCancel }) {
  const slot = $('tf-' + drawerName + '-msg');
  if (!slot) return;
  slot.innerHTML = '<div class="lv-action-panel' + (danger ? ' lv-danger' : '') + '"><h4>' + title + '</h4>' + (message ? '<p>' + message + '</p>' : '') + (fields || '') +
    '<div id="tf-act-err"></div><div class="lv-action-buttons"><button type="button" class="btn' + (danger ? ' lv-btn-danger' : '') + '" id="tf-act-ok">' + okLabel +
    '</button><button type="button" class="btn secondary" id="tf-act-back">Back</button></div></div>';
  $('tf-' + drawerName + '-body').scrollTop = 0;
  const first = slot.querySelector('textarea, input:not([type=checkbox]), select');
  if (first) first.focus();
  $('tf-act-back').addEventListener('click', () => { slot.innerHTML = ''; if (onCancel) onCancel(); });
  $('tf-act-ok').addEventListener('click', async () => {
    const ok = $('tf-act-ok');
    ok.disabled = true;
    try { await onOk(slot); } catch (err) {
      $('tf-act-err').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>';
      ok.disabled = false;
    }
  });
}
