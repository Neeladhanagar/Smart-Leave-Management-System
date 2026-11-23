import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
  Clock3,
  CheckCircle2,
  XCircle,
  QrCode,
  AlertTriangle,
  DoorOpen,
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
import { QRPassOverviewPanel } from '../../components/QRPassOverviewPanel';
import { OverduePanel } from '../../components/OverduePanel';
import { GateHistoryPanel } from '../../components/GateHistoryPanel';
import { SharedLocationsPanel } from '../../components/SharedLocationsPanel';
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

export function WardenDashboard() {
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
      label: 'Final Leave Approvals',
      icon: ClipboardCheck,
      badge: overview?.stats.pendingWarden || 0,
    },
    {
      id: 'pending-extensions',
      label: 'Final Extension Approvals',
      icon: Clock3,
      badge: overview?.stats.pendingExtensionsWarden || 0,
    },
    { id: 'approved', label: 'Approved Applications', icon: CheckCircle2 },
    { id: 'rejected', label: 'Rejected Applications', icon: XCircle },
    { id: 'qr-passes', label: 'QR Pass Overview', icon: QrCode },
    {
      id: 'overdue',
      label: 'Overdue Students',
      icon: AlertTriangle,
      badge: overview?.stats.overdueCount || 0,
    },
    { id: 'gate-activity', label: 'Digital Gate Activity', icon: DoorOpen },
    { id: 'locations', label: 'Student Live Tracking', icon: MapPin },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'pending-leaves':
        return (
          <RegularLeaveQueuePanel
            title="Warden Final Regular Leave Approvals"
            description="Final approval automatically generates a cryptographically signed QR Gate Pass for the student."
            filterMode="PENDING_STAGE"
            targetPendingStatus="PENDING_WARDEN"
            canDecide={true}
            roleLabel="Warden"
            isWarden={true}
            onDecisionSuccess={loadOverview}
          />
        );
      case 'pending-extensions':
        return <ExtensionQueuePanel mode="WARDEN" onDecisionSuccess={loadOverview} />;
      case 'approved':
        return (
          <RegularLeaveQueuePanel
            title="Approved Regular Applications"
            description="All regular leaves cleared by Warden."
            filterMode="APPROVED"
            canDecide={false}
            roleLabel="Warden"
          />
        );
      case 'rejected':
        return (
          <RegularLeaveQueuePanel
            title="Rejected Regular Applications"
            description="Regular leave applications rejected across stages."
            filterMode="REJECTED"
            canDecide={false}
            roleLabel="Warden"
          />
        );
      case 'qr-passes':
        return <QRPassOverviewPanel />;
      case 'overdue':
        return <OverduePanel />;
      case 'gate-activity':
        return <GateHistoryPanel />;
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard
                label="Pending Final Approval"
                value={overview.stats.pendingWarden || 0}
                tone="amber"
              />
              <StatCard
                label="Pending Extensions"
                value={overview.stats.pendingExtensionsWarden || 0}
                tone="indigo"
              />
              <StatCard
                label="Active QR Passes"
                value={overview.stats.activeQrPasses || 0}
                tone="emerald"
              />
              <StatCard
                label="Currently Exited"
                value={overview.stats.currentlyExited || 0}
              />
              <StatCard
                label="Overdue Students"
                value={overview.stats.overdueCount || 0}
                tone="red"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-4">
                Hostel Leave &amp; Gate Status Distribution
              </h2>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.statusDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                    <Tooltip />
                    <Bar dataKey="regular" name="Regular" fill="#1E3A8A" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="emergency" name="Emergency" fill="#DC2626" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <RegularLeaveQueuePanel
              title="Ready for Final Warden Decision"
              description="Approving issues a scannable QR Gate Pass immediately."
              filterMode="PENDING_STAGE"
              targetPendingStatus="PENDING_WARDEN"
              canDecide={true}
              roleLabel="Warden"
              isWarden={true}
              onDecisionSuccess={loadOverview}
            />
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      title="Hostel Warden Final Clearance Portal"
      description="Final approving authority for regular leaves and regular extensions, with QR pass issuance and gate oversight."
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
