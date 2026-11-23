import React from 'react';
import { CheckCircle2, Clock, XCircle, MinusCircle } from 'lucide-react';
import type { LeaveApplication, EmergencyLeave, ApprovalHistoryItem } from '../types';
import { formatDateTime } from '../utils/formatters';

interface LeaveTimelineProps {
  leaveType: 'REGULAR' | 'EMERGENCY';
  leave: LeaveApplication | EmergencyLeave;
  history?: ApprovalHistoryItem[];
}

export function LeaveTimeline({ leaveType, leave, history = [] }: LeaveTimelineProps) {
  const status = leave.status;

  if (leaveType === 'EMERGENCY') {
    const isRejected = status === 'REJECTED';
    const isApprovedOrAfter = ['APPROVED', 'EXITED', 'OVERDUE', 'RETURNED', 'RETURNED_LATE'].includes(status);

    const steps = [
      { label: 'Student Submitted', state: 'done' as const },
      {
        label: 'AO Final Review',
        state: isRejected ? ('rejected' as const) : isApprovedOrAfter ? ('done' as const) : ('current' as const),
      },
      {
        label: 'QR Pass Issued',
        state: isApprovedOrAfter ? ('done' as const) : isRejected ? ('skipped' as const) : ('pending' as const),
      },
    ];

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {steps.map((s) => (
            <StepItem key={s.label} label={s.label} state={s.state} />
          ))}
        </div>
        <HistoryList history={history} />
      </div>
    );
  }

  const reg = leave as LeaveApplication;
  const stageOrder = ['COORDINATOR', 'MENTOR', 'HOD', 'SWO', 'WARDEN', 'COMPLETED'];
  const currentIdx = stageOrder.indexOf(reg.currentStage);
  const isRejected = reg.status === 'REJECTED';

  const getStepState = (stage: string): 'done' | 'current' | 'pending' | 'rejected' | 'skipped' => {
    if (stage === 'HOD' && !reg.hodRequired) return 'skipped';
    if (isRejected) {
      if (reg.rejectedByRole === stage) return 'rejected';
      const rejectedIdx = stageOrder.indexOf(reg.rejectedByRole || '');
      const myIdx = stageOrder.indexOf(stage);
      if (rejectedIdx > myIdx) return 'done';
      return 'pending';
    }
    if (reg.currentStage === 'COMPLETED') return 'done';
    const myIdx = stageOrder.indexOf(stage);
    if (myIdx < currentIdx) return 'done';
    if (myIdx === currentIdx) return 'current';
    return 'pending';
  };

  const steps = [
    { label: 'Student', state: 'done' as const },
    { label: 'Coordinator', state: getStepState('COORDINATOR') },
    { label: 'Mentor', state: getStepState('MENTOR') },
    {
      label: reg.hodRequired ? 'HOD (>5 Days)' : 'HOD (Skipped)',
      state: getStepState('HOD'),
    },
    { label: 'SWO', state: getStepState('SWO') },
    { label: 'Warden + QR', state: getStepState('WARDEN') },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {steps.map((s) => (
          <StepItem key={s.label} label={s.label} state={s.state} />
        ))}
      </div>
      <HistoryList history={history} />
    </div>
  );
}

function StepItem({
  label,
  state,
}: {
  label: string;
  state: 'done' | 'current' | 'pending' | 'rejected' | 'skipped';
}) {
  let style = 'border-slate-200 bg-slate-50 text-slate-500';
  let Icon = Clock;

  if (state === 'done') {
    style = 'border-emerald-200 bg-emerald-50 text-emerald-800';
    Icon = CheckCircle2;
  } else if (state === 'current') {
    style = 'border-indigo-300 bg-indigo-50 text-indigo-800';
    Icon = Clock;
  } else if (state === 'rejected') {
    style = 'border-red-200 bg-red-50 text-red-800';
    Icon = XCircle;
  } else if (state === 'skipped') {
    style = 'border-slate-200 bg-slate-100 text-slate-400';
    Icon = MinusCircle;
  }

  return (
    <div className={`border rounded-lg px-3 py-2.5 flex items-center gap-2 text-xs font-medium ${style}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function HistoryList({ history }: { history: ApprovalHistoryItem[] }) {
  if (!history || history.length === 0) return null;

  return (
    <div className="border-t border-slate-200 pt-4">
      <h4 className="text-xs font-semibold text-slate-700 mb-3">Approval & Activity Log</h4>
      <div className="space-y-2.5">
        {history.map((item) => (
          <div
            key={item._id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs border-b border-slate-100 pb-2 last:border-0"
          >
            <div>
              <span className="font-semibold text-slate-900">{item.stage}</span>
              <span className="mx-1.5 text-slate-400">·</span>
              <span className="font-medium text-indigo-700">{item.action}</span>
              <span className="mx-1.5 text-slate-400">·</span>
              <span className="text-slate-600">{item.actorName}</span>
              {item.remarks && <p className="text-slate-600 mt-0.5">{item.remarks}</p>}
            </div>
            <span className="text-slate-400 tabular-nums shrink-0">
              {formatDateTime(item.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
