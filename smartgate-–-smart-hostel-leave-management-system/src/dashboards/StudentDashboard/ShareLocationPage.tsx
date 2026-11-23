import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Navigation,
  Shield,
  PowerOff,
  Clock,
  AlertCircle,
  Edit3,
  CheckCircle2,
  X,
} from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { LocationShareItem, EligibleTrackingLeave } from '../../types';
import { formatDateTime } from '../../utils/formatters';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';

async function reverseGeocodeCoords(lat: number, lng: number): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { signal: controller.signal }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ? data.display_name.split(',').slice(0, 4).join(', ') : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export function ShareLocationPage() {
  const { user, studentProfile } = useAuth();
  const { showToast } = useToast();

  const [status, setStatus] = useState<LocationShareItem | null>(null);
  const [eligibleLeaves, setEligibleLeaves] = useState<EligibleTrackingLeave[]>([]);
  const [selectedLeaveId, setSelectedLeaveId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState('');

  // Manual location form
  const [manualForm, setManualForm] = useState({
    address: '',
    area: '',
    city: '',
    landmark: '',
  });
  const [submittingManual, setSubmittingManual] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPushRef = useRef<number>(0);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{
        location: LocationShareItem | null;
        eligibleLeaves: EligibleTrackingLeave[];
      }>('/location/me');
      setStatus(data.location);
      setEligibleLeaves(data.eligibleLeaves || []);

      if (data.location?.leaveRefId) {
        const stillValid = (data.eligibleLeaves || []).some(
          (l) => l._id === String(data.location?.leaveRefId)
        );
        if (stillValid) {
          setSelectedLeaveId(String(data.location.leaveRefId));
        } else if ((data.eligibleLeaves || []).length > 0) {
          setSelectedLeaveId(data.eligibleLeaves[0]._id);
        }
      } else if ((data.eligibleLeaves || []).length > 0) {
        setSelectedLeaveId(data.eligibleLeaves[0]._id);
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const selectedLeave =
    eligibleLeaves.find((l) => l._id === selectedLeaveId) || eligibleLeaves[0] || null;

  // Periodic GPS watch while student actively shares GPS on this page
  useEffect(() => {
    if (!status?.isSharing || status.source !== 'GPS' || !navigator.geolocation || !selectedLeave) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastPushRef.current < 30000) return;
        lastPushRef.current = now;
        try {
          const data = await apiRequest<{ location: LocationShareItem }>('/location/share', {
            method: 'POST',
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              leaveRefId: selectedLeave._id,
              leaveType: selectedLeave.leaveType,
            }),
          });
          setStatus(data.location);
        } catch {
          // Periodic background refresh errors handled cleanly without disrupting UI
        }
      },
      () => {
        // Ignore transient watch error
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );

    watchIdRef.current = watchId;
    return () => {
      navigator.geolocation.clearWatch(watchId);
      watchIdRef.current = null;
    };
  }, [status?.isSharing, status?.source, selectedLeave]);

  // Render Leaflet map only when actively sharing and valid numeric coordinates exist
  useEffect(() => {
    if (
      !mapContainerRef.current ||
      !status?.isSharing ||
      typeof status.latitude !== 'number' ||
      typeof status.longitude !== 'number'
    ) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
      return;
    }

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current).setView([status.latitude, status.longitude], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      markerRef.current = L.circleMarker([status.latitude, status.longitude], {
        radius: 10,
        color: '#1E3A8A',
        fillColor: '#2563EB',
        fillOpacity: 0.85,
        weight: 2,
      })
        .bindPopup(
          `<strong>${status.studentName}</strong><br/>${
            status.address || 'Current Shared Location'
          }`
        )
        .addTo(map);
      mapRef.current = map;
    } else {
      mapRef.current.setView([status.latitude, status.longitude], 15);
      markerRef.current?.setLatLng([status.latitude, status.longitude]);
    }
  }, [status]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const triggerGpsLocationShare = () => {
    if (!selectedLeave) {
      showToast('Select an approved active leave application first.', 'error');
      return;
    }
    if (!navigator.geolocation) {
      setPermissionDenied(true);
      setPermissionMessage(
        'Browser geolocation is unavailable in this device. Please use Manual Location Input below.'
      );
      return;
    }

    setConsentModalOpen(false);
    setUpdating(true);
    setPermissionDenied(false);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const resolvedAddress = await reverseGeocodeCoords(
            pos.coords.latitude,
            pos.coords.longitude
          );
          lastPushRef.current = Date.now();
          const data = await apiRequest<{
            location: LocationShareItem;
            eligibleLeaves: EligibleTrackingLeave[];
          }>('/location/share', {
            method: 'POST',
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              address: resolvedAddress,
              leaveRefId: selectedLeave._id,
              leaveType: selectedLeave.leaveType,
            }),
          });
          setStatus(data.location);
          setEligibleLeaves(data.eligibleLeaves || eligibleLeaves);
          showToast('Live GPS location shared with authorized authorities.', 'success');
        } catch (err) {
          showToast((err as Error).message, 'error');
        } finally {
          setUpdating(false);
        }
      },
      (geoErr) => {
        setUpdating(false);
        setPermissionDenied(true);
        setPermissionMessage(
          `Location Permission Denied (${geoErr.message}). Your leave applications remain unaffected, and you can enter your location manually below.`
        );
        showToast('Location Permission Denied. You may submit your location manually.', 'info');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleStopSharing = async () => {
    setUpdating(true);
    try {
      const data = await apiRequest<{ location: LocationShareItem | null; message: string }>(
        '/location/stop',
        { method: 'POST' }
      );
      setStatus(data.location);
      showToast(data.message || 'Location Sharing Stopped.', 'info');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeave) {
      showToast('An approved active leave application is required to share location.', 'error');
      return;
    }

    if (!manualForm.address.trim() && (!manualForm.area.trim() || !manualForm.city.trim())) {
      showToast('Please enter an Address or both Area and City.', 'error');
      return;
    }

    setSubmittingManual(true);
    try {
      const data = await apiRequest<{
        location: LocationShareItem;
        eligibleLeaves: EligibleTrackingLeave[];
        message: string;
      }>('/location/manual', {
        method: 'POST',
        body: JSON.stringify({
          ...manualForm,
          leaveRefId: selectedLeave._id,
          leaveType: selectedLeave.leaveType,
        }),
      });
      setStatus(data.location);
      setEligibleLeaves(data.eligibleLeaves || eligibleLeaves);
      setPermissionDenied(false);
      showToast(data.message || 'Manual location shared successfully.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmittingManual(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={5} />;

  const isSharing = Boolean(status?.isSharing);
  const isExpired = status?.trackingState === 'EXPIRED';

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Student Location Tracking</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Voluntary, consent-based GPS and manual location sharing linked to your approved hostel
          leave application.
        </p>
      </div>

      {/* Consent Privacy Guarantee */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-3">
        <Shield className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 space-y-1 leading-relaxed">
          <div className="font-semibold text-slate-900">Consent-Based Location Policy</div>
          <p>
            SmartGate never activates GPS silently or in the background without your explicit
            permission. Denying location permission never prevents submitting regular or emergency
            leaves. Tracking automatically expires once your approved leave return date passes.
          </p>
          <div className="pt-1 text-slate-500 flex flex-wrap items-center gap-2">
            <span>
              Student: <strong className="text-slate-800">{user?.name}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              USN: <strong className="font-mono text-slate-800">{studentProfile?.usn}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Phone:{' '}
              <strong className="font-mono text-slate-800">
                {user?.phone || studentProfile?.parentPhone || 'Not listed'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Dept: <strong className="text-slate-800">{studentProfile?.department}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Permission Denied Banner */}
      {permissionDenied && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900"
        >
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Location Permission Denied</div>
            <p className="mt-0.5">{permissionMessage}</p>
          </div>
        </div>
      )}

      {/* Auto-Expired Tracking Notice */}
      {!isSharing && isExpired && (
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-700">
          <Clock className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-slate-900">Previous Tracking Session Expired</div>
            <p className="mt-0.5">
              {status?.expiredReason || 'Your approved leave return window has ended.'} Past
              coordinates are no longer displayed as live.
            </p>
          </div>
        </div>
      )}

      {eligibleLeaves.length === 0 ? (
        <EmptyState
          title="No active approved leave available for tracking"
          description="Location tracking can be enabled once you have an approved or currently active hostel leave whose return date has not yet passed."
        />
      ) : (
        <>
          {/* Main Tracking Status & GPS Controls */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-6">
                <label
                  htmlFor="tracking-leave-select"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Linked Approved Leave Application
                </label>
                <select
                  id="tracking-leave-select"
                  value={selectedLeave?._id || ''}
                  onChange={(e) => setSelectedLeaveId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  {eligibleLeaves.map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.requestCode} ({l.leaveType}) — {l.status} · Return by{' '}
                      {formatDateTime(l.approvedReturnDate)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-6 flex flex-wrap items-center justify-start md:justify-end gap-2.5">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => setConsentModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Navigation className="w-4 h-4" />
                  {isSharing ? 'Update GPS Location' : 'Start Location Sharing'}
                </button>

                {isSharing && (
                  <button
                    type="button"
                    disabled={updating}
                    onClick={handleStopSharing}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <PowerOff className="w-4 h-4" />
                    Stop Location Sharing
                  </button>
                )}
              </div>
            </div>

            {/* Live Status Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-xs">
              <div>
                <div className="text-slate-500">Current Sharing Status</div>
                <div className="mt-1 font-semibold flex items-center gap-1.5">
                  <MapPin
                    className={`w-4 h-4 ${isSharing ? 'text-emerald-600' : 'text-slate-400'}`}
                  />
                  <span className={isSharing ? 'text-emerald-700' : 'text-slate-700'}>
                    {isSharing
                      ? `Actively Sharing (${status?.source === 'MANUAL' ? 'Manual Entry' : 'GPS Verified'})`
                      : isExpired
                      ? 'Tracking Expired'
                      : 'Location Sharing Stopped'}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-slate-500">Coordinates (Lat / Lng)</div>
                <div className="mt-1 font-mono font-medium text-slate-900 tabular-nums">
                  {isSharing && typeof status?.latitude === 'number' && typeof status?.longitude === 'number'
                    ? `${status.latitude.toFixed(5)}, ${status.longitude.toFixed(5)}`
                    : 'Location Not Available'}
                </div>
              </div>

              <div>
                <div className="text-slate-500">Sharing Started</div>
                <div className="mt-1 font-medium text-slate-900 tabular-nums">
                  {status?.sharingStartedAt ? formatDateTime(status.sharingStartedAt) : '—'}
                </div>
              </div>

              <div>
                <div className="text-slate-500">Last Updated</div>
                <div className="mt-1 font-medium text-slate-900 tabular-nums">
                  {status?.lastUpdatedAt ? formatDateTime(status.lastUpdatedAt) : '—'}
                </div>
              </div>
            </div>

            {isSharing && (status?.address || status?.landmark || status?.area || status?.city) && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-4 py-3 text-xs text-slate-700 space-y-1">
                <div>
                  <span className="text-slate-500">Current Address / Location: </span>
                  <strong className="text-slate-900">
                    {[status.address, status.area, status.city].filter(Boolean).join(', ')}
                  </strong>
                </div>
                {status.landmark && (
                  <div>
                    <span className="text-slate-500">Nearby Landmark: </span>
                    <span className="font-medium text-slate-800">{status.landmark}</span>
                  </div>
                )}
              </div>
            )}

            {/* OpenStreetMap Live View */}
            {isSharing && typeof status?.latitude === 'number' && typeof status?.longitude === 'number' ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div ref={mapContainerRef} className="w-full h-[360px]" />
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                {isSharing
                  ? 'Manual location address saved without map coordinates. Authorities can read your entered address and landmark.'
                  : 'Location coordinates are not shared. Click Start Location Sharing or enter a manual location below.'}
              </div>
            )}
          </div>

          {/* Manual Location Input Fallback */}
          <form
            onSubmit={handleManualSubmit}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-start gap-2.5">
              <Edit3 className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Manual Location Input (Alternative / Permission Fallback)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  If browser GPS is unavailable or permission was denied, submit your current stay
                  details manually. Manual entries are clearly distinguished from live GPS signals.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address / Street Details <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.address}
                  onChange={(e) => setManualForm({ ...manualForm, address: e.target.value })}
                  placeholder="House / Building / Street address"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Area / Locality
                </label>
                <input
                  type="text"
                  value={manualForm.area}
                  onChange={(e) => setManualForm({ ...manualForm, area: e.target.value })}
                  placeholder="e.g. Indiranagar"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={manualForm.city}
                  onChange={(e) => setManualForm({ ...manualForm, city: e.target.value })}
                  placeholder="e.g. Bengaluru"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nearby Landmark
                </label>
                <input
                  type="text"
                  value={manualForm.landmark}
                  onChange={(e) => setManualForm({ ...manualForm, landmark: e.target.value })}
                  placeholder="e.g. Near Metro Station / City Hospital"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submittingManual}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submittingManual ? 'Saving Location...' : 'Save Manual Location'}
              </button>
            </div>
          </form>
        </>
      )}

      {/* Explicit Consent Confirmation Dialog before Browser Geolocation */}
      {consentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="consent-location-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 id="consent-location-title" className="text-base font-bold text-slate-900">
                Confirm Location Sharing Consent
              </h3>
              <button
                type="button"
                onClick={() => setConsentModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
              <p>
                By clicking <strong>Allow &amp; Share Location</strong>, your browser will ask for
                GPS permission and share your coordinates with authorized SmartGate hostel
                authorities for leave{' '}
                <strong className="font-mono text-slate-900">
                  {selectedLeave?.requestCode}
                </strong>
                .
              </p>
              <p>
                Sharing stops immediately whenever you click <strong>Stop Location Sharing</strong>{' '}
                or automatically after{' '}
                <strong className="tabular-nums">
                  {formatDateTime(selectedLeave?.approvedReturnDate)}
                </strong>
                .
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConsentModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={triggerGpsLocationShare}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg"
              >
                Allow &amp; Share Location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
