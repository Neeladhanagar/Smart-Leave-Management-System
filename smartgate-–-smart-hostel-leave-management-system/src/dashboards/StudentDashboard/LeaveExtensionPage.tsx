import React, { useState, useEffect } from 'react';
import { Upload, AlertTriangle, Clock } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import type {
  LeaveApplication,
  EmergencyLeave,
  LeaveExtension,
  EmergencyLeaveExtension,
} from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { formatDateTime } from '../../utils/formatters';

type EligibleLeave = {
  id: string;
  leaveType: 'REGULAR' | 'EMERGENCY';
  requestCode: string;
  approvedReturnDate: string;
  status: string;
  reason: string;
};

export function LeaveExtensionPage() {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<'request' | 'late' | 'history'>('request');
  const [eligibleLeaves, setEligibleLeaves] = useState<EligibleLeave[]>([]);
  const [regularExtensions, setRegularExtensions] = useState<LeaveExtension[]>([]);
  const [emergencyExtensions, setEmergencyExtensions] = useState<EmergencyLeaveExtension[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLeaveId, setSelectedLeaveId] = useState('');
  const [requestedReturnDate, setRequestedReturnDate] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [regRes, emgRes, extRes] = await Promise.all([
        apiRequest<{ leaves: LeaveApplication[] }>('/leaves/regular'),
        apiRequest<{ leaves: EmergencyLeave[] }>('/leaves/emergency'),
        apiRequest<{
          regularExtensions: LeaveExtension[];
          emergencyExtensions: EmergencyLeaveExtension[];
        }>('/extensions'),
      ]);

      const activeStatuses = new Set(['APPROVED', 'EXITED', 'OVERDUE']);
      const eligible: EligibleLeave[] = [
        ...regRes.leaves
          .filter((l) => activeStatuses.has(l.status))
          .map((l) => ({
            id: l._id,
            leaveType: 'REGULAR' as const,
            requestCode: l.requestCode,
            approvedReturnDate: l.approvedReturnDate,
            status: l.status,
            reason: l.reason,
          })),
        ...emgRes.leaves
          .filter((l) => activeStatuses.has(l.status))
          .map((l) => ({
            id: l._id,
            leaveType: 'EMERGENCY' as const,
            requestCode: l.requestCode,
            approvedReturnDate: l.approvedReturnDate,
            status: l.status,
            reason: l.reason,
          })),
      ];

      setEligibleLeaves(eligible);
      if (eligible.length > 0 && !selectedLeaveId) {
        setSelectedLeaveId(eligible[0].id);
      }
      setRegularExtensions(extRes.regularExtensions);
      setEmergencyExtensions(extRes.emergencyExtensions);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const displayedEligible =
    subTab === 'late'
      ? eligibleLeaves.filter((l) => new Date() > new Date(l.approvedReturnDate) || l.status === 'OVERDUE')
      : eligibleLeaves;

  const currentSelection =
    displayedEligible.find((l) => l.id === selectedLeaveId) || displayedEligible[0] || null;

  const isSelectedPastDeadline = currentSelection
    ? new Date() > new Date(currentSelection.approvedReturnDate)
    : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSelection) {
      showToast('Select an eligible approved leave first.', 'error');
      return;
    }
    if (!requestedReturnDate || !reason.trim()) {
      showToast('Provide a new return date and extension reason.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('leaveType', currentSelection.leaveType);
      formData.append('leaveId', currentSelection.id);
      formData.append('requestedReturnDate', requestedReturnDate);
      formData.append('reason', reason.trim());
      if (file) formData.append('document', file);

      await apiRequest('/extensions', {
        method: 'POST',
        body: formData,
      });

      showToast(
        currentSelection.leaveType === 'REGULAR'
          ? 'Extension request submitted to SWO (and Warden queue).'
          : 'Emergency extension submitted directly to AO.',
        'success'
      );
      setReason('');
      setRequestedReturnDate('');
      setFile(null);
      setSubTab('history');
      await loadData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={5} />;

  const combinedExtensions = [
    ...regularExtensions.map((e) => ({ ...e, kind: 'REGULAR' as const })),
    ...emergencyExtensions.map((e) => ({ ...e, kind: 'EMERGENCY' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Leave Extension Management</h2>
          <p className="text-sm text-slate-500">
            Regular extensions route through SWO → Warden. Emergency extensions go directly to AO.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setSubTab('request')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'request'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Request Extension
          </button>
          <button
            type="button"
            onClick={() => setSubTab('late')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'late'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Late Extension Request
          </button>
          <button
            type="button"
            onClick={() => setSubTab('history')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'history'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Extension Requests ({combinedExtensions.length})
          </button>
        </div>
      </div>

      {subTab === 'history' ? (
        combinedExtensions.length === 0 ? (
          <EmptyState
            title="No extension requests yet"
            description="Submitted regular and emergency extension requests will appear here with authority remarks."
            actionLabel="Request Extension"
            onAction={() => setSubTab('request')}
          />
        ) : (
          <div className="space-y-3">
            {combinedExtensions.map((ext) => (
              <div
                key={ext._id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      {ext.extensionCode}
                    </span>
                    <StatusBadge status={ext.status} />
                    {ext.isLateExtension && <StatusBadge status="LATE_EXTENSION_REQUEST" />}
                  </div>
                  <span className="text-xs text-slate-500">
                    Leave: <strong className="font-mono text-slate-800">{ext.leaveRequestCode}</strong> ·{' '}
                    {ext.kind}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div>
                    <span className="text-slate-500">Original Approved Return:</span>{' '}
                    <strong className="tabular-nums text-slate-900">
                      {formatDateTime(ext.originalReturnDate)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Requested Return:</span>{' '}
                    <strong className="tabular-nums text-indigo-800">
                      {formatDateTime(ext.requestedReturnDate)}
                    </strong>
                  </div>
                </div>

                <p className="text-sm text-slate-700">{ext.reason}</p>

                {ext.kind === 'REGULAR' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-500">SWO Decision:</span>{' '}
                      <strong className="text-slate-900">
                        {(ext as LeaveExtension).swoDecision?.status || 'PENDING'}
                      </strong>
                      {(ext as LeaveExtension).swoDecision?.remarks && (
                        <p className="text-slate-600 mt-0.5">
                          {(ext as LeaveExtension).swoDecision.remarks}
                        </p>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500">Warden Final Decision:</span>{' '}
                      <strong className="text-slate-900">
                        {(ext as LeaveExtension).wardenDecision?.status || 'PENDING'}
                      </strong>
                      {(ext as LeaveExtension).wardenDecision?.remarks && (
                        <p className="text-slate-600 mt-0.5">
                          {(ext as LeaveExtension).wardenDecision.remarks}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {ext.kind === 'EMERGENCY' && (
                  <div className="pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">AO Decision:</span>{' '}
                    <strong className="text-slate-900">
                      {(ext as EmergencyLeaveExtension).aoDecision?.status || 'PENDING'}
                    </strong>
                    {(ext as EmergencyLeaveExtension).aoDecision?.remarks && (
                      <p className="text-slate-600 mt-0.5">
                        {(ext as EmergencyLeaveExtension).aoDecision.remarks}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : displayedEligible.length === 0 ? (
        <EmptyState
          title={
            subTab === 'late'
              ? 'No overdue leaves requiring late extension'
              : 'No approved active leaves eligible for extension'
          }
          description="Extensions can only be requested for approved, exited, or overdue leave applications."
        />
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">
              {subTab === 'late' ? 'Late Extension Request' : 'Request Leave Extension'}
            </h3>
            {isSelectedPastDeadline && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                <AlertTriangle className="w-3.5 h-3.5" />
                LATE_EXTENSION_REQUEST
              </span>
            )}
          </div>

          {isSelectedPastDeadline && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-900">
              Your original return deadline has passed. This submission will be flagged as{' '}
              <strong>LATE_EXTENSION_REQUEST</strong>. Your original QR pass is NOT automatically
              extended while pending.
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Select Approved Leave Request
            </label>
            <select
              value={currentSelection?.id || ''}
              onChange={(e) => setSelectedLeaveId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              {displayedEligible.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.requestCode} ({l.leaveType}) — Return: {formatDateTime(l.approvedReturnDate)} [{l.status}]
                </option>
              ))}
            </select>
          </div>

          {currentSelection && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-slate-700">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Original Approved Return Date:</span>
                <strong className="tabular-nums text-slate-900">
                  {formatDateTime(currentSelection.approvedReturnDate)}
                </strong>
              </div>
              <div className="text-slate-500">
                Routing:{' '}
                {currentSelection.leaveType === 'REGULAR'
                  ? 'SWO → Warden → Replacement QR Pass'
                  : 'AO → Replacement QR Pass'}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              New Requested Return Date &amp; Time
            </label>
            <input
              type="datetime-local"
              required
              value={requestedReturnDate}
              onChange={(e) => setRequestedReturnDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Extension Reason</label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why an extension is needed..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Supporting Document (Optional)
            </label>
            <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
              <Upload className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-xs text-slate-600 truncate">
                {file ? file.name : 'Attach proof if available'}
              </span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : 'Submit Extension Request'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
