import mongoose, { Schema, type Document, type Types } from 'mongoose';
import type { UserRole } from './User.ts';

export type RegistrationRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PublicStaffRole = Exclude<UserRole, 'STUDENT' | 'ADMIN'>;

export interface IRegistrationRequest extends Document {
  name: string;
  email: string;
  phone: string;
  requestedRole: PublicStaffRole;
  employeeId: string;
  department?: string;
  details: Record<string, string>;
  passwordHash: string;
  status: RegistrationRequestStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  createdUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RegistrationRequestSchema = new Schema<IRegistrationRequest>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    requestedRole: {
      type: String,
      enum: [
        'COORDINATOR',
        'MENTOR',
        'HOD',
        'SWO',
        'WARDEN',
        'AO',
        'SECURITY',
        'EMERGENCY_CONTROL',
      ],
      required: true,
      index: true,
    },
    employeeId: { type: String, required: true, uppercase: true, trim: true, index: true },
    department: { type: String, trim: true },
    details: { type: Schema.Types.Mixed, required: true },
    passwordHash: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNotes: { type: String, trim: true },
    createdUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

RegistrationRequestSchema.index({ status: 1, createdAt: -1 });
RegistrationRequestSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' }, name: 'unique_pending_registration_email' }
);
RegistrationRequestSchema.index(
  { employeeId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' }, name: 'unique_pending_registration_employee_id' }
);

export const RegistrationRequest =
  mongoose.models.RegistrationRequest ||
  mongoose.model<IRegistrationRequest>('RegistrationRequest', RegistrationRequestSchema);