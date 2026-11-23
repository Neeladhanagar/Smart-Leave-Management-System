import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  AlertTriangle,
  Clock3,
  ShieldAlert,
  MapPin,
  Bell,
  User,
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
import { OverduePanel } from '../../components/OverduePanel';
import { SharedLocationsPanel } from '../../components/SharedLocationsPanel';
import { NotificationsPage } from '../../components/NotificationsPage';
import { ProfilePanel } from '../../components/ProfilePanel';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../services/api';
import type { EmergencyLeave, EmergencyLeaveExtension, AuditLogItem } from '../../types';
import { formatDateTime } from '../../utils/formatters';

interface OverviewData {
  stats: Record<string, number>;
  statusDistribution: Array<{ stage: string; emergency: number }>;
}

export function EmergencyControlDashboard() {
  const { unreadNotifications } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [emergencies, setEmergencies] = useState<EmergencyLeave[]>([]);
  const [extensions, setExtensions] = useState<EmergencyLeaveExtension[]>([]);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [ov, emg, ext, aud] = await Promise.all([
          apiRequest<OverviewData>('/dashboard/overview'),
          apiRequest<{ leaves: EmergencyLeave[] }>('/leaves/emergency'),
          apiRequest<{ emergencyExtensions: EmergencyLeaveExtension[] }>('/extensions'),
          apiRequest<{ logs: AuditLogItem[] }>('/admin/audit-logs'),
        ]);
        setOverview(ov);
        setEmergencies(emg.leaves);
        setExtensions(ext.emergencyExtensions);
        setLogs(
          aud.logs.filter(
            (l) =>
              l.entityType.includes('Emergency') ||
              l.action.includes('EMERGENCY') ||
              l.action.includes('GATE')
          )
        );
      } catch (err) {
        showToast((err as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Emergency Overview', icon: LayoutDashboard },
    { id: 'emergencies', label: 'Emergency Leave History', icon: AlertTriangle },
    { id: 'extensions', label: 'Emergency Extensions', icon: Clock3 },
    { id: 'overdue', label: 'Overdue Alerts', icon: ShieldAlert },
    { id: 'logs', label: 'Emergency Activity Logs', icon: ShieldAlert },
    { id: 'locations', label: 'Student Live Tracking', icon: MapPin },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const emgColumns: ColumnDef<EmergencyLeave>[] = [
    {
      key: 'code',
      header: 'Request ID',
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
          <div>{formatDateTime(r.departureDate)}</div>
          <div className="text-slate-500">to {formatDateTime(r.approvedReturnDate)}</div>
        </div>
      ),
    },
    {
      key: 'remarks',
      header: 'AO Decision Remarks',
      render: (r) => (
        <span className="text-xs text-slate-600">{r.aoRemarks || 'Awaiting AO decision'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  const extColumns: ColumnDef<EmergencyLeaveExtension>[] = [
    {
      key: 'code',
      header: 'Extension ID',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-slate-900">{r.extensionCode}</div>
          <div className="text-xs font-mono text-slate-500">{r.leaveRequestCode}</div>
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
      header: 'Original → Requested',
      render: (r) => (
        <div className="text-xs tabular-nums">
          <div>{formatDateTime(r.originalReturnDate)}</div>
          <div className="text-indigo-800 font-semibold">
            {formatDateTime(r.requestedReturnDate)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'emergencies':
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Emergency Leave History</h2>
            <DataTable
              data={emergencies}
              columns={emgColumns}
              keyExtractor={(r) => r._id}
              searchPlaceholder="Search emergency request..."
              searchFilter={(r, q) =>
                r.requestCode.toLowerCase().includes(q) ||
                r.studentName.toLowerCase().includes(q) ||
                r.usn.toLowerCase().includes(q)
              }
            />
          </div>
        );
      case 'extensions':
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Emergency Extension History</h2>
            <DataTable
              data={extensions}
              columns={extColumns}
              keyExtractor={(r) => r._id}
            />
          </div>
        );
      case 'overdue':
        return <OverduePanel />;
      case 'logs':
        return (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {logs.map((l) => (
              <div key={l._id} className="px-5 py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <span className="font-mono font-semibold text-slate-900">{l.action}</span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span className="text-slate-700">{l.details}</span>
                </div>
                <span className="text-slate-400 tabular-nums shrink-0">
                  {formatDateTime(l.createdAt)}
                </span>
              </div>
            ))}
          </div>
        );
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
                label="Total Emergency Requests"
                value={overview.stats.totalEmergencyLeaves || 0}
              />
              <StatCard
                label="Pending AO Decisions"
                value={overview.stats.pendingEmergencyAo || 0}
                tone="amber"
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
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-4">
                Emergency Case Distribution
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
                      name="Emergency Cases"
                      fill="#DC2626"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <DataTable
              data={emergencies.slice(0, 8)}
              columns={emgColumns}
              keyExtractor={(r) => r._id}
            />
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      title="Emergency Control Centre"
      description="24x7 monitoring of emergency leave filings, AO decisions, emergency extensions, and live shared student locations."
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onOpenNotifications={() => setActiveTab('notifications')}
      onOpenProfile={() => setActiveTab('profile')}
    >
      {renderContent()}
    </DashboardLayout>
  );
}
