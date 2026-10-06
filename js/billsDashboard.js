// Bills Management -- the Dashboard tab: KPI cards, the alert sections (overdue / due today / next 7 days /
// high amount / upcoming recurring), the "Recommended to pay first" panel, charts and recent payments.
// Two groups of numbers on purpose: "this period" follows the Month / Year filter, "right now" never does
// (an overdue bill is overdue whatever month it belongs to).
import { esc, money, moneyShort, fmtDate, daysText, statusBadge, prioBadge, tagBadge, kpiCard, emptyBox, progressBar, donut, hbars, stackedHbars, stackedColumns, lineChart, COLORS, statusColor, plural } from './billsUi.js?v=20261006d';
import { periodKpis, liveKpis, buildAlerts, recommendedToPay, weekBuckets, monthlyTrend, groupTotals, statusCounts, recentPayments, matchesScope, daysBetween, PRIORITIES, STATUSES } from './billsLogic.js?v=20261006d';
import { filterBarHtml, bindFilterBar, scopedLive, scopedPeriod, periodLabel, scopeLabel } from './billsFilters.js?v=20261006d';

const btn = (act, id, label, cls) => '<button type="button" class="btn small' + (cls ? ' ' + cls : '') + '" data-act="' + act + '" data-id="' + id + '">' + label + '</button>';

/** One bill as a compact alert row with its quick actions. */
function alertRow(ctx, b) {
  const own = ctx.access.branch_only && b.branch_id && b.branch_id === ctx.access.branch_id;
  const menu = [];
  if (ctx.canWrite) menu.push(['edit', 'Edit'], ['upload', 'Upload Proof'], ['snooze', 'Snooze Reminder'], ['dup', 'Duplicate Next Month']);
  else if (own) menu.push(['upload', 'Upload Proof']);
  const snoozed = b.snoozed_until && b.snoozed_until >= ctx.today;
  return '<div class="bl-alert-row" data-bill="' + b.id + '"><div class="bl-alert-main">' +
    '<button type="button" class="bl-link" data-act="view" data-id="' + b.id + '">' + esc(b.name) + '</button>' +
    '<div class="muted">' + esc(b._cat) + ' · ' + esc(b._branch) + (b.due_date ? ' · due ' + esc(fmtDate(b.due_date)) : '') + '</div>' +
    '<div class="bl-alert-badges">' + statusBadge(b._eff) + ' ' + prioBadge(b._prio) + (b.is_recurring ? ' ' + tagBadge('Recurring', 'bl-tag-recurring') : '') + (snoozed ? ' ' + tagBadge('Snoozed', 'bl-tag-gray') : '') + '</div></div>' +
    '<div class="bl-alert-amt"><b>' + money(b._remaining || b._amount) + '</b><span class="muted">' + esc(daysText(b)) + '</span></div>' +
    '<div class="bl-alert-actions">' + btn('view', b.id, 'View', 'secondary') + (ctx.canWrite && b._open && b._remaining > 0 ? btn('pay', b.id, 'Mark as Paid') : '') +
    (menu.length ? '<details class="bl-menu"><summary class="btn small secondary" aria-label="More actions">⋯</summary><div class="bl-menu-pop">' + menu.map((m) => '<button type="button" data-act="' + m[0] + '" data-id="' + b.id + '">' + m[1] + '</button>').join('') + '</div></details>' : '') + '</div></div>';
}

function templateRow(ctx, item) {
  const t = item.tpl;
  return '<div class="bl-alert-row"><div class="bl-alert-main"><b>' + esc(t.name) + '</b><div class="muted">' + esc((ctx.catById[t.category_id] || {}).name || '') + ' · ' + esc(t.branch_id ? (ctx.branchById[t.branch_id] || {}).name || '' : 'No branch') + ' · next bill due ' + esc(fmtDate(t.next_due_date)) + '</div>' +
    '<div class="bl-alert-badges">' + tagBadge('Not created yet', 'bl-tag-gray') + ' ' + tagBadge('Recurring', 'bl-tag-recurring') + '</div></div>' +
    '<div class="bl-alert-amt"><b>' + money(t.default_amount) + '</b><span class="muted">' + (item.days === 0 ? 'Due today' : 'Due in ' + plural(item.days, 'day')) + '</span></div>' +
    '<div class="bl-alert-actions">' + (ctx.canWrite ? btn('gen-tpl', t.id, 'Generate') + btn('edit-tpl', t.id, 'Edit Template', 'secondary') : '') + '</div></div>';
}

function alertSection(ctx, { id, title, tone, items, render, amountOf, empty }) {
  const total = items.reduce((s, x) => s + (amountOf(x) || 0), 0);
  const head = '<div class="bl-alert-head bl-tone-' + tone + '"><h4>' + esc(title) + '</h4><span>' + (items.length ? items.length + ' · ' + money(total) : '0') + '</span></div>';
  if (!items.length) return '<div class="bl-alert" id="bl-al-' + id + '">' + head + '<p class="muted bl-alert-empty">' + esc(empty) + '</p></div>';
  const shown = items.slice(0, 5), rest = items.slice(5);
  return '<div class="bl-alert" id="bl-al-' + id + '">' + head + shown.map(render).join('') +
    (rest.length ? '<details class="bl-rest"><summary>Show ' + rest.length + ' more</summary>' + rest.map(render).join('') + '</details>' : '') + '</div>';
}

function recommendedHtml(ctx, live, c) {
  const list = recommendedToPay(live, ctx.ui.budget);
  const urgent = list.filter((x) => x.b._eff === 'Overdue' || x.b._eff === 'Due Today' || (x.b._days !== null && x.b._days <= 7));
  const needUrgent = urgent.reduce((s, x) => s + x.b._remaining, 0);
  const budgetOn = ctx.ui.budget !== '' && ctx.ui.budget !== null && ctx.ui.budget !== undefined;
  const covered = list.filter((x) => x.covered);
  const coveredSum = covered.reduce((s, x) => s + x.b._remaining, 0);
  const rows = list.slice(0, 8).map((x, i) => '<li class="bl-rec' + (budgetOn ? (x.covered ? ' bl-rec-yes' : ' bl-rec-no') : '') + '"><span class="bl-rec-n">' + (budgetOn ? (x.covered ? '✓' : '·') : i + 1) + '</span>' +
    '<div><button type="button" class="bl-link" data-act="view" data-id="' + x.b.id + '">' + esc(x.b.name) + '</button><div class="muted">' + esc(x.reason) + ' · ' + esc(x.b._branch) + '</div></div><b>' + money(x.b._remaining) + '</b></li>').join('');
  return '<div class="card bl-panel"><h3 class="bl-h">Recommended to pay first</h3>' +
    (list.length ? '<p class="muted bl-rec-sum">Clearing everything urgent (overdue and due within 7 days) takes <b>' + money(needUrgent) + '</b>.</p>' +
      '<div class="bl-budget"><label for="bl-budget">If you have</label><input type="number" id="bl-budget" min="0" step="100" inputmode="decimal" placeholder="₱ available" value="' + (budgetOn ? esc(ctx.ui.budget) : '') + '"><span class="muted">to spend today</span></div>' +
      (budgetOn ? '<p class="bl-rec-budget">That covers <b>' + covered.length + '</b> of ' + list.length + ' bills (' + money(coveredSum) + ')' + (list.length > covered.length ? ' — still short by <b>' + money(list.slice().reduce((s, x) => s + x.b._remaining, 0) - coveredSum) + '</b> for the rest.' : ' — everything is covered.') + '</p>' : '') +
      '<ol class="bl-reclist">' + rows + '</ol>' + (list.length > 8 ? '<p class="muted">+ ' + (list.length - 8) + ' more in the Bills tab.</p>' : '')
      : '<p class="muted">Nothing is waiting to be paid. 🎉</p>') + '</div>';
}

function recentHtml(ctx, live) {
  const rows = recentPayments(live, 8);
  return '<div class="card bl-panel"><h3 class="bl-h">Recent payment activity</h3>' + (rows.length ? '<ul class="bl-recent">' + rows.map((r) =>
    '<li><div><button type="button" class="bl-link" data-act="view" data-id="' + r.b.id + '">' + esc(r.b.name) + '</button><div class="muted">' + esc(r.p.payment_date ? fmtDate(r.p.payment_date) : 'Earlier record') + ' · ' + esc(r.p.method || '—') + (r.p.paid_by_name ? ' · ' + esc(r.p.paid_by_name) : '') + '</div></div><b class="lv-pos">' + money(r.p.amount) + '</b></li>').join('') + '</ul>' : '<p class="muted">No payments recorded yet.</p>') + '</div>';
}

function chartsHtml(ctx, live, period, c) {
  const counts = statusCounts(period);
  const statusItems = STATUSES.filter((s) => counts[s]).map((s) => ({ label: s, value: counts[s], color: statusColor(s) }));
  const byCat = groupTotals(period, (b) => b.category_id || 0, (b) => b._cat);
  const catItems = byCat.slice(0, 6).map((g) => ({ label: g.label, value: g.total, sub: '(' + g.count + ')' }));
  if (byCat.length > 6) { const rest = byCat.slice(6); catItems.push({ label: 'Everything else', value: rest.reduce((s, g) => s + g.total, 0), sub: '(' + rest.reduce((s, g) => s + g.count, 0) + ')' }); }
  const byBranch = groupTotals(period, (b) => b.branch_id || 0, (b) => b._branch).slice(0, 10);
  const trend = monthlyTrend(live, ctx.today, 6).map((m) => ({ label: m.label, a: m.billed, b: m.paid }));
  const wk = weekBuckets(live, ctx.today, 5);
  const wkData = wk.buckets.map((k) => ({ label: 'Wk ' + k.index, total: k.total, parts: k.byPriority }));
  const PR = PRIORITIES.map((p) => ({ key: p, label: p, color: COLORS[p] }));
  const pk = periodKpis(period);
  return '<div class="bl-charts">' +
    '<div class="card bl-panel"><h3 class="bl-h">Bills by status <span class="muted">· ' + esc(periodLabel(ctx)) + '</span></h3>' + donut(statusItems, { center: period.filter((b) => !b.archived_at).length, centerSub: 'bills' }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Payment completion <span class="muted">· ' + esc(periodLabel(ctx)) + '</span></h3>' +
      '<div class="bl-big">' + pk.paidPct + '%</div><div class="muted">of the amount billed is paid (' + money(pk.paid) + ' of ' + money(pk.total) + ')</div>' + progressBar(pk.paidPct) +
      '<div class="bl-split"><div><b>' + pk.paidCount + '</b><span class="muted"> of ' + pk.count + ' bills fully paid</span></div><div><b>' + money(pk.unpaid) + '</b><span class="muted"> still to pay</span></div></div></div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Bills by category <span class="muted">· amount</span></h3>' + hbars(catItems, { format: moneyShort }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Bills by branch <span class="muted">· ' + esc(periodLabel(ctx)) + '</span></h3>' +
      stackedHbars(byBranch.map((g) => ({ label: g.label, parts: { paid: g.paid, overdue: g.overdue, unpaid: Math.max(g.unpaid - g.overdue, 0) } })),
        [{ key: 'paid', label: 'Paid', color: COLORS.paid }, { key: 'unpaid', label: 'Unpaid', color: COLORS.unpaid }, { key: 'overdue', label: 'Overdue', color: COLORS.overdue }], { format: moneyShort }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Billed vs paid <span class="muted">· last 6 months</span></h3>' + lineChart(trend, { format: moneyShort }) + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">Cash needed — next 5 weeks <span class="muted">· by priority</span></h3>' + stackedColumns(wkData, PR, { format: moneyShort }) +
      '<p class="muted">Plus ' + money(wk.overdue.total) + ' already overdue' + (wk.later.count ? ' and ' + money(wk.later.total) + ' due later.' : '.') + '</p></div></div>';
}

export function renderDashboard(ctx, panel) {
  const live = scopedLive(ctx), period = scopedPeriod(ctx);
  const c = ctx.rules();
  const pk = periodKpis(period), lk = liveKpis(live, c);
  const f = ctx.filters;
  const tpls = ctx.data.templates.filter((t) => matchesScope({ branch_id: t.branch_id, category_id: t.category_id }, f));
  const al = buildAlerts(live, tpls, c);
  const unassigned = ctx.bills.filter((b) => !b.archived_at && !b.branch_id).length;

  const tone0 = (n, t) => n === 0 ? 'green' : t;
  // everything goes inside one wrapper that is thrown away on the next render, so its listeners can never leak into another tab
  panel.innerHTML = '<div id="bl-dash">' + filterBarHtml(ctx) +
    (ctx.canWrite && unassigned ? '<div class="msg lv-warn bl-nudge"><span><b>' + unassigned + '</b> bill' + (unassigned === 1 ? ' has' : 's have') + ' no branch yet, so branch reports are incomplete.</span> <button type="button" class="btn small" data-act="assign">Assign branches</button></div>' : '') +
    '<div class="bl-kpi-group"><h3 class="bl-h">This period · ' + esc(periodLabel(ctx)) + ' <span class="muted">' + esc(scopeLabel(ctx)) + '</span></h3><div class="bl-kpis">' +
      kpiCard({ label: 'Total bills', value: pk.count, sub: 'due in this period', tone: 'blue', go: 'view:all', hint: 'Open these bills' }) +
      kpiCard({ label: 'Total amount', value: money(pk.total), sub: 'billed', tone: 'blue', go: 'view:all' }) +
      kpiCard({ label: 'Paid', value: money(pk.paid), sub: pk.paidCount + ' bill' + (pk.paidCount === 1 ? '' : 's') + ' fully paid', tone: 'green', go: 'view:paid' }) +
      kpiCard({ label: 'Unpaid', value: money(pk.unpaid), sub: pk.unpaidCount + ' bill' + (pk.unpaidCount === 1 ? '' : 's') + ' open', tone: pk.unpaidCount ? 'yellow' : 'green', go: 'view:unpaid' }) +
      kpiCard({ label: 'Paid %', value: pk.paidPct + '%', sub: 'payment completion', tone: pk.paidPct >= 80 ? 'green' : pk.paidPct >= 50 ? 'yellow' : 'orange' }) +
      kpiCard({ label: 'Recurring', value: pk.recurring, sub: 'repeating bills', tone: 'blue', go: 'view:recurring' }) +
    '</div></div>' +
    '<div class="bl-kpi-group"><h3 class="bl-h">Right now <span class="muted">as of today, any month · ' + esc(scopeLabel(ctx)) + '</span></h3><div class="bl-kpis">' +
      kpiCard({ label: 'Overdue', value: lk.overdue.count, sub: money(lk.overdue.amount), tone: tone0(lk.overdue.count, 'red'), go: 'view:overdue' }) +
      kpiCard({ label: 'Due today', value: lk.today.count, sub: money(lk.today.amount), tone: tone0(lk.today.count, 'orange'), go: 'view:today' }) +
      kpiCard({ label: 'Due this week', value: lk.week.count, sub: money(lk.week.amount) + ' · today to Sunday', tone: tone0(lk.week.count, 'yellow'), go: 'view:week' }) +
      kpiCard({ label: 'Next 7 days', value: lk.next7.count, sub: money(lk.next7.amount), tone: 'blue', go: 'view:next7' }) +
      kpiCard({ label: 'Outstanding', value: money(lk.outstanding.amount), sub: lk.outstanding.count + ' unpaid bill' + (lk.outstanding.count === 1 ? '' : 's') + ' in total', tone: lk.outstanding.count ? 'blue' : 'green', go: 'view:outstanding' }) +
    '</div></div>' +
    '<div class="bl-dash-grid"><div class="bl-dash-main"><div class="card bl-panel"><h3 class="bl-h">Needs attention</h3>' +
      alertSection(ctx, { id: 'overdue', title: 'A · Overdue', tone: 'red', items: al.overdue, render: (b) => alertRow(ctx, b), amountOf: (b) => b._remaining, empty: 'Nothing is overdue.' }) +
      alertSection(ctx, { id: 'today', title: 'B · Due today', tone: 'orange', items: al.today, render: (b) => alertRow(ctx, b), amountOf: (b) => b._remaining, empty: 'Nothing is due today.' }) +
      alertSection(ctx, { id: 'next7', title: 'C · Due in the next 7 days', tone: 'yellow', items: al.next7, render: (b) => alertRow(ctx, b), amountOf: (b) => b._remaining, empty: 'Nothing else is due this week.' }) +
      alertSection(ctx, { id: 'high', title: 'D · High-amount bills (' + money(ctx.highAmount) + ' and up, due within 30 days)', tone: 'blue', items: al.high, render: (b) => alertRow(ctx, b), amountOf: (b) => b._remaining, empty: 'No large bills are coming up.' }) +
      alertSection(ctx, { id: 'recurring', title: 'E · Upcoming recurring bills (next 14 days)', tone: 'blue', items: al.recurring, render: (x) => x.kind === 'bill' ? alertRow(ctx, x.bill) : templateRow(ctx, x),
        amountOf: (x) => x.kind === 'bill' ? x.bill._remaining : Number(x.tpl.default_amount), empty: 'No recurring bills are due in the next two weeks.' }) +
    '</div></div><div class="bl-dash-side">' + recommendedHtml(ctx, live, c) + recentHtml(ctx, live) + '</div></div>' +
    chartsHtml(ctx, live, period, c) + '</div>';

  const root = panel.querySelector('#bl-dash');
  bindFilterBar(ctx, root, () => ctx.rerender());
  const budget = root.querySelector('#bl-budget');
  if (budget) {
    let t = null;
    budget.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { ctx.ui.budget = budget.value; ctx.rerender(); const nb = document.getElementById('bl-budget'); if (nb) { nb.focus(); nb.setSelectionRange(nb.value.length, nb.value.length); } }, 450); });
  }
  root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => ctx.applyView(el.dataset.go.replace('view:', ''))));
  root.addEventListener('click', onClick);
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = Number(el.dataset.id);
    const run = {
      view: () => ctx.openDetail(id), pay: () => ctx.openPayment(id), edit: () => ctx.openForm({ id }), upload: () => ctx.openUpload(id), snooze: () => ctx.openSnooze(id),
      assign: () => ctx.openAssignBranches(),
      dup: async () => {
        const res = await ctx.api.duplicateBill(id); if (res && res.ok === false) throw new Error(res.errors.join(' '));
        await ctx.refresh();
        const nb = ctx.byId.get(res.id);
        ctx.toast('Duplicated' + (nb && nb.due_date ? ' — the copy is due ' + fmtDate(nb.due_date) : '') + '.');
        ctx.openDetail(res.id);
      },
      'gen-tpl': async () => { const res = await ctx.api.generateFromTemplate(id); if (res && res.ok === false) throw new Error(res.errors.join(' ')); ctx.toast('Created the bill due ' + fmtDate(res.due_date) + '.'); await ctx.refresh(); ctx.openDetail(res.id); },
      'edit-tpl': () => ctx.openTemplateForm(id),
    }[el.dataset.act];
    if (run) { e.preventDefault(); const menu = el.closest('details.bl-menu'); if (menu) menu.open = false; Promise.resolve(run()).catch((err) => ctx.toast(err, true)); }
  }
}
