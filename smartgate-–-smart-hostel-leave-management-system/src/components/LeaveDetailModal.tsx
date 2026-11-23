import React from 'react';
import { X, FileText, ExternalLink } from 'lucide-react';
import type { LeaveApplication, EmergencyLeave } from '../types';
import { StatusBadge } from './StatusBadge';
import { LeaveTimeline } from './LeaveTimeline';
import { formatDateTime } from '../utils/formatters';

interface LeaveDetailModalProps {
  open: boolean;
  leaveType: 'REGULAR' | 'EMERGENCY';
  leave: LeaveApplication | EmergencyLeave | null;
  onClose: () => void;
}

export function LeaveDetailModal({ open, leaveType, leave, onClose }: LeaveDetailModalProps) {
  if (!open || !leave) return null;

  const isRegular = leaveType === 'REGULAR';
  const reg = leave as LeaveApplication;
  const emg = leave as EmergencyLeave;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900 font-mono">
              {leave.requestCode}
            </h3>
            <StatusBadge status={leave.status} />
            <span className="text-xs text-slate-500">
              {isRegular ? 'Regular Leave' : `Emergency · ${emg.emergencyType}`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            aria-label="Close detail dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-500">Student Name</div>
              <div className="font-medium text-slate-900 mt-0.5">{leave.studentName}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">USN / Student ID</div>
              <div className="font-mono font-medium text-slate-900 mt-0.5">{leave.usn}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Academic Unit</div>
              <div className="font-medium text-slate-900 mt-0.5">
                {leave.department} · Sem {leave.semester} · Sec {leave.section}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Departure Date & Time</div>
              <div className="font-medium text-slate-900 tabular-nums mt-0.5">
                {formatDateTime(leave.departureDate)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Approved Return Deadline</div>
              <div className="font-medium text-slate-900 tabular-nums mt-0.5">
                {formatDateTime(leave.approvedReturnDate)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Parent / Guardian Contact</div>
              <div className="font-mono font-medium text-slate-900 mt-0.5">{leave.parentContact}</div>
            </div>
          </div>

          {isRegular && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-700 flex flex-wrap items-center gap-3">
              <span>
                Prior Approved Regular Days (Sem {reg.semester}):{' '}
                <strong className="tabular-nums text-slate-900">
                  {reg.previousApprovedDaysInSem} days
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                HOD Rule:{' '}
                <strong className={reg.hodRequired ? 'text-amber-700' : 'text-emerald-700'}>
                  {reg.hodRequired
                    ? 'HOD Approval Required (> 5 days)'
                    : 'HOD Skipped (<= 5 days)'}
                </strong>
              </span>
            </div>
          )}

          <div>
            <div className="text-xs text-slate-500 mb-1">Leave Reason</div>
            <p className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3">
              {leave.reason}
            </p>
          </div>

          {leave.documentUrl && (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <FileText className="w-4 h-4 text-indigo-700" />
                <span>{leave.documentName || 'Supporting Document'}</span>
              </div>
              <a
                href={leave.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800"
              >
                Open File <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {isRegular && reg.rejectionReason && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-800">
              <strong>Rejected by {reg.rejectedByRole}:</strong> {reg.rejectionReason}
            </div>
          )}

          {!isRegular && emg.aoRemarks && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-800">
              <strong>AO Remarks:</strong> {emg.aoRemarks}
            </div>
          )}

          <LeaveTimeline leaveType={leaveType} leave={leave} history={leave.history || []} />
        </div>
      </div>
    </div>
  );
}
