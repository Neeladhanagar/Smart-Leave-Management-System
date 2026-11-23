import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLE_HOME_ROUTES, ROLE_LABELS } from '../utils/formatters';

export function UnauthorizedPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Access Restricted</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          {user
            ? `Your active role (${ROLE_LABELS[user.role]}) is not authorized to view this dashboard.`
            : 'You do not have permission to access this page.'}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          {user ? (
            <button
              type="button"
              onClick={() => navigate(ROLE_HOME_ROUTES[user.role], { replace: true })}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to My Dashboard
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg"
            >
              Sign In
            </button>
          )}
          {user && (
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              Switch Account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
