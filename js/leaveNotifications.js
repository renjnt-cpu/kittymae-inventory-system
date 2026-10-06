// Leave Management -- the header "Leave notifications" bell, mounted on every ERP page by shell.js.
// Personal to the signed-in person (the database only returns their own rows); the older 🔔
// Activity bell next to it is the company-wide broadcast feed and is unrelated.
import { listNotifications, markNotificationsRead, markAllNotificationsRead, subscribe } from './leaveApi.js?v=20261007g';
import { esc, fmtDateTime } from './leaveUi.js?v=20261007g';

export async function initLeaveNotifications({ employee, headerEl }) {
  const bell = document.createElement('button');
  bell.type = 'button'; bell.className = 'act-bell'; bell.id = 'lv-bell'; bell.title = 'Leave notifications';
  bell.setAttribute('aria-label', 'Leave notifications');
  bell.innerHTML = '🗓️<span class="act-badge" id="lv-bell-badge" hidden>0</span>';
  const who = headerEl.querySelector('.who');
  if (who) headerEl.insertBefore(bell, who); else headerEl.appendChild(bell);

  const panel = document.createElement('div');
  panel.className = 'lv-bell-panel'; panel.id = 'lv-bell-panel'; panel.hidden = true;
  panel.innerHTML = '<div class="act-panel-head"><span>LEAVE NOTIFICATIONS</span><button type="button" class="act-x-head" id="lv-bell-close" aria-label="Close">✕</button></div>' +
    '<div id="lv-bell-list" class="lv-bell-list"></div>' +
    '<div class="act-panel-foot"><button type="button" class="act-link" id="lv-bell-markall">Mark all as read</button><a class="act-link" href="leave.html">Open Leave Management</a></div>';
  document.body.appendChild(panel);

  const $ = (id) => document.getElementById(id);
  let items = [];

  const draw = () => {
    const unread = items.filter((n) => !n.is_read).length;
    const badge = $('lv-bell-badge');
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.hidden = unread === 0;
    $('lv-bell-markall').hidden = unread === 0;
    $('lv-bell-list').innerHTML = items.length ? items.map((n) =>
      '<div class="lv-bell-item' + (n.is_read ? '' : ' lv-unread') + '" data-id="' + n.id + '" data-req="' + esc(n.leave_request_id || '') + '" role="button" tabindex="0">' +
      '<div class="act-title">' + esc(n.title) + '</div><div class="act-line">' + esc(n.message) + '</div><div class="act-when">' + esc(fmtDateTime(n.created_at)) + '</div></div>').join('')
      : '<p class="muted" style="padding:10px 4px;margin:0;">No leave notifications yet.</p>';
    $('lv-bell-list').querySelectorAll('.lv-bell-item').forEach((el) => {
      const go = () => open(Number(el.dataset.id), el.dataset.req);
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  };

  const load = async () => {
    try { items = await listNotifications(40); draw(); } catch (e) { /* a bell must never break the page */ }
  };

  const open = async (id, requestId) => {
    const n = items.find((x) => x.id === id);
    if (n && !n.is_read) { n.is_read = true; draw(); markNotificationsRead([id]).catch(() => {}); }
    panel.hidden = true;
    if (!requestId) return;
    if (/\/leave\.html$/.test(location.pathname)) document.dispatchEvent(new CustomEvent('lv-open-request', { detail: { id: requestId } }));
    else location.href = 'leave.html?open=' + encodeURIComponent(requestId);
  };

  bell.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; if (!panel.hidden) load(); });
  $('lv-bell-close').addEventListener('click', () => { panel.hidden = true; });
  $('lv-bell-markall').addEventListener('click', async () => {
    items.forEach((n) => { n.is_read = true; }); draw();
    try { await markAllNotificationsRead(); } catch (e) { load(); }
  });
  document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== bell) panel.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.hidden = true; });

  await load();
  // new notifications arrive live; refreshing on tab focus covers a dropped connection
  try { subscribe('leave_notifications', load); } catch (e) { /* falls back to focus refresh */ }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  return { reload: load };
}
