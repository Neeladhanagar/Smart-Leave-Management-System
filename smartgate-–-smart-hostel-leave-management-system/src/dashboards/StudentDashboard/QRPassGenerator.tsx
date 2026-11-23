import React, { useState, useEffect } from 'react';
import { QrCode, ShieldCheck, AlertCircle } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { LeaveApplication, EmergencyLeave, QRPass } from '../../types';
import { QRPassCard } from '../../components/QRPassCard';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { LeaveDetailModal } from '../../components/LeaveDetailModal';
import { formatDateTime } from '../../utils/formatters';

interface QRPassGeneratorProps {
  initialLeaveId?: string | null;
  onApplyLeave: () => void;
}

type CombinedLeave =
  | (LeaveApplication & { kind: 'REGULAR' })
  | (EmergencyLeave & { kind: 'EMERGENCY' });

export function QRPassGenerator({ initialLeaveId, onApplyLeave }: QRPassGeneratorProps) {
  const { user, studentProfile, settings } = useAuth();
  const { showToast } = useToast();

  const [leaves, setLeaves] = useState<CombinedLeave[]>([]);
  const [passes, setPasses] = useState<QRPass[]>([]);
  const [collegeName, setCollegeName] = useState(
    settings?.collegeName || 'National Institute of Engineering & Technology'
  );
  const [selectedLeaveId, setSelectedLeaveId] = useState<string>(initialLeaveId || '');
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [regRes, emgRes, passRes] = await Promise.all([
          apiRequest<{ leaves: LeaveApplication[] }>('/leaves/regular'),
          apiRequest<{ leaves: EmergencyLeave[] }>('/leaves/emergency'),
          apiRequest<{ passes: QRPass[]; collegeName: string }>('/qr-passes'),
        ]);

        const combined: CombinedLeave[] = [
          ...regRes.leaves.map((l) => ({ ...l, kind: 'REGULAR' as const })),
          ...emgRes.leaves.map((l) => ({ ...l, kind: 'EMERGENCY' as const })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setLeaves(combined);
        setPasses(passRes.passes);
        if (passRes.collegeName) setCollegeName(passRes.collegeName);

        if (initialLeaveId) {
          setSelectedLeaveId(initialLeaveId);
        } else {
          // Prefer selecting a leave with an active QR pass first
          const withActivePass = combined.find((l) =>
            passRes.passes.some((p) => String(p.leaveRefId) === String(l._id) && p.status === 'ACTIVE')
          );
          if (withActivePass) {
            setSelectedLeaveId(withActivePass._id);
          } else if (combined.length > 0) {
            setSelectedLeaveId(combined[0]._id);
          }
        }
      } catch (err) {
        showToast((err as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [initialLeaveId]);

  if (loading) return <LoadingSkeleton rows={6} />;

  const selectedLeave = leaves.find((l) => l._id === selectedLeaveId) || leaves[0] || null;

  const matchingPass = selectedLeave
    ? passes.find(
        (p) => String(p.leaveRefId) === String(selectedLeave._id) && p.status === 'ACTIVE'
      ) ||
      passes.find((p) => String(p.leaveRefId) === String(selectedLeave._id)) ||
      null
    : null;

  const isPendingOrRejected = selectedLeave
    ? selectedLeave.status.startsWith('PENDING') || selectedLeave.status === 'REJECTED'
    : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">QR Pass Generator</h2>
          <p className="text-sm text-slate-500">
            Generate, preview, download PNG, and inspect validity details for cryptographically
            signed hostel exit QR passes.
          </p>
        </div>
      </div>

      {leaves.length === 0 ? (
        <EmptyState
          title="No leave applications available"
          description="Submit a Regular or Emergency leave application. Once approved by the final authority, your scannable QR Gate Pass is generated here."
          actionLabel="Apply Regular Leave"
          onAction={onApplyLeave}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Panel: Student Info, Leave Selection, Status */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Student Identity
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Student Name</div>
                  <div className="font-semibold text-slate-900">{user?.name}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">USN / ID</div>
                  <div className="font-mono font-semibold text-slate-900">
                    {studentProfile?.usn || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Department</div>
                  <div className="font-medium text-slate-900">{studentProfile?.department}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Hostel / Room</div>
                  <div className="font-medium text-slate-900">
                    {studentProfile?.hostelBlock} · {studentProfile?.roomNumber}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <label
                  htmlFor="qr-leave-select"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Select Leave Request
                </label>
                <select
                  id="qr-leave-select"
                  value={selectedLeave?._id || ''}
                  onChange={(e) => setSelectedLeaveId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  {leaves.map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.requestCode} ({l.kind}) — {l.status}
                    </option>
                  ))}
                </select>
              </div>

              {selectedLeave && (
                <div className="space-y-3 pt-2 border-t border-slate-100 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">Leave Status</span>
                    <StatusBadge status={selectedLeave.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500">QR Generation Status</span>
                    <span
                      className={`font-semibold ${
                        matchingPass ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {matchingPass
                        ? `Issued (${matchingPass.passId})`
                        : isPendingOrRejected
                        ? 'Blocked Until Final Approval'
                        : 'Not Generated'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                      <div className="text-slate-500">Departure</div>
                      <div className="font-medium text-slate-900 tabular-nums mt-0.5">
                        {formatDateTime(selectedLeave.departureDate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Approved Return</div>
                      <div className="font-medium text-slate-900 tabular-nums mt-0.5">
                        {formatDateTime(selectedLeave.approvedReturnDate)}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs">
                    <div className="text-slate-500">Reason</div>
                    <div className="text-slate-800 mt-0.5">{selectedLeave.reason}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Scannable QR Pass Preview & Actions */}
          <div className="lg:col-span-7">
            {matchingPass ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-emerald-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    QR Pass <strong className="font-mono">{matchingPass.passId}</strong> is verified
                    and valid until{' '}
                    <strong className="tabular-nums">
                      {formatDateTime(matchingPass.approvedReturnDate)}
                    </strong>
                    .
                  </span>
                </div>

                <QRPassCard
                  pass={matchingPass}
                  collegeName={collegeName}
                  onViewDetails={() => setDetailOpen(true)}
                />
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                  {isPendingOrRejected ? (
                    <AlertCircle className="w-6 h-6 text-amber-600" />
                  ) : (
                    <QrCode className="w-6 h-6" />
                  )}
                </div>
                <h3 className="text-base font-semibold text-slate-900">
                  QR Code Not Available for This Request
                </h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  {selectedLeave?.status === 'REJECTED'
                    ? 'This leave request was rejected. QR Gate Passes are never issued for rejected applications.'
                    : 'This leave is still awaiting final authority approval (Warden for Regular Leave, AO for Emergency Leave). Once approved, your scannable QR Pass will appear automatically.'}
                </p>
                {selectedLeave && (
                  <button
                    type="button"
                    onClick={() => setDetailOpen(true)}
                    className="mt-2 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    View Approval Progress
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedLeave && (
        <LeaveDetailModal
          open={detailOpen}
          leaveType={selectedLeave.kind}
          leave={selectedLeave}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}
