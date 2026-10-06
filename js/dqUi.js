// Data Fixes -- wording, small formatters and the confirmation box shared by the Dashboard section and the Fix screens.
// Everything a person reads is plain language: no table names, no codes, no accounting words.

export function esc(s) {
  return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}
export const money = (n) => (n === null || n === undefined || n === '' || isNaN(Number(n))) ? '—' : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const int = (n) => Number(n || 0).toLocaleString('en-PH');
export const plural = (n, one, many) => (Number(n) === 1 ? one : many);
export const shortDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
export const longDate = (d = new Date()) => d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
export function greeting(d = new Date()) { const h = d.getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
export const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || '';

// One entry per kind of task: how it is named for people, which screen fixes it, and the sentence on its card.
export const TYPES = {
  MISSING_PRODUCT_COST: { title: 'Missing Product Cost', mode: 'cost', group: 'product', button: 'FIX COSTS', fixTitle: 'Fix Product Cost', pill: 'Product costs',
    line: (n) => int(n) + ' ' + plural(n, 'product needs', 'products need') + ' cost information', done: 'All product cost issues are resolved.' },
  UNKNOWN_SKU: { title: 'SKU Mapping Needed', mode: 'sku', group: 'sku', button: 'MATCH SKU', fixTitle: 'Match SKU', pill: 'SKU matching',
    line: (n) => int(n) + ' sold ' + plural(n, 'item needs', 'items need') + ' matching', done: 'All SKU matching is done.' },
  MISSING_PURCHASE_PRICE: { title: 'Missing Purchase Price', mode: 'purchase', group: 'purchase', button: 'FIX PURCHASES', fixTitle: 'Fix Purchase Price', pill: 'Purchase prices',
    line: (n) => int(n) + ' ' + plural(n, 'purchase needs', 'purchases need') + ' pricing', done: 'All purchase prices are filled in.' },
  MISSING_CATEGORY: { title: 'Missing Category', mode: 'category', group: 'product', button: 'FIX NOW', fixTitle: 'Set Category', pill: 'Categories',
    line: (n) => int(n) + ' ' + plural(n, 'product needs', 'products need') + ' a category', done: 'All products have a category.' },
  MISSING_SUPPLIER: { title: 'Missing Supplier', mode: 'supplier', group: 'product', button: 'ADD SUPPLIER', fixTitle: 'Add Supplier', pill: 'Suppliers',
    line: (n) => int(n) + ' ' + plural(n, 'product needs', 'products need') + ' supplier details', done: 'All products have a supplier.' },
};
export const MODE_TO_TYPE = Object.fromEntries(Object.entries(TYPES).map(([t, v]) => [v.mode, t]));
export const PRIO = {
  URGENT: { label: 'URGENT', cls: 'dq-prio-urgent' },
  NEEDS_ATTENTION: { label: 'NEEDS ATTENTION', cls: 'dq-prio-attn' },
  NORMAL: { label: 'NORMAL', cls: 'dq-prio-normal' },
};
export const GROUPS = [['all', 'All'], ['urgent', 'Urgent'], ['product', 'Product'], ['inventory', 'Inventory'], ['purchase', 'Purchase'], ['sku', 'SKU']];

export const prioBadge = (p) => { const x = PRIO[p] || PRIO.NORMAL; return '<span class="dq-prio ' + x.cls + '">' + x.label + '</span>'; };
export function bar(pct) { const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0))); return '<div class="dq-bar' + (p >= 100 ? ' done' : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><i style="width:' + p + '%"></i></div>'; }
export function fixUrl(type, extra) {
  const q = new URLSearchParams(Object.assign({ type: TYPES[type] ? TYPES[type].mode : type }, extra || {}));
  return 'fix-data.html?' + q.toString();
}

// A message strip (success or problem) written into an element -- the same look as the rest of the app.
export function showMsg(el, text, kind) {
  if (!el) return;
  el.innerHTML = text ? '<div class="msg ' + (kind === 'error' ? 'error' : 'ok') + '" role="' + (kind === 'error' ? 'alert' : 'status') + '">' + esc(text) + '</div>' : '';
  if (text && kind !== 'error') { const mine = el.firstChild; setTimeout(() => { if (el.firstChild === mine) el.innerHTML = ''; }, 5000); }
}

// Yes/No box that works the same on desktop and phone. `body` is HTML the caller has already escaped. Resolves true (confirmed) or false.
export function confirmBox({ title, body, ok = 'Yes, save', cancel = 'Go back' }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const back = document.createElement('div');
    back.className = 'dq-modal-back';
    back.innerHTML = '<div class="dq-modal" role="dialog" aria-modal="true" aria-labelledby="dq-m-title"><h3 id="dq-m-title">' + esc(title) + '</h3><div class="dq-modal-body">' + body +
      '</div><div class="dq-modal-actions"><button type="button" class="btn secondary" data-no>' + esc(cancel) + '</button><button type="button" class="btn" data-yes>' + esc(ok) + '</button></div></div>';
    document.body.appendChild(back);
    const finish = (v) => { document.removeEventListener('keydown', onKey, true); back.remove(); if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* the page moved on */ } } resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('click', (e) => { if (e.target === back) finish(false); });
    back.querySelector('[data-no]').addEventListener('click', () => finish(false));
    back.querySelector('[data-yes]').addEventListener('click', () => finish(true));
    back.querySelector('[data-yes]').focus();
  });
}

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
