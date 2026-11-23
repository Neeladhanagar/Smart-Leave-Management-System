import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FilePlus2,
  AlertTriangle,
  ClipboardList,
  Clock3,
  QrCode,
  CreditCard,
  MapPin,
  Bell,
  User,
  Plus,
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
import { StatusBadge } from '../../components/StatusBadge';
import { LeaveTimeline } from '../../components/LeaveTimeline';
import { NotificationsPage } from '../../components/NotificationsPage';
import { ProfilePanel } from '../../components/ProfilePanel';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../services/api';
import type { LeaveApplication, EmergencyLeave, QRPass } from '../../types';
import { formatDateTime } from '../../utils/formatters';

import { ApplyRegularLeave } from './ApplyRegularLeave';
import { ApplyEmergencyLeave } from './ApplyEmergencyLeave';
import { MyLeaveApplications } from './MyLeaveApplications';
import { LeaveExtensionPage } from './LeaveExtensionPage';
import { QRPassGenerator } from './QRPassGenerator';
import { MyQRPasses } from './MyQRPasses';
import { ShareLocationPage } from './ShareLocationPage';

interface StudentOverviewResponse {
  stats: {
    totalLeaves: number;
    approvedLeaves: number;
    pendingLeaves: number;
    rejectedLeaves: number;
    activeQrPasses: number;
    approvedDaysInSem: number;
    pendingExtensions: number;
  };
  currentLeaveStatus: string;
  latestLeave: ((LeaveApplication | EmergencyLeave) & { type: 'REGULAR' | 'EMERGENCY' }) | null;
  recentRegularLeaves: LeaveApplication[];
  recentEmergencyLeaves: EmergencyLeave[];
  qrPasses: QRPass[];
  chartData: Array<{ name: string; count: number }>;
}

export function StudentDashboard() {
  const { unreadNotifications, studentProfile } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [qrTargetLeaveId, setQrTargetLeaveId] = useState<string | null>(null);
  const [overview, setOverview] = useState<StudentOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<StudentOverviewResponse>('/dashboard/overview');
      setOverview(data);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadOverview();
    }
  }, [activeTab]);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'apply-regular', label: 'Apply Regular Leave', icon: FilePlus2 },
    { id: 'apply-emergency', label: 'Apply Emergency Leave', icon: AlertTriangle },
    { id: 'my-leaves', label: 'My Leave Applications', icon: ClipboardList },
    { id: 'extensions', label: 'Leave Extension', icon: Clock3 },
    { id: 'qr-generator', label: 'QR Pass Generator', icon: QrCode },
    { id: 'my-qr-passes', label: 'My QR Passes', icon: CreditCard },
    { id: 'share-location', label: 'Location Tracking', icon: MapPin },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unreadNotifications,
    },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const openQrForLeave = (leaveId: string) => {
    setQrTargetLeaveId(leaveId);
    setActiveTab('qr-generator');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'apply-regular':
        return <ApplyRegularLeave onSubmitted={() => setActiveTab('my-leaves')} />;
      case 'apply-emergency':
        return <ApplyEmergencyLeave onSubmitted={() => setActiveTab('my-leaves')} />;
      case 'my-leaves':
        return <MyLeaveApplications onOpenQrGenerator={openQrForLeave} />;
      case 'extensions':
        return <LeaveExtensionPage />;
      case 'qr-generator':
        return (
          <QRPassGenerator
            initialLeaveId={qrTargetLeaveId}
            onApplyLeave={() => setActiveTab('apply-regular')}
          />
        );
      case 'my-qr-passes':
        return <MyQRPasses />;
      case 'share-location':
        return <ShareLocationPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'profile':
        return <ProfilePanel />;
      case 'dashboard':
      default: {
        if (loading || !overview) return <LoadingSkeleton rows={6} />;

        const recentCombined = [
          ...overview.recentRegularLeaves.map((l) => ({ ...l, kind: 'REGULAR' as const })),
          ...overview.recentEmergencyLeaves.map((l) => ({ ...l, kind: 'EMERGENCY' as const })),
        ]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 6);

        return (
          <div className="space-y-6">
            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span>
                  USN: <strong className="font-mono text-slate-900">{studentProfile?.usn}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Current Leave Status:{' '}
                  <strong className="text-indigo-700">
                    {overview.currentLeaveStatus.replace(/_/g, ' ')}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Sem {studentProfile?.semester} Approved Days:{' '}
                  <strong className="tabular-nums text-slate-900">
                    {overview.stats.approvedDaysInSem} days
                  </strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('apply-regular')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Apply Regular Leave
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('apply-emergency')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Emergency Leave
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('qr-generator')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  QR Pass Generator
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard label="Total Applications" value={overview.stats.totalLeaves} />
              <StatCard
                label="Approved Leaves"
                value={overview.stats.approvedLeaves}
                tone="emerald"
              />
              <StatCard label="Pending Leaves" value={overview.stats.pendingLeaves} tone="amber" />
              <StatCard label="Rejected Leaves" value={overview.stats.rejectedLeaves} tone="red" />
              <StatCard
                label="Active QR Passes"
                value={overview.stats.activeQrPasses}
                tone="indigo"
              />
            </div>

            {/* Chart + Latest Application Status Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  Leave Activity Summary
                </h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#4338CA" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Latest Application Status Timeline
                  </h2>
                  {overview.latestLeave && <StatusBadge status={overview.latestLeave.status} />}
                </div>
                {overview.latestLeave ? (
                  <>
                    <div className="text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900">
                        {overview.latestLeave.requestCode}
                      </span>{' '}
                      · {overview.latestLeave.type} ·{' '}
                      {formatDateTime(overview.latestLeave.departureDate)} to{' '}
                      {formatDateTime(overview.latestLeave.approvedReturnDate)}
                    </div>
                    <LeaveTimeline
                      leaveType={overview.latestLeave.type}
                      leave={overview.latestLeave}
                    />
                  </>
                ) : (
                  <EmptyState
                    title="No leave submitted yet"
                    description="Submit a leave application to inspect live stage progression here."
                  />
                )}
              </div>
            </div>

            {/* Recent Leave Applications Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Recent Leave Applications</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('my-leaves')}
                  className="text-xs font-semibold text-indigo-700 hover:text-indigo-800"
                >
                  View all
                </button>
              </div>
              {recentCombined.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No recent applications"
                    description="Your recent regular and emergency leaves will appear here."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                        <th className="px-4 py-3">Request ID</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Departure → Return</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {recentCombined.map((item) => (
                        <tr key={item._id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                            {item.requestCode}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{item.kind}</td>
                          <td className="px-4 py-3 text-xs text-slate-700 tabular-nums">
                            {formatDateTime(item.departureDate)} →{' '}
                            {formatDateTime(item.approvedReturnDate)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.activeQrPassId ? (
                              <button
                                type="button"
                                onClick={() => openQrForLeave(item._id)}
                                className="text-xs font-semibold text-indigo-700 hover:text-indigo-800"
                              >
                                Open QR Pass
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActiveTab('my-leaves')}
                                className="text-xs font-medium text-slate-600 hover:text-slate-900"
                              >
                                View
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      }
    }
  };

  return (
    <DashboardLayout
      title="Student Hostel Leave Portal"
      description="Apply for regular or emergency leave, track multi-stage approvals, request extensions, and generate official QR gate passes."
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onOpenNotifications={() => setActiveTab('notifications')}
      onOpenProfile={() => setActiveTab('profile')}
      headerAction={
        <button
          type="button"
          onClick={() => setActiveTab('qr-generator')}
          className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors whitespace-nowrap"
        >
          <QrCode className="w-3.5 h-3.5" />
          QR Pass Generator
        </button>
      }
    >
      {renderContent()}
    </DashboardLayout>
  );
}
