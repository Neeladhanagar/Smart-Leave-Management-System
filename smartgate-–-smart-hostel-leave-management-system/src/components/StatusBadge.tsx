import React from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  LogOut,
  ShieldCheck,
  Ban,
} from 'lucide-react';
import { formatLeaveStatusLabel } from '../utils/formatters';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = status.toUpperCase();

  let styles = 'bg-slate-50 text-slate-700 border-slate-200';
  let Icon = Clock;

  if (['APPROVED', 'ACTIVE', 'RETURNED', 'VALID'].includes(s)) {
    styles = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    Icon = CheckCircle2;
  } else if (['REJECTED', 'OVERDUE', 'REVOKED', 'INVALID', 'EXPIRED'].includes(s)) {
    styles = 'bg-red-50 text-red-800 border-red-200';
    Icon = s === 'OVERDUE' || s === 'EXPIRED' ? AlertTriangle : s === 'REVOKED' ? Ban : XCircle;
  } else if (['RETURNED_LATE', 'LATE_EXTENSION_REQUEST'].includes(s)) {
    styles = 'bg-amber-50 text-amber-800 border-amber-200';
    Icon = AlertTriangle;
  } else if (['EXITED', 'USED'].includes(s)) {
    styles = 'bg-indigo-50 text-indigo-800 border-indigo-200';
    Icon = s === 'EXITED' ? LogOut : ShieldCheck;
  } else if (s.startsWith('PENDING')) {
    styles = 'bg-amber-50 text-amber-800 border-amber-200';
    Icon = Clock;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap ${styles}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{formatLeaveStatusLabel(status)}</span>
    </span>
  );
}
