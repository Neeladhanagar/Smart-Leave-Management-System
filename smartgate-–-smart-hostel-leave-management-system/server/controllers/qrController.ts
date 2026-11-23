import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { QRPass } from '../models/QRPass.ts';
import { LeaveApplication } from '../models/LeaveApplication.ts';
import { EmergencyLeave } from '../models/EmergencyLeave.ts';
import { GateActivity } from '../models/GateActivity.ts';
import { Student } from '../models/Student.ts';
import { AppSettings } from '../models/AppSettings.ts';
import { syncOverdueLeaves } from '../utils/leaveHelpers.ts';
import { logAudit } from '../services/auditService.ts';

export async function getQRPasses(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await syncOverdueLeaves();

    const { status, search } = req.query;
    const query: Record<string, unknown> = {};

    if (req.user.role === 'STUDENT') {
      query.userId = req.user.userId;
    }

    if (status && typeof status === 'string' && status !== 'ALL') {
      query.status = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { passId: regex },
        { leaveRequestCode: regex },
        { studentName: regex },
        { usn: regex },
      ];
    }

    const passes = await QRPass.find(query).sort({ createdAt: -1 }).lean();
    const settings = await AppSettings.findOne({ key: 'GLOBAL' }).lean();

    res.json({
      passes,
      collegeName: settings?.collegeName || 'National Institute of Engineering & Technology',
    });
  } catch (error) {
    console.error('getQRPasses error:', error);
    res.status(500).json({ error: 'Failed to retrieve QR passes.' });
  }
}

export async function verifyQRPass(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await syncOverdueLeaves();

    const { qrPayload, passId, token } = req.body;
    let lookupPassId = passId ? String(passId).trim().toUpperCase() : '';
    let lookupToken = token ? String(token).trim() : '';

    if (qrPayload) {
      const raw = String(qrPayload).trim();
      try {
        const parsed = JSON.parse(raw);
        if (parsed.passId) lookupPassId = String(parsed.passId).trim().toUpperCase();
        if (parsed.token) lookupToken = String(parsed.token).trim();
      } catch {
        // Might be raw passId or raw token scanned directly
        if (raw.startsWith('SG-PASS-')) {
          lookupPassId = raw.toUpperCase();
        } else if (raw.startsWith('SGV1.')) {
          lookupToken = raw;
        } else {
          lookupPassId = raw.toUpperCase();
        }
      }
    }

    if (!lookupPassId && !lookupToken) {
      res.status(400).json({ error: 'Provide a scanned QR payload, pass ID, or verification token.' });
      return;
    }

    const query: Record<string, unknown> = {};
    if (lookupPassId && lookupToken) {
      query.passId = lookupPassId;
      query.verificationToken = lookupToken;
    } else if (lookupPassId) {
      query.passId = lookupPassId;
    } else {
      query.verificationToken = lookupToken;
    }

    const qrPass = await QRPass.findOne(query).lean();

    if (!qrPass) {
      await logAudit({
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: req.user.role,
        action: 'VERIFY_QR_INVALID',
        entityType: 'QRPass',
        entityId: lookupPassId || 'UNKNOWN',
        details: `Invalid QR pass scan attempt (${lookupPassId || 'token mismatch'}).`,
      });

      res.json({
        verificationStatus: 'INVALID',
        isValid: false,
        message: 'No matching QR Pass found or verification token signature mismatch.',
        pass: null,
        student: null,
        leave: null,
        gateActivity: null,
      });
      return;
    }

    const [student, leave, gateActivity] = await Promise.all([
      Student.findById(qrPass.studentId).lean(),
      qrPass.leaveType === 'REGULAR'
        ? LeaveApplication.findById(qrPass.leaveRefId).lean()
        : EmergencyLeave.findById(qrPass.leaveRefId).lean(),
      GateActivity.findOne({ leaveRefId: qrPass.leaveRefId, leaveType: qrPass.leaveType }).lean(),
    ]);

    const now = new Date();
    let verificationStatus: 'VALID' | 'REVOKED' | 'EXPIRED' | 'USED' = 'VALID';
    let message = 'QR Pass is authentic and currently active.';

    if (qrPass.status === 'REVOKED') {
      verificationStatus = 'REVOKED';
      message = `This QR Pass was revoked (${qrPass.revokedReason || 'replaced'}).${
        qrPass.replacedByPassId ? ` Replacement Pass: ${qrPass.replacedByPassId}.` : ''
      }`;
    } else if (qrPass.status === 'USED') {
      verificationStatus = 'USED';
      message = 'Student has already completed exit and return on this QR Pass.';
    } else if (qrPass.status === 'EXPIRED' || now > new Date(qrPass.approvedReturnDate)) {
      verificationStatus = 'EXPIRED';
      message = `QR Pass expired at ${new Date(qrPass.approvedReturnDate).toLocaleString()}.`;
    }

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: `VERIFY_QR_${verificationStatus}`,
      entityType: 'QRPass',
      entityId: qrPass.passId,
      details: `Security verified ${qrPass.passId} -> ${verificationStatus}`,
    });

    res.json({
      verificationStatus,
      isValid: verificationStatus === 'VALID',
      message,
      pass: {
        passId: qrPass.passId,
        leaveType: qrPass.leaveType,
        leaveRequestCode: qrPass.leaveRequestCode,
        status: qrPass.status,
        departureDate: qrPass.departureDate,
        approvedReturnDate: qrPass.approvedReturnDate,
        issuedBy: qrPass.issuedBy,
        revokedReason: qrPass.revokedReason,
        replacedByPassId: qrPass.replacedByPassId,
      },
      student: student
        ? {
            name: qrPass.studentName,
            usn: qrPass.usn,
            department: qrPass.department,
            semester: student.semester,
            section: student.section,
            hostelBlock: student.hostelBlock,
            roomNumber: student.roomNumber,
            parentPhone: student.parentPhone,
          }
        : {
            name: qrPass.studentName,
            usn: qrPass.usn,
            department: qrPass.department,
          },
      leave: leave
        ? {
            id: String(leave._id),
            requestCode: leave.requestCode,
            reason: leave.reason,
            status: leave.status,
            departureDate: leave.departureDate,
            approvedReturnDate: leave.approvedReturnDate,
          }
        : null,
      gateActivity,
    });
  } catch (error) {
    console.error('verifyQRPass error:', error);
    res.status(500).json({ error: 'Failed to verify QR pass.' });
  }
}
