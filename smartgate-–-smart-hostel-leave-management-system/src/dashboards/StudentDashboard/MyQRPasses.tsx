import React, { useState, useEffect } from 'react';
import { QrCode } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import type { QRPass } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { QRPassCard } from '../../components/QRPassCard';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { formatDateTime } from '../../utils/formatters';

export function MyQRPasses() {
  const { showToast } = useToast();
  const [passes, setPasses] = useState<QRPass[]>([]);
  const [collegeName, setCollegeName] = useState('');
  const [selectedPass, setSelectedPass] = useState<QRPass | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'USED'>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiRequest<{ passes: QRPass[]; collegeName: string }>('/qr-passes');
        setPasses(data.passes);
        setCollegeName(data.collegeName);
        if (data.passes.length > 0) {
          setSelectedPass(data.passes[0]);
        }
      } catch (err) {
        showToast((err as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingSkeleton rows={5} />;

  const filtered =
    filter === 'ALL' ? passes : passes.filter((p) => p.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">My QR Passes</h2>
          <p className="text-sm text-slate-500">
            Complete history of active, used, expired, and extension-revoked QR gate passes.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start flex-wrap">
          {(['ALL', 'ACTIVE', 'USED', 'REVOKED', 'EXPIRED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No QR passes in this category"
          description="Approved leaves and approved leave extensions generate passes listed here."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {filtered.map((pass) => (
              <button
                key={pass._id}
                type="button"
                onClick={() => setSelectedPass(pass)}
                className={`w-full text-left p-4 flex items-start justify-between gap-3 transition-colors ${
                  selectedPass?._id === pass._id ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-indigo-700 shrink-0" />
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      {pass.passId}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {pass.leaveRequestCode} · {pass.leaveType}
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    Valid until {formatDateTime(pass.approvedReturnDate)}
                  </div>
                </div>
                <StatusBadge status={pass.status} />
              </button>
            ))}
          </div>

          <div className="lg:col-span-7">
            {selectedPass && (
              <QRPassCard pass={selectedPass} collegeName={collegeName} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
