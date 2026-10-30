// Sales & Profit Dashboard -- the Sales Target tab: how much has to be sold every month to pay the running costs, the loan and the profit the owner wants.
// The running costs and today's sales come from the records (Expenses and sales, worked out by the database); the gross margin, the loan and the profit are the owner's to set, and the tab says
// plainly which is which. The one thing it never hides: the margin recorded in the system is only as good as the cost typed on each product, so a check of those costs sits right beside the margin.
//   sales needed per month = (running costs + other costs + loan payment + profit wanted) / gross margin
// "Profit wanted" is what is left each month after EVERY cost and the loan payment (cash left over), so it is the net figure.
import { api, esc, fin, moneyShort, int, pct, startOfMonth, endOfMonth, addMonths, daysBetween, todayIn, friendly, bucketLabel } from './sdCore.js?v=20261030a';
import { panel, loadingBox, errorBox, lockedBox, emptyBox, badge } from './sdUi.js?v=20261030a';
import { stats } from './sdTabs.js?v=20261030a';

// ---------------------------------------------------------------- the arithmetic (pure: the tests call these directly)
/** The monthly payment of a loan that is paid off in equal instalments (just the amount divided by the months when the rate is 0). */
export function loanPayment(principal, annualPct, months) {
  const P = Number(principal), n = Math.round(Number(months));
  if (!(P > 0) || !(n > 0)) return 0;
  const r = (Number(annualPct) || 0) / 100 / 12;
  return r > 0 ? P * r / (1 - Math.pow(1 + r, -n)) : P / n;
}
/** Everything the result shows. margin is a percentage (22 = 22%). sales is null when the margin is zero or less (no amount of selling can cover the costs then). */
export function plan({ costs, extra, loanPay, profit, margin, salesNow }) {
  const run = (fin(costs) || 0) + (fin(extra) || 0), loan = fin(loanPay) || 0, prof = fin(profit) || 0, need = run + loan + prof, m = (fin(margin) || 0) / 100;
  const sales = m > 0 ? need / m : null, now = fin(salesNow);
  return { run, loan, prof, need, m, sales, breakEven: m > 0 ? (run + loan) / m : null, now, ratio: sales !== null && now > 0 ? sales / now : null, gap: sales !== null && now !== null ? sales - now : null,
    marginNeeded: now > 0 ? need / now : null, gpNow: now !== null ? now * m : null, shortfall: now !== null ? need - now * m : null };
}
/** One cell of the what-if table: the sales needed for a margin when `cover` pesos of gross profit have to be earned every month. */
export const needed = (cover, marginPct) => (marginPct > 0 ? cover / (marginPct / 100) : null);
/** "1,250,000" / "₱1,250,000" / "12.5%" typed by a person -> a number, or null when there is nothing usable. */
export const parseNum = (s) => { const t = String(s === null || s === undefined ? '' : s).replace(/[₱,\s%]/g, ''); if (t === '') return null; const v = Number(t); return Number.isFinite(v) ? v : null; };

// ---------------------------------------------------------------- small helpers
const peso = (n) => { const v = fin(n); return v === null ? '—' : (v < 0 ? '-₱' : '₱') + Math.round(Math.abs(v)).toLocaleString('en-PH'); };
const inField = (n, dp) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: dp === undefined ? 2 : dp }));
const GROUP_LABEL = { Payroll: 'Salaries (payroll)', Operations: 'Operations (agencies, supplies, shipping)', Rent: 'Rent', Utilities: 'Utilities', Government: 'Government & taxes', Other: 'Other' };
const GROUP_ORDER = ['Payroll', 'Operations', 'Rent', 'Utilities', 'Government', 'Other'];
// Starting figures (Ren, 2026-10-26: the loan is "30m in total", paid "2 years, monthly, all"): P30,000,000 back in 24 equal payments, no extra interest, no profit on top.
const DEFAULTS = { costs: null, extra: 0, margin: null, sales: null, loanMode: 'terms', loan: 30000000, years: 2, rate: 0, payment: 0, profit: 0 };
const KEY = 'sd-target-v2';
const readSaved = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
const writeSaved = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* the calculator works without it */ } };
const MARGINS = [15, 20, 25, 30, 35, 40, 50];
const TERMS = [1, 2, 3, 5, 10];

export function renderTarget(root, ctx) {
  const A = ctx.api || api, can = ctx.can, tz = ctx.meta.tz, canMargin = !!(can.profit || can.cost);
  const saved = readSaved();
  const st = { basis: saved.basis === 'last1' ? 'last1' : 'last3', inp: Object.assign({}, DEFAULTS, saved.inp || {}), rec: null, seq: 0 };
  // everything below lives in one box that is thrown away with the tab, so listeners never pile up when the tab is opened again
  root.innerHTML = '<div class="sd-tg"></div>';
  const box = root.firstElementChild;

  // ---------------------------------------------------------------- what the records say
  async function fetchRecords() {
    const today = todayIn(tz), thisMonth = startOfMonth(today);
    const trend = await A.trend({ from: startOfMonth(addMonths(today, -6)), to: today }, 'month');
    const pts = (trend.points || []).map((p) => ({ b: String(p.bucket).slice(0, 10), net: fin(p.net_sales) || 0, opex: fin(p.opex), gp: fin(p.gross_profit) }));
    const withCosts = pts.filter((p) => p.b < thisMonth && p.net > 0 && p.opex !== null && p.opex > 0);
    // Bills only started to be entered in August, so a month whose expenses are under half of the typical month was only partly entered; averaging it in would understate the costs
    const sortedCosts = withCosts.map((p) => p.opex).sort((a, b) => a - b), mid = sortedCosts.length >> 1;
    const typical = sortedCosts.length ? (sortedCosts.length % 2 ? sortedCosts[mid] : (sortedCosts[mid - 1] + sortedCosts[mid]) / 2) : 0;
    const thin = (p) => p.opex < typical * 0.5, want = st.basis === 'last1' ? 1 : 3;
    const complete = withCosts.filter((p) => !thin(p)), left = withCosts.slice(-want).filter(thin);
    let basis = [], partial = false;
    // the months must follow each other: the expense split and the cost check are asked for one date range
    for (let i = complete.length - 1; i >= 0 && basis.length < want; i--) {
      if (basis.length && addMonths(complete[i].b, 1) !== basis[0].b) break;
      basis.unshift(complete[i]);
    }
    const cur = pts.find((p) => p.b === thisMonth) || null;
    if (!basis.length && cur && cur.net > 0) { basis = [cur]; partial = true; }
    const rec = { today, months: basis, partial, left, avgSales: null, avgCosts: null, mtd: null, groups: [], recordedMargin: null, check: null, believable: null, shares: null, errors: [] };
    if (cur) {
      const elapsed = daysBetween(thisMonth, today) + 1, inMonth = daysBetween(thisMonth, endOfMonth(thisMonth)) + 1;
      rec.mtd = { net: cur.net, elapsed, inMonth, pace: cur.net / elapsed * inMonth };
    }
    if (!basis.length) return rec;
    const n = basis.length, from = basis[0].b, to = partial ? today : endOfMonth(basis[n - 1].b);
    rec.avgSales = basis.reduce((t, p) => t + p.net, 0) / n;
    rec.avgCosts = basis.reduce((t, p) => t + (p.opex || 0), 0) / n;
    const gpPts = basis.filter((p) => p.gp !== null), gpNet = gpPts.reduce((t, p) => t + p.net, 0);
    if (gpPts.length && gpNet > 0) rec.recordedMargin = gpPts.reduce((t, p) => t + p.gp, 0) / gpNet * 100;
    const [exp, chk] = await Promise.all([
      A.expenseSummary({ from, to }).catch((e) => { rec.errors.push(friendly(e)); return null; }),
      canMargin ? A.costCheck({ from, to }).catch(() => null) : null,
    ]);
    if (exp && exp.by_category) {
      const g = {};
      exp.by_category.forEach((c) => { const k = GROUP_ORDER.includes(c.group) ? c.group : 'Other'; g[k] = (g[k] || 0) + (fin(c.amount) || 0); });
      rec.groups = GROUP_ORDER.filter((k) => g[k] > 0).map((k) => ({ key: k, label: GROUP_LABEL[k], perMonth: g[k] / n }));
    }
    if (chk && chk.check && chk.check.lines > 0) {
      const c = chk.check, tot = fin(c.net_sales) || 0, b = c.below_price || {};
      rec.check = c;
      if (b.lines >= 20 && b.net > 0) rec.believable = (b.net - b.cogs) / b.net * 100;
      rec.shares = tot > 0 ? { same: c.same_as_price.net / tot * 100, above: c.above_price.net / tot * 100, none: c.no_cost.net / tot * 100, below: b.net / tot * 100 } : null;
    }
    return rec;
  }
  /** The margin the box starts with: the margin of the lines whose cost looks real, else the recorded one if it is believable, else a plain 30. */
  const defaultMargin = (rec) => (rec && rec.believable !== null ? Math.round(rec.believable) : rec && rec.recordedMargin !== null && rec.recordedMargin >= 5 && rec.recordedMargin <= 80 ? Math.round(rec.recordedMargin) : 30);
  const value = (key) => {
    const i = st.inp, r = st.rec;
    if (key === 'costs') return i.costs !== null && i.costs !== undefined ? i.costs : (r && r.avgCosts !== null ? r.avgCosts : null);
    if (key === 'sales') return i.sales !== null && i.sales !== undefined ? i.sales : (r && r.avgSales !== null ? r.avgSales : null);
    if (key === 'margin') return i.margin !== null && i.margin !== undefined ? i.margin : defaultMargin(r);
    return i[key];
  };
  const loanPay = () => (st.inp.loanMode === 'payment' ? (fin(st.inp.payment) || 0) : loanPayment(st.inp.loan, st.inp.rate, (Number(st.inp.years) || 0) * 12));
  const current = () => plan({ costs: value('costs'), extra: st.inp.extra, loanPay: loanPay(), profit: st.inp.profit, margin: value('margin'), salesNow: value('sales') });
  const save = () => writeSaved({ basis: st.basis, inp: st.inp });

  // ---------------------------------------------------------------- drawing
  function recordsHtml() {
    const r = st.rec;
    if (!r || r.avgSales === null) return emptyBox('There is not a full month of sales and expenses in the records yet, so type your own figures in the boxes below.');
    const months = r.months.map((p) => bucketLabel(p.b, 'month')).join(', '), payroll = r.groups.find((g) => g.key === 'Payroll');
    const items = [
      { label: 'Sales per month (net)', html: esc(peso(r.avgSales)), sub: r.partial ? 'This month so far' : 'Average of ' + months },
      r.mtd ? { label: 'This month so far', html: esc(peso(r.mtd.net)), sub: 'Day ' + r.mtd.elapsed + ' of ' + r.mtd.inMonth + ' · on pace for ' + peso(r.mtd.pace) } : null,
      { label: 'Running costs per month', html: esc(peso(r.avgCosts)), sub: 'Business expenses due in the month (not personal, not supplier payments)' },
      payroll ? { label: 'Of which salaries', html: esc(peso(payroll.perMonth)), sub: 'Payroll bills; agency bills are under Operations' } : null,
      canMargin ? { label: 'Margin recorded in the system', html: r.recordedMargin === null ? '<span class="sd-dash">—</span>' : esc(pct(r.recordedMargin, 1)), sub: r.check ? 'See the cost check below before you trust it' : '', warn: r.shares && (r.shares.same + r.shares.above + r.shares.none) > 25 ? 'doubtful' : '' } : null,
    ];
    const split = r.groups.length ? '<details class="sd-tg-split"><summary>Where the running costs go <span class="muted">(per month)</span></summary><ul>' +
      r.groups.map((g) => '<li><span>' + esc(g.label) + '</span><b>' + esc(peso(g.perMonth)) + '</b><span class="muted">' + esc(pct(r.avgCosts > 0 ? g.perMonth / r.avgCosts * 100 : 0, 0)) + '</span></li>').join('') + '</ul></details>' : '';
    const leftNote = r.left && r.left.length ? '<p class="muted sd-note">Left out of the average: ' + r.left.map((p) => esc(bucketLabel(p.b, 'month')) + ' (only ' + esc(peso(p.opex)) + ' of expenses entered)').join(', ') +
      ' — far less than the other months, so its bills were probably not all in the system yet. Type your own costs below if you know them.</p>' : '';
    return stats(items) + split + leftNote + (r.errors.length ? '<p class="muted sd-note">' + esc(r.errors.join(' ')) + '</p>' : '');
  }
  function checkHtml() {
    const r = st.rec;
    if (!canMargin) return '<div class="sd-tg-callout sd-tg-info">Margin and cost figures are hidden for your access, so type the gross margin you expect in the box below.</div>';
    if (!r || !r.check || !r.shares) return '<div class="sd-tg-callout sd-tg-info">There are no costed sales in these months to check, so the margin below is your own estimate.</div>';
    const s = r.shares, c = r.check, bad = s.same + s.above + s.none, tone = bad > 25 ? 'sd-tg-warn' : 'sd-tg-ok';
    const row = (label, share, lines, note) => '<tr><td>' + esc(label) + '</td><td class="sd-tg-n">' + esc(pct(share, 0)) + '</td><td class="sd-tg-n">' + esc(int(lines)) + '</td><td class="muted">' + esc(note) + '</td></tr>';
    return '<div class="sd-tg-callout ' + tone + '"><b>' + (bad > 25 ? '⚠ The margin in the system cannot be trusted yet' : 'Cost check') + '</b>' +
      '<p>' + (bad > 25 ? esc(pct(bad, 0)) + ' of these sales have a cost that looks wrong (the same as the selling price, higher than it, or missing), so the recorded margin of ' + esc(r.recordedMargin === null ? '—' : pct(r.recordedMargin, 1)) + ' is not the real one.'
        : 'Most sales have a believable cost, so the recorded margin is a fair guide.') + '</p>' +
      '<div class="sd-tablewrap"><table class="sd-tbl sd-tg-check"><thead><tr><th>Cost recorded for the product</th><th class="sd-tg-n">Share of sales</th><th class="sd-tg-n">Sale lines</th><th></th></tr></thead><tbody>' +
      row('Lower than the selling price', s.below, c.below_price.lines, r.believable !== null ? 'looks real — these earn ' + pct(r.believable, 1) + ' (a little optimistic: lines costed above the price are left out)' : 'looks real') +
      row('Same as the selling price', s.same, c.same_as_price.lines, 'a placeholder — it shows no profit') +
      row('Higher than the selling price', s.above, c.above_price.lines, 'wrong, or sold below cost') +
      row('No cost recorded', s.none, c.no_cost.lines, 'not counted in the recorded margin') + '</tbody></table></div>' +
      (can.cost ? '<p><a href="fix-data.html?type=cost">Open the Fix Product Data list →</a> <span class="muted">Once the supplier prices are right, the dashboard and this tab show the real margin.</span></p>' : '') + '</div>';
  }
  const use = (what, label) => ' <button type="button" class="act-link" data-use="' + what + '">' + esc(label) + '</button>';
  // the two "from the records" hints show a "Use the records" link only while the box holds a figure of the owner's own, so they are redrawn as the person types
  const costsHint = () => (st.rec && st.rec.avgCosts !== null ? 'From the records: ' + esc(peso(st.rec.avgCosts)) + (st.inp.costs !== null && st.inp.costs !== undefined ? use('costs', 'Use the records') : '') : 'Type your monthly costs.');
  const salesHint = () => (st.rec && st.rec.avgSales !== null ? 'From the records: ' + esc(peso(st.rec.avgSales)) + (st.inp.sales !== null && st.inp.sales !== undefined ? use('sales', 'Use the records') : '') : 'Used only to compare with the target.');
  function formHtml() {
    const i = st.inp, r = st.rec;
    const hint = (id, html) => '<div class="sd-tg-hint" id="' + id + '">' + html + '</div>';
    const field = (id, label, v, dp, h) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="text" inputmode="decimal" autocomplete="off" value="' + esc(inField(v, dp)) + '">' + (h || '') + '</div>';
    return '<div class="sd-tg-live" id="tg-live" aria-hidden="true"></div><div class="sd-tg-form">' +
      field('tg-costs', 'Running costs per month (₱)', value('costs'), 0, hint('tg-costs-h', costsHint())) +
      field('tg-extra', 'Other monthly costs not in the records (₱)', i.extra, 0, hint('tg-extra-h', 'Ads, income tax, anything you pay that is not entered as an expense.')) +
      field('tg-margin', 'Gross margin on your sales (%)', value('margin'), 1, hint('tg-margin-h', (r && r.believable !== null ? 'Lines with a believable cost earn ' + esc(pct(r.believable, 1)) + use('believable', 'Use it') : '') +
        (r && r.recordedMargin !== null ? (r.believable !== null ? ' · ' : '') + 'Recorded: ' + esc(pct(r.recordedMargin, 1)) + (r.recordedMargin > 0 ? use('recorded', 'Use it') : '') : '') || 'The share of every sale you keep after the cost of the product.')) +
      field('tg-sales', 'Sales per month now (₱)', value('sales'), 0, hint('tg-sales-h', salesHint())) +
      '<fieldset class="field sd-tg-wide sd-tg-loan"><legend>The loan</legend>' +
        '<div class="sd-tg-radios"><label><input type="radio" name="tg-loanmode" value="terms"' + (i.loanMode !== 'payment' ? ' checked' : '') + '> Work out the payment</label><label><input type="radio" name="tg-loanmode" value="payment"' + (i.loanMode === 'payment' ? ' checked' : '') + '> I know the monthly payment</label></div>' +
        '<div class="sd-tg-loanrow" id="tg-loan-terms"' + (i.loanMode === 'payment' ? ' hidden' : '') + '>' + field('tg-loan', 'Total to pay back (₱)', i.loan, 0) + field('tg-years', 'Paid over (years)', i.years, 2) + field('tg-rate', 'Extra interest per year (%)', i.rate, 2) + '</div>' +
        '<div class="sd-tg-loanrow" id="tg-loan-pay"' + (i.loanMode === 'payment' ? '' : ' hidden') + '>' + field('tg-payment', 'Monthly loan payment (₱)', i.payment, 0) + '</div>' +
        '<div class="sd-tg-hint" id="tg-loan-h"></div></fieldset>' +
      field('tg-profit', 'Profit you want to keep each month (₱)', i.profit, 0, hint('tg-profit-h', 'The net figure: what is left after every cost, the salaries and the loan payment. Leave 0 if the ₱30M already includes your profit.')) +
      '</div><div class="sd-tg-assume">Starting figures: ₱30,000,000 paid back over 2 years (24 equal monthly payments), no extra interest, no profit on top. Change any of them. <button type="button" class="btn small secondary" id="tg-reset">Start again</button></div>';
  }
  function resultHtml(p) {
    const i = st.inp;
    if (p.sales === null) return '<div class="sd-tg-callout sd-tg-warn"><b>A margin of 0% or less can never cover the costs.</b><p>Type the gross margin you expect (above 0%) to see the sales target.</p></div>';
    const tone = p.ratio === null ? 'gray' : p.ratio <= 1 ? 'green' : p.ratio <= 1.5 ? 'orange' : 'red';
    const verdict = p.ratio === null ? '' : p.ratio <= 1 ? 'Your sales are already above this target' : p.ratio <= 1.5 ? 'A stretch — about ' + Math.round((p.ratio - 1) * 100) + '% more than you sell now' : p.ratio <= 3 ? 'About ' + p.ratio.toFixed(1) + ' times what you sell now' : 'Far above today\'s sales — ' + p.ratio.toFixed(1) + ' times';
    const loanLabel = i.loanMode === 'payment' ? 'Loan payment (your figure)' : 'Loan payment (' + peso(i.loan) + ' over ' + (Number(i.years) || 0) + ' years' + (Number(i.rate) ? ' at ' + Number(i.rate) + '%' : '') + ')';
    const bar = (label, v, max, cls) => '<div class="sd-tg-barrow"><span class="sd-tg-barl">' + esc(label) + '</span><span class="sd-tg-bar"><i class="' + cls + '" style="width:' + (max > 0 ? Math.max(1, Math.min(100, v / max * 100)).toFixed(1) : 0) + '%"></i></span><b>' + esc(moneyShort(v)) + '</b></div>';
    const max = Math.max(p.sales, p.now || 0);
    let words = '';
    if (p.now !== null && p.now > 0) {
      words = '<p>You sell about <b>' + esc(peso(p.now)) + '</b> a month now. At a ' + esc(pct(p.m * 100, 1)) + ' margin that earns <b>' + esc(peso(p.gpNow)) + '</b> of gross profit, and <b>' + esc(peso(p.need)) + '</b> is needed' +
        (p.shortfall > 0 ? ', so the store is short by <b>' + esc(peso(p.shortfall)) + '</b> every month.' : ' — so today\'s sales already cover it.') + '</p>' +
        '<p>' + (p.marginNeeded <= 1 ? 'To cover it with today\'s sales you would need a margin of <b>' + esc(pct(p.marginNeeded * 100, 1)) + '</b>.' : 'At today\'s sales even a 100% margin would not cover it — sales have to grow, or the loan payment or the profit wanted has to come down.') + '</p>';
    }
    return '<div class="sd-tg-top"><div class="sd-tg-big">' + esc(peso(p.sales)) + '</div><div class="sd-tg-bigl">in sales, every month</div>' + (verdict ? '<div>' + badge(verdict, tone) + '</div>' : '') + '</div>' +
      '<div class="sd-tg-eq">' +
        '<div class="sd-tg-line"><span>Running costs' + (fin(i.extra) ? ' + other costs' : '') + '</span><b>' + esc(peso(p.run)) + '</b></div>' +
        '<div class="sd-tg-line"><span>' + esc(loanLabel) + '</span><b>' + esc(peso(p.loan)) + '</b></div>' +
        '<div class="sd-tg-line"><span>Profit you want to keep</span><b>' + esc(peso(p.prof)) + '</b></div>' +
        '<div class="sd-tg-line sd-tg-sum"><span>Gross profit you must earn each month</span><b>' + esc(peso(p.need)) + '</b></div>' +
        '<div class="sd-tg-line"><span>÷ gross margin of ' + esc(pct(p.m * 100, 1)) + '</span><b>' + esc(peso(p.sales)) + ' in sales</b></div>' +
        (p.prof > 0 ? '<div class="sd-tg-line sd-tg-sub"><span>Just to pay the costs and the loan (no profit)</span><b>' + esc(peso(p.breakEven)) + ' in sales</b></div>' : '') + '</div>' +
      (p.now !== null && p.now > 0 ? '<div class="sd-tg-bars">' + bar('Sales now', p.now, max, 'now') + bar('Target', p.sales, max, 'goal') + '</div>' : '') + words;
  }
  function gridHtml(p) {
    const i = st.inp, now = p.now, mine = value('margin');
    const myYears = i.loanMode === 'terms' && Number(i.years) > 0 ? Number(i.years) : null;
    const terms = [...new Set(TERMS.concat(myYears ? [myYears] : []))].sort((a, b) => a - b);
    const loanCols = i.loanMode === 'payment' ? [{ label: '+ your loan payment', add: p.loan, mine: true }] : (fin(i.loan) > 0 ? terms.map((y) => ({ label: '+ loan over ' + y + (y === 1 ? ' year' : ' years'), add: loanPayment(i.loan, i.rate, y * 12), mine: y === myYears })) : []);
    const cols = [{ label: 'Costs only', add: 0 }].concat(p.prof > 0 ? [{ label: '+ profit', add: p.prof }] : []).concat(loanCols.map((c) => ({ label: c.label, add: p.prof + c.add, mine: c.mine })));
    const margins = [...new Set(MARGINS.concat(mine > 0 ? [Math.round(mine * 10) / 10] : []))].sort((a, b) => a - b);
    const cls = (v) => (now > 0 ? (v <= now ? 'ok' : v <= now * 1.5 ? 'near' : 'far') : '');
    return '<div class="sd-tablewrap"><table class="sd-tbl sd-tg-table"><thead><tr><th>Gross margin</th>' + cols.map((c) => '<th class="sd-tg-n' + (c.mine ? ' sd-tg-minecol' : '') + '">' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
      margins.map((m) => '<tr' + (Math.abs(m - mine) < 0.05 ? ' class="sd-tg-mine"' : '') + '><th scope="row">' + esc(pct(m, m % 1 ? 1 : 0)) + (Math.abs(m - mine) < 0.05 ? ' <span class="muted">your margin</span>' : '') + '</th>' +
        cols.map((c) => { const v = needed(p.run + c.add, m); return '<td class="sd-tg-n sd-tg-' + cls(v) + (c.mine ? ' sd-tg-minecol' : '') + '" title="' + esc(peso(v)) + '">' + esc(moneyShort(v)) + '</td>'; }).join('') + '</tr>').join('') + '</tbody></table></div>' +
      '<p class="muted sd-note">Each cell is the sales needed every month for that margin: the costs alone, then with your profit, then with the loan paid back over different numbers of years (same total and interest as above).' +
      (now > 0 ? ' <span class="sd-tg-key"><i class="sd-tg-ok"></i> within today\'s sales (' + esc(moneyShort(now)) + ') <i class="sd-tg-near"></i> up to 1.5 times <i class="sd-tg-far"></i> more than that</span>' : '') + '</p>';
  }

  // ---------------------------------------------------------------- wiring
  function update() {
    const p = current();
    const res = box.querySelector('#sd-tg-result'), grid = box.querySelector('#sd-tg-grid'), lh = box.querySelector('#tg-loan-h'), ch = box.querySelector('#tg-costs-h'), sh = box.querySelector('#tg-sales-h');
    const live = box.querySelector('#tg-live');
    if (live) live.innerHTML = p.sales === null ? 'Type a margin above 0% to see the target' : 'Needs <b>' + esc(peso(p.sales)) + '</b> in sales every month';
    if (ch) ch.innerHTML = costsHint();
    if (sh) sh.innerHTML = salesHint();
    if (res) res.innerHTML = resultHtml(p);
    if (grid) grid.innerHTML = p.sales === null ? '' : gridHtml(p);
    if (lh) lh.textContent = st.inp.loanMode === 'payment' ? '' : 'Monthly payment: ' + peso(loanPay()) + ' (equal instalments' + (Number(st.inp.rate) ? ', with the interest' : ', no extra interest') + ').';
    save();
  }
  const FIELD = { 'tg-costs': 'costs', 'tg-extra': 'extra', 'tg-margin': 'margin', 'tg-sales': 'sales', 'tg-loan': 'loan', 'tg-years': 'years', 'tg-rate': 'rate', 'tg-payment': 'payment', 'tg-profit': 'profit' };
  const DP = { costs: 0, extra: 0, margin: 1, sales: 0, loan: 0, years: 2, rate: 2, payment: 0, profit: 0 };
  const NULLABLE = ['costs', 'sales', 'margin'];
  function draw() {
    box.innerHTML =
      panel('Sales target', '<div id="sd-tg-records">' + recordsHtml() + '</div><div id="sd-tg-check">' + checkHtml() + '</div>',
        { sub: 'How much do we have to sell every month to pay the running costs, the loan and the profit we want?',
          actions: '<label class="sd-tg-basis">Figures from <select id="tg-basis"><option value="last3"' + (st.basis === 'last3' ? ' selected' : '') + '>the last 3 full months</option><option value="last1"' + (st.basis === 'last1' ? ' selected' : '') + '>the last full month</option></select></label>' }) +
      '<div class="sd-tg-cols">' + panel('Your numbers', formHtml(), { sub: 'Change any box — the result updates as you type' }) +
        panel('What you need to sell', '<div id="sd-tg-result" aria-live="polite"></div>', { cls: 'sd-tg-resultpanel' }) + '</div>' +
      panel('What if…', '<div id="sd-tg-grid"></div>', { sub: 'The monthly sales needed for other margins and other loan lengths' }) +
      '<p class="muted sd-note">A planning calculation from your own records, not accounting or lending advice — check the loan terms with your accountant or bank. The running costs are the business expenses due in each month (personal bills and supplier payments left out); the loan is not in the records, so it is whatever you enter here.</p>';
    update();
  }
  box.addEventListener('input', (e) => {
    const key = FIELD[e.target.id]; if (!key) return;
    const v = parseNum(e.target.value);
    st.inp[key] = v === null ? (NULLABLE.includes(key) ? null : 0) : v;
    update();
  });
  box.addEventListener('focusout', (e) => { const key = FIELD[e.target.id]; if (key) e.target.value = inField(NULLABLE.includes(key) ? value(key) : st.inp[key], DP[key]); });
  box.addEventListener('change', (e) => {
    if (e.target.name === 'tg-loanmode') {
      st.inp.loanMode = e.target.value === 'payment' ? 'payment' : 'terms';
      box.querySelector('#tg-loan-terms').hidden = st.inp.loanMode === 'payment'; box.querySelector('#tg-loan-pay').hidden = st.inp.loanMode !== 'payment';
      if (st.inp.loanMode === 'payment' && !(fin(st.inp.payment) > 0)) { st.inp.payment = Math.round(loanPayment(st.inp.loan, st.inp.rate, (Number(st.inp.years) || 0) * 12)); box.querySelector('#tg-payment').value = inField(st.inp.payment, 0); }
      update();
    } else if (e.target.id === 'tg-basis') { st.basis = e.target.value === 'last1' ? 'last1' : 'last3'; st.inp.costs = null; st.inp.sales = null; save(); load(); }
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-use]');
    if (b) {
      const what = b.dataset.use, r = st.rec;
      if (what === 'costs') st.inp.costs = null; else if (what === 'sales') st.inp.sales = null;
      else if (what === 'believable' && r && r.believable !== null) st.inp.margin = Math.round(r.believable * 10) / 10;
      else if (what === 'recorded' && r && r.recordedMargin !== null) st.inp.margin = Math.round(r.recordedMargin * 10) / 10;
      redrawForm(); update(); return;
    }
    if (e.target.closest('#tg-reset')) { st.inp = Object.assign({}, DEFAULTS); redrawForm(); update(); }
  });
  function redrawForm() {
    const host = box.querySelector('.sd-tg-cols .sd-panel-body'); if (!host) return;
    host.innerHTML = formHtml();
  }

  async function load() {
    const my = ++st.seq;
    box.innerHTML = panel('Sales target', loadingBox('Reading the sales and expense records…'), { sub: 'How much do we have to sell every month to pay the running costs, the loan and the profit we want?' });
    try { const rec = await fetchRecords(); if (my !== st.seq) return; st.rec = rec; draw(); }
    catch (err) { if (my !== st.seq) return; box.innerHTML = err.denied ? lockedBox(err.message) : errorBox(friendly(err)); }
  }
  return { reload: load };
}
