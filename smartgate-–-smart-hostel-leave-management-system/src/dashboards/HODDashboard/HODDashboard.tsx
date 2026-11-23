import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  ShieldAlert,
  History,
  Users,
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
import { StudentHistoryPanel } from '../../components/StudentHistoryPanel';
import { NotificationsPage } from '../../components/NotificationsPage';
import { ProfilePanel } from '../../components/ProfilePanel';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../services/api';

interface OverviewData {
  stats: Record<string, number>;
  statusDistribution: Array<{ stage: string; regular: number }>;
}

export function HODDashboard() {
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
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'pending',
      label: 'HOD Escalations (>5d)',
      icon: ShieldAlert,
      badge: overview?.stats.pendingHod || 0,
    },
    { id: 'all-leaves', label: 'Department History', icon: History },
    { id: 'students', label: 'Student Sem Days', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'pending':
        return (
          <RegularLeaveQueuePanel
            title="Mandatory HOD Approvals (>5 Approved Days)"
            description="Only students whose previously approved regular leave days in the current semester exceed 5 days appear here."
            filterMode="PENDING_STAGE"
            targetPendingStatus="PENDING_HOD"
            canDecide={true}
            roleLabel="HOD"
            onDecisionSuccess={loadOverview}
          />
        );
      case 'all-leaves':
        return (
          <RegularLeaveQueuePanel
            title="Department Leave Records"
            description="Historical regular leaves for your department."
            filterMode="ALL"
            canDecide={false}
            roleLabel="HOD"
          />
        );
      case 'students':
        return <StudentHistoryPanel />;
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
                label="Pending HOD Escalations"
                value={overview.stats.pendingHod || 0}
                tone="amber"
                sublabel=">5 prior approved days"
              />
              <StatCard
                label="Total Dept Regular Leaves"
                value={overview.stats.totalRegularLeaves || 0}
                tone="indigo"
              />
              <StatCard
                label="Approved Regular"
                value={overview.stats.approvedRegular || 0}
                tone="emerald"
              />
              <StatCard
                label="Rejected Regular"
                value={overview.stats.rejectedRegular || 0}
                tone="red"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-4">
                Department Leave Distribution
              </h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.statusDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                    <Tooltip />
                    <Bar dataKey="regular" name="Regular Leaves" fill="#4338CA" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <RegularLeaveQueuePanel
              title="Escalated Applications Requiring HOD Clearance"
              description="Approve to forward to SWO, or reject with remarks."
              filterMode="PENDING_STAGE"
              targetPendingStatus="PENDING_HOD"
              canDecide={true}
              roleLabel="HOD"
              onDecisionSuccess={loadOverview}
            />
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      title="HOD Conditional Leave Escalation Desk"
      description="Reviews regular leave applications only when a student exceeds 5 approved regular leave days in the current semester."
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
