// Payment Verification page -- the drawers every screen uses, the toast, the inline confirmation panel (the app never uses confirm() / prompt()), the picture
// viewer (zoom + side-by-side compare) and the small cards. Pure display code: no database calls here.
import { esc, friendly, imgTag } from './pvFormat.js?v=20261030a';
import { hydrateImages } from './pvApi.js?v=20261030a';

const $ = (id) => document.getElementById(id);
export { esc, friendly };

// ---------------------------------------------------------------- cards
/** A dashboard card. `tone` colours the number (green / yellow / orange / red / blue / gray). Clickable when `go` is given. */
export function kpiCard({ label, value, sub, tone, go, hint }) {
  const tag = go ? 'button type="button" data-go="' + esc(go) + '"' : 'div';
  return '<' + tag + ' class="pv-kpi pv-tone-' + (tone || 'gray') + (go ? ' pv-kpi-click' : '') + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '>' +
    '<span class="pv-kpi-label">' + esc(label) + '</span><span class="pv-kpi-value">' + value + '</span>' + (sub ? '<span class="pv-kpi-sub">' + sub + '</span>' : '') + '</' + (go ? 'button' : 'div') + '>';
}
export const emptyBox = (text) => '<div class="empty-state"><div class="empty-state-msg">' + text + '</div></div>';
export const kv = (label, valueHtml) => '<div class="drawer-kv"><span>' + esc(label) + '</span><b>' + valueHtml + '</b></div>';

// ---------------------------------------------------------------- drawers
function drawer(name, title, wide) {
  return '<div class="drawer-backdrop" id="pv-' + name + '-backdrop"></div>' +
    '<div class="drawer pv-drawer' + (wide ? ' pv-drawer-wide' : '') + '" id="pv-' + name + '-drawer" role="dialog" aria-modal="true" aria-labelledby="pv-' + name + '-title">' +
    '<div class="drawer-header"><div><h3 id="pv-' + name + '-title">' + esc(title) + '</h3><div class="muted" id="pv-' + name + '-sub"></div></div>' +
    '<button type="button" class="drawer-close" id="pv-' + name + '-close" aria-label="Close">✕</button></div>' +
    '<div class="drawer-body" id="pv-' + name + '-body"></div>' +
    '<div class="drawer-footer" id="pv-' + name + '-footer"></div></div>';
}
/** The toast area, the payment drawer and one small side drawer. */
export const drawersHtml = () => '<div id="pv-toast" class="pv-toast" aria-live="polite"></div>' + drawer('detail', 'Payment', true) + drawer('side', '', false);

export function openDrawer(name, { title, sub, body, footer }) {
  $('pv-' + name + '-title').textContent = title || '';
  $('pv-' + name + '-sub').textContent = sub || '';
  $('pv-' + name + '-body').innerHTML = body || '';
  $('pv-' + name + '-footer').innerHTML = footer || '';
  $('pv-' + name + '-footer').hidden = !footer;
  $('pv-' + name + '-body').scrollTop = 0;
  $('pv-' + name + '-backdrop').classList.add('open');
  $('pv-' + name + '-drawer').classList.add('open');
}
export function closeDrawer(name) {
  const d = $('pv-' + name + '-drawer');
  if (!d) return;
  $('pv-' + name + '-backdrop').classList.remove('open');
  d.classList.remove('open');
}
export const isDrawerOpen = (name) => !!$('pv-' + name + '-drawer') && $('pv-' + name + '-drawer').classList.contains('open');
export const drawerBody = (name) => $('pv-' + name + '-body');
export const drawerFooter = (name) => $('pv-' + name + '-footer');

export function makeToast() {
  let timer = null;
  return (text, isError) => {
    const el = $('pv-toast');
    if (!el) return;
    el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(isError ? friendly(text) : text) + '</div>';
    clearTimeout(timer);
    timer = setTimeout(() => { el.innerHTML = ''; }, isError ? 9000 : 4500);
  };
}

/** Inline confirmation / reason panel at the top of a drawer (the drawer needs a <div id="pv-<drawer>-msg"> at its top). `fields` is raw HTML for extra inputs.
 * onOk returns when done (throw to show the message and keep the panel open). */
export function actionPanel(drawerName, { title, message, fields, okLabel, danger, onOk, onCancel }) {
  const slot = $('pv-' + drawerName + '-msg');
  if (!slot) return;
  slot.innerHTML = '<div class="lv-action-panel' + (danger ? ' lv-danger' : '') + '"><h4>' + title + '</h4>' + (message ? '<p>' + message + '</p>' : '') + (fields || '') +
    '<div id="pv-act-err"></div><div class="lv-action-buttons"><button type="button" class="btn' + (danger ? ' lv-btn-danger' : '') + '" id="pv-act-ok">' + okLabel +
    '</button><button type="button" class="btn secondary" id="pv-act-back">Back</button></div></div>';
  $('pv-' + drawerName + '-body').scrollTop = 0;
  const first = slot.querySelector('textarea, input:not([type=checkbox]), select');
  if (first) first.focus();
  $('pv-act-back').addEventListener('click', () => { slot.innerHTML = ''; if (onCancel) onCancel(); });
  $('pv-act-ok').addEventListener('click', async () => {
    const ok = $('pv-act-ok');
    ok.disabled = true;
    try { await onOk(slot); } catch (err) {
      $('pv-act-err').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>';
      ok.disabled = false;
    }
  });
}

// ---------------------------------------------------------------- the picture viewer
let lb = null;
/** Opens the full-size viewer. images = [{ label, image: {kind,url,path,thumb}, caption }]  (one picture = zoom; two = side by side). */
export function openLightbox(api, images, { startZoom = 1 } = {}) {
  closeLightbox();
  const wrap = document.createElement('div');
  wrap.className = 'pv-lightbox';
  wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', 'Payment proof picture');
  let zoom = startZoom;
  const panes = () => images.map((it, i) => '<figure class="pv-lb-pane"><figcaption><b>' + esc(it.label || '') + '</b>' + (it.caption ? '<span class="muted"> ' + esc(it.caption) + '</span>' : '') + '</figcaption>' +
    '<div class="pv-lb-stage" data-stage="' + i + '">' + imgTag(it.image, { full: true, cls: 'pv-lb-img', alt: it.label || 'Payment proof' }) + '</div></figure>').join('');
  wrap.innerHTML = '<div class="pv-lb-bar"><div class="pv-lb-title">' + (images.length > 1 ? 'Compare the pictures' : esc(images[0].label || 'Payment proof')) + '</div>' +
    '<div class="pv-lb-tools"><button type="button" class="btn small secondary" data-z="out" aria-label="Zoom out">−</button><span id="pv-lb-zoom" class="pv-lb-zoomtxt">100%</span>' +
    '<button type="button" class="btn small secondary" data-z="in" aria-label="Zoom in">+</button><button type="button" class="btn small secondary" data-z="fit">Fit</button>' +
    '<button type="button" class="btn small secondary" data-z="full">Full size</button>' + (images.length === 1 ? '<a class="btn small secondary" data-open-tab target="_blank" rel="noopener noreferrer">Open original ↗</a>' : '') +
    '<button type="button" class="btn small" data-lb-close>Close ✕</button></div></div><div class="pv-lb-panes pv-lb-n' + images.length + '">' + panes() + '</div>';
  document.body.appendChild(wrap);
  hydrateImages(wrap).then(() => {
    const a = wrap.querySelector('[data-open-tab]'), im = wrap.querySelector('img.pv-lb-img');
    if (a && im) a.href = im.src;
  });
  const apply = () => {
    wrap.querySelectorAll('img.pv-lb-img').forEach((im) => {
      if (zoom === 'fit') { im.style.width = ''; im.style.maxWidth = '100%'; im.style.maxHeight = 'calc(100vh - 120px)'; im.style.objectFit = 'contain'; }
      else if (zoom === 'full') { im.style.maxWidth = 'none'; im.style.maxHeight = 'none'; im.style.width = ''; }
      else { im.style.maxWidth = 'none'; im.style.maxHeight = 'none'; im.style.width = Math.round(zoom * 100) + '%'; }
    });
    $('pv-lb-zoom').textContent = zoom === 'fit' ? 'fits screen' : zoom === 'full' ? '100%' : Math.round(zoom * 100) + '%';
  };
  zoom = startZoom === 1 ? 'fit' : startZoom; apply();
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeLightbox(); } };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-lb-close]') || e.target === wrap) { closeLightbox(); return; }
    const z = e.target.closest('[data-z]');
    if (!z) return;
    const cur = typeof zoom === 'number' ? zoom : 1;
    if (z.dataset.z === 'in') zoom = Math.min(5, +(cur + 0.25).toFixed(2));
    else if (z.dataset.z === 'out') zoom = Math.max(0.25, +(cur - 0.25).toFixed(2));
    else zoom = z.dataset.z;
    apply();
  });
  // wheel zoom with Ctrl, and the two compare panes scroll together so the same part of both pictures is in view
  const stages = [...wrap.querySelectorAll('.pv-lb-stage')];
  if (stages.length === 2) {
    let lock = false;
    stages.forEach((s, i) => s.addEventListener('scroll', () => {
      if (lock) return;
      lock = true;
      const o = stages[1 - i];
      o.scrollTop = s.scrollTop * (o.scrollHeight - o.clientHeight) / Math.max(1, s.scrollHeight - s.clientHeight);
      o.scrollLeft = s.scrollLeft * (o.scrollWidth - o.clientWidth) / Math.max(1, s.scrollWidth - s.clientWidth);
      requestAnimationFrame(() => { lock = false; });
    }));
  }
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
