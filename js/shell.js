// Shared header/nav + the sign-in gate every page (except login.html) needs. No
// framework/build step, so this is plain DOM injection — called once at the top of each
// page's script, mirroring the old app's renderShell()/renderGate() split.
import { requireSession, linkEmployee, getMyJobTitle, signOut, updateMyName } from './auth.js';

// ERP access is now also gated by 201-File Job Title, on top of role/position --
// ERP-only: kittymae-pos has no equivalent check, so these lists never affect POS
// access. Extend either array if another job title needs the same treatment later.
const ERP_BLOCKED_JOB_TITLES = [];
// "Sales Admin Associate" briefly lost ERP access entirely, then was given scoped
// access back (Ren, 2026-09-16: "sales admin associate can now access ERP only for
// transfers and item monitoring"; 2026-09-17: added Refunds too, "only there request
// can see in the refunds" -- refunds.html's own canApprove() check already renders the
// request-only view, showing just the caller's own rows, for anyone without
// has_refund_approval_access()) -- full access to just these pages, nothing else in
// the sidebar, regardless of what role/position/extra_page_access would otherwise grant.
const ERP_SCOPED_JOB_TITLES = { 'Sales Admin Associate': ['item-monitoring', 'transfers', 'refunds'] };

export async function initShell(activePage) {
  const session = await requireSession();
  if (!session) return null; // requireSession already redirected to login.html

  let employee;
  try {
    employee = await linkEmployee();
  } catch (err) {
    const msg = String(err.message || err);
    document.body.innerHTML = msg.startsWith('NOT_REGISTERED')
      ? '<div class="center-screen"><div><h2>Not registered yet</h2><p>Signed in as <b>' + session.user.email + '</b>, but you\'re not in the Employees list.</p><p class="muted">Ask an Admin to add you, then sign in again.</p></div></div>'
      : msg.startsWith('INACTIVE')
        ? '<div class="center-screen"><div><h2>Account inactive</h2><p>Your record is marked Inactive. Contact an Admin.</p></div></div>'
        : '<div class="center-screen"><div><h2>Something went wrong</h2><p class="muted">' + msg + '</p></div></div>';
    return null;
  }

  let jobTitle = null;
  try {
    jobTitle = await getMyJobTitle();
    if (jobTitle && ERP_BLOCKED_JOB_TITLES.includes(jobTitle)) {
      document.body.innerHTML = '<div class="center-screen"><div><h2>No ERP access</h2><p>Your position (' + jobTitle + ') no longer has access to this system.</p><p class="muted">You can still use the POS app. Contact an Admin if you think this is wrong.</p></div></div>';
      return null;
    }
  } catch (err) {
    // A failed lookup here shouldn't be the reason someone otherwise entitled gets
    // locked out -- fail open, same spirit as the SKU autocomplete's own failed-
    // lookup handling elsewhere in this app.
  }

  const ALL_PAGE_DEFS = {
    dashboard: { label: 'Dashboard', href: 'dashboard.html' },
    branches: { label: 'Branches', href: 'branches.html' },
    products: { label: 'SKU Catalog', href: 'products.html' },
    'item-monitoring': { label: 'Item Monitoring', href: 'item-monitoring.html' },
    transfers: { label: 'Transfers', href: 'transfers.html' },
    bills: { label: 'Bills', href: 'bills.html' },
    refunds: { label: 'Refunds', href: 'refunds.html' },
    transactions: { label: 'Transactions', href: 'transactions.html' },
    assets: { label: 'Asset & Supplies Custodian', href: 'assets.html' },
    lbc: { label: 'LBC Monitoring', href: 'lbc.html' },
    hr: { label: 'HR — 201 File', href: 'hr.html' },
    'access-checklist': { label: 'Access Checklist', href: 'access-checklist.html' },
  };
  const pages = [];
  const scopedIds = jobTitle && ERP_SCOPED_JOB_TITLES[jobTitle];
  if (scopedIds) {
    // A scoped job title (e.g. Sales Admin Associate) gets exactly these pages and
    // nothing else -- skip every role/position/extra_page_access check below entirely,
    // regardless of what those would otherwise grant.
    scopedIds.forEach((id) => pages.push({ id, ...ALL_PAGE_DEFS[id] }));
  } else {
    pages.push({ id: 'dashboard', ...ALL_PAGE_DEFS.dashboard });
    if (['Admin', 'Manager', 'Branch Supervisor'].includes(employee.role) || ['Sales Executive', 'Admin Assistant', 'Personal Assistant'].includes(employee.position)) {
      // Personal Assistant is view-only here -- branches.html has no add/edit RLS grant
      // for this position (no branch_id, not in POSITION_MANAGERS), so canAddHere()/
      // canWriteHere() already resolve to false for her; this just lets her find the page.
      pages.push({ id: 'branches', ...ALL_PAGE_DEFS.branches });
    }
    pages.push(
      { id: 'products', ...ALL_PAGE_DEFS.products },
      { id: 'item-monitoring', ...ALL_PAGE_DEFS['item-monitoring'] },
      { id: 'transfers', ...ALL_PAGE_DEFS.transfers },
      { id: 'bills', ...ALL_PAGE_DEFS.bills },
    );
    // Refunds: anyone can request one, so it's not role-gated like the rest of this
    // block — refunds.html itself shows a simple request form to most people, and the
    // full approve/manage view only to has_refund_approval_access() accounts.
    pages.push({ id: 'refunds', ...ALL_PAGE_DEFS.refunds });
    if (['Admin', 'Manager', 'Branch Supervisor'].includes(employee.role) || employee.position === 'Admin Assistant' || (employee.extra_page_access || []).includes('transactions')) {
      // Transactions doesn't fit the per-branch model (a different process, per Ren) —
      // flat company-wide log. Admin/Manager run CSV imports and manage everything;
      // Branch Supervisor, Admin Assistant, and anyone with extra_page_access
      // 'transactions' (e.g. Jessica) get in too, but transactions.html only lets them
      // fill in FB Name/Customer/Order ID, not import or delete.
      pages.push({ id: 'transactions', ...ALL_PAGE_DEFS.transactions });
    }
    if (['Admin', 'Manager', 'Branch Supervisor'].includes(employee.role) || ['Personal Assistant', 'Admin Assistant'].includes(employee.position) || (employee.extra_page_access || []).includes('assets')) {
      pages.push({ id: 'assets', ...ALL_PAGE_DEFS.assets });
    }
    if (['Admin', 'Manager', 'Branch Supervisor'].includes(employee.role) || employee.position === 'Admin Assistant' || (employee.extra_page_access || []).includes('lbc')) {
      // COD parcels shipped via LBC for online orders -- company-wide, not per-branch.
      pages.push({ id: 'lbc', ...ALL_PAGE_DEFS.lbc });
    }
    // 201-File: strictly HR Supervisor + Admin -- matches is_hr_or_admin() in
    // 83_hr_201_file.sql exactly, so this link is never shown to someone who'd just
    // hit "No access" on it.
    if ((employee.role === 'Admin' || employee.position === 'HR Supervisor') && !employee.hr_201_file_blocked) {
      pages.push({ id: 'hr', ...ALL_PAGE_DEFS.hr });
    }
    // Personal Assistant gets a read-only view (see access-checklist.html's own
    // canEdit gate) -- Admin remains the only one who can actually change anything.
    if (employee.role === 'Admin' || employee.position === 'Personal Assistant') {
      pages.push({ id: 'access-checklist', ...ALL_PAGE_DEFS['access-checklist'] });
    }
  }

  // 2-month cooldown between name changes (mirrors update_my_name()'s own server-side
  // check — this is just so the button doesn't invite a click that's just going to be
  // rejected).
  let nameEditLocked = false, nameEditUnlockDate = null;
  if (employee.name_changed_at) {
    const unlock = new Date(employee.name_changed_at);
    unlock.setMonth(unlock.getMonth() + 2);
    if (unlock > new Date()) { nameEditLocked = true; nameEditUnlockDate = unlock; }
  }

  // Grouped sidebar (App Shell, P0) -- same pages/gating built above, just
  // rendered as sections instead of a flat pill row. A page id not listed in any
  // group here would simply never appear in the sidebar, so every id pushed above
  // must have a home in exactly one group.
  const NAV_GROUPS = [
    { label: 'Overview', ids: ['dashboard'] },
    { label: 'Sales', ids: ['branches', 'refunds'] },
    { label: 'Products & Inventory', ids: ['products', 'item-monitoring', 'transfers'] },
    { label: 'Operations', ids: ['lbc', 'assets'] },
    { label: 'Finance', ids: ['bills', 'transactions'] },
    { label: 'People', ids: ['hr', 'access-checklist'] },
  ];
  const pageById = Object.fromEntries(pages.map((p) => [p.id, p]));
  const navHtml = NAV_GROUPS.map((g) => {
    const items = g.ids.map((id) => pageById[id]).filter(Boolean);
    if (!items.length) return '';
    return '<div class="app-nav-group">' +
      '<div class="app-nav-group-label">' + esc(g.label) + '</div>' +
      items.map((p) => '<a href="' + p.href + '"' + (p.id === activePage ? ' class="active"' : '') + '>' + p.label + '</a>').join('') +
    '</div>';
  }).join('');
  const activeLabel = (pageById[activePage] || {}).label || 'Kittymae Jewels System';

  const shell = document.createElement('div');
  shell.className = 'app-shell';
  shell.innerHTML =
    '<div class="app-backdrop" id="app-backdrop"></div>' +
    '<aside class="app-sidebar" id="app-sidebar">' +
      '<div class="app-sidebar-brand">💎 Kittymae Jewels</div>' +
      '<nav class="app-nav">' + navHtml + '</nav>' +
    '</aside>' +
    '<div class="app-main-col">' +
      '<header class="app-header">' +
        '<button type="button" class="app-menu-btn" id="app-menu-btn" aria-label="Open menu">☰</button>' +
        '<h1 class="app-page-title">' + esc(activeLabel) + '</h1>' +
        '<div class="who" id="app-header-who"></div>' +
      '</header>' +
    '</div>';

  const existingMain = document.querySelector('main');
  shell.querySelector('.app-main-col').appendChild(existingMain);
  document.body.prepend(shell);

  const header = shell.querySelector('.app-header');
  document.getElementById('app-header-who').innerHTML =
    '<a class="btn small secondary" href="https://renjnt-cpu.github.io/kittymae-pos/index.html">Switch to POS ↗</a> ' +
    '<span id="who-display">' + esc(employee.full_name) + ' · ' + esc(employee.role) +
      (employee.branch_id ? ' · Branch #' + employee.branch_id : ' · All Branches') +
    '</span>' +
    (nameEditLocked
      ? ' <span class="muted" style="font-size:11px;">(can rename ' + nameEditUnlockDate.toISOString().slice(0, 10) + ')</span>'
      : ' <button class="btn small secondary" id="edit-name-btn">Edit Name</button>') +
    ' <button class="btn small secondary" id="signout-btn">Sign out</button>';
  header.querySelector('#signout-btn').addEventListener('click', signOut);

  // Mobile/tablet off-canvas drawer (<1024px) -- the sidebar is always visible
  // above that, so the toggle/backdrop are only ever reachable via the hamburger
  // that itself only renders visibly below the breakpoint (CSS-only visibility).
  const closeDrawer = () => shell.classList.remove('sidebar-open');
  shell.querySelector('#app-menu-btn').addEventListener('click', () => shell.classList.toggle('sidebar-open'));
  shell.querySelector('#app-backdrop').addEventListener('click', closeDrawer);
  shell.querySelectorAll('.app-nav a').forEach((a) => a.addEventListener('click', closeDrawer));

  const whoEl = header.querySelector('.who');
  if (header.querySelector('#edit-name-btn')) header.querySelector('#edit-name-btn').addEventListener('click', () => {
    const display = header.querySelector('#who-display');
    const editBtn = header.querySelector('#edit-name-btn');
    display.style.display = 'none';
    editBtn.style.display = 'none';
    const form = document.createElement('span');
    form.innerHTML =
      '<input type="text" id="edit-name-input" value="' + esc(employee.full_name) + '" style="padding:4px 6px;border-radius:4px;border:1px solid #ccc;font-size:12px;width:140px;">' +
      ' <button class="btn small" id="edit-name-save">Save</button>' +
      ' <button class="btn small secondary" id="edit-name-cancel">Cancel</button>';
    whoEl.insertBefore(form, editBtn);

    const cleanup = () => { form.remove(); display.style.display = ''; editBtn.style.display = ''; };
    form.querySelector('#edit-name-cancel').addEventListener('click', cleanup);
    form.querySelector('#edit-name-save').addEventListener('click', async () => {
      const newName = form.querySelector('#edit-name-input').value.trim();
      if (!newName) return;
      try {
        await updateMyName(newName);
        employee.full_name = newName;
        display.textContent = newName + ' · ' + employee.role + (employee.branch_id ? ' · Branch #' + employee.branch_id : ' · All Branches');
        // Locked for the next 2 months now — replace the button with that note instead
        // of restoring it, so the header matches what a fresh page load would show.
        const unlock = new Date();
        unlock.setMonth(unlock.getMonth() + 2);
        const lockedNote = document.createElement('span');
        lockedNote.className = 'muted';
        lockedNote.style.fontSize = '11px';
        lockedNote.textContent = '(can rename ' + unlock.toISOString().slice(0, 10) + ')';
        editBtn.replaceWith(lockedNote);
        form.remove();
        display.style.display = '';
      } catch (err) {
        alert(String(err.message || err));
      }
    });
  });

  return employee;
}

export function esc(s) {
  return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function toast(targetId, text, isError) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(text) + '</div>';
  setTimeout(() => { el.innerHTML = ''; }, 5000);
}
