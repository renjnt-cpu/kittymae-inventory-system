// Leave Management -- the one secondary drawer (credit adjustment, credit history, settings
// forms). Separate from the request-detail and request-form drawers so a form can be open
// without losing the request the person was looking at.
const $ = (id) => document.getElementById(id);

export function openSide({ title, sub, body, footer }) {
  $('lv-side-title').textContent = title || '';
  $('lv-side-sub').textContent = sub || '';
  $('lv-side-body').innerHTML = body || '';
  $('lv-side-footer').innerHTML = footer || '';
  $('lv-side-footer').hidden = !footer;
  $('lv-side-body').scrollTop = 0;
  $('lv-side-backdrop').classList.add('open');
  $('lv-side-drawer').classList.add('open');
}

export function closeSide() {
  $('lv-side-backdrop').classList.remove('open');
  $('lv-side-drawer').classList.remove('open');
}

export const sideBody = () => $('lv-side-body');
export const sideFooter = () => $('lv-side-footer');

/** Same inline confirmation panel the request drawer uses -- the app never uses confirm()/prompt(). */
export function confirmPanel({ title, message, okLabel, danger, onOk }) {
  const slot = $('lv-side-msg');
  if (!slot) return;
  slot.innerHTML = '<div class="lv-action-panel' + (danger ? ' lv-danger' : '') + '"><h4>' + title + '</h4><p>' + message + '</p><div id="lv-side-err"></div>' +
    '<div class="lv-action-buttons"><button type="button" class="btn' + (danger ? ' lv-btn-danger' : '') + '" id="lv-side-ok">' + okLabel +
    '</button><button type="button" class="btn secondary" id="lv-side-back">Back</button></div></div>';
  $('lv-side-body').scrollTop = 0;
  $('lv-side-back').addEventListener('click', () => { slot.innerHTML = ''; });
  $('lv-side-ok').addEventListener('click', async () => {
    const ok = $('lv-side-ok');
    ok.disabled = true;
    try { await onOk(); } catch (err) {
      $('lv-side-err').innerHTML = '<div class="msg error">' + String(err.message || err).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</div>';
      ok.disabled = false;
    }
  });
}
