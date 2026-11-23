import mongoose, { Schema, type Document } from 'mongoose';

export const USER_ROLES = [
  'STUDENT',
  'COORDINATOR',
  'MENTOR',
  'HOD',
  'SWO',
  'WARDEN',
  'AO',
  'SECURITY',
  'ADMIN',
  'EMERGENCY_CONTROL',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type AccountStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'PENDING_ACTIVATION'
  | 'DEACTIVATED';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  phone?: string;
  phoneNormalized?: string;
  department?: string;
  isActive: boolean;
  accountStatus: AccountStatus;
  activationTokenHash?: string;
  activationExpiresAt?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: USER_ROLES, required: true, index: true },
    phone: { type: String, trim: true },
    phoneNormalized: { type: String, trim: true, select: false },
    department: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    accountStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION', 'DEACTIVATED'],
      default: 'ACTIVE',
      index: true,
    },
    activationTokenHash: { type: String, select: false },
    activationExpiresAt: { type: Date },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.phoneNormalized;
        return ret;
      },
    },
  }
);

UserSchema.index({ role: 1, department: 1, isActive: 1 });
UserSchema.index(
  { phoneNormalized: 1 },
  { unique: true, sparse: true, name: 'unique_user_phone_normalized' }
);

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
