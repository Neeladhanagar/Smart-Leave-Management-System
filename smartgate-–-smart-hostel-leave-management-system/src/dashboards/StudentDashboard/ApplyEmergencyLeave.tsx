import React, { useState } from 'react';
import { Upload, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../services/api';

interface ApplyEmergencyLeaveProps {
  onSubmitted: () => void;
}

export function ApplyEmergencyLeave({ onSubmitted }: ApplyEmergencyLeaveProps) {
  const { user, studentProfile } = useAuth();
  const { showToast } = useToast();

  const [emergencyType, setEmergencyType] = useState('Medical Emergency');
  const [reason, setReason] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [parentContact, setParentContact] = useState(studentProfile?.parentPhone || '');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!reason.trim() || !departureDate || !expectedReturnDate || !parentContact.trim()) {
      setError('Please complete all required emergency leave fields.');
      return;
    }

    if (new Date(expectedReturnDate) <= new Date(departureDate)) {
      setError('Expected return date & time must be after departure date & time.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('studentName', user?.name || '');
      formData.append('usn', studentProfile?.usn || '');
      formData.append('department', studentProfile?.department || user?.department || 'CSE');
      formData.append('semester', String(studentProfile?.semester || 6));
      formData.append('section', studentProfile?.section || 'A');
      formData.append('emergencyType', emergencyType);
      formData.append('reason', reason.trim());
      formData.append('departureDate', departureDate);
      formData.append('expectedReturnDate', expectedReturnDate);
      formData.append('parentContact', parentContact.trim());
      if (file) {
        formData.append('document', file);
      }

      await apiRequest('/leaves/emergency', {
        method: 'POST',
        body: formData,
      });

      showToast('Emergency leave submitted directly to Administrative Officer (AO).', 'success');
      onSubmitted();
    } catch (err) {
      setError((err as Error).message);
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 space-y-1">
          <div className="font-semibold">
            Direct Emergency Workflow: Student → AO → Approval / Rejection → QR Pass
          </div>
          <p>
            Emergency requests bypass Coordinator, Mentor, HOD, SWO, and Warden approval queues and
            go directly to the Administrative Officer (AO) for rapid clearance. SWO and Warden are
            notified for information only.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <h2 className="text-base font-semibold text-slate-900">Emergency Leave Request Form</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-3.5 py-2.5">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs">
          <div>
            <span className="text-slate-500">Student:</span>{' '}
            <strong className="text-slate-900">{user?.name}</strong>
          </div>
          <div>
            <span className="text-slate-500">USN:</span>{' '}
            <strong className="font-mono text-slate-900">{studentProfile?.usn}</strong>
          </div>
          <div>
            <span className="text-slate-500">Dept / Sem:</span>{' '}
            <strong className="text-slate-900">
              {studentProfile?.department} · Sem {studentProfile?.semester}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Emergency Category</label>
            <select
              value={emergencyType}
              onChange={(e) => setEmergencyType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="Medical Emergency">Medical Emergency</option>
              <option value="Family Critical Care">Family Critical Care</option>
              <option value="Bereavement">Bereavement</option>
              <option value="Urgent Personal Crisis">Urgent Personal Crisis</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Parent / Guardian Contact
            </label>
            <input
              type="text"
              required
              value={parentContact}
              onChange={(e) => setParentContact(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Departure Date &amp; Time
            </label>
            <input
              type="datetime-local"
              required
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Expected Return Date &amp; Time
            </label>
            <input
              type="datetime-local"
              required
              value={expectedReturnDate}
              onChange={(e) => setExpectedReturnDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Emergency Reason</label>
          <textarea
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Provide clear emergency context for AO verification..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Supporting Proof / Medical Slip (Optional · PDF, PNG, JPG max 5MB)
          </label>
          <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <Upload className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-xs text-slate-600 truncate">
              {file ? file.name : 'Upload supporting emergency document'}
            </span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60"
          >
            {submitting ? 'Submitting to AO...' : 'Submit Emergency Leave to AO'}
          </button>
        </div>
      </form>
    </div>
  );
}
