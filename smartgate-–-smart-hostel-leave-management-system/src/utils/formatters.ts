import type { UserRole } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Student',
  COORDINATOR: 'Coordinator',
  MENTOR: 'Faculty Mentor',
  HOD: 'Head of Department',
  SWO: 'Student Welfare Officer',
  WARDEN: 'Hostel Warden',
  AO: 'Administrative Officer',
  SECURITY: 'Security Guard',
  ADMIN: 'System Administrator',
  EMERGENCY_CONTROL: 'Emergency Control Centre',
};

export const ROLE_HOME_ROUTES: Record<UserRole, string> = {
  STUDENT: '/student',
  COORDINATOR: '/coordinator',
  MENTOR: '/mentor',
  HOD: '/hod',
  SWO: '/swo',
  WARDEN: '/warden',
  AO: '/ao',
  SECURITY: '/security',
  ADMIN: '/admin',
  EMERGENCY_CONTROL: '/emergency-control',
};

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(value?: string | Date | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatLeaveStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING_COORDINATOR: 'Pending Coordinator',
    PENDING_MENTOR: 'Pending Mentor',
    PENDING_HOD: 'Pending HOD',
    PENDING_SWO: 'Pending SWO',
    PENDING_WARDEN: 'Pending Warden',
    PENDING_AO: 'Pending AO',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    EXITED: 'Exited Hostel',
    OVERDUE: 'Overdue',
    RETURNED: 'Returned',
    RETURNED_LATE: 'Returned Late',
    ACTIVE: 'Active',
    REVOKED: 'Revoked',
    EXPIRED: 'Expired',
    USED: 'Used',
    LATE_EXTENSION_REQUEST: 'Late Extension',
    STANDARD_EXTENSION: 'Standard Extension',
  };
  return map[status] || status.replace(/_/g, ' ');
}

export function calculateDurationDays(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 1;
  return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
}
