import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  QrCode,
  ShieldCheck,
  Search,
  TicketCheck,
  Clock3,
  AlertTriangle,
  DoorOpen,
  MapPin,
  Bell,
} from 'lucide-react';
import { DashboardLayout, type NavItem } from '../../components/DashboardLayout';
import { StatCard } from '../../components/StatCard';
import { QRPassOverviewPanel } from '../../components/QRPassOverviewPanel';
import { OverduePanel } from '../../components/OverduePanel';
import { GateHistoryPanel } from '../../components/GateHistoryPanel';
import { SharedLocationsPanel } from '../../components/SharedLocationsPanel';
import { NotificationsPage } from '../../components/NotificationsPage';
import { DataTable, type ColumnDef } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../services/api';
import type { LeaveExtension, EmergencyLeaveExtension } from '../../types';
import { formatDateTime } from '../../utils/formatters';
import { QRScannerView } from './QRScannerView';

interface StudentSearchRow {
  _id: string;
  usn: string;
  department: string;
  semester: number;
  section: string;
  hostelBlock: string;
  roomNumber: string;
  parentPhone: string;
  userId: { name: string; email: string; phone?: string };
}

export function SecurityDashboard() {
  const { unreadNotifications } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState<Record<string, number>>({});
  const [students, setStudents] = useState<StudentSearchRow[]>([]);
  const [extensions, setExtensions] = useState<
    Array<(LeaveExtension | EmergencyLeaveExtension) & { kind: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ov, stu, ext] = await Promise.all([
        apiRequest<{ stats: Record<string, number> }>('/dashboard/overview'),
        apiRequest<{ students: StudentSearchRow[] }>('/gate/students'),
        apiRequest<{
          regularExtensions: LeaveExtension[];
          emergencyExtensions: EmergencyLeaveExtension[];
        }>('/extensions'),
      ]);
      setStats(ov.stats);
      setStudents(stu.students);
      setExtensions([
        ...ext.regularExtensions.map((e) => ({ ...e, kind: 'REGULAR' })),
        ...ext.emergencyExtensions.map((e) => ({ ...e, kind: 'EMERGENCY' })),
      ]);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'scanner', label: 'QR Scanner', icon: QrCode },
    { id: 'verify', label: 'Verify Pass', icon: ShieldCheck },
    { id: 'student-search', label: 'Student Search', icon: Search },
    { id: 'approved-passes', label: 'Approved Passes', icon: TicketCheck },
    { id: 'extension-updates', label: 'Extension Updates', icon: Clock3 },
    {
      id: 'overdue',
      label: 'Overdue Students',
      icon: AlertTriangle,
      badge: stats.overdueCount || 0,
    },
    { id: 'gate-history', label: 'Digital Gate History', icon: DoorOpen },
    { id: 'locations', label: 'Student Live Tracking', icon: MapPin },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
  ];

  const studentColumns: ColumnDef<StudentSearchRow>[] = [
    {
      key: 'name',
      header: 'Student',
      render: (r) => (
        <div>
          <div className="font-semibold text-slate-900">{r.userId?.name}</div>
          <div className="text-xs font-mono text-slate-500">{r.usn}</div>
        </div>
      ),
    },
    {
      key: 'dept',
      header: 'Academic',
      render: (r) => (
        <span className="text-xs text-slate-700">
          {r.department} · Sem {r.semester} · Sec {r.section}
        </span>
      ),
    },
    {
      key: 'hostel',
      header: 'Hostel & Room',
      render: (r) => (
        <span className="text-xs text-slate-700">
          {r.hostelBlock} · {r.roomNumber}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Student / Parent Contact',
      render: (r) => (
        <div className="text-xs font-mono text-slate-700">
          <div>{r.userId?.phone || '—'}</div>
          <div className="text-slate-500">Parent: {r.parentPhone}</div>
        </div>
      ),
    },
  ];

  const extColumns: ColumnDef<(LeaveExtension | EmergencyLeaveExtension) & { kind: string }>[] = [
    {
      key: 'code',
      header: 'Extension ID',
      render: (r) => (
        <div>
          <div className="font-mono font-semibold text-slate-900">{r.extensionCode}</div>
          <div className="text-xs font-mono text-slate-500">
            {r.leaveRequestCode} · {r.kind}
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
          <div className="text-xs font-mono text-slate-500">{r.usn}</div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Updated Return Window',
      render: (r) => (
        <div className="text-xs tabular-nums">
          <div className="text-slate-500">Orig: {formatDateTime(r.originalReturnDate)}</div>
          <div className="text-indigo-800 font-semibold">
            Req: {formatDateTime(r.requestedReturnDate)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Approval Status (Read-Only)',
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'scanner':
        return <QRScannerView initialMode="scanner" onGateRecorded={loadData} />;
      case 'verify':
        return <QRScannerView initialMode="manual" onGateRecorded={loadData} />;
      case 'student-search':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Student Directory Search</h2>
              <p className="text-sm text-slate-500">
                Verify student identity, hostel block, room number, and parent emergency contact.
              </p>
            </div>
            <DataTable
              data={students}
              columns={studentColumns}
              keyExtractor={(r) => r._id}
              searchPlaceholder="Search by student name, USN, or department..."
              searchFilter={(r, q) =>
                (r.userId?.name || '').toLowerCase().includes(q) ||
                r.usn.toLowerCase().includes(q) ||
                r.department.toLowerCase().includes(q)
              }
            />
          </div>
        );
      case 'approved-passes':
        return <QRPassOverviewPanel />;
      case 'extension-updates':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Extension Updates (Read-Only)
              </h2>
              <p className="text-sm text-slate-500">
                Security cannot approve extensions. Monitor approved return deadline updates here.
              </p>
            </div>
            <DataTable
              data={extensions}
              columns={extColumns}
              keyExtractor={(r) => r._id}
              searchPlaceholder="Search extension or student..."
              searchFilter={(r, q) =>
                r.extensionCode.toLowerCase().includes(q) ||
                r.studentName.toLowerCase().includes(q) ||
                r.usn.toLowerCase().includes(q)
              }
            />
          </div>
        );
      case 'overdue':
        return <OverduePanel />;
      case 'gate-history':
        return <GateHistoryPanel />;
      case 'locations':
        return <SharedLocationsPanel />;
      case 'notifications':
        return <NotificationsPage />;
      case 'dashboard':
      default:
        if (loading) return <LoadingSkeleton rows={5} />;
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Active QR Passes"
                value={stats.activeQrPasses || 0}
                tone="indigo"
              />
              <StatCard
                label="Currently Exited"
                value={stats.currentlyExited || 0}
                tone="amber"
              />
              <StatCard
                label="Overdue Students"
                value={stats.overdueCount || 0}
                tone="red"
              />
              <StatCard
                label="Late Returns Logged"
                value={stats.returnedLateCount || 0}
              />
            </div>

            <QRScannerView initialMode="scanner" onGateRecorded={loadData} />
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      title="Security Gate Control & QR Scanner"
      description="Verify student QR gate passes, record digital exits and returns, and handle authorized late-return exceptions."
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onOpenNotifications={() => setActiveTab('notifications')}
      headerAction={
        <button
          type="button"
          onClick={() => setActiveTab('scanner')}
          className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg whitespace-nowrap"
        >
          <QrCode className="w-3.5 h-3.5" />
          Open QR Scanner
        </button>
      }
    >
      {renderContent()}
    </DashboardLayout>
  );
}
