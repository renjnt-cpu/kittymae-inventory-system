// Assets & Supplies Custodian -- QR codes and scanning. A QR code printed on an asset's tag holds only a link to the INTERNAL record
// (assets.html?asset=AST-2026-00001): nothing about who holds it, no price, no personal information. Opening that link needs a sign-in, and the
// database then shows the asset only to people who are allowed to see it. The QR library is loaded from cdnjs when first needed, pinned to one
// version with a Subresource Integrity hash. Scanning uses the phone's camera where the browser supports it (BarcodeDetector); typing the
// number always works.
import { esc, openDrawer, closeDrawer, drawerBody, friendly } from './assetsUi.js?v=20261007h';

const LIB = { url: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', integrity: 'sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1' };
let pending = null;
function ensureQr() {
  if (window.qrcode) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIB.url; s.integrity = LIB.integrity; s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => { pending = null; reject(new Error('Could not load the QR tool. Check your internet connection and try again.')); };
    document.head.appendChild(s);
  });
  return pending;
}
/** the internal link a QR code carries (asset number only) */
export const assetLink = (number) => new URL('assets.html?asset=' + encodeURIComponent(number), location.href).href;
/** an inline SVG of the QR code for one asset number */
export async function qrSvg(number) {
  await ensureQr();
  const q = window.qrcode(0, 'M');
  q.addData(assetLink(number)); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/** what a scanned code (a full link, or just the number) refers to */
export function extractAssetRef(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  try { const u = new URL(t); const a = u.searchParams.get('asset'); if (a) return a.trim(); } catch (e) { /* not a link */ }
  const m = t.match(/AST-\d{4}-\d{5}/i);
  return m ? m[0].toUpperCase() : t;
}

// ---------------------------------------------------------------- the scan / find drawer
export function openScan(ctx) {
  const canCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && 'BarcodeDetector' in window;
  openDrawer('aux', { title: 'Scan or find an asset', sub: 'Point the camera at an asset tag, or type the number',
    body: '<div id="ac-aux-msg"></div><div id="ac-scan-errors"></div>' +
      '<div class="field"><label>Asset number or tag</label><input type="text" id="ac-scan-num" placeholder="AST-2026-00001" autocomplete="off" autocapitalize="characters"></div>' +
      '<div class="lv-row-actions"><button type="button" class="btn" id="ac-scan-go">Open asset</button>' + (canCamera ? '<button type="button" class="btn secondary" id="ac-scan-cam">Scan with the camera</button>' : '') + '</div>' +
      (canCamera ? '<div id="ac-scan-video-wrap" hidden><video id="ac-scan-video" class="ac-video" playsinline muted></video><p class="muted">Hold the QR code inside the picture. It opens by itself.</p></div>' : '<p class="muted">Camera scanning is not available in this browser — type the number printed on the tag, or open the QR code with your phone’s camera app.</p>') +
      '<p class="muted">You will only see an asset you are allowed to see.</p>', footer: '' });
  const err = (msg) => { $('ac-scan-errors').innerHTML = msg ? '<div class="msg error">' + esc(msg) + '</div>' : ''; };
  const $ = (id) => document.getElementById(id);
  let stream = null, running = false;
  const stop = () => { running = false; if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } const w = $('ac-scan-video-wrap'); if (w) w.hidden = true; };
  document.addEventListener('ac-aux-closed', stop, { once: true });
  const go = async (ref) => {
    err(''); if (!ref) { err('Type or scan an asset number.'); return; }
    try { const ok = await ctx.goAsset(ref); if (ok) { stop(); closeDrawer('aux'); } } catch (e) { err(friendly(e)); }
  };
  $('ac-scan-go').addEventListener('click', () => go(extractAssetRef($('ac-scan-num').value)));
  $('ac-scan-num').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(extractAssetRef($('ac-scan-num').value)); } });
  setTimeout(() => $('ac-scan-num') && $('ac-scan-num').focus(), 60);
  if (canCamera) $('ac-scan-cam').addEventListener('click', async () => {
    err('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = $('ac-scan-video'); v.srcObject = stream; await v.play(); $('ac-scan-video-wrap').hidden = false;
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      running = true;
      const tick = async () => {
        if (!running) return;
        try { const codes = await det.detect(v); if (codes.length) { const ref = extractAssetRef(codes[0].rawValue); running = false; await go(ref); if (!stream) return; running = true; } } catch (e) { /* keep looking */ }
        if (running) setTimeout(tick, 350);
      };
      tick();
    } catch (e) { stop(); err('The camera could not be opened (' + (e && e.name === 'NotAllowedError' ? 'permission was refused' : (e && e.message) || 'unknown problem') + '). You can still type the number.'); }
  });
}
