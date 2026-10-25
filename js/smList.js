// Scrap Monitoring page -- the one list component behind All Scrap, Available Scrap, Scrap Sales and the Audit Log. A tab only says WHICH filters it has, how to ask the database and how a row
// looks; the filter bar, the active-filter chips, the sort, the paging, the "latest answer wins" guard and the phone layout (one card per row) are the same everywhere.
import { esc, friendly, manilaToday, daysAgo, monthStart, debounce } from './smFormat.js?v=20261025b';
import { emptyBox } from './smUi.js?v=20261025b';

/** cfg = { key, hint, fields:[{id,label,type:'search'|'text'|'select'|'date'|'number'|'check', options, ph, grow, more, show(ctx)}], sorts:[[v,l]], sort, pageSize, presets,
 *          fixed:{...always sent}, fetch(filters, sort, limit, offset), summaryHtml(res, s), tableHtml(rows, ctx, s, res), wireRows(body, rows, ctx, s, reload), emptyText(hasFilters), chipText(id, v, ctx), onLoaded(res, s) } */
export const blankFilters = (cfg) => Object.fromEntries(cfg.fields.map((f) => [f.id, f.type === 'check' ? false : '']));
export const newListState = (cfg) => ({ filters: blankFilters(cfg), sort: cfg.sort || (cfg.sorts && cfg.sorts[0] && cfg.sorts[0][0]) || '', page: 1, pageSize: cfg.pageSize || 50, rows: [], total: 0, more: false, seq: 0, picked: new Map() });
const cleanFilters = (f, fixed) => {
  const out = Object.assign({}, fixed || {});
  for (const [k, v] of Object.entries(f)) if (v !== '' && v !== false && v !== null && v !== undefined) out[k] = v;
  return out;
};
const optionsOf = (f, ctx) => (typeof f.options === 'function' ? f.options(ctx) : (f.options || []));

function fieldHtml(f, s, ctx) {
  const id = 'smf-' + f.id, v = s.filters[f.id];
  const cls = 'field' + (f.grow ? ' sm-grow' : '');
  if (f.type === 'select') {
    return '<div class="' + cls + '"><label for="' + id + '">' + esc(f.label) + '</label><select id="' + id + '"><option value="">' + esc(f.allLabel || 'All') + '</option>' +
      optionsOf(f, ctx).map(([val, label]) => '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select></div>';
  }
  if (f.type === 'check') return '<div class="field"><label>&nbsp;</label><label class="sm-check"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> ' + esc(f.label) + '</label></div>';
  const type = f.type === 'search' ? 'search' : f.type || 'text';
  return '<div class="' + cls + '"><label for="' + id + '">' + esc(f.label) + '</label><input id="' + id + '" type="' + type + '" value="' + esc(v) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') +
    (f.type === 'number' ? ' min="0" step="any" inputmode="decimal"' : '') + '></div>';
}

function chipsHtml(cfg, s, ctx) {
  const on = cfg.fields.filter((f) => s.filters[f.id] !== '' && s.filters[f.id] !== false);
  if (!on.length) return '';
  const nice = (f, v) => {
    if (cfg.chipText) { const t = cfg.chipText(f.id, v, ctx); if (t !== undefined) return t; }
    if (f.type === 'select') { const o = optionsOf(f, ctx).find(([val]) => String(val) === String(v)); return o ? o[1] : v; }
    if (f.type === 'check') return 'yes';
    return v;
  };
  return '<div class="active-filters" role="status"><span class="active-filters-label">Active filters:</span>' +
    on.map((f) => '<span class="filter-chip">' + esc(f.label) + ': <b>' + esc(nice(f, s.filters[f.id])) + '</b></span>').join('') + ' <button type="button" class="act-link" data-clear-filters>Clear all</button></div>';
}

function toolbarHtml(cfg, s, ctx) {
  const vis = cfg.fields.filter((f) => !f.show || f.show(ctx));
  const main = vis.filter((f) => !f.more), more = vis.filter((f) => f.more);
  const hasDates = vis.some((f) => f.id === 'date_from');
  return '<div class="card sm-toolbar"><div class="sm-toolrow">' + main.map((f) => fieldHtml(f, s, ctx)).join('') +
    (cfg.presets && hasDates ? '<div class="field"><label>&nbsp;</label><div class="sm-btnrow"><button type="button" class="btn small secondary" data-range="today">Today</button><button type="button" class="btn small secondary" data-range="7">7 days</button>' +
      '<button type="button" class="btn small secondary" data-range="30">30 days</button><button type="button" class="btn small secondary" data-range="month">This month</button></div></div>' : '') +
    (cfg.sorts && cfg.sorts.length ? '<div class="field"><label for="smf-sort">Sort by</label><select id="smf-sort">' + cfg.sorts.map(([v, l]) => '<option value="' + esc(v) + '"' + (s.sort === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>' : '') +
    '<div class="field"><label>&nbsp;</label><div class="sm-btnrow">' + (more.length ? '<button type="button" class="btn small secondary" id="smf-more-btn" aria-expanded="' + s.more + '">' + (s.more ? 'Fewer filters' : 'More filters') + '</button>' : '') +
    '<button type="button" class="btn small secondary" id="smf-reload">↻ Refresh</button></div></div></div>' +
    (more.length && s.more ? '<div class="sm-toolrow sm-morerow">' + more.map((f) => fieldHtml(f, s, ctx)).join('') + '</div>' : '') + '</div>';
}

export async function renderList(ctx, panel, cfg) {
  const s = ctx.ui.lists[cfg.key] || (ctx.ui.lists[cfg.key] = newListState(cfg));
  panel.innerHTML = (cfg.hint ? '<p class="sm-tabhint muted">' + esc(cfg.hint) + '</p>' : '') + (cfg.topHtml ? '<div id="sm-listtop"></div>' : '') + '<div id="sm-filterhost"></div><div id="sm-chips"></div><div id="sm-listbody"><p class="muted">Loading…</p></div>';
  const host = panel.querySelector('#sm-filterhost'), chipsEl = panel.querySelector('#sm-chips');

  async function load(resetPage) {
    if (resetPage) s.page = 1;
    const seq = ++s.seq;
    const body = panel.querySelector('#sm-listbody');
    if (!body) return;
    body.classList.add('sm-loading');
    let res;
    try { res = await cfg.fetch(cleanFilters(s.filters, cfg.fixed), s.sort, s.pageSize, (s.page - 1) * s.pageSize); }
    catch (err) { if (seq === s.seq) { body.classList.remove('sm-loading'); body.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; } return; }
    if (seq !== s.seq || !panel.contains(body)) return;
    body.classList.remove('sm-loading');
    if (!res || res.ok === false) { body.innerHTML = '<div class="msg error">' + esc((res && res.message) || 'The list could not be loaded.') + '</div>'; return; }
    s.rows = res.rows || []; s.total = Number(res.total || 0);
    const pages = Math.max(1, Math.ceil(s.total / s.pageSize));
    if (s.page > pages && s.total) { s.page = pages; return load(); }
    const from = s.total ? (s.page - 1) * s.pageSize + 1 : 0, to = Math.min(s.total, s.page * s.pageSize);
    const hasFilters = cfg.fields.some((f) => s.filters[f.id] !== '' && s.filters[f.id] !== false);
    body.innerHTML = (cfg.summaryHtml ? cfg.summaryHtml(res, s, ctx) : '') +
      '<div class="sm-summary muted">' + (s.total ? 'Showing <b>' + from + '–' + to + '</b> of <b>' + s.total.toLocaleString('en-PH') + '</b>' : 'Nothing to show') + '</div>' +
      (s.rows.length ? cfg.tableHtml(s.rows, ctx, s, res) : emptyBox(esc(cfg.emptyText ? cfg.emptyText(hasFilters) : (hasFilters ? 'Nothing matches these filters.' : 'Nothing here yet.')))) +
      (s.total > s.pageSize ? '<div class="sm-pager"><span class="muted">Page ' + s.page + ' of ' + pages + '</span><span class="sm-btnrow">' +
        '<button type="button" class="btn small secondary" data-page="prev"' + (s.page <= 1 ? ' disabled' : '') + '>← Previous</button><button type="button" class="btn small secondary" data-page="next"' + (s.page >= pages ? ' disabled' : '') + '>Next →</button></span></div>' : '');
    body.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { s.page += b.dataset.page === 'next' ? 1 : -1; load(); body.scrollIntoView({ block: 'start' }); }));
    if (cfg.wireRows) cfg.wireRows(body, s.rows, ctx, s, () => load(), res);
    if (cfg.onLoaded) cfg.onLoaded(res, s, panel);
  }

  function paintChips() {
    chipsEl.innerHTML = chipsHtml(cfg, s, ctx);
    const c = chipsEl.querySelector('[data-clear-filters]');
    if (c) c.addEventListener('click', () => { s.filters = blankFilters(cfg); paint(); load(true); });
  }
  function paint() { host.innerHTML = toolbarHtml(cfg, s, ctx); paintChips(); wire(); }
  function wire() {
    const f = s.filters, $ = (id) => panel.querySelector('#' + id);
    const apply = () => { paintChips(); load(true); };
    cfg.fields.forEach((fd) => {
      const el = $('smf-' + fd.id);
      if (!el) return;
      if (fd.type === 'select' || fd.type === 'date') el.addEventListener('change', () => { f[fd.id] = el.value; apply(); });
      else if (fd.type === 'check') el.addEventListener('change', () => { f[fd.id] = el.checked; apply(); });
      else el.addEventListener('input', debounce(() => { f[fd.id] = el.value.trim(); apply(); }, 450));
    });
    const sortEl = $('smf-sort'); if (sortEl) sortEl.addEventListener('change', () => { s.sort = sortEl.value; load(true); });
    $('smf-reload').addEventListener('click', () => { if (ctx.refreshCounts) ctx.refreshCounts(); load(); });
    const more = $('smf-more-btn'); if (more) more.addEventListener('click', () => { s.more = !s.more; paint(); });
    panel.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
      const t = manilaToday(), r = b.dataset.range;
      f.date_to = t; f.date_from = r === 'today' ? t : r === 'month' ? monthStart(t) : daysAgo(Number(r), t);
      paint(); load(true);
    }));
  }
  if (cfg.topHtml) { const top = panel.querySelector('#sm-listtop'); top.innerHTML = cfg.topHtml(ctx, s); if (cfg.wireTop) cfg.wireTop(top, ctx, s, () => load()); }
  paint();
  ctx.reloadList = () => load();
  await load();
}
