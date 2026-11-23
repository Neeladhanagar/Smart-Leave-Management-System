import mongoose, { Schema, type Document } from 'mongoose';

export interface IAppSettings extends Document {
  key: string;
  collegeName: string;
  hostelName: string;
  hodThresholdDays: number;
  currentSemesterLabel: string;
  allowLateExtensions: boolean;
  qrValidityBufferMinutes: number;
  updatedAt: Date;
}

const AppSettingsSchema = new Schema<IAppSettings>(
  {
    key: { type: String, default: 'GLOBAL', unique: true },
    collegeName: {
      type: String,
      default: process.env.COLLEGE_NAME || 'National Institute of Engineering & Technology',
    },
    hostelName: { type: String, default: 'SmartGate Central Hostels' },
    hodThresholdDays: { type: Number, default: 5, min: 0 },
    currentSemesterLabel: { type: String, default: '2026-ODD' },
    allowLateExtensions: { type: Boolean, default: true },
    qrValidityBufferMinutes: { type: Number, default: 30, min: 0 },
  },
  { timestamps: true }
);

export const AppSettings = mongoose.models.AppSettings || mongoose.model<IAppSettings>('AppSettings', AppSettingsSchema);
