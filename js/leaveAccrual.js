// Leave Management -- Automatic Leave Credits (spec section 12), shown inside the Settings tab.
// HR drafts rules; a rule does nothing until the Final Approver switches it on, and before they
// do (or run it) they see exactly what it would change. The rules themselves are applied by the
// database every night -- this file only edits rules and previews them.
import { esc, fmtDate, num, daysText, errorsText } from './leaveUi.js?v=20261011a';
import { openSide, closeSide, sideBody } from './leaveSide.js?v=20261011a';

const $ = (id) => document.getElementById(id);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/** One plain-English paragraph per rule, so nobody has to decode the form to know what it does. */
export function ruleSummary(ctx, r) {
  const t = (ctx.typeById[r.leave_type_id] || {}).name || 'leave';
  const amount = daysText(r.amount);
  const when = r.frequency === 'Monthly'
    ? 'on the ' + ordinal(r.run_day) + ' of every month'
    : 'every ' + MONTHS[r.run_month - 1] + ' ' + r.run_day;
  let who = 'every active employee';
  if (r.employee_id) who = (ctx.dirById[r.employee_id] || {}).full_name || 'one employee';
  else {
    const bits = [];
    if (r.employment_status) bits.push(r.employment_status + ' employees');
    if (r.department) bits.push('in ' + r.department);
    if (r.min_service_months !== null && r.max_service_months !== null) bits.push('with ' + r.min_service_months + '–' + r.max_service_months + ' months of service');
    else if (r.min_service_months !== null) bits.push('with ' + r.min_service_months + '+ months of service');
    else if (r.max_service_months !== null) bits.push('with up to ' + r.max_service_months + ' months of service');
    if (bits.length) who = bits.join(' ');
  }
  let s = 'Adds ' + amount + ' of ' + t + ' ' + when + ', starting ' + fmtDate(r.starts_on) + '. Applies to ' + who + '.';
  if (r.reset_enabled) {
    s += ' Unused ' + t + ' credits expire every ' + MONTHS[r.reset_month - 1] + ' ' + r.reset_day +
      (r.carry_over_enabled ? ', except up to ' + daysText(r.max_carry_over) + ' that carry over' : '') + '.';
  }
  return s;
}

export function accrualHtml(ctx, rules) {
  const canEdit = ctx.flags.hr, isFinal = ctx.flags.final;
  const cards = rules.length ? rules.map((r) =>
    '<div class="lv-rule' + (r.active ? ' lv-rule-on' : '') + '" data-rule="' + esc(r.id) + '">' +
      '<div class="lv-rule-head"><b>' + esc(r.name) + '</b> ' + (r.active ? '<span class="badge lv-green">ON</span>' : '<span class="badge lv-gray">OFF — does nothing</span>') + '</div>' +
      '<div class="lv-text" style="margin:4px 0 6px;">' + esc(ruleSummary(ctx, r)) + '</div>' +
      '<div class="muted">' + (r.last_run_at ? 'Last run ' + esc(new Date(r.last_run_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })) + ' · ' + esc(r.last_run_count) + ' entr' + (r.last_run_count === 1 ? 'y' : 'ies') : 'Never run') + '</div>' +
      '<div class="lv-row-actions" style="margin-top:8px;">' +
        '<button type="button" class="btn small secondary" data-rule-preview="' + esc(r.id) + '">Preview</button>' +
        (canEdit && (!r.active || isFinal) ? '<button type="button" class="btn small secondary" data-rule-edit="' + esc(r.id) + '">Edit</button>' : '') +
        (isFinal ? '<button type="button" class="btn small' + (r.active ? ' secondary' : '') + '" data-rule-toggle="' + esc(r.id) + '">' + (r.active ? 'Turn Off' : 'Turn On…') + '</button>' : '') +
        (isFinal && r.active ? '<button type="button" class="btn small secondary" data-rule-run="' + esc(r.id) + '">Run Now…</button>' : '') +
        (canEdit && !r.active ? '<button type="button" class="btn small secondary" data-rule-delete="' + esc(r.id) + '">Delete</button>' : '') +
      '</div>' +
      (r.active && !isFinal ? '<div class="muted" style="margin-top:4px;">Only the Final Approver can change a rule that is switched on.</div>' : '') +
    '</div>').join('') : '<p class="muted">No automatic credit rules yet.</p>';
  return '<p class="muted" style="margin-top:0;">Rules add (or expire) leave credits on a schedule — for example “add 1.25 days every month” or “5 days every January, unused credits expire in December, carry over up to 5”. ' +
    '<b>A rule never does anything until the Final Approver turns it on</b>, and it never reaches back before its start date. Switched-on rules run automatically every night at 12:10 AM; every credit appears in the employee’s credit history.</p>' +
    (canEdit ? '<div style="margin-bottom:10px;"><button type="button" class="btn small" id="rule-add">+ New Rule</button></div>' : '') +
    '<div class="lv-rules">' + cards + '</div>';
}

export function wireAccrual(ctx, rules) {
  const byId = (id) => rules.find((r) => r.id === id);
  const add = $('rule-add');
  if (add) add.addEventListener('click', () => openRuleForm(ctx, null));
  document.querySelectorAll('[data-rule-edit]').forEach((b) => b.addEventListener('click', () => openRuleForm(ctx, byId(b.dataset.ruleEdit))));
  document.querySelectorAll('[data-rule-preview]').forEach((b) => b.addEventListener('click', () => openPreview(ctx, byId(b.dataset.rulePreview), 'preview')));
  document.querySelectorAll('[data-rule-run]').forEach((b) => b.addEventListener('click', () => openPreview(ctx, byId(b.dataset.ruleRun), 'run')));
  document.querySelectorAll('[data-rule-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const r = byId(b.dataset.ruleToggle);
    if (!r.active) { openPreview(ctx, r, 'activate'); return; }
    b.disabled = true;
    try {
      const res = await ctx.api.setAccrualActive(r.id, false);
      if (res && res.ok === false) throw new Error(errorsText(res));
      ctx.toast('Rule switched off — it will no longer add credits.', false);
      await ctx.refresh();
    } catch (err) { ctx.toast(err.message || String(err), true); b.disabled = false; }
  }));
  document.querySelectorAll('[data-rule-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to delete'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Delete'; }, 4000); return; }
    b.disabled = true;
    try {
      const res = await ctx.api.deleteAccrualRule(b.dataset.ruleDelete);
      if (res && res.ok === false) throw new Error(errorsText(res));
      ctx.toast('Rule deleted.', false);
      await ctx.refresh();
    } catch (err) { ctx.toast(err.message || String(err), true); b.disabled = false; b.textContent = 'Delete'; b.dataset.armed = ''; }
  }));
}

// ---------------------------------------------------------------- editor
function openRuleForm(ctx, r) {
  const v = r || {
    name: '', leave_type_id: (ctx.types.find((t) => t.active && t.requires_credit) || ctx.types[0] || {}).id, frequency: 'Monthly', amount: '',
    run_month: 1, run_day: 1, starts_on: ctx.today, employment_status: null, department: null, employee_id: null,
    min_service_months: null, max_service_months: null, reset_enabled: false, reset_month: 12, reset_day: 31, carry_over_enabled: false, max_carry_over: null,
  };
  const people = ctx.dir.filter((e) => e.status === 'Active').sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  const depts = Array.from(new Set(ctx.dir.map((e) => e.department).filter(Boolean))).sort();
  const statuses = Array.from(new Set(ctx.dir.map((e) => e.employment_status).filter(Boolean))).sort();
  const opt = (val, label, cur) => '<option value="' + esc(val) + '"' + (String(cur) === String(val) ? ' selected' : '') + '>' + esc(label) + '</option>';
  const monthOpts = (cur) => MONTHS.map((m, i) => opt(i + 1, m, cur)).join('');
  const dayOpts = (cur) => Array.from({ length: 31 }, (_, i) => opt(i + 1, i + 1, cur)).join('');
  const val = (x) => (x === null || x === undefined ? '' : x);

  openSide({
    title: r ? 'Edit Credit Rule' : 'New Credit Rule', sub: r ? r.name : 'Starts switched OFF',
    body: '<div id="lv-side-msg"></div>' +
      '<div class="field"><label>Rule Name *</label><input type="text" id="ar-name" maxlength="120" placeholder="e.g. Monthly vacation credit — regular staff" value="' + esc(v.name) + '"></div>' +
      '<div class="drawer-section" style="margin-top:12px;"><h4>What it adds</h4><div class="lv-grid">' +
        '<div class="field"><label>Leave Type *</label><select id="ar-type">' + ctx.types.filter((t) => t.active).map((t) => opt(t.id, t.name, v.leave_type_id)).join('') + '</select></div>' +
        '<div class="field"><label>Days to add each time *</label><input type="number" id="ar-amount" min="0.25" step="0.25" inputmode="decimal" value="' + esc(val(v.amount)) + '"></div>' +
        '<div class="field"><label>How often *</label><select id="ar-freq">' + opt('Monthly', 'Every month', v.frequency) + opt('Annual', 'Once a year', v.frequency) + '</select></div>' +
        '<div class="field" id="ar-month-wrap"><label>Month</label><select id="ar-month">' + monthOpts(v.run_month) + '</select></div>' +
        '<div class="field"><label>On day *</label><select id="ar-day">' + dayOpts(v.run_day) + '</select></div>' +
        '<div class="field"><label>Starts on *</label><input type="date" id="ar-start" value="' + esc(v.starts_on) + '"></div>' +
      '</div><div class="muted" style="margin-top:4px;">Credits are never added for dates before the start date. Days past the end of a short month use the last day.</div></div>' +
      '<div class="drawer-section"><h4>Who gets it <span style="text-transform:none;" class="muted">— leave everything blank for every active employee</span></h4><div class="lv-grid">' +
        '<div class="field"><label>Employment Status</label><select id="ar-status"><option value="">Any</option>' + statuses.map((s) => opt(s, s, v.employment_status)).join('') + '</select></div>' +
        '<div class="field"><label>Department</label><select id="ar-dept"><option value="">Any</option>' + depts.map((d) => opt(d, d, v.department)).join('') + '</select></div>' +
        '<div class="field"><label>One specific employee</label><select id="ar-emp"><option value="">Anyone matching</option>' + people.map((p) => opt(p.employee_id, p.full_name, v.employee_id)).join('') + '</select></div>' +
        '<div class="field"><label>Months of service — at least</label><input type="number" id="ar-min" min="0" step="1" value="' + esc(val(v.min_service_months)) + '"></div>' +
        '<div class="field"><label>Months of service — at most</label><input type="number" id="ar-max" min="0" step="1" value="' + esc(val(v.max_service_months)) + '"></div>' +
      '</div><div class="muted" style="margin-top:4px;">Length of service is counted from the Date Hired in the 201-File, as of each credit date.</div></div>' +
      '<div class="drawer-section"><h4>Yearly reset (optional)</h4>' +
        '<label class="lv-check"><input type="checkbox" id="ar-reset"' + (v.reset_enabled ? ' checked' : '') + '> Unused credits of this leave type expire once a year</label>' +
        '<div class="lv-grid" id="ar-reset-fields" style="margin-top:6px;">' +
          '<div class="field"><label>Expire on — month</label><select id="ar-rmonth">' + monthOpts(v.reset_month) + '</select></div>' +
          '<div class="field"><label>Expire on — day</label><select id="ar-rday">' + dayOpts(v.reset_day) + '</select></div></div>' +
        '<div id="ar-carry-wrap"><label class="lv-check"><input type="checkbox" id="ar-carry"' + (v.carry_over_enabled ? ' checked' : '') + '> Let some unused credits carry over</label>' +
        '<div class="field" id="ar-carry-fields" style="max-width:260px;margin-top:6px;"><label>Most days that can carry over *</label><input type="number" id="ar-carrymax" min="0" step="0.25" inputmode="decimal" value="' + esc(val(v.max_carry_over)) + '"></div></div>' +
        '<div class="muted" style="margin-top:4px;">On the expiry date, anything above the carry-over limit is removed (recorded as an “Expiration” in the credit history). The reset happens just before that day’s new credits are added.</div></div>',
    footer: '<button type="button" class="btn" id="ar-save">' + (r ? 'Save Changes' : 'Save Rule (stays OFF)') + '</button><button type="button" class="btn secondary" id="ar-cancel">Cancel</button>',
  });

  const sync = () => {
    $('ar-month-wrap').hidden = $('ar-freq').value !== 'Annual';
    $('ar-reset-fields').hidden = !$('ar-reset').checked;
    $('ar-carry-wrap').hidden = !$('ar-reset').checked;
    $('ar-carry-fields').hidden = !($('ar-reset').checked && $('ar-carry').checked);
  };
  ['ar-freq', 'ar-reset', 'ar-carry'].forEach((id) => $(id).addEventListener('change', sync));
  sync();
  $('ar-cancel').addEventListener('click', closeSide);
  $('ar-save').addEventListener('click', async () => {
    const numOrNull = (id) => { const x = $(id).value.trim(); return x === '' ? null : Number(x); };
    const reset = $('ar-reset').checked, carry = reset && $('ar-carry').checked;
    const payload = {
      id: r ? r.id : null, name: $('ar-name').value.trim(), leaveTypeId: Number($('ar-type').value), frequency: $('ar-freq').value,
      amount: numOrNull('ar-amount'), runMonth: Number($('ar-month').value), runDay: Number($('ar-day').value), startsOn: $('ar-start').value || null,
      employmentStatus: $('ar-status').value, department: $('ar-dept').value, employeeId: $('ar-emp').value || null,
      minServiceMonths: numOrNull('ar-min'), maxServiceMonths: numOrNull('ar-max'),
      resetEnabled: reset, resetMonth: Number($('ar-rmonth').value), resetDay: Number($('ar-rday').value),
      carryOverEnabled: carry, maxCarryOver: carry ? numOrNull('ar-carrymax') : null,
    };
    $('ar-save').disabled = true;
    try {
      const res = await ctx.api.saveAccrualRule(payload);
      if (res && res.ok === false) { $('lv-side-msg').innerHTML = '<div class="msg error">' + esc(res.errors.join(' ')) + '</div>'; sideBody().scrollTop = 0; $('ar-save').disabled = false; return; }
      closeSide();
      ctx.toast(r ? 'Rule saved.' : 'Rule saved — it is OFF until the Final Approver turns it on.', false);
      await ctx.refresh();
    } catch (err) { $('lv-side-msg').innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>'; $('ar-save').disabled = false; }
  });
}

// ---------------------------------------------------------------- preview / turn on / run now
async function openPreview(ctx, r, mode) {
  const titles = { preview: 'Preview — what this rule would do', activate: 'Turn on this rule?', run: 'Run this rule now?' };
  openSide({ title: titles[mode], sub: r.name, body: '<p class="muted">Calculating…</p>' });
  let asOf = ctx.today;
  const draw = async () => {
    let data;
    try { data = await ctx.api.previewAccrual(r.id, asOf); } catch (err) { sideBody().innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>'; return; }
    const rows = data.rows || [];
    const intro = {
      preview: 'Nothing has been applied — this only shows what would happen on the date below.',
      activate: 'Once switched on, this rule runs every night at 12:10 AM and adds credits automatically. The list below is what it would apply right away (as of today).',
      run: 'This applies the entries below now. It cannot be undone except by manual credit adjustments, so check the list first.',
    }[mode];
    sideBody().innerHTML = '<div id="lv-side-msg"></div><div class="msg" style="background:#eef3fb;color:#1a3a6b;">' + esc(intro) + '</div>' +
      '<div class="drawer-section"><h4>Rule</h4><div class="lv-text">' + esc(ruleSummary(ctx, r)) + '</div></div>' +
      (mode === 'preview' ? '<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:10px;"><div class="field"><label>As of date</label><input type="date" id="ap-asof" value="' + esc(asOf) + '"></div><button type="button" class="btn small secondary" id="ap-go">Show</button></div>' : '') +
      '<div class="drawer-section"><h4>' + data.count + ' entr' + (data.count === 1 ? 'y' : 'ies') + ' · net ' + (Number(data.net_credits) >= 0 ? '+' : '') + esc(num(data.net_credits)) + ' days' + (data.truncated ? ' · showing the first 500' : '') + '</h4>' +
      (rows.length ? '<div class="table-scroll table-2col"><table><thead><tr><th>Employee</th><th>What</th><th>Days</th><th>For</th></tr></thead><tbody>' +
        rows.map((x) => '<tr><td data-label="Employee">' + esc(x.employee_name) + '</td><td data-label="What">' + (x.kind === 'reset' ? 'Yearly reset (expire)' : (r.frequency === 'Monthly' ? 'Monthly credit' : 'Annual credit')) + '</td>' +
          '<td data-label="Days"><b class="' + (x.kind === 'reset' ? 'lv-neg' : 'lv-pos') + '">' + (x.kind === 'reset' ? '−' : '+') + esc(num(x.amount)) + '</b></td><td data-label="For">' + esc(fmtDate(x.scheduled)) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="muted">Nothing would be applied' + (mode === 'preview' ? ' on that date' : ' right now') + ' — either every period is already applied, the start date is still ahead, or nobody matches the “who gets it” filters.</p>') + '</div>';
    const go = $('ap-go');
    if (go) go.addEventListener('click', () => { asOf = $('ap-asof').value || ctx.today; draw(); });
    const foot = $('lv-side-footer');
    foot.hidden = false;
    foot.innerHTML = (mode === 'activate' ? '<button type="button" class="btn" id="ap-ok">Turn On Rule</button>' : mode === 'run' ? '<button type="button" class="btn" id="ap-ok">Apply Now</button>' : '') +
      '<button type="button" class="btn secondary" id="ap-close">' + (mode === 'preview' ? 'Close' : 'Cancel') + '</button>';
    $('ap-close').addEventListener('click', closeSide);
    const ok = $('ap-ok');
    if (ok) ok.addEventListener('click', async () => {
      ok.disabled = true;
      try {
        const res = mode === 'activate' ? await ctx.api.setAccrualActive(r.id, true) : await ctx.api.runAccrual(r.id);
        if (res && res.ok === false) throw new Error(errorsText(res));
        closeSide();
        ctx.toast(mode === 'activate' ? 'Rule switched on — it runs every night at 12:10 AM.' : 'Applied ' + res.applied + ' credit entr' + (res.applied === 1 ? 'y' : 'ies') + '.', false);
        await ctx.refresh();
      } catch (err) { $('lv-side-msg').innerHTML = '<div class="msg error">' + esc(err.message || String(err)) + '</div>'; ok.disabled = false; }
    });
  };
  await draw();
}
