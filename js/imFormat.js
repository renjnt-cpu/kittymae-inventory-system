// Item Monitoring -- shared formatting and wording. Pure functions, no database calls and no page state.
// Money is shown as PHP with 2 decimals, weight in grams with 3 decimals, dates in the Manila timezone (the same conventions the old page used).

export const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (n) => Number(n || 0).toLocaleString('en-PH');
export const money = (n) => (n === null || n === undefined || n === '' ? '—' : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const weight = (n) => (n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('en-PH', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' g');
export const plural = (n, one, many) => Number(n) + ' ' + (Number(n) === 1 ? one : (many || one + 's'));
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const TZ = 'Asia/Manila';
/** YYYY-MM-DD in Manila, right now. */
export const todayManila = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
/** A date (a 'YYYY-MM-DD' day or a timestamp) as "Oct 30, 2026". */
export function fmtDate(s) {
  if (!s) return '—';
  const str = String(s);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(str + 'T12:00:00+08:00') : new Date(str);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: TZ });
}
export function fmtDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
}
/** The Manila calendar day of a timestamp, as YYYY-MM-DD (for comparing with the date pickers). */
export const dayOf = (s) => (s ? new Date(s).toLocaleDateString('en-CA', { timeZone: TZ }) : '');
/** "3 days ago" style, for the lists where age matters. */
export function ago(s) {
  if (!s) return '';
  const mins = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + ' hr ago';
  const days = Math.round(hrs / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
}

/** The sentence to show for an error: the database's own wording, without the technical prefix. */
export function friendly(err) {
  let m = String((err && err.message) || err || 'Something went wrong.');
  m = m.replace(/^error:\s*/i, '').replace(/^P0001:\s*/, '');
  if (/permission denied for function/i.test(m)) return 'You are not allowed to do that. (This action now goes through the approval.)';
  if (/JWT expired|not authenticated|jwt/i.test(m)) return 'Your sign-in ended. Please sign in again.';
  return m;
}

// ---------------------------------------------------------------- statuses (colours as asked: yellow pending, blue returned, green approved / posted, red rejected, gray cancelled)
export const REQ_STATUS = {
  DRAFT: { label: 'Draft', tone: 'gray' },
  SUBMITTED: { label: 'Submitted', tone: 'yellow' },
  'PENDING FINAL APPROVAL': { label: 'Pending final approval', tone: 'yellow' },
  'RETURNED FOR CORRECTION': { label: 'Returned for correction', tone: 'blue' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  APPROVED: { label: 'Approved — not posted yet', tone: 'orange' },
  POSTED: { label: 'Posted', tone: 'green' },
  'PARTIALLY POSTED': { label: 'Partially posted', tone: 'orange' },
  CANCELLED: { label: 'Cancelled', tone: 'gray' },
};
export const DEL_STATUS = {
  'PENDING FINAL APPROVAL': { label: 'Pending final approval', tone: 'yellow' },
  REVERSED: { label: 'Reversed', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  'REVERSAL BLOCKED': { label: 'Reversal blocked', tone: 'orange' },
  CANCELLED: { label: 'Cancelled', tone: 'gray' },
};
export const ITEM_STATUS = {
  PENDING: { label: 'Waiting', tone: 'yellow' }, POSTED: { label: 'Posted', tone: 'green' }, FAILED: { label: 'Failed', tone: 'red' },
  DISCARDED: { label: 'Discarded', tone: 'gray' }, REVERSED: { label: 'Reversed', tone: 'gray' },
};
const badgeOf = (map, key) => { const s = map[key] || { label: key || '—', tone: 'gray' }; return '<span class="badge lv-' + s.tone + '">' + esc(s.label) + '</span>'; };
export const reqBadge = (status) => badgeOf(REQ_STATUS, status);
export const delBadge = (status) => badgeOf(DEL_STATUS, status);
export const itemBadge = (status) => badgeOf(ITEM_STATUS, status);
export const newSkuBadge = (n) => '<span class="badge lv-orange im-newsku">NEW SKU' + (n > 1 ? ' ×' + n : '') + '</span>';

export const FILE_TYPES = [
  ['SUPPLIER_INVOICE', 'Supplier invoice'], ['DELIVERY_RECEIPT', 'Delivery receipt'], ['FACTORY_RECEIPT', 'Factory receipt'],
  ['ITEM_PHOTO', 'Item photo'], ['WEIGHT_PHOTO', 'Weight photo'], ['OTHER', 'Other supporting document'],
];
export const fileTypeLabel = (t) => (FILE_TYPES.find((x) => x[0] === t) || [t, t || 'File'])[1];
export const DELETE_REASONS = ['Duplicate entry', 'Wrong branch', 'Wrong SKU', 'Wrong quantity', 'Incorrect purchase entry', 'Other'];

// ---------------------------------------------------------------- the maths of one purchase line (the same four numbers the old form worked out)
/** { qty, grams, supPrice, pancakePrice } -> { totalGrams, estSales, purchased, profit } (null where the inputs are not there) */
export function calcLine({ qty, grams, supPrice, pancakePrice }) {
  const q = Number(qty) || 0, g = Number(grams) || 0, sp = Number(supPrice) || 0, pp = Number(pancakePrice) || 0;
  const totalGrams = q && g ? q * g : null;
  const estSales = q && pp ? r2(q * pp) : null;
  const purchased = q && sp ? r2(q * sp) : null;
  const profit = estSales !== null || purchased !== null ? r2((estSales || 0) - (purchased || 0)) : null;
  return { totalGrams, estSales, purchased, profit };
}

/** Warnings for one entered line (shown while typing and again in the review). `known` is true when the SKU exists in the catalog; `hist` = {n, max} of earlier purchases. */
export function lineWarnings({ sku, qty, grams, supPrice, pancakePrice }, known, hist) {
  const w = [];
  if (!String(sku || '').trim()) return w;
  if (!known) w.push('NEW SKU — it is not in the SKU Catalog yet');
  if (!(Number(supPrice) > 0)) w.push('Supplier price is 0 or missing');
  if (Number(supPrice) > 0 && Number(pancakePrice) > 0 && Number(pancakePrice) < Number(supPrice)) w.push('Pancake price is lower than the supplier price');
  if (!(Number(grams) > 0)) w.push('Grams is 0 or missing');
  if (hist && hist.n >= 2 && Number(qty) > Math.max(3 * hist.max, 10)) w.push('Quantity ' + qty + ' is much higher than any earlier purchase of this SKU (largest: ' + hist.max + ')');
  if (!known && Number(qty) >= 200) w.push('Very high quantity for a new SKU');
  return w;
}

/** A comma-separated file from rows (header = [..]) -- opened by Excel as is. */
export function toCsv(header, rows) {
  const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}
export function downloadText(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime || 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
