import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IGateActivity extends Document {
  passId: string;
  qrPassRef?: Types.ObjectId;
  leaveType: 'REGULAR' | 'EMERGENCY';
  leaveRefId: Types.ObjectId;
  leaveRequestCode: string;
  studentId: Types.ObjectId;
  studentName: string;
  usn: string;
  department: string;
  exitTime?: Date;
  exitRecordedBy?: Types.ObjectId;
  exitRecordedByName?: string;
  exitRemarks?: string;
  returnTime?: Date;
  returnRecordedBy?: Types.ObjectId;
  returnRecordedByName?: string;
  returnRemarks?: string;
  isLateReturn: boolean;
  lateReturnReason?: string;
  lateReturnAuthorized: boolean;
  status: 'EXITED' | 'RETURNED' | 'RETURNED_LATE';
  createdAt: Date;
  updatedAt: Date;
}

const GateActivitySchema = new Schema<IGateActivity>(
  {
    passId: { type: String, required: true, index: true },
    qrPassRef: { type: Schema.Types.ObjectId, ref: 'QRPass' },
    leaveType: { type: String, enum: ['REGULAR', 'EMERGENCY'], required: true },
    leaveRefId: { type: Schema.Types.ObjectId, required: true, index: true },
    leaveRequestCode: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    usn: { type: String, required: true, uppercase: true, trim: true },
    department: { type: String, required: true, trim: true },
    exitTime: { type: Date },
    exitRecordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    exitRecordedByName: { type: String },
    exitRemarks: { type: String },
    returnTime: { type: Date },
    returnRecordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    returnRecordedByName: { type: String },
    returnRemarks: { type: String },
    isLateReturn: { type: Boolean, default: false },
    lateReturnReason: { type: String },
    lateReturnAuthorized: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['EXITED', 'RETURNED', 'RETURNED_LATE'],
      default: 'EXITED',
      index: true,
    },
  },
  { timestamps: true }
);

GateActivitySchema.index({ leaveRefId: 1, leaveType: 1 }, { unique: true });

export const GateActivity =
  mongoose.models.GateActivity || mongoose.model<IGateActivity>('GateActivity', GateActivitySchema);
