// Transfers -- the quick-action buttons that appear on every list (dashboard alerts, the Transfers table, the discrepancy list) and the one
// click handler that runs them. Which buttons a person sees follows their role and the transfer's state; the database re-checks every one
// of them when it is pressed.
import { esc, routeText, statusBadge, priorityBadge, discBadge, pcs } from './transfersUi.js?v=20261008b';

const btn = (act, id, label, cls) => '<button type="button" class="btn small' + (cls ? ' ' + cls : '') + '" data-act="' + act + '" data-id="' + id + '">' + label + '</button>';

/** The "⋯" menu entries for one transfer. */
export function menuItems(ctx, t) {
  const c = ctx.caps, m = [];
  if (c.canEdit(t)) m.push(['edit', 'Edit Transfer']);
  if (c.canPrepare(t)) m.push(['prepare', 'Start Preparing']);
  if (c.canRevise(t)) m.push(['revise', 'Revise Approved Quantity']);
  if (c.canReturn(t)) m.push(['return', 'Create Return Transfer']);
  if (c.canReport(t)) m.push(['report', 'Report a Discrepancy']);
  if (c.involved(t)) m.push(['note', 'Add Note']);
  if (c.canAttach(t)) m.push(['upload', 'Attach a File']);
  m.push(['print', 'Print Transfer Document']);
  if (c.canCancel(t)) m.push(['cancel', 'Cancel Transfer…']);
  return m;
}

/** Buttons for one transfer: the main step it is waiting for, then "⋯" for the rest. */
export function actionButtons(ctx, t, { view = true } = {}) {
  const c = ctx.caps;
  let h = '';
  if (view) h += btn('view', t.id, 'View Details', 'secondary');
  if (c.canSubmit(t)) h += btn('submit', t.id, 'Submit');
  if (c.canApprove(t)) h += btn('approve', t.id, 'Approve');
  if (c.canRelease(t)) h += btn('release', t.id, 'Release');
  if (c.canReceive(t)) h += btn('receive', t.id, 'Receive');
  if (t._openDiscs.length && c.canResolve()) h += btn('resolve', t.id, 'Resolve', 'secondary');
  const menu = menuItems(ctx, t);
  return '<div class="bl-rowact">' + h + (menu.length ? '<details class="bl-menu"><summary class="btn small secondary" aria-label="More actions">⋯</summary><div class="bl-menu-pop">' +
    menu.map((x) => '<button type="button" data-act="' + x[0] + '" data-id="' + t.id + '">' + x[1] + '</button>').join('') + '</div></details>' : '') + '</div>';
}

/** One delegated click handler for a whole panel. */
export function bindActions(ctx, root) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = el.dataset.id;
    const run = {
      view: () => ctx.openDetail(id), review: () => ctx.openDetail(id), submit: () => ctx.openDetail(id, { action: 'submit' }),
      approve: () => ctx.openApprove(id), release: () => ctx.openRelease(id), receive: () => ctx.openReceive(id),
      resolve: () => ctx.openDetail(id, { action: 'discrepancies' }), report: () => ctx.openDetail(id, { action: 'report' }),
      prepare: () => ctx.openDetail(id, { action: 'prepare' }), cancel: () => ctx.openDetail(id, { action: 'cancel' }),
      edit: () => ctx.openForm({ id }), revise: () => ctx.openRevise(id), return: () => ctx.openForm({ returnOf: id }),
      note: () => ctx.openNote(id), upload: () => ctx.openUpload(id), print: () => ctx.printTransfer(id),
    }[el.dataset.act];
    if (run) { e.preventDefault(); const menu = el.closest('details.bl-menu'); if (menu) menu.open = false; Promise.resolve(run()).catch((err) => ctx.toast(err, true)); }
  });
}

/** One transfer as a compact alert / list row: which transfer, the route, how much, why it needs attention, and the buttons. */
export function alertRow(ctx, t, { badges, note } = {}) {
  const why = t._attention.map((a) => '<span class="tf-why tf-why-' + a.tone + '">' + esc(a.text) + '</span>').join('');
  return '<div class="bl-alert-row" data-transfer="' + t.id + '"><div class="bl-alert-main">' +
    '<button type="button" class="bl-link" data-act="view" data-id="' + t.id + '">' + esc(t.transfer_number) + '</button> <span class="tf-routeline">' + routeText(ctx, t) + '</span>' +
    '<div class="muted">' + esc(t._skus + ' SKU' + (t._skus === 1 ? '' : 's')) + ' · ' + esc(pcs(t._pcs)) + (t._requester ? ' · requested by ' + esc(t._requester) : '') + '</div>' +
    '<div class="bl-alert-badges">' + (badges || (statusBadge(t.status) + (t.priority !== 'Normal' ? ' ' + priorityBadge(t.priority) : '') + ' ' + discBadge(t))) + '</div>' +
    (why ? '<div class="tf-whys">' + why + '</div>' : '') + (note ? '<div class="muted bl-sub">' + note + '</div>' : '') + '</div>' +
    '<div class="bl-alert-amt"><b>' + esc(pcs(t._pcs)) + '</b><span class="muted">' + esc(t._skus + ' SKU' + (t._skus === 1 ? '' : 's')) + '</span></div>' +
    '<div class="bl-alert-actions">' + actionButtons(ctx, t) + '</div></div>';
}
