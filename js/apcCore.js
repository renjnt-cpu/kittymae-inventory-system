// Access & Performance Control Center -- shared plumbing: formatting, the date presets (this one adds "This Quarter"), small UI pieces, and the in-page dialogs
// (confirm() / prompt() are not used: they are blocked in some browsers and cannot show a list of what is about to change).
import { esc, fin, money, int, pct, fmtDate, fmtDateTime, addDays, startOfMonth, endOfMonth, addMonths, startOfWeek, startOfYear, daysBetween, previousPeriod, rangeText, friendly } from './sdCore.js?v=20261008b';
import { badge, emptyBox, loadingBox, errorBox, lockedBox, panel, kpiCard, openDrawer, closeDrawer, toast, mountShell } from './sdUi.js?v=20261008b';

export { esc, fin, money, int, pct, fmtDate, fmtDateTime, addDays, rangeText, friendly, badge, emptyBox, loadingBox, errorBox, lockedBox, panel, kpiCard, openDrawer, closeDrawer, toast };
export const mountShellOnce = mountShell; // already a no-op the second time

/** A summary card. o: { sub, tone: 'green'|'red'|'blue'|'orange'|'gray', go: 'id of a button handler', attrs } -- `value` is ready-made html. */
export function stat(label, value, o) {
  o = o || {};
  const tag = o.attrs ? 'button type="button" ' + o.attrs : 'div';
  return '<' + tag + ' class="sd-stat apc-stat' + (o.tone ? ' apc-tone-' + o.tone : '') + (o.attrs ? ' apc-stat-click' : '') + '"><span class="sd-stat-l">' + esc(label) + '</span><span class="sd-stat-v">' + value + '</span>' +
    (o.sub ? '<span class="sd-stat-s">' + o.sub + '</span>' : '') + '</' + (o.attrs ? 'button' : 'div') + '>';
}
export const statGrid = (cards) => '<div class="sd-stats apc-stats">' + cards.filter(Boolean).join('') + '</div>';

// ---------------------------------------------------------------- date range
export const PRESETS = [
  { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'this_week', label: 'This Week' }, { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' }, { id: 'this_quarter', label: 'This Quarter' }, { id: 'this_year', label: 'This Year' }, { id: 'custom', label: 'Custom Date Range' },
];
const startOfQuarter = (s) => { const m = Number(s.slice(5, 7)); return s.slice(0, 5) + String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0') + '-01'; };
export function presetRange(preset, today, custom) {
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y = addDays(today, -1); return { from: y, to: y }; }
    case 'this_week': return { from: startOfWeek(today), to: today };
    case 'this_month': return { from: startOfMonth(today), to: today };
    case 'last_month': { const s = addMonths(today, -1); return { from: s, to: endOfMonth(s) }; }
    case 'this_quarter': return { from: startOfQuarter(today), to: today };
    case 'this_year': return { from: startOfYear(today), to: today };
    default: return custom && custom.from && custom.to ? { from: custom.from, to: custom.to } : { from: startOfMonth(today), to: today };
  }
}
/** The comparable period straight before: "This Quarter so far" is measured against the same stretch of the quarter before. */
export function previousRange(preset, r) {
  if (preset === 'this_quarter') {
    const ps = addMonths(r.from, -3), span = daysBetween(r.from, r.to), pe = addDays(ps, span), qEnd = endOfMonth(addMonths(ps, 2));
    return { from: ps, to: pe > qEnd ? qEnd : pe };
  }
  return previousPeriod(r.from, r.to, preset);
}

// ---------------------------------------------------------------- numbers
export const NOT_ENOUGH = '<span class="muted" title="Too few transactions in this period to give a fair figure">Not enough data</span>';
export const dash = '<span class="muted">—</span>';
export const rate = (v, d = 2) => { const n = fin(v); return n === null ? dash : n.toFixed(d) + '%'; };
export const num = (v) => { const n = fin(v); return n === null ? dash : int(n); };
export const grams = (v) => { const n = fin(v); return n === null ? dash : n.toLocaleString('en-PH', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' g'; };
/** A figure that needs a workload behind it: "Not enough data" below the owner's minimum sample instead of an invented score. */
export const needsSample = (workload, th) => !(Number(workload) >= Number((th && th.min_sample) || 10));
/** 100 - error rate, or null when there is no fair figure. */
export function accuracyOf(row, th) {
  const e = fin(row && row.rates && row.rates.error);
  if (e === null || needsSample(row.workload.total, th)) return null;
  return Math.max(0, Math.round((100 - e) * 100) / 100);
}
export const accuracyHtml = (row, th) => { const a = accuracyOf(row, th); return a === null ? NOT_ENOUGH : '<b>' + a.toFixed(1) + '%</b>'; };
export const pctChange = (cur, prev) => { const c = fin(cur), p = fin(prev); if (c === null || p === null) return null; if (p === 0) return c === 0 ? 0 : null; return (c - p) / Math.abs(p) * 100; };

// ---------------------------------------------------------------- small UI pieces
export const TONE = { OPEN: 'red', 'IN REVIEW': 'orange', CORRECTED: 'green', IGNORED: 'gray', Active: 'green', Inactive: 'gray',
  VERIFIED: 'green', 'NEEDS REVIEW': 'orange', 'ACCESS MISMATCH': 'red', 'NOT REVIEWED': 'gray', Critical: 'red', High: 'orange', Medium: 'yellow', Low: 'gray' };
export const chipFor = (text) => badge(text, TONE[text] || 'gray');
export const firstName = (n) => String(n || '').split(' ')[0];
export const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export function btn(label, attrs, kind) { return '<button type="button" class="btn small' + (kind ? ' ' + kind : '') + '" ' + (attrs || '') + '>' + esc(label) + '</button>'; }
export const link = (label, attrs) => '<button type="button" class="act-link" ' + (attrs || '') + '>' + esc(label) + '</button>';

/** Wire every [data-go-emp] / [data-drill] link inside root to the app (employee profile, record drill-down). */
export function wireLinks(root, A) {
  root.querySelectorAll('[data-go-emp]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); A.select(b.dataset.goEmp, b.dataset.tab || 'people'); }));
  root.querySelectorAll('[data-drill]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); A.drill(b.dataset.emp, b.dataset.drill, b.dataset.label); }));
}
export const empLink = (id, name, tab) => id ? '<button type="button" class="act-link" data-go-emp="' + esc(id) + '"' + (tab ? ' data-tab="' + esc(tab) + '"' : '') + '>' + esc(name || '—') + '</button>' : '<span class="muted" title="The record does not say who made it">Unknown / System</span>';
/** A figure that opens the records behind it. */
export const drillLink = (emp, metric, label, text) => '<button type="button" class="act-link apc-num" data-emp="' + esc(emp) + '" data-drill="' + esc(metric) + '" data-label="' + esc(label || '') + '">' + text + '</button>';

// ---------------------------------------------------------------- dialogs
/** A centred in-page dialog. Resolves to the form values (an object) on the confirm button, or null on cancel.
 *  opts: { title, bodyHtml, confirmLabel, danger, reason: { label, required, placeholder } | null, confirmCheck: 'text of a box that must be ticked' } */
export function dialog(opts) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'apc-modal-wrap';
    wrap.innerHTML = '<div class="apc-modal" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
      '<h3 class="apc-modal-title">' + esc(opts.title) + '</h3><div class="apc-modal-body">' + (opts.bodyHtml || '') + '</div>' +
      (opts.reason ? '<div class="field" style="margin-top:10px;"><label for="apc-m-reason">' + esc(opts.reason.label || 'Reason') + (opts.reason.required ? ' *' : '') + '</label><input type="text" id="apc-m-reason" maxlength="300" placeholder="' + esc(opts.reason.placeholder || '') + '"></div>' : '') +
      (opts.confirmCheck ? '<label class="apc-check"><input type="checkbox" id="apc-m-check"> ' + esc(opts.confirmCheck) + '</label>' : '') +
      '<div class="apc-modal-err" id="apc-m-err" role="alert"></div>' +
      '<div class="apc-modal-foot"><button type="button" class="btn small secondary" id="apc-m-cancel">' + esc(opts.cancelLabel || 'Cancel') + '</button>' +
      (opts.noConfirm ? '' : '<button type="button" class="btn small' + (opts.danger ? ' danger' : '') + '" id="apc-m-ok">' + esc(opts.confirmLabel || 'Confirm') + '</button>') + '</div></div>';
    document.body.appendChild(wrap);
    const done = (v) => { document.removeEventListener('keydown', onKey); wrap.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(null); });
    wrap.querySelector('#apc-m-cancel').addEventListener('click', () => done(null));
    const ok = wrap.querySelector('#apc-m-ok');
    if (ok) ok.addEventListener('click', () => {
      const reason = wrap.querySelector('#apc-m-reason'), check = wrap.querySelector('#apc-m-check'), err = wrap.querySelector('#apc-m-err');
      if (opts.reason && opts.reason.required && !reason.value.trim()) { err.textContent = 'Add a short reason.'; reason.focus(); return; }
      if (check && !check.checked) { err.textContent = 'Tick the box to confirm.'; return; }
      const extra = {};
      wrap.querySelectorAll('[data-field]').forEach((el) => { extra[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value; });
      done(Object.assign({ reason: reason ? reason.value.trim() : '' }, extra));
    });
    const first = wrap.querySelector('input, select, textarea, #apc-m-ok'); if (first) first.focus();
  });
}

/** A list of "before → after" rows for a confirm dialog. rows = [{ label, from, to, sensitive }] */
export function changeList(rows) {
  return '<ul class="apc-changes">' + rows.map((r) => '<li' + (r.sensitive ? ' class="apc-sens-row"' : '') + '><span>' + (r.sensitive ? badge('SENSITIVE', 'red') + ' ' : '') + esc(r.label) + '</span>' +
    '<span class="apc-change-arrow">' + esc(r.from) + ' → <b>' + esc(r.to) + '</b></span></li>').join('') + '</ul>';
}

/** Run an async action behind a busy button; any error becomes a toast and the page keeps working. */
export async function guarded(btnEl, fn) {
  if (btnEl) btnEl.disabled = true;
  try { return await fn(); } catch (err) { toast(friendly(err), true); return undefined; } finally { if (btnEl) btnEl.disabled = false; }
}
export const todayStr = (tz) => new Date().toLocaleDateString('en-CA', { timeZone: tz || 'Asia/Manila' });
