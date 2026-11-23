import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IApprovalHistory extends Document {
  leaveType: 'REGULAR' | 'EMERGENCY' | 'REGULAR_EXTENSION' | 'EMERGENCY_EXTENSION';
  targetId: Types.ObjectId;
  requestCode: string;
  stage: string;
  action: string;
  actorUserId?: Types.ObjectId;
  actorName: string;
  actorRole: string;
  remarks?: string;
  timestamp: Date;
}

const ApprovalHistorySchema = new Schema<IApprovalHistory>(
  {
    leaveType: {
      type: String,
      enum: ['REGULAR', 'EMERGENCY', 'REGULAR_EXTENSION', 'EMERGENCY_EXTENSION'],
      required: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    requestCode: { type: String, required: true, index: true },
    stage: { type: String, required: true },
    action: { type: String, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true },
    remarks: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const ApprovalHistory =
  mongoose.models.ApprovalHistory || mongoose.model<IApprovalHistory>('ApprovalHistory', ApprovalHistorySchema);
