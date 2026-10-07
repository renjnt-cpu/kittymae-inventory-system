// Bills Management -- the Recurring tab: every repeating bill is driven by a template (name, amount, branch,
// schedule). From here you can see what is coming and what has fallen behind, generate a bill by hand, edit,
// pause or archive a template. Automatic generation is OFF for every template until someone turns it on.
import { esc, money, fmtDate, tagBadge, kpiCard, openDrawer, closeDrawer, drawerBody, confirmSide, friendly, errorsText, plural, prioBadge } from './billsUi.js?v=20261008a';
import { recurringSummary, frequencyText, nextGenerationDate, daysBetween, FREQUENCIES, PRIORITIES, REMINDER_CHOICES, matchesScope } from './billsLogic.js?v=20261008a';
import { flagInvalid } from './uiKit.js?v=20261008a';

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) ? $(id).value : '');
const field = (label, inner, extra) => '<div class="field"' + (extra && extra.id ? ' id="' + extra.id + '"' : '') + (extra && extra.hidden ? ' hidden' : '') + '><label>' + label + '</label>' + inner + '</div>';
const state = (t) => t.archived_at ? 'Archived' : t.active ? 'Active' : 'Paused';
const stateBadge = (t) => t.archived_at ? tagBadge('Archived', 'bl-tag-gray') : t.active ? tagBadge('Active', 'bl-tag-green') : tagBadge('Paused', 'bl-tag-yellow');

function templateRow(ctx, t) {
  const cat = (ctx.catById[t.category_id] || {}).name || '—';
  const br = t.branch_id ? (ctx.branchById[t.branch_id] || {}).name || '—' : 'No branch';
  const days = t.next_due_date ? daysBetween(ctx.today, t.next_due_date) : null;
  const gen = nextGenerationDate(t);
  const w = ctx.canWrite && !t.archived_at;
  return '<tr><td data-label="Template" class="full-row"><b>' + esc(t.name) + '</b><div class="muted bl-sub">' + esc(cat) + ' · ' + esc(br) + '</div></td>' +
    '<td data-label="Repeats">' + esc(frequencyText(t)) + '</td><td data-label="Default amount">' + money(t.default_amount) + '</td>' +
    '<td data-label="Next due">' + esc(t.next_due_date ? fmtDate(t.next_due_date) : '—') + (days !== null && t.active && !t.archived_at ? '<div class="muted bl-sub">' + (days < 0 ? '<span class="lv-neg">' + plural(-days, 'day') + ' behind</span>' : days === 0 ? 'today' : 'in ' + plural(days, 'day')) + '</div>' : '') + '</td>' +
    '<td data-label="Next generation">' + esc(gen ? fmtDate(gen) : '—') + '</td>' +
    '<td data-label="Auto-generate">' + (t.auto_generate ? tagBadge('On', 'bl-tag-green') + '<div class="muted bl-sub">' + t.generate_days_before + ' days before</div>' : tagBadge('Off', 'bl-tag-gray')) + '</td>' +
    '<td data-label="Status">' + stateBadge(t) + '</td>' +
    '<td data-label="" class="full-row"><div class="bl-rowact">' +
      (w && t.active ? '<button type="button" class="btn small" data-act="gen" data-id="' + t.id + '">Generate' + (t.next_due_date ? ' (' + esc(fmtDate(t.next_due_date).replace(/, \d{4}$/, '')) + ')' : '') + '</button>' : '') +
      (w ? '<button type="button" class="btn small secondary" data-act="edit" data-id="' + t.id + '">Edit Template</button>' +
        '<button type="button" class="btn small secondary" data-act="toggle" data-id="' + t.id + '">' + (t.active ? 'Pause' : 'Resume') + '</button>' +
        '<button type="button" class="btn small secondary" data-act="archive" data-id="' + t.id + '">Archive</button>' : '') +
      (ctx.canWrite && t.archived_at ? '<button type="button" class="btn small secondary" data-act="unarchive" data-id="' + t.id + '">Restore</button>' : '') + '</div></td></tr>';
}
const tableHtml = (ctx, list, empty) => list.length ? '<div class="table-scroll table-2col"><table class="bl-table"><thead><tr><th>Template</th><th>Repeats</th><th>Default amount</th><th>Next due</th><th>Next generation</th><th>Auto-generate</th><th>Status</th><th></th></tr></thead><tbody>' + list.map((t) => templateRow(ctx, t)).join('') + '</tbody></table></div>' : '<p class="muted">' + esc(empty) + '</p>';

export function renderRecurring(ctx, panel) {
  const f = ctx.filters;
  const scoped = ctx.data.templates.filter((t) => matchesScope({ branch_id: t.branch_id, category_id: t.category_id }, f));
  const s = recurringSummary(scoped, ctx.today);
  const showArchived = !!ctx.ui.showArchivedTemplates;
  const live = scoped.filter((t) => !t.archived_at).sort((a, b) => String(a.next_due_date || '9').localeCompare(String(b.next_due_date || '9')));
  const archived = scoped.filter((t) => t.archived_at);
  panel.innerHTML = '<div id="bl-rec">' +
    '<div class="card bl-filterbar"><div class="bl-filters">' +
      '<div class="field"><label>Branch</label><select data-flt="branch"><option value="">All branches</option><option value="none"' + (f.branch === 'none' ? ' selected' : '') + '>No branch</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (String(f.branch) === String(b.id) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Category</label><select data-flt="category"><option value="">All categories</option>' + ctx.cats.map((c) => '<option value="' + c.id + '"' + (String(f.category) === String(c.id) ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' +
      (ctx.canWrite ? '<div class="field"><label>&nbsp;</label><button type="button" class="btn small" data-act="new">+ New recurring template</button></div>' : '') + '</div></div>' +
    '<div class="bl-kpis">' +
      kpiCard({ label: 'Active templates', value: s.active, sub: s.total + ' in total', tone: 'blue' }) +
      kpiCard({ label: 'Coming up', value: s.upcoming.length, sub: 'next 45 days', tone: 'blue' }) +
      kpiCard({ label: 'Behind schedule', value: s.missed.length, sub: 'due date passed, no expense made', tone: s.missed.length ? 'red' : 'green' }) +
      kpiCard({ label: 'Paused', value: s.paused, sub: 'not generating', tone: s.paused ? 'yellow' : 'gray' }) +
      kpiCard({ label: 'Auto-generate on', value: s.auto, sub: 'of ' + s.active + ' active', tone: 'gray' }) + '</div>' +
    (s.missed.length ? '<div class="card bl-panel"><h3 class="bl-h" style="color:var(--warn)">Behind schedule</h3><p class="muted">These series should already have an expense for the date shown. Generate it (or pause the template if the expense no longer repeats).</p>' + tableHtml(ctx, s.missed, '') + '</div>' : '') +
    '<div class="card bl-panel"><h3 class="bl-h">Coming up</h3>' + tableHtml(ctx, s.upcoming, 'Nothing is scheduled in the next 45 days.') + '</div>' +
    '<div class="card bl-panel"><h3 class="bl-h">All templates <span class="muted">(' + live.length + ')</span></h3>' + tableHtml(ctx, live, 'No recurring templates yet. Add an expense and tick “This expense repeats”, or create a template here.') +
      (archived.length ? '<p><button type="button" class="act-link" data-act="toggle-archived">' + (showArchived ? 'Hide' : 'Show') + ' ' + archived.length + ' archived</button></p>' + (showArchived ? tableHtml(ctx, archived, '') : '') : '') + '</div>' +
    '<div class="msg lv-warn">Expenses are created in <b>this</b> list by the template; they are never created silently unless “Create each next expense automatically” is on for that template. When it is on, the nightly job (just after midnight, Manila time) creates the expense a set number of days before it is due and notifies everyone who handles expenses.</div></div>';

  const root = $('bl-rec');
  root.querySelectorAll('[data-flt]').forEach((el) => el.addEventListener('change', () => { ctx.filters[el.dataset.flt] = el.value; ctx.rerender(); }));
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = Number(el.dataset.id);
    const t = ctx.data.templates.find((x) => x.id === id);
    const run = {
      new: () => openTemplateForm(ctx, null),
      edit: () => openTemplateForm(ctx, id),
      'toggle-archived': () => { ctx.ui.showArchivedTemplates = !ctx.ui.showArchivedTemplates; ctx.rerender(); },
      gen: async () => {
        const res = await ctx.api.generateFromTemplate(id); if (res && res.ok === false) throw new Error(errorsText(res));
        ctx.toast('Created the expense due ' + fmtDate(res.due_date) + '.'); await ctx.refresh(); ctx.openDetail(res.id);
      },
      toggle: async () => {
        const res = await ctx.api.setTemplateActive(id, !t.active); if (res && res.ok === false) throw new Error(errorsText(res));
        ctx.toast(t.active ? 'Template paused — it will not generate until you resume it.' : 'Template resumed.'); await ctx.refresh();
      },
      archive: () => confirmSide({ drawerTitle: 'Archive template', sub: t.name, title: 'Archive this template?', message: 'It stops generating expenses and leaves the active list. Expenses it already created are not changed. You can restore it later.', okLabel: 'Archive',
        onOk: async () => { const res = await ctx.api.archiveTemplate(id, true); if (res && res.ok === false) throw new Error(errorsText(res)); closeDrawer('side'); ctx.toast('Template archived.'); await ctx.refresh(); } }),
      unarchive: async () => { const res = await ctx.api.archiveTemplate(id, false); if (res && res.ok === false) throw new Error(errorsText(res)); ctx.toast('Template restored.'); await ctx.refresh(); },
    }[el.dataset.act];
    if (run) { e.preventDefault(); Promise.resolve(run()).catch((err) => ctx.toast(err, true)); }
  });
}

// ================================================================ template form
export function openTemplateForm(ctx, id) {
  if (!ctx.canWrite) { ctx.toast('Only Finance or Admin can change recurring templates.', true); return; }
  const t = id ? ctx.data.templates.find((x) => x.id === Number(id)) : null;
  if (id && !t) { ctx.toast('That template is no longer available.', true); return; }
  const rem = t ? (t.reminder_days || []) : [7, 3, 1];
  const remChoices = [...new Set([...REMINDER_CHOICES, ...rem])].sort((a, b) => b - a);
  const catOpts = '<option value="">Choose a category…</option>' + ctx.cats.filter((c) => c.active || (t && c.id === t.category_id)).map((c) => '<option value="' + c.id + '"' + (t && t.category_id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
  const brOpts = '<option value="">No branch / company-wide</option>' + ctx.branches.map((b) => '<option value="' + b.id + '"' + (t && t.branch_id === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
  const prioNow = t && t.priority_source === 'manual' ? t.priority : 'auto';
  openDrawer('side', {
    title: t ? 'Edit Recurring Template' : 'New Recurring Template', sub: t ? t.name : 'The expense that repeats',
    body: '<div id="bl-side-msg"></div><div id="bt-errors"></div><div class="bl-formgrid">' +
      field('Template name *', '<input type="text" id="bt-name" maxlength="120" value="' + esc(t ? t.name : '') + '" placeholder="e.g. Meralco — Pacific Mall">') +
      field('Category *', '<select id="bt-cat">' + catOpts + '</select>') + field('Branch', '<select id="bt-branch">' + brOpts + '</select>') +
      field('Provider / supplier', '<input type="text" id="bt-prov" maxlength="120" value="' + esc(t ? t.provider_name || '' : '') + '">') +
      field('Account name', '<input type="text" id="bt-acn" maxlength="120" value="' + esc(t ? t.account_name || '' : '') + '">') +
      field('Account number', '<input type="text" id="bt-acc" maxlength="80" value="' + esc(t ? t.account_number || '' : '') + '">') +
      field('Usual amount (PHP)', '<input type="number" id="bt-amt" step="0.01" min="0" inputmode="decimal" value="' + (t && t.default_amount !== null ? t.default_amount : '') + '"><span class="muted">Each new expense starts with this; change it when the real invoice arrives.</span>') +
      field('Next expense due on *', '<input type="date" id="bt-next" value="' + esc(t ? t.next_due_date || '' : '') + '"><span class="muted">The day of the month stays the same (an expense due on the 31st is due on the last day of shorter months).</span>') +
      field('Repeats *', '<select id="bt-freq">' + FREQUENCIES.map((x) => '<option' + (t && t.frequency === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>') +
      field('Every', '<div class="bl-inline"><input type="number" id="bt-int" min="1" max="366" value="' + (t ? t.interval_count : 1) + '" style="width:80px"><select id="bt-unit">' + ['day', 'week', 'month', 'year'].map((u) => '<option value="' + u + '"' + ((t ? t.interval_unit : 'month') === u ? ' selected' : '') + '>' + u + 's</option>').join('') + '</select></div>', { id: 'bt-custom', hidden: true }) +
      field('How it is paid', '<select id="bt-pay"><option value="Manual"' + (!t || t.payment_type !== 'Auto-Debit' ? ' selected' : '') + '>Paid by hand</option><option value="Auto-Debit"' + (t && t.payment_type === 'Auto-Debit' ? ' selected' : '') + '>Auto-debited</option></select>') +
      field('Priority', '<select id="bt-prio"><option value="auto"' + (prioNow === 'auto' ? ' selected' : '') + '>Automatic</option>' + PRIORITIES.map((p) => '<option' + (prioNow === p ? ' selected' : '') + '>' + p + '</option>').join('') + '</select>') +
      field('Remind before the due date', '<div class="bl-checks">' + remChoices.map((d) => '<label class="bl-chk"><input type="checkbox" name="bt-rem" value="' + d + '"' + (rem.includes(d) ? ' checked' : '') + '> ' + d + (d === 1 ? ' day' : ' days') + '</label>').join('') + '</div>') +
    '</div>' +
    '<div class="drawer-section"><h4>Automatic generation</h4><label class="lv-check"><input type="checkbox" id="bt-auto"' + (t && t.auto_generate ? ' checked' : '') + '> Create each next expense automatically</label>' +
      '<div class="field" id="bt-gen-wrap"' + (t && t.auto_generate ? '' : ' hidden') + '><label>Create it this many days before it is due</label><input type="number" id="bt-gen" min="0" max="90" value="' + (t ? t.generate_days_before : 10) + '" style="width:100px"></div>' +
      '<p class="muted">Off by default. When on, the expense appears by itself and everyone who handles expenses is notified. Turning it on for a template that is already behind schedule creates up to three catch-up expenses at the next nightly run.</p></div>' +
    field('Note added to every generated expense', '<textarea id="bt-notes" rows="2" maxlength="500">' + esc(t ? t.notes_template || '' : '') + '</textarea>'),
    footer: '<button type="button" class="btn" id="bt-save">' + (t ? 'Save Template' : 'Create Template') + '</button><button type="button" class="btn secondary" id="bt-cancel">Cancel</button>',
  });
  const sync = () => { $('bt-custom').hidden = val('bt-freq') !== 'Custom'; $('bt-gen-wrap').hidden = !$('bt-auto').checked; };
  $('bt-freq').addEventListener('change', sync); $('bt-auto').addEventListener('change', sync); sync();
  $('bt-cancel').addEventListener('click', () => closeDrawer('side'));
  $('bt-save').addEventListener('click', async () => {
    const p = {
      name: val('bt-name').trim(), category_id: val('bt-cat') || null, branch_id: val('bt-branch') || null, provider_name: val('bt-prov').trim(), account_name: val('bt-acn').trim(), account_number: val('bt-acc').trim(),
      default_amount: val('bt-amt') === '' ? null : Number(val('bt-amt')), next_due_date: val('bt-next') || null, frequency: val('bt-freq'), payment_type: val('bt-pay'), priority: val('bt-prio'),
      reminder_days: [...document.querySelectorAll('input[name="bt-rem"]:checked')].map((x) => Number(x.value)), auto_generate: $('bt-auto').checked, generate_days_before: Number(val('bt-gen') || 10), notes_template: val('bt-notes').trim(),
    };
    if (p.frequency === 'Custom') { p.interval_count = Number(val('bt-int') || 1); p.interval_unit = val('bt-unit'); }
    const bad = [];
    if (!p.name) bad.push(['bt-name', 'Give the template a name.']);
    if (!p.category_id) bad.push(['bt-cat', 'Choose a category.']);
    if (!p.next_due_date) bad.push(['bt-next', 'Enter when the next expense is due.']);
    if (bad.length) { $('bt-errors').innerHTML = '<div class="msg error">' + bad.map((x) => esc(x[1])).join('<br>') + '</div>'; flagInvalid($(bad[0][0])); return; }
    const btn = $('bt-save'); btn.disabled = true; $('bt-errors').innerHTML = '';
    try {
      const res = await ctx.api.saveTemplate(t ? t.id : null, p);
      if (!res || res.ok === false) { $('bt-errors').innerHTML = '<div class="msg error">' + esc(errorsText(res)) + '</div>'; btn.disabled = false; return; }
      closeDrawer('side'); ctx.toast(t ? 'Template saved.' : 'Template created.'); await ctx.refresh();
    } catch (err) { $('bt-errors').innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; btn.disabled = false; }
  });
  $('bt-name').focus();
}
