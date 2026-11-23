import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface INotification extends Document {
  recipientUserId: Types.ObjectId;
  recipientRole: string;
  title: string;
  message: string;
  category: 'LEAVE' | 'EMERGENCY' | 'EXTENSION' | 'QR_PASS' | 'GATE' | 'OVERDUE' | 'SYSTEM';
  relatedId?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipientUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientRole: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['LEAVE', 'EMERGENCY', 'EXTENSION', 'QR_PASS', 'GATE', 'OVERDUE', 'SYSTEM'],
      default: 'SYSTEM',
    },
    relatedId: { type: String },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const Notification =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
