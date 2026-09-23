// Shared header/nav + the sign-in gate every page (except login.html) needs. No
// framework/build step, so this is plain DOM injection — called once at the top of each
// page's script, mirroring the old app's renderShell()/renderGate() split.
import { requireSession, linkEmployee, getMyJobTitle, signOut, updateMyName } from './auth.js?v=20260923a';
import { listMyPermissions } from './api.js?v=20260923a';
import { initActivityFeed } from './activityFeed.js?v=20260923a';
import { localDateStr } from './uiKit.js?v=20260923a';

// Where a clicked activity notification opens its record (spec 321) -- keyed by the
// event's record_table. A trailing '=' means the record id is appended.
const ACTIVITY_LINKS = {
  pos_sale: 'branches.html?tab=pos&open=',
  layaway_holds: 'branches.html?tab=layaway&open=',
  scrap_entries: 'branches.html?tab=scrap&open=',
  subasta_items: 'branches.html?tab=subasta',
  pull_out_records: 'pull-out.html?open=',
  inventory_transfers: 'transfers.html?open=',
  inventory_transactions: 'item-monitoring.html',
  refunds: 'refunds.html?open=',
  products: 'products.html',
};

// ERP access is now also gated by 201-File Job Title, on top of role/position --
// ERP-only: kittymae-pos has no equivalent check, so these lists never affect POS
// access. Extend either array if another job title needs the same treatment later.
const ERP_BLOCKED_JOB_TITLES = [];
// "Sales Admin Associate" briefly lost ERP access entirely, then was given scoped
// access back (Ren, 2026-09-16: "sales admin associate can now access ERP only for
// transfers and item monitoring"; 2026-09-17: added Refunds too, "only there request
// can see in the refunds" -- refunds.html's own canApprove() check already renders the
// request-only view, showing just the caller's own rows, for anyone without
// has_refund_approval_access()); 2026-09-21: added Branches too, "sales admin
// associate in 201 file can access to layaway" -- Layaway lives inside the Branches
// page as a sub-tab, so this is what makes it reachable. Every one of these
// employees holds the Sales Admin Associate position (renamed 2026-09-22 from Sales
// Executive to match this same job title), which layawayTab.js's own
// UNSCOPED_POSITIONS already lets act company-wide once they can reach the page --
// full access to just these pages, nothing else in the sidebar, regardless of what
// role/position/extra_page_access would otherwise grant.
const ERP_SCOPED_JOB_TITLES = { 'Sales Admin Associate': ['item-monitoring', 'transfers', 'refunds', 'branches'] };

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

  try {
    employee.permissions = await listMyPermissions();
  } catch (err) {
    employee.permissions = []; // fail closed -- a failed lookup shouldn't grant anything
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
    'pull-out': { label: 'Pull Out Item', href: 'pull-out.html' },
    bills: { label: 'Bills', href: 'bills.html' },
    refunds: { label: 'Refunds', href: 'refunds.html' },
    transactions: { label: 'Transactions', href: 'transactions.html' },
    assets: { label: 'Asset & Supplies Custodian', href: 'assets.html' },
    lbc: { label: 'LBC Monitoring', href: 'lbc.html' },
    hr: { label: 'HR — 201 File', href: 'hr.html' },
    'access-checklist': { label: 'Access Checklist', href: 'access-checklist.html' },
    'access-matrix': { label: 'Position Access Matrix', href: 'access-matrix.html' },
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
    if (['Admin', 'Manager', 'Branch Supervisor'].includes(employee.role) || ['Sales Admin Associate', 'Admin Assistant', 'Personal Assistant'].includes(employee.position)) {
      // Personal Assistant is view-only here -- branches.html has no add/edit RLS grant
      // for this position (no branch_id, not in POSITION_MANAGERS), so canAddHere()/
      // canWriteHere() already resolve to false for her; this just lets her find the page.
      pages.push({ id: 'branches', ...ALL_PAGE_DEFS.branches });
    }
    pages.push(
      { id: 'products', ...ALL_PAGE_DEFS.products },
      { id: 'item-monitoring', ...ALL_PAGE_DEFS['item-monitoring'] },
      { id: 'transfers', ...ALL_PAGE_DEFS.transfers },
      // Visible to everyone, same tier as Transfers -- the page itself gates
      // creating a pull-out on inventory.pull_out.create (Supervisor/Auditor/
      // Inventory Staff/Admin, via the permission system) and returning one on
      // Admin/Manager (return_pull_out()'s own gate, unchanged), but anyone can see
      // what's currently out.
      { id: 'pull-out', ...ALL_PAGE_DEFS['pull-out'] },
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
    // Admin-only -- Ren, 2026-09-21: "only me can access the access checklist this is
    // my personal monitoring" (previously Personal Assistant also got a read-only
    // view; that's removed here and at the RLS level).
    if (employee.role === 'Admin') {
      pages.push({ id: 'access-checklist', ...ALL_PAGE_DEFS['access-checklist'] });
      // HR-Position-based Permission System (Ren's spec sections 252-270) -- lets an
      // Admin see and edit what each role/position grants, and grant/revoke individual
      // overrides, instead of that living only in migration files.
      pages.push({ id: 'access-matrix', ...ALL_PAGE_DEFS['access-matrix'] });
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
    { label: 'Products & Inventory', ids: ['products', 'item-monitoring', 'transfers', 'pull-out'] },
    { label: 'Operations', ids: ['lbc', 'assets'] },
    { label: 'Finance', ids: ['bills', 'transactions'] },
    { label: 'People', ids: ['hr', 'access-checklist', 'access-matrix'] },
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
  // Ren's spec section 159: "Every page should have a clear title and optional
  // breadcrumb" -- the sidebar group a page lives in doubles as its breadcrumb
  // trail, so this is free from NAV_GROUPS above rather than a second list to keep
  // in sync. Dashboard has no meaningful parent group, so it just shows its own name.
  const activeGroup = NAV_GROUPS.find((g) => g.ids.includes(activePage));
  const breadcrumbHtml = (activeGroup && activeGroup.label !== 'Overview')
    ? '<div class="app-breadcrumb">' + esc(activeGroup.label) + ' <span class="app-breadcrumb-sep">/</span> ' + esc(activeLabel) + '</div>'
    : '';

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
        '<div class="app-title-block">' +
          breadcrumbHtml +
          '<h1 class="app-page-title">' + esc(activeLabel) + '</h1>' +
        '</div>' +
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
      ? ' <span class="muted" style="font-size:11px;">(can rename ' + localDateStr(nameEditUnlockDate) + ')</span>'
      : ' <button class="btn small secondary" id="edit-name-btn">Edit Name</button>') +
    ' <button class="btn small secondary" id="signout-btn">Sign out</button>';
  header.querySelector('#signout-btn').addEventListener('click', signOut);

  // Global Branch Activity feed (spec 303-332): bell + live panel + history drawer.
  // Mounted async so a slow first fetch never delays the page itself; exposed on
  // window so branches.html can park its Forfeited notice in the panel's pinned slot.
  initActivityFeed({ employee, headerEl: header, esc, links: ACTIVITY_LINKS })
    .then((feed) => { window.__kmActivity = feed; document.dispatchEvent(new Event('km-activity-ready')); })
    .catch(() => { /* the feed is an overlay -- a failure here must never break the page */ });

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
        lockedNote.textContent = '(can rename ' + localDateStr(unlock) + ')';
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

// Server-side rule messages ("Not authorized: ...", "Insufficient stock: ...") are
// written for staff and shown as-is; anything that reads like a database/network
// internals message gets a plain-language line in front so a normal user knows what
// happened and what to do, with the detail kept for whoever debugs it (MASTER UI 31).
const TECHNICAL_ERROR = /violates|constraint|relation "|syntax error|null value|permission denied|JSON|invalid input|duplicate key|does not exist|PGRST|JWT|Failed to fetch|NetworkError|timeout/i;
export function toast(targetId, text, isError) {
  const el = document.getElementById(targetId);
  if (!el) return;
  let shown = String(text);
  if (isError && TECHNICAL_ERROR.test(shown)) {
    shown = 'Something went wrong and the change was not saved. Please try again -- if it keeps happening, tell an Admin. (Details: ' + shown + ')';
  }
  el.innerHTML = '<div class="msg ' + (isError ? 'error' : 'ok') + '">' + esc(shown) + '</div>';
  setTimeout(() => { el.innerHTML = ''; }, isError ? 9000 : 5000);
}
