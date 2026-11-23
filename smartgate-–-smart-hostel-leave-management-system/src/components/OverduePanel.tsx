import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { DataTable, type ColumnDef } from './DataTable';
import { StatusBadge } from './StatusBadge';
import { LoadingSkeleton } from './LoadingSkeleton';
import { ConfirmModal } from './ConfirmModal';
import { formatDateTime } from '../utils/formatters';

interface OverdueLeaveItem {
  _id: string;
  leaveType: 'REGULAR' | 'EMERGENCY';
  requestCode: string;
  studentName: string;
  usn: string;
  department: string;
  parentContact: string;
  departureDate: string;
  approvedReturnDate: string;
  overdueAt?: string;
  status: string;
  activeQrPassId?: { passId: string } | string;
}

export function OverduePanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<OverdueLeaveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lateTarget, setLateTarget] = useState<OverdueLeaveItem | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ overdue: OverdueLeaveItem[] }>('/gate/overdue');
      setItems(data.overdue);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleLateReturn = async (remarks: string) => {
    if (!lateTarget) return;
    setProcessing(true);
    try {
      const passId =
        typeof lateTarget.activeQrPassId === 'object'
          ? lateTarget.activeQrPassId?.passId
          : undefined;
      await apiRequest('/gate/return', {
        method: 'POST',
        body: JSON.stringify({
          passId,
          leaveRefId: lateTarget._id,
          leaveType: lateTarget.leaveType,
          lateReturnAuthorized: true,
          lateReturnReason: remarks,
          remarks: 'Authorized late-return security exception',
        }),
      });
      showToast(`Late return recorded for ${lateTarget.studentName}.`, 'success');
      setLateTarget(null);
      await load();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={5} />;

  const columns: ColumnDef<OverdueLeaveItem>[] = [
    {
      key: 'code',
      header: 'Leave & Type',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-slate-900">{r.requestCode}</div>
          <div className="text-xs text-slate-500">{r.leaveType}</div>
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
      key: 'parent',
      header: 'Parent Contact',
      render: (r) => <span className="font-mono text-xs text-slate-700">{r.parentContact}</span>,
    },
    {
      key: 'deadline',
      header: 'Missed Deadline',
      render: (r) => (
        <div className="text-xs tabular-nums">
          <div className="text-red-700 font-semibold">{formatDateTime(r.approvedReturnDate)}</div>
          {r.overdueAt && (
            <div className="text-slate-500">Flagged {formatDateTime(r.overdueAt)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    ...(user?.role === 'SECURITY'
      ? [
          {
            key: 'action',
            header: 'Late Return Exception',
            align: 'right' as const,
            render: (r: OverdueLeaveItem) => (
              <button
                type="button"
                onClick={() => setLateTarget(r)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg whitespace-nowrap"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Record Late Return
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Overdue Students</h2>
          <p className="text-sm text-slate-500">
            Leaves whose approved return deadline has passed without recorded digital gate return.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync Overdue
        </button>
      </div>

      <DataTable
        data={items}
        columns={columns}
        keyExtractor={(r) => r._id}
        searchPlaceholder="Search overdue student by name, USN, or request ID..."
        searchFilter={(r, q) =>
          r.studentName.toLowerCase().includes(q) ||
          r.usn.toLowerCase().includes(q) ||
          r.requestCode.toLowerCase().includes(q)
        }
        emptyTitle="No overdue students"
        emptyDescription="All active leaves are currently within their approved return deadlines."
      />

      <ConfirmModal
        open={Boolean(lateTarget)}
        title={`Authorize Late Return: ${lateTarget?.studentName}`}
        description="The QR pass for this leave is expired. Recording an authorized late return logs RETURNED_LATE with timestamp and notifies SWO and Warden without treating the expired QR pass as valid."
        confirmLabel="Record RETURNED_LATE"
        variant="primary"
        showRemarks={true}
        remarksRequired={true}
        remarksPlaceholder="Enter verified reason for late return (e.g., train delay, parent confirmation)..."
        loading={processing}
        onConfirm={handleLateReturn}
        onClose={() => setLateTarget(null)}
      />
    </div>
  );
}
