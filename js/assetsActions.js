// Assets & Supplies Custodian -- the quick-action buttons that appear on every asset list (the Assets table, branch view, dashboard rows,
// "My Assets") and the one click handler that runs them. Which buttons a person sees follows their permissions and the asset's state;
// the database re-checks every one of them when it is pressed.

const btn = (act, id, label, cls) => '<button type="button" class="btn small' + (cls ? ' ' + cls : '') + '" data-act="' + act + '" data-id="' + id + '">' + label + '</button>';

/** The "⋯" menu entries for one asset. */
export function menuItems(ctx, a) {
  const c = ctx.caps, m = [];
  if (c.canEditAsset(a)) m.push(['edit', 'Edit details']);
  if (c.canAssignAsset(a)) m.push(['assign', 'Assign…']);
  if (c.canReturnAsset(a)) m.push(['return', 'Receive return…']);
  if (c.canCallBack(a)) m.push(['callback', 'Ask for return…']);
  if (c.canTransferEmployee(a)) m.push(['transferemp', 'Transfer to another employee…']);
  if (c.canBranchTransfer(a)) m.push(['branchtransfer', 'Move to another branch…']);
  if (c.canSendRepair(a)) m.push(['repair', 'Send for repair / maintenance…']);
  if (c.canReportOn(a)) m.push(['report', 'Report damaged / lost / missing…']);
  if (c.canCondition(a)) m.push(['condition', 'Change condition…']);
  if (c.canRequestDisposal(a)) m.push(['dispose', 'Request disposal…']);
  if (c.canAttach(a)) m.push(['upload', 'Attach a photo or file']);
  if (c.viewAssets) m.push(['tag', 'Print asset tag / QR']);
  return m;
}

/** Buttons for one asset: the main step it is waiting for, then "⋯" for the rest. */
export function actionButtons(ctx, a, { view = true } = {}) {
  const c = ctx.caps;
  let h = '';
  if (view) h += btn('view', a.id, 'View', 'secondary');
  if (c.canAcknowledge(a)) h += btn('ack', a.id, 'I received this');
  else if (c.canAssignAsset(a)) h += btn('assign', a.id, 'Assign');
  else if (c.canReturnAsset(a)) h += btn('return', a.id, 'Receive return');
  const menu = menuItems(ctx, a);
  return '<div class="bl-rowact">' + h + (menu.length ? '<details class="bl-menu"><summary class="btn small secondary" aria-label="More actions">⋯</summary><div class="bl-menu-pop">' +
    menu.map((x) => '<button type="button" data-act="' + x[0] + '" data-id="' + a.id + '">' + x[1] + '</button>').join('') + '</div></details>' : '') + '</div>';
}

/** One delegated click handler for a whole panel. */
export function bindActions(ctx, root) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !el.dataset.id) return;
    const id = Number(el.dataset.id), a = ctx.byId.get(id);
    const run = {
      view: () => ctx.openAsset(id), edit: () => ctx.openForm({ id }), assign: () => ctx.work.assignAsset(id), return: () => ctx.work.returnAsset(id), callback: () => ctx.work.callBack(id),
      transferemp: () => ctx.work.transferEmployee(id), branchtransfer: () => ctx.work.branchTransfer(id), repair: () => ctx.cases.repairNew(id), report: () => ctx.cases.report(id),
      condition: () => ctx.work.condition(id), dispose: () => ctx.cases.disposalRequest(id), upload: () => ctx.work.uploadFile(id), tag: () => ctx.print.tags([id]),
      ack: () => (a && a._asg ? ctx.work.acknowledge(a._asg.id, id) : ctx.openAsset(id)),
    }[el.dataset.act];
    if (run) { e.preventDefault(); const menu = el.closest('details.bl-menu'); if (menu) menu.open = false; Promise.resolve(run()).catch((err) => ctx.toast(err, true)); }
  });
}
