// Item Monitoring > Physical Counts -- unchanged in what it does: a count records what was found and how it compares with the system, and NEVER changes stock (a real variance is investigated first
// and then corrected with an Adjustment in Record Movement). What is new is the help while counting: pick a SKU and branch and the system quantity, the reserved pieces, the last count and the
// next due date are shown before a number is typed; and the lists can be filtered (branch, variance only, investigated or not, counts that are due).
import { esc, num, weight, fmtDate, plural } from './imFormat.js?v=20261030b';
import { branchBadge, branchOptionStyle } from './branchColors.js?v=20261030b';
import { emptyBox } from './imUi.js?v=20261030b';

export function renderCounts(ctx, panel, opts) {
  const { api } = ctx; const st = ctx.ui.counts; const me = ctx.employee;
  if (opts) { if (opts.sku !== undefined) st.sku = opts.sku; if (opts.branch !== undefined) st.formBranch = opts.branch; if (opts.view) st.view = opts.view; }
  const locked = ctx.who.isScoped;
  const branchField = locked
    ? '<div class="field"><label>Branch</label>' + (ctx.branchById[me.branch_id] ? branchBadge(esc, ctx.branchById[me.branch_id], me.branch_id, ctx.branches) : '<input type="text" value="None assigned" disabled>') + '<input type="hidden" id="im-c-branch" value="' + esc(me.branch_id || '') + '"></div>'
    : '<div class="field"><label>Branch *</label><select id="im-c-branch" required>' + ctx.branches.map((b) => '<option value="' + b.id + '" style="' + branchOptionStyle(b.id, ctx.branches) + '"' + (String(st.formBranch) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>';

  panel.innerHTML = '<div class="card"><h3>Log a Physical Count</h3><p class="muted" style="margin-top:-4px;">Counting a SKU only records what you found and how it compares to the system — it never changes stock by itself. If the variance is real, investigate first, then log the correction as an Adjustment in Record Movement (Kittymae POS).</p>' +
    '<form id="im-c-form" class="im-cform"><div class="field" style="position:relative;min-width:200px;"><label>SKU *</label><input type="text" id="im-c-sku" required autocomplete="off" placeholder="Type a SKU or item name…" value="' + esc(st.sku || '') + '"><div class="muted" id="im-c-name" style="font-size:11px;"></div><div class="im-suggest" id="im-c-sug" hidden></div></div>' +
    branchField + '<div class="field"><label>Counted qty *</label><input type="number" id="im-c-qty" min="0" step="1" required inputmode="numeric"></div>' +
    '<div class="field"><label>Actual weight (g)</label><input type="number" id="im-c-weight" step="0.001" min="0" placeholder="optional" inputmode="decimal"></div><div class="field im-grow"><label>Notes</label><input type="text" id="im-c-notes"></div>' +
    '<button class="btn" type="submit">Log count</button></form><div id="im-c-info"></div></div>' +
    '<div class="lv-tabs im-subtabs"><button type="button" class="lv-tab' + (st.view === 'recent' ? ' lv-tab-active' : '') + '" data-view="recent">Recent counts</button><button type="button" class="lv-tab' + (st.view === 'due' ? ' lv-tab-active' : '') + '" data-view="due">Counts due</button></div>' +
    '<div class="card im-filters"><div class="im-filter-row"><div class="field"><label>Branch</label><select id="im-c-fbranch"><option value="">All branches</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (st.branch === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' +
    (st.view === 'recent' ? '<label class="im-check"><input type="checkbox" id="im-c-var"' + (st.varianceOnly ? ' checked' : '') + '> Variance only</label><div class="field"><label>Investigation</label><select id="im-c-inv"><option value="">Any</option><option value="no"' + (st.inv === 'no' ? ' selected' : '') + '>Not investigated</option><option value="yes"' + (st.inv === 'yes' ? ' selected' : '') + '>Investigated</option></select></div>'
      : '<div class="field im-grow"><label>Search</label><input type="search" id="im-c-fsearch" placeholder="SKU or product name…" value="' + esc(st.dueSearch) + '"></div>') +
    '<button type="button" class="btn small secondary" id="im-c-clear">Clear</button></div></div><div id="im-c-list"></div>';
  const $ = (id) => panel.querySelector('#' + id);

  // ---- SKU autocomplete (same as the old form)
  const skuIn = $('im-c-sku'), sug = $('im-c-sug'); let timer = null, tok = 0;
  const hide = () => { sug.hidden = true; sug.innerHTML = ''; };
  function info() {
    const sku = skuIn.value.trim(), br = $('im-c-branch').value;
    const row = sku && br ? ctx.data.stock.find((r) => r.sku === sku && String(r.branch_id) === String(br)) : null;
    const box = $('im-c-info');
    if (!sku || !br) { box.innerHTML = ''; return; }
    if (!row) { box.innerHTML = '<div class="im-sysinfo muted">No stock row for ' + esc(sku) + ' at ' + esc(ctx.branchById[br] || '') + ' yet — the system quantity is 0.</div>'; return; }
    $('im-c-name').textContent = row._name;
    box.innerHTML = '<div class="im-sysinfo"><div><span>System qty (available)</span><b>' + num(row.qty_available) + '</b></div><div><span>Reserved (held for layaway)</span><b>' + num(row.qty_reserved) + '</b></div><div><span>Physically held</span><b>' + num(row._total) + '</b></div>' +
      '<div><span>Last count</span><b>' + (row._last ? fmtDate(row._last) : 'Never') + '</b></div><div><span>Next count due</span><b>' + fmtDate(new Date(row._due).toISOString()) + (row._overdue ? ' <span class="badge low">DUE</span>' : '') + '</b></div></div>' +
      '<div class="muted" style="font-size:11px;">Your count is compared with the available quantity; pieces held for layaway are listed separately.</div>';
  }
  skuIn.addEventListener('input', () => {
    clearTimeout(timer); $('im-c-name').textContent = ''; st.sku = skuIn.value; info();
    const q = skuIn.value.trim(); if (!q) { hide(); return; }
    timer = setTimeout(async () => { const my = ++tok; try { const rs = await api.searchProducts(q); if (my !== tok) return; if (!rs.length) { hide(); return; }
      sug.innerHTML = rs.slice(0, 12).map((p, i) => '<div class="im-sug" data-i="' + i + '"><b>' + esc(p.sku) + '</b> — ' + esc(p.item_name) + '</div>').join(''); sug.hidden = false;
      sug.querySelectorAll('.im-sug').forEach((row) => row.addEventListener('mousedown', (ev) => { ev.preventDefault(); const p = rs[Number(row.dataset.i)]; skuIn.value = p.sku; st.sku = p.sku; $('im-c-name').textContent = p.item_name + (p.category ? ' · ' + p.category : ''); hide(); info(); }));
    } catch (e) { hide(); } }, 200);
  });
  skuIn.addEventListener('blur', () => setTimeout(hide, 150));
  $('im-c-branch').addEventListener('change', () => { st.formBranch = $('im-c-branch').value; info(); });
  info();

  $('im-c-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const branchId = Number($('im-c-branch').value);
    const btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const id = await api.logCycleCount({ sku: skuIn.value.trim(), branchId, countedQty: Number($('im-c-qty').value), actualWeightG: $('im-c-weight').value ? Number($('im-c-weight').value) : null, notes: $('im-c-notes').value.trim() });
      st.sku = ''; await ctx.reload('counts');
      const logged = ctx.data.counts.find((c) => c.id === id);
      ctx.toast(logged && logged.variance !== 0 ? 'Count logged — variance ' + (logged.variance > 0 ? '+' : '') + logged.variance + ' vs. system.' : 'Count logged — matches the system exactly.', false);
      renderCounts(ctx, panel, {});
    } catch (err) { ctx.toast(err, true); btn.disabled = false; }
  });

  // ---- the lists
  function paintList() {
    const box = $('im-c-list');
    if (st.view === 'due') {
      const q = st.dueSearch.trim().toLowerCase();
      let rows = ctx.data.stock.filter((r) => r._overdue && (!st.branch || String(r.branch_id) === st.branch) && (!q || r._text.includes(q)));
      rows = rows.slice().sort((a, b) => (a._last ? new Date(a._last).getTime() : 0) - (b._last ? new Date(b._last).getTime() : 0));
      if (!rows.length) { box.innerHTML = emptyBox('Nothing is due for a count here.'); return; }
      const shown = rows.slice(0, st.dueShown);
      box.innerHTML = '<div class="muted im-count">' + plural(rows.length, 'SKU × branch', 'SKU × branches') + ' due — the longest without a count first. (A SKU never counted is due straight away; the cadence comes from the product’s value tier: A weekly, B monthly, C quarterly, otherwise monthly.)</div>' +
        '<div class="table-scroll table-2col"><table><thead><tr><th>SKU</th><th>Product</th><th>Branch</th><th>Available</th><th>Last count</th><th></th></tr></thead><tbody>' + shown.map((r) =>
          '<tr><td data-label="SKU"><b>' + esc(r.sku) + '</b></td><td data-label="Product">' + esc(r._name) + '</td><td data-label="Branch">' + esc(r._branch) + '</td><td data-label="Available">' + num(r.qty_available) + '</td><td data-label="Last count">' + (r._last ? fmtDate(r._last) : '<span class="muted">Never counted</span>') + '</td>' +
          '<td data-label="" class="full-row">' + (!ctx.who.isScoped || String(r.branch_id) === String(me.branch_id) ? '<button type="button" class="btn small" data-count-now data-sku="' + esc(r.sku) + '" data-branch="' + r.branch_id + '">Count now</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' +
        (shown.length < rows.length ? '<div class="im-showmore"><button type="button" class="btn small secondary" id="im-c-more">Show more</button></div>' : '');
      box.querySelectorAll('[data-count-now]').forEach((b) => b.addEventListener('click', () => { st.sku = b.dataset.sku; st.formBranch = b.dataset.branch; renderCounts(ctx, panel, {}); window.scrollTo?.(0, 0); panel.querySelector('#im-c-qty').focus(); }));
      const more = $('im-c-more'); if (more) more.addEventListener('click', () => { st.dueShown += 100; paintList(); });
      return;
    }
    let rows = ctx.data.counts.filter((c) => (!st.branch || String(c.branch_id) === st.branch) && (!st.varianceOnly || c.variance !== 0) && (!st.inv || (st.inv === 'yes' ? c.investigated : !c.investigated)));
    if (!ctx.data.counts.length) { box.innerHTML = emptyBox('No physical counts logged yet.'); return; }
    if (!rows.length) { box.innerHTML = emptyBox('No counts match this filter.'); return; }
    box.innerHTML = '<div class="table-scroll table-2col"><table><thead><tr><th>Date</th><th>SKU</th><th>Branch</th><th>Counted</th><th>System</th><th>Variance</th><th>Weight variance</th><th>Counted by</th><th>Notes</th><th></th></tr></thead><tbody>' + rows.map((c) => {
      const vs = c.variance === 0 ? '' : 'font-weight:600;' + (c.variance > 0 ? 'color:#2e7d4f;' : 'color:#b23c3c;');
      return '<tr><td data-label="Date">' + fmtDate(c.counted_at) + '</td><td data-label="SKU">' + esc(c.sku) + '</td><td data-label="Branch">' + (c.branches ? esc(c.branches.name) : '') + '</td><td data-label="Counted">' + num(c.counted_qty) + '</td><td data-label="System">' + num(c.system_qty_at_count) + '</td>' +
        '<td data-label="Variance" style="' + vs + '">' + (c.variance > 0 ? '+' : '') + c.variance + '</td><td data-label="Weight variance">' + (c.weight_variance_g != null ? weight(c.weight_variance_g) : '—') + '</td><td data-label="Counted by">' + (c.counter ? esc(c.counter.full_name) : '—') + '</td>' +
        '<td data-label="Notes" class="full-row">' + esc(c.notes || '—') + '</td><td data-label="" class="full-row">' + (c.variance !== 0 ? '<button class="btn small secondary" data-inv="' + c.id + '" data-val="' + (!c.investigated) + '">' + (c.investigated ? 'Investigated ✓ (undo)' : 'Mark investigated') + '</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    box.querySelectorAll('[data-inv]').forEach((b) => b.addEventListener('click', async () => {
      try { await api.markInvestigated(Number(b.dataset.inv), b.dataset.val === 'true'); ctx.toast('Updated.', false); await ctx.reload('counts'); paintList(); } catch (err) { ctx.toast(err, true); }
    }));
  }
  panel.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { st.view = b.dataset.view; renderCounts(ctx, panel, {}); }));
  $('im-c-fbranch').addEventListener('change', (e) => { st.branch = e.target.value; paintList(); });
  const v = $('im-c-var'); if (v) v.addEventListener('change', (e) => { st.varianceOnly = e.target.checked; paintList(); });
  const iv = $('im-c-inv'); if (iv) iv.addEventListener('change', (e) => { st.inv = e.target.value; paintList(); });
  const fs = $('im-c-fsearch'); if (fs) fs.addEventListener('input', (e) => { st.dueSearch = e.target.value; st.dueShown = 100; paintList(); });
  $('im-c-clear').addEventListener('click', () => { Object.assign(st, { branch: '', varianceOnly: false, inv: '', dueSearch: '', dueShown: 100 }); renderCounts(ctx, panel, {}); });
  paintList();
}
