import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IEmergencyDecisionRecord {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  remarks?: string;
  decidedBy?: Types.ObjectId;
  decidedByName?: string;
  decidedAt?: Date;
}

const EmergencyDecisionSchema = new Schema<IEmergencyDecisionRecord>(
  {
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    remarks: { type: String },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedByName: { type: String },
    decidedAt: { type: Date },
  },
  { _id: false }
);

export interface IEmergencyLeaveExtension extends Document {
  extensionCode: string;
  emergencyLeaveId: Types.ObjectId;
  leaveRequestCode: string;
  studentId: Types.ObjectId;
  userId: Types.ObjectId;
  studentName: string;
  usn: string;
  department: string;
  originalReturnDate: Date;
  requestedReturnDate: Date;
  reason: string;
  documentUrl?: string;
  documentName?: string;
  isLateExtension: boolean;
  extensionTag: 'STANDARD_EXTENSION' | 'LATE_EXTENSION_REQUEST';
  status: 'PENDING_AO' | 'APPROVED' | 'REJECTED';
  aoDecision: IEmergencyDecisionRecord;
  createdAt: Date;
  updatedAt: Date;
}

const EmergencyLeaveExtensionSchema = new Schema<IEmergencyLeaveExtension>(
  {
    extensionCode: { type: String, required: true, unique: true, index: true },
    emergencyLeaveId: { type: Schema.Types.ObjectId, ref: 'EmergencyLeave', required: true, index: true },
    leaveRequestCode: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    usn: { type: String, required: true, uppercase: true, trim: true },
    department: { type: String, required: true, trim: true },
    originalReturnDate: { type: Date, required: true },
    requestedReturnDate: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    documentUrl: { type: String },
    documentName: { type: String },
    isLateExtension: { type: Boolean, default: false },
    extensionTag: {
      type: String,
      enum: ['STANDARD_EXTENSION', 'LATE_EXTENSION_REQUEST'],
      default: 'STANDARD_EXTENSION',
    },
    status: {
      type: String,
      enum: ['PENDING_AO', 'APPROVED', 'REJECTED'],
      default: 'PENDING_AO',
      index: true,
    },
    aoDecision: { type: EmergencyDecisionSchema, default: () => ({ status: 'PENDING' }) },
  },
  { timestamps: true }
);

export const EmergencyLeaveExtension =
  mongoose.models.EmergencyLeaveExtension ||
  mongoose.model<IEmergencyLeaveExtension>('EmergencyLeaveExtension', EmergencyLeaveExtensionSchema);
