// Sales & Profit Dashboard -- the building blocks every tab uses: KPI cards, panels, empty / error / locked states, badges, a drawer, a toast and the charts.
// Charts are plain SVG (no chart library, nothing loaded from the internet), they scale to the width of their panel, and they never draw NaN: a missing
// figure is left as a gap or a dashed "no data" bar, never as zero.
import { esc, fin, money, moneyShort, int, ARROW, bucketLabel } from './sdCore.js?v=20261011b';
import { hbars, donut, COLORS } from './billsUi.js?v=20261011b';
export { hbars, donut, COLORS };

export const C = { sales: '#1a56b0', gross: '#2e7d32', net: '#8a5a00', cogs: '#d9602a', opex: '#c62828', refunds: '#9b59b6', gray: '#9aa4ad', blue2: '#5b8bd4', yellow: '#e0a030' };
export const PALETTE = ['#1a56b0', '#2e7d32', '#d9602a', '#8a5a00', '#5b8bd4', '#c62828', '#9b59b6', '#16a085', '#e0a030', '#7f8c8d'];

// ---------------------------------------------------------------- small pieces
export const badge = (text, tone) => '<span class="badge sd-badge sd-b-' + (tone || 'gray') + '">' + esc(text) + '</span>';
export const emptyBox = (text) => '<div class="empty-state"><div class="empty-state-msg">' + esc(text) + '</div></div>';
export const lockedBox = (text) => '<div class="sd-locked">🔒 ' + esc(text || 'You do not have access to this part of the dashboard.') + '</div>';
export const loadingBox = (text) => '<div class="sd-loading" role="status"><span class="sd-spin"></span>' + esc(text || 'Loading…') + '</div>';
export const errorBox = (text, retryId) => '<div class="msg error sd-error">' + esc(text) + (retryId ? ' <button type="button" class="btn small secondary" data-retry="' + esc(retryId) + '">Try again</button>' : '') + '</div>';
export const panel = (title, body, o) => {
  o = o || {};
  return '<section class="card sd-panel' + (o.cls ? ' ' + o.cls : '') + '"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' +
    '<div class="sd-panel-head"><div><h3 class="sd-panel-title">' + esc(title) + '</h3>' + (o.sub ? '<div class="muted">' + o.sub + '</div>' : '') + '</div>' + (o.actions ? '<div class="sd-panel-actions">' + o.actions + '</div>' : '') + '</div>' +
    '<div class="sd-panel-body">' + body + '</div></section>';
};
export const kvRow = (label, valueHtml) => '<div class="drawer-kv"><span>' + esc(label) + '</span><b>' + valueHtml + '</b></div>';

/** One KPI card. `value` is ready-made text; `chip` = { dir, text, tone } from change()/toneOf(); `warn` = a short reason the number is incomplete. */
export function kpiCard(k) {
  const chip = k.chip && k.chip.dir !== 'na'
    ? '<span class="sd-chip sd-c-' + esc(k.chip.tone || 'gray') + '"><span aria-hidden="true">' + (ARROW[k.chip.dir] || '') + '</span> ' + esc(k.chip.text) + '</span>'
    : '<span class="sd-chip sd-c-gray">' + esc(k.chip ? k.chip.text : 'No comparison') + '</span>';
  const tag = k.go ? 'button type="button" data-drill="' + esc(k.go) + '"' : 'div';
  return '<' + tag + ' class="sd-kpi sd-tone-' + esc((k.chip && k.chip.tone) || 'gray') + (k.go ? ' sd-kpi-click' : '') + (k.unknown ? ' sd-kpi-unknown' : '') + (k.long ? ' sd-kpi-l' + k.long : '') + '"' + (k.hint ? ' title="' + esc(k.hint) + '"' : '') + '>' +
    '<span class="sd-kpi-label">' + esc(k.label) + (k.warn ? ' ' + badge(k.warn.text, k.warn.tone || 'orange') : '') + '</span>' +
    '<span class="sd-kpi-value">' + k.value + '</span>' +
    (k.sub ? '<span class="sd-kpi-sub">' + k.sub + '</span>' : '') +
    '<span class="sd-kpi-foot">' + chip + '<span class="sd-kpi-prev">' + k.prev + '</span></span>' +
  '</' + (k.go ? 'button' : 'div') + '>';
}

// ---------------------------------------------------------------- drawer + toast (one of each for the whole page)
export function mountShell() {
  if (document.getElementById('sd-drawer')) return;
  document.body.insertAdjacentHTML('beforeend',
    '<div id="sd-toast" class="bl-toast" aria-live="polite"></div>' +
    '<div class="drawer-backdrop" id="sd-drawer-backdrop"></div>' +
    '<div class="drawer sd-drawer" id="sd-drawer" role="dialog" aria-modal="true" aria-labelledby="sd-drawer-title">' +
      '<div class="drawer-header"><div><h3 id="sd-drawer-title"></h3><div class="muted" id="sd-drawer-sub"></div></div><button type="button" class="drawer-close" id="sd-drawer-close" aria-label="Close">✕</button></div>' +
      '<div class="drawer-body" id="sd-drawer-body"></div><div class="drawer-footer" id="sd-drawer-footer" hidden></div></div>');
  document.getElementById('sd-drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('sd-drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isDrawerOpen()) closeDrawer(); });
}
export function openDrawer({ title, sub, body, footer, wide }) {
  const d = document.getElementById('sd-drawer');
  d.classList.toggle('sd-drawer-wide', !!wide);
  document.getElementById('sd-drawer-title').textContent = title || '';
  document.getElementById('sd-drawer-sub').textContent = sub || '';
  document.getElementById('sd-drawer-body').innerHTML = body || '';
  const f = document.getElementById('sd-drawer-footer');
  f.innerHTML = footer || ''; f.hidden = !footer;
  document.getElementById('sd-drawer-body').scrollTop = 0;
  document.getElementById('sd-drawer-backdrop').classList.add('open'); d.classList.add('open');
}
export function closeDrawer() {
  const d = document.getElementById('sd-drawer'); if (!d) return;
  d.classList.remove('open'); document.getElementById('sd-drawer-backdrop').classList.remove('open');
  document.getElementById('sd-drawer-body').innerHTML = '';
}
export const isDrawerOpen = () => !!document.getElementById('sd-drawer') && document.getElementById('sd-drawer').classList.contains('open');
export const drawerBody = () => document.getElementById('sd-drawer-body');
let toastTimer = null;
export function toast(text, isError) {
  const el = document.getElementById('sd-toast'); if (!el) return;
  el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(text) + '</div>';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.innerHTML = ''; }, isError ? 9000 : 4500);
}

// ---------------------------------------------------------------- chart helpers
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function axisRange(values, includeZero) {
  const v = values.filter((x) => x !== null && Number.isFinite(x));
  let min = includeZero ? Math.min(0, ...v) : Math.min(...v), max = includeZero ? Math.max(0, ...v) : Math.max(...v);
  if (max === min) { max = min + 1; if (includeZero && min === 0) min = 0; }
  const step = niceStep((max - min) / 4);
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}
const legend = (items) => '<ul class="bl-legend bl-legend-row sd-legend">' + items.map((s) => '<li><span class="bl-swatch" style="background:' + s.color + '"></span>' + esc(s.label) + '</li>').join('') + '</ul>';
const labelEvery = (n, max) => Math.max(1, Math.ceil(n / max));

/** Lines over time. labels = text per point, series = [{ label, color, values:[number|null], area? }]. A null value is a gap, never a zero. */
export function lineChart({ labels, series, format, height, emptyText }) {
  const fmt = format || moneyShort;
  const all = series.flatMap((s) => s.values).filter((x) => x !== null && Number.isFinite(x));
  if (!labels.length || !all.length) return emptyBox(emptyText || 'Nothing to chart for this period.');
  const W = 720, H = height || 250, padL = 58, padR = 16, padT = 14, padB = 30, n = labels.length;
  const { lo, hi, step } = axisRange(all, true);
  const X = (i) => n === 1 ? (padL + (W - padR)) / 2 : padL + (i * (W - padL - padR)) / (n - 1);
  const Y = (v) => H - padB - ((v - lo) / (hi - lo)) * (H - padB - padT);
  let grid = '';
  for (let t = lo; t <= hi + step / 2; t += step) grid += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" class="bl-grid"' + (Math.abs(t) < 1e-9 ? ' style="stroke:#b9b9b0"' : '') + '/>' +
    '<text x="' + (padL - 6) + '" y="' + (Y(t) + 3).toFixed(1) + '" text-anchor="end" class="bl-axis">' + esc(fmt(t)) + '</text>';
  const every = labelEvery(n, 8);
  const showX = (i) => i % every === 0 || (i === n - 1 && (n - 1) % every >= Math.ceil(every / 2));
  const xl = labels.map((l, i) => showX(i) ? '<text x="' + X(i).toFixed(1) + '" y="' + (H - padB + 16) + '" text-anchor="middle" class="bl-axis">' + esc(l) + '</text>' : '').join('');
  const paths = series.map((s) => {
    let d = '', open = false;
    s.values.forEach((v, i) => { if (v === null || !Number.isFinite(v)) { open = false; return; } d += (open ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' '; open = true; });
    const area = s.area && s.values.every((v) => v !== null && Number.isFinite(v)) && n > 1
      ? '<path d="' + d + 'L' + X(n - 1).toFixed(1) + ' ' + Y(Math.max(lo, Math.min(0, hi))).toFixed(1) + ' L' + X(0).toFixed(1) + ' ' + Y(Math.max(lo, Math.min(0, hi))).toFixed(1) + ' Z" style="fill:' + s.color + ';opacity:.08"/>' : '';
    const dots = s.values.map((v, i) => v === null || !Number.isFinite(v) ? '' : (n <= 40 || i === n - 1)
      ? '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="' + (i === n - 1 ? 4.5 : 2.6) + '" style="fill:' + s.color + '"/>' : '').join('');
    return area + '<path d="' + d + '" class="sd-line" style="stroke:' + s.color + '"/>' + dots;
  }).join('');
  const hit = labels.map((l, i) => {
    const w = n === 1 ? W - padL - padR : (W - padL - padR) / (n - 1);
    const tip = l + '\n' + series.map((s) => s.label + ': ' + (s.values[i] === null || !Number.isFinite(s.values[i]) ? 'no data' : fmt === moneyShort ? money(s.values[i]) : fmt(s.values[i]))).join('\n');
    return '<rect x="' + (X(i) - w / 2).toFixed(1) + '" y="' + padT + '" width="' + w.toFixed(1) + '" height="' + (H - padT - padB) + '" fill="transparent"><title>' + esc(tip) + '</title></rect>';
  }).join('');
  const aria = series.map((s) => s.label).join(', ') + ' over ' + n + ' periods';
  return '<svg class="bl-svg sd-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '">' + grid + paths + xl + hit + '</svg>' + (series.length > 1 || series[0].label ? legend(series) : '');
}

/** Grouped columns per period (Sales vs COGS ...). series = [{ label, color, values:[number|null] }] */
export function columnChart({ labels, series, format, height, emptyText }) {
  const fmt = format || moneyShort;
  const all = series.flatMap((s) => s.values).filter((x) => x !== null && Number.isFinite(x));
  if (!labels.length || !all.length) return emptyBox(emptyText || 'Nothing to chart for this period.');
  const W = 720, H = height || 250, padL = 58, padR = 12, padT = 14, padB = 30, n = labels.length, m = series.length;
  const { lo, hi, step } = axisRange(all, true);
  const Y = (v) => H - padB - ((v - lo) / (hi - lo)) * (H - padB - padT);
  const slot = (W - padL - padR) / n, bw = Math.max(2, Math.min(34, (slot * 0.78) / m));
  let grid = '';
  for (let t = lo; t <= hi + step / 2; t += step) grid += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" class="bl-grid"/>' +
    '<text x="' + (padL - 6) + '" y="' + (Y(t) + 3).toFixed(1) + '" text-anchor="end" class="bl-axis">' + esc(fmt(t)) + '</text>';
  const every = labelEvery(n, 10);
  const bars = labels.map((l, i) => {
    const x0 = padL + i * slot + (slot - bw * m) / 2;
    const tip = l + '\n' + series.map((s) => s.label + ': ' + (s.values[i] === null || !Number.isFinite(s.values[i]) ? 'no data' : fmt === moneyShort ? money(s.values[i]) : fmt(s.values[i]))).join('\n');
    const rects = series.map((s, j) => {
      const v = s.values[i]; if (v === null || !Number.isFinite(v)) return '';
      const y1 = Y(Math.max(v, 0)), y2 = Y(Math.min(v, 0));
      return '<rect x="' + (x0 + j * bw).toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + (bw - 1).toFixed(1) + '" height="' + Math.max(1, y2 - y1).toFixed(1) + '" rx="2" style="fill:' + s.color + '"/>';
    }).join('');
    return '<g><title>' + esc(tip) + '</title>' + rects + (i % every === 0 ? '<text x="' + (padL + i * slot + slot / 2).toFixed(1) + '" y="' + (H - padB + 16) + '" text-anchor="middle" class="bl-axis">' + esc(l) + '</text>' : '') + '</g>';
  }).join('');
  return '<svg class="bl-svg sd-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(series.map((s) => s.label).join(' and ') + ' by period') + '">' + grid + bars + '</svg>' + legend(series);
}

/** The profit waterfall. steps = [{ label, value:number|null, kind:'total'|'delta' }]. A null step is drawn as a dashed placeholder and breaks the chain. */
export function waterfall(steps) {
  if (!steps.length) return emptyBox('Nothing to show yet.');
  const W = 720, H = 270, padL = 12, padR = 12, padT = 26, padB = 52, n = steps.length;
  let run = 0, broken = false;
  const bars = steps.map((s) => {
    const v = fin(s.value);
    if (v === null) { broken = true; return { s, unknown: true }; }
    if (s.kind === 'total') { run = v; broken = false; return { s, v, a: 0, b: v, total: true }; }
    const from = run; run += v; return { s, v, a: from, b: run, broken };
  });
  const pts = bars.filter((b) => !b.unknown).flatMap((b) => [b.a, b.b, 0]);
  if (!pts.length) return emptyBox('Nothing to show yet.');
  let lo = Math.min(0, ...pts), hi = Math.max(0, ...pts); if (hi === lo) hi = lo + 1;
  const Y = (v) => H - padB - ((v - lo) / (hi - lo)) * (H - padB - padT);
  const slot = (W - padL - padR) / n, bw = Math.min(64, slot * 0.62);
  const out = bars.map((b, i) => {
    const cx = padL + i * slot + slot / 2, x = cx - bw / 2;
    const label = String(b.s.label).split(' / ').map((t, k) => '<tspan x="' + cx.toFixed(1) + '" dy="' + (k ? 12 : 0) + '">' + esc(t) + '</tspan>').join('');
    const lab = '<text x="' + cx.toFixed(1) + '" y="' + (H - padB + 16) + '" text-anchor="middle" class="bl-axis">' + label + '</text>';
    if (b.unknown || b.broken) return '<rect x="' + x.toFixed(1) + '" y="' + (Y(0) - 34).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="34" rx="3" style="fill:none;stroke:#b9b9b0;stroke-dasharray:4 3"/>' +
      '<text x="' + cx.toFixed(1) + '" y="' + (Y(0) - 14).toFixed(1) + '" text-anchor="middle" class="bl-axis-val">' + (b.unknown ? '—' : esc(moneyShort(b.v))) + '</text>' + lab;
    const y1 = Y(Math.max(b.a, b.b)), y2 = Y(Math.min(b.a, b.b));
    const color = b.total ? (b.v < 0 ? C.opex : (b.s.color || C.sales)) : (b.v < 0 ? C.cogs : C.gross);
    const tip = b.s.label + ': ' + money(b.v);
    return '<g><title>' + esc(tip) + '</title><rect x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(2, y2 - y1).toFixed(1) + '" rx="3" style="fill:' + color + (b.broken ? ';opacity:.45' : '') + '"/>' +
      '<text x="' + cx.toFixed(1) + '" y="' + (y1 - 6).toFixed(1) + '" text-anchor="middle" class="bl-axis-val">' + esc(moneyShort(b.v)) + '</text></g>' + lab;
  }).join('');
  return '<svg class="bl-svg sd-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Profit breakdown from gross sales to net profit"><line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" class="bl-grid"/>' + out + '</svg>';
}

/** Converts the trend series the server returns into chart input. */
export function trendLabels(points, grain) { return points.map((p) => bucketLabel(p.bucket, grain)); }
export const seriesOf = (points, key) => points.map((p) => fin(p[key]));
export { money, moneyShort, int };
