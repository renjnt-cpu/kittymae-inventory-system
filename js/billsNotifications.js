// Bills Management -- the notification center: the bell with an unread count, and a drawer listing the
// reminders (due today, due tomorrow, due in 3 / 7 days, overdue, recurring bill created). They are
// personal -- the database only returns this person's own rows. Each one opens the bill it is about.
import { esc, fmtDateTime, openDrawer, closeDrawer, drawerBody, isDrawerOpen } from './billsUi.js?v=20261004e';

const ICON = { overdue: '🔴', overdue_summary: '📋', due_today: '🟠', due_tomorrow: '🟡', recurring_generated: '🔁' };
const icon = (t) => ICON[t] || (/^due_in_/.test(t) ? '🟡' : '🔔');
const unreadCount = (ctx) => ctx.data.notifications.filter((n) => !n.is_read).length;

export function bellHtml(ctx) {
  const n = unreadCount(ctx);
  return '<button type="button" class="act-bell bl-bell" id="bl-bell" aria-label="Bill notifications, ' + n + ' unread" title="Bill notifications">🔔' + (n ? '<span class="act-badge">' + (n > 99 ? '99+' : n) + '</span>' : '') + '</button>';
}
export function refreshBell(ctx) {
  const slot = document.getElementById('bl-bell-slot');
  if (!slot) return;
  slot.innerHTML = bellHtml(ctx);
  const b = document.getElementById('bl-bell');
  if (b) b.addEventListener('click', () => openNotifications(ctx));
}

let showUnreadOnly = false;
export function openNotifications(ctx) {
  const items = ctx.data.notifications.filter((n) => !showUnreadOnly || !n.is_read);
  const unread = unreadCount(ctx);
  openDrawer('side', {
    title: 'Bill notifications', sub: unread ? unread + ' unread' : 'You are all caught up',
    body: '<div class="lv-seg bl-seg-gap" role="group" aria-label="Show"><button type="button" class="lv-seg-btn' + (!showUnreadOnly ? ' lv-seg-on' : '') + '" data-show="all">All</button><button type="button" class="lv-seg-btn' + (showUnreadOnly ? ' lv-seg-on' : '') + '" data-show="unread">Unread</button></div>' +
      (items.length ? '<div class="bl-notes">' + items.map((n) =>
        '<div class="bl-note' + (n.is_read ? '' : ' bl-note-unread') + '" data-id="' + n.id + '" data-bill="' + (n.bill_id || '') + '" role="button" tabindex="0"><span class="bl-note-ico" aria-hidden="true">' + icon(n.notification_type) + '</span>' +
        '<div><div class="act-title">' + esc(n.title) + '</div><div class="act-line">' + esc(n.message) + '</div><div class="act-when">' + esc(fmtDateTime(n.created_at)) + '</div></div></div>').join('') + '</div>'
        : '<p class="muted">' + (showUnreadOnly ? 'No unread notifications.' : 'No notifications yet. Reminders appear here before bills are due.') + '</p>'),
    footer: unread ? '<button type="button" class="btn secondary" id="bn-all">Mark all as read</button>' : '',
  });
  const body = drawerBody('side');
  body.querySelectorAll('[data-show]').forEach((el) => el.addEventListener('click', () => { showUnreadOnly = el.dataset.show === 'unread'; openNotifications(ctx); }));
  const go = async (el) => {
    const n = ctx.data.notifications.find((x) => x.id === Number(el.dataset.id));
    if (n && !n.is_read) { n.is_read = true; refreshBell(ctx); ctx.api.markNotificationsRead([n.id]).catch(() => {}); }
    const billId = Number(el.dataset.bill);
    closeDrawer('side');
    if (!billId) { ctx.applyView('overdue'); return; } // "N bills are overdue" has no single bill: show the overdue list
    if (ctx.byId.has(billId)) ctx.openDetail(billId); else ctx.toast('That bill is no longer in the list.', true);
  };
  body.querySelectorAll('.bl-note').forEach((el) => {
    el.addEventListener('click', () => go(el));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(el); } });
  });
  const all = document.getElementById('bn-all');
  if (all) all.addEventListener('click', async () => {
    ctx.data.notifications.forEach((n) => { n.is_read = true; }); refreshBell(ctx); openNotifications(ctx);
    try { await ctx.api.markAllNotificationsRead(); } catch (err) { ctx.toast(err, true); await ctx.reloadNotifications(); }
  });
}
