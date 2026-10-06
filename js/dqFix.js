// Data Fixes -- the "Fix Product Data" screen: one focused edit form at a time (SAVE & NEXT, SAVE, CANCEL) or, where it is safe, several rows at once.
// SEE PROBLEM -> CLICK -> EDIT -> SAVE -> DONE. It never opens a report or an accounting screen, and the database only hands it sanitized fields.
// The forms for each kind of problem live in dqFixModes.js (cost, purchase, category, supplier) and dqFixSku.js (matching a sold item).
import { dq, GENERIC_ERROR, LOAD_ERROR } from './dqApi.js?v=20261007e';
import { TYPES, MODE_TO_TYPE, esc, int, bar, showMsg, confirmBox, debounce, firstName } from './dqUi.js?v=20261007e';
import { MODES } from './dqFixModes.js?v=20261007e';
import { skuMode } from './dqFixSku.js?v=20261007e';

const ALL_MODES = Object.assign({}, MODES, { sku: skuMode });
const PAGE = 50;

export async function startFixPage({ root, employee }) {
  const qs = new URLSearchParams(location.search);
  const S = { sum: null, type: null, scope: 'mine', view: 'one', ids: [], idx: 0, rows: new Map(), fixed: 0, total: 0, options: null, assignees: null, search: '',
    bulk: { rows: [], total: 0, offset: 0, sel: new Set() }, wantIssue: Number(qs.get('issue')) || null, wantSku: qs.get('sku') || null, busy: false };
  try { if (localStorage.getItem('dq_scope') === 'team') S.scope = 'team'; } catch (e) { /* default */ }

  root.innerHTML = '<div class="dq-fixpage"><div class="dq-fix-head"><h2>Fix Product Data</h2><a class="dq-linkbtn secondary" href="dashboard.html">← Back to Dashboard</a></div>' +
    '<div id="dq-msg" aria-live="polite"></div><div class="dq-pills" id="dq-pills"></div><div class="dq-tools" id="dq-tools"></div><div id="dq-body"><p class="muted">Loading…</p></div></div>';
  const $ = (id) => root.querySelector('#' + id);
  const say = (text, kind) => { showMsg($('dq-msg'), text, kind); if (text) $('dq-msg').scrollIntoView({ block: 'nearest' }); };

  // ---------------------------------------------------------------- start
  const sum = await dq.summary(S.scope);
  if (!sum.ok) {
    $('dq-body').innerHTML = sum.reason === 'no_access'
      ? '<div class="card dq-allgood"><h3>This page is not available to you</h3><p>Ask an Admin to give you the “Data Fixes” access.</p><p style="margin-top:10px;"><a class="dq-linkbtn" href="dashboard.html">Back to Dashboard</a></p></div>'
      : '<div class="msg error">' + esc(sum.message || LOAD_ERROR) + '</div>';
    return;
  }
  S.sum = sum; S.scope = sum.scope;
  const wanted = qs.get('type');
  const wantedType = wanted && (TYPES[wanted] ? wanted : MODE_TO_TYPE[wanted]);
  const canFix = (type) => (sum.cards || []).some((c) => c.type === type);
  S.type = wantedType && (canFix(wantedType) || (sum.can && modeAllowed(wantedType))) ? wantedType : ((sum.cards || [])[0] || {}).type || null;

  function modeAllowed(type) { const m = TYPES[type] && TYPES[type].mode; const need = { cost: 'cost', sku: 'sku_match', purchase: 'purchase', category: 'category', supplier: 'supplier' }[m]; return !!(sum.can && sum.can[need]); }
  const t = () => TYPES[S.type];
  const mode = () => ALL_MODES[t().mode];

  const opt = await dq.options(); S.options = opt.ok ? opt : { categories: [], suppliers: [], can_add_category: false, can_add_supplier: false };

  function ctx() {
    return { can: S.sum.can || {}, options: S.options, say, row: null,
      async refreshOptions() { const o = await dq.options(); if (o.ok) S.options = o; return S.options; },
      async assignees() { if (!S.assignees) { const r = await dq.assignees(); S.assignees = r.ok ? r.people : []; } return S.assignees; } };
  }

  // ---------------------------------------------------------------- header: kinds of tasks, mode, who
  function paintHead() {
    const cards = S.sum.cards || [];
    const pills = cards.map((c) => '<button type="button" class="dq-chip" data-pill="' + esc(c.type) + '" aria-pressed="' + (c.type === S.type) + '">' + esc(TYPES[c.type].pill) + ' · ' + int(c.open) + '</button>').join('');
    $('dq-pills').innerHTML = cards.length > 1 ? pills : '';
    const can = S.sum.can || {};
    const bulkOk = S.type && can.bulk && mode() && mode().bulk;
    $('dq-tools').innerHTML =
      (bulkOk ? '<div class="dq-seg" role="group" aria-label="How to fix"><button type="button" data-view="one" aria-pressed="' + (S.view === 'one') + '">One at a time</button><button type="button" data-view="bulk" aria-pressed="' + (S.view === 'bulk') + '">Several at once</button></div>' : '') +
      (can.team ? '<div class="dq-seg" role="group" aria-label="Which tasks"><button type="button" data-scope="mine" aria-pressed="' + (S.scope === 'mine') + '">My tasks</button><button type="button" data-scope="team" aria-pressed="' + (S.scope === 'team') + '">Team tasks</button></div>' : '') +
      (S.type ? '<div class="dq-search"><input type="search" id="dq-find" placeholder="Search SKU or product" aria-label="Search SKU or product" value="' + esc(S.search) + '"></div>' : '');
    root.querySelectorAll('[data-pill]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.pill !== S.type) { S.type = b.dataset.pill; S.view = 'one'; S.search = ''; S.wantIssue = null; S.wantSku = null; boot(); } }));
    root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.view; paintHead(); show(); }));
    root.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => { S.scope = b.dataset.scope; try { localStorage.setItem('dq_scope', S.scope); } catch (e) { /* not remembered */ } boot(); }));
    const find = $('dq-find');
    if (find) find.addEventListener('input', debounce(() => { S.search = find.value.trim(); boot(true); }, 350));
  }

  // ---------------------------------------------------------------- the queue
  async function boot(keepFocus) {
    say('');
    $('dq-body').innerHTML = '<p class="muted">Loading…</p>';
    const s2 = await dq.summary(S.scope); if (s2.ok) { S.sum = s2; S.scope = s2.scope; }
    if (!S.type) { paintHead(); return done(true); }
    if (!(S.sum.cards || []).some((c) => c.type === S.type) && !S.search) { /* nothing left of this kind */ }
    const res = await dq.list({ type: S.type, scope: S.scope, search: S.search || null, limit: PAGE, offset: 0 });
    if (!res.ok) { $('dq-body').innerHTML = '<div class="msg error">' + esc(res.message || LOAD_ERROR) + ' <button type="button" class="btn small" id="dq-retry">Try again</button></div>'; $('dq-retry').addEventListener('click', () => boot()); return; }
    S.ids = res.ids || []; S.idx = 0; S.rows = new Map((res.rows || []).map((r) => [r.issue_id, r])); S.total = S.ids.length; S.fixed = 0;
    S.bulk = { rows: res.rows || [], total: res.total, offset: (res.rows || []).length, sel: new Set() };
    // a deep link (from the Dashboard search or the SKU Catalog) opens that exact item first
    if (S.wantIssue || S.wantSku) {
      const it = S.wantIssue ? await dq.item({ id: S.wantIssue }) : await dq.item({ type: S.type, record: S.wantSku });
      S.wantIssue = null; S.wantSku = null;
      if (it.ok && it.row) {
        if (it.row.resolved) say('This one has already been fixed. Here is the next one.', 'ok');
        else { S.rows.set(it.row.issue_id, it.row); S.ids = [it.row.issue_id].concat(S.ids.filter((x) => x !== it.row.issue_id)); S.total = S.ids.length; }
      } else if (it.message) say(it.message, 'error');
    }
    paintHead();
    if (!S.ids.length) return done(false);
    show();
    if (keepFocus) { const f = $('dq-find'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }
  }

  async function currentRow() {
    const id = S.ids[S.idx];
    if (S.rows.has(id)) return S.rows.get(id);
    const r = await dq.item({ id });
    if (!r.ok) return { error: r.message };
    S.rows.set(id, r.row); return r.row;
  }

  function show() { return S.view === 'bulk' && S.sum.can.bulk && mode().bulk ? showBulk() : showOne(); }

  // ---------------------------------------------------------------- one at a time
  async function showOne() {
    if (!S.ids.length) return done(false);
    if (S.idx >= S.ids.length) S.idx = 0;
    const row = await currentRow();
    if (!row || row.error) { $('dq-body').innerHTML = '<div class="msg error">' + esc((row && row.error) || LOAD_ERROR) + '</div>'; return; }
    if (row.resolved) { S.ids.splice(S.idx, 1); return showOne(); }   // somebody fixed it while this screen was open
    const c = ctx(); c.row = row;
    const inst = mode().make(row, c);
    const left = S.ids.length, pct = (S.fixed + left) ? Math.round(100 * S.fixed / (S.fixed + left)) : 0;
    $('dq-body').innerHTML =
      '<div class="card dq-fixcard"><div class="dq-fix-progress"><div class="dq-progress-text"><span>' + int(S.fixed) + ' fixed · ' + int(left) + ' left</span><span>' + pct + '%</span></div>' + bar(pct) + '</div>' +
      '<p class="dq-fix-title">' + esc(t().fixTitle) + '</p><dl class="dq-facts">' + inst.facts + '</dl>' +
      '<div class="dq-form">' + inst.form + '</div>' +
      '<div class="dq-err" id="dq-form-err" role="alert"></div>' +
      (S.sum.can.assign ? '<div class="muted" id="dq-assign-line" style="margin-top:8px;"></div>' : '') +
      '<div class="dq-actions dq-sticky"><button type="button" class="btn primary-next" id="dq-next">SAVE &amp; NEXT</button><button type="button" class="btn" id="dq-save">SAVE</button>' +
        '<button type="button" class="btn secondary" id="dq-cancel">CANCEL</button>' + (left > 1 ? '<button type="button" class="dq-skip" id="dq-skip">Skip this one</button>' : '') + '</div></div>';
    const card = $('dq-body');
    if (inst.bind) inst.bind(card);
    const first = card.querySelector('.dq-form input:not([type=hidden]), .dq-form select'); if (first && !('ontouchstart' in window)) first.focus();
    dq.start(row.issue_id);   // marks it IN PROGRESS (goes back to OPEN by itself if nobody finishes it)
    if (S.sum.can.assign) paintAssignLine(row);

    const errBox = $('dq-form-err');
    const setBusy = (b) => { S.busy = b; card.querySelectorAll('.dq-actions button, .dq-form input, .dq-form select').forEach((x) => { x.disabled = b; }); $('dq-next').textContent = b ? 'Saving…' : 'SAVE & NEXT'; };
    async function save(after) {
      errBox.textContent = '';
      const got = inst.collect();
      if (!got.ok) { errBox.textContent = got.error; const f = got.field && card.querySelector('[name="' + got.field + '"], #' + got.field); if (f) f.focus(); return; }
      setBusy(true);
      let res = await inst.save(got.payload, false);
      if (res && res.needs_confirm) {
        setBusy(false);
        const yes = await confirmBox(inst.confirm(got.payload, res));
        if (!yes) return;
        setBusy(true); res = await inst.save(got.payload, true);
      }
      setBusy(false);
      if (!res || !res.ok) { errBox.textContent = (res && res.message) || GENERIC_ERROR; if (res && res.contact_admin) errBox.textContent += ' Contact Admin if the problem continues.'; return; }
      S.fixed++; S.ids.splice(S.idx, 1); S.rows.delete(row.issue_id);
      say(res.message || 'Saved.', 'ok');
      if (after === 'dash') { setTimeout(() => { location.href = 'dashboard.html'; }, 700); $('dq-body').innerHTML = '<div class="card dq-done"><h2>Saved</h2><p class="muted">Taking you back to the Dashboard…</p></div>'; return; }
      const fresh = await dq.summary(S.scope); if (fresh.ok) S.sum = fresh;
      paintHead(); return S.ids.length ? showOne() : done(false);
    }
    $('dq-next').addEventListener('click', () => save('next'));
    $('dq-save').addEventListener('click', () => save('dash'));
    $('dq-cancel').addEventListener('click', () => { location.href = 'dashboard.html'; });
    const sk = $('dq-skip'); if (sk) sk.addEventListener('click', () => { S.idx = (S.idx + 1) % S.ids.length; showOne(); });
    card.querySelectorAll('.dq-form input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && i.tagName === 'INPUT') { e.preventDefault(); save('next'); } }));
  }

  async function paintAssignLine(row) {
    const line = $('dq-assign-line'); if (!line) return;
    line.innerHTML = 'Assigned to: <b>' + esc(row.assigned_to ? firstName(row.assigned_to.name) : 'nobody yet') + '</b> <button type="button" class="dq-use" id="dq-assign-open">Change</button>';
    $('dq-assign-open').addEventListener('click', async () => {
      const people = await ctx().assignees(); S.assignees = people;
      line.innerHTML = 'Assign this one to: <select id="dq-assign-who" style="padding:6px;border:1px solid #ddd;border-radius:6px;"><option value="">Nobody</option>' +
        people.map((p) => '<option value="' + esc(p.id) + '"' + (row.assigned_to && row.assigned_to.id === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select> <button type="button" class="btn small" id="dq-assign-go">Assign</button><span class="dq-err" id="dq-assign-err"></span>';
      $('dq-assign-go').addEventListener('click', async () => {
        const r = await dq.assign([row.issue_id], $('dq-assign-who').value || null);
        if (!r.ok) { $('dq-assign-err').textContent = ' ' + r.message; return; }
        const who = people.find((p) => p.id === $('dq-assign-who').value);
        row.assigned_to = who ? { id: who.id, name: who.name } : null; say(r.message, 'ok'); paintAssignLine(row);
      });
    });
  }

  // ---------------------------------------------------------------- several at once
  async function showBulk() {
    const m = mode().bulk;
    const c = ctx();
    const b = S.bulk;
    const inst = m.make(c);
    const rowsHtml = b.rows.map((r) => '<tr data-id="' + r.issue_id + '"><td data-label="Select"><input type="checkbox" data-sel="' + r.issue_id + '" aria-label="Select"' + (b.sel.has(r.issue_id) ? ' checked' : '') + '></td>' + inst.row(r) + '<td class="dq-rowerr" data-rowerr></td></tr>').join('');
    $('dq-body').innerHTML =
      '<div class="card dq-bulk"><p class="dq-fix-title">' + esc(t().fixTitle) + ' — several at once</p><p class="muted" style="margin:0 0 10px;">Tick the ones you want, fill them in, then Save Selected. You will be asked to confirm before anything is saved.</p>' +
      '<div class="dq-bulkbar">' + inst.toolbar + '</div><div id="dq-bulk-err" class="dq-err" role="alert"></div>' +
      '<div class="table-scroll"><table><thead><tr><th><input type="checkbox" id="dq-all" aria-label="Select all"></th>' + inst.head + '<th></th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;"><span class="muted" id="dq-bulk-count"></span>' +
      (b.offset < b.total ? '<button type="button" class="btn small secondary" id="dq-more">Show more (' + int(b.total - b.offset) + ' left)</button>' : '') + '</div>' +
      '<div class="dq-actions dq-sticky"><button type="button" class="btn primary-next" id="dq-bsave">SAVE SELECTED</button><button type="button" class="btn secondary" id="dq-bcancel">CANCEL</button></div></div>';
    const body = $('dq-body');
    const upd = () => { $('dq-bulk-count').textContent = int(b.sel.size) + ' selected of ' + int(b.total); $('dq-all').checked = b.rows.length > 0 && b.rows.every((r) => b.sel.has(r.issue_id)); };
    body.querySelectorAll('[data-sel]').forEach((x) => x.addEventListener('change', () => { const id = Number(x.dataset.sel); if (x.checked) b.sel.add(id); else b.sel.delete(id); upd(); }));
    $('dq-all').addEventListener('change', (e) => { b.rows.forEach((r) => { if (e.target.checked) b.sel.add(r.issue_id); else b.sel.delete(r.issue_id); }); body.querySelectorAll('[data-sel]').forEach((x) => { x.checked = e.target.checked; }); upd(); });
    upd();
    if (inst.bind) inst.bind(body, { selected: () => b.rows.filter((r) => b.sel.has(r.issue_id)), tick: (ids) => { ids.forEach((id) => { b.sel.add(id); const x = body.querySelector('[data-sel="' + id + '"]'); if (x) x.checked = true; }); upd(); } });
    const more = $('dq-more');
    if (more) more.addEventListener('click', async () => {
      more.disabled = true;
      const res = await dq.list({ type: S.type, scope: S.scope, search: S.search || null, limit: PAGE, offset: b.offset });
      if (!res.ok) { say(res.message, 'error'); more.disabled = false; return; }
      b.rows = b.rows.concat(res.rows || []); b.offset += (res.rows || []).length; showBulk();
    });
    $('dq-bcancel').addEventListener('click', () => { location.href = 'dashboard.html'; });
    $('dq-bsave').addEventListener('click', async () => {
      const err = $('dq-bulk-err'); err.textContent = '';
      body.querySelectorAll('[data-rowerr]').forEach((x) => { x.textContent = ''; });
      const picked = b.rows.filter((r) => b.sel.has(r.issue_id));
      if (!picked.length) { err.textContent = 'Select at least one item.'; return; }
      const got = inst.collect(picked, body);
      if (!got.ok) { err.textContent = got.error; if (got.rowErrors) Object.entries(got.rowErrors).forEach(([id, m]) => { const tr = body.querySelector('tr[data-id="' + id + '"] [data-rowerr]'); if (tr) tr.textContent = m; }); return; }
      const yes = await confirmBox({ title: 'Save ' + int(picked.length) + ' ' + (picked.length === 1 ? 'item' : 'items') + '?', body: got.confirm || '<p>This changes ' + int(picked.length) + ' records.</p>', ok: 'Yes, save them', cancel: 'Go back' });
      if (!yes) return;
      const btn = $('dq-bsave'); btn.disabled = true; btn.textContent = 'Saving…';
      const res = await inst.save(got.payload, true);
      btn.disabled = false; btn.textContent = 'SAVE SELECTED';
      if (!res.ok) {
        err.textContent = res.message || GENERIC_ERROR + (res.contact_admin ? ' Contact Admin if the problem continues.' : '');
        (res.errors || []).forEach((e2) => { const id = (picked.find((p) => (p.sku || p.purchase_id) == (e2.sku || e2.id)) || {}).issue_id; const cell = id && body.querySelector('tr[data-id="' + id + '"] [data-rowerr]'); if (cell) cell.textContent = e2.message; });
        return;
      }
      const okMsg = res.message || 'Saved.';
      await boot(); say(okMsg, 'ok');        // boot() clears any old message first, so the success note is written after it
    });
  }

  // ---------------------------------------------------------------- finished
  function done(nothingAtAll) {
    $('dq-body').innerHTML = '<div class="card dq-done"><h2>' + (nothingAtAll ? 'Everything looks good.' : 'All items have been fixed.') + '</h2><p class="muted">' +
      (nothingAtAll ? 'No data issues need attention right now.' : 'All caught up. These data issues have been resolved.') + '</p>' +
      '<p style="margin-top:14px;"><a class="dq-linkbtn" href="dashboard.html">Back to Dashboard</a></p></div>';
    root.querySelector('#dq-pills').innerHTML = (S.sum.cards || []).length > 1 ? (S.sum.cards || []).map((c) => '<button type="button" class="dq-chip" data-pill="' + esc(c.type) + '" aria-pressed="false">' + esc(TYPES[c.type].pill) + ' · ' + int(c.open) + '</button>').join('') : '';
    root.querySelectorAll('[data-pill]').forEach((b) => b.addEventListener('click', () => { S.type = b.dataset.pill; S.view = 'one'; boot(); }));
  }

  await boot();
}
