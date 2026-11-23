import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../services/api';
import { ROLE_LABELS } from '../utils/formatters';

export function ProfilePanel() {
  const { user, studentProfile, authorityProfile, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [phone, setPhone] = useState(user?.phone || '');
  const [parentPhone, setParentPhone] = useState(studentProfile?.parentPhone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          phone,
          ...(user?.role === 'STUDENT' ? { parentPhone } : {}),
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });
      await refreshProfile();
      setCurrentPassword('');
      setNewPassword('');
      showToast('Profile settings updated successfully.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Account Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Full Name</div>
            <div className="font-medium text-slate-900 mt-0.5">{user?.name}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Email Address</div>
            <div className="font-medium text-slate-900 mt-0.5">{user?.email}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Assigned Role</div>
            <div className="font-semibold text-indigo-700 mt-0.5">
              {user ? ROLE_LABELS[user.role] : ''}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Department</div>
            <div className="font-medium text-slate-900 mt-0.5">{user?.department || 'All'}</div>
          </div>

          {studentProfile && (
            <>
              <div>
                <div className="text-xs text-slate-500">Student USN</div>
                <div className="font-mono font-medium text-slate-900 mt-0.5">
                  {studentProfile.usn}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Semester & Section</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  Sem {studentProfile.semester} · Section {studentProfile.section}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Hostel & Room</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {studentProfile.hostelBlock} · {studentProfile.roomNumber}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Approved Regular Days (Sem {studentProfile.semester})</div>
                <div className="font-semibold text-slate-900 tabular-nums mt-0.5">
                  {studentProfile.approvedRegularDaysInSem ?? 0} days
                </div>
              </div>
            </>
          )}

          {authorityProfile && (
            <>
              <div>
                <div className="text-xs text-slate-500">Employee ID</div>
                <div className="font-mono font-medium text-slate-900 mt-0.5">
                  {authorityProfile.employeeId}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Designation</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {authorityProfile.designation}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Office Location</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {authorityProfile.officeLocation || 'Main Campus'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
      >
        <h2 className="text-base font-semibold text-slate-900">Contact & Security</h2>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>

        {user?.role === 'STUDENT' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Parent / Guardian Contact
            </label>
            <input
              type="text"
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="text-xs font-semibold text-slate-700">Change Password (Optional)</div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
