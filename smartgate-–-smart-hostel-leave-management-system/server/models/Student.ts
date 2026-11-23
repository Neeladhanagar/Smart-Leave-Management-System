import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IStudent extends Document {
  userId: Types.ObjectId;
  usn: string;
  department: string;
  semester: number;
  section: string;
  hostelBlock: string;
  roomNumber: string;
  parentName?: string;
  parentPhone: string;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    usn: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    department: { type: String, required: true, trim: true, index: true },
    semester: { type: Number, required: true, min: 1, max: 10 },
    section: { type: String, required: true, trim: true, uppercase: true },
    hostelBlock: { type: String, default: 'Block A', trim: true },
    roomNumber: { type: String, default: '101', trim: true },
    parentName: { type: String, trim: true },
    parentPhone: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

StudentSchema.index({ department: 1, semester: 1, section: 1 });

export const Student = mongoose.models.Student || mongoose.model<IStudent>('Student', StudentSchema);
