// Leave Management -- HR's rulebook: leave types, holidays, blackout dates, each person's rest
// day + immediate supervisor, and the policy numbers. HR writes these tables directly (row
// level security limits that to leave.hr) and every change is recorded in the audit log by a
// database trigger, not by this file.
import { esc, fmtDate, num, WEEKDAYS, kv } from './leaveUi.js?v=20261007h';
import { openSide, closeSide, sideBody } from './leaveSide.js?v=20261007h';
import { accrualHtml, wireAccrual } from './leaveAccrual.js?v=20261007h';

const $ = (id) => document.getElementById(id);
const openSections = new Set(['schedules']);
let renderSeq = 0;

const friendly = (err) => {
  const m = String((err && err.message) || err || '');
  if (/duplicate key|unique constraint/i.test(m)) return 'That already exists.';
  if (/row-level security|permission denied/i.test(m)) return 'Only HR can change this.';
  return m;
};

function section(key, title, count, body) {
  return '<details class="card exp" data-sec="' + key + '"' + (openSections.has(key) ? ' open' : '') + '><summary><span class="exp-arrow" aria-hidden="true">▸</span>' +
    esc(title) + ' <span class="exp-count">' + esc(count) + '</span></summary><div class="exp-body" id="set-' + key + '">' + body + '</div></details>';
}

export async function renderSettings(ctx, root) {
  const seq = ++renderSeq;
  if (!root.firstChild) root.innerHTML = '<p class="muted">Loading…</p>';
  let holidays, blackouts, rules;
  try { [holidays, blackouts, rules] = await Promise.all([ctx.api.listHolidays(), ctx.api.listBlackouts(), ctx.api.listAccrualRules()]); } catch (err) {
    root.innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>';
    return;
  }
  if (seq !== renderSeq) return;
  const people = ctx.dir.filter((e) => e.status === 'Active').sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  const notSet = people.filter((p) => !p.rest_day_set).length;

  root.innerHTML =
    section('schedules', 'Rest Days & Immediate Supervisors', notSet ? notSet + ' not set' : 'all set', schedulesHtml(ctx, people)) +
    section('accrual', 'Automatic Leave Credits', rules.filter((r) => r.active).length + ' on · ' + rules.length + ' rule' + (rules.length === 1 ? '' : 's'), accrualHtml(ctx, rules)) +
    section('types', 'Leave Types', ctx.types.length + ' types', typesHtml(ctx)) +
    section('holidays', 'Company Holidays', holidays.length + ' dates', holidaysHtml(holidays)) +
    section('blackouts', 'Blackout Dates', blackouts.length + ' periods', blackoutsHtml(blackouts)) +
    section('policy', 'Leave Policy', '', policyHtml(ctx));

  root.querySelectorAll('details[data-sec]').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) openSections.add(d.dataset.sec); else openSections.delete(d.dataset.sec);
  }));
  wireSchedules(ctx, people);
  wireAccrual(ctx, rules);
  wireTypes(ctx);
  wireHolidays(ctx, holidays);
  wireBlackouts(ctx, blackouts);
  wirePolicy(ctx);
}

const run = async (ctx, fn, okText) => {
  try { await fn(); if (okText) ctx.toast(okText, false); await ctx.refresh(); } catch (err) { ctx.toast(friendly(err), true); }
};

// ------------------------------------------------------------ rest days & supervisors
function schedulesHtml(ctx, people) {
  const def = Number(ctx.settings.default_rest_day || 0);
  return '<p class="muted" style="margin-top:0;">Everyone works six days a week with one rest day. The rest day is not counted as leave. ' +
    'Anyone without one set uses the default (' + esc(WEEKDAYS[def]) + ') — set it here for anyone whose day off is different.</p>' +
    '<div class="field" style="max-width:260px;margin-bottom:10px;"><label>Search</label><input type="text" id="sch-search" placeholder="Employee name…"></div>' +
    '<div class="table-scroll table-2col"><table><thead><tr><th>Employee</th><th>Department</th><th>Rest Day</th><th>Immediate Supervisor</th><th>Action</th></tr></thead><tbody id="sch-body">' +
    people.map((p) => '<tr data-emp="' + esc(p.employee_id) + '" data-name="' + esc(String(p.full_name).toLowerCase()) + '">' +
      '<td data-label="Employee"><b>' + esc(p.full_name) + '</b>' + (p.has_login === false ? '<div class="muted">no login</div>' : '') + '</td>' +
      '<td data-label="Department">' + esc(p.department || '—') + '</td>' +
      '<td data-label="Rest Day"><select data-f="rest">' + WEEKDAYS.map((d, i) => '<option value="' + i + '"' + (Number(p.rest_day) === i ? ' selected' : '') + '>' + d + '</option>').join('') + '</select>' +
        (p.rest_day_set ? '' : '<div class="muted">Not set — using default</div>') + '</td>' +
      '<td data-label="Immediate Supervisor"><select data-f="sup"><option value="">— None —</option>' + people.filter((x) => x.employee_id !== p.employee_id).map((x) =>
        '<option value="' + esc(x.employee_id) + '"' + (x.employee_id === p.supervisor_id ? ' selected' : '') + '>' + esc(x.full_name) + '</option>').join('') + '</select></td>' +
      '<td data-label="Action" class="full-row"><button type="button" class="btn small" data-save disabled>Save</button></td></tr>').join('') + '</tbody></table></div>';
}

function wireSchedules(ctx, people) {
  const body = $('sch-body');
  if (!body) return;
  $('sch-search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    body.querySelectorAll('tr').forEach((tr) => { tr.hidden = !!q && !tr.dataset.name.includes(q); });
  });
  body.querySelectorAll('tr').forEach((tr) => {
    const btn = tr.querySelector('[data-save]');
    const p = people.find((x) => x.employee_id === tr.dataset.emp);
    // Save is enabled once something differs from what is stored -- and always for someone with
    // no rest day on file yet, so HR can pin the default day explicitly.
    const dirty = () => {
      const rest = Number(tr.querySelector('[data-f="rest"]').value), sup = tr.querySelector('[data-f="sup"]').value || null;
      btn.disabled = p.rest_day_set && rest === Number(p.rest_day) && sup === (p.supervisor_id || null);
    };
    tr.querySelectorAll('select').forEach((s) => s.addEventListener('change', dirty));
    dirty();
    btn.addEventListener('click', () => {
      btn.disabled = true;
      run(ctx, () => ctx.api.saveSchedule(tr.dataset.emp, Number(tr.querySelector('[data-f="rest"]').value), tr.querySelector('[data-f="sup"]').value || null),
        'Saved for ' + p.full_name + '.');
    });
  });
}

// ------------------------------------------------------------ leave types
function typesHtml(ctx) {
  return '<div style="margin-bottom:10px;"><button type="button" class="btn small" id="type-add">+ Add Leave Type</button></div>' +
    '<div class="table-scroll table-2col"><table><thead><tr><th>Leave Type</th><th>Can Be Paid</th><th>Uses Credits</th><th>Document Required</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
    ctx.types.map((t) => '<tr><td data-label="Leave Type"><b>' + esc(t.name) + '</b>' + (t.description ? '<div class="muted">' + esc(t.description) + '</div>' : '') + '</td>' +
      '<td data-label="Can Be Paid">' + (t.is_paid_available ? 'Yes' : 'No — unpaid only') + '</td>' +
      '<td data-label="Uses Credits">' + (t.requires_credit ? 'Yes' : 'No') + '</td>' +
      '<td data-label="Document Required">' + (t.attachment_required_min_days === null ? 'Never' : num(t.attachment_required_min_days) + '+ days') + '</td>' +
      '<td data-label="Status">' + (t.active ? '<span class="badge lv-green">Active</span>' : '<span class="badge lv-gray">Inactive</span>') + '</td>' +
      '<td data-label="Action" class="full-row"><button type="button" class="btn small secondary" data-type-edit="' + t.id + '">Edit</button></td></tr>').join('') + '</tbody></table></div>';
}

function wireTypes(ctx) {
  $('type-add').addEventListener('click', () => openTypeForm(ctx, null));
  document.querySelectorAll('[data-type-edit]').forEach((b) => b.addEventListener('click', () => openTypeForm(ctx, ctx.typeById[Number(b.dataset.typeEdit)])));
}

function openTypeForm(ctx, t) {
  const v = t || { name: '', description: '', is_paid_available: true, requires_credit: true, attachment_required_min_days: null, active: true, sort_order: 100 };
  openSide({
    title: t ? 'Edit Leave Type' : 'Add Leave Type', sub: t ? t.name : '',
    body: '<div id="lv-side-msg"></div><div class="lv-grid">' +
      '<div class="field"><label>Name *</label><input type="text" id="lt-name" value="' + esc(v.name) + '"></div>' +
      '<div class="field"><label>Display Order</label><input type="number" id="lt-order" step="10" value="' + esc(v.sort_order) + '"></div></div>' +
      '<div class="field" style="margin-top:8px;"><label>Description</label><input type="text" id="lt-desc" value="' + esc(v.description || '') + '"></div>' +
      '<div class="field" style="margin-top:8px;max-width:260px;"><label>Supporting document required from (days)</label><input type="number" id="lt-doc" min="0" step="0.5" placeholder="Leave blank = never" value="' + esc(v.attachment_required_min_days === null ? '' : v.attachment_required_min_days) + '"></div>' +
      '<label class="lv-check"><input type="checkbox" id="lt-paid"' + (v.is_paid_available ? ' checked' : '') + '> Can be filed as paid leave</label>' +
      '<label class="lv-check"><input type="checkbox" id="lt-credit"' + (v.requires_credit ? ' checked' : '') + '> Paid leave uses leave credits</label>' +
      '<label class="lv-check"><input type="checkbox" id="lt-active"' + (v.active ? ' checked' : '') + '> Active (employees can choose it)</label>' +
      '<p class="muted">Leave types cannot be deleted — mark one inactive to hide it from new requests. Existing requests keep their type.</p>',
    footer: '<button type="button" class="btn" id="lt-save">' + (t ? 'Save Changes' : 'Add Leave Type') + '</button><button type="button" class="btn secondary" id="lt-cancel">Cancel</button>',
  });
  $('lt-cancel').addEventListener('click', closeSide);
  $('lt-save').addEventListener('click', async () => {
    const name = $('lt-name').value.trim();
    if (!name) { $('lv-side-msg').innerHTML = '<div class="msg error">Give the leave type a name.</div>'; return; }
    const docRaw = $('lt-doc').value.trim();
    const row = {
      name, description: $('lt-desc').value.trim() || null, sort_order: Number($('lt-order').value) || 100,
      is_paid_available: $('lt-paid').checked, requires_credit: $('lt-credit').checked, active: $('lt-active').checked,
      attachment_required_min_days: docRaw === '' ? null : Number(docRaw),
    };
    $('lt-save').disabled = true;
    try {
      if (t) await ctx.api.updateLeaveType(t.id, row); else await ctx.api.addLeaveType(row);
      closeSide();
      ctx.toast(t ? 'Leave type updated.' : 'Leave type added.', false);
      await ctx.refresh();
    } catch (err) {
      $('lv-side-msg').innerHTML = '<div class="msg error">' + esc(/duplicate|unique/i.test(String(err.message)) ? 'A leave type with that name already exists.' : friendly(err)) + '</div>';
      $('lt-save').disabled = false;
    }
  });
}

// ------------------------------------------------------------ holidays
function holidaysHtml(holidays) {
  return '<p class="muted" style="margin-top:0;">Holidays are not counted as leave days. A <b>working holiday</b> is one the shop still opens on, so it <b>is</b> counted.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px;">' +
      '<div class="field" style="min-width:200px;"><label>Holiday Name *</label><input type="text" id="hol-name"></div>' +
      '<div class="field"><label>Date *</label><input type="date" id="hol-date"></div>' +
      '<label class="lv-check" style="margin:0 0 6px;"><input type="checkbox" id="hol-working"> Working holiday</label>' +
      '<button type="button" class="btn small" id="hol-add">Add Holiday</button></div>' +
    (holidays.length ? '<div class="table-scroll table-2col"><table><thead><tr><th>Date</th><th>Holiday</th><th>Type</th><th>Action</th></tr></thead><tbody>' +
      holidays.map((h) => '<tr><td data-label="Date">' + esc(fmtDate(h.holiday_date)) + '</td><td data-label="Holiday">' + esc(h.holiday_name) + '</td>' +
        '<td data-label="Type">' + (h.is_working_holiday ? 'Working holiday (counted)' : 'Non-working (not counted)') + '</td>' +
        '<td data-label="Action" class="full-row"><div class="lv-row-actions"><button type="button" class="btn small secondary" data-hol-toggle="' + h.id + '">' + (h.is_working_holiday ? 'Make Non-working' : 'Make Working') + '</button>' +
        '<button type="button" class="btn small secondary" data-hol-del="' + h.id + '">Remove</button></div></td></tr>').join('') + '</tbody></table></div>'
      : '<p class="muted">No holidays added yet.</p>');
}

function wireHolidays(ctx, holidays) {
  $('hol-add').addEventListener('click', () => {
    const name = $('hol-name').value.trim(), date = $('hol-date').value;
    if (!name || !date) { ctx.toast('Enter the holiday name and date.', true); return; }
    run(ctx, () => ctx.api.addHoliday(name, date, $('hol-working').checked), 'Holiday added.');
  });
  document.querySelectorAll('[data-hol-toggle]').forEach((b) => b.addEventListener('click', () => {
    const h = holidays.find((x) => String(x.id) === b.dataset.holToggle);
    run(ctx, () => ctx.api.updateHoliday(h.id, { is_working_holiday: !h.is_working_holiday }), 'Holiday updated.');
  }));
  document.querySelectorAll('[data-hol-del]').forEach((b) => b.addEventListener('click', () => {
    // two-step: first click arms the button, second click removes -- no confirm() dialogs in this app
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to remove'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Remove'; }, 4000); return; }
    run(ctx, () => ctx.api.deleteHoliday(Number(b.dataset.holDel)), 'Holiday removed.');
  }));
}

// ------------------------------------------------------------ blackout dates
function blackoutsHtml(blackouts) {
  return '<p class="muted" style="margin-top:0;">Employees cannot file leave that overlaps a blackout period. HR can still file for them — it shows a warning instead.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px;">' +
      '<div class="field"><label>From *</label><input type="date" id="bo-start"></div><div class="field"><label>To *</label><input type="date" id="bo-end"></div>' +
      '<div class="field" style="min-width:220px;"><label>Reason *</label><input type="text" id="bo-reason" placeholder="e.g. Christmas rush"></div>' +
      '<button type="button" class="btn small" id="bo-add">Add Blackout</button></div>' +
    (blackouts.length ? '<div class="table-scroll table-2col"><table><thead><tr><th>From</th><th>To</th><th>Reason</th><th>Action</th></tr></thead><tbody>' +
      blackouts.map((b) => '<tr><td data-label="From">' + esc(fmtDate(b.start_date)) + '</td><td data-label="To">' + esc(fmtDate(b.end_date)) + '</td><td data-label="Reason">' + esc(b.reason) + '</td>' +
        '<td data-label="Action" class="full-row"><button type="button" class="btn small secondary" data-bo-del="' + b.id + '">Remove</button></td></tr>').join('') + '</tbody></table></div>'
      : '<p class="muted">No blackout periods.</p>');
}

function wireBlackouts(ctx) {
  $('bo-add').addEventListener('click', () => {
    const s = $('bo-start').value, e = $('bo-end').value, r = $('bo-reason').value.trim();
    if (!s || !e || !r) { ctx.toast('Enter the dates and a reason.', true); return; }
    if (e < s) { ctx.toast('The end date cannot be before the start date.', true); return; }
    run(ctx, () => ctx.api.addBlackout(s, e, r), 'Blackout period added.');
  });
  document.querySelectorAll('[data-bo-del]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to remove'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Remove'; }, 4000); return; }
    run(ctx, () => ctx.api.deleteBlackout(Number(b.dataset.boDel)), 'Blackout period removed.');
  }));
}

// ------------------------------------------------------------ policy numbers
function policyHtml(ctx) {
  const s = ctx.settings;
  return '<div class="lv-grid">' +
    '<div class="field"><label>Largest document size (MB)</label><input type="number" id="pol-mb" min="1" max="20" step="1" value="' + esc(s.max_attachment_mb || 5) + '"></div>' +
    '<div class="field"><label>Hours in a workday</label><input type="number" id="pol-hours" min="1" max="24" step="0.5" value="' + esc(s.hours_per_day || 8) + '"></div>' +
    '<div class="field"><label>Default rest day</label><select id="pol-rest">' + WEEKDAYS.map((d, i) => '<option value="' + i + '"' + (Number(s.default_rest_day || 0) === i ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Allow two pending requests on the same dates</label><select id="pol-overlap"><option value="false"' + (s.allow_overlapping_pending ? '' : ' selected') + '>No — block duplicates</option><option value="true"' + (s.allow_overlapping_pending ? ' selected' : '') + '>Yes — show a warning only</option></select></div>' +
    '</div><div style="margin-top:10px;"><button type="button" class="btn small" id="pol-save">Save Policy</button></div>' +
    '<p class="muted">Custom-hours leave is converted to a fraction of a day using the workday length. The default rest day applies to anyone without their own.</p>';
}

function wirePolicy(ctx) {
  $('pol-save').addEventListener('click', () => {
    const mb = Number($('pol-mb').value), hrs = Number($('pol-hours').value);
    if (!(mb >= 1 && mb <= 20)) { ctx.toast('Document size must be between 1 and 20 MB.', true); return; }
    if (!(hrs >= 1 && hrs <= 24)) { ctx.toast('A workday must be between 1 and 24 hours.', true); return; }
    const next = {
      max_attachment_mb: mb, hours_per_day: hrs, default_rest_day: Number($('pol-rest').value), allow_overlapping_pending: $('pol-overlap').value === 'true',
    };
    run(ctx, async () => {
      for (const k of Object.keys(next)) {
        if (JSON.stringify(ctx.settings[k]) !== JSON.stringify(next[k])) await ctx.api.saveSetting(k, next[k]);
      }
    }, 'Leave policy saved.');
  });
}
