import mongoose, { Schema, type Document, type Types } from 'mongoose';

export const REGULAR_LEAVE_STATUSES = [
  'PENDING_COORDINATOR',
  'PENDING_MENTOR',
  'PENDING_HOD',
  'PENDING_SWO',
  'PENDING_WARDEN',
  'APPROVED',
  'REJECTED',
  'EXITED',
  'OVERDUE',
  'RETURNED',
  'RETURNED_LATE',
] as const;

export type RegularLeaveStatus = (typeof REGULAR_LEAVE_STATUSES)[number];

export interface ILeaveApplication extends Document {
  requestCode: string;
  studentId: Types.ObjectId;
  userId: Types.ObjectId;
  studentName: string;
  usn: string;
  department: string;
  semester: number;
  section: string;
  reason: string;
  departureDate: Date;
  expectedReturnDate: Date;
  approvedReturnDate: Date;
  parentContact: string;
  documentUrl?: string;
  documentName?: string;
  status: RegularLeaveStatus;
  hodRequired: boolean;
  previousApprovedDaysInSem: number;
  currentStage: string;
  rejectionReason?: string;
  rejectedByRole?: string;
  overdueAt?: Date;
  activeQrPassId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveApplicationSchema = new Schema<ILeaveApplication>(
  {
    requestCode: { type: String, required: true, unique: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    usn: { type: String, required: true, uppercase: true, trim: true, index: true },
    department: { type: String, required: true, trim: true, index: true },
    semester: { type: Number, required: true, min: 1, max: 10 },
    section: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true },
    departureDate: { type: Date, required: true },
    expectedReturnDate: { type: Date, required: true },
    approvedReturnDate: { type: Date, required: true },
    parentContact: { type: String, required: true, trim: true },
    documentUrl: { type: String },
    documentName: { type: String },
    status: {
      type: String,
      enum: REGULAR_LEAVE_STATUSES,
      default: 'PENDING_COORDINATOR',
      index: true,
    },
    hodRequired: { type: Boolean, default: false },
    previousApprovedDaysInSem: { type: Number, default: 0 },
    currentStage: { type: String, default: 'COORDINATOR' },
    rejectionReason: { type: String },
    rejectedByRole: { type: String },
    overdueAt: { type: Date },
    activeQrPassId: { type: Schema.Types.ObjectId, ref: 'QRPass' },
  },
  { timestamps: true }
);

LeaveApplicationSchema.index({ studentId: 1, status: 1, semester: 1 });
LeaveApplicationSchema.index({ department: 1, status: 1, createdAt: -1 });
LeaveApplicationSchema.index({ status: 1, approvedReturnDate: 1 });

LeaveApplicationSchema.pre('validate', function () {
  if (this.departureDate && this.expectedReturnDate && this.expectedReturnDate <= this.departureDate) {
    this.invalidate('expectedReturnDate', 'Expected return date must be after departure date.');
  }
});

export const LeaveApplication =
  mongoose.models.LeaveApplication || mongoose.model<ILeaveApplication>('LeaveApplication', LeaveApplicationSchema);
