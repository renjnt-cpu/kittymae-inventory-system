// Leave Management -- calendars (spec sections 13 and 14).
//  * My Calendar (everyone): only the signed-in person's own approved + pending leave and the
//    company holidays -- nobody else's leave is ever loaded into an employee's browser.
//  * Company Calendar (HR / Final Approver / Auditor): approved leave for everyone, with
//    Department / Employee / Leave Type filters; clicking an entry opens the request.
// Day, Week and Month views; on a phone the month grid shrinks to dots with an agenda list below.
import { esc, statusBadge, fmtDate, rangeText, daysText, addDays } from './leaveUi.js?v=20261004f';

const $ = (id) => document.getElementById(id);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => String(n).padStart(2, '0');

const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (dt) => dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
const dow = (s) => toDate(s).getUTCDay();
const startOfWeek = (s) => addDays(s, -dow(s));
const monthStart = (s) => s.slice(0, 8) + '01';
const addMonths = (s, n) => { const dt = toDate(monthStart(s)); dt.setUTCMonth(dt.getUTCMonth() + n); return iso(dt); };
const monthEnd = (s) => addDays(addMonths(s, 1), -1);

// state survives tab switches and refreshes
const cal = { view: 'month', cursor: null, scope: 'mine', dept: 'all', employee: 'all', type: 'all' };

export async function renderCalendar(ctx, root) {
  if (!cal.cursor) cal.cursor = ctx.today;
  if (!ctx.flags.view_all) cal.scope = 'mine';
  let holidays = [];
  try { holidays = await ctx.api.listHolidays(); } catch (err) { /* holidays are decoration; the calendar works without them */ }
  const holidayBy = Object.fromEntries(holidays.map((h) => [h.holiday_date, h]));

  const depts = Array.from(new Set(ctx.dir.map((e) => e.department).filter(Boolean))).sort();
  const people = ctx.dir.filter((e) => e.status === 'Active').sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';

  root.innerHTML =
    '<div class="card"><div class="lv-cal-bar">' +
      '<div class="lv-cal-nav"><button type="button" class="btn small secondary" id="cal-prev" aria-label="Previous">‹</button>' +
        '<button type="button" class="btn small secondary" id="cal-today">Today</button>' +
        '<button type="button" class="btn small secondary" id="cal-next" aria-label="Next">›</button>' +
        '<h3 class="lv-cal-title" id="cal-title"></h3></div>' +
      '<div class="lv-seg" role="group" aria-label="Calendar view">' +
        ['day', 'week', 'month'].map((v) => '<button type="button" class="lv-seg-btn" data-view="' + v + '">' + v[0].toUpperCase() + v.slice(1) + '</button>').join('') + '</div>' +
    '</div>' +
    (ctx.flags.view_all
      ? '<div class="lv-cal-filters"><div class="lv-seg" role="group" aria-label="Whose leave">' +
          '<button type="button" class="lv-seg-btn" data-scope="mine">My Calendar</button><button type="button" class="lv-seg-btn" data-scope="company">Company Calendar</button></div>' +
        '<div id="cal-filters" class="lv-cal-filter-fields">' +
          '<div class="field"><label>Department</label><select id="cal-dept"><option value="all">All</option>' + depts.map((d) => opt(d, d, cal.dept)).join('') + '</select></div>' +
          '<div class="field"><label>Employee</label><select id="cal-emp"><option value="all">All</option>' + people.map((p) => opt(p.employee_id, p.full_name, cal.employee)).join('') + '</select></div>' +
          '<div class="field"><label>Leave Type</label><select id="cal-type"><option value="all">All</option>' + ctx.types.map((t) => opt(t.id, t.name, cal.type)).join('') + '</select></div>' +
        '</div></div>'
      : '') +
    '<div class="lv-cal-legend"><span><i class="lv-dot lv-cal-ok"></i> Approved</span><span><i class="lv-dot lv-cal-pend"></i> Pending</span><span><i class="lv-dot lv-cal-attn"></i> Needs attention</span><span><i class="lv-dot lv-cal-hol"></i> Holiday</span></div>' +
    '</div><div id="cal-body"></div>';

  const entries = () => {
    const me = ctx.me.employee_id;
    return ctx.data.requests.filter((r) => {
      if (cal.scope === 'mine') return r.employee_id === me && !['Draft', 'Rejected', 'Cancelled'].includes(r.status);
      if (!['Approved', 'Completed'].includes(r.status)) return false;
      if (cal.dept !== 'all' && (ctx.dirById[r.employee_id] || {}).department !== cal.dept) return false;
      if (cal.employee !== 'all' && r.employee_id !== cal.employee) return false;
      if (cal.type !== 'all' && String(r.leave_type_id) !== cal.type) return false;
      return true;
    }).map((r) => {
      const emp = ctx.dirById[r.employee_id] || {};
      const type = (ctx.typeById[r.leave_type_id] || {}).name || 'Leave';
      const cls = r.status === 'Needs Employee Information' || r.cancellation_status === 'Requested' ? 'lv-cal-attn'
        : ['Approved', 'Completed'].includes(r.status) ? 'lv-cal-ok' : 'lv-cal-pend';
      return { id: r.id, name: emp.full_name || '—', first: String(emp.full_name || '—').split(' ')[0], type, start: r.start_date, end: r.end_date, days: r.requested_days, status: r.status, cancel: r.cancellation_status, cls };
    });
  };
  const on = (list, d) => list.filter((e) => e.start <= d && e.end >= d);
  const label = (e) => (cal.scope === 'company' ? e.first + ' · ' : '') + e.type.replace(/ Leave$/, '');
  const tip = (e) => (cal.scope === 'company' ? e.name + ' — ' : '') + e.type + ', ' + rangeText(e.start, e.end) + ' (' + daysText(e.days) + ') · ' + e.status;
  const chip = (e) => '<button type="button" class="lv-cal-chip ' + e.cls + '" data-open="' + esc(e.id) + '" title="' + esc(tip(e)) + '">' + esc(label(e)) + '</button>';
  const holLabel = (d) => holidayBy[d] ? '<div class="lv-cal-hol" title="' + esc(holidayBy[d].holiday_name) + '">' + esc(holidayBy[d].holiday_name) + (holidayBy[d].is_working_holiday ? ' (working)' : '') + '</div>' : '';

  function title() {
    if (cal.view === 'month') return MONTHS[Number(cal.cursor.slice(5, 7)) - 1] + ' ' + cal.cursor.slice(0, 4);
    if (cal.view === 'week') { const s = startOfWeek(cal.cursor); return rangeText(s, addDays(s, 6)); }
    return DOW_LONG[dow(cal.cursor)] + ', ' + fmtDate(cal.cursor);
  }

  function monthView(list) {
    const first = monthStart(cal.cursor), last = monthEnd(cal.cursor);
    const gridStart = startOfWeek(first), gridEnd = addDays(startOfWeek(last), 6);
    const restDay = cal.scope === 'mine' ? ctx.me.rest_day : null;
    let cells = '';
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
      const items = on(list, d);
      const inMonth = d >= first && d <= last;
      cells += '<div class="lv-cal-cell' + (inMonth ? '' : ' lv-cal-out') + (d === ctx.today ? ' lv-cal-today' : '') + (restDay === dow(d) ? ' lv-cal-rest' : '') + '" data-day="' + d + '" role="button" tabindex="0" aria-label="' + esc(fmtDate(d)) + '">' +
        '<div class="lv-cal-num">' + Number(d.slice(8)) + '</div>' + holLabel(d) +
        '<div class="lv-cal-chips">' + items.slice(0, 3).map(chip).join('') +
          (items.length > 3 ? '<button type="button" class="lv-cal-more" data-day="' + d + '">+' + (items.length - 3) + ' more</button>' : '') + '</div>' +
        (items.length ? '<div class="lv-cal-dots">' + items.slice(0, 6).map((e) => '<i class="lv-dot ' + e.cls + '"></i>').join('') + '</div>' : '') + '</div>';
    }
    const monthItems = list.filter((e) => e.start <= last && e.end >= first).sort((a, b) => a.start.localeCompare(b.start));
    return '<div class="card lv-cal-card"><div class="lv-cal-grid lv-cal-head">' + DOWS.map((x) => '<div>' + x + '</div>').join('') + '</div><div class="lv-cal-grid">' + cells + '</div></div>' +
      '<div class="lv-cal-agenda card"><h4 class="lv-h">This month</h4>' + (monthItems.length
        ? monthItems.map((e) => '<div class="lv-agenda-row" data-open="' + esc(e.id) + '" role="button" tabindex="0"><i class="lv-dot ' + e.cls + '"></i><div><b>' + esc(cal.scope === 'company' ? e.name : e.type) + '</b>' +
          '<div class="muted">' + esc((cal.scope === 'company' ? e.type + ' · ' : '') + rangeText(e.start, e.end)) + '</div></div></div>').join('')
        : '<p class="muted" style="margin:0;">No leave this month.</p>') + '</div>';
  }

  function weekView(list) {
    const s = startOfWeek(cal.cursor);
    let cols = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(s, i), items = on(list, d);
      cols += '<div class="lv-week-col' + (d === ctx.today ? ' lv-cal-today' : '') + '" data-day="' + d + '"><div class="lv-week-head"><b>' + DOWS[i] + '</b> ' + Number(d.slice(8)) + '</div>' + holLabel(d) +
        (items.length ? items.map((e) => '<div class="lv-week-item ' + e.cls + '" data-open="' + esc(e.id) + '" role="button" tabindex="0"><b>' + esc(cal.scope === 'company' ? e.name : e.type) + '</b><div>' + esc((cal.scope === 'company' ? e.type : rangeText(e.start, e.end))) + '</div></div>').join('') : '<div class="muted lv-week-empty">—</div>') + '</div>';
    }
    return '<div class="card"><div class="lv-week">' + cols + '</div></div>';
  }

  function dayView(list) {
    const items = on(list, cal.cursor);
    const hol = holidayBy[cal.cursor];
    return '<div class="card">' + (hol ? '<div class="msg" style="background:#eef3fb;color:#1a3a6b;">Holiday: <b>' + esc(hol.holiday_name) + '</b>' + (hol.is_working_holiday ? ' (working holiday — counted as a working day)' : ' — not counted as a leave day') + '</div>' : '') +
      (items.length ? items.map((e) => '<div class="lv-day-item" data-open="' + esc(e.id) + '" role="button" tabindex="0"><i class="lv-dot ' + e.cls + '"></i><div style="flex:1;"><b>' + esc(cal.scope === 'company' ? e.name : e.type) + '</b>' +
        '<div class="muted">' + esc((cal.scope === 'company' ? e.type + ' · ' : '') + rangeText(e.start, e.end) + ' · ' + daysText(e.days)) + '</div></div>' + statusBadge(e.status, e.cancel) + '</div>').join('')
        : '<p class="muted" style="margin:0;">' + (cal.scope === 'mine' ? 'You have no leave on this day.' : 'No one is on approved leave this day.') + '</p>') + '</div>';
  }

  function draw() {
    const list = entries();
    $('cal-title').textContent = title();
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('lv-seg-on', b.dataset.view === cal.view));
    root.querySelectorAll('[data-scope]').forEach((b) => b.classList.toggle('lv-seg-on', b.dataset.scope === cal.scope));
    const filters = $('cal-filters');
    if (filters) filters.hidden = cal.scope !== 'company';
    $('cal-body').innerHTML = cal.view === 'month' ? monthView(list) : cal.view === 'week' ? weekView(list) : dayView(list);
  }

  const step = (dir) => {
    cal.cursor = cal.view === 'month' ? addMonths(cal.cursor, dir) : addDays(cal.cursor, dir * (cal.view === 'week' ? 7 : 1));
    draw();
  };
  $('cal-prev').addEventListener('click', () => step(-1));
  $('cal-next').addEventListener('click', () => step(1));
  $('cal-today').addEventListener('click', () => { cal.cursor = ctx.today; draw(); });
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { cal.view = b.dataset.view; draw(); }));
  root.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => { cal.scope = b.dataset.scope; draw(); }));
  [['cal-dept', 'dept'], ['cal-emp', 'employee'], ['cal-type', 'type']].forEach(([id, key]) => {
    const el = $(id);
    if (el) el.addEventListener('change', (e) => { cal[key] = e.target.value; draw(); });
  });
  // one delegated handler: a request chip/row opens the request; a day (or "+N more") opens that day
  const body = $('cal-body');
  const activate = (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { e.stopPropagation(); ctx.openDetail(open.dataset.open); return; }
    const day = e.target.closest('[data-day]');
    if (day) { cal.cursor = day.dataset.day; cal.view = 'day'; draw(); }
  };
  body.addEventListener('click', activate);
  body.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) { e.preventDefault(); activate(e); } });
  draw();
}
