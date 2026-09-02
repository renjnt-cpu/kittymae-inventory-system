// Shared header/nav + the sign-in gate every page (except login.html) needs. No
// framework/build step, so this is plain DOM injection — called once at the top of each
// page's script, mirroring the old app's renderShell()/renderGate() split.
import { requireSession, linkEmployee, signOut } from './auth.js';

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

  const pages = [
    { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html' },
  ];
  if (['Admin', 'Manager', 'Branch Supervisor'].includes(employee.role)) {
    pages.push({ id: 'branches', label: 'Branches', href: 'branches.html' });
  }
  pages.push(
    { id: 'movement', label: 'Record Movement', href: 'movement.html' },
    { id: 'transfers', label: 'Transfers', href: 'transfers.html' },
    { id: 'bills', label: 'Bills', href: 'bills.html' },
  );
  // Refunds: anyone can request one, so it's not role-gated like the rest of this
  // block — refunds.html itself shows a simple request form to most people, and the
  // full approve/manage view only to has_refund_approval_access() accounts.
  pages.push({ id: 'refunds', label: 'Refunds', href: 'refunds.html' });
  if (['Admin', 'Manager'].includes(employee.role)) {
    // Payments doesn't fit the per-branch model (a different process, per Ren) —
    // flat company-wide log, Admin + Manager only.
    pages.push({ id: 'payments', label: 'Payments', href: 'payments.html' });
    pages.push({ id: 'assets', label: 'Asset & Supplies Custodian', href: 'assets.html' });
  }
  if (employee.role === 'Admin') {
    pages.push({ id: 'capital', label: 'Branch Capital', href: 'capital.html' });
    pages.push({ id: 'access-checklist', label: 'Access Checklist', href: 'access-checklist.html' });
  }

  const header = document.createElement('header');
  header.innerHTML = '<h1>💎 Kittymae Jewels System</h1>' +
    '<div class="who">' + employee.full_name + ' · ' + employee.role +
    (employee.branch_id ? ' · Branch #' + employee.branch_id : ' · All Branches') +
    ' &nbsp; <button class="btn small secondary" id="signout-btn">Sign out</button></div>';

  const nav = document.createElement('nav');
  nav.innerHTML = pages.map((p) =>
    '<a href="' + p.href + '"' + (p.id === activePage ? ' class="active"' : '') + '>' + p.label + '</a>'
  ).join('');

  document.body.prepend(nav);
  document.body.prepend(header);
  header.querySelector('#signout-btn').addEventListener('click', signOut);

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
