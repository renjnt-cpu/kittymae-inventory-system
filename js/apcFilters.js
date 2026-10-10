// Access & Performance Control Center -- the filter bar. Date range and branch change the figures (they are sent to the database); company, position, role and
// status only decide which people are listed. Access itself is always current -- it does not follow the date range.
import { esc, PRESETS, presetRange, previousRange, rangeText } from './apcCore.js?v=20261011b';

export function createFilters({ root, ctx, positions, onChange }) {
  const today = ctx.today;
  const state = { preset: 'this_month', custom: null, branch: '', company: 'Miss Kittymae', position: '', role: '', status: 'Active' };
  const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
  root.innerHTML =
    '<div class="card sd-filterbar apc-filters">' +
      '<div class="sd-fb-row">' +
        '<div class="field"><label for="apc-preset">Date range</label><select id="apc-preset">' + PRESETS.map((p) => '<option value="' + p.id + '">' + esc(p.label) + '</option>').join('') + '</select></div>' +
        '<div class="field sd-custom" hidden><label for="apc-from">Start date</label><input type="date" id="apc-from"></div>' +
        '<div class="field sd-custom" hidden><label for="apc-to">End date</label><input type="date" id="apc-to"></div>' +
        '<div class="sd-custom sd-custom-btns" hidden><button type="button" class="btn small" id="apc-apply">Apply</button></div>' +
        '<div class="field"><label for="apc-branch">Branch</label><select id="apc-branch"><option value="">All Branches</option>' + ctx.branches.map((b) => opt(b.id, b.name, '')).join('') + '</select></div>' +
        '<div class="field"><label for="apc-company">Company</label><select id="apc-company">' + opt('Miss Kittymae', 'Miss Kittymae', state.company) + opt('Layover', 'Layover', '') + opt('', 'Both companies', '') + '</select></div>' +
        '<div class="field"><label for="apc-position">Position</label><select id="apc-position"><option value="">All positions</option>' + positions.map((p) => opt(p, p, '')).join('') + '</select></div>' +
        '<div class="field"><label for="apc-role">Role</label><select id="apc-role"><option value="">All roles</option>' + ['Admin', 'Manager', 'Branch Supervisor', 'Staff', 'None'].map((r) => opt(r, r === 'None' ? 'None (position only)' : r, '')).join('') + '</select></div>' +
        '<div class="field"><label for="apc-status">Status</label><select id="apc-status">' + opt('Active', 'Active', state.status) + opt('Inactive', 'Inactive', '') + opt('', 'All', '') + '</select></div>' +
      '</div>' +
      '<div class="sd-fb-err" id="apc-fb-err" role="alert"></div>' +
      '<div class="sd-period-line" id="apc-period"></div>' +
    '</div>';
  const $ = (id) => root.querySelector('#' + id);
  const range = () => presetRange(state.preset, today, state.custom);
  const prev = () => previousRange(state.preset, range());
  function paint() {
    const r = range(), p = prev(), custom = state.preset === 'custom';
    $('apc-preset').value = state.preset;
    root.querySelectorAll('.sd-custom').forEach((e) => { e.hidden = !custom; });
    if (custom) { $('apc-from').value = r.from; $('apc-to').value = r.to; }
    $('apc-period').innerHTML = '<span><b>Selected period:</b> ' + esc(rangeText(r.from, r.to)) + '</span><span><b>Compared with:</b> ' + esc(rangeText(p.from, p.to)) + '</span>' +
      '<span class="muted">Access and permissions always show their current state, whatever the date range.</span>';
  }
  $('apc-preset').addEventListener('change', (e) => {
    $('apc-fb-err').textContent = '';
    if (e.target.value === 'custom') { const r = range(); state.custom = { from: r.from, to: r.to }; state.preset = 'custom'; paint(); return; }
    state.preset = e.target.value; state.custom = null; paint(); onChange('data');
  });
  $('apc-apply').addEventListener('click', () => {
    const a = $('apc-from').value, b = $('apc-to').value;
    if (!a || !b) { $('apc-fb-err').textContent = 'Pick both a start and an end date.'; return; }
    if (a > b) { $('apc-fb-err').textContent = 'The start date must not be after the end date.'; return; }
    if ((new Date(b) - new Date(a)) / 86400000 > 3660) { $('apc-fb-err').textContent = 'That range is too long (10 years at most).'; return; }
    $('apc-fb-err').textContent = ''; state.custom = { from: a, to: b }; state.preset = 'custom'; paint(); onChange('data');
  });
  $('apc-branch').addEventListener('change', (e) => { state.branch = e.target.value; onChange('data'); });
  [['company', 'apc-company'], ['position', 'apc-position'], ['role', 'apc-role'], ['status', 'apc-status']].forEach(([k, id]) => $(id).addEventListener('change', (e) => { state[k] = e.target.value; onChange('people'); }));
  paint();
  return {
    state, range, prev,
    /** the figures the database is asked for */
    server() { const r = range(); return { from: r.from, to: r.to, branch: state.branch === '' ? null : Number(state.branch) }; },
    prevServer() { const r = prev(); return { from: r.from, to: r.to, branch: state.branch === '' ? null : Number(state.branch) }; },
    branchName() { const b = ctx.branches.find((x) => String(x.id) === state.branch); return b ? b.name : 'All branches'; },
    describe() { const r = range(); return ['Period: ' + rangeText(r.from, r.to), 'Branch: ' + (state.branch ? this.branchName() : 'All branches'), 'Company: ' + (state.company || 'Both'), 'Generated: ' + new Date().toLocaleString('en-US', { timeZone: ctx.tz })]; },
    matches(p) {
      if (state.company && (p.company || 'Miss Kittymae') !== state.company) return false;
      if (state.status && p.status !== state.status) return false;
      if (state.role && p.role !== state.role) return false;
      if (state.position && (p.job_title || p.position) !== state.position) return false;
      return true;
    },
  };
}
