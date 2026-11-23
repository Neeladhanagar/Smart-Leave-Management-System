import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IQRPass extends Document {
  passId: string;
  leaveType: 'REGULAR' | 'EMERGENCY';
  leaveRefId: Types.ObjectId;
  leaveRequestCode: string;
  studentId: Types.ObjectId;
  userId: Types.ObjectId;
  studentName: string;
  usn: string;
  department: string;
  departureDate: Date;
  approvedReturnDate: Date;
  verificationToken: string;
  qrPayload: string;
  qrImageDataUrl: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'USED';
  revokedReason?: string;
  revokedAt?: Date;
  replacedByPassId?: string;
  issuedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const QRPassSchema = new Schema<IQRPass>(
  {
    passId: { type: String, required: true, unique: true, index: true },
    leaveType: { type: String, enum: ['REGULAR', 'EMERGENCY'], required: true },
    leaveRefId: { type: Schema.Types.ObjectId, required: true, index: true },
    leaveRequestCode: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    usn: { type: String, required: true, uppercase: true, trim: true },
    department: { type: String, required: true, trim: true },
    departureDate: { type: Date, required: true },
    approvedReturnDate: { type: Date, required: true },
    verificationToken: { type: String, required: true, unique: true, index: true },
    qrPayload: { type: String, required: true },
    qrImageDataUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED', 'EXPIRED', 'USED'],
      default: 'ACTIVE',
      index: true,
    },
    revokedReason: { type: String },
    revokedAt: { type: Date },
    replacedByPassId: { type: String },
    issuedBy: { type: String, required: true },
  },
  { timestamps: true }
);

QRPassSchema.index({ leaveRefId: 1, leaveType: 1, status: 1 });
QRPassSchema.index({ userId: 1, createdAt: -1 });

export const QRPass = mongoose.models.QRPass || mongoose.model<IQRPass>('QRPass', QRPassSchema);
