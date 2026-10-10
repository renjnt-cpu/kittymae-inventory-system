// Access & Performance Control Center -- Settings: the owner's own thresholds ("what counts as a higher-than-normal void rate"), the weights behind the two optional scores, and which kinds
// of record are shown as review signals instead of counting as errors. Nothing here is hard-coded in the screens; changing a value changes every figure and alert that uses it.
import { esc, openDrawer, closeDrawer, toast, guarded, btn } from './apcCore.js?v=20261011b';
import { DEFAULT_TH, DEFAULT_WEIGHTS, WEIGHT_LABELS, thresholds, weightsOf } from './apcMetrics.js?v=20261011b';

const TH_LABELS = {
  void_rate_pct: 'Void rate that needs a look (%)', discount_rate_pct: 'Discount rate that needs a look (%)', refund_rate_pct: 'Refund rate that needs a look (%) — not used until refunds can be tied to a seller',
  error_rate_pct: 'Error rate that needs a look (%)', min_sample: 'Smallest number of transactions for a fair rate or score', repeat_error_count: 'Same error this many times = a repeated issue',
  low_activity_events: 'Fewer actions than this in the period = very low activity', inactive_days: 'Days without sign-in before an account is called idle (reserved)', low_stock_qty: 'Low stock = this many pieces or fewer (no product has its own reorder level yet)',
};

export function openSettings(A) {
  const th = thresholds(A.ctx), sw = weightsOf(A.ctx, 'sales_quality_weights'), pw = weightsOf(A.ctx, 'performance_weights');
  const types = [...new Set((A.S.errs.rows || []).map((e) => e.error_type).concat(((A.ctx.settings || {}).signal_error_types) || ['Voided Transaction', 'Manual Override']))].sort();
  const signal = new Set((A.ctx.settings || {}).signal_error_types || ['Voided Transaction', 'Manual Override']);
  const num = (id, name, v) => '<div class="field"><label for="' + id + '">' + esc(name) + '</label><input type="number" min="0" step="any" id="' + id + '" value="' + esc(v) + '"></div>';
  const canEdit = A.can.admin;
  openDrawer({ wide: false, title: 'Settings', sub: canEdit ? 'Owner-controlled. Saved settings apply to every figure on this page.' : 'Only an Admin can change these.',
    body: '<form id="apc-set-form" class="sd-form"><h4>Alerts and fair-sample rules</h4><div class="sd-set-form">' + Object.keys(DEFAULT_TH).map((k) => num('st-' + k, TH_LABELS[k] || k, th[k])).join('') + '</div>' +
      '<h4>Sales Quality Score — weights</h4><p class="muted sd-small">Higher weight = counts for more. A part with not enough data is skipped and the rest are re-balanced. Refund rate is left out until refunds can be tied to a seller.</p><div class="sd-set-form">' +
      Object.keys(DEFAULT_WEIGHTS.sales_quality_weights).map((k) => num('sw-' + k, WEIGHT_LABELS[k] || k, sw[k])).join('') + '</div>' +
      '<h4>Performance score — weights</h4><div class="sd-set-form">' + Object.keys(DEFAULT_WEIGHTS.performance_weights).map((k) => num('pw-' + k, WEIGHT_LABELS[k] || k, pw[k])).join('') + '</div>' +
      '<h4>Review signals (shown, not counted as errors)</h4><div class="apc-signal-list">' + types.map((t) => '<label class="apc-bcheck"><input type="checkbox" data-sig="' + esc(t) + '"' + (signal.has(t) ? ' checked' : '') + '> ' + esc(t) + '</label>').join('') + '</div>' +
      '<p class="muted sd-small">The scores are optional, never replace the raw figures, and are never used for pay or discipline.</p></form>',
    footer: canEdit ? btn('Save settings', 'id="st-save"') + ' ' + btn('Cancel', 'id="st-cancel"', 'secondary') : btn('Close', 'id="st-cancel"', 'secondary') });
  document.getElementById('st-cancel').addEventListener('click', closeDrawer);
  const save = document.getElementById('st-save'); if (!save) return;
  save.addEventListener('click', () => guarded(save, async () => {
    const read = (prefix, keys) => Object.fromEntries(keys.map((k) => [k, Number(document.getElementById(prefix + k).value)]));
    const bad = (o) => Object.values(o).some((v) => !Number.isFinite(v) || v < 0);
    const t = read('st-', Object.keys(DEFAULT_TH)), s = read('sw-', Object.keys(DEFAULT_WEIGHTS.sales_quality_weights)), p = read('pw-', Object.keys(DEFAULT_WEIGHTS.performance_weights));
    if (bad(t) || bad(s) || bad(p)) return toast('Every value must be a number, zero or more.', true);
    if (!Object.values(s).some((v) => v > 0) || !Object.values(p).some((v) => v > 0)) return toast('At least one weight in each score must be above zero.', true);
    const sig = [...document.querySelectorAll('[data-sig]')].filter((c) => c.checked).map((c) => c.dataset.sig);
    await A.api.setSetting('thresholds', t); await A.api.setSetting('sales_quality_weights', s); await A.api.setSetting('performance_weights', p); await A.api.setSetting('signal_error_types', sig);
    A.ctx.settings = Object.assign({}, A.ctx.settings, { thresholds: t, sales_quality_weights: s, performance_weights: p, signal_error_types: sig });
    closeDrawer(); toast('Settings saved.'); await A.reload('data');
  }));
}
