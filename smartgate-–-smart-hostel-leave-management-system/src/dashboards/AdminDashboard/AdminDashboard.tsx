import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Clock3,
  QrCode,
  DoorOpen,
  ShieldAlert,
  Settings,
  Bell,
  UserPlus,
  Power,
  Trash2,
  MapPin,
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
import { RegularLeaveQueuePanel } from '../../components/RegularLeaveQueuePanel';
import { ExtensionQueuePanel } from '../../components/ExtensionQueuePanel';
import { QRPassOverviewPanel } from '../../components/QRPassOverviewPanel';
import { GateHistoryPanel } from '../../components/GateHistoryPanel';
import { SharedLocationsPanel } from '../../components/SharedLocationsPanel';
import { NotificationsPage } from '../../components/NotificationsPage';
import { ConfirmModal } from '../../components/ConfirmModal';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../services/api';
import type { AuditLogItem, AppSettings, UserRole } from '../../types';
import { formatDateTime, ROLE_LABELS } from '../../utils/formatters';

interface AdminUserRow {
  id: string;
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  department?: string;
  isActive: boolean;
  createdAt?: string;
  accountStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'SUSPENDED' | 'PENDING_ACTIVATION' | 'DEACTIVATED';
  studentProfile?: {
    usn: string;
    semester: number;
    section: string;
    hostelBlock: string;
    roomNumber: string;
    parentName?: string;
    parentPhone: string;
  } | null;
  authorityProfile?: {
    employeeId: string;
    designation: string;
    officeLocation?: string;
    hostelName?: string;
    assignedHostelBlock?: string;
    assignedSection?: string;
    assignedStudentGroups?: string[];
    assignedGate?: string;
    dutyLocation?: string;
    shift?: string;
    assignedControlCentre?: string;
    administrativePermissions?: string[];
  } | null;
}

type RegistrationRequestFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
type AdminAccountStatus = NonNullable<AdminUserRow['accountStatus']>;
type AdminAccountStatusFilter = 'ALL' | AdminAccountStatus;

interface OverviewData {
  stats: Record<string, number>;
  departmentChart: Array<{ department: string; regular: number; emergency: number }>;
  recentAudits: AuditLogItem[];
}

interface RegistrationRequestRow {
  id: string;
  _id: string;
  name: string;
  email: string;
  phone: string;
  requestedRole: Exclude<UserRole, 'STUDENT' | 'ADMIN'>;
  employeeId?: string;
  studentId?: string;
  department?: string;
  details: Record<string, string>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNotes?: string;
  createdAt: string;
  createdUserId?: string;
}

const ADMIN_ROLE_ORDER: UserRole[] = [
  'STUDENT',
  'COORDINATOR',
  'MENTOR',
  'HOD',
  'SWO',
  'WARDEN',
  'AO',
  'SECURITY',
  'EMERGENCY_CONTROL',
  'ADMIN',
];

const ACCOUNT_STATUS_OPTIONS: Array<{ value: AdminAccountStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PENDING_ACTIVATION', label: 'Pending Activation' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'DEACTIVATED', label: 'Deactivated' },
  { value: 'REJECTED', label: 'Rejected' },
];

export function AdminDashboard() {
  const { unreadNotifications } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [registrationRequests, setRegistrationRequests] = useState<RegistrationRequestRow[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RegistrationRequestRow | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [pendingReview, setPendingReview] = useState<{
    request: RegistrationRequestRow;
    decision: 'approve' | 'reject';
  } | null>(null);
  const [requestFilter, setRequestFilter] = useState<RegistrationRequestFilter>('ALL');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState<AdminAccountStatusFilter>('ALL');
  const [audits, setAudits] = useState<AuditLogItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [createMode, setCreateMode] = useState<'NONE' | 'STUDENT' | 'AUTHORITY'>('NONE');
  const [archiveTarget, setArchiveTarget] = useState<AdminUserRow | null>(null);
  const [saving, setSaving] = useState(false);

  const requestCounts: Record<RegistrationRequestFilter, number> = {
    ALL: registrationRequests.length,
    PENDING: registrationRequests.filter((request) => request.status === 'PENDING').length,
    APPROVED: registrationRequests.filter((request) => request.status === 'APPROVED').length,
    REJECTED: registrationRequests.filter((request) => request.status === 'REJECTED').length,
  };
  const filteredRegistrationRequests = registrationRequests.filter(
    (request) => requestFilter === 'ALL' || request.status === requestFilter
  );
  const filteredUsers = users.filter((user) => {
    const status = user.accountStatus || (user.isActive ? 'ACTIVE' : 'SUSPENDED');
    return (
      (userRoleFilter === 'ALL' || user.role === userRoleFilter) &&
      (userStatusFilter === 'ALL' || status === userStatusFilter)
    );
  });
  const roleStatistics = ADMIN_ROLE_ORDER.map((role) => ({
    role,
    count: users.filter((user) => user.role === role).length,
  }));
  const approvedAccountCount = users.filter(
    (user) => user.accountStatus === 'APPROVED' || user.accountStatus === 'ACTIVE'
  ).length;

  // Student create form state
  const [stuForm, setStuForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    usn: '',
    department: 'CSE',
    semester: '6',
    section: 'A',
    hostelBlock: 'Sapphire Block',
    roomNumber: 'S-101',
    parentPhone: '',
  });

  // Authority create form state
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    role: 'COORDINATOR' as UserRole,
    phone: '',
    department: 'CSE',
    employeeId: '',
    designation: '',
    officeLocation: '',
    assignedHostelBlock: '',
    hostelName: '',
    assignedSection: '',
    assignedStudentGroups: '',
    assignedGate: '',
    dutyLocation: '',
    shift: '',
    assignedControlCentre: '',
    administrativePermissions: '',
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ov, usr, aud, setRes, requestRes] = await Promise.all([
        apiRequest<OverviewData>('/dashboard/overview'),
        apiRequest<{ users: AdminUserRow[] }>('/admin/users'),
        apiRequest<{ logs: AuditLogItem[] }>('/admin/audit-logs'),
        apiRequest<{ settings: AppSettings }>('/admin/settings'),
        apiRequest<{ requests: RegistrationRequestRow[] }>('/admin/registration-requests'),
      ]);
      setOverview(ov);
      setUsers(usr.users);
      setAudits(aud.logs);
      setSettings(setRes.settings);
      setRegistrationRequests(requestRes.requests);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/admin/students', {
        method: 'POST',
        body: JSON.stringify(stuForm),
      });
      showToast('Student account created successfully.', 'success');
      setCreateMode('NONE');
      setStuForm({
        name: '',
        email: '',
        password: '',
        phone: '',
        usn: '',
        department: 'CSE',
        semester: '6',
        section: 'A',
        hostelBlock: 'Sapphire Block',
        roomNumber: 'S-101',
        parentPhone: '',
      });
      await loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAuthority = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest<{ activationUrl?: string; message: string }>('/admin/authorities', {
        method: 'POST',
        body: JSON.stringify({
          ...authForm,
          assignedStudentGroups: authForm.assignedStudentGroups
            ? authForm.assignedStudentGroups.split(',').map((v) => v.trim()).filter(Boolean)
            : [],
          administrativePermissions: authForm.administrativePermissions
            ? authForm.administrativePermissions.split(',').map((v) => v.trim()).filter(Boolean)
            : [],
        }),
      });
      showToast(res.message, 'success');
      if (res.activationUrl) {
        void navigator.clipboard?.writeText(res.activationUrl);
      }
      setCreateMode('NONE');
      setAuthForm({
        name: '',
        email: '',
        role: 'COORDINATOR',
        phone: '',
        department: 'CSE',
        employeeId: '',
        designation: '',
        officeLocation: '',
        assignedHostelBlock: '',
        hostelName: '',
        assignedSection: '',
        assignedStudentGroups: '',
        assignedGate: '',
        dutyLocation: '',
        shift: '',
        assignedControlCentre: '',
        administrativePermissions: '',
      });
      await loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (userId: string) => {
    try {
      const res = await apiRequest<{ message: string }>(`/admin/users/${userId}/toggle-active`, {
        method: 'PUT',
      });
      showToast(res.message, 'success');
      await loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleRegistrationDecision = async (
    request: RegistrationRequestRow,
    decision: 'approve' | 'reject',
    reason = ''
  ) => {
    setSaving(true);
    try {
      const result = await apiRequest<{ message: string }>(
        `/admin/registration-requests/${request.id}/${decision}`,
        {
          method: 'POST',
          body: JSON.stringify(decision === 'reject' ? { reason } : {}),
        }
      );
      showToast(result.message, 'success');
      setSelectedRequest(null);
      setPendingReview(null);
      await loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSafeArchive = async () => {
    if (!archiveTarget) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ message: string }>(`/admin/users/${archiveTarget.id}`, {
        method: 'DELETE',
      });
      showToast(res.message, 'success');
      setArchiveTarget(null);
      await loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ message: string; settings: AppSettings }>('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      showToast(res.message, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'System Overview', icon: LayoutDashboard },
    { id: 'registration-requests', label: 'Registration Requests', icon: UserPlus, badge: requestCounts.PENDING },
    { id: 'users', label: 'Manage Users & Roles', icon: Users },
    { id: 'authorities', label: 'Authority Management', icon: ShieldAlert },
    { id: 'leaves', label: 'Leave Records', icon: ClipboardList },
    { id: 'extensions', label: 'Extension Records', icon: Clock3 },
    { id: 'qr-passes', label: 'QR Pass Records', icon: QrCode },
    { id: 'security-logs', label: 'Security Gate Logs', icon: DoorOpen },
    { id: 'locations', label: 'Student Live Tracking', icon: MapPin },
    { id: 'audit-logs', label: 'System Audit Logs', icon: ShieldAlert },
    { id: 'settings', label: 'Application Settings', icon: Settings },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
  ];

  const userColumns: ColumnDef<AdminUserRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: (r) => (
        <div>
          <div className="font-semibold text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-500">{r.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (r) => (
        <div>
          <div className="text-xs font-semibold text-indigo-700">{ROLE_LABELS[r.role]}</div>
          <div className="text-[11px] font-mono text-slate-500">
            {r.studentProfile?.usn || r.authorityProfile?.employeeId || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'dept',
      header: 'Department',
      render: (r) => <span className="text-xs text-slate-700">{r.department || 'ALL'}</span>,
    },
    {
      key: 'status',
      header: 'Account',
      render: (r) => {
        const status = r.accountStatus || (r.isActive ? 'ACTIVE' : 'SUSPENDED');
        const statusLabel =
          status === 'PENDING_ACTIVATION'
            ? 'Pending Activation'
            : status === 'DEACTIVATED'
              ? 'Deactivated'
              : status === 'APPROVED'
                ? 'Approved'
                : status.charAt(0) + status.slice(1).toLowerCase();
        return (
          <span
            className={`text-xs font-semibold ${
              status === 'PENDING_ACTIVATION' || status === 'PENDING'
                ? 'text-amber-700'
                : status === 'SUSPENDED' || status === 'DEACTIVATED' || status === 'REJECTED'
                  ? 'text-red-700'
                  : 'text-emerald-700'
            }`}
          >
            {statusLabel}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedUser(r)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
          >
            View Details
          </button>
          <button
            type="button"
            onClick={() => handleToggleActive(r.id)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <Power className="w-3.5 h-3.5" />
            {r.isActive ? 'Suspend' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={() => setArchiveTarget(r)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Archive
          </button>
        </div>
      ),
    },
  ];

  const auditColumns: ColumnDef<AuditLogItem>[] = [
    {
      key: 'time',
      header: 'Timestamp',
      render: (r) => (
        <span className="text-xs tabular-nums text-slate-500">{formatDateTime(r.createdAt)}</span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (r) => (
        <div className="text-xs">
          <strong className="text-slate-900">{r.actorName}</strong> ·{' '}
          <span className="text-indigo-700">{r.actorRole}</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (r) => <span className="font-mono text-xs font-semibold text-slate-800">{r.action}</span>,
    },
    {
      key: 'details',
      header: 'Details',
      render: (r) => <span className="text-xs text-slate-600">{r.details}</span>,
    },
  ];

  const registrationColumns: ColumnDef<RegistrationRequestRow>[] = [
    {
      key: 'applicant',
      header: 'Applicant',
      render: (request) => (
        <div>
          <div className="font-semibold text-slate-900">{request.name}</div>
          <div className="text-xs text-slate-500">{request.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Requested Role',
      render: (request) => <span className="text-xs font-semibold text-indigo-700">{ROLE_LABELS[request.requestedRole]}</span>,
    },
    {
      key: 'identifier',
      header: 'Student / Employee ID',
      render: (request) => <span className="font-mono text-xs text-slate-700">{request.studentId || request.employeeId || '—'}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (request) => <span className="text-xs text-slate-700">{request.phone}</span>,
    },
    {
      key: 'department',
      header: 'Department / Office',
      render: (request) => <span className="text-xs text-slate-700">{request.department || '—'}</span>,
    },
    {
      key: 'submitted',
      header: 'Submitted',
      render: (request) => <span className="text-xs text-slate-600">{formatDateTime(request.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Approval Status',
      render: (request) => (
        <span className={`text-xs font-bold ${request.status === 'PENDING' ? 'text-amber-700' : request.status === 'APPROVED' ? 'text-emerald-700' : 'text-red-700'}`}>
          {request.status}
        </span>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      align: 'right',
      render: (request) => (
        <button
          type="button"
          onClick={() => setSelectedRequest(request)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          View Details
        </button>
      ),
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'registration-requests':
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Registration Requests</h2>
              <p className="text-sm text-slate-500">
                Review historical requests from before direct registration. New public accounts are active immediately.
              </p>
            </div>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Registration request status">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  role="tab"
                  aria-selected={requestFilter === status}
                  onClick={() => setRequestFilter(status)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    requestFilter === status
                      ? 'bg-indigo-700 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {status === 'ALL' ? 'All Requests' : status.charAt(0) + status.slice(1).toLowerCase()}
                  <span className="ml-1.5 tabular-nums">{requestCounts[status]}</span>
                </button>
              ))}
            </div>
            {selectedRequest && (
              <section aria-labelledby="registration-details-heading" className="space-y-4 rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="registration-details-heading" className="text-base font-bold text-slate-900">
                      {selectedRequest.name} · {ROLE_LABELS[selectedRequest.requestedRole]}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Submitted {formatDateTime(selectedRequest.createdAt)} · Status: {selectedRequest.status}
                    </p>
                  </div>
                  <button type="button" onClick={() => setSelectedRequest(null)} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                    Close details
                  </button>
                </div>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Email</dt><dd className="break-all text-sm text-slate-900">{selectedRequest.email}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Phone</dt><dd className="text-sm text-slate-900">{selectedRequest.phone}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Student / Employee ID</dt><dd className="font-mono text-sm text-slate-900">{selectedRequest.studentId || selectedRequest.employeeId || '—'}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Department / Office</dt><dd className="text-sm text-slate-900">{selectedRequest.department || '—'}</dd></div>
                  {Object.entries(selectedRequest.details || {}).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-[11px] font-semibold uppercase text-slate-500">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</dt>
                      <dd className="text-sm text-slate-900">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
                {selectedRequest.reviewNotes && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                    Review note: {selectedRequest.reviewNotes}
                  </p>
                )}
                {selectedRequest.status === 'PENDING' && (
                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setPendingReview({ request: selectedRequest, decision: 'reject' })}
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setPendingReview({ request: selectedRequest, decision: 'approve' })}
                        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                )}
                {selectedRequest.status === 'APPROVED' && selectedRequest.createdUserId && (
                  <div className="border-t border-slate-100 pt-4">
                    <button type="button" onClick={() => void handleToggleActive(selectedRequest.createdUserId!)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      {users.find((user) => user.id === selectedRequest.createdUserId)?.isActive ? 'Suspend Account' : 'Activate Account'}
                    </button>
                  </div>
                )}
              </section>
            )}
            <DataTable
              data={filteredRegistrationRequests}
              columns={registrationColumns}
              keyExtractor={(request) => request.id}
              searchPlaceholder="Search applicant, role, ID, email, phone, or department..."
              searchFilter={(request, query) =>
                request.name.toLowerCase().includes(query) ||
                request.email.toLowerCase().includes(query) ||
                (request.employeeId || '').toLowerCase().includes(query) ||
                (request.studentId || '').toLowerCase().includes(query) ||
                request.phone.toLowerCase().includes(query) ||
                (request.department || '').toLowerCase().includes(query) ||
                request.requestedRole.toLowerCase().includes(query) ||
                request.status.toLowerCase().includes(query)
              }
            />
          </div>
        );
      case 'authorities':
        return (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Authority Management</h2>
                <p className="text-sm text-slate-500">
                  Create staff accounts and send them a secure password activation invitation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateMode(createMode === 'AUTHORITY' ? 'NONE' : 'AUTHORITY')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg"
              >
                <UserPlus className="w-4 h-4" />
                Create Authority Account
              </button>
            </div>

            {createMode === 'AUTHORITY' && (
              <form
                onSubmit={handleCreateAuthority}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <h3 className="text-sm font-semibold text-slate-900">Create Authority Account</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input required placeholder="Full Name" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input required placeholder="Employee ID / Staff ID" value={authForm.employeeId} onChange={(e) => setAuthForm({ ...authForm, employeeId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase" />
                  <input required type="email" placeholder="Official Institutional Email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input placeholder="Phone Number" value={authForm.phone} onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input required placeholder="Department" value={authForm.department} onChange={(e) => setAuthForm({ ...authForm, department: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input required placeholder="Designation" value={authForm.designation} onChange={(e) => setAuthForm({ ...authForm, designation: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <select value={authForm.role} onChange={(e) => setAuthForm({ ...authForm, role: e.target.value as UserRole })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="COORDINATOR">Coordinator</option>
                    <option value="MENTOR">Faculty Mentor</option>
                    <option value="HOD">HOD</option>
                    <option value="SWO">SWO</option>
                    <option value="WARDEN">Hostel Warden</option>
                    <option value="AO">Administrative Officer (AO)</option>
                    <option value="SECURITY">Security Guard</option>
                    <option value="EMERGENCY_CONTROL">Emergency Control Centre</option>
                    <option value="ADMIN">System Admin</option>
                  </select>
                  <input readOnly value="PENDING ACTIVATION" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800" />
                  <input placeholder="Office / Duty Location" value={authForm.officeLocation} onChange={(e) => setAuthForm({ ...authForm, officeLocation: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />

                  {(authForm.role === 'WARDEN') && (
                    <>
                      <input placeholder="Assigned Hostel Block" value={authForm.assignedHostelBlock} onChange={(e) => setAuthForm({ ...authForm, assignedHostelBlock: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      <input placeholder="Hostel Name" value={authForm.hostelName} onChange={(e) => setAuthForm({ ...authForm, hostelName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </>
                  )}
                  {(authForm.role === 'MENTOR' || authForm.role === 'COORDINATOR') && (
                    <>
                      <input placeholder="Assigned Section" value={authForm.assignedSection} onChange={(e) => setAuthForm({ ...authForm, assignedSection: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      <input placeholder="Student Groups (comma separated)" value={authForm.assignedStudentGroups} onChange={(e) => setAuthForm({ ...authForm, assignedStudentGroups: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </>
                  )}
                  {authForm.role === 'SECURITY' && (
                    <>
                      <input placeholder="Assigned Gate" value={authForm.assignedGate} onChange={(e) => setAuthForm({ ...authForm, assignedGate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      <input placeholder="Duty Location" value={authForm.dutyLocation} onChange={(e) => setAuthForm({ ...authForm, dutyLocation: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      <input placeholder="Shift" value={authForm.shift} onChange={(e) => setAuthForm({ ...authForm, shift: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </>
                  )}
                  {authForm.role === 'EMERGENCY_CONTROL' && (
                    <input placeholder="Assigned Control Centre" value={authForm.assignedControlCentre} onChange={(e) => setAuthForm({ ...authForm, assignedControlCentre: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  )}
                  {(authForm.role === 'ADMIN' || authForm.role === 'EMERGENCY_CONTROL') && (
                    <input placeholder="Administrative Permissions (comma separated)" value={authForm.administrativePermissions} onChange={(e) => setAuthForm({ ...authForm, administrativePermissions: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  No password is assigned here. The account will remain inactive until the secure invitation link is used.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setCreateMode('NONE')} className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg">
                    {saving ? 'Creating...' : 'Create Authority'}
                  </button>
                </div>
              </form>
            )}

            <DataTable
              data={users.filter((u) => u.role !== 'STUDENT')}
              columns={userColumns}
              keyExtractor={(r) => r.id}
              searchPlaceholder="Search authority name, email, employee ID, or role..."
            />
          </div>
        );
      case 'users':
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">User &amp; Role Management</h2>
                <p className="text-sm text-slate-500">
                  Add students, create authority accounts, assign roles, and safely manage status.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreateMode(createMode === 'STUDENT' ? 'NONE' : 'STUDENT')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg"
                >
                  <UserPlus className="w-4 h-4" />
                  Add Student
                </button>
              </div>
            </div>

            {selectedUser && (
              <section aria-labelledby="admin-user-details-heading" className="space-y-4 rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="admin-user-details-heading" className="text-base font-bold text-slate-900">
                      {selectedUser.name} · {ROLE_LABELS[selectedUser.role]}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Account status: {selectedUser.accountStatus || (selectedUser.isActive ? 'ACTIVE' : 'SUSPENDED')}
                    </p>
                  </div>
                  <button type="button" onClick={() => setSelectedUser(null)} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                    Close details
                  </button>
                </div>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Email</dt><dd className="break-all text-sm text-slate-900">{selectedUser.email}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Phone</dt><dd className="text-sm text-slate-900">{selectedUser.phone || '—'}</dd></div>
                  <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Department</dt><dd className="text-sm text-slate-900">{selectedUser.department || '—'}</dd></div>
                  {selectedUser.createdAt && (
                    <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Registered</dt><dd className="text-sm text-slate-900">{formatDateTime(selectedUser.createdAt)}</dd></div>
                  )}
                  {selectedUser.studentProfile && (
                    <>
                      <div><dt className="text-[11px] font-semibold uppercase text-slate-500">USN / Student ID</dt><dd className="font-mono text-sm text-slate-900">{selectedUser.studentProfile.usn}</dd></div>
                      <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Semester / Section</dt><dd className="text-sm text-slate-900">{selectedUser.studentProfile.semester} / {selectedUser.studentProfile.section}</dd></div>
                      <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Hostel / Room</dt><dd className="text-sm text-slate-900">{selectedUser.studentProfile.hostelBlock} / {selectedUser.studentProfile.roomNumber}</dd></div>
                      <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Parent Contact</dt><dd className="text-sm text-slate-900">{selectedUser.studentProfile.parentName ? `${selectedUser.studentProfile.parentName} · ` : ''}{selectedUser.studentProfile.parentPhone}</dd></div>
                    </>
                  )}
                  {selectedUser.authorityProfile && (
                    <>
                      <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Employee ID</dt><dd className="font-mono text-sm text-slate-900">{selectedUser.authorityProfile.employeeId}</dd></div>
                      <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Designation</dt><dd className="text-sm text-slate-900">{selectedUser.authorityProfile.designation}</dd></div>
                      {selectedUser.authorityProfile.officeLocation && <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Office / Location</dt><dd className="text-sm text-slate-900">{selectedUser.authorityProfile.officeLocation}</dd></div>}
                      {selectedUser.authorityProfile.assignedHostelBlock && <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Assigned Hostel</dt><dd className="text-sm text-slate-900">{selectedUser.authorityProfile.assignedHostelBlock}{selectedUser.authorityProfile.hostelName ? ` · ${selectedUser.authorityProfile.hostelName}` : ''}</dd></div>}
                      {selectedUser.authorityProfile.assignedSection && <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Assigned Section</dt><dd className="text-sm text-slate-900">{selectedUser.authorityProfile.assignedSection}</dd></div>}
                      {selectedUser.authorityProfile.assignedStudentGroups?.length ? <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Student Groups</dt><dd className="text-sm text-slate-900">{selectedUser.authorityProfile.assignedStudentGroups.join(', ')}</dd></div> : null}
                      {selectedUser.authorityProfile.assignedGate && <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Assigned Gate</dt><dd className="text-sm text-slate-900">{selectedUser.authorityProfile.assignedGate}</dd></div>}
                      {selectedUser.authorityProfile.dutyLocation && <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Duty Location</dt><dd className="text-sm text-slate-900">{selectedUser.authorityProfile.dutyLocation}</dd></div>}
                      {selectedUser.authorityProfile.shift && <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Shift</dt><dd className="text-sm text-slate-900">{selectedUser.authorityProfile.shift}</dd></div>}
                      {selectedUser.authorityProfile.assignedControlCentre && <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Control Centre</dt><dd className="text-sm text-slate-900">{selectedUser.authorityProfile.assignedControlCentre}</dd></div>}
                      {selectedUser.authorityProfile.administrativePermissions?.length ? <div><dt className="text-[11px] font-semibold uppercase text-slate-500">Administrative Permissions</dt><dd className="text-sm text-slate-900">{selectedUser.authorityProfile.administrativePermissions.join(', ')}</dd></div> : null}
                    </>
                  )}
                </dl>
              </section>
            )}

            {createMode === 'STUDENT' && (
              <form
                onSubmit={handleCreateStudent}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <h3 className="text-sm font-semibold text-slate-900">Create New Student Account</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    required
                    placeholder="Full Name"
                    value={stuForm.name}
                    onChange={(e) => setStuForm({ ...stuForm, name: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Institutional Email"
                    value={stuForm.email}
                    onChange={(e) => setStuForm({ ...stuForm, email: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    type="password"
                    placeholder="Initial Password"
                    value={stuForm.password}
                    onChange={(e) => setStuForm({ ...stuForm, password: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    placeholder="USN (e.g. 1NI24CS099)"
                    value={stuForm.usn}
                    onChange={(e) => setStuForm({ ...stuForm, usn: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
                  />
                  <input
                    required
                    placeholder="Department (e.g. CSE)"
                    value={stuForm.department}
                    onChange={(e) => setStuForm({ ...stuForm, department: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    type="number"
                    min={1}
                    max={8}
                    placeholder="Semester"
                    value={stuForm.semester}
                    onChange={(e) => setStuForm({ ...stuForm, semester: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    placeholder="Section"
                    value={stuForm.section}
                    onChange={(e) => setStuForm({ ...stuForm, section: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    placeholder="Parent Contact Number"
                    value={stuForm.parentPhone}
                    onChange={(e) => setStuForm({ ...stuForm, parentPhone: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                  <input
                    placeholder="Student Phone"
                    value={stuForm.phone}
                    onChange={(e) => setStuForm({ ...stuForm, phone: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateMode('NONE')}
                    className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg"
                  >
                    {saving ? 'Creating...' : 'Create Student'}
                  </button>
                </div>
              </form>
            )}

            <div className="flex flex-wrap gap-3">
              <label className="text-xs font-semibold text-slate-600">
                Filter by role
                <select
                  value={userRoleFilter}
                  onChange={(event) => setUserRoleFilter(event.target.value as 'ALL' | UserRole)}
                  aria-label="Filter users by role"
                  className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700"
                >
                  <option value="ALL">All roles</option>
                  {ADMIN_ROLE_ORDER.map((role) => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Filter by status
                <select
                  value={userStatusFilter}
                  onChange={(event) => setUserStatusFilter(event.target.value as AdminAccountStatusFilter)}
                  aria-label="Filter users by status"
                  className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700"
                >
                  <option value="ALL">All statuses</option>
                  {ACCOUNT_STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <DataTable
              data={filteredUsers}
              columns={userColumns}
              keyExtractor={(r) => r.id}
              searchPlaceholder="Search users by name, email, ID, or role..."
              searchFilter={(r, q) =>
                r.name.toLowerCase().includes(q) ||
                r.email.toLowerCase().includes(q) ||
                r.role.toLowerCase().includes(q) ||
                (r.studentProfile?.usn || '').toLowerCase().includes(q) ||
                (r.authorityProfile?.employeeId || '').toLowerCase().includes(q) ||
                (r.accountStatus || '').toLowerCase().includes(q)
              }
            />
          </div>
        );
      case 'leaves':
        return (
          <RegularLeaveQueuePanel
            title="All Regular Leave Records"
            description="System-wide view of regular leave applications."
            filterMode="ALL"
            canDecide={false}
            roleLabel="Admin"
          />
        );
      case 'extensions':
        return <ExtensionQueuePanel mode="ALL_VIEW" />;
      case 'qr-passes':
        return <QRPassOverviewPanel />;
      case 'security-logs':
        return <GateHistoryPanel />;
      case 'locations':
        return <SharedLocationsPanel />;
      case 'audit-logs':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">System Audit Logs</h2>
              <p className="text-sm text-slate-500">
                Complete chronological trail of logins, approvals, QR generation, and gate scans.
              </p>
            </div>
            <DataTable
              data={audits}
              columns={auditColumns}
              keyExtractor={(r) => r._id}
              searchPlaceholder="Search actor, action, or details..."
              searchFilter={(r, q) =>
                r.actorName.toLowerCase().includes(q) ||
                r.action.toLowerCase().includes(q) ||
                r.details.toLowerCase().includes(q)
              }
            />
          </div>
        );
      case 'settings':
        return (
          settings && (
            <form
              onSubmit={handleSaveSettings}
              className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-4"
            >
              <h2 className="text-base font-semibold text-slate-900">
                SmartGate System Settings
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  College / Institution Name (Displayed on Printable QR Passes)
                </label>
                <input
                  type="text"
                  value={settings.collegeName}
                  onChange={(e) => setSettings({ ...settings, collegeName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Hostel Complex Name
                  </label>
                  <input
                    type="text"
                    value={settings.hostelName}
                    onChange={(e) => setSettings({ ...settings, hostelName: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    HOD Conditional Threshold (Regular Days / Sem)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={settings.hodThresholdDays}
                    onChange={(e) =>
                      setSettings({ ...settings, hodThresholdDays: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          )
        );
      case 'notifications':
        return <NotificationsPage />;
      case 'dashboard':
      default:
        if (loading || !overview) return <LoadingSkeleton rows={6} />;
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Total Registered Users" value={users.length} />
              <StatCard label="Pending Registration Requests" value={requestCounts.PENDING} tone="amber" />
              <StatCard label="Approved Accounts" value={approvedAccountCount} tone="emerald" />
              <StatCard label="Rejected Accounts" value={requestCounts.REJECTED} tone="red" />
            </div>

            <section aria-labelledby="admin-role-statistics-heading" className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 id="admin-role-statistics-heading" className="mb-4 text-sm font-semibold text-slate-900">
                Users by Role
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {roleStatistics.map(({ role, count }) => (
                  <div key={role} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="truncate text-xs text-slate-600">{ROLE_LABELS[role]}</span>
                    <span className="tabular-nums text-sm font-bold text-slate-900">{count}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard label="Total Students" value={overview.stats.totalStudents || 0} />
              <StatCard label="Total Authorities" value={overview.stats.totalAuthorities || 0} />
              <StatCard
                label="Total Regular Leaves"
                value={overview.stats.totalRegularLeaves || 0}
                tone="indigo"
              />
              <StatCard
                label="Emergency Leaves"
                value={overview.stats.totalEmergencyLeaves || 0}
                tone="red"
              />
              <StatCard
                label="Active QR Passes"
                value={overview.stats.activeQrPasses || 0}
                tone="emerald"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Approved Regular"
                value={overview.stats.approvedRegular || 0}
                tone="emerald"
              />
              <StatCard
                label="Total Extensions"
                value={overview.stats.totalExtensions || 0}
              />
              <StatCard
                label="Currently Exited"
                value={overview.stats.currentlyExited || 0}
                tone="amber"
              />
              <StatCard
                label="Overdue Students"
                value={overview.stats.overdueCount || 0}
                tone="red"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-4">
                Department Leave Analytics
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

            <DataTable
              data={audits.slice(0, 15)}
              columns={auditColumns}
              keyExtractor={(r) => r._id}
            />
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      title="System Administration Console"
      description="Manage student & authority accounts, role permissions, global workflow thresholds, QR registries, and security audits."
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onOpenNotifications={() => setActiveTab('notifications')}
    >
      {renderContent()}

      <ConfirmModal
        open={Boolean(pendingReview)}
        title={
          pendingReview?.decision === 'approve'
            ? `Approve ${pendingReview.request.name}'s request?`
            : `Reject ${pendingReview?.request.name || 'this'} request?`
        }
        description={
          pendingReview?.decision === 'approve'
            ? `Approving this ${pendingReview ? ROLE_LABELS[pendingReview.request.requestedRole] : ''} request creates an approved account and grants access to its assigned role dashboard.`
            : 'Rejecting this request prevents account creation and dashboard access. Enter a reason for the applicant record and audit log.'
        }
        confirmLabel={pendingReview?.decision === 'approve' ? 'Approve Request' : 'Reject Request'}
        variant={pendingReview?.decision === 'reject' ? 'danger' : 'primary'}
        showRemarks={pendingReview?.decision === 'reject'}
        remarksRequired={pendingReview?.decision === 'reject'}
        remarksPlaceholder="Provide a concise rejection reason"
        loading={saving}
        onConfirm={(remarks) => pendingReview
          ? handleRegistrationDecision(pendingReview.request, pendingReview.decision, remarks)
          : undefined}
        onClose={() => setPendingReview(null)}
      />

      <ConfirmModal
        open={Boolean(archiveTarget)}
        title={`Safely Deactivate ${archiveTarget?.name}?`}
        description="Deactivating preserves historical leave approvals, QR pass logs, and audit trails while revoking login access."
        confirmLabel="Deactivate Account"
        variant="danger"
        loading={saving}
        onConfirm={handleSafeArchive}
        onClose={() => setArchiveTarget(null)}
      />
    </DashboardLayout>
  );
}
