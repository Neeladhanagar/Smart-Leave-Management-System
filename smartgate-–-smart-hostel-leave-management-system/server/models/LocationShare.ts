import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ILocationShare extends Document {
  studentId: Types.ObjectId;
  userId: Types.ObjectId;
  studentName: string;
  usn: string;
  phone?: string;
  department: string;
  leaveType?: 'REGULAR' | 'EMERGENCY';
  leaveRefId?: Types.ObjectId;
  leaveRequestCode?: string;
  leaveApprovalStatus?: string;
  approvedReturnDate?: Date;
  isSharing: boolean;
  source?: 'GPS' | 'MANUAL';
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  address?: string;
  area?: string;
  city?: string;
  landmark?: string;
  sharingStartedAt?: Date;
  lastUpdatedAt?: Date;
  sharedAt?: Date;
  stoppedAt?: Date;
  expiredReason?: string;
  updatedAt: Date;
}

const LocationShareSchema = new Schema<ILocationShare>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentName: { type: String, required: true },
    usn: { type: String, required: true, index: true },
    phone: { type: String, trim: true },
    department: { type: String, required: true },
    leaveType: { type: String, enum: ['REGULAR', 'EMERGENCY'] },
    leaveRefId: { type: Schema.Types.ObjectId },
    leaveRequestCode: { type: String, index: true },
    leaveApprovalStatus: { type: String },
    approvedReturnDate: { type: Date },
    isSharing: { type: Boolean, default: false, index: true },
    source: { type: String, enum: ['GPS', 'MANUAL'] },
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    address: { type: String, trim: true },
    area: { type: String, trim: true },
    city: { type: String, trim: true },
    landmark: { type: String, trim: true },
    sharingStartedAt: { type: Date },
    lastUpdatedAt: { type: Date },
    sharedAt: { type: Date },
    stoppedAt: { type: Date },
    expiredReason: { type: String, trim: true },
  },
  { timestamps: true }
);

export const LocationShare =
  mongoose.models.LocationShare || mongoose.model<ILocationShare>('LocationShare', LocationShareSchema);
