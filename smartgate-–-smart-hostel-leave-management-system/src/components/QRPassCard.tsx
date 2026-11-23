import React from 'react';
import { Download, Eye, ShieldCheck } from 'lucide-react';
import type { QRPass } from '../types';
import { SmartGateLogo } from './SmartGateLogo';
import { StatusBadge } from './StatusBadge';
import { formatDateTime } from '../utils/formatters';

interface QRPassCardProps {
  pass: QRPass;
  collegeName?: string;
  onViewDetails?: () => void;
}

export function QRPassCard({
  pass,
  collegeName = 'National Institute of Engineering & Technology',
  onViewDetails,
}: QRPassCardProps) {
  const handleDownloadPng = () => {
    const link = document.createElement('a');
    link.href = pass.qrImageDataUrl;
    link.download = `${pass.passId}-${pass.usn}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden max-w-lg mx-auto">
        {/* Official Pass Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between gap-4">
          <SmartGateLogo size="sm" darkText={false} />
          <div className="text-right">
            <div className="text-[11px] text-slate-300 font-medium">Official Hostel Gate Pass</div>
            <div className="text-xs font-mono text-indigo-300 font-semibold">{pass.passId}</div>
          </div>
        </div>

        {/* College Banner */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-800 truncate">{collegeName}</span>
          <StatusBadge status={pass.status} />
        </div>

        {/* Pass Body */}
        <div className="p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="shrink-0 flex flex-col items-center">
            <div className="p-2.5 bg-white border border-slate-200 rounded-xl">
              <img
                src={pass.qrImageDataUrl}
                alt={`QR Gate Pass ${pass.passId}`}
                className="w-44 h-44 object-contain"
              />
            </div>
            <span className="mt-2 text-[11px] font-mono text-slate-500">
              {pass.leaveRequestCode}
            </span>
          </div>

          <div className="flex-1 w-full space-y-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Student Name</div>
              <div className="font-semibold text-slate-900">{pass.studentName}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500">USN / ID</div>
                <div className="font-mono font-medium text-slate-900">{pass.usn}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Department</div>
                <div className="font-medium text-slate-900">{pass.department}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500">Leave Type</div>
                <div className="font-medium text-slate-900">{pass.leaveType}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Issued By</div>
                <div className="font-medium text-slate-900 truncate">{pass.issuedBy}</div>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Departure:</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatDateTime(pass.departureDate)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Valid Until:</span>
                <span className="font-semibold text-indigo-800 tabular-nums">
                  {formatDateTime(pass.approvedReturnDate)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Revocation notice if revoked */}
        {pass.status === 'REVOKED' && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200 text-xs text-red-800">
            <strong>Pass Revoked:</strong> {pass.revokedReason}
            {pass.replacedByPassId && (
              <span className="ml-1 font-mono">
                (Replaced by {pass.replacedByPassId})
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-700" />
            Cryptographically Signed SmartGate Pass
          </span>
          <span className="font-mono">Verify at Main Gate</span>
        </div>
      </div>

      {/* Action Buttons — Download PNG & View Details only (no Print QR Pass) */}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={handleDownloadPng}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          Download QR PNG
        </button>
        {onViewDetails && (
          <button
            type="button"
            onClick={onViewDetails}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Eye className="w-4 h-4" />
            View Pass Details
          </button>
        )}
      </div>
    </div>
  );
}
