import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  CameraOff,
  Upload,
  Search,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  LogIn,
} from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmModal } from '../../components/ConfirmModal';
import { formatDateTime } from '../../utils/formatters';

interface VerifyResult {
  verificationStatus: 'VALID' | 'REVOKED' | 'EXPIRED' | 'USED' | 'INVALID';
  isValid: boolean;
  message: string;
  pass: {
    passId: string;
    leaveType: 'REGULAR' | 'EMERGENCY';
    leaveRequestCode: string;
    status: string;
    departureDate: string;
    approvedReturnDate: string;
    issuedBy: string;
    revokedReason?: string;
    replacedByPassId?: string;
  } | null;
  student: {
    name: string;
    usn: string;
    department: string;
    semester?: number;
    section?: string;
    hostelBlock?: string;
    roomNumber?: string;
    parentPhone?: string;
  } | null;
  leave: {
    id: string;
    requestCode: string;
    reason: string;
    status: string;
    departureDate: string;
    approvedReturnDate: string;
  } | null;
  gateActivity: {
    exitTime?: string;
    returnTime?: string;
    status: string;
  } | null;
}

interface QRScannerViewProps {
  initialMode?: 'scanner' | 'manual';
  onGateRecorded?: () => void;
}

export function QRScannerView({ initialMode = 'scanner', onGateRecorded }: QRScannerViewProps) {
  const { showToast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [gateModal, setGateModal] = useState<'EXIT' | 'RETURN' | 'LATE_RETURN' | null>(null);
  const [gateProcessing, setGateProcessing] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerId = 'smartgate-qr-reader';

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // ignore cleanup error
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const verifyPayload = async (payloadOrId: string) => {
    if (!payloadOrId.trim()) return;
    setVerifying(true);
    try {
      const data = await apiRequest<VerifyResult>('/qr-passes/verify', {
        method: 'POST',
        body: JSON.stringify({ qrPayload: payloadOrId.trim() }),
      });
      setResult(data);
      showToast(
        data.isValid ? `Pass ${data.pass?.passId} verified as VALID.` : data.message,
        data.isValid ? 'success' : 'error'
      );
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setVerifying(false);
    }
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      await stopCamera();
      const html5Qr = new Html5Qrcode(readerId);
      scannerRef.current = html5Qr;
      setScanning(true);

      await html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          await stopCamera();
          await verifyPayload(decodedText);
        },
        () => {
          // frame decode miss — normal during scanning
        }
      );
    } catch (err) {
      setScanning(false);
      setCameraError(
        `Camera access unavailable (${
          (err as Error).message || 'permission denied or no camera device'
        }). Use QR Image Upload or Manual Pass ID Verification below.`
      );
    }
  };

  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const tempScanner = new Html5Qrcode('smartgate-qr-file-decoder');
      const decoded = await tempScanner.scanFile(file, true);
      tempScanner.clear();
      await verifyPayload(decoded);
    } catch {
      showToast(
        'Could not decode QR code from the uploaded image. Try a clearer PNG or enter the Pass ID manually.',
        'error'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleManualVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifyPayload(manualInput);
  };

  const handleGateAction = async (remarks: string) => {
    if (!result?.pass || !gateModal) return;
    setGateProcessing(true);
    try {
      if (gateModal === 'EXIT') {
        const res = await apiRequest<{ message: string }>('/gate/exit', {
          method: 'POST',
          body: JSON.stringify({
            passId: result.pass.passId,
            remarks,
          }),
        });
        showToast(res.message, 'success');
      } else {
        const res = await apiRequest<{ message: string }>('/gate/return', {
          method: 'POST',
          body: JSON.stringify({
            passId: result.pass.passId,
            remarks,
            ...(gateModal === 'LATE_RETURN'
              ? { lateReturnAuthorized: true, lateReturnReason: remarks }
              : {}),
          }),
        });
        showToast(res.message, 'success');
      }

      setGateModal(null);
      await verifyPayload(result.pass.passId);
      onGateRecorded?.();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setGateProcessing(false);
    }
  };

  const canRecordExit =
    result?.verificationStatus === 'VALID' && !result.gateActivity?.exitTime;
  const canRecordNormalReturn =
    result?.verificationStatus === 'VALID' &&
    Boolean(result.gateActivity?.exitTime) &&
    !result.gateActivity?.returnTime;
  const canRecordLateReturn =
    result?.verificationStatus === 'EXPIRED' &&
    Boolean(result.pass) &&
    !result.gateActivity?.returnTime;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Camera Scanner + File Upload + Manual Pass ID */}
        <div className="lg:col-span-6 space-y-5">
          {initialMode === 'scanner' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Live Camera QR Scanner</h2>
                  <p className="text-xs text-slate-500">
                    Scan student SmartGate QR passes directly via webcam or mobile camera.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!scanning ? (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Camera className="w-4 h-4" />
                      Start Scanner
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <CameraOff className="w-4 h-4" />
                      Stop Scanner
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl overflow-hidden min-h-[260px] flex items-center justify-center relative">
                <div id={readerId} className="w-full" />
                {!scanning && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center pointer-events-none">
                    <Camera className="w-8 h-8 mb-2 opacity-70" />
                    <span className="text-xs">
                      Click <strong>Start Scanner</strong> to activate camera preview
                    </span>
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg p-3">
                  {cameraError}
                </div>
              )}
            </div>
          )}

          {/* Fallback: QR Image Upload + Manual Pass ID */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Manual Pass ID Verification &amp; QR Image Scan
            </h3>

            <form onSubmit={handleManualVerify} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Enter Pass ID (e.g. SG-PASS-XXXX) or paste QR JSON..."
                  className="w-full pl-9 pr-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <button
                type="submit"
                disabled={verifying}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
              >
                {verifying ? 'Verifying...' : 'Verify Pass'}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-xs text-slate-700 font-medium">
                <Upload className="w-4 h-4 text-indigo-700" />
                <span>Upload Downloaded QR Code Image (.png / .jpg) to Scan</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleQrImageUpload}
                />
              </label>
              <div id="smartgate-qr-file-decoder" className="hidden" />
            </div>
          </div>
        </div>

        {/* Right Column: Verification Result & Gate Exit/Return Controls */}
        <div className="lg:col-span-6">
          {!result ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900">Awaiting Scan or Pass ID</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Scan a student’s QR code or enter a Pass ID to inspect cryptographic authenticity,
                validity window, and record digital gate exit or return.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div
                className={`px-5 py-4 border-b flex items-center justify-between gap-3 ${
                  result.isValid
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {result.isValid ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-red-700 shrink-0" />
                  )}
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      Verification Result: {result.verificationStatus}
                    </div>
                    <div className="text-xs text-slate-700">{result.message}</div>
                  </div>
                </div>
                <StatusBadge status={result.verificationStatus} />
              </div>

              {result.pass && result.student && (
                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-slate-500">Student Name</div>
                      <div className="font-semibold text-slate-900">{result.student.name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">USN / ID</div>
                      <div className="font-mono font-semibold text-slate-900">
                        {result.student.usn}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Department &amp; Hostel</div>
                      <div className="text-slate-800">
                        {result.student.department}
                        {result.student.hostelBlock
                          ? ` · ${result.student.hostelBlock} ${result.student.roomNumber}`
                          : ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Parent Contact</div>
                      <div className="font-mono text-slate-800">
                        {result.student.parentPhone || '—'}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Pass ID:</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {result.pass.passId}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Leave Request:</span>
                      <span className="font-mono text-slate-900">
                        {result.pass.leaveRequestCode} ({result.pass.leaveType})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Departure:</span>
                      <span className="tabular-nums text-slate-900">
                        {formatDateTime(result.pass.departureDate)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Approved Return Until:</span>
                      <span className="tabular-nums font-semibold text-indigo-800">
                        {formatDateTime(result.pass.approvedReturnDate)}
                      </span>
                    </div>
                  </div>

                  {result.gateActivity && (
                    <div className="bg-indigo-50/50 border border-indigo-200 rounded-lg p-3.5 text-xs space-y-1">
                      <div className="font-semibold text-slate-900">Current Gate Status</div>
                      <div className="tabular-nums text-slate-700">
                        Exit: {formatDateTime(result.gateActivity.exitTime)} · Return:{' '}
                        {formatDateTime(result.gateActivity.returnTime)}
                      </div>
                    </div>
                  )}

                  {/* Gate Exit / Return Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
                    {canRecordExit && (
                      <button
                        type="button"
                        onClick={() => setGateModal('EXIT')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Record Student Exit
                      </button>
                    )}

                    {canRecordNormalReturn && (
                      <button
                        type="button"
                        onClick={() => setGateModal('RETURN')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                      >
                        <LogIn className="w-4 h-4" />
                        Record Student Return
                      </button>
                    )}

                    {canRecordLateReturn && (
                      <button
                        type="button"
                        onClick={() => setGateModal('LATE_RETURN')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
                      >
                        <LogIn className="w-4 h-4" />
                        Authorize Late Return (Expired Pass)
                      </button>
                    )}

                    {!canRecordExit && !canRecordNormalReturn && !canRecordLateReturn && (
                      <span className="text-xs text-slate-500">
                        {result.gateActivity?.returnTime
                          ? 'Exit and return already completed for this pass.'
                          : result.verificationStatus === 'REVOKED'
                          ? 'Cannot use revoked pass at gate. Ask student for replacement QR pass.'
                          : 'No gate action permitted for this pass state.'}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(gateModal)}
        title={
          gateModal === 'EXIT'
            ? `Record Hostel Exit (${result?.student?.name})`
            : gateModal === 'LATE_RETURN'
            ? `Authorize Late Return (${result?.student?.name})`
            : `Record Hostel Return (${result?.student?.name})`
        }
        description={
          gateModal === 'EXIT'
            ? `Confirm student identity and log official digital exit for pass ${result?.pass?.passId}.`
            : gateModal === 'LATE_RETURN'
            ? 'This QR pass is expired. Recording an authorized late return logs RETURNED_LATE with reason and alerts SWO and Warden.'
            : `Confirm student return to hostel for pass ${result?.pass?.passId}.`
        }
        confirmLabel={
          gateModal === 'EXIT'
            ? 'Confirm Exit'
            : gateModal === 'LATE_RETURN'
            ? 'Record RETURNED_LATE'
            : 'Confirm Return'
        }
        variant={gateModal === 'LATE_RETURN' ? 'danger' : 'primary'}
        showRemarks={true}
        remarksRequired={gateModal === 'LATE_RETURN'}
        remarksPlaceholder={
          gateModal === 'LATE_RETURN'
            ? 'Mandatory late return reason...'
            : 'Optional gate remarks...'
        }
        loading={gateProcessing}
        onConfirm={handleGateAction}
        onClose={() => setGateModal(null)}
      />
    </div>
  );
}
