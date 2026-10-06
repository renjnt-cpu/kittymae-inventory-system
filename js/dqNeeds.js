// Data Fixes -- the "Needs Attention" section at the top of the Dashboard (Owner, Manager, Supervisor).
// It only ever shows open, fixable tasks, in plain words, each with one clear button. Everything comes from dq_summary / dq_list, which return
// sanitized fields only -- no sales, profit, capital, equity, cash or accounting notes, ever. The Dashboard loads this lazily and ignores any failure,
// so a problem here can never break the Dashboard itself.
import { dq } from './dqApi.js?v=20261007c';
import { TYPES, GROUPS, esc, int, prioBadge, bar, fixUrl, greeting, longDate, firstName, debounce } from './dqUi.js?v=20261007c';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* a private window: the choice just is not remembered */ } };
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* not remembered */ } };

const ACTION_LABEL = { COST_SET: 'Cost saved', PURCHASE_PRICE_SET: 'Purchase price saved', SKU_MATCHED: 'Item matched', BUNDLE_MAPPED: 'Bundle matched', PRODUCT_CREATED: 'Product created',
  CATEGORY_SET: 'Category saved', SUPPLIER_SET: 'Supplier saved', SUPPLIER_ADDED: 'Supplier added', ASSIGNED: 'Assigned', UNASSIGNED: 'Assignment removed', STARTED: 'Opened', REOPENED: 'Came back', AUTO_RESOLVED: 'Fixed elsewhere', ERROR: 'Could not save' };

export async function renderNeedsAttention(host, { employee }) {
  if (!host) return;
  const st = { scope: lsGet('dq_scope') === 'team' ? 'team' : 'mine', group: 'all', q: '', sum: null, results: null, assignees: null, assignOpen: null, recentHtml: '', recentLoaded: false };
  const seenKey = 'dq_notice_' + ((employee && employee.id) || '');

  async function load() {
    const sum = await dq.summary(st.scope);
    if (!sum.ok) { if (!st.sum) host.innerHTML = ''; return; }   // no access (or signed out): the Dashboard stays exactly as it was
    st.sum = sum; st.scope = sum.scope; paint();
  }

  function quickLinks() {
    const has = (href) => !!document.querySelector('.app-sidebar a[href="' + href + '"], nav a[href="' + href + '"]');
    const out = [{ href: 'fix-data.html', label: 'Fix Product Data', primary: true }];
    if (has('products.html')) out.push({ href: 'products.html', label: 'Manage SKU' });
    if (has('item-monitoring.html')) out.push({ href: 'item-monitoring.html', label: 'Receive Purchase' });
    if (has('transfers.html')) out.push({ href: 'transfers.html', label: 'Update Inventory' });
    return out;
  }

  function cardHtml(c) {
    const t = TYPES[c.type]; if (!t) return '';
    const started = c.fixed > 0 || c.in_progress > 0;
    const can = st.sum.can || {};
    const names = (c.assigned || []).filter(Boolean);
    const showUn = can.assign && c.unassigned > 0;
    return '<div class="dq-card" data-type="' + esc(c.type) + '">' +
      '<div class="dq-card-top">' + prioBadge(c.priority) + (c.new > 0 ? '<span class="dq-new">NEW ' + int(c.new) + '</span>' : '') + '</div>' +
      '<div class="dq-card-title">' + esc(t.title) + '</div>' +
      '<div class="dq-card-line">' + esc(t.line(c.open)) + '</div>' +
      (c.fixed > 0 ? '<div><div class="dq-progress-text"><span>' + int(c.fixed) + ' of ' + int(c.total) + ' fixed</span><span>' + int(c.pct) + '%</span></div>' + bar(c.pct) + '</div>' : '') +
      (names.length || showUn
        ? '<div class="muted">' + (names.length ? 'Assigned to ' + esc(names.join(', ')) : '') + (names.length && showUn ? ' · ' : '') + (showUn ? int(c.unassigned) + ' not assigned yet' : '') + '</div>' : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
        '<a class="dq-linkbtn" href="' + esc(fixUrl(c.type)) + '">' + (started ? 'CONTINUE FIXING' : esc(t.button)) + '</a>' +
        (showUn ? '<button type="button" class="dq-linkbtn secondary" data-assign="' + esc(c.type) + '">Assign</button>' : '') +
      '</div>' +
      (st.assignOpen === c.type ? assignHtml(c) : '') +
    '</div>';
  }

  function assignHtml(c) {
    if (!st.assignees) return '<div class="muted" style="margin-top:6px;">Loading people…</div>';
    if (!st.assignees.length) return '<div class="muted" style="margin-top:6px;">Nobody else can see these tasks yet. Give a person the “Data Fixes” access first.</div>';
    return '<div class="dq-assign" style="border-top:1px solid #f0f0f0;padding-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
      '<select data-assign-who aria-label="Assign to" style="padding:6px;border:1px solid #ddd;border-radius:6px;max-width:100%;"><option value="">Choose a person…</option>' +
        st.assignees.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + (p.position ? ' — ' + esc(p.position) : '') + '</option>').join('') + '</select>' +
      '<button type="button" class="btn small" data-assign-go="' + esc(c.type) + '">Assign ' + int(c.unassigned) + '</button>' +
      '<button type="button" class="btn small secondary" data-assign-cancel>Cancel</button>' +
      '<span class="dq-err" data-assign-msg role="alert"></span></div>';
  }

  function resultsHtml() {
    const r = st.results;
    if (r === null) return '';
    if (r === 'loading') return '<div class="dq-results muted">Searching…</div>';
    if (!r.length) return '<div class="dq-results muted">Nothing matches “' + esc(st.q) + '”.</div>';
    return '<div class="dq-results">' + r.map((row) => {
      const t = TYPES[row.type]; if (!t) return '';
      const name = row.external_sku ? row.external_sku + (row.description ? ' — ' + row.description : '') : (row.sku || '') + (row.product_name ? ' — ' + row.product_name : '');
      return '<div class="dq-result"><div class="dq-r-main"><div><b>' + esc(name) + '</b></div><div class="dq-r-sub">' + esc(t.title) + (row.assigned_to ? ' · ' + esc(firstName(row.assigned_to.name)) : '') + '</div></div>' +
        '<a class="dq-linkbtn" href="' + esc(fixUrl(row.type, { issue: row.issue_id })) + '">FIX NOW</a></div>';
    }).join('') + '</div>';
  }
  const showResults = () => { const el = host.querySelector('#dq-results'); if (el) el.innerHTML = resultsHtml(); };

  function paint() {
    const s = st.sum, c = s.counts || {}, can = s.can || {};
    const allCards = s.cards || [];
    const cards = allCards.filter((x) => st.group === 'all' || (st.group === 'urgent' ? x.priority === 'URGENT' : x.group === st.group));
    const groupsPresent = new Set(allCards.map((x) => x.group));
    const chips = GROUPS.filter(([k]) => k === 'all' || (k === 'urgent' ? allCards.some((x) => x.priority === 'URGENT') : groupsPresent.has(k)));
    const newOnes = allCards.filter((x) => x.new > 0);
    const noticeSeen = ssGet(seenKey) === newOnes.map((x) => x.type + x.new).join(',');
    const recent = (s.recent || []).filter((r) => TYPES[r.type]);
    const links = quickLinks();

    host.innerHTML =
      '<div class="card dq-hello"><div><h2>' + esc(greeting()) + (employee && employee.full_name ? ', ' + esc(firstName(employee.full_name)) : '') + '</h2><div class="muted">' + esc(longDate()) + '</div></div>' +
        '<div class="dq-quick">' + links.map((l) => '<a class="dq-linkbtn' + (l.primary ? '' : ' secondary') + '" href="' + esc(l.href) + '">' + esc(l.label) + '</a>').join('') + '</div></div>' +

      '<h3 class="dq-strip-title">Tasks needing attention</h3>' +
      '<div class="dq-strip" aria-label="Tasks needing attention">' +
        '<div class="tile"><div class="num">' + int(c.open) + '</div><div class="lbl">Open ' + (c.open === 1 ? 'Task' : 'Tasks') + '</div></div>' +
        '<div class="tile"><div class="num" style="color:var(--warn);">' + int(c.urgent) + '</div><div class="lbl">Urgent</div></div>' +
        '<div class="tile"><div class="num" style="color:#a15c00;">' + int(c.needs_attention) + '</div><div class="lbl">Needs attention</div></div>' +
        '<div class="tile"><div class="num">' + int(c.normal) + '</div><div class="lbl">Normal</div></div>' +
        '<div class="dq-health"><div><span class="num">' + int(s.health.pct) + '%</span> <span class="lbl">Data Health — complete</span></div>' + bar(s.health.pct) + '</div>' +
      '</div>' +

      '<div class="card dq-needs">' +
        '<div class="dq-needs-head"><h3>Needs Attention</h3><button type="button" class="dq-chip" data-refresh title="Look for new problems now">Refresh</button></div>' +
        (newOnes.length && !noticeSeen ? '<div class="msg" style="background:#e3edfd;color:#1a56b0;display:flex;justify-content:space-between;gap:8px;align-items:center;" role="status"><span><b>New:</b> ' +
          newOnes.map((x) => esc(TYPES[x.type].line(x.new))).join(' · ') + '</span><button type="button" class="dq-chip" data-dismiss-new>OK</button></div>' : '') +
        (recent.length ? '<div class="msg ok" role="status">' + recent.map((r) => esc(TYPES[r.type].done)).join(' ') + '</div>' : '') +
        '<div class="dq-tools">' +
          (allCards.length > 1 ? chips.map(([k, label]) => '<button type="button" class="dq-chip" data-group="' + k + '" aria-pressed="' + (st.group === k) + '">' + esc(label) + '</button>').join('') : '') +
          '<div class="dq-search"><input type="search" id="dq-q" placeholder="Search SKU or product" aria-label="Search SKU or product" value="' + esc(st.q) + '"></div>' +
          (can.team ? '<div class="dq-seg" role="group" aria-label="Which tasks"><button type="button" data-scope="mine" aria-pressed="' + (st.scope === 'mine') + '">My tasks</button><button type="button" data-scope="team" aria-pressed="' + (st.scope === 'team') + '">Team tasks</button></div>' : '') +
        '</div>' +
        '<div id="dq-results" aria-live="polite">' + resultsHtml() + '</div>' +
        (cards.length
          ? '<div class="dq-cards">' + cards.map(cardHtml).join('') + '</div>'
          : (allCards.length ? '<div class="dq-allgood"><p>Nothing in this group right now.</p></div>'
            : '<div class="dq-allgood"><h3>' + (recent.length ? 'All caught up.' : 'Everything looks good.') + '</h3><p>' +
              (recent.length ? 'All current data issues have been resolved.' : 'No data issues need attention right now.') + '</p></div>')) +
      '</div>' +
      '<div id="dq-recent">' + st.recentHtml + '</div>';
    wire();
    wireHistory();
    if (!st.recentLoaded) { st.recentLoaded = true; loadRecent(); }
  }

  // The change history: a Manager/Supervisor sees their own latest changes; the owner sees everybody's, newest first, and can keep loading older ones.
  const histRow = (r, own) => '<tr><td data-label="When">' + esc(new Date(r.at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</td>' +
    (own ? '' : '<td data-label="Who">' + esc(r.who) + (r.role ? ' <span class="muted">(' + esc(r.role) + ')</span>' : '') + '</td>') +
    '<td data-label="What">' + esc(ACTION_LABEL[r.action] || r.action) + (r.field ? ' <span class="muted">' + esc(r.field) + '</span>' : '') + '</td>' +
    '<td data-label="Item">' + esc(r.record || '—') + '</td><td data-label="Before">' + esc(r.old || '—') + '</td><td data-label="After">' + esc(r.new || '—') + '</td></tr>';
  async function loadRecent() {
    const own = !(st.sum && st.sum.owner);
    const res = own ? await dq.myChanges(10) : await dq.auditList(30, 0);
    if (!res.ok || !res.rows) return;
    const rows = res.rows.filter((r) => r.action !== 'STARTED');
    st.histOffset = res.rows.length; st.histMore = !own && res.rows.length >= 30;
    st.recentHtml = !rows.length ? '' :
      '<details class="card dq-recent"><summary>' + (own ? 'Your recent changes' : 'Recent changes by everyone') + '</summary><div class="table-scroll"><table><thead><tr><th>When</th>' + (own ? '' : '<th>Who</th>') +
      '<th>What</th><th>Item</th><th>Before</th><th>After</th></tr></thead><tbody id="dq-hist-body">' + rows.map((r) => histRow(r, own)).join('') + '</tbody></table></div>' +
      (st.histMore ? '<p style="margin:8px 0 0;"><button type="button" class="btn small secondary" id="dq-hist-more">Show older changes</button></p>' : '') + '</details>';
    const el = host.querySelector('#dq-recent'); if (el) { el.innerHTML = st.recentHtml; wireHistory(); }
  }
  function wireHistory() {
    const more = host.querySelector('#dq-hist-more'); if (!more) return;
    more.addEventListener('click', async () => {
      more.disabled = true; const res = await dq.auditList(50, st.histOffset);
      if (!res.ok) { more.disabled = false; return; }
      const body = host.querySelector('#dq-hist-body'); body.insertAdjacentHTML('beforeend', res.rows.filter((r) => r.action !== 'STARTED').map((r) => histRow(r, false)).join(''));
      st.histOffset += res.rows.length;
      if (res.rows.length < 50) more.remove(); else more.disabled = false;
      st.recentHtml = host.querySelector('#dq-recent').innerHTML;
    });
  }

  function wire() {
    host.querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => { st.group = b.dataset.group; paint(); }));
    host.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => { st.scope = b.dataset.scope; lsSet('dq_scope', st.scope); st.results = null; st.q = ''; load(); }));
    const rf = host.querySelector('[data-refresh]');
    if (rf) rf.addEventListener('click', async () => { rf.disabled = true; rf.textContent = 'Checking…'; await dq.refresh(); st.recentLoaded = false; await load(); });
    const dn = host.querySelector('[data-dismiss-new]');
    if (dn) dn.addEventListener('click', () => { ssSet(seenKey, (st.sum.cards || []).filter((x) => x.new > 0).map((x) => x.type + x.new).join(',')); paint(); });
    const q = host.querySelector('#dq-q');
    if (q) {
      const run = debounce(async () => {
        const v = q.value.trim();
        if (v.length < 2) { st.results = null; showResults(); return; }
        st.results = 'loading'; showResults();
        const res = await dq.list({ search: v, scope: st.scope, limit: 12 });
        if (q.value.trim() !== v) return;                       // the person kept typing: a newer search is on its way
        st.results = res.ok ? res.rows : []; showResults();
      }, 300);
      q.addEventListener('input', () => { st.q = q.value.trim(); run(); });
    }
    host.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', async () => {
      st.assignOpen = st.assignOpen === b.dataset.assign ? null : b.dataset.assign; paint();
      if (st.assignOpen && !st.assignees) { const r = await dq.assignees(); st.assignees = r.ok ? r.people : []; paint(); }
    }));
    host.querySelectorAll('[data-assign-cancel]').forEach((b) => b.addEventListener('click', () => { st.assignOpen = null; paint(); }));
    host.querySelectorAll('[data-assign-go]').forEach((b) => b.addEventListener('click', async () => {
      const box = b.closest('.dq-assign'); const who = box.querySelector('[data-assign-who]').value; const msg = box.querySelector('[data-assign-msg]');
      if (!who) { msg.textContent = 'Choose a person.'; return; }
      b.disabled = true; const r = await dq.assignType(b.dataset.assignGo, who, false); b.disabled = false;
      if (!r.ok) { msg.textContent = r.message; return; }
      st.assignOpen = null; await load();
    }));
  }

  // refresh quietly while the page is open, but never while someone is typing or choosing something
  const busy = () => { const ae = document.activeElement; return !!st.assignOpen || !!(ae && host.contains(ae) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(ae.tagName)); };
  await load();
  setInterval(() => { if (!document.hidden && !busy()) load(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy()) load(); });
}
