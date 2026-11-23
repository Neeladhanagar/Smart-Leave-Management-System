import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
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
  statusDistribution: Array<{ stage: string; regular: number; emergency: number }>;
}

export function CoordinatorDashboard() {
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
      label: 'Pending Reviews',
      icon: ClipboardCheck,
      badge: overview?.stats.pendingCoordinator || 0,
    },
    { id: 'all-leaves', label: 'Department Leaves', icon: History },
    { id: 'students', label: 'Student History', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'pending':
        return (
          <RegularLeaveQueuePanel
            title="Pending Coordinator Reviews"
            description="Review student regular leave applications, verify parent contacts, and forward approved requests to Mentor."
            filterMode="PENDING_STAGE"
            targetPendingStatus="PENDING_COORDINATOR"
            canDecide={true}
            roleLabel="Coordinator"
            onDecisionSuccess={loadOverview}
          />
        );
      case 'all-leaves':
        return (
          <RegularLeaveQueuePanel
            title="Department Regular Leave History"
            description="Complete log of regular leaves in your department."
            filterMode="ALL"
            canDecide={false}
            roleLabel="Coordinator"
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
                label="Pending Coordinator"
                value={overview.stats.pendingCoordinator || 0}
                tone="amber"
                sublabel="Awaiting initial verification"
              />
              <StatCard
                label="Total Department Regular"
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
                Department Regular Leave Status Overview
              </h2>
              <div className="h-60">
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
              title="Awaiting Coordinator Action"
              description="Approve to forward to Mentor, or reject with remarks."
              filterMode="PENDING_STAGE"
              targetPendingStatus="PENDING_COORDINATOR"
              canDecide={true}
              roleLabel="Coordinator"
              onDecisionSuccess={loadOverview}
            />
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      title="Coordinator Leave Verification Desk"
      description="First-stage verification of regular leave requests before forwarding to Faculty Mentor."
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
