// Leave Management -- one employee's leave numbers (credits, requests, upcoming leave).
// The HR 201-File Overview card and the Leave section's summary tiles both use summarizeLeave(), so the two can never disagree, and
// there is no second copy of any leave rule.  loadLeaveSummary() reads only that one person's rows (small queries) for the Overview card.
import { OPEN_STATUSES } from './leaveUi.js?v=20261007e';
import * as api from './leaveApi.js?v=20261007e';

/**
 * The numbers for one employee from data that is already loaded: {types, balances, requests, today}.
 * Credits count only active, credit-based leave types; a Draft is not a request yet; "upcoming" is approved leave that has not finished.
 */
export function summarizeLeave({ types, balances, requests, today }, employeeId) {
  const typeById = Object.fromEntries((types || []).map((t) => [t.id, t]));
  const reqs = (requests || []).filter((r) => r.employee_id === employeeId && r.status !== 'Draft')
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
  const bals = (balances || []).filter((b) => b.employee_id === employeeId);
  const creditTypes = (types || []).filter((t) => t.active && t.requires_credit);
  const balOf = (id) => bals.find((b) => b.leave_type_id === id) || { total_credits: 0, used_credits: 0, available_credits: 0 };
  const sum = (key) => creditTypes.reduce((s, t) => s + Number(balOf(t.id)[key] || 0), 0);
  const upcoming = reqs.filter((r) => r.status === 'Approved' && r.end_date >= today).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  return {
    reqs, creditTypes, balOf, upcoming, today,
    typeName: (id) => (typeById[id] || {}).name || '—',
    available: sum('available_credits'), used: sum('used_credits'), total: sum('total_credits'),
    pending: reqs.filter((r) => OPEN_STATUSES.includes(r.status)).length,
    approved: reqs.filter((r) => ['Approved', 'Completed'].includes(r.status)).length,
    rejected: reqs.filter((r) => r.status === 'Rejected').length,
    onLeaveToday: reqs.some((r) => r.status === 'Approved' && r.start_date <= today && r.end_date >= today),
    next: upcoming[0] || null,
    /** the leave types this person actually has credits in (so ten empty types are not listed) */
    withCredits: creditTypes.map((t) => ({ id: t.id, name: t.name, ...balOf(t.id) })).filter((b) => Number(b.total_credits) > 0 || Number(b.available_credits) > 0),
  };
}

/**
 * Loads one person's leave numbers: {noAccess:true} when this account may not see leave records, otherwise the summary.
 * A person may see their own record; HR / the Final Approver / view-only leave roles may see everyone's (the database decides).
 */
export async function loadLeaveSummary(employeeId) {
  const prof = await api.getMyProfile();
  if (!prof || !prof.profile) return { noAccess: true };
  const own = employeeId === prof.profile.employee_id;
  if (!prof.flags.view_all && !own) return { noAccess: true };
  const [types, balances, requests] = await Promise.all([api.listLeaveTypes(), api.listBalances(employeeId), api.listRequests(employeeId)]);
  return summarizeLeave({ types, balances, requests, today: prof.today }, employeeId);
}
