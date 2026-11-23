import React, { useState, useEffect } from 'react';
import { Eye, QrCode } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import type { LeaveApplication, EmergencyLeave } from '../../types';
import { DataTable, type ColumnDef } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { LeaveDetailModal } from '../../components/LeaveDetailModal';
import { formatDateTime } from '../../utils/formatters';

interface MyLeaveApplicationsProps {
  onOpenQrGenerator: (leaveId: string) => void;
}

type CombinedLeave =
  | (LeaveApplication & { kind: 'REGULAR' })
  | (EmergencyLeave & { kind: 'EMERGENCY' });

export function MyLeaveApplications({ onOpenQrGenerator }: MyLeaveApplicationsProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<CombinedLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{
    kind: 'REGULAR' | 'EMERGENCY';
    leave: LeaveApplication | EmergencyLeave;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [reg, emg] = await Promise.all([
          apiRequest<{ leaves: LeaveApplication[] }>('/leaves/regular'),
          apiRequest<{ leaves: EmergencyLeave[] }>('/leaves/emergency'),
        ]);
        const merged: CombinedLeave[] = [
          ...reg.leaves.map((l) => ({ ...l, kind: 'REGULAR' as const })),
          ...emg.leaves.map((l) => ({ ...l, kind: 'EMERGENCY' as const })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setItems(merged);
      } catch (err) {
        showToast((err as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingSkeleton rows={6} />;

  const columns: ColumnDef<CombinedLeave>[] = [
    {
      key: 'code',
      header: 'Request ID',
      render: (row) => (
        <div>
          <div className="font-mono font-semibold text-slate-900">{row.requestCode}</div>
          <div className="text-xs text-slate-500">
            {row.kind === 'REGULAR' ? 'Regular Leave' : 'Emergency Leave'}
          </div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Leave Window',
      render: (row) => (
        <div className="text-xs tabular-nums">
          <div className="text-slate-900 font-medium">{formatDateTime(row.departureDate)}</div>
          <div className="text-slate-500">to {formatDateTime(row.approvedReturnDate)}</div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => <span className="text-xs text-slate-700 line-clamp-2 max-w-xs">{row.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelected({ kind: row.kind, leave: row })}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Eye className="w-3.5 h-3.5" />
            Track
          </button>
          {row.activeQrPassId && (
            <button
              type="button"
              onClick={() => onOpenQrGenerator(row._id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg whitespace-nowrap"
            >
              <QrCode className="w-3.5 h-3.5" />
              QR Pass
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">My Leave Applications</h2>
        <p className="text-sm text-slate-500">
          Track stage-by-stage approvals, HOD conditional routing, and active QR gate passes.
        </p>
      </div>

      <DataTable
        data={items}
        columns={columns}
        keyExtractor={(r) => r._id}
        searchPlaceholder="Search by Request ID or reason..."
        searchFilter={(r, q) =>
          r.requestCode.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q) ||
          r.kind.toLowerCase().includes(q)
        }
        statusAccessor={(r) => r.status}
        statusOptions={[
          { label: 'Pending Coordinator', value: 'PENDING_COORDINATOR' },
          { label: 'Pending Mentor', value: 'PENDING_MENTOR' },
          { label: 'Pending HOD', value: 'PENDING_HOD' },
          { label: 'Pending SWO', value: 'PENDING_SWO' },
          { label: 'Pending Warden', value: 'PENDING_WARDEN' },
          { label: 'Pending AO', value: 'PENDING_AO' },
          { label: 'Approved', value: 'APPROVED' },
          { label: 'Exited Hostel', value: 'EXITED' },
          { label: 'Overdue', value: 'OVERDUE' },
          { label: 'Returned', value: 'RETURNED' },
          { label: 'Rejected', value: 'REJECTED' },
        ]}
        emptyTitle="No leave applications found"
        emptyDescription="Submit a Regular or Emergency leave application to track it here."
      />

      <LeaveDetailModal
        open={Boolean(selected)}
        leaveType={selected?.kind || 'REGULAR'}
        leave={selected?.leave || null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
