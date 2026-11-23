import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { QRPass } from '../types';
import { DataTable, type ColumnDef } from './DataTable';
import { StatusBadge } from './StatusBadge';
import { LoadingSkeleton } from './LoadingSkeleton';
import { formatDateTime } from '../utils/formatters';

export function QRPassOverviewPanel() {
  const { showToast } = useToast();
  const [passes, setPasses] = useState<QRPass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiRequest<{ passes: QRPass[] }>('/qr-passes');
        setPasses(data.passes);
      } catch (err) {
        showToast((err as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingSkeleton rows={5} />;

  const columns: ColumnDef<QRPass>[] = [
    {
      key: 'pass',
      header: 'Pass ID',
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
      key: 'validity',
      header: 'Validity Window',
      render: (r) => (
        <div className="text-xs tabular-nums">
          <div>From: {formatDateTime(r.departureDate)}</div>
          <div className="text-slate-600">Until: {formatDateTime(r.approvedReturnDate)}</div>
        </div>
      ),
    },
    {
      key: 'issued',
      header: 'Issued By',
      render: (r) => <span className="text-xs text-slate-700">{r.issuedBy}</span>,
    },
    {
      key: 'status',
      header: 'Pass Status',
      render: (r) => (
        <div className="space-y-1">
          <StatusBadge status={r.status} />
          {r.replacedByPassId && (
            <div className="text-[11px] font-mono text-slate-500">
              → {r.replacedByPassId}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">QR Pass Registry</h2>
        <p className="text-sm text-slate-500">
          All issued, active, used, expired, and extension-revoked QR gate passes.
        </p>
      </div>
      <DataTable
        data={passes}
        columns={columns}
        keyExtractor={(r) => r._id}
        searchPlaceholder="Search pass ID, leave code, student, or USN..."
        searchFilter={(r, q) =>
          r.passId.toLowerCase().includes(q) ||
          r.leaveRequestCode.toLowerCase().includes(q) ||
          r.studentName.toLowerCase().includes(q) ||
          r.usn.toLowerCase().includes(q)
        }
        statusAccessor={(r) => r.status}
        statusOptions={[
          { label: 'Active', value: 'ACTIVE' },
          { label: 'Used', value: 'USED' },
          { label: 'Revoked', value: 'REVOKED' },
          { label: 'Expired', value: 'EXPIRED' },
        ]}
        emptyTitle="No QR passes issued yet"
        emptyDescription="QR passes generated upon final Warden or AO approval will appear here."
      />
    </div>
  );
}
