import mongoose, { Schema, type Document, type Types } from 'mongoose';

export const EMERGENCY_LEAVE_STATUSES = [
  'PENDING_AO',
  'APPROVED',
  'REJECTED',
  'EXITED',
  'OVERDUE',
  'RETURNED',
  'RETURNED_LATE',
] as const;

export type EmergencyLeaveStatus = (typeof EMERGENCY_LEAVE_STATUSES)[number];

export interface IEmergencyLeave extends Document {
  requestCode: string;
  studentId: Types.ObjectId;
  userId: Types.ObjectId;
  studentName: string;
  usn: string;
  department: string;
  semester: number;
  section: string;
  emergencyType: string;
  reason: string;
  departureDate: Date;
  expectedReturnDate: Date;
  approvedReturnDate: Date;
  parentContact: string;
  documentUrl?: string;
  documentName?: string;
  status: EmergencyLeaveStatus;
  aoRemarks?: string;
  aoDecidedAt?: Date;
  aoDecidedBy?: Types.ObjectId;
  overdueAt?: Date;
  activeQrPassId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EmergencyLeaveSchema = new Schema<IEmergencyLeave>(
  {
    requestCode: { type: String, required: true, unique: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    usn: { type: String, required: true, uppercase: true, trim: true, index: true },
    department: { type: String, required: true, trim: true },
    semester: { type: Number, required: true, min: 1, max: 10 },
    section: { type: String, required: true, trim: true },
    emergencyType: { type: String, default: 'Medical / Family Emergency', trim: true },
    reason: { type: String, required: true, trim: true },
    departureDate: { type: Date, required: true },
    expectedReturnDate: { type: Date, required: true },
    approvedReturnDate: { type: Date, required: true },
    parentContact: { type: String, required: true, trim: true },
    documentUrl: { type: String },
    documentName: { type: String },
    status: {
      type: String,
      enum: EMERGENCY_LEAVE_STATUSES,
      default: 'PENDING_AO',
      index: true,
    },
    aoRemarks: { type: String },
    aoDecidedAt: { type: Date },
    aoDecidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    overdueAt: { type: Date },
    activeQrPassId: { type: Schema.Types.ObjectId, ref: 'QRPass' },
  },
  { timestamps: true }
);

export const EmergencyLeave =
  mongoose.models.EmergencyLeave || mongoose.model<IEmergencyLeave>('EmergencyLeave', EmergencyLeaveSchema);
