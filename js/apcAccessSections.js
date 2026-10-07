// Access & Performance Control Center -- the pieces of the Access Control tab: the permission switches (by module, and the SENSITIVE ones on their own), the branch scope,
// the "do they still need this?" review, and applying a preset. Every switch is a real permission key; nothing here stores anything until the owner presses Save.
import { esc, badge, dialog, changeList, openDrawer, closeDrawer, toast, btn, guarded } from './apcCore.js?v=20261008b';
import { MODULES, MODULE_NOTE, ACTIONS, describeKey, SENSITIVE_ORDER, SENSITIVE_NOTE, LOCKED_KEYS, BRANCH_SCOPE_KEYS, REVIEW_GROUPS, keyState, actionFor, pendingToMatch } from './apcAccessModel.js?v=20261008b';

const yn = (b) => b ? 'YES' : 'NO';
const actionLabel = (id) => (ACTIONS.find((a) => a.id === id) || { label: id }).label;

/** One permission switch with where it comes from: Position Default / Current / Owner Override (spec 12 and 58). */
export function keyRow(emp, k, st) {
  const s = keyState(emp, k.key, st.pending), d = describeKey(k.key), locked = LOCKED_KEYS.includes(k.key);
  const ovTxt = s.override ? (s.override.granted ? 'Granted' : 'Taken away') + (s.override.by ? ' by ' + esc(s.override.by) : '') + (s.override.reason ? ' — ' + esc(s.override.reason) : '') : 'None';
  return '<div class="apc-key-row' + (d.sensitive ? ' apc-key-sens' : '') + (s.changed ? ' apc-key-changed' : '') + '">' +
    '<label class="apc-switch" title="' + esc(s.now ? 'On — click to switch off' : 'Off — click to switch on') + '"><input type="checkbox" data-key="' + esc(k.key) + '"' + (s.now ? ' checked' : '') + '><span class="apc-slider"></span></label>' +
    '<div class="apc-key-main"><div><b>' + esc(k.label) + '</b> <code>' + esc(k.key) + '</code>' + (locked ? ' ' + badge('OWNER ONLY', 'red') : '') + '</div>' +
    '<div class="apc-key-meta"><span class="apc-act">' + esc(actionLabel(d.action)) + '</span> <span>' + esc(s.label) + '</span> · Position default: <b>' + yn(s.def) + '</b> · Current: <b>' + yn(s.on) + '</b> · Owner override: ' + ovTxt +
    (s.changed ? ' · <span class="apc-unsaved">Unsaved → ' + yn(s.now) + '</span>' : '') + '</div></div></div>';
}

/** The module-by-module list: a row of View / Encode / Edit / Approve / Delete / Export marks per module, and the keys behind them. */
export function modulesHtml(emp, keys, st) {
  const by = {};
  keys.filter((k) => !describeKey(k.key).sensitive).forEach((k) => { const d = describeKey(k.key); (by[d.module] = by[d.module] || []).push(Object.assign({ action: d.action }, k)); });
  return MODULES.map((m) => {
    const list = (by[m] || []).sort((a, b) => ACTIONS.findIndex((x) => x.id === a.action) - ACTIONS.findIndex((x) => x.id === b.action) || a.label.localeCompare(b.label));
    const held = list.filter((k) => keyState(emp, k.key, st.pending).now).length;
    const marks = ACTIONS.map((a) => {
      const inAct = list.filter((k) => k.action === a.id); if (!inAct.length) return '<span class="apc-mark apc-mark-na" title="No ' + a.label + ' key for this module">' + esc(a.label) + ' —</span>';
      const on = inAct.some((k) => keyState(emp, k.key, st.pending).now);
      return '<span class="apc-mark ' + (on ? 'apc-mark-on' : 'apc-mark-off') + '" title="' + esc(inAct.map((k) => k.label).join(' · ')) + '">' + esc(a.label) + ' ' + (on ? '✓' : '✕') + '</span>';
    }).join('');
    const open = st.openMods && st.openMods.has(m) ? st.openMods.get(m) : (held > 0 || list.some((k) => st.pending.has(k.key)));
    return '<details class="exp exp-cat apc-mod" data-mod="' + esc(m) + '"' + (open ? ' open' : '') + '><summary><span class="exp-arrow" aria-hidden="true">▸</span><b>' + esc(m) + '</b> <span class="exp-count">(' + held + ' of ' + list.length + ' on)</span> <span class="apc-marks">' + marks + '</span></summary>' +
      '<div class="exp-body" style="padding:0;">' + (list.length ? list.map((k) => keyRow(emp, k, st)).join('') : '<p class="muted apc-pad">' + esc(MODULE_NOTE[m] || 'No individual permission keys — access follows the role rules (see the Task Checklist below).') + '</p>') + '</div></details>';
  }).join('');
}

/** The confidential ones, together, under the owner's names. */
export function sensitiveHtml(emp, keys, st) {
  const groups = {};
  keys.forEach((k) => { const s = describeKey(k.key).sensitive; if (s) (groups[s] = groups[s] || []).push(k); });
  return SENSITIVE_ORDER.map((g) => {
    const list = groups[g] || [];
    const held = list.filter((k) => keyState(emp, k.key, st.pending).now).length;
    return '<div class="apc-sens-group"><h4>' + badge('SENSITIVE ACCESS', 'red') + ' ' + esc(g) + ' <span class="muted">' + (list.length ? held + ' of ' + list.length + ' on' : '') + '</span></h4>' +
      (list.length ? list.map((k) => keyRow(emp, k, st)).join('') : '<p class="muted apc-pad">' + esc(SENSITIVE_NOTE[g] || 'No permission key.') + '</p>') + '</div>';
  }).join('');
}

/** Branch scope: all branches or selected ones, and the keys that reach across branches. */
export function branchHtml(emp, keys, st, branches) {
  const all = keyState(emp, 'branches.view_all', st.pending).now;
  const extra = new Set(emp.branch_access || []);
  const scopeKeys = keys.filter((k) => BRANCH_SCOPE_KEYS.includes(k.key));
  return '<p><b>Scope:</b> ' + (all ? badge('ALL BRANCHES', 'blue') : badge('SELECTED BRANCHES', 'gray')) + ' <span class="muted">Home branch: ' + esc((branches.find((b) => b.id === emp.branch_id) || {}).name || 'none') + '</span></p>' +
    scopeKeys.map((k) => keyRow(emp, k, st)).join('') +
    '<h4 class="apc-sub">Extra branches this person can open <span class="muted">(besides their home branch)</span></h4><div class="apc-branches">' +
    branches.map((b) => '<label class="apc-bcheck"><input type="checkbox" data-branch="' + b.id + '"' + (extra.has(b.id) ? ' checked' : '') + (b.id === emp.branch_id ? ' disabled title="Home branch"' : '') + '> ' + esc(b.name) + (b.id === emp.branch_id ? ' <span class="muted">(home)</span>' : '') + '</label>').join('') + '</div>' +
    btn('Save selected branches', 'id="branch-save"', 'secondary') + ' <span class="muted sd-small">Viewing other branches and receiving transfers elsewhere have switches above; there is no separate “edit other branches” permission yet.</span>';
}

export function wireBranchSave(el, A, emp) {
  const b = el.querySelector('#branch-save'); if (!b) return;
  b.addEventListener('click', () => guarded(b, async () => {
    const ids = [...el.querySelectorAll('[data-branch]:checked')].map((x) => Number(x.dataset.branch));
    await A.api.setBranchAccess(emp.id, ids); toast('Branch access saved for ' + emp.name + '.'); await A.reload('access');
  }));
}

// ---------------------------------------------------------------- the review: "does this person still need ...?"
export function openReview(A, emp, keys, st, onDone) {
  const label = Object.fromEntries(keys.map((k) => [k.key, k.label]));
  const decisions = {};
  const body = REVIEW_GROUPS.map((g) => {
    const held = g.keys.filter((k) => keyState(emp, k, st.pending).now);
    return '<div class="apc-review-q" data-g="' + g.id + '"><h4>' + esc(g.question) + '</h4>' +
      (held.length ? '<ul class="apc-plain">' + held.map((k) => '<li>' + esc(label[k] || k) + '</li>').join('') + '</ul>' : '<p class="muted">They hold none of this today.</p>') +
      (held.length ? '<div class="apc-review-btns" data-g="' + g.id + '"><button type="button" class="btn small secondary on" data-d="keep">KEEP</button><button type="button" class="btn small secondary" data-d="remove">REMOVE</button><button type="button" class="btn small secondary" data-d="change">CHANGE</button></div>' : '') + '</div>';
  }).join('');
  openDrawer({ wide: false, title: 'Review access — ' + emp.name, sub: 'Decide what to keep. REMOVE switches those off (you still press Save); CHANGE takes you to that module.', body,
    footer: '<button type="button" class="btn small" id="rv-done">Done</button> <button type="button" class="btn small secondary" id="rv-cancel">Cancel</button>' });
  const d = document.getElementById('sd-drawer-body');
  d.querySelectorAll('.apc-review-btns').forEach((row) => row.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    row.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('on', x === b)); decisions[row.dataset.g] = b.dataset.d;
  })));
  document.getElementById('rv-cancel').addEventListener('click', closeDrawer);
  document.getElementById('rv-done').addEventListener('click', () => {
    let removed = 0, jump = null;
    REVIEW_GROUPS.forEach((g) => {
      if (decisions[g.id] === 'remove') g.keys.forEach((k) => { if (LOCKED_KEYS.includes(k) || !keyState(emp, k, st.pending).now) return; const a = actionFor(emp, k, false); if (a) { st.pending.set(k, a); removed++; } });
      if (decisions[g.id] === 'change' && !jump) jump = g.module;
    });
    closeDrawer(); onDone(removed, jump);
  });
}

// ---------------------------------------------------------------- presets: show exactly what would change, never overwrite silently
export async function presetFlow(A, emp, keys, st, preset) {
  const label = Object.fromEntries(keys.map((k) => [k.key, k.label])), eff = new Set(emp.effective_keys);
  const toAdd = preset.keys.filter((k) => !eff.has(k) && label[k]);
  const first = await dialog({ title: 'Apply preset “' + preset.name + '” to ' + emp.name, confirmLabel: 'Show me the changes',
    bodyHtml: '<p>' + esc(preset.description || '') + '</p><p>This would <b>add ' + toAdd.length + '</b> permission' + (toAdd.length === 1 ? '' : 's') + ' they do not have now.</p>' +
      '<label class="apc-check"><input type="checkbox" data-field="replace"> Also switch off everything this preset does not include (make them match the preset exactly)</label>' });
  if (!first) return false;
  const next = pendingToMatch(emp, preset.keys, keys.map((k) => k.key), { onlyAdd: !first.replace });
  const rows = [...next].map(([k, a]) => ({ label: label[k] || k, from: yn(eff.has(k)), to: yn(a === 'grant' ? true : a === 'revoke' ? false : emp.default_keys.includes(k)), sensitive: !!describeKey(k).sensitive }));
  if (!rows.length) { toast('They already have everything in “' + preset.name + '”.'); return false; }
  const replaced = [...next.keys()].filter((k) => (emp.overrides || []).some((o) => o.key === k && o.active));
  const ok = await dialog({ title: 'Confirm: ' + preset.name + ' → ' + emp.name, confirmLabel: 'Stage ' + rows.length + ' change' + (rows.length === 1 ? '' : 's'),
    bodyHtml: (replaced.length ? '<p class="apc-notice"><b>' + replaced.length + ' custom setting' + (replaced.length === 1 ? '' : 's') + ' you set earlier will be replaced:</b> ' + esc(replaced.map((k) => label[k] || k).join(', ')) + '</p>' : '') +
      '<p>These are staged only — nothing is saved until you press <b>Save changes</b>.</p>' + changeList(rows.slice(0, 60)) + (rows.length > 60 ? '<p class="muted">… and ' + (rows.length - 60) + ' more.</p>' : '') });
  if (!ok) return false;
  next.forEach((a, k) => st.pending.set(k, a));
  return true;
}
