// Access & Performance Control Center -- compare up to five people side by side. Only figures that fit everyone's kind of work are compared (a cashier and a scrap encoder are
// compared on accuracy and errors, not on each other's sales); the best figure in a row is marked, never ranked into a verdict.
import { esc, panel, toast, empLink, wireLinks, dash, NOT_ENOUGH } from './apcCore.js?v=20261011a';
import { METRICS } from './apcMetricRows.js?v=20261011a';
import { familiesOf } from './apcMetrics.js?v=20261011a';

const MAX = 5;
const picked = new Set();
const FIRST = ['net', 'orders', 'error_rate', 'accuracy', 'tasks_done', 'scrap_entries'];

export function renderCompare(el, A, people) {
  const th = A.th();
  for (const id of [...picked]) if (!people.some((p) => p.id === id)) picked.delete(id);
  el.innerHTML = panel('Compare employees', '<details class="exp" id="cmp-pick"' + (picked.size ? '' : '') + '><summary><span class="exp-arrow" aria-hidden="true">▸</span>Choose up to ' + MAX + ' people <span class="exp-count">(' + picked.size + ' chosen)</span></summary><div class="exp-body apc-cmp-pick">' +
    people.map((p) => '<label class="apc-bcheck"><input type="checkbox" data-cmp="' + esc(p.id) + '"' + (picked.has(p.id) ? ' checked' : '') + '> ' + esc(p.name) + ' <span class="muted">' + esc(p.job_title || p.position || '') + '</span></label>').join('') + '</div></details><div id="cmp-out"></div>',
  { sub: 'Only figures that fit everyone’s kind of work are compared.' });
  el.querySelectorAll('[data-cmp]').forEach((cb) => cb.addEventListener('change', () => {
    if (cb.checked) { if (picked.size >= MAX) { cb.checked = false; return toast('You can compare up to ' + MAX + ' people at a time.', true); } picked.add(cb.dataset.cmp); } else picked.delete(cb.dataset.cmp);
    el.querySelector('.exp-count').textContent = '(' + picked.size + ' chosen)'; draw();
  }));
  function draw() {
    const out = el.querySelector('#cmp-out'), chosen = people.filter((p) => picked.has(p.id));
    if (chosen.length < 2) { out.innerHTML = '<p class="muted">Choose at least two people to compare.</p>'; return; }
    const fams = chosen.map((p) => familiesOf(p.perf));
    const fit = METRICS.filter((x) => x.fam === 'all' || fams.every((f) => f.includes(x.fam))).sort((a, b) => (FIRST.indexOf(a.id) < 0 ? 99 : FIRST.indexOf(a.id)) - (FIRST.indexOf(b.id) < 0 ? 99 : FIRST.indexOf(b.id)));
    const left = METRICS.length - fit.length;
    out.innerHTML = '<div class="table-scroll"><table class="sd-tbl"><thead><tr><th>Figure</th>' + chosen.map((p) => '<th class="sd-num">' + empLink(p.id, p.name, 'people') + '</th>').join('') + '</tr></thead><tbody>' +
      fit.map((x) => {
        const vals = chosen.map((p) => { const v = x.get(p.perf, th); return x.needsSample && p.perf.workload.total < th.min_sample ? null : v; });
        const nums = vals.filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
        const best = x.good && nums.length > 1 ? (x.good === 'up' ? Math.max(...nums) : Math.min(...nums)) : null;
        return '<tr><td>' + esc(x.label) + '</td>' + vals.map((v, i) => '<td class="sd-num' + (best !== null && v !== null && Number(v) === best && nums.some((n) => n !== best) ? ' apc-best' : '') + '">' +
          (v === null || v === undefined ? (x.needsSample ? NOT_ENOUGH : dash) : x.fmt(v)) + '</td>').join('') + '</tr>';
      }).join('') + '</tbody></table></div>' + (left ? '<p class="muted sd-small">' + left + ' figure' + (left === 1 ? '' : 's') + ' left out because they do not apply to all of the people chosen.</p>' : '');
    wireLinks(out, A);
  }
  draw();
}
