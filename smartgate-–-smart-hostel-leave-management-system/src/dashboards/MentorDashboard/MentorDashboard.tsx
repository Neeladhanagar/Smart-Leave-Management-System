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
  statusDistribution: Array<{ stage: string; regular: number }>;
}

export function MentorDashboard() {
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
      label: 'Pending Mentor Reviews',
      icon: ClipboardCheck,
      badge: overview?.stats.pendingMentor || 0,
    },
    { id: 'all-leaves', label: 'Department Leaves', icon: History },
    { id: 'students', label: 'Student Sem Days', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'pending':
        return (
          <RegularLeaveQueuePanel
            title="Coordinator-Approved Leaves (Mentor Queue)"
            description="Approving automatically checks semester approved days: >5 days routes to HOD; <=5 days skips HOD directly to SWO."
            filterMode="PENDING_STAGE"
            targetPendingStatus="PENDING_MENTOR"
            canDecide={true}
            roleLabel="Mentor"
            isMentor={true}
            onDecisionSuccess={loadOverview}
          />
        );
      case 'all-leaves':
        return (
          <RegularLeaveQueuePanel
            title="All Department Regular Leaves"
            description="Review historical and ongoing regular leaves."
            filterMode="ALL"
            canDecide={false}
            roleLabel="Mentor"
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
                label="Pending Mentor Action"
                value={overview.stats.pendingMentor || 0}
                tone="amber"
                sublabel="Coordinator cleared"
              />
              <StatCard
                label="Routed to HOD (>5d)"
                value={overview.stats.pendingHod || 0}
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
                Mentee Regular Leave Outcomes
              </h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.statusDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                    <Tooltip />
                    <Bar dataKey="regular" name="Regular Leaves" fill="#1E3A8A" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <RegularLeaveQueuePanel
              title="Pending Mentor Approvals"
              description="Conditional HOD routing (>5 prior approved days in semester) is enforced automatically on approval."
              filterMode="PENDING_STAGE"
              targetPendingStatus="PENDING_MENTOR"
              canDecide={true}
              roleLabel="Mentor"
              isMentor={true}
              onDecisionSuccess={loadOverview}
            />
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      title="Faculty Mentor Leave Review"
      description="Second-stage review with automated semester leave-day calculation and conditional HOD routing."
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
