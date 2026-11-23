import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IDecisionRecord {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  remarks?: string;
  decidedBy?: Types.ObjectId;
  decidedByName?: string;
  decidedAt?: Date;
}

const DecisionSchema = new Schema<IDecisionRecord>(
  {
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    remarks: { type: String },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedByName: { type: String },
    decidedAt: { type: Date },
  },
  { _id: false }
);

export interface ILeaveExtension extends Document {
  extensionCode: string;
  leaveId: Types.ObjectId;
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
  status: 'PENDING_SWO' | 'PENDING_WARDEN' | 'APPROVED' | 'REJECTED';
  swoDecision: IDecisionRecord;
  wardenDecision: IDecisionRecord;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveExtensionSchema = new Schema<ILeaveExtension>(
  {
    extensionCode: { type: String, required: true, unique: true, index: true },
    leaveId: { type: Schema.Types.ObjectId, ref: 'LeaveApplication', required: true, index: true },
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
      enum: ['PENDING_SWO', 'PENDING_WARDEN', 'APPROVED', 'REJECTED'],
      default: 'PENDING_SWO',
      index: true,
    },
    swoDecision: { type: DecisionSchema, default: () => ({ status: 'PENDING' }) },
    wardenDecision: { type: DecisionSchema, default: () => ({ status: 'PENDING' }) },
  },
  { timestamps: true }
);

export const LeaveExtension =
  mongoose.models.LeaveExtension || mongoose.model<ILeaveExtension>('LeaveExtension', LeaveExtensionSchema);
