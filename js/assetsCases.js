// Assets & Supplies Custodian -- the formal processes that decide what happens to an asset: lost / missing / damaged reports (report,
// review, resolve), maintenance and repairs (open, move along, complete or declare unrepairable), and disposal (request, approve, mark
// disposed, archive). Nobody is ever charged automatically, nothing is auto-disposed and nothing is deleted: a disposed asset stays in the
// register with its whole history. Each panel opens in the side drawer; the database re-checks every rule.
import { esc, field, opts, dt, money, openDrawer, closeDrawer, drawerBody, friendly, errorsText, val, flowBadge } from './assetsUi.js?v=20261008a';
import { CONDITIONS, ISSUE_CONDITIONS, INCIDENT_TYPES, RECOMMENDED, REPAIR_TYPES, DISPOSAL_METHODS, OPEN_INCIDENT, repairCostFlag } from './assetsLogic.js?v=20261008a';
import { flagInvalid } from './uiKit.js?v=20261008a';

const $ = (id) => document.getElementById(id);
const errBox = (html) => { const b = $('ac-sd-errors'); if (b) b.innerHTML = html ? '<div class="msg error">' + html + '</div>' : ''; if (html && drawerBody('side')) drawerBody('side').scrollTop = 0; };
const gone = (ctx) => ctx.toast('That record is no longer available to you.', true);
const panel = (sub, title, body, footer) => openDrawer('side', { title, sub, body: '<div id="ac-side-msg"></div><div id="ac-sd-errors"></div>' + body, footer });
const subOf = (a) => a.asset_number + ' · ' + a.name + ' · ' + a.status;
const btns = (ok, okCls) => '<button type="button" class="btn' + (okCls ? ' ' + okCls : '') + '" id="ac-cs-ok">' + ok + '</button><button type="button" class="btn secondary" id="ac-cs-x">Close</button>';
/** Wires the footer buttons: `need()` returns a message when something is missing, `call()` makes the change. */
function wire(ctx, { need, call, done, after }) {
  $('ac-cs-x').addEventListener('click', () => closeDrawer('side'));
  $('ac-cs-ok').addEventListener('click', async () => {
    errBox(''); const btn = $('ac-cs-ok');
    const msg = need && need(); if (msg) { errBox(esc(msg)); return; }
    btn.disabled = true;
    try {
      const res = await call();
      if (res && res.ok === false) { errBox(esc(errorsText(res))); btn.disabled = false; return; }
      closeDrawer('side'); await ctx.afterChange(typeof done === 'function' ? done(res) : done);
      if (after) after(res);
    } catch (err) { errBox(esc(friendly(err))); btn.disabled = false; }
  });
}
const needText = (id, label, flag) => { if (val(id).trim().length < 3) { flagInvalid($(id)); return label; } return ''; };

// ================================================================ lost / missing / damaged
export function report(ctx, id, opts2 = {}) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!ctx.caps.canReportOn(a)) { ctx.toast(a._incident ? 'There is already an open report for this asset (' + a._incident.incident_number + ').' : ['Disposed', 'Archived', 'For Disposal'].includes(a.status) ? 'A ' + a.status.toLowerCase() + ' asset cannot be reported.' : a.status === 'Transferred' ? 'This asset is on its way to another branch — receive it first.' : 'You cannot report this asset.', true); return; }
  const first = opts2.type || 'Damaged';
  panel(subOf(a), 'Report Damaged / Lost / Missing',
    '<div class="bl-formgrid">' + field('What happened? *', '<select id="ac-rp-type">' + opts(INCIDENT_TYPES.map((t) => ({ value: t, label: t === 'Damaged' ? 'It is damaged' : t === 'Lost' ? 'It is lost' : 'It is missing' })), first) + '</select>') + field('When', '<input type="date" id="ac-rp-on" value="' + esc(ctx.today) + '" max="' + esc(ctx.today) + '">') + '</div>' +
    field('Describe it *', '<textarea id="ac-rp-desc" rows="3" maxlength="600" placeholder="What happened, where, who noticed"></textarea>') +
    '<div class="bl-formgrid" id="ac-rp-lost">' + field('Last known place', '<input type="text" id="ac-rp-loc" maxlength="120" placeholder="Where was it last seen?">') + field('Police / incident report no.', '<input type="text" id="ac-rp-ref" maxlength="80" placeholder="If one was made">') + '</div>' +
    '<div id="ac-rp-effect" class="lv-preview"></div><p class="muted">A custodian reviews every report. Nobody is charged automatically — any accountability decision is made by a manager and written down. You can attach photos on the asset card afterwards.</p>',
    btns('Send Report'));
  const sync = () => { const t = val('ac-rp-type'); $('ac-rp-lost').hidden = t === 'Damaged'; $('ac-rp-effect').innerHTML = '<b>What happens:</b> ' + (t === 'Damaged' ? 'it is marked <b>Damaged</b>; a custodian decides whether to repair, replace or review.' : 'it is marked <b>' + esc(t) + '</b> and cannot be assigned or transferred until the report is resolved (found, or written off by a manager).'); };
  $('ac-rp-type').addEventListener('change', sync); sync();
  wire(ctx, { need: () => needText('ac-rp-desc', 'Describe what happened.'), done: (r) => 'Report ' + r.incident_number + ' sent.',
    call: () => ctx.api.reportIncident(a.id, { incident_type: val('ac-rp-type'), incident_date: val('ac-rp-on') || null, description: val('ac-rp-desc').trim(), last_known_location: val('ac-rp-loc').trim() || null, reference_text: val('ac-rp-ref').trim() || null }) });
}
export function reviewIncident(ctx, incId) {
  const i = ctx.data.incidents.find((x) => x.id === incId), a = i && ctx.byId.get(i.asset_id);
  if (!i || !a) return gone(ctx);
  panel(subOf(a), 'Review Report ' + i.incident_number,
    '<p><b>' + esc(i.incident_type) + '</b> — ' + esc(i.description) + '<br><span class="muted">' + esc(ctx.names[i.reported_by] || '—') + ' · ' + esc(dt(i.incident_date)) + '</span></p>' +
    field('Findings', '<textarea id="ac-rv-find" rows="3" maxlength="600">' + esc(i.findings || '') + '</textarea>') + field('Recommended action', '<select id="ac-rv-rec">' + opts(RECOMMENDED, i.recommended_action || '', '—') + '</select>'), btns('Save Review'));
  wire(ctx, { need: () => (!val('ac-rv-find').trim() && !val('ac-rv-rec') ? 'Record your findings or a recommended action.' : ''), done: 'Review saved.',
    call: () => ctx.api.reviewIncident(i.id, { findings: val('ac-rv-find').trim() || null, recommended_action: val('ac-rv-rec') || null }) });
}
export function resolveIncident(ctx, incId) {
  const i = ctx.data.incidents.find((x) => x.id === incId), a = i && ctx.byId.get(i.asset_id), mgr = ctx.caps.mgr;
  if (!i || !a) return gone(ctx);
  if (!OPEN_INCIDENT.includes(i.status)) { ctx.toast('This report is already ' + i.status.toLowerCase() + '.', true); return; }
  const list = i.incident_type === 'Damaged' ? ['Repaired', 'No Action', ...(mgr ? ['Written Off', 'Replaced'] : [])] : ['Found', ...(mgr ? ['Written Off', 'Replaced'] : [])];
  const effect = { Found: 'The asset goes back to where it was (with its holder, or available). The history keeps both the report and the find.', Repaired: 'The asset is usable again — record its condition now.', 'No Action': 'The asset stays in service — record its condition now.',
    'Written Off': 'The asset is closed out as ' + (i.incident_type === 'Damaged' ? 'beyond repair' : 'lost') + '. If someone holds it, their assignment ends as “Written Off”. It stays in the register and can then be put forward for disposal.', Replaced: 'Same as written off — and it is understood that a replacement was bought (add it as a new asset).' };
  panel(subOf(a), 'Resolve Report ' + i.incident_number,
    '<p><b>' + esc(i.incident_type) + '</b> — ' + esc(i.description) + (i.findings ? '<br><span class="muted">Findings: ' + esc(i.findings) + '</span>' : '') + '</p>' +
    (OPEN_INCIDENT.includes(i.status) && ctx.data.repairs.some((r) => r.asset_id === a.id && ['Reported', 'For Inspection', 'Waiting for Approval', 'Under Repair', 'Waiting for Parts'].includes(r.status)) ? '<div class="msg lv-warn">There is an open repair on this asset — complete or cancel it first, or complete the repair (which resolves a damage report on its own).</div>' : '') +
    '<div class="bl-formgrid">' + field('How was it resolved? *', '<select id="ac-rs-kind">' + opts(list, list[0]) + '</select>') + field('Condition now', '<select id="ac-rs-cond">' + opts(ISSUE_CONDITIONS, ISSUE_CONDITIONS.includes(a.condition) ? a.condition : 'Good', '—') + '</select>', { id: 'ac-rs-cond-wrap' }) + '</div>' +
    '<div id="ac-rs-effect" class="lv-preview"></div>' + field('Resolution note *', '<textarea id="ac-rs-notes" rows="3" maxlength="600"></textarea>') +
    (mgr ? field('Accountability decision <span class="muted">(optional — written down by a manager; nothing is deducted or charged automatically)</span>', '<textarea id="ac-rs-dec" rows="2" maxlength="400" placeholder="e.g. Referred to HR for review"></textarea>') : '<p class="muted">Only an Admin or Manager can write an asset off or record an accountability decision.</p>'), btns('Resolve'));
  const sync = () => { const k = val('ac-rs-kind'); $('ac-rs-cond-wrap').hidden = !['Repaired', 'No Action'].includes(k); $('ac-rs-effect').innerHTML = '<b>What this does:</b> ' + esc(effect[k] || ''); };
  $('ac-rs-kind').addEventListener('change', sync); sync();
  wire(ctx, { need: () => (['Repaired', 'No Action'].includes(val('ac-rs-kind')) && !val('ac-rs-cond') ? 'Record the condition the asset is in now.' : needText('ac-rs-notes', 'Add a note about the resolution.')), done: 'Report resolved.',
    call: () => ctx.api.resolveIncident(i.id, { resolution: val('ac-rs-kind'), notes: val('ac-rs-notes').trim(), condition_after: val('ac-rs-cond') || null, accountability_decision: mgr ? val('ac-rs-dec').trim() || null : null }) });
}

// ================================================================ maintenance & repairs
const NEXT = { Reported: ['For Inspection', 'Waiting for Approval', 'Under Repair', 'Waiting for Parts', 'Unrepairable', 'Cancelled'], 'For Inspection': ['Waiting for Approval', 'Under Repair', 'Waiting for Parts', 'Unrepairable', 'Cancelled'],
  'Waiting for Approval': ['Under Repair', 'Unrepairable', 'Cancelled'], 'Under Repair': ['Waiting for Parts', 'Completed', 'Unrepairable'], 'Waiting for Parts': ['Under Repair', 'Completed', 'Unrepairable'] };
export function repairNew(ctx, id, opts2 = {}) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!ctx.caps.canSendRepair(a)) { ctx.toast(a._repair ? 'This asset already has an open repair (' + a._repair.repair_number + ').' : 'A ' + a.status.toLowerCase() + ' asset cannot be sent for repair.', true); return; }
  const type = opts2.type || (a.status === 'Damaged' || a._incident ? 'Repair' : 'Repair');
  panel(subOf(a), 'Send for Repair / Maintenance',
    '<div class="bl-formgrid">' + field('Type *', '<select id="ac-rn-type">' + opts(REPAIR_TYPES, type) + '</select>') + field('Condition before', '<select id="ac-rn-cond">' + opts(CONDITIONS, a.condition) + '</select>') + '</div>' +
    field('Problem / work to be done *', '<textarea id="ac-rn-issue" rows="3" maxlength="500"' + (a._incident ? '' : '') + '>' + (a._incident && a._incident.incident_type === 'Damaged' ? esc(a._incident.description) : '') + '</textarea>') +
    '<div class="bl-formgrid">' + field('Service provider', '<input type="text" id="ac-rn-prov" maxlength="100" placeholder="Shop or technician">') + field('Expected back', '<input type="date" id="ac-rn-exp" min="' + esc(ctx.today) + '">') +
    (ctx.caps.viewCost ? field('Repair cost (₱) <span class="muted">estimate or actual</span>', '<input type="number" id="ac-rn-cost" min="0" step="0.01">') : '') + field('Next service in (days)', '<input type="number" id="ac-rn-next" min="1" step="1" placeholder="For maintenance: how often">', { id: 'ac-rn-next-wrap' }) + '</div>' +
    '<label class="lv-check"><input type="checkbox" id="ac-rn-send" checked> It is leaving for the repair / maintenance now (marks the asset <b>Under Repair</b> / <b>Under Maintenance</b>)</label>' + field('Notes', '<input type="text" id="ac-rn-notes" maxlength="200">') +
    (a._asg ? '<p class="muted">It stays on ' + esc(a._holder || a._where) + '’s record while it is away — the assignment does not end.</p>' : ''), btns('Save'));
  const sync = () => { $('ac-rn-next-wrap').hidden = !['Preventive Maintenance', 'Inspection'].includes(val('ac-rn-type')); }; $('ac-rn-type').addEventListener('change', sync); sync();
  wire(ctx, { need: () => needText('ac-rn-issue', 'Describe the problem or the work to be done.'), done: (r) => 'Repair ' + r.repair_number + ' recorded.',
    call: () => ctx.api.createRepair(a.id, { repair_type: val('ac-rn-type'), condition_before: val('ac-rn-cond'), issue: val('ac-rn-issue').trim(), service_provider: val('ac-rn-prov').trim() || null, expected_completion: val('ac-rn-exp') || null,
      repair_cost: ctx.caps.viewCost && val('ac-rn-cost') !== '' ? Number(val('ac-rn-cost')) : null, next_due_days: val('ac-rn-next') ? Number(val('ac-rn-next')) : null, send_now: $('ac-rn-send').checked, notes: val('ac-rn-notes').trim() || null }) });
}
export function repairUpdate(ctx, repId) {
  const r = ctx.data.repairs.find((x) => x.id === repId), a = r && ctx.byId.get(r.asset_id);
  if (!r || !a) return gone(ctx);
  const next = NEXT[r.status] || [], closed = !next.length, cost = (ctx.data.repairCosts.find((x) => x.repair_id === r.id) || {}).repair_cost;
  const flag = ctx.caps.viewCost ? repairCostFlag(ctx, a) : null;
  panel(subOf(a), 'Repair ' + r.repair_number,
    '<div class="drawer-section"><p>' + flowBadge(r.status) + ' <b>' + esc(r.repair_type) + '</b> — ' + esc(r.issue) + '<br><span class="muted">Reported ' + esc(dt(String(r.reported_at).slice(0, 10))) + (r.sent_at ? ' · sent ' + esc(dt(String(r.sent_at).slice(0, 10))) : '') + (r.expected_completion ? ' · expected ' + esc(dt(r.expected_completion)) : '') + (r.service_provider ? ' · ' + esc(r.service_provider) : '') + (cost !== undefined ? ' · cost ' + esc(money(cost)) : '') + '</span></p>' +
      (flag ? '<div class="msg lv-warn"><b>High repair cost:</b> repairs on this asset total ' + esc(money(a._repairCost)) + ' (about ' + flag.pct + '% of its value). Information only — consider whether another repair is worth it.</div>' : '') + '</div>' +
    (closed ? '<p class="muted">This repair is ' + esc(r.status.toLowerCase()) + ' and can no longer change.' + (r.resolution ? ' <b>Outcome:</b> ' + esc(r.resolution) : '') + '</p>' :
      '<div class="bl-formgrid">' + field('Move to', '<select id="ac-ru-status">' + opts(next, '', 'Stay ' + r.status) + '</select>') + field('Condition after', '<select id="ac-ru-cond">' + opts(CONDITIONS.filter((x) => !['Damaged', 'Unserviceable'].includes(x)), 'Good', '—') + '</select>', { id: 'ac-ru-cond-wrap', hidden: true }) +
      field('Service provider', '<input type="text" id="ac-ru-prov" maxlength="100" value="' + esc(r.service_provider || '') + '">') + field('Expected back', '<input type="date" id="ac-ru-exp" value="' + esc(r.expected_completion || '') + '">') +
      (ctx.caps.viewCost ? field('Repair cost (₱)', '<input type="number" id="ac-ru-cost" min="0" step="0.01" value="' + esc(cost ?? '') + '">') : '') + field('Next service in (days)', '<input type="number" id="ac-ru-next" min="1" step="1" value="' + esc(r.next_due_days || '') + '">', { id: 'ac-ru-next-wrap', hidden: true }) + '</div>' +
      '<div id="ac-ru-effect" class="lv-preview"></div>' + field('Outcome / what was done', '<input type="text" id="ac-ru-res" maxlength="300">', { id: 'ac-ru-res-wrap', hidden: true }) + field('Note <span id="ac-ru-note-req" class="muted">(optional)</span>', '<textarea id="ac-ru-notes" rows="2" maxlength="400"></textarea>')),
    closed ? '<button type="button" class="btn secondary" id="ac-cs-x">Close</button>' : btns('Save'));
  if (closed) { $('ac-cs-x').addEventListener('click', () => closeDrawer('side')); return; }
  const effect = { Completed: 'The asset is usable again (back with its holder, or available) with the condition you record. A damage report on it is resolved as “Repaired”, and the next maintenance date is set.', Unrepairable: 'The asset is marked Damaged / Unserviceable and the repair is closed — then decide whether to write it off or dispose of it.', Cancelled: 'The repair is closed and the asset goes back to where it was.' };
  const sync = () => { const s = val('ac-ru-status'); $('ac-ru-cond-wrap').hidden = s !== 'Completed'; $('ac-ru-res-wrap').hidden = !['Completed', 'Unrepairable'].includes(s); $('ac-ru-next-wrap').hidden = !(s === 'Completed' && ['Preventive Maintenance', 'Inspection', 'Repair', 'Warranty Claim', 'Upgrade'].includes(r.repair_type));
    $('ac-ru-effect').innerHTML = effect[s] ? '<b>What this does:</b> ' + esc(effect[s]) : ''; $('ac-ru-note-req').textContent = ['Unrepairable', 'Cancelled'].includes(s) ? '(required)' : '(optional)'; };
  $('ac-ru-status').addEventListener('change', sync); sync();
  wire(ctx, { need: () => (['Unrepairable', 'Cancelled'].includes(val('ac-ru-status')) ? needText('ac-ru-notes', 'Add a note explaining why.') : ''), done: 'Repair updated.',
    call: () => ctx.api.updateRepair(r.id, { status: val('ac-ru-status') || null, condition_after: val('ac-ru-status') === 'Completed' ? val('ac-ru-cond') : null, service_provider: val('ac-ru-prov').trim(), expected_completion: val('ac-ru-exp') || null,
      repair_cost: ctx.caps.viewCost && val('ac-ru-cost') !== '' ? Number(val('ac-ru-cost')) : null, next_due_days: val('ac-ru-next') ? Number(val('ac-ru-next')) : null, resolution: val('ac-ru-res').trim() || null, notes: val('ac-ru-notes').trim() || null }) });
}

// ================================================================ disposal
export function disposalRequest(ctx, id) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  if (!ctx.caps.canRequestDisposal(a)) { ctx.toast(a._asg ? 'This asset is still assigned. Return it — or settle the report — before disposing of it.' : a._repair ? 'Complete or cancel the open repair first.' : a._incident && a._incident.incident_type !== 'Damaged' ? 'Resolve the open lost / missing report first.' : 'An asset that is ' + a.status + ' cannot be put forward for disposal.', true); return; }
  panel(subOf(a), 'Request Disposal',
    '<p>Disposal is <b>request → approval by another manager → marked disposed</b>. The asset is never deleted: after disposal it stays in the register with its whole history.</p>' + field('Why should it be disposed of? *', '<textarea id="ac-dq-reason" rows="3" maxlength="400" placeholder="e.g. beyond repair, replaced, obsolete"></textarea>') +
    field('Recommendation', '<input type="text" id="ac-dq-rec" maxlength="200" placeholder="e.g. sell as scrap, donate">') + field('Notes', '<input type="text" id="ac-dq-notes" maxlength="200">'), btns('Request Disposal'));
  wire(ctx, { need: () => needText('ac-dq-reason', 'Say why the asset should be disposed of.'), done: (r) => 'Disposal ' + r.disposal_number + ' requested — another manager must approve it.',
    call: () => ctx.api.requestDisposal(a.id, { reason: val('ac-dq-reason').trim(), recommendation: val('ac-dq-rec').trim() || null, notes: val('ac-dq-notes').trim() || null }) });
}
export function disposalAction(ctx, disId, action) {
  const d = ctx.data.disposals.find((x) => x.id === disId), a = d && ctx.byId.get(d.asset_id);
  if (!d || !a) return gone(ctx);
  const head = '<p>' + flowBadge(d.status) + ' <b>' + esc(d.disposal_number) + '</b> — ' + esc(d.reason) + '<br><span class="muted">Requested by ' + esc(ctx.names[d.requested_by] || '—') + (d.recommendation ? ' · recommended: ' + esc(d.recommendation) : '') + '</span></p>';
  if (action === 'approve') {
    panel(subOf(a), 'Approve Disposal', head + '<p class="muted">The asset is then ready to be marked disposed. You cannot approve a disposal you asked for yourself.</p>' + field('Note (optional)', '<input type="text" id="ac-dp-note" maxlength="200">'), btns('Approve'));
    wire(ctx, { call: () => ctx.api.approveDisposal(d.id, val('ac-dp-note').trim()), done: 'Disposal approved.' });
  } else if (action === 'reject' || action === 'cancel') {
    panel(subOf(a), action === 'reject' ? 'Reject Disposal' : 'Cancel Disposal', head + field('Reason *', '<textarea id="ac-dp-reason" rows="2" maxlength="300"></textarea>') + '<p class="muted">The asset goes back to the status it had before. The request is kept in the history.</p>', btns(action === 'reject' ? 'Reject' : 'Cancel Disposal', 'lv-btn-danger'));
    wire(ctx, { need: () => needText('ac-dp-reason', 'A reason is required.'), call: () => (action === 'reject' ? ctx.api.rejectDisposal(d.id, val('ac-dp-reason').trim()) : ctx.api.cancelDisposal(d.id, val('ac-dp-reason').trim())), done: action === 'reject' ? 'Disposal rejected.' : 'Disposal cancelled.' });
  } else {
    panel(subOf(a), 'Mark as Disposed', head + '<div class="msg lv-warn"><b>This closes the asset.</b> It is marked <b>Disposed</b> and can never be assigned again — but the record and its history stay.</div>' +
      '<div class="bl-formgrid">' + field('How was it disposed of? *', '<select id="ac-dp-method">' + opts(DISPOSAL_METHODS, '', 'Choose…') + '</select>') + field('Date', '<input type="date" id="ac-dp-on" value="' + esc(ctx.today) + '" max="' + esc(ctx.today) + '">') + '</div>' + field('Notes', '<input type="text" id="ac-dp-notes" maxlength="200" placeholder="Buyer, recipient, reference…">'), btns('Mark as Disposed'));
    wire(ctx, { need: () => (!val('ac-dp-method') ? 'Choose how the asset was disposed of.' : ''), call: () => ctx.api.completeDisposal(d.id, { disposal_method: val('ac-dp-method'), disposal_date: val('ac-dp-on') || null, notes: val('ac-dp-notes').trim() || null }), done: a.asset_number + ' marked disposed.' });
  }
}
export function archive(ctx, id) {
  const a = ctx.byId.get(id);
  if (!a) return gone(ctx);
  panel(subOf(a), 'Archive Asset', '<p>Archiving moves a disposed asset out of the working lists. Nothing is deleted — it stays in “Everything” and in every report and history.</p>' + field('Why? *', '<input type="text" id="ac-ar-reason" maxlength="200" placeholder="e.g. year-end clean-up">'), btns('Archive'));
  wire(ctx, { need: () => needText('ac-ar-reason', 'Say why it is being archived.'), call: () => ctx.api.archiveAsset(a.id, val('ac-ar-reason').trim()), done: a.asset_number + ' archived.' });
}
