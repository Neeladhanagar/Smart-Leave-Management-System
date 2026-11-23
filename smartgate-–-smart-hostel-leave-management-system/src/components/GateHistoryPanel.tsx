import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { GateActivity } from '../types';
import { DataTable, type ColumnDef } from './DataTable';
import { StatusBadge } from './StatusBadge';
import { LoadingSkeleton } from './LoadingSkeleton';
import { formatDateTime } from '../utils/formatters';

export function GateHistoryPanel() {
  const { showToast } = useToast();
  const [activities, setActivities] = useState<GateActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiRequest<{ activities: GateActivity[] }>('/gate/history');
        setActivities(data.activities);
      } catch (err) {
        showToast((err as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingSkeleton rows={5} />;

  const columns: ColumnDef<GateActivity>[] = [
    {
      key: 'pass',
      header: 'Pass & Leave ID',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-slate-900">{r.passId}</div>
          <div className="text-xs font-mono text-slate-500">
            {r.leaveRequestCode} · {r.leaveType}
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
          <div className="text-xs font-mono text-slate-500">
            {r.usn} · {r.department}
          </div>
        </div>
      ),
    },
    {
      key: 'exit',
      header: 'Exit Recorded',
      render: (r) => (
        <div className="text-xs tabular-nums">
          <div className="text-slate-900">{formatDateTime(r.exitTime)}</div>
          <div className="text-slate-500">{r.exitRecordedByName || '—'}</div>
        </div>
      ),
    },
    {
      key: 'return',
      header: 'Return Recorded',
      render: (r) => (
        <div className="text-xs tabular-nums">
          <div className="text-slate-900">{formatDateTime(r.returnTime)}</div>
          <div className="text-slate-500">
            {r.isLateReturn ? `Late: ${r.lateReturnReason}` : r.returnRecordedByName || 'Awaiting return'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Gate Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Digital Gate Exit &amp; Return Logs</h2>
        <p className="text-sm text-slate-500">
          Immutable gate movement audit showing verified QR exits, timely returns, and authorized
          late returns.
        </p>
      </div>
      <DataTable
        data={activities}
        columns={columns}
        keyExtractor={(r) => r._id}
        searchPlaceholder="Search pass ID, leave code, or student..."
        searchFilter={(r, q) =>
          r.passId.toLowerCase().includes(q) ||
          r.leaveRequestCode.toLowerCase().includes(q) ||
          r.studentName.toLowerCase().includes(q) ||
          r.usn.toLowerCase().includes(q)
        }
        statusAccessor={(r) => r.status}
        statusOptions={[
          { label: 'Exited Hostel', value: 'EXITED' },
          { label: 'Returned', value: 'RETURNED' },
          { label: 'Returned Late', value: 'RETURNED_LATE' },
        ]}
        emptyTitle="No gate records yet"
        emptyDescription="Digital gate exits and returns recorded by Security will appear here."
      />
    </div>
  );
}
