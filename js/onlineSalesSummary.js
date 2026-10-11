// Online Orders -- "Sales by stage" summary card (Ren, 2026-10-11: "check from online order both how much total sales from waiting for confirmation,
// awaiting stock, process yesterday ... create a summary for this also in the ERP").
// Used by BOTH Online Orders pages (online-orders.html and online-orders-kmco.html); it always covers both Pancake shops together and side by side.
// The numbers come from the database function online_stage_summary() (migration 215), which only answers people holding the Sales & Profit Dashboard's
// sales keys -- this file only draws them (the page also hides the card from everyone else).
//   * Orders PLACED in the chosen Manila dates (default: yesterday), grouped by the stage each order is in NOW in Pancake.
//   * Sales = items after discounts, shipping not included (the dashboard's own net-sales rule). Cancelled / returned orders are listed, not "sales".
//   * Which Pancake statuses make up each stage is a table in the database (online_order_stage_map), shown under the card.

const KNOWN_SHOPS = [{ id: 100015407, name: 'Miss Kittymae Jewels' }, { id: 1328205188, name: 'Kittymae.co' }];
const HIDE_KEY = 'ol-sales-summary-hidden';

const esc = (s) => (s === null || s === undefined ? '' : String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n) => Number(n || 0).toLocaleString('en-PH');

/** The Manila calendar date ('YYYY-MM-DD'), `offsetDays` from today. Manila is UTC+8 all year. */
export function manilaDate(offsetDays = 0, now = new Date()) {
  const d = new Date(now.getTime() + 8 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** { from, to } for a quick choice, or null for "custom". */
export function presetRange(key, now = new Date()) {
  const today = manilaDate(0, now);
  if (key === 'today') return { from: today, to: today };
  if (key === 'yesterday') { const y = manilaDate(-1, now); return { from: y, to: y }; }
  if (key === 'last7') return { from: manilaDate(-6, now), to: today };
  if (key === 'month') return { from: today.slice(0, 8) + '01', to: today };
  return null;
}

const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['month', 'This month']];

function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
const rangeLabel = (from, to) => (from === to ? dateLabel(from) : dateLabel(from) + ' – ' + dateLabel(to));

/** Turns the database answer into what the screen draws: per stage -> per shop -> {orders, pieces, sales, shipping}, with totals. */
export function buildView(data) {
  const stages = (data.stages || []).slice().sort((a, b) => a.sort - b.sort);
  const shops = KNOWN_SHOPS.map((s) => ({ ...s }));
  (data.rows || []).forEach((r) => {
    if (!shops.some((s) => Number(s.id) === Number(r.shop_id))) shops.push({ id: Number(r.shop_id), name: r.shop || 'Shop ' + r.shop_id });
  });
  const cell = () => ({ orders: 0, pieces: 0, sales: 0, shipping: 0 });
  const add = (a, r) => { a.orders += Number(r.orders || 0); a.pieces += Number(r.pieces || 0); a.sales += Number(r.sales || 0); a.shipping += Number(r.shipping || 0); };
  const byStage = {};
  stages.forEach((s) => { byStage[s.key] = { total: cell(), shops: Object.fromEntries(shops.map((sh) => [sh.id, cell()])) }; });
  const all = { total: cell(), shops: Object.fromEntries(shops.map((sh) => [sh.id, cell()])) };
  const focus = { total: cell(), shops: Object.fromEntries(shops.map((sh) => [sh.id, cell()])) };
  (data.rows || []).forEach((r) => {
    const st = byStage[r.stage] || byStage.other;
    if (!st) return;
    const sid = Number(r.shop_id);
    add(st.total, r); add(st.shops[sid], r);
    add(all.total, r); add(all.shops[sid], r);
    const def = stages.find((s) => s.key === (byStage[r.stage] ? r.stage : 'other'));
    if (def && def.focus) { add(focus.total, r); add(focus.shops[sid], r); }
  });
  return { stages, shops, byStage, all, focus };
}

const shortShop = (name) => String(name || '').replace(/^Miss\s+/i, '').replace(/\s+Jewels$/i, ' Jewels');

function tilesHtml(view) {
  const shopLine = (c) => view.shops.map((sh) => esc(shortShop(sh.name)) + ' ' + peso(c.shops[sh.id].sales)).join(' · ');
  const tile = (label, c, sub) =>
    '<div class="tile" style="min-width:220px;flex:1 1 220px;"><div class="lbl" style="font-weight:600;">' + esc(label) + '</div>' +
    '<div class="num">' + peso(c.total.sales) + '</div>' +
    '<div class="lbl">' + whole(c.total.orders) + ' order' + (c.total.orders === 1 ? '' : 's') + ' · ' + whole(c.total.pieces) + ' piece' + (c.total.pieces === 1 ? '' : 's') + '</div>' +
    '<div class="lbl" style="margin-top:4px;">' + (sub || shopLine(c)) + '</div></div>';
  const focusTiles = view.stages.filter((s) => s.focus).map((s) => tile(s.label, view.byStage[s.key]));
  return focusTiles.join('') + tile('These ' + focusTiles.length + ' together', view.focus);
}

function tableHtml(view) {
  const rows = view.stages.filter((s) => s.focus || view.byStage[s.key].total.orders > 0);
  const head = '<tr><th>Stage</th><th>Orders</th><th>Pieces</th><th>Sales</th>' + view.shops.map((sh) => '<th>' + esc(shortShop(sh.name)) + '</th>').join('') + '</tr>';
  const line = (label, sub, c, strong, bg) =>
    '<tr' + (bg ? ' style="background:' + bg + ';"' : '') + '>' +
      '<td data-label="Stage" class="full-row"><span style="' + (strong ? 'font-weight:700;' : '') + '">' + esc(label) + '</span>' + (sub ? '<div class="muted" style="font-size:11px;">' + esc(sub) + '</div>' : '') + '</td>' +
      '<td data-label="Orders">' + whole(c.total.orders) + '</td><td data-label="Pieces">' + whole(c.total.pieces) + '</td>' +
      '<td data-label="Sales" style="' + (strong ? 'font-weight:700;' : '') + '">' + peso(c.total.sales) + '</td>' +
      view.shops.map((sh) => '<td data-label="' + esc(shortShop(sh.name)) + '">' + (c.shops[sh.id].orders ? peso(c.shops[sh.id].sales) + ' <span class="muted" style="font-size:11px;">(' + whole(c.shops[sh.id].orders) + ')</span>' : '—') + '</td>').join('') +
    '</tr>';
  const body = rows.map((s) => line(s.label, (s.statuses && s.statuses.length) ? 'Pancake: ' + s.statuses.join(', ') : '', view.byStage[s.key], s.focus, s.focus ? '#fffbea' : '')).join('') +
    line('All orders placed in these dates', '', view.all, true, '#f4f4f4');
  return '<div class="table-scroll table-2col"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
}

/** Draws the card into `host`. `load(from, to)` returns the database answer. */
export function mountOnlineSalesSummary(host, { load, now = () => new Date() } = {}) {
  if (!host || typeof load !== 'function') return null;
  let preset = 'yesterday';
  let range = presetRange('yesterday', now());
  let seq = 0;
  let timer = null;
  let hidden = false;
  try { hidden = localStorage.getItem(HIDE_KEY) === '1'; } catch (e) { hidden = false; }

  host.innerHTML =
    '<div class="card" id="oss-card" style="margin-bottom:14px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">' +
        '<div style="flex:1 1 320px;"><h3 style="margin:0;">Sales by stage <span class="muted" style="font-size:12px;font-weight:normal;">· both Pancake shops</span></h3>' +
          '<div class="muted" id="oss-sub" style="font-size:12px;margin-top:2px;"></div></div>' +
        '<button type="button" class="btn small secondary" id="oss-toggle"></button>' +
      '</div>' +
      '<div id="oss-panel">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-top:10px;">' +
          PRESETS.map(([k, label]) => '<button type="button" class="btn small secondary" data-oss-preset="' + k + '" aria-pressed="false">' + label + '</button>').join('') +
          '<div class="field" style="min-width:130px;"><label>From</label><input type="date" id="oss-from"></div>' +
          '<div class="field" style="min-width:130px;"><label>To</label><input type="date" id="oss-to"></div>' +
          '<button type="button" class="btn small secondary" id="oss-refresh">Refresh</button>' +
        '</div>' +
        '<div id="oss-msg" style="margin-top:10px;"></div>' +
        '<div class="tiles" id="oss-tiles" style="margin:12px 0 10px;"></div>' +
        '<div id="oss-table"></div>' +
        '<div class="muted" id="oss-foot" style="font-size:11px;margin-top:8px;"></div>' +
      '</div>' +
    '</div>';

  const $ = (id) => host.querySelector('#' + id);
  const fromEl = $('oss-from'), toEl = $('oss-to');
  const today = () => manilaDate(0, now());

  function syncControls() {
    fromEl.value = range.from; toEl.value = range.to; fromEl.max = today(); toEl.max = today();
    host.querySelectorAll('[data-oss-preset]').forEach((b) => {
      const on = b.dataset.ossPreset === preset;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.className = 'btn small ' + (on ? '' : 'secondary');
    });
    $('oss-sub').textContent = 'Orders placed ' + rangeLabel(range.from, range.to) + ', grouped by where each one is now in Pancake. Sales = items after discounts (shipping not included).';
  }
  function applyHidden() {
    $('oss-panel').style.display = hidden ? 'none' : '';
    $('oss-toggle').textContent = hidden ? 'Show' : 'Hide';
    $('oss-toggle').setAttribute('aria-expanded', hidden ? 'false' : 'true');
  }
  const say = (html) => { $('oss-msg').innerHTML = html; };

  async function refresh() {
    const my = ++seq;
    syncControls();
    say('<span class="muted">Loading…</span>');
    try {
      const data = await load(range.from, range.to);
      if (my !== seq) return;
      if (!data || data.ok === false) {
        $('oss-tiles').innerHTML = ''; $('oss-table').innerHTML = ''; $('oss-foot').textContent = '';
        say('<div class="msg error">' + esc(((data && data.errors) || ['The summary could not be loaded.']).join(' ')) + '</div>');
        return;
      }
      const view = buildView(data);
      say('');
      $('oss-tiles').innerHTML = tilesHtml(view);
      $('oss-table').innerHTML = tableHtml(view);
      const ship = view.all.total.shipping;
      let upd = '';
      if (data.as_of) {
        const t = new Date(data.as_of);
        if (!Number.isNaN(t.getTime())) upd = ' Figures refreshed ' + t.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) + ' (they refresh about every 15 minutes).';
      }
      const proc = (view.stages.find((s) => s.key === 'process') || {}).statuses || [];
      $('oss-foot').textContent = 'Process = Pancake status ' + (proc.length ? proc.join(', ') : '—') + '. Cancelled and returned orders are listed but are not sales.' +
        (ship > 0 ? ' Shipping fees on these orders (' + peso(ship) + ') are not included in Sales.' : '') + upd;
    } catch (err) {
      if (my !== seq) return;
      const m = String((err && err.message) || err);
      $('oss-tiles').innerHTML = ''; $('oss-table').innerHTML = ''; $('oss-foot').textContent = '';
      say('<div class="msg error">' + esc(/failed to fetch|networkerror|load failed/i.test(m) ? 'Could not reach the server. Check the internet connection and press Refresh.' : 'The summary could not be loaded (' + m + ').') + '</div>');
    }
  }

  host.querySelectorAll('[data-oss-preset]').forEach((b) => b.addEventListener('click', () => {
    preset = b.dataset.ossPreset; range = presetRange(preset, now()); refresh();
  }));
  const onDate = () => {
    if (!fromEl.value || !toEl.value) return;
    preset = 'custom'; range = { from: fromEl.value, to: toEl.value };
    clearTimeout(timer); timer = setTimeout(refresh, 250);
  };
  fromEl.addEventListener('change', onDate); toEl.addEventListener('change', onDate);
  $('oss-refresh').addEventListener('click', refresh);
  $('oss-toggle').addEventListener('click', () => {
    hidden = !hidden;
    try { localStorage.setItem(HIDE_KEY, hidden ? '1' : '0'); } catch (e) { /* remembering the choice is a convenience only */ }
    applyHidden();
    if (!hidden) refresh();
  });

  applyHidden();
  syncControls();
  if (!hidden) refresh();
  return { refresh };
}
