// Item Monitoring -- the pieces every tab shares: the toast, the right-hand drawer, the centred dialog, the inline confirm / reason panel (the app never uses confirm() / prompt()),
// the small cards and the file list. Display code only: no database calls here.
import { esc, friendly, fmtDateTime, fileTypeLabel } from './imFormat.js?v=20261031a';

const $ = (id) => document.getElementById(id);
export { esc, friendly };

// ---------------------------------------------------------------- cards and small blocks
/** A clickable (when `go` is given) or plain summary card. `tone` colours the number: green / yellow / orange / red / blue / gray. */
export function kpi({ label, value, sub, tone, go, hint }) {
  const t = go ? 'button type="button" data-go="' + esc(go) + '"' : 'div';
  return '<' + t + ' class="im-kpi im-tone-' + (tone || 'gray') + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '><span class="im-kpi-label">' + esc(label) + '</span><span class="im-kpi-value">' + value + '</span>' +
    (sub ? '<span class="im-kpi-sub">' + sub + '</span>' : '') + '</' + (go ? 'button' : 'div') + '>';
}
export const emptyBox = (text) => '<div class="empty-state"><div class="empty-state-msg">' + text + '</div></div>';
export const kv = (label, valueHtml) => '<div class="drawer-kv"><span>' + esc(label) + '</span><b>' + valueHtml + '</b></div>';
export const banner = (kind, html) => '<div class="im-banner im-banner-' + kind + '">' + html + '</div>';

// ---------------------------------------------------------------- the toast, the drawer, the dialog (one of each, created once)
export function shellHtml() {
  return '<div id="im-toast" class="im-toast" aria-live="polite"></div>' +
    '<div class="drawer-backdrop" id="im-drawer-backdrop"></div>' +
    '<div class="drawer lv-drawer im-drawer" id="im-drawer" role="dialog" aria-modal="true" aria-labelledby="im-drawer-title">' +
      '<div class="drawer-header"><div><h3 id="im-drawer-title">Details</h3><div class="muted" id="im-drawer-sub"></div></div><button type="button" class="drawer-close" id="im-drawer-close" aria-label="Close">✕</button></div>' +
      '<div class="drawer-body" id="im-drawer-body"></div><div class="drawer-footer" id="im-drawer-footer"></div></div>';
}

export function makeToast() {
  let timer = null;
  return (text, isError) => {
    const el = $('im-toast');
    if (!el) return;
    el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(isError ? friendly(text) : text) + '</div>';
    clearTimeout(timer);
    timer = setTimeout(() => { el.innerHTML = ''; }, isError ? 9000 : 4500);
  };
}

let drawerOnClose = null;
export function openDrawer({ title, sub, body, footer, onClose }) {
  $('im-drawer-title').textContent = title || '';
  $('im-drawer-sub').innerHTML = sub || '';
  $('im-drawer-body').innerHTML = body || '';
  $('im-drawer-footer').innerHTML = footer || '';
  $('im-drawer-footer').hidden = !footer;
  $('im-drawer-body').scrollTop = 0;
  drawerOnClose = onClose || null;
  $('im-drawer-backdrop').classList.add('open');
  $('im-drawer').classList.add('open');
}
export function closeDrawer() {
  const d = $('im-drawer');
  if (!d || !d.classList.contains('open')) return;
  $('im-drawer-backdrop').classList.remove('open');
  d.classList.remove('open');
  const cb = drawerOnClose; drawerOnClose = null;
  if (cb) cb();
}
export const isDrawerOpen = () => !!$('im-drawer') && $('im-drawer').classList.contains('open');
export const drawerBody = () => $('im-drawer-body');
export const drawerFooter = () => $('im-drawer-footer');
export function wireDrawerClose() {
  $('im-drawer-close').addEventListener('click', closeDrawer);
  $('im-drawer-backdrop').addEventListener('click', closeDrawer);
}

let modalEl = null;
/** A centred dialog. buttons: [{ label, kind: 'primary' | 'secondary' | 'danger', onClick(m) }] -- onClick may be async; throw to show the sentence inside the dialog and keep it open.
 * Returns { close, setBusy(bool), setError(text), el }. Escape closes it. */
export function showModal({ title, body, buttons, wide, onClose }) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'im-modal-back';
  wrap.innerHTML = '<div class="im-modal' + (wide ? ' im-modal-wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
    '<div class="im-modal-head"><h3>' + esc(title) + '</h3></div><div class="im-modal-body">' + body + '</div><div class="im-modal-err"></div>' +
    '<div class="im-modal-foot">' + (buttons || []).map((b, i) => '<button type="button" class="btn' + (b.kind === 'secondary' ? ' secondary' : '') + (b.kind === 'danger' ? ' lv-btn-danger' : '') + '" data-mb="' + i + '">' + esc(b.label) + '</button>').join('') + '</div></div>';
  document.body.appendChild(wrap);
  const m = {
    el: wrap,
    close() { if (modalEl === m) { document.removeEventListener('keydown', onKey, true); wrap.remove(); modalEl = null; if (onClose) onClose(); } },
    setBusy(on) { wrap.querySelectorAll('.im-modal-foot button').forEach((b) => { b.disabled = !!on; }); },
    setError(t) { wrap.querySelector('.im-modal-err').innerHTML = t ? '<div class="msg error">' + esc(friendly(t)) + '</div>' : ''; },
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); m.close(); } };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) m.close(); });
  wrap.querySelectorAll('[data-mb]').forEach((btn) => btn.addEventListener('click', async () => {
    const b = buttons[Number(btn.dataset.mb)];
    if (!b.onClick) { m.close(); return; }
    m.setError(''); m.setBusy(true);
    try { await b.onClick(m); } catch (err) { m.setError(err); } finally { if (modalEl === m) m.setBusy(false); }
  }));
  modalEl = m;
  const first = wrap.querySelector('textarea, input:not([type=hidden]), select');
  (first || wrap.querySelector('.im-modal-foot button:last-child') || wrap).focus();
  return m;
}
export function closeModal() { if (modalEl) modalEl.close(); }
export const modalOpen = () => !!modalEl;

/** Inline confirmation / reason panel at the top of the drawer (the drawer body starts with <div id="im-act-slot">). `fields` is raw HTML for extra inputs.
 * onOk(slot) returns when done; throw to show the sentence and keep the panel open. */
export function actionPanel({ title, message, fields, okLabel, danger, onOk, onCancel }) {
  const slot = $('im-act-slot');
  if (!slot) return;
  slot.innerHTML = '<div class="lv-action-panel' + (danger ? ' lv-danger' : '') + '"><h4>' + title + '</h4>' + (message ? '<div class="im-act-msg">' + message + '</div>' : '') + (fields || '') +
    '<div id="im-act-err"></div><div class="lv-action-buttons"><button type="button" class="btn' + (danger ? ' lv-btn-danger' : '') + '" id="im-act-ok">' + okLabel +
    '</button> <button type="button" class="btn secondary" id="im-act-back">Cancel</button></div></div>';
  $('im-drawer-body').scrollTop = 0;
  const first = slot.querySelector('textarea, input:not([type=checkbox]), select');
  if (first) first.focus();
  $('im-act-back').addEventListener('click', () => { slot.innerHTML = ''; if (onCancel) onCancel(); });
  $('im-act-ok').addEventListener('click', async () => {
    const ok = $('im-act-ok');
    ok.disabled = true;
    try { await onOk(slot); } catch (err) {
      $('im-act-err').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>';
      ok.disabled = false;
    }
  });
}
export const clearActionPanel = () => { const s = $('im-act-slot'); if (s) s.innerHTML = ''; };

// ---------------------------------------------------------------- files
/** The attached files of a request: a name, what it is, who and when, and a button that opens a fresh signed address. */
export function filesHtml(files) {
  if (!files || !files.length) return '<p class="muted">No files attached.</p>';
  return files.map((f) => '<div class="lv-doc"><div><b>' + esc(f.file_name) + '</b><div class="muted" style="font-size:11px;">' + esc(fileTypeLabel(f.file_type)) + ' · ' + esc(f.uploaded_by_name || '—') + ' · ' + fmtDateTime(f.created_at) + '</div></div>' +
    '<div class="lv-doc-actions"><button type="button" class="btn small secondary" data-open-file="' + esc(f.file_path) + '">Open</button></div></div>').join('');
}
export function wireFiles(root, api, toast) {
  root.querySelectorAll('[data-open-file]').forEach((b) => b.addEventListener('click', async () => {
    try { const url = await api.signedUrl(b.dataset.openFile); if (url) window.open(url, '_blank', 'noopener'); else toast('That file could not be opened.', true); }
    catch (err) { toast(err, true); }
  }));
}
