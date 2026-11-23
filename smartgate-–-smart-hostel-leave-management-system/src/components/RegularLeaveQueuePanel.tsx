import React, { useState, useEffect } from 'react';
import { Check, X, Eye } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { LeaveApplication } from '../types';
import { DataTable, type ColumnDef } from './DataTable';
import { StatusBadge } from './StatusBadge';
import { LoadingSkeleton } from './LoadingSkeleton';
import { ConfirmModal } from './ConfirmModal';
import { LeaveDetailModal } from './LeaveDetailModal';
import { formatDateTime } from '../utils/formatters';

interface RegularLeaveQueuePanelProps {
  title: string;
  description: string;
  filterMode: 'PENDING_STAGE' | 'APPROVED' | 'REJECTED' | 'ALL';
  targetPendingStatus?: string;
  canDecide: boolean;
  roleLabel: string;
  isMentor?: boolean;
  isWarden?: boolean;
  onDecisionSuccess?: () => void;
}

export function RegularLeaveQueuePanel({
  title,
  description,
  filterMode,
  targetPendingStatus,
  canDecide,
  roleLabel,
  isMentor = false,
  isWarden = false,
  onDecisionSuccess,
}: RegularLeaveQueuePanelProps) {
  const { showToast } = useToast();
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLeave, setDetailLeave] = useState<LeaveApplication | null>(null);
  const [decisionState, setDecisionState] = useState<{
    leave: LeaveApplication;
    action: 'APPROVE' | 'REJECT';
  } | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ leaves: LeaveApplication[] }>('/leaves/regular');
      let list = data.leaves;

      if (filterMode === 'PENDING_STAGE' && targetPendingStatus) {
        list = list.filter((l) => l.status === targetPendingStatus);
      } else if (filterMode === 'APPROVED') {
        const approvedSet = new Set(['APPROVED', 'EXITED', 'OVERDUE', 'RETURNED', 'RETURNED_LATE']);
        list = list.filter((l) => approvedSet.has(l.status));
      } else if (filterMode === 'REJECTED') {
        list = list.filter((l) => l.status === 'REJECTED');
      }

      setLeaves(list);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filterMode, targetPendingStatus]);

  const handleConfirmDecision = async (remarks: string) => {
    if (!decisionState) return;
    setProcessing(true);
    try {
      const res = await apiRequest<{ message: string }>(`/leaves/regular/${decisionState.leave._id}/decide`, {
        method: 'POST',
        body: JSON.stringify({
          decision: decisionState.action,
          remarks,
        }),
      });
      showToast(res.message || 'Leave decision recorded.', 'success');
      setDecisionState(null);
      await load();
      onDecisionSuccess?.();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={5} />;

  const columns: ColumnDef<LeaveApplication>[] = [
    {
      key: 'code',
      header: 'Request ID',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-slate-900">{r.requestCode}</div>
          <div className="text-xs text-slate-500">
            {r.department} · Sem {r.semester} · Sec {r.section}
          </div>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.studentName}</div>
          <div className="text-xs font-mono text-slate-500">{r.usn}</div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Departure → Return',
      render: (r) => (
        <div className="text-xs tabular-nums">
          <div className="text-slate-900 font-medium">{formatDateTime(r.departureDate)}</div>
          <div className="text-slate-500">to {formatDateTime(r.approvedReturnDate)}</div>
        </div>
      ),
    },
    {
      key: 'hod',
      header: 'Sem Days / HOD Rule',
      render: (r) => (
        <div className="text-xs">
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {r.previousApprovedDaysInSem} d
          </span>
          <div className={r.hodRequired ? 'text-amber-700 font-medium' : 'text-slate-500'}>
            {r.hodRequired ? 'HOD Mandatory (>5d)' : 'HOD Skipped'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDetailLeave(r)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Eye className="w-3.5 h-3.5" />
            Inspect
          </button>
          {canDecide && targetPendingStatus && r.status === targetPendingStatus && (
            <>
              <button
                type="button"
                onClick={() => setDecisionState({ leave: r, action: 'APPROVE' })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                Approve
              </button>
              <button
                type="button"
                onClick={() => setDecisionState({ leave: r, action: 'REJECT' })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                Reject
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const getApproveDescription = (leave: LeaveApplication) => {
    if (isMentor) {
      return leave.previousApprovedDaysInSem > 5
        ? `Student has ${leave.previousApprovedDaysInSem} prior approved regular leave days (> 5). Approving will route this application to HOD for mandatory approval.`
        : `Student has ${leave.previousApprovedDaysInSem} prior approved regular leave days (<= 5). Approving will skip HOD and forward directly to SWO.`;
    }
    if (isWarden) {
      return `Granting final Warden approval for ${leave.requestCode} will immediately mark the leave APPROVED and generate a scannable QR Gate Pass for ${leave.studentName}.`;
    }
    return `Approve ${leave.requestCode} as ${roleLabel} and advance it to the next workflow stage.`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <DataTable
        data={leaves}
        columns={columns}
        keyExtractor={(r) => r._id}
        searchPlaceholder="Search by Request ID, student name, USN, or reason..."
        searchFilter={(r, q) =>
          r.requestCode.toLowerCase().includes(q) ||
          r.studentName.toLowerCase().includes(q) ||
          r.usn.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q)
        }
        emptyTitle="No leave requests in this queue"
        emptyDescription="Applications assigned to this view will appear here."
      />

      <LeaveDetailModal
        open={Boolean(detailLeave)}
        leaveType="REGULAR"
        leave={detailLeave}
        onClose={() => setDetailLeave(null)}
      />

      <ConfirmModal
        open={Boolean(decisionState)}
        title={
          decisionState?.action === 'APPROVE'
            ? `Approve ${decisionState.leave.requestCode}?`
            : `Reject ${decisionState?.leave.requestCode}?`
        }
        description={
          decisionState?.action === 'APPROVE'
            ? getApproveDescription(decisionState.leave)
            : `Rejecting ${decisionState?.leave.requestCode} will terminate the leave workflow and notify ${decisionState?.leave.studentName}.`
        }
        confirmLabel={decisionState?.action === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
        variant={decisionState?.action === 'APPROVE' ? 'primary' : 'danger'}
        showRemarks={true}
        remarksRequired={decisionState?.action === 'REJECT'}
        remarksPlaceholder={
          decisionState?.action === 'REJECT'
            ? 'Enter mandatory rejection reason...'
            : 'Optional authority remarks...'
        }
        loading={processing}
        onConfirm={handleConfirmDecision}
        onClose={() => setDecisionState(null)}
      />
    </div>
  );
}
