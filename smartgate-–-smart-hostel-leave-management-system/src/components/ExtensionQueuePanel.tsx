import React, { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { LeaveExtension, EmergencyLeaveExtension } from '../types';
import { DataTable, type ColumnDef } from './DataTable';
import { StatusBadge } from './StatusBadge';
import { LoadingSkeleton } from './LoadingSkeleton';
import { ConfirmModal } from './ConfirmModal';
import { formatDateTime } from '../utils/formatters';

interface ExtensionQueuePanelProps {
  mode: 'SWO' | 'WARDEN' | 'AO' | 'ALL_VIEW';
  onDecisionSuccess?: () => void;
}

type UnifiedExtension =
  | (LeaveExtension & { kind: 'REGULAR' })
  | (EmergencyLeaveExtension & { kind: 'EMERGENCY' });

export function ExtensionQueuePanel({ mode, onDecisionSuccess }: ExtensionQueuePanelProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<UnifiedExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionState, setDecisionState] = useState<{
    ext: UnifiedExtension;
    action: 'APPROVE' | 'REJECT';
  } | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{
        regularExtensions: LeaveExtension[];
        emergencyExtensions: EmergencyLeaveExtension[];
      }>('/extensions');

      let combined: UnifiedExtension[] = [];
      if (mode === 'SWO') {
        combined = data.regularExtensions
          .filter((e) => e.status === 'PENDING_SWO')
          .map((e) => ({ ...e, kind: 'REGULAR' as const }));
      } else if (mode === 'WARDEN') {
        combined = data.regularExtensions
          .filter((e) => e.status === 'PENDING_WARDEN')
          .map((e) => ({ ...e, kind: 'REGULAR' as const }));
      } else if (mode === 'AO') {
        combined = data.emergencyExtensions.map((e) => ({ ...e, kind: 'EMERGENCY' as const }));
      } else {
        combined = [
          ...data.regularExtensions.map((e) => ({ ...e, kind: 'REGULAR' as const })),
          ...data.emergencyExtensions.map((e) => ({ ...e, kind: 'EMERGENCY' as const })),
        ];
      }

      setItems(
        combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [mode]);

  const handleConfirm = async (remarks: string) => {
    if (!decisionState) return;
    setProcessing(true);
    try {
      const endpoint =
        decisionState.ext.kind === 'REGULAR'
          ? `/extensions/regular/${decisionState.ext._id}/decide`
          : `/extensions/emergency/${decisionState.ext._id}/decide`;
      const res = await apiRequest<{ message: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          decision: decisionState.action,
          remarks,
        }),
      });
      showToast(res.message || 'Extension decision saved.', 'success');
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

  const canDecideRow = (row: UnifiedExtension) => {
    if (mode === 'SWO' && row.kind === 'REGULAR' && row.status === 'PENDING_SWO') return true;
    if (mode === 'WARDEN' && row.kind === 'REGULAR' && row.status === 'PENDING_WARDEN') return true;
    if (mode === 'AO' && row.kind === 'EMERGENCY' && row.status === 'PENDING_AO') return true;
    return false;
  };

  const columns: ColumnDef<UnifiedExtension>[] = [
    {
      key: 'code',
      header: 'Extension ID',
      render: (r) => (
        <div className="space-y-1">
          <div className="font-mono font-semibold text-slate-900">{r.extensionCode}</div>
          <div className="text-xs text-slate-500">
            Leave: <span className="font-mono">{r.leaveRequestCode}</span> · {r.kind}
          </div>
          {r.isLateExtension && <StatusBadge status="LATE_EXTENSION_REQUEST" />}
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.studentName}</div>
          <div className="text-xs font-mono text-slate-500">
            {r.usn} · {r.department}
          </div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Original → Requested Return',
      render: (r) => (
        <div className="text-xs tabular-nums">
          <div className="text-slate-600">Orig: {formatDateTime(r.originalReturnDate)}</div>
          <div className="text-indigo-800 font-semibold">
            New: {formatDateTime(r.requestedReturnDate)}
          </div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r) => <span className="text-xs text-slate-700 line-clamp-2 max-w-xs">{r.reason}</span>,
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
      render: (r) =>
        canDecideRow(r) ? (
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDecisionState({ ext: r, action: 'APPROVE' })}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              Approve
            </button>
            <button
              type="button"
              onClick={() => setDecisionState({ ext: r, action: 'REJECT' })}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              Reject
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Reviewed</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          {mode === 'AO'
            ? 'Emergency Leave Extensions (AO)'
            : mode === 'WARDEN'
            ? 'Final Extension Approvals (Warden)'
            : mode === 'SWO'
            ? 'Pending Regular Leave Extensions (SWO)'
            : 'All Leave Extensions'}
        </h2>
        <p className="text-sm text-slate-500">
          {mode === 'WARDEN' || mode === 'AO'
            ? 'Final approval updates the return deadline, revokes the old QR pass, and generates a replacement QR pass.'
            : 'Regular extensions route SWO → Warden. Emergency extensions route directly to AO.'}
        </p>
      </div>

      <DataTable
        data={items}
        columns={columns}
        keyExtractor={(r) => r._id}
        searchPlaceholder="Search extension ID, leave code, student, or USN..."
        searchFilter={(r, q) =>
          r.extensionCode.toLowerCase().includes(q) ||
          r.leaveRequestCode.toLowerCase().includes(q) ||
          r.studentName.toLowerCase().includes(q) ||
          r.usn.toLowerCase().includes(q)
        }
        emptyTitle="No extension requests in this queue"
        emptyDescription="Extension requests assigned to this stage will appear here."
      />

      <ConfirmModal
        open={Boolean(decisionState)}
        title={
          decisionState?.action === 'APPROVE'
            ? `Approve Extension ${decisionState.ext.extensionCode}?`
            : `Reject Extension ${decisionState?.ext.extensionCode}?`
        }
        description={
          decisionState?.action === 'APPROVE'
            ? mode === 'WARDEN' || mode === 'AO'
              ? 'Final approval will update the approved return date, revoke the previous QR pass, and generate a replacement QR pass.'
              : 'SWO approval forwards this regular extension to Warden for final decision.'
            : 'Rejecting retains the original approved return deadline unchanged.'
        }
        confirmLabel={decisionState?.action === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
        variant={decisionState?.action === 'APPROVE' ? 'primary' : 'danger'}
        showRemarks={true}
        remarksRequired={decisionState?.action === 'REJECT'}
        loading={processing}
        onConfirm={handleConfirm}
        onClose={() => setDecisionState(null)}
      />
    </div>
  );
}
