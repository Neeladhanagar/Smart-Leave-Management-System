import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { USER_ROLES, type UserRole } from './User.ts';

export interface IAuthority extends Document {
  userId: Types.ObjectId;
  employeeId: string;
  role: UserRole;
  department?: string;
  designation: string;
  officeLocation?: string;
  assignedHostelBlock?: string;
  hostelName?: string;
  assignedSection?: string;
  assignedStudentGroups?: string[];
  assignedGate?: string;
  dutyLocation?: string;
  shift?: string;
  assignedControlCentre?: string;
  administrativePermissions?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const AuthoritySchema = new Schema<IAuthority>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    employeeId: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    role: { type: String, enum: USER_ROLES, required: true, index: true },
    department: { type: String, trim: true },
    designation: { type: String, required: true, trim: true },
    officeLocation: { type: String, trim: true },
    assignedHostelBlock: { type: String, trim: true },
    hostelName: { type: String, trim: true },
    assignedSection: { type: String, trim: true },
    assignedStudentGroups: [{ type: String, trim: true }],
    assignedGate: { type: String, trim: true },
    dutyLocation: { type: String, trim: true },
    shift: { type: String, trim: true },
    assignedControlCentre: { type: String, trim: true },
    administrativePermissions: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

export const Authority = mongoose.models.Authority || mongoose.model<IAuthority>('Authority', AuthoritySchema);
