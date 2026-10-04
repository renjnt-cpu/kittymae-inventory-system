// Bills Management -- shared display helpers: money and date text, status / priority badges, KPI cards,
// the drawers every screen uses, the inline confirmation panel (the app never uses confirm() / prompt())
// and the charts. Charts are plain SVG or CSS bars: no chart library, nothing loaded from the internet.
import { esc, fmtDate, fmtDateTime, fmtBytes, kv, errorsText } from './leaveUi.js?v=20261004e';
export { esc, fmtDate, fmtDateTime, fmtBytes, kv, errorsText };

export const money = (n) => (n === null || n === undefined || n === '') ? '—' : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₱1.2M / ₱35K -- for chart labels and tight spots */
export const moneyShort = (n) => {
  const v = Number(n) || 0, a = Math.abs(v);
  if (a >= 1e6) return '₱' + (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return '₱' + (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return '₱' + Math.round(v);
};
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

/** "Overdue by 5 days" / "Due today" / "Due in 3 days" */
export function daysText(b) {
  if (b._days === null) return 'No due date';
  if (b._eff === 'Paid' || b._eff === 'Auto-Debited') return 'Settled';
  if (b._eff === 'Cancelled' || b._eff === 'Archived') return '—';
  if (b._days < 0) return 'Overdue by ' + plural(-b._days, 'day');
  if (b._days === 0) return 'Due today';
  return 'Due in ' + plural(b._days, 'day');
}
/** short form for table cells: "-5d", "today", "+3d" */
export function daysShort(b) {
  if (b._days === null || !b._open) return '';
  return b._days < 0 ? b._days + 'd' : b._days === 0 ? 'today' : '+' + b._days + 'd';
}

// ---------------------------------------------------------------- badges
const ST = { Paid: 'paid', 'Auto-Debited': 'auto', Unpaid: 'unpaid', 'Partially Paid': 'partial', 'Due Soon': 'soon', 'Due Today': 'today', Overdue: 'overdue', Cancelled: 'gray', Archived: 'gray' };
export const statusBadge = (eff) => '<span class="badge bl-st bl-st-' + (ST[eff] || 'gray') + '">' + esc(eff) + '</span>';
const PS = { Paid: 'paid', 'Partially Paid': 'partial', Unpaid: 'gray' };
export const payBadge = (ps) => '<span class="badge bl-st bl-st-' + (PS[ps] || 'gray') + '">' + esc(ps || 'Unpaid') + '</span>';
export const prioBadge = (p) => '<span class="badge bl-pr bl-pr-' + String(p || 'Medium').toLowerCase() + '">' + esc(p || 'Medium') + '</span>';
export const tagBadge = (text, cls) => '<span class="badge bl-tag ' + (cls || '') + '">' + esc(text) + '</span>';

/** Badges for one bill, in the order the report table and the detail card use them. */
export function billBadges(b) {
  let h = statusBadge(b._eff);
  if (b.payment_status === 'Partially Paid' && b._eff !== 'Partially Paid') h += ' ' + payBadge('Partially Paid');
  if (b.payment_type === 'Auto-Debit' && b._eff !== 'Auto-Debited') h += ' ' + tagBadge('Auto-debit', 'bl-tag-blue');
  if (b.is_recurring) h += ' ' + tagBadge('Recurring', 'bl-tag-recurring');
  if (b._prio === 'Critical' || b._prio === 'High') h += ' ' + prioBadge(b._prio);
  return h;
}

// ---------------------------------------------------------------- cards
/** A dashboard KPI card. `tone` colours the number (green / yellow / orange / red / blue / gray). Clickable when `go` is given. */
export function kpiCard({ label, value, sub, tone, go, hint }) {
  const tag = go ? 'button type="button" data-go="' + esc(go) + '"' : 'div';
  return '<' + tag + ' class="bl-kpi bl-tone-' + (tone || 'gray') + (go ? ' bl-kpi-click' : '') + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '>' +
    '<span class="bl-kpi-label">' + esc(label) + '</span><span class="bl-kpi-value">' + value + '</span>' +
    (sub ? '<span class="bl-kpi-sub">' + sub + '</span>' : '') + '</' + (go ? 'button' : 'div') + '>';
}
export const emptyBox = (text) => '<div class="empty-state"><div class="empty-state-msg">' + text + '</div></div>';
export const progressBar = (pct, tone) => '<div class="bl-progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><span class="bl-fill-' + (tone || 'paid') + '" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></span></div>';

// ---------------------------------------------------------------- drawers
const $ = (id) => document.getElementById(id);
function drawer(name, title, wide) {
  return '<div class="drawer-backdrop" id="bl-' + name + '-backdrop"></div>' +
    '<div class="drawer bl-drawer' + (wide ? ' bl-drawer-wide' : '') + '" id="bl-' + name + '-drawer" role="dialog" aria-modal="true" aria-labelledby="bl-' + name + '-title">' +
    '<div class="drawer-header"><div><h3 id="bl-' + name + '-title">' + esc(title) + '</h3><div class="muted" id="bl-' + name + '-sub"></div></div>' +
    '<button type="button" class="drawer-close" id="bl-' + name + '-close" aria-label="Close">✕</button></div>' +
    '<div class="drawer-body" id="bl-' + name + '-body"></div>' +
    '<div class="drawer-footer" id="bl-' + name + '-footer"></div></div>';
}
/** The toast area and the three drawers (bill detail, add / edit form, and one small side drawer for payments, uploads and settings forms). */
export const drawersHtml = () => '<div id="bl-toast" class="bl-toast" aria-live="polite"></div>' +
  drawer('detail', 'Bill', true) + drawer('form', 'Bill', true) + drawer('side', '', false);

export function openDrawer(name, { title, sub, body, footer }) {
  $('bl-' + name + '-title').textContent = title || '';
  $('bl-' + name + '-sub').textContent = sub || '';
  $('bl-' + name + '-body').innerHTML = body || '';
  $('bl-' + name + '-footer').innerHTML = footer || '';
  $('bl-' + name + '-footer').hidden = !footer;
  $('bl-' + name + '-body').scrollTop = 0;
  $('bl-' + name + '-backdrop').classList.add('open');
  $('bl-' + name + '-drawer').classList.add('open');
}
export function closeDrawer(name) {
  const d = $('bl-' + name + '-drawer');
  if (!d) return;
  $('bl-' + name + '-backdrop').classList.remove('open');
  d.classList.remove('open');
}
export const isDrawerOpen = (name) => !!$('bl-' + name + '-drawer') && $('bl-' + name + '-drawer').classList.contains('open');
export const drawerBody = (name) => $('bl-' + name + '-body');
export const drawerFooter = (name) => $('bl-' + name + '-footer');
export const setDrawerTitle = (name, title, sub) => { $('bl-' + name + '-title').textContent = title || ''; $('bl-' + name + '-sub').textContent = sub || ''; };

const TECHNICAL = /violates|constraint|relation "|syntax error|null value|permission denied|JSON|invalid input|duplicate key|does not exist|PGRST|JWT|Failed to fetch|NetworkError|timeout/i;
/** Turns any thrown error into a sentence a person can act on. */
export const friendly = (err) => {
  const t = String((err && err.message) || err);
  return TECHNICAL.test(t) ? 'Something went wrong and the change was not saved. Please try again — if it keeps happening, tell an Admin. (Details: ' + t + ')' : t;
};
export function makeToast() {
  let timer = null;
  return (text, isError) => {
    const el = $('bl-toast');
    if (!el) return;
    el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(isError ? friendly(text) : text) + '</div>';
    clearTimeout(timer);
    timer = setTimeout(() => { el.innerHTML = ''; }, isError ? 9000 : 4500);
  };
}

/** Inline confirmation / reason panel at the top of a drawer. `fields` is raw HTML for extra inputs (a reason box etc.).
 * onOk returns when done (throw to show the message and keep the panel open). */
export function actionPanel(drawerName, { title, message, fields, okLabel, danger, onOk, onCancel }) {
  const slot = $('bl-' + drawerName + '-msg');
  if (!slot) return;
  slot.innerHTML = '<div class="lv-action-panel' + (danger ? ' lv-danger' : '') + '"><h4>' + title + '</h4>' + (message ? '<p>' + message + '</p>' : '') + (fields || '') +
    '<div id="bl-act-err"></div><div class="lv-action-buttons"><button type="button" class="btn' + (danger ? ' lv-btn-danger' : '') + '" id="bl-act-ok">' + okLabel +
    '</button><button type="button" class="btn secondary" id="bl-act-back">Back</button></div></div>';
  $('bl-' + drawerName + '-body').scrollTop = 0;
  const first = slot.querySelector('textarea, input, select');
  if (first) first.focus();
  $('bl-act-back').addEventListener('click', () => { slot.innerHTML = ''; if (onCancel) onCancel(); });
  $('bl-act-ok').addEventListener('click', async () => {
    const ok = $('bl-act-ok');
    ok.disabled = true;
    try { await onOk(slot); } catch (err) {
      $('bl-act-err').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>';
      ok.disabled = false;
    }
  });
}

/** A confirmation that is not tied to an open bill (list-row actions): the side drawer opens straight onto the inline panel. */
export function confirmSide(opts) {
  openDrawer('side', { title: opts.drawerTitle || 'Please confirm', sub: opts.sub || '', body: '<div id="bl-side-msg"></div>', footer: '' });
  actionPanel('side', { ...opts, onCancel: () => closeDrawer('side') });
}

// ---------------------------------------------------------------- charts
export const COLORS = { paid: '#2e7d32', unpaid: '#1a56b0', partial: '#e0a030', soon: '#e0a030', today: '#d9602a', overdue: '#c62828', auto: '#5b8bd4', gray: '#9aa4ad',
  Critical: '#a31515', High: '#d9602a', Medium: '#1a56b0', Low: '#9aa4ad', billed: '#1a56b0' };
const STATUS_COLOR = { Paid: COLORS.paid, 'Auto-Debited': COLORS.auto, Unpaid: COLORS.unpaid, 'Partially Paid': COLORS.partial, 'Due Soon': COLORS.soon, 'Due Today': COLORS.today, Overdue: COLORS.overdue, Cancelled: COLORS.gray, Archived: COLORS.gray };
export const statusColor = (s) => STATUS_COLOR[s] || COLORS.gray;

/** Donut with the total in the middle and a legend underneath. items = [{ label, value, color }] */
export function donut(items, { center, centerSub, format }) {
  const fmt = format || ((v) => String(v));
  const data = items.filter((i) => i.value > 0), total = data.reduce((s, i) => s + i.value, 0);
  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = total ? data.map((i) => {
    const len = (i.value / total) * c;
    const seg = '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + i.color + '" stroke-width="22" stroke-dasharray="' + len.toFixed(2) + ' ' + (c - len).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 70 70)"><title>' + esc(i.label) + ': ' + esc(fmt(i.value)) + '</title></circle>';
    offset += len;
    return seg;
  }).join('') : '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="#eee" stroke-width="22"/>';
  return '<div class="bl-donut"><svg viewBox="0 0 140 140" role="img" aria-label="' + esc(items.filter((i) => i.value > 0).map((i) => i.label + ' ' + fmt(i.value)).join(', ') || 'No data') + '">' + arcs +
    '<text x="70" y="68" text-anchor="middle" class="bl-donut-num">' + esc(center === undefined ? total : center) + '</text>' +
    (centerSub ? '<text x="70" y="84" text-anchor="middle" class="bl-donut-sub">' + esc(centerSub) + '</text>' : '') + '</svg>' +
    '<ul class="bl-legend">' + (data.length ? data.map((i) => '<li><span class="bl-swatch" style="background:' + i.color + '"></span>' + esc(i.label) + ' <b>' + esc(fmt(i.value)) + '</b></li>').join('') : '<li class="muted">Nothing to show yet</li>') + '</ul></div>';
}

/** Horizontal bars, one row per item: label, bar, value. items = [{ label, value, sub }] */
export function hbars(items, { format, color, max }) {
  if (!items.length) return '<p class="muted">Nothing to show yet.</p>';
  const m = max || Math.max(...items.map((i) => i.value), 1);
  return '<div class="bl-hbars">' + items.map((i) =>
    '<div class="bl-hbar"><div class="bl-hbar-label" title="' + esc(i.label) + '">' + esc(i.label) + (i.sub ? '<span class="muted"> ' + esc(i.sub) + '</span>' : '') + '</div>' +
    '<div class="bl-hbar-track"><span style="width:' + Math.max(1, (i.value / m) * 100).toFixed(1) + '%;background:' + (i.color || color || COLORS.billed) + '"></span></div>' +
    '<div class="bl-hbar-value">' + esc((format || String)(i.value)) + '</div></div>').join('') + '</div>';
}

/** Horizontal stacked bars (one per row) split into coloured segments. rows = [{ label, parts: { key: value } }], segments = [{ key, label, color }] */
export function stackedHbars(rows, segments, { format }) {
  if (!rows.length) return '<p class="muted">Nothing to show yet.</p>';
  const fmt = format || String;
  const max = Math.max(...rows.map((r) => segments.reduce((s, g) => s + (r.parts[g.key] || 0), 0)), 1);
  return '<div class="bl-hbars">' + rows.map((r) => {
    const tot = segments.reduce((s, g) => s + (r.parts[g.key] || 0), 0);
    return '<div class="bl-hbar"><div class="bl-hbar-label" title="' + esc(r.label) + '">' + esc(r.label) + '</div><div class="bl-hbar-track bl-stack" style="width:100%">' +
      '<div class="bl-stack-inner" style="width:' + Math.max(tot ? 1 : 0, (tot / max) * 100).toFixed(1) + '%">' +
      segments.map((g) => (r.parts[g.key] || 0) > 0 ? '<span title="' + esc(g.label + ': ' + fmt(r.parts[g.key])) + '" style="flex:' + r.parts[g.key] + ';background:' + g.color + '"></span>' : '').join('') +
      '</div></div><div class="bl-hbar-value">' + esc(fmt(tot)) + '</div></div>';
  }).join('') + '</div><ul class="bl-legend bl-legend-row">' + segments.map((g) => '<li><span class="bl-swatch" style="background:' + g.color + '"></span>' + esc(g.label) + '</li>').join('') + '</ul>';
}

/** Vertical stacked columns (one per bucket) -- cash needed per week split by priority. data = [{ label, parts, total }] */
export function stackedColumns(data, segments, { format }) {
  const fmt = format || String;
  const W = 560, H = 190, padL = 8, padB = 34, padT = 22, n = data.length || 1, bw = Math.min(70, (W - padL * 2) / n - 14);
  const max = Math.max(...data.map((d) => d.total), 1);
  const step = (W - padL * 2) / n;
  const cols = data.map((d, i) => {
    const x = padL + i * step + (step - bw) / 2;
    let y = H - padB;
    const parts = segments.map((g) => {
      const v = d.parts[g.key] || 0;
      if (v <= 0) return '';
      const h = (v / max) * (H - padB - padT);
      y -= h;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + g.color + '"><title>' + esc(d.label + ' · ' + g.label + ': ' + fmt(v)) + '</title></rect>';
    }).join('');
    return parts + '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle" class="bl-axis-val">' + esc(d.total ? moneyShort(d.total) : '') + '</text>' +
      '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - padB + 15) + '" text-anchor="middle" class="bl-axis">' + esc(d.label) + '</text>';
  }).join('');
  return '<svg class="bl-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cash needed per week">' +
    '<line x1="' + padL + '" x2="' + (W - padL) + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '" class="bl-grid"/>' + cols + '</svg>' +
    '<ul class="bl-legend bl-legend-row">' + segments.map((g) => '<li><span class="bl-swatch" style="background:' + g.color + '"></span>' + esc(g.label) + '</li>').join('') + '</ul>';
}

/** Two-series line chart (billed vs paid per month) with a filled area under the billed line and an emphasised last point. */
export function lineChart(points, { format }) {
  const fmt = format || String;
  const W = 560, H = 200, padL = 30, padR = 30, padB = 30, padT = 24; // side room so the first / last month labels are not clipped
  const max = Math.max(...points.flatMap((p) => [p.a, p.b]), 1);
  const n = points.length, step = n > 1 ? (W - padL - padR) / (n - 1) : 0;
  const X = (i) => padL + i * step, Y = (v) => H - padB - (v / max) * (H - padB - padT);
  const line = (key) => points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[key]).toFixed(1)).join(' ');
  const area = line('a') + ' L' + X(n - 1).toFixed(1) + ' ' + (H - padB) + ' L' + X(0).toFixed(1) + ' ' + (H - padB) + ' Z';
  const grid = [0.5, 1].map((f) => '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(max * f).toFixed(1) + '" y2="' + Y(max * f).toFixed(1) + '" class="bl-grid"/><text x="' + padL + '" y="' + (Y(max * f) - 3).toFixed(1) + '" text-anchor="start" class="bl-axis">' + esc(moneyShort(max * f)) + '</text>').join('');
  const last = n - 1;
  return '<svg class="bl-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Billed and paid by month">' + grid +
    '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '" class="bl-grid"/>' +
    '<path d="' + area + '" class="bl-area"/><path d="' + line('a') + '" class="bl-line bl-line-a"/><path d="' + line('b') + '" class="bl-line bl-line-b"/>' +
    points.map((p, i) => '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.a).toFixed(1) + '" r="' + (i === last ? 5 : 3) + '" class="bl-dot-a"><title>' + esc(p.label + ' · billed ' + fmt(p.a) + ' · paid ' + fmt(p.b)) + '</title></circle>' +
      '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.b).toFixed(1) + '" r="' + (i === last ? 5 : 3) + '" class="bl-dot-b"><title>' + esc(p.label + ' · paid ' + fmt(p.b)) + '</title></circle>' +
      '<text x="' + X(i).toFixed(1) + '" y="' + (H - padB + 15) + '" text-anchor="middle" class="bl-axis">' + esc(p.label) + '</text>').join('') +
    '<text x="' + X(last).toFixed(1) + '" y="' + (Y(points[last].a) - 9).toFixed(1) + '" text-anchor="end" class="bl-axis-val">' + esc(moneyShort(points[last].a)) + '</text></svg>' +
    '<ul class="bl-legend bl-legend-row"><li><span class="bl-swatch" style="background:' + COLORS.billed + '"></span>Billed</li><li><span class="bl-swatch" style="background:' + COLORS.paid + '"></span>Paid</li></ul>';
}
