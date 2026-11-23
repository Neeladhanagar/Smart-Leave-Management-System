import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { Notification } from '../models/Notification.ts';

export async function getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const notifications = await Notification.find({ recipientUserId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('getNotifications error:', error);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
}

export async function markNotificationRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientUserId: req.user.userId },
      { isRead: true }
    );
    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    console.error('markNotificationRead error:', error);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
}

export async function markAllNotificationsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await Notification.updateMany(
      { recipientUserId: req.user.userId, isRead: false },
      { isRead: true }
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('markAllNotificationsRead error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
}
