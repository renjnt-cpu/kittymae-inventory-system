// HR 201 File -- page controller.  hr.html is a thin shell; everything is wired here.  The data layer is passed in (`api`), so the same code runs
// against the real Supabase functions in production and against a stand-in object in tests.
// Who may see or do what is decided by the database (migrations 180-183); this page only hides what it would refuse.
import { esc, $, toast, spinner, friendly, confirmDialog } from './hrUi.js?v=20261011b';
import { newDirectoryState, renderDirectory } from './hrDirectory.js?v=20261011b';
import { openProfile, drawProfile, showTab, markDirty, reloadProfile, afterChange, afterSaveChecks } from './hrProfile.js?v=20261011b';
import { isDirty } from './hrEdit.js?v=20261011b';
import { openAddWizard } from './hrAdd.js?v=20261011b';
import { openPrint, exportDirectory } from './hrPrint.js?v=20261011b';
import { openAuditAll } from './hrSide.js?v=20261011b';
import { visibleTabs } from './hrLogic.js?v=20261011b';

export function createHrContext(api, employee) {
  const ctx = {
    api, employee, access: { keys: {} }, rows: [], summary: null, alerts: [], branches: [], branchById: {}, positions: [], today: '',
    ps: null, wizard: null, ui: { dir: newDirectoryState(), dirShown: null }, view: 'dir',
  };
  return ctx;
}

export async function startHrPage({ root, api, employee, hash = '', search = '' }) {
  root.innerHTML = '<div id="hr-toast" aria-live="polite"></div><div class="hr-page">' +
    '<div id="hr-view-dir"></div><div id="hr-view-profile" hidden></div><div id="hr-view-add" hidden></div>' +
    '<p class="muted hr-noprint" id="hr-foot" hidden style="margin-top:18px;"></p></div>';
  const ctx = createHrContext(api, employee);
  ctx.dirHost = $('hr-view-dir'); ctx.profileHost = $('hr-view-profile'); ctx.addHost = $('hr-view-add');
  ctx.dirHost.innerHTML = spinner('Loading the HR 201 file…');

  // ---- who is this, and may they be here? ----
  let access;
  try { access = await api.myAccess(); } catch (err) {
    ctx.dirHost.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return ctx;
  }
  ctx.access = access; ctx.today = access.today || '';
  if (!access.can_open) {
    root.innerHTML = '<div class="center-screen"><div><h2>No access</h2><p class="muted">The 201 File is limited to people given HR access (HR Supervisor and Admin by default).<br>If you need it, ask an Admin to grant the HR permissions in the Position Access Matrix.</p></div></div>';
    return ctx;
  }

  // ---- navigation helpers ----
  const show = (which) => {
    ctx.view = which;
    ctx.dirHost.hidden = which !== 'dir'; ctx.profileHost.hidden = which !== 'profile'; ctx.addHost.hidden = which !== 'add';
    window.scrollTo({ top: 0 });
  };
  let settingHash = false;
  ctx.setHash = (h) => { settingHash = true; try { history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : '')); } catch (e) { /* harmless */ } setTimeout(() => { settingHash = false; }, 0); };
  const dirty = () => isDirty(ctx.ps);
  async function confirmLeave() {
    if (!dirty()) return true;
    return confirmDialog({ title: 'Leave without saving?', message: 'You have unsaved changes on this employee. They will be lost.', okLabel: 'Leave and discard', cancelLabel: 'Stay and keep editing', danger: true });
  }

  ctx.openEmployee = async (id, tab) => {
    if (ctx.view === 'profile' && ctx.ps && ctx.ps.id !== id && !(await confirmLeave())) return;
    show('profile');
    ctx.setHash('emp/' + id + '/' + (tab || 'overview'));
    await openProfile(ctx, id, tab);
  };
  ctx.closeProfile = async (force) => {
    if (!force && !(await confirmLeave())) return;
    ctx.ps = null; ctx.profileHost.innerHTML = '';
    show('dir'); ctx.setHash('');
    ctx.refreshDirectory(true);
  };
  ctx.showTab = (id) => showTab(ctx, id);
  ctx.markDirty = () => markDirty(ctx);
  ctx.redrawProfile = () => drawProfile(ctx);
  ctx.reloadProfile = () => reloadProfile(ctx);
  ctx.afterChange = () => afterChange(ctx);
  ctx.afterSaveChecks = (diff) => afterSaveChecks(ctx, diff);
  ctx.openPrint = () => openPrint(ctx);
  ctx.openAuditAll = () => openAuditAll(ctx);
  ctx.exportCsv = (rows) => exportDirectory(ctx, rows);
  ctx.openAdd = () => { show('add'); ctx.setHash('add'); openAddWizard(ctx); };
  ctx.closeAdd = () => { ctx.wizard = null; ctx.addHost.innerHTML = ''; show('dir'); ctx.setHash(''); };
  ctx.afterCreate = async (id) => {
    ctx.wizard = null; ctx.addHost.innerHTML = '';
    await ctx.refreshDirectory(true);
    await ctx.openEmployee(id, 'overview');
    if (ctx.ps) { ctx.ps.notices = ['No sign-in has been created for this person. Open the Access & Permissions tab to set a password, and the Documents tab to upload their files.']; drawProfile(ctx); }
  };

  // ---- data ----
  async function loadBase() {
    const [dir, sum, al, branches, positions] = await Promise.all([
      api.directory(), api.summary().catch(() => null), api.alerts().catch(() => []), api.getBranches().catch(() => []), api.listHrPositions().catch(() => []),
    ]);
    ctx.rows = dir; ctx.summary = sum; ctx.alerts = al || [];
    ctx.branches = branches; ctx.branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
    ctx.positions = (positions || []).filter((p) => p.is_active !== false).map((p) => p.name);
  }
  ctx.refreshDirectory = async (quiet) => {
    try {
      await loadBase();
      if (ctx.view === 'dir') renderDirectory(ctx, ctx.dirHost);
    } catch (err) { if (!quiet) toast(err, true); }
  };
  ctx.refresh = async () => {
    ctx.dirHost.querySelector('#hr-refresh') && (ctx.dirHost.querySelector('#hr-refresh').disabled = true);
    await ctx.refreshDirectory(false);
    toast('Refreshed.');
  };
  try { await loadBase(); } catch (err) { ctx.dirHost.innerHTML = '<div class="msg error">' + esc(friendly(err)) + '</div>'; return ctx; }
  renderDirectory(ctx, ctx.dirHost);

  // offboarding banner (people who left but still hold company property); loaded on its own so it can never hold the page up
  import('./hrAssets.js?v=20261011b').then((m) => m.offboardingBanner()).then((html) => { ctx.assetBanner = html; const b = $('hr-asset-alert'); if (b) b.innerHTML = html; }).catch(() => {});

  // classic editor stays reachable for now (a safety net while the new page is new)
  if (access.master) { const foot = $('hr-foot'); foot.hidden = false; foot.innerHTML = 'Something not working as expected? <a href="hr-classic.html">Open the classic 201-File editor</a> (temporary, for emergencies).'; }

  // ---- routing from the address bar ----
  async function route() {
    const h = String(location.hash || '').replace(/^#/, '');
    const m = h.match(/^emp\/([0-9a-f-]{36})(?:\/([a-z]+))?$/i);
    if (m) { if (!ctx.ps || ctx.ps.id !== m[1]) { show('profile'); await openProfile(ctx, m[1], m[2]); } else if (m[2] && ctx.ps.tab !== m[2]) showTab(ctx, m[2]); return; }
    if (h === 'add' && access.keys['hr.add_employee']) { show('add'); openAddWizard(ctx); return; }
    if (ctx.view !== 'dir') { ctx.ps = null; ctx.profileHost.innerHTML = ''; show('dir'); renderDirectory(ctx, ctx.dirHost); }
  }
  window.addEventListener('hashchange', async () => {
    if (settingHash) return;
    if (ctx.view === 'profile' && dirty()) {
      const ok = await confirmLeave();
      if (!ok) { ctx.setHash('emp/' + ctx.ps.id + '/' + ctx.ps.tab); return; }
    }
    route();
  });
  window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's' && ctx.view === 'profile' && ctx.ps && ctx.ps.editing) { e.preventDefault(); const b = $('hr-save'); if (b && !b.disabled) b.click(); } });
  await route();
  return ctx;
}
