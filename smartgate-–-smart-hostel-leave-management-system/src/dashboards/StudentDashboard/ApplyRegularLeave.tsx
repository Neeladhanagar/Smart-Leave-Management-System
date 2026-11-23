import React, { useState } from 'react';
import { Upload, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../services/api';

interface ApplyRegularLeaveProps {
  onSubmitted: () => void;
}

export function ApplyRegularLeave({ onSubmitted }: ApplyRegularLeaveProps) {
  const { user, studentProfile, settings } = useAuth();
  const { showToast } = useToast();

  const [studentName, setStudentName] = useState(user?.name || '');
  const [usn, setUsn] = useState(studentProfile?.usn || '');
  const [department, setDepartment] = useState(studentProfile?.department || user?.department || 'CSE');
  const [semester, setSemester] = useState(String(studentProfile?.semester || 6));
  const [section, setSection] = useState(studentProfile?.section || 'A');
  const [reason, setReason] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [parentContact, setParentContact] = useState(studentProfile?.parentPhone || '');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const approvedDays = studentProfile?.approvedRegularDaysInSem ?? 0;
  const threshold = settings?.hodThresholdDays ?? 5;
  const hodRequired = approvedDays > threshold;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!reason.trim() || !departureDate || !expectedReturnDate || !parentContact.trim()) {
      setError('Please complete all required leave fields.');
      return;
    }

    if (new Date(expectedReturnDate) <= new Date(departureDate)) {
      setError('Expected return date & time must be after departure date & time.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('studentName', studentName.trim());
      formData.append('usn', usn.trim());
      formData.append('department', department.trim());
      formData.append('semester', semester);
      formData.append('section', section.trim());
      formData.append('reason', reason.trim());
      formData.append('departureDate', departureDate);
      formData.append('expectedReturnDate', expectedReturnDate);
      formData.append('parentContact', parentContact.trim());
      if (file) {
        formData.append('document', file);
      }

      await apiRequest('/leaves/regular', {
        method: 'POST',
        body: formData,
      });

      showToast('Regular leave application submitted to Coordinator.', 'success');
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
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-3">
        <Info className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 space-y-1">
          <div className="font-semibold text-slate-900">
            Regular Approval Path: Student → Coordinator → Mentor →{' '}
            {hodRequired ? 'HOD (Mandatory) → ' : 'HOD Skipped → '}SWO → Warden → QR Pass
          </div>
          <p>
            You currently have{' '}
            <strong className="text-slate-900 tabular-nums">{approvedDays} approved regular leave days</strong>{' '}
            in Semester {semester}. HOD approval is required only when prior approved regular leave days exceed{' '}
            {threshold} days.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <h2 className="text-base font-semibold text-slate-900">Regular Leave Application Form</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-3.5 py-2.5">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Student Name</label>
            <input
              type="text"
              required
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Student USN / ID</label>
            <input
              type="text"
              required
              value={usn}
              onChange={(e) => setUsn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
            <input
              type="text"
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Semester</label>
              <input
                type="number"
                min={1}
                max={10}
                required
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Section</label>
              <input
                type="text"
                required
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
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
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Parent / Guardian Contact Number
          </label>
          <input
            type="text"
            required
            value={parentContact}
            onChange={(e) => setParentContact(e.target.value)}
            placeholder="+91 98XXXXXXXX"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Leave Reason</label>
          <textarea
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the purpose and destination of your regular leave..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Supporting Document (Optional · PDF, PNG, JPG max 5MB)
          </label>
          <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <Upload className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-xs text-slate-600 truncate">
              {file ? file.name : 'Choose supporting document if applicable'}
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
            className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors disabled:opacity-60"
          >
            {submitting ? 'Submitting Application...' : 'Submit Regular Leave'}
          </button>
        </div>
      </form>
    </div>
  );
}
