import React, { useState, useEffect } from 'react';
import { CheckCheck, Check } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { NotificationItem } from '../types';
import { formatDateTime } from '../utils/formatters';
import { EmptyState } from './EmptyState';
import { LoadingSkeleton } from './LoadingSkeleton';

export function NotificationsPage() {
  const { setUnreadNotifications } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ notifications: NotificationItem[]; unreadCount: number }>(
        '/notifications'
      );
      setItems(data.notifications);
      setUnreadNotifications(data.unreadCount);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id: string) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PUT' });
      setItems((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      setUnreadNotifications((c) => Math.max(0, c - 1));
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'PUT' });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadNotifications(0);
      showToast('All notifications marked as read.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  if (loading) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Notifications Center</h2>
          <p className="text-sm text-slate-500">
            Real-time leave decisions, QR pass alerts, and gate return notices.
          </p>
        </div>
        {items.some((n) => !n.isRead) && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="Updates on leave approvals, QR passes, extensions, and gate activity will appear here."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
          {items.map((n) => (
            <div
              key={n._id}
              className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                !n.isRead ? 'bg-indigo-50/30' : 'bg-white'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{n.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{formatDateTime(n.createdAt)}</span>
                  {n.relatedId && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-700">{n.relatedId}</span>
                    </>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-slate-900">{n.title}</h3>
                <p className="text-sm text-slate-600">{n.message}</p>
              </div>
              {!n.isRead && (
                <button
                  type="button"
                  onClick={() => markRead(n._id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0 self-start sm:self-center whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
