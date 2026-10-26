// Scrap Monitoring page -- the drawers every screen uses, the toast, the inline confirmation / reason panel (the app never uses confirm() / prompt()), the photo viewer and the
// small cards. Pure display code: no database calls here.
import { esc, friendly } from './smFormat.js?v=20261026a';

const $ = (id) => document.getElementById(id);
export { esc, friendly };

// ---------------------------------------------------------------- cards
/** A dashboard card. `tone` colours the number (green / yellow / orange / red / blue). Clickable when `go` is given. */
export function kpiCard({ label, value, sub, tone, go, hint }) {
  const tag = go ? 'button type="button" data-go="' + esc(go) + '"' : 'div';
  return '<' + tag + ' class="sm-kpi sm-tone-' + (tone || 'gray') + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '>' +
    '<span class="sm-kpi-label">' + esc(label) + '</span><span class="sm-kpi-value">' + value + '</span>' + (sub ? '<span class="sm-kpi-sub">' + sub + '</span>' : '') + '</' + (go ? 'button' : 'div') + '>';
}
export const emptyBox = (text) => '<div class="empty-state"><div class="empty-state-msg">' + text + '</div></div>';
export const kv = (label, valueHtml) => '<div class="drawer-kv"><span>' + esc(label) + '</span><b>' + valueHtml + '</b></div>';
export const banner = (kind, html) => '<div class="sm-banner sm-banner-' + kind + '">' + html + '</div>';

// ---------------------------------------------------------------- drawers
function drawer(name, title, wide) {
  return '<div class="drawer-backdrop" id="sm-' + name + '-backdrop"></div>' +
    '<div class="drawer sm-drawer' + (wide ? ' sm-drawer-wide' : '') + '" id="sm-' + name + '-drawer" role="dialog" aria-modal="true" aria-labelledby="sm-' + name + '-title">' +
    '<div class="drawer-header"><div><h3 id="sm-' + name + '-title">' + esc(title) + '</h3><div class="muted" id="sm-' + name + '-sub"></div></div>' +
    '<button type="button" class="drawer-close" id="sm-' + name + '-close" aria-label="Close">✕</button></div>' +
    '<div class="drawer-body" id="sm-' + name + '-body"></div>' +
    '<div class="drawer-footer" id="sm-' + name + '-footer"></div></div>';
}
/** The toast area, the detail drawer (wide) and the form drawer (wide). */
export const drawersHtml = () => '<div id="sm-toast" class="sm-toast" aria-live="polite"></div>' + drawer('detail', 'Details', true) + drawer('side', 'Form', true);

export function openDrawer(name, { title, sub, body, footer }) {
  $('sm-' + name + '-title').textContent = title || '';
  $('sm-' + name + '-sub').textContent = sub || '';
  $('sm-' + name + '-body').innerHTML = body || '';
  $('sm-' + name + '-footer').innerHTML = footer || '';
  $('sm-' + name + '-footer').hidden = !footer;
  $('sm-' + name + '-body').scrollTop = 0;
  $('sm-' + name + '-backdrop').classList.add('open');
  $('sm-' + name + '-drawer').classList.add('open');
}
export function closeDrawer(name) {
  const d = $('sm-' + name + '-drawer');
  if (!d) return;
  $('sm-' + name + '-backdrop').classList.remove('open');
  d.classList.remove('open');
}
export const isDrawerOpen = (name) => !!$('sm-' + name + '-drawer') && $('sm-' + name + '-drawer').classList.contains('open');
export const drawerBody = (name) => $('sm-' + name + '-body');
export const drawerFooter = (name) => $('sm-' + name + '-footer');

export function makeToast() {
  let timer = null;
  return (text, isError) => {
    const el = $('sm-toast');
    if (!el) return;
    el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(isError ? friendly(text) : text) + '</div>';
    clearTimeout(timer);
    timer = setTimeout(() => { el.innerHTML = ''; }, isError ? 9000 : 4500);
  };
}

/** Inline confirmation / reason panel at the top of a drawer (the drawer body needs a <div id="sm-<drawer>-msg"> at its top). `fields` is raw HTML for extra inputs.
 * onOk(slot) returns when done (throw to show the message and keep the panel open). */
export function actionPanel(drawerName, { title, message, fields, okLabel, danger, onOk, onCancel }) {
  const slot = $('sm-' + drawerName + '-msg');
  if (!slot) return;
  slot.innerHTML = '<div class="lv-action-panel' + (danger ? ' lv-danger' : '') + '"><h4>' + title + '</h4>' + (message ? '<p>' + message + '</p>' : '') + (fields || '') +
    '<div id="sm-act-err"></div><div class="lv-action-buttons"><button type="button" class="btn' + (danger ? ' lv-btn-danger' : '') + '" id="sm-act-ok">' + okLabel +
    '</button> <button type="button" class="btn secondary" id="sm-act-back">Back</button></div></div>';
  $('sm-' + drawerName + '-body').scrollTop = 0;
  const first = slot.querySelector('textarea, input:not([type=checkbox]), select');
  if (first) first.focus();
  $('sm-act-back').addEventListener('click', () => { slot.innerHTML = ''; if (onCancel) onCancel(); });
  $('sm-act-ok').addEventListener('click', async () => {
    const ok = $('sm-act-ok');
    ok.disabled = true;
    try { await onOk(slot); } catch (err) {
      $('sm-act-err').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>';
      ok.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- photos and files
let lb = null;
/** Opens the full-size viewer for one picture: { title, src }. */
export function openLightbox({ title, src }) {
  closeLightbox();
  const wrap = document.createElement('div');
  wrap.className = 'sm-lightbox';
  wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', title || 'Photo');
  wrap.innerHTML = '<div class="sm-lb-bar"><b>' + esc(title || 'Photo') + '</b><a class="btn" href="' + esc(src) + '" target="_blank" rel="noopener noreferrer">Open original ↗</a><button type="button" class="btn" data-lb-close>Close ✕</button></div>' +
    '<img alt="' + esc(title || 'Photo') + '" src="' + esc(src) + '">';
  document.body.appendChild(wrap);
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeLightbox(); } };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-lb-close]') || e.target === wrap) closeLightbox(); });
  wrap.querySelector('[data-lb-close]').focus();
  lb = { wrap, onKey };
}
export function closeLightbox() {
  if (!lb) return;
  document.removeEventListener('keydown', lb.onKey, true);
  lb.wrap.remove();
  lb = null;
}
export const lightboxOpen = () => !!lb;

const isImageName = (n, ct) => /^image\//.test(ct || '') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(n || '');
/** A thumbnail button for a stored file (a private-bucket path); a PDF or other document gets a plain link filled in later. */
export function fileThumb({ bucket, path, name, contentType, label }) {
  if (!path) return '';
  if (isImageName(name || path, contentType)) {
    return '<figure class="sm-file"><button type="button" class="sm-file-btn" data-zoom-bucket="' + esc(bucket) + '" data-zoom-path="' + esc(path) + '" data-zoom-title="' + esc(label || name || 'Photo') + '" aria-label="Open ' + esc(label || name || 'photo') + '">' +
      '<img alt="" loading="lazy" data-sm-bucket="' + esc(bucket) + '" data-sm-path="' + esc(path) + '"></button><figcaption>' + esc(label || name || '') + '</figcaption></figure>';
  }
  return '<figure class="sm-file"><a class="sm-file-doc" href="#" data-doc-bucket="' + esc(bucket) + '" data-doc-path="' + esc(path) + '" target="_blank" rel="noopener noreferrer">' + esc(name || 'Open file') + ' ↗</a><figcaption>' + esc(label || '') + '</figcaption></figure>';
}
/** Wires the thumbnails / document links under `root`: clicking a thumbnail opens the viewer, a document link opens a fresh signed address. */
export function wireFiles(ctx, root) {
  if (!root) return;
  root.querySelectorAll('[data-zoom-path]').forEach((b) => b.addEventListener('click', async () => {
    try { const url = await ctx.api.signedUrl(b.dataset.zoomBucket, b.dataset.zoomPath); if (url) openLightbox({ title: b.dataset.zoomTitle, src: url }); else ctx.toast('That photo could not be opened.', true); }
    catch (err) { ctx.toast(err, true); }
  }));
  root.querySelectorAll('[data-doc-path]').forEach((a) => a.addEventListener('click', async (e) => {
    e.preventDefault();
    try { const url = await ctx.api.signedUrl(a.dataset.docBucket, a.dataset.docPath); if (url) window.open(url, '_blank', 'noopener'); else ctx.toast('That file could not be opened.', true); }
    catch (err) { ctx.toast(err, true); }
  }));
  if (ctx.api.hydrateImages) ctx.api.hydrateImages(root);
}
