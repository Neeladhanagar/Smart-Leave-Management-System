import React, { useEffect, useState, useRef, useCallback } from 'react';
import L from 'leaflet';
import { RefreshCw, MapPin, Search, Phone, Clock, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { LocationShareItem, LocationTrackingSummary } from '../types';
import { formatDateTime } from '../utils/formatters';
import { EmptyState } from './EmptyState';
import { LoadingSkeleton } from './LoadingSkeleton';
import { StatCard } from './StatCard';

export function SharedLocationsPanel() {
  const { showToast } = useToast();
  const [locations, setLocations] = useState<LocationShareItem[]>([]);
  const [summary, setSummary] = useState<LocationTrackingSummary>({
    total: 0,
    activeSharing: 0,
    stopped: 0,
    expired: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LocationShareItem | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [leaveFilter, setLeaveFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SHARING' | 'STOPPED' | 'EXPIRED'>('ALL');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (leaveFilter.trim()) params.set('leaveCode', leaveFilter.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const data = await apiRequest<{
        locations: LocationShareItem[];
        summary: LocationTrackingSummary;
      }>(`/location/shared${queryStr}`);

      setLocations(data.locations || []);
      if (data.summary) setSummary(data.summary);

      setSelected((prev) => {
        if (prev) {
          const match = (data.locations || []).find((l) => l._id === prev._id);
          if (match) return match;
        }
        return data.locations?.[0] || null;
      });
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, leaveFilter, statusFilter, showToast]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const activeMappableLocations = locations.filter(
    (loc) =>
      loc.isSharing && typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
  );

  useEffect(() => {
    if (!mapContainerRef.current || activeMappableLocations.length === 0) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = null;
      }
      return;
    }

    if (!mapRef.current) {
      const first = activeMappableLocations[0];
      const map = L.map(mapContainerRef.current).setView(
        [first.latitude || 12.9716, first.longitude || 77.5946],
        13
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    }

    if (markersRef.current) {
      markersRef.current.clearLayers();
      activeMappableLocations.forEach((loc) => {
        if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
          const marker = L.circleMarker([loc.latitude, loc.longitude], {
            radius: 9,
            color: loc.source === 'MANUAL' ? '#B45309' : '#1E3A8A',
            fillColor: loc.source === 'MANUAL' ? '#D97706' : '#2563EB',
            fillOpacity: 0.85,
            weight: 2,
          });
          marker.bindPopup(
            `<strong>${loc.studentName}</strong> (${loc.usn})<br/>Leave: ${
              loc.leaveRequestCode || '—'
            } · ${loc.source || 'GPS'}<br/>Updated: ${formatDateTime(
              loc.lastUpdatedAt || loc.sharedAt
            )}`
          );
          marker.addTo(markersRef.current!);
        }
      });
    }

    if (
      selected?.isSharing &&
      typeof selected.latitude === 'number' &&
      typeof selected.longitude === 'number' &&
      mapRef.current
    ) {
      mapRef.current.setView([selected.latitude, selected.longitude], 15);
    }
  }, [activeMappableLocations, selected]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Student Live Tracking</h2>
          <p className="text-sm text-slate-500">
            Consent-based live GPS and manual locations linked to student IDs, registered phones,
            and approved leave requests.
          </p>
        </div>
        <button
          type="button"
          onClick={loadLocations}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 self-start whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Tracking
        </button>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Tracked Records" value={summary.total} />
        <StatCard label="Actively Sharing" value={summary.activeSharing} tone="emerald" />
        <StatCard label="Location Not Shared" value={summary.stopped} tone="amber" />
        <StatCard label="Tracking Expired" value={summary.expired} tone="red" />
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student name, USN, or phone number..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <input
            type="text"
            value={leaveFilter}
            onChange={(e) => setLeaveFilter(e.target.value)}
            placeholder="Filter by Leave Application ID (e.g. SL-...)"
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-center flex-wrap">
          {(
            [
              { id: 'ALL', label: 'All' },
              { id: 'SHARING', label: 'Sharing' },
              { id: 'STOPPED', label: 'Not Shared' },
              { id: 'EXPIRED', label: 'Expired' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : locations.length === 0 ? (
        <EmptyState
          title="No matching student tracking records"
          description="Only students who have enabled voluntary location sharing for an approved leave appear here. SmartGate never activates tracking remotely."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Student Tracking List */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden max-h-[580px] overflow-y-auto">
            {locations.map((loc) => {
              const isActive = loc.isSharing;
              const isExpired = loc.trackingState === 'EXPIRED';
              return (
                <button
                  key={loc._id}
                  type="button"
                  onClick={() => setSelected(loc)}
                  className={`w-full text-left px-4 py-3.5 transition-colors ${
                    selected?._id === loc._id ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {loc.studentName}
                    </span>
                    <span className="text-xs font-mono text-indigo-700 shrink-0">{loc.usn}</span>
                  </div>

                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                    <span>{loc.department}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{loc.phone || 'No phone'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-medium text-slate-700">
                      {loc.leaveRequestCode || '—'}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        isActive
                          ? 'text-emerald-700'
                          : isExpired
                          ? 'text-red-700'
                          : 'text-slate-600'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      {isActive
                        ? `Live (${loc.source === 'MANUAL' ? 'Manual' : 'GPS'})`
                        : isExpired
                        ? 'Tracking Expired'
                        : 'Location Not Shared'}
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {formatDateTime(loc.lastUpdatedAt || loc.sharedAt || loc.stoppedAt)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Student Details & Interactive Map */}
          <div className="lg:col-span-7 space-y-4">
            {selected && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">{selected.studentName}</h3>
                      <span className="text-xs font-mono text-indigo-700 font-semibold">
                        {selected.usn}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                      <span>{selected.department}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-mono text-slate-700">
                        <Phone className="w-3 h-3" />
                        {selected.phone || 'Not available'}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs font-semibold">
                    {selected.isSharing ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <ShieldCheck className="w-4 h-4" />
                        Actively Sharing ({selected.source || 'GPS'})
                      </span>
                    ) : selected.trackingState === 'EXPIRED' ? (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <Clock className="w-4 h-4" />
                        Tracking Expired
                      </span>
                    ) : (
                      <span className="text-slate-600">Location Not Shared</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500">Leave Application ID</div>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5">
                      {selected.leaveRequestCode || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Leave Type &amp; Status</div>
                    <div className="font-medium text-slate-900 mt-0.5">
                      {selected.leaveType || '—'} ·{' '}
                      {(selected.leaveApprovalStatus || '—').replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Approved Return</div>
                    <div className="font-medium text-slate-900 tabular-nums mt-0.5">
                      {formatDateTime(selected.approvedReturnDate)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Location Source</div>
                    <div className="font-medium text-slate-900 mt-0.5">
                      {selected.isSharing
                        ? selected.source === 'MANUAL'
                          ? 'Manual Entry'
                          : 'Browser GPS'
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Coordinates</div>
                    <div className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                      {selected.isSharing &&
                      typeof selected.latitude === 'number' &&
                      typeof selected.longitude === 'number'
                        ? `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`
                        : 'Location Not Shared'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Last Updated</div>
                    <div className="font-medium text-slate-900 tabular-nums mt-0.5">
                      {formatDateTime(
                        selected.lastUpdatedAt || selected.sharedAt || selected.stoppedAt
                      )}
                    </div>
                  </div>
                </div>

                {selected.isSharing ? (
                  (selected.address || selected.area || selected.city || selected.landmark) && (
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-3.5 py-2.5 text-xs text-slate-700 space-y-1">
                      <div>
                        <span className="text-slate-500">Shared Location: </span>
                        <strong className="text-slate-900">
                          {[selected.address, selected.area, selected.city]
                            .filter(Boolean)
                            .join(', ')}
                        </strong>
                      </div>
                      {selected.landmark && (
                        <div>
                          <span className="text-slate-500">Landmark: </span>
                          <span>{selected.landmark}</span>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-600">
                    <strong>Location Not Shared:</strong>{' '}
                    {selected.expiredReason ||
                      'Student stopped location sharing. Historical coordinates are intentionally hidden.'}
                  </div>
                )}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {activeMappableLocations.length > 0 ? (
                <div ref={mapContainerRef} className="w-full h-[360px]" />
              ) : (
                <div className="p-10 text-center text-xs text-slate-500 bg-slate-50">
                  No active GPS/geocoded coordinates are currently live for the filtered records.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
