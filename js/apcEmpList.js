// Access & Performance Control Center -- the employee selector used by the Access Control and Employee Performance tabs: a searchable list on a wide screen,
// a drop-down on a phone, with Previous / Next so the owner can walk the whole team quickly. Search covers name, role, position, branch and status.
import { esc, chipFor, initials } from './apcCore.js?v=20261008a';

const keep = { search: '', vf: '' };
const VF = [['', 'Any access status'], ['VERIFIED', 'Verified'], ['NEEDS REVIEW', 'Needs review'], ['ACCESS MISMATCH', 'Access mismatch'], ['NOT REVIEWED', 'Not reviewed']];

function matches(p, q) {
  if (!q) return true;
  const hay = [p.name, p.role, p.position, p.job_title, p.branch_name, p.status, p.snap && p.snap.verify_status].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}
/** opts: { onPick(id), extra(p) -> html, showVerify } -- returns { ids() } so the page can step to the next person */
export function mountEmployeeList(el, A, opts) {
  const all = A.people().slice().sort((a, b) => a.name.localeCompare(b.name));
  const pass = () => all.filter((p) => matches(p, keep.search) && (!keep.vf || (p.snap && p.snap.verify_status === keep.vf)));
  function draw() {
    const list = pass(), sel = A.S.selected;
    el.innerHTML =
      '<div class="apc-emp-tools"><input type="search" id="apc-emp-q" placeholder="Search name, role, position, branch, status…" value="' + esc(keep.search) + '" aria-label="Search employees">' +
      (opts.showVerify ? '<select id="apc-emp-vf" aria-label="Filter by access status">' + VF.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === keep.vf ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>' : '') + '</div>' +
      '<div class="apc-emp-count muted">' + list.length + ' of ' + all.length + ' employees</div>' +
      '<select class="apc-emp-select" id="apc-emp-sel" aria-label="Employee">' + list.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + ' — ' + esc(p.job_title || p.position || p.role) + '</option>').join('') + '</select>' +
      '<div class="apc-emp-rows">' + (list.length ? list.map((p) => '<button type="button" class="apc-emp-row' + (p.id === sel ? ' active' : '') + '" data-emp="' + esc(p.id) + '">' +
        '<span class="apc-avatar" aria-hidden="true">' + esc(initials(p.name)) + '</span><span class="apc-emp-text"><span class="name">' + esc(p.name) + '</span>' +
        '<span class="sub">' + esc(p.job_title || p.position || '—') + ' · ' + esc(p.role === 'None' ? 'Position only' : p.role) + '</span><span class="sub">' + esc(p.branch_name || 'All branches') + '</span>' +
        '<span class="apc-emp-chips">' + chipFor(p.status) + (p.snap && ['NEEDS REVIEW', 'ACCESS MISMATCH'].includes(p.snap.verify_status) ? ' ' + chipFor(p.snap.verify_status) : '') + '</span>' + (opts.extra ? opts.extra(p) : '') + '</span></button>').join('')
        : '<p class="muted apc-pad">No employee matches.</p>') + '</div>';
    el.querySelector('#apc-emp-q').addEventListener('input', (e) => { keep.search = e.target.value; const pos = e.target.selectionStart; draw(); const q = el.querySelector('#apc-emp-q'); q.focus(); q.setSelectionRange(pos, pos); });
    const vf = el.querySelector('#apc-emp-vf'); if (vf) vf.addEventListener('change', (e) => { keep.vf = e.target.value; draw(); });
    el.querySelectorAll('[data-emp]').forEach((b) => b.addEventListener('click', () => opts.onPick(b.dataset.emp)));
    el.querySelector('#apc-emp-sel').addEventListener('change', (e) => opts.onPick(e.target.value));
    const rowsEl = el.querySelector('.apc-emp-rows'), act = el.querySelector('.apc-emp-row.active');
    if (rowsEl && act && (act.offsetTop < rowsEl.scrollTop || act.offsetTop + act.offsetHeight > rowsEl.scrollTop + rowsEl.clientHeight)) rowsEl.scrollTop = Math.max(0, act.offsetTop - rowsEl.offsetTop - 8);
  }
  draw();
  return { ids: () => pass().map((p) => p.id), redraw: draw };
}
