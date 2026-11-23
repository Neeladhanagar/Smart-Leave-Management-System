import { Types } from 'mongoose';
import { Notification } from '../models/Notification.ts';
import { User, type UserRole } from '../models/User.ts';

type NotificationCategory = 'LEAVE' | 'EMERGENCY' | 'EXTENSION' | 'QR_PASS' | 'GATE' | 'OVERDUE' | 'SYSTEM';

export async function notifyUser(params: {
  userId: string | Types.ObjectId;
  role: string;
  title: string;
  message: string;
  category: NotificationCategory;
  relatedId?: string;
}): Promise<void> {
  await Notification.create({
    recipientUserId: params.userId,
    recipientRole: params.role,
    title: params.title,
    message: params.message,
    category: params.category,
    relatedId: params.relatedId,
    isRead: false,
  });
}

export async function notifyRoles(params: {
  roles: UserRole[];
  title: string;
  message: string;
  category: NotificationCategory;
  relatedId?: string;
  department?: string;
}): Promise<void> {
  const query: Record<string, unknown> = {
    role: { $in: params.roles },
    isActive: true,
  };
  const users = await User.find(query).select('_id role department');
  if (users.length === 0) return;

  const docs = users
    .filter((u) => {
      if (!params.department) return true;
      if (['COORDINATOR', 'MENTOR', 'HOD'].includes(u.role) && u.department) {
        return u.department === params.department;
      }
      return true;
    })
    .map((u) => ({
      recipientUserId: u._id,
      recipientRole: u.role,
      title: params.title,
      message: params.message,
      category: params.category,
      relatedId: params.relatedId,
      isRead: false,
    }));

  if (docs.length > 0) {
    await Notification.insertMany(docs);
  }
}
