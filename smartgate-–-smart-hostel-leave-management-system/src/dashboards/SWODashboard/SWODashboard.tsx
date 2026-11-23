import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
  Clock3,
  CheckCircle2,
  XCircle,
  Users,
  AlertTriangle,
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
import { RegularLeaveQueuePanel } from '../../components/RegularLeaveQueuePanel';
import { ExtensionQueuePanel } from '../../components/ExtensionQueuePanel';
import { StudentHistoryPanel } from '../../components/StudentHistoryPanel';
import { OverduePanel } from '../../components/OverduePanel';
import { SharedLocationsPanel } from '../../components/SharedLocationsPanel';
import { NotificationsPage } from '../../components/NotificationsPage';
import { ProfilePanel } from '../../components/ProfilePanel';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../services/api';

interface OverviewData {
  stats: Record<string, number>;
  departmentChart: Array<{ department: string; regular: number; emergency: number }>;
}

export function SWODashboard() {
  const { unreadNotifications } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<OverviewData>('/dashboard/overview');
      setOverview(data);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
    {
      id: 'pending-leaves',
      label: 'Pending Regular Leaves',
      icon: ClipboardCheck,
      badge: overview?.stats.pendingSwo || 0,
    },
    {
      id: 'pending-extensions',
      label: 'Pending Extensions',
      icon: Clock3,
      badge: overview?.stats.pendingExtensionsSwo || 0,
    },
    { id: 'approved', label: 'Approved Applications', icon: CheckCircle2 },
    { id: 'rejected', label: 'Rejected Applications', icon: XCircle },
    { id: 'students', label: 'Student Leave History', icon: Users },
    {
      id: 'overdue',
      label: 'Overdue Students',
      icon: AlertTriangle,
      badge: overview?.stats.overdueCount || 0,
    },
    { id: 'locations', label: 'Student Live Tracking', icon: MapPin },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'pending-leaves':
        return (
          <RegularLeaveQueuePanel
            title="Pending SWO Regular Leave Approvals"
            description="Review Mentor/HOD cleared regular leaves and forward to Warden for final clearance."
            filterMode="PENDING_STAGE"
            targetPendingStatus="PENDING_SWO"
            canDecide={true}
            roleLabel="SWO"
            onDecisionSuccess={loadOverview}
          />
        );
      case 'pending-extensions':
        return <ExtensionQueuePanel mode="SWO" onDecisionSuccess={loadOverview} />;
      case 'approved':
        return (
          <RegularLeaveQueuePanel
            title="Approved Regular Applications"
            description="All regular leaves that completed final approval."
            filterMode="APPROVED"
            canDecide={false}
            roleLabel="SWO"
          />
        );
      case 'rejected':
        return (
          <RegularLeaveQueuePanel
            title="Rejected Regular Applications"
            description="Regular leave applications rejected across stages."
            filterMode="REJECTED"
            canDecide={false}
            roleLabel="SWO"
          />
        );
      case 'students':
        return <StudentHistoryPanel />;
      case 'overdue':
        return <OverduePanel />;
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
                label="Pending Regular Leaves"
                value={overview.stats.pendingSwo || 0}
                tone="amber"
              />
              <StatCard
                label="Pending Extensions"
                value={overview.stats.pendingExtensionsSwo || 0}
                tone="indigo"
              />
              <StatCard
                label="Approved Regular"
                value={overview.stats.approvedRegular || 0}
                tone="emerald"
              />
              <StatCard
                label="Overdue Students"
                value={overview.stats.overdueCount || 0}
                tone="red"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-4">
                Leave Volume by Department
              </h2>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.departmentChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="department" tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                    <Tooltip />
                    <Bar dataKey="regular" name="Regular" fill="#4338CA" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="emergency" name="Emergency" fill="#DC2626" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <RegularLeaveQueuePanel
              title="Awaiting SWO Review"
              description="Note: SWO handles regular leaves and regular extensions only. Emergency leaves are handled solely by AO."
              filterMode="PENDING_STAGE"
              targetPendingStatus="PENDING_SWO"
              canDecide={true}
              roleLabel="SWO"
              onDecisionSuccess={loadOverview}
            />
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      title="Student Welfare Officer (SWO) Dashboard"
      description="Reviews regular leave applications after Mentor/HOD and evaluates standard & late regular leave extensions."
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
