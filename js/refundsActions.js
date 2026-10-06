// Refund Management -- the quick-action buttons that appear on every list (dashboard alerts, the approval queue,
// payment tracking and the Requests table) and the one click handler that runs them. Which buttons a person sees
// follows their role and the refund's state; the database re-checks every one of them when it is pressed.
import { esc, errorsText } from './refundsUi.js?v=20261006d';

const btn = (act, id, label, cls) => '<button type="button" class="btn small' + (cls ? ' ' + cls : '') + '" data-act="' + act + '" data-id="' + id + '">' + label + '</button>';

/** The "⋯" menu entries for one refund. */
export function menuItems(ctx, r) {
  const m = [];
  if (ctx.canEdit(r)) m.push(['edit', 'Edit Request']);
  if (ctx.canNote(r)) m.push(['note', 'Add Note'], ['comm', 'Log Customer Contact']);
  if (ctx.access.approve && r._open) m.push(['priority', 'Set Priority / Flag']);
  if (ctx.canNote(r) && !ctx.access.pay && (r._awaiting || r._approved)) m.push(['upload', 'Attach a File']);
  m.push(['print', 'Print Summary']);
  return m;
}

/** Buttons for one refund. `quick` = the main one or two actions; everything else sits behind "⋯". */
export function actionButtons(ctx, r, { view = true } = {}) {
  const mgr = ctx.access.approve, pay = ctx.access.pay;
  let h = '';
  if (view) h += btn('view', r.id, 'View Details', 'secondary');
  if (mgr && r._awaiting) {
    if (r.approval_status !== 'Under Review') h += btn('review', r.id, 'Review', 'secondary');
    h += btn('approve', r.id, 'Approve') + btn('reject', r.id, 'Reject', 'secondary');
  }
  if (pay && r._approved && r._remaining > 0) h += btn('pay', r.id, 'Record Refund Payment');
  if (pay && r._missingProof && r.status !== 'Cancelled') h += btn('upload', r.id, 'Upload Proof', 'secondary');
  const menu = menuItems(ctx, r);
  return '<div class="bl-rowact">' + h + (menu.length ? '<details class="bl-menu"><summary class="btn small secondary" aria-label="More actions">⋯</summary><div class="bl-menu-pop">' +
    menu.map((x) => '<button type="button" data-act="' + x[0] + '" data-id="' + r.id + '">' + x[1] + '</button>').join('') + '</div></details>' : '') + '</div>';
}

/** One delegated click handler for a whole panel. */
export function bindActions(ctx, root) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = Number(el.dataset.id);
    const run = {
      view: () => ctx.openDetail(id),
      approve: () => ctx.openDetail(id, { action: 'approve' }),
      reject: () => ctx.openDetail(id, { action: 'reject' }),
      review: async () => {
        const res = await ctx.api.reviewRefund(id, 'start_review', {});
        if (res && res.ok === false) throw new Error(errorsText(res));
        ctx.toast('Marked as under review.'); await ctx.refresh(); ctx.openDetail(id);
      },
      pay: () => ctx.openPayment(id),
      upload: () => ctx.openUpload(id),
      edit: () => ctx.openForm({ id }),
      note: () => ctx.openNote(id),
      comm: () => ctx.openComm(id),
      priority: () => ctx.openPriority(id),
      print: () => ctx.printRefund(id),
    }[el.dataset.act];
    if (run) { e.preventDefault(); const menu = el.closest('details.bl-menu'); if (menu) menu.open = false; Promise.resolve(run()).catch((err) => ctx.toast(err, true)); }
  });
}

/** One refund as a compact alert / queue row: who, what, how old, how much, and the buttons.
 * `badges` and `amount` are ready-made HTML: the amount cell is [bold figure, small grey line]. */
export function alertRow(ctx, r, { badges, amount, note }) {
  return '<div class="bl-alert-row" data-refund="' + r.id + '"><div class="bl-alert-main">' +
    '<button type="button" class="bl-link" data-act="view" data-id="' + r.id + '">' + esc(r.refund_request_number) + ' · ' + esc(r.customer_name) + '</button>' +
    '<div class="muted">Order ' + esc(r.order_reference || '—') + ' · ' + esc(r.reason_category || 'No reason set') + ' · ' + esc(r._branch) + '</div>' +
    '<div class="bl-alert-badges">' + badges + '</div>' + (note ? '<div class="muted bl-sub">' + note + '</div>' : '') + '</div>' +
    '<div class="bl-alert-amt"><b>' + amount[0] + '</b><span class="muted">' + amount[1] + '</span></div>' +
    '<div class="bl-alert-actions">' + actionButtons(ctx, r) + '</div></div>';
}
