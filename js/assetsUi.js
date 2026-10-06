// Assets & Supplies Custodian -- shared display helpers: status / condition badges, attention chips, the drawers every screen uses, the inline
// confirmation panel (the app never uses confirm() / prompt()), pickers for people and branches, and a few chart helpers. KPI cards, number
// formatting and the generic charts come from billsUi.js -- the same look across the modules is deliberate, and so is the shared (bl-) layout CSS.
import { esc, fmtDate, fmtDateTime, fmtBytes, kv, errorsText, plural, friendly, emptyBox, progressBar, donut, hbars, stackedHbars, COLORS, kpiCard, tagBadge } from './billsUi.js?v=20261006d';
import { branchBadge, branchColor } from './branchColors.js?v=20261006d';
import { money } from './assetsLogic.js?v=20261006d';
export { esc, fmtDate, fmtDateTime, fmtBytes, kv, errorsText, plural, friendly, emptyBox, progressBar, donut, hbars, stackedHbars, COLORS, kpiCard, tagBadge, branchBadge, branchColor, money };

export const qty = (n) => (n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 }));
export const dash = (v) => (v === null || v === undefined || v === '' ? '—' : esc(v));
export const dt = (d) => (d ? esc(fmtDate(String(d).slice(0, 10))) : '—');
export const field = (label, inner, extra) => '<div class="field"' + (extra && extra.id ? ' id="' + extra.id + '"' : '') + (extra && extra.hidden ? ' hidden' : '') + '><label>' + label + '</label>' + inner + '</div>';
export const opts = (list, cur, any) => (any === undefined ? '' : '<option value="">' + esc(any) + '</option>') + list.map((x) => { const v = typeof x === 'object' ? x.value : x, l = typeof x === 'object' ? x.label : x; return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');

// ---------------------------------------------------------------- status colours
export const STATUS_CLASS = { Available: 'avail', Assigned: 'assigned', 'In Use': 'inuse', 'In Storage': 'storage', Transferred: 'transit', 'Under Maintenance': 'repair', 'Under Repair': 'repair', Damaged: 'bad', Missing: 'bad', Lost: 'bad',
  'For Return': 'return', Returned: 'returned', 'For Disposal': 'disposal', Disposed: 'gone', Archived: 'gone' };
export const STATUS_COLOR = { Available: '#2e7d32', Assigned: '#1a56b0', 'In Use': '#5b8bd4', 'In Storage': '#7a8a99', Transferred: '#7b5fb5', 'Under Maintenance': '#e07b30', 'Under Repair': '#e07b30', Damaged: '#c62828', Missing: '#a31515', Lost: '#a31515',
  'For Return': '#e0a030', Returned: '#4a9d6a', 'For Disposal': '#8d5524', Disposed: '#9aa4ad', Archived: '#c3cad1' };
export const statusColor = (s) => STATUS_COLOR[s] || COLORS.gray;
export const statusBadge = (s) => '<span class="badge ac-st ac-st-' + (STATUS_CLASS[s] || 'gone') + '">' + esc(s) + '</span>';
const COND = { New: 'good', Excellent: 'good', Good: 'good', Fair: 'fair', 'Needs Repair': 'warn', Damaged: 'bad', Unserviceable: 'bad' };
export const conditionBadge = (c) => '<span class="badge ac-cond ac-cond-' + (COND[c] || 'fair') + '">' + esc(c) + '</span>';
const WORKFLOW = { Reported: 'yellow', 'Under Review': 'blue', Resolved: 'green', Closed: 'gray', Requested: 'yellow', Approved: 'blue', 'In Transit': 'purple', Completed: 'green', Rejected: 'red', Cancelled: 'gray', 'For Inspection': 'blue',
  'Waiting for Approval': 'yellow', 'Under Repair': 'orange', 'Waiting for Parts': 'orange', Unrepairable: 'red', 'Pending Approval': 'yellow', 'Approved for Disposal': 'blue', Disposed: 'gray', Draft: 'gray', 'Under Review ': 'blue',
  'Ready for Issue': 'blue', 'Partially Issued': 'orange', Issued: 'purple', Received: 'green', Waitlisted: 'orange' };
/** status of a repair / report / disposal / request / transfer */
export const flowBadge = (s) => '<span class="badge ac-flow ac-flow-' + (WORKFLOW[s] || 'gray') + '">' + esc(s) + '</span>';
export const toneChip = (a) => '<span class="ac-why ac-why-' + a.tone + '">' + esc(a.text) + '</span>';
export const chips = (list, n) => (list.length ? '<div class="ac-whys">' + list.slice(0, n || 3).map(toneChip).join('') + (list.length > (n || 3) ? '<span class="ac-why ac-why-gray">+' + (list.length - (n || 3)) + ' more</span>' : '') + '</div>' : '');
export const stockBadge = (state) => ({ ok: tagBadge('In stock', 'bl-tag-green'), low: tagBadge('Low stock', 'bl-tag-yellow'), out: tagBadge('Out of stock', 'ac-tag-bad'), 'out-some': tagBadge('Out at a branch', 'bl-tag-yellow'), inactive: tagBadge('Inactive', 'bl-tag-gray') }[state] || '');
export const branchName = (ctx, id) => (ctx.branchById[id] || {}).name || '';
export const branchChip = (ctx, id) => (id ? branchBadge(esc, branchName(ctx, id), id, ctx.branches) : '<span class="muted">—</span>');

// ---------------------------------------------------------------- pickers
/** <option>s of people. `left` people are hidden unless `includeLeft` (they can still be shown when already chosen). */
export function personOptions(ctx, { selected = '', any = 'Choose…', includeLeft = false, onlyActive = true, branch = '' } = {}) {
  const list = Object.values(ctx.personById).filter((p) => (includeLeft || !p.left || p.id === selected) && (!onlyActive || p.status === 'Active' || p.id === selected) && (!branch || String(p.branch_id) === String(branch)))
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  return '<option value="">' + esc(any) + '</option>' + list.map((p) => '<option value="' + p.id + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.full_name) + (p.position ? ' — ' + esc(p.job_title || p.position) : '') + (p.left ? ' (left)' : '') + '</option>').join('');
}
export const branchOptions = (ctx, selected, any) => (any === undefined ? '' : '<option value="">' + esc(any) + '</option>') + ctx.branches.map((b) => '<option value="' + b.id + '"' + (String(selected) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
export const categoryOptions = (ctx, kind, selected, any) => (any === undefined ? '' : '<option value="">' + esc(any) + '</option>') + ctx.cats.filter((c) => c.kind === kind && (c.active || c.id === Number(selected))).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  .map((c) => '<option value="' + c.id + '"' + (String(selected) === String(c.id) ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');

// ---------------------------------------------------------------- drawers
const $ = (id) => document.getElementById(id);
function drawer(name, title, wide) {
  return '<div class="drawer-backdrop" id="ac-' + name + '-backdrop"></div>' +
    '<div class="drawer bl-drawer' + (wide ? ' bl-drawer-wide' : '') + '" id="ac-' + name + '-drawer" role="dialog" aria-modal="true" aria-labelledby="ac-' + name + '-title">' +
    '<div class="drawer-header"><div><h3 id="ac-' + name + '-title">' + esc(title) + '</h3><div class="muted" id="ac-' + name + '-sub"></div></div>' +
    '<button type="button" class="drawer-close" id="ac-' + name + '-close" aria-label="Close">✕</button></div>' +
    '<div class="drawer-body" id="ac-' + name + '-body"></div>' +
    '<div class="drawer-footer" id="ac-' + name + '-footer"></div></div>';
}
/** The toast area and the four drawers (asset card, add / edit form, work panels, and one more for scanning / printing). */
export const drawersHtml = () => '<div id="ac-toast" class="bl-toast" aria-live="polite"></div>' + drawer('detail', 'Asset', true) + drawer('form', 'Asset', true) + drawer('side', '', true) + drawer('aux', '', false);

export function openDrawer(name, { title, sub, body, footer }) {
  $('ac-' + name + '-title').textContent = title || '';
  $('ac-' + name + '-sub').textContent = sub || '';
  $('ac-' + name + '-body').innerHTML = body || '';
  $('ac-' + name + '-footer').innerHTML = footer || '';
  $('ac-' + name + '-footer').hidden = !footer;
  $('ac-' + name + '-body').scrollTop = 0;
  $('ac-' + name + '-backdrop').classList.add('open');
  $('ac-' + name + '-drawer').classList.add('open');
}
export function closeDrawer(name) {
  const d = $('ac-' + name + '-drawer');
  if (!d) return;
  $('ac-' + name + '-backdrop').classList.remove('open');
  d.classList.remove('open');
}
export const isDrawerOpen = (name) => !!$('ac-' + name + '-drawer') && $('ac-' + name + '-drawer').classList.contains('open');
export const drawerBody = (name) => $('ac-' + name + '-body');
export const setDrawerTitle = (name, title, sub) => { $('ac-' + name + '-title').textContent = title || ''; $('ac-' + name + '-sub').textContent = sub || ''; };

export function makeToast() {
  let timer = null;
  return (text, isError) => {
    const el = $('ac-toast');
    if (!el) return;
    el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(isError ? friendly(text) : text) + '</div>';
    clearTimeout(timer);
    timer = setTimeout(() => { el.innerHTML = ''; }, isError ? 9000 : 4500);
  };
}

/** Inline confirmation / reason panel at the top of a drawer. `fields` is raw HTML for extra inputs (a reason box etc.).
 * onOk returns when done (throw to show the message and keep the panel open). */
export function actionPanel(drawerName, { title, message, fields, okLabel, danger, onOk, onCancel }) {
  const slot = $('ac-' + drawerName + '-msg');
  if (!slot) return;
  slot.innerHTML = '<div class="lv-action-panel' + (danger ? ' lv-danger' : '') + '"><h4>' + title + '</h4>' + (message ? '<p>' + message + '</p>' : '') + (fields || '') +
    '<div id="ac-act-err"></div><div class="lv-action-buttons"><button type="button" class="btn' + (danger ? ' lv-btn-danger' : '') + '" id="ac-act-ok">' + okLabel +
    '</button><button type="button" class="btn secondary" id="ac-act-back">Back</button></div></div>';
  $('ac-' + drawerName + '-body').scrollTop = 0;
  const first = slot.querySelector('textarea, input:not([type=checkbox]), select');
  if (first) first.focus();
  $('ac-act-back').addEventListener('click', () => { slot.innerHTML = ''; if (onCancel) onCancel(); });
  $('ac-act-ok').addEventListener('click', async () => {
    const ok = $('ac-act-ok');
    ok.disabled = true;
    try { await onOk(slot); } catch (err) {
      $('ac-act-err').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>';
      ok.disabled = false;
    }
  });
}
/** A confirmation that is not tied to an open card (list-row actions): the side drawer opens straight onto the inline panel. */
export function confirmSide(opts2) {
  openDrawer('side', { title: opts2.drawerTitle || 'Please confirm', sub: opts2.sub || '', body: '<div id="ac-side-msg"></div>', footer: '' });
  actionPanel('side', { ...opts2, onCancel: () => closeDrawer('side') });
}
let activeDetail = null;
/** One click handler for the card drawer, bound once; it always runs the handlers of whichever card (asset, employee, supply, request) is open now. */
export function setDetailHandlers(handlers, toast) {
  activeDetail = { handlers, toast };
  const root = $('ac-detail-drawer');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el) || el.closest('#ac-detail-msg')) return;
    e.preventDefault();
    const h = activeDetail && activeDetail.handlers[el.dataset.act];
    if (h) { Promise.resolve(h(el)).catch((err) => activeDetail.toast(err, true)); const m = el.closest('details.bl-more'); if (m && el.closest('.lv-row-actions')) m.open = false; }
  });
}
export const must = (res) => { if (res && res.ok === false) { const e = new Error(errorsText(res)); e.res = res; throw e; } return res; };
export const val = (id) => ($(id) ? $(id).value : '');

// ---------------------------------------------------------------- the small stat blocks the cards use
export const statBlock = (label, value, cls) => '<div class="bl-sum-cell"><span class="muted">' + esc(label) + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</b></div>';
/** One row of an alert list: a title link, a detail line and (optionally) buttons. */
export const alertItem = ({ link, id, kind, title, sub, detail, right }) => '<div class="bl-alert-row"><div class="bl-alert-main"><button type="button" class="bl-link" data-open="' + esc(kind || 'asset') + '" data-id="' + esc(id) + '">' + esc(link) + '</button> <b>' + esc(title || '') + '</b>' +
  (sub ? '<div class="muted">' + esc(sub) + '</div>' : '') + (detail ? '<div class="ac-whys">' + detail + '</div>' : '') + '</div>' + (right ? '<div class="bl-alert-amt">' + right + '</div>' : '') + '</div>';
