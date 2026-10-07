// Refund Management -- shared display helpers: status / priority / aging / proof badges, the three drawers every
// screen uses, the inline confirmation panel (the app never uses confirm() / prompt()) and the charts that
// Bills does not have. Money / date text, KPI cards and the generic charts come from billsUi.js -- the same
// look across Bills and Refunds is deliberate, and so is the shared (bl-) layout CSS.
import { esc, fmtDate, fmtDateTime, fmtBytes, kv, errorsText, money, moneyShort, plural, friendly, emptyBox, progressBar, donut, hbars, stackedHbars, COLORS, kpiCard } from './billsUi.js?v=20261007j';
export { esc, fmtDate, fmtDateTime, fmtBytes, kv, errorsText, money, moneyShort, plural, friendly, emptyBox, progressBar, donut, hbars, stackedHbars, COLORS, kpiCard };

export const REFUND_COLORS = { 'Pending Approval': '#e0a030', 'Under Review': '#d9b24a', 'Needs Information': '#d9602a', 'On Hold': '#a9805a', 'Approved - Waiting Payment': '#1a56b0',
  'Partially Refunded': '#e07b30', Completed: '#2e7d32', Rejected: '#c62828', Cancelled: '#9aa4ad', requested: '#1a56b0', refunded: '#2e7d32' };
export const statusColor = (s) => REFUND_COLORS[s] || COLORS.gray;

// ---------------------------------------------------------------- badges
const ST = { 'Pending Approval': 'pending', 'Under Review': 'review', 'Needs Information': 'info', 'On Hold': 'hold', Approved: 'approved', 'Approved - Waiting Payment': 'approved',
  'Partially Refunded': 'partial', 'Fully Refunded': 'completed', Completed: 'completed', Rejected: 'rejected', Cancelled: 'cancelled', 'Not Yet Refunded': 'gray' };
const badge = (text, cls) => '<span class="badge rf-st rf-st-' + cls + '">' + esc(text) + '</span>';
/** The one status people see: approval and payment combined ("Approved - Waiting Payment", "Partially Refunded", ...). */
export const statusBadge = (s) => badge(s, ST[s] || 'gray');
export const approvalBadge = (s) => badge(s, ST[s] || 'gray');
export const paymentBadge = (s) => badge(s || 'Not Yet Refunded', ST[s] || 'gray');
export const priorityBadge = (p) => '<span class="badge rf-pr rf-pr-' + String(p || 'Normal').toLowerCase() + '">' + esc(p || 'Normal') + '</span>';
export const tagBadge = (text, cls) => '<span class="badge bl-tag ' + (cls || '') + '">' + esc(text) + '</span>';
const PF = { Verified: 'completed', 'Proof Uploaded': 'approved', 'Partial Proof': 'partial', 'No Proof': 'rejected', 'n/a': 'gray' };
export const proofBadge = (p) => p === 'n/a' ? '<span class="muted">—</span>' : badge(p, PF[p] || 'gray');
const AG = { '0-3': 'a0', '4-7': 'a1', '8-14': 'a2', '15-30': 'a3', '30+': 'a4' };
export const agingBadge = (key, days) => '<span class="badge rf-ag rf-ag-' + (AG[key] || 'a0') + '" title="' + esc(plural(days, 'day')) + ' since requested">' + esc(plural(days, 'day')) + '</span>';

/** Extra flags shown next to the status (flagged, duplicate warning, data-quality). */
export function flagBadges(r) {
  let h = '';
  if (r.flagged) h += ' ' + tagBadge('⚑ Flagged', 'rf-tag-flag');
  if (r.duplicate_flag) h += ' ' + tagBadge('Possible duplicate', 'bl-tag-yellow');
  if (r._over > 0) h += ' ' + tagBadge('Check payments', 'rf-tag-flag');
  if (r._followWarn) h += ' ' + tagBadge(r.follow_up_count + ' follow-ups', 'rf-tag-flag');
  return h;
}
/** "5 days" for an open refund, "—" once it is closed. */
export const ageText = (r) => r._open ? plural(r._age, 'day') : '—';

// ---------------------------------------------------------------- drawers
const $ = (id) => document.getElementById(id);
function drawer(name, title, wide) {
  return '<div class="drawer-backdrop" id="rf-' + name + '-backdrop"></div>' +
    '<div class="drawer bl-drawer' + (wide ? ' bl-drawer-wide' : '') + '" id="rf-' + name + '-drawer" role="dialog" aria-modal="true" aria-labelledby="rf-' + name + '-title">' +
    '<div class="drawer-header"><div><h3 id="rf-' + name + '-title">' + esc(title) + '</h3><div class="muted" id="rf-' + name + '-sub"></div></div>' +
    '<button type="button" class="drawer-close" id="rf-' + name + '-close" aria-label="Close">✕</button></div>' +
    '<div class="drawer-body" id="rf-' + name + '-body"></div>' +
    '<div class="drawer-footer" id="rf-' + name + '-footer"></div></div>';
}
/** The toast area and the three drawers (request detail, new / edit form, and one small side drawer for payments, uploads, notes ...). */
export const drawersHtml = () => '<div id="rf-toast" class="bl-toast" aria-live="polite"></div>' + drawer('detail', 'Refund', true) + drawer('form', 'Refund', true) + drawer('side', '', false);

export function openDrawer(name, { title, sub, body, footer }) {
  $('rf-' + name + '-title').textContent = title || '';
  $('rf-' + name + '-sub').textContent = sub || '';
  $('rf-' + name + '-body').innerHTML = body || '';
  $('rf-' + name + '-footer').innerHTML = footer || '';
  $('rf-' + name + '-footer').hidden = !footer;
  $('rf-' + name + '-body').scrollTop = 0;
  $('rf-' + name + '-backdrop').classList.add('open');
  $('rf-' + name + '-drawer').classList.add('open');
}
export function closeDrawer(name) {
  const d = $('rf-' + name + '-drawer');
  if (!d) return;
  $('rf-' + name + '-backdrop').classList.remove('open');
  d.classList.remove('open');
}
export const isDrawerOpen = (name) => !!$('rf-' + name + '-drawer') && $('rf-' + name + '-drawer').classList.contains('open');
export const drawerBody = (name) => $('rf-' + name + '-body');
export const setDrawerTitle = (name, title, sub) => { $('rf-' + name + '-title').textContent = title || ''; $('rf-' + name + '-sub').textContent = sub || ''; };

export function makeToast() {
  let timer = null;
  return (text, isError) => {
    const el = $('rf-toast');
    if (!el) return;
    el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(isError ? friendly(text) : text) + '</div>';
    clearTimeout(timer);
    timer = setTimeout(() => { el.innerHTML = ''; }, isError ? 9000 : 4500);
  };
}

/** Inline confirmation / reason panel at the top of a drawer. `fields` is raw HTML for extra inputs (a reason box etc.).
 * onOk returns when done (throw to show the message and keep the panel open). */
export function actionPanel(drawerName, { title, message, fields, okLabel, danger, onOk, onCancel, wide }) {
  const slot = $('rf-' + drawerName + '-msg');
  if (!slot) return;
  slot.innerHTML = '<div class="lv-action-panel' + (danger ? ' lv-danger' : '') + (wide ? ' rf-panel-wide' : '') + '"><h4>' + title + '</h4>' + (message ? '<p>' + message + '</p>' : '') + (fields || '') +
    '<div id="rf-act-err"></div><div class="lv-action-buttons"><button type="button" class="btn' + (danger ? ' lv-btn-danger' : '') + '" id="rf-act-ok">' + okLabel +
    '</button><button type="button" class="btn secondary" id="rf-act-back">Back</button></div></div>';
  $('rf-' + drawerName + '-body').scrollTop = 0;
  const first = slot.querySelector('textarea, input:not([type=checkbox]), select');
  if (first) first.focus();
  $('rf-act-back').addEventListener('click', () => { slot.innerHTML = ''; if (onCancel) onCancel(); });
  $('rf-act-ok').addEventListener('click', async () => {
    const ok = $('rf-act-ok');
    ok.disabled = true;
    try { await onOk(slot); } catch (err) {
      $('rf-act-err').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>';
      ok.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- charts
/** Clustered columns, one pair per month: what was requested next to what was actually refunded. data = [{ label, a, b }] */
export function columnPairs(data, { format, aLabel, bLabel }) {
  const fmt = format || String;
  const W = 560, H = 200, padL = 8, padB = 30, padT = 22, n = data.length || 1, step = (W - padL * 2) / n, bw = Math.max(6, Math.min(26, step / 2 - 4));
  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
  const Y = (v) => H - padB - (v / max) * (H - padB - padT);
  const cols = data.map((d, i) => {
    const cx = padL + i * step + step / 2;
    const bar = (v, x, color, label) => v > 0 ? '<rect x="' + x.toFixed(1) + '" y="' + Y(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (H - padB - Y(v)).toFixed(1) + '" rx="2" fill="' + color + '"><title>' + esc(d.label + ' · ' + label + ': ' + fmt(v)) + '</title></rect>' : '';
    return bar(d.a, cx - bw - 1, REFUND_COLORS.requested, aLabel) + bar(d.b, cx + 1, REFUND_COLORS.refunded, bLabel) +
      '<text x="' + cx.toFixed(1) + '" y="' + (H - padB + 15) + '" text-anchor="middle" class="bl-axis">' + esc(d.label) + '</text>';
  }).join('');
  const grid = [0.5, 1].map((f) => '<line x1="' + padL + '" x2="' + (W - padL) + '" y1="' + Y(max * f).toFixed(1) + '" y2="' + Y(max * f).toFixed(1) + '" class="bl-grid"/><text x="' + padL + '" y="' + (Y(max * f) - 3).toFixed(1) + '" class="bl-axis">' + esc(moneyShort(max * f)) + '</text>').join('');
  return '<svg class="bl-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aLabel + ' and ' + bLabel + ' by month') + '">' + grid +
    '<line x1="' + padL + '" x2="' + (W - padL) + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '" class="bl-grid"/>' + cols + '</svg>' +
    '<ul class="bl-legend bl-legend-row"><li><span class="bl-swatch" style="background:' + REFUND_COLORS.requested + '"></span>' + esc(aLabel) + '</li><li><span class="bl-swatch" style="background:' + REFUND_COLORS.refunded + '"></span>' + esc(bLabel) + '</li></ul>';
}

/** A figure with this month's change against last month's: "▲ 20%" / "▼ 5%" / "no change". `inverse` = going up is bad. */
export function changeText(now, before, { inverse, money: isMoney } = {}) {
  if (before === null || before === undefined) return '<span class="muted">—</span>';
  if (now === before) return '<span class="muted">no change</span>';
  const up = now > before, good = inverse ? !up : up;
  const pct = before === 0 ? null : Math.round(Math.abs((now - before) / before) * 100);
  return '<span class="' + (good ? 'lv-pos' : 'lv-neg') + '">' + (up ? '▲ ' : '▼ ') + (pct === null ? (isMoney ? moneyShort(Math.abs(now - before)) : Math.abs(now - before)) : pct + '%') + '</span>';
}
