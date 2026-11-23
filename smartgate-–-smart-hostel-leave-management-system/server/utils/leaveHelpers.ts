import crypto from 'crypto';
import QRCode from 'qrcode';
import { Types } from 'mongoose';
import { LeaveApplication } from '../models/LeaveApplication.ts';
import { EmergencyLeave } from '../models/EmergencyLeave.ts';
import { QRPass, type IQRPass } from '../models/QRPass.ts';
import { GateActivity } from '../models/GateActivity.ts';
import { AppSettings } from '../models/AppSettings.ts';
import { getQrSigningSecret } from './secrets.ts';
import { notifyRoles, notifyUser } from '../services/notificationService.ts';
import { logApprovalHistory } from '../services/auditService.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function generateCode(prefix: string): string {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${year}-${rand}`;
}

/**
 * Calculates total approved regular leave days in the given semester
 * from MongoDB records.
 * - Excludes pending and rejected applications.
 * - Excludes emergency leaves (queries LeaveApplication only).
 * - Merges overlapping calendar-day intervals to avoid double-counting.
 */
export async function calculateApprovedRegularLeaveDays(
  studentId: string | Types.ObjectId,
  semester: number,
  excludeLeaveId?: string | Types.ObjectId
): Promise<number> {
  const query: Record<string, unknown> = {
    studentId,
    semester,
    status: { $in: ['APPROVED', 'EXITED', 'OVERDUE', 'RETURNED', 'RETURNED_LATE'] },
  };
  if (excludeLeaveId) {
    query._id = { $ne: excludeLeaveId };
  }

  const approvedLeaves = await LeaveApplication.find(query).select('departureDate approvedReturnDate');
  if (approvedLeaves.length === 0) return 0;

  const intervals: Array<[number, number]> = approvedLeaves.map((leave) => {
    const startMs = new Date(leave.departureDate).getTime();
    const endMs = Math.max(startMs, new Date(leave.approvedReturnDate).getTime());
    const startDay = Math.floor(startMs / MS_PER_DAY);
    const endDay = Math.floor(endMs / MS_PER_DAY);
    return [startDay, endDay];
  });

  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    if (merged.length === 0) {
      merged.push([start, end]);
    } else {
      const last = merged[merged.length - 1];
      if (start <= last[1] + 0) {
        last[1] = Math.max(last[1], end);
      } else {
        merged.push([start, end]);
      }
    }
  }

  let totalDays = 0;
  for (const [start, end] of merged) {
    totalDays += end - start + 1;
  }
  return totalDays;
}

export async function getHodThresholdDays(): Promise<number> {
  const settings = await AppSettings.findOne({ key: 'GLOBAL' });
  return settings?.hodThresholdDays ?? 5;
}

export function signQrVerificationToken(params: {
  passId: string;
  studentId: string;
  leaveRefId: string;
  leaveType: 'REGULAR' | 'EMERGENCY';
}): string {
  const nonce = crypto.randomBytes(12).toString('hex');
  const data = `${params.passId}|${params.studentId}|${params.leaveRefId}|${params.leaveType}|${nonce}`;
  const sig = crypto.createHmac('sha256', getQrSigningSecret()).update(data).digest('hex');
  return `SGV1.${nonce}.${sig}`;
}

export async function issueQRPassForLeave(params: {
  leaveType: 'REGULAR' | 'EMERGENCY';
  leaveRefId: Types.ObjectId | string;
  leaveRequestCode: string;
  studentId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  studentName: string;
  usn: string;
  department: string;
  departureDate: Date;
  approvedReturnDate: Date;
  issuedBy: string;
  replaceReason?: string;
}): Promise<IQRPass> {
  const passId = `SG-PASS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // Revoke any previous ACTIVE QR passes for this leave
  const activeOldPasses = await QRPass.find({
    leaveRefId: params.leaveRefId,
    leaveType: params.leaveType,
    status: 'ACTIVE',
  });

  for (const oldPass of activeOldPasses) {
    oldPass.status = 'REVOKED';
    oldPass.revokedReason = params.replaceReason || 'Replaced by updated QR pass';
    oldPass.revokedAt = new Date();
    oldPass.replacedByPassId = passId;
    await oldPass.save();

    await notifyUser({
      userId: params.userId,
      role: 'STUDENT',
      title: 'Previous QR Pass Revoked',
      message: `QR Pass ${oldPass.passId} for ${params.leaveRequestCode} has been revoked and replaced by ${passId}.`,
      category: 'QR_PASS',
      relatedId: oldPass.passId,
    });
  }

  const verificationToken = signQrVerificationToken({
    passId,
    studentId: String(params.studentId),
    leaveRefId: String(params.leaveRefId),
    leaveType: params.leaveType,
  });

  const payloadObject = {
    passId,
    studentId: String(params.studentId),
    leaveRequestId: String(params.leaveRefId),
    leaveRequestCode: params.leaveRequestCode,
    leaveType: params.leaveType,
    departureDate: new Date(params.departureDate).toISOString(),
    approvedReturnDate: new Date(params.approvedReturnDate).toISOString(),
    token: verificationToken,
  };

  const qrPayload = JSON.stringify(payloadObject);
  const qrImageDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 360,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });

  const qrPass = await QRPass.create({
    passId,
    leaveType: params.leaveType,
    leaveRefId: params.leaveRefId,
    leaveRequestCode: params.leaveRequestCode,
    studentId: params.studentId,
    userId: params.userId,
    studentName: params.studentName,
    usn: params.usn,
    department: params.department,
    departureDate: params.departureDate,
    approvedReturnDate: params.approvedReturnDate,
    verificationToken,
    qrPayload,
    qrImageDataUrl,
    status: 'ACTIVE',
    issuedBy: params.issuedBy,
  });

  if (params.leaveType === 'REGULAR') {
    await LeaveApplication.findByIdAndUpdate(params.leaveRefId, { activeQrPassId: qrPass._id });
  } else {
    await EmergencyLeave.findByIdAndUpdate(params.leaveRefId, { activeQrPassId: qrPass._id });
  }

  return qrPass;
}

/**
 * Checks for approved/exited leaves whose approvedReturnDate has elapsed without recorded return,
 * marks them OVERDUE, sets overdueAt, expires active passes, and sends notifications.
 */
export async function syncOverdueLeaves(): Promise<number> {
  const now = new Date();
  let updatedCount = 0;

  const checkModel = async (
    Model: typeof LeaveApplication | typeof EmergencyLeave,
    leaveType: 'REGULAR' | 'EMERGENCY'
  ) => {
    const candidates = await (Model as typeof LeaveApplication).find({
      status: { $in: ['APPROVED', 'EXITED'] },
      approvedReturnDate: { $lt: now },
    });

    for (const leave of candidates) {
      const gateRecord = await GateActivity.findOne({
        leaveRefId: leave._id,
        leaveType,
      });

      if (gateRecord && gateRecord.returnTime) {
        continue;
      }

      // Only mark overdue if student actually exited OR approved return deadline passed while active
      // Wait: per requirement "If the approved return time passes without a recorded digital return: Mark the leave as OVERDUE"
      leave.status = 'OVERDUE';
      leave.overdueAt = now;
      await leave.save();

      await QRPass.updateMany(
        { leaveRefId: leave._id, leaveType, status: 'ACTIVE' },
        { status: 'EXPIRED' }
      );

      await logApprovalHistory({
        leaveType,
        targetId: leave._id,
        requestCode: leave.requestCode,
        stage: 'SYSTEM',
        action: 'MARKED_OVERDUE',
        actorName: 'SmartGate Automated Monitor',
        actorRole: 'SYSTEM',
        remarks: `Approved return deadline (${new Date(leave.approvedReturnDate).toLocaleString()}) elapsed without recorded digital return.`,
      });

      await notifyUser({
        userId: leave.userId,
        role: 'STUDENT',
        title: 'Leave Marked Overdue',
        message: `Your leave ${leave.requestCode} passed the return deadline without gate return verification. Please report to Security or submit a Late Extension Request.`,
        category: 'OVERDUE',
        relatedId: leave.requestCode,
      });

      await notifyRoles({
        roles: ['SWO', 'WARDEN', 'SECURITY'],
        title: `Overdue Alert: ${leave.studentName} (${leave.usn})`,
        message: `${leaveType} leave ${leave.requestCode} passed approved return time without digital return.`,
        category: 'OVERDUE',
        relatedId: leave.requestCode,
      });

      updatedCount++;
    }
  };

  await checkModel(LeaveApplication, 'REGULAR');
  await checkModel(EmergencyLeave, 'EMERGENCY');

  return updatedCount;
}
