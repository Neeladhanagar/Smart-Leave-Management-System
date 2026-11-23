import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  AlertTriangle,
  Clock3,
  History,
  QrCode,
  MapPin,
  Bell,
  User,
  Check,
  X,
  Eye,
  FileText,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { DashboardLayout, type NavItem } from '../../components/DashboardLayout';
import { StatCard } from '../../components/StatCard';
import { DataTable, type ColumnDef } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmModal } from '../../components/ConfirmModal';
import { LeaveDetailModal } from '../../components/LeaveDetailModal';
import { ExtensionQueuePanel } from '../../components/ExtensionQueuePanel';
import { QRPassOverviewPanel } from '../../components/QRPassOverviewPanel';
import { SharedLocationsPanel } from '../../components/SharedLocationsPanel';
import { NotificationsPage } from '../../components/NotificationsPage';
import { ProfilePanel } from '../../components/ProfilePanel';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../services/api';
import type { EmergencyLeave } from '../../types';
import { formatDateTime } from '../../utils/formatters';

interface OverviewData {
  stats: Record<string, number>;
  statusDistribution: Array<{ stage: string; emergency: number }>;
}

export function AODashboard() {
  const { unreadNotifications } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [emergencies, setEmergencies] = useState<EmergencyLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLeave, setDetailLeave] = useState<EmergencyLeave | null>(null);
  const [decisionState, setDecisionState] = useState<{
    leave: EmergencyLeave;
    action: 'APPROVE' | 'REJECT';
  } | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ov, emg] = await Promise.all([
        apiRequest<OverviewData>('/dashboard/overview'),
        apiRequest<{ leaves: EmergencyLeave[] }>('/leaves/emergency'),
      ]);
      setOverview(ov);
      setEmergencies(emg.leaves);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleConfirmDecision = async (remarks: string) => {
    if (!decisionState) return;
    setProcessing(true);
    try {
      const res = await apiRequest<{ message: string }>(
        `/leaves/emergency/${decisionState.leave._id}/decide`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision: decisionState.action,
            remarks,
          }),
        }
      );
      showToast(res.message || 'Emergency decision saved.', 'success');
      setDecisionState(null);
      await loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const pendingList = emergencies.filter((e) => e.status === 'PENDING_AO');

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'AO Overview', icon: LayoutDashboard },
    {
      id: 'pending',
      label: 'Pending Emergency',
      icon: AlertTriangle,
      badge: pendingList.length,
    },
    {
      id: 'extensions',
      label: 'Emergency Extensions',
      icon: Clock3,
      badge: overview?.stats.pendingExtensionsAo || 0,
    },
    { id: 'history', label: 'Emergency History', icon: History },
    { id: 'qr-passes', label: 'QR Pass Registry', icon: QrCode },
    { id: 'locations', label: 'Student Live Tracking', icon: MapPin },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const columns: ColumnDef<EmergencyLeave>[] = [
    {
      key: 'code',
      header: 'Emergency ID',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-slate-900">{r.requestCode}</div>
          <div className="text-xs text-red-700 font-medium">{r.emergencyType}</div>
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
      header: 'Departure → Return',
      render: (r) => (
        <div className="text-xs tabular-nums">
          <div className="font-medium text-slate-900">{formatDateTime(r.departureDate)}</div>
          <div className="text-slate-500">to {formatDateTime(r.approvedReturnDate)}</div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason & Proof',
      render: (r) => (
        <div className="space-y-1 max-w-xs">
          <p className="text-xs text-slate-700 line-clamp-2">{r.reason}</p>
          {r.documentUrl && (
            <a
              href={r.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline"
            >
              <FileText className="w-3 h-3" />
              View Document
            </a>
          )}
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
      header: 'AO Decision',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDetailLeave(r)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Eye className="w-3.5 h-3.5" />
            Details
          </button>
          {r.status === 'PENDING_AO' && (
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

  const renderContent = () => {
    switch (activeTab) {
      case 'pending':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Pending Emergency Leave Requests
              </h2>
              <p className="text-sm text-slate-500">
                Direct AO clearance generates a scannable QR Gate Pass immediately without
                Coordinator, Mentor, HOD, SWO, or Warden bottlenecks.
              </p>
            </div>
            <DataTable
              data={pendingList}
              columns={columns}
              keyExtractor={(r) => r._id}
              searchPlaceholder="Search emergency ID, student, USN, or reason..."
              searchFilter={(r, q) =>
                r.requestCode.toLowerCase().includes(q) ||
                r.studentName.toLowerCase().includes(q) ||
                r.usn.toLowerCase().includes(q) ||
                r.reason.toLowerCase().includes(q)
              }
              emptyTitle="No pending emergency requests"
              emptyDescription="All submitted emergency leave requests have been decided."
            />
          </div>
        );
      case 'extensions':
        return <ExtensionQueuePanel mode="AO" onDecisionSuccess={loadAll} />;
      case 'history':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Emergency Leave History</h2>
              <p className="text-sm text-slate-500">
                Complete audit log of approved, rejected, active, and returned emergency leaves.
              </p>
            </div>
            <DataTable
              data={emergencies}
              columns={columns}
              keyExtractor={(r) => r._id}
              searchPlaceholder="Search emergency history..."
              searchFilter={(r, q) =>
                r.requestCode.toLowerCase().includes(q) ||
                r.studentName.toLowerCase().includes(q) ||
                r.usn.toLowerCase().includes(q)
              }
              statusAccessor={(r) => r.status}
              statusOptions={[
                { label: 'Pending AO', value: 'PENDING_AO' },
                { label: 'Approved', value: 'APPROVED' },
                { label: 'Exited Hostel', value: 'EXITED' },
                { label: 'Overdue', value: 'OVERDUE' },
                { label: 'Returned', value: 'RETURNED' },
                { label: 'Rejected', value: 'REJECTED' },
              ]}
            />
          </div>
        );
      case 'qr-passes':
        return <QRPassOverviewPanel />;
      case 'locations':
        return <SharedLocationsPanel />;
      case 'notifications':
        return <NotificationsPage />;
      case 'profile':
        return <ProfilePanel />;
      case 'dashboard':
      default:
        if (loading || !overview) return <LoadingSkeleton rows={5} />;
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Pending AO Decision"
                value={overview.stats.pendingEmergencyAo || 0}
                tone="amber"
                sublabel="Direct emergency queue"
              />
              <StatCard
                label="Approved Emergency"
                value={overview.stats.approvedEmergency || 0}
                tone="emerald"
              />
              <StatCard
                label="Rejected Emergency"
                value={overview.stats.rejectedEmergency || 0}
                tone="red"
              />
              <StatCard
                label="Pending Emergency Extensions"
                value={overview.stats.pendingExtensionsAo || 0}
                tone="indigo"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-4">
                Emergency Leave Outcomes
              </h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.statusDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                    <Tooltip />
                    <Bar
                      dataKey="emergency"
                      name="Emergency Leaves"
                      fill="#DC2626"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-base font-semibold text-slate-900">
                Urgent Emergency Leaves Awaiting AO Action
              </h2>
              <DataTable
                data={pendingList}
                columns={columns}
                keyExtractor={(r) => r._id}
                emptyTitle="No pending emergency leaves"
                emptyDescription="New emergency requests submitted by students appear here immediately."
              />
            </div>
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      title="Administrative Officer (AO) Emergency Desk"
      description="Final authority for emergency leave approvals, emergency extensions, and immediate emergency QR pass issuance."
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onOpenNotifications={() => setActiveTab('notifications')}
      onOpenProfile={() => setActiveTab('profile')}
    >
      {renderContent()}

      <LeaveDetailModal
        open={Boolean(detailLeave)}
        leaveType="EMERGENCY"
        leave={detailLeave}
        onClose={() => setDetailLeave(null)}
      />

      <ConfirmModal
        open={Boolean(decisionState)}
        title={
          decisionState?.action === 'APPROVE'
            ? `Approve Emergency Leave ${decisionState.leave.requestCode}?`
            : `Reject Emergency Leave ${decisionState?.leave.requestCode}?`
        }
        description={
          decisionState?.action === 'APPROVE'
            ? `Approving immediately generates an Emergency QR Gate Pass for ${decisionState.leave.studentName} and notifies SWO and Warden for information.`
            : `Rejecting ${decisionState?.leave.requestCode} denies emergency clearance and notifies the student.`
        }
        confirmLabel={decisionState?.action === 'APPROVE' ? 'Approve & Issue QR' : 'Confirm Rejection'}
        variant={decisionState?.action === 'APPROVE' ? 'primary' : 'danger'}
        showRemarks={true}
        remarksRequired={decisionState?.action === 'REJECT'}
        loading={processing}
        onConfirm={handleConfirmDecision}
        onClose={() => setDecisionState(null)}
      />
    </DashboardLayout>
  );
}
