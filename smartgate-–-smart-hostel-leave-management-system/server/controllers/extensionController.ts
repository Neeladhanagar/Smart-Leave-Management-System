import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { LeaveApplication } from '../models/LeaveApplication.ts';
import { EmergencyLeave } from '../models/EmergencyLeave.ts';
import { LeaveExtension } from '../models/LeaveExtension.ts';
import { EmergencyLeaveExtension } from '../models/EmergencyLeaveExtension.ts';
import { GateActivity } from '../models/GateActivity.ts';
import { LocationShare } from '../models/LocationShare.ts';
import {
  generateCode,
  issueQRPassForLeave,
} from '../utils/leaveHelpers.ts';
import { notifyRoles, notifyUser } from '../services/notificationService.ts';
import { logApprovalHistory, logAudit } from '../services/auditService.ts';

export async function applyExtension(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { leaveType, leaveId, requestedReturnDate, reason } = req.body;
    if (!leaveType || !leaveId || !requestedReturnDate || !reason) {
      res.status(400).json({ error: 'Leave type, leave ID, new return date, and reason are required.' });
      return;
    }

    const newReturn = new Date(requestedReturnDate);
    if (Number.isNaN(newReturn.getTime())) {
      res.status(400).json({ error: 'Invalid requested return date/time.' });
      return;
    }

    const docUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    const docName = req.file ? req.file.originalname : undefined;
    const now = new Date();

    if (leaveType === 'REGULAR') {
      const leave = await LeaveApplication.findById(leaveId);
      if (!leave) {
        res.status(404).json({ error: 'Original regular leave not found.' });
        return;
      }
      if (String(leave.userId) !== req.user.userId) {
        res.status(403).json({ error: 'You can only extend your own approved leaves.' });
        return;
      }
      if (!['APPROVED', 'EXITED', 'OVERDUE'].includes(leave.status)) {
        res.status(400).json({
          error: `Extensions are allowed only for approved/active leaves. Current status: ${leave.status}.`,
        });
        return;
      }
      if (newReturn <= new Date(leave.approvedReturnDate)) {
        res.status(400).json({
          error: 'Requested new return date/time must be later than the current approved return date/time.',
        });
        return;
      }

      // Prevent duplicate pending extension requests
      const existingPending = await LeaveExtension.findOne({
        leaveId: leave._id,
        status: { $in: ['PENDING_SWO', 'PENDING_WARDEN'] },
      });
      if (existingPending) {
        res.status(409).json({
          error: `A pending extension (${existingPending.extensionCode}) already exists for ${leave.requestCode}.`,
        });
        return;
      }

      const isLate = now > new Date(leave.approvedReturnDate);
      const extensionTag = isLate ? 'LATE_EXTENSION_REQUEST' : 'STANDARD_EXTENSION';
      const extensionCode = generateCode('EXT');

      const extension = await LeaveExtension.create({
        extensionCode,
        leaveId: leave._id,
        leaveRequestCode: leave.requestCode,
        studentId: leave.studentId,
        userId: leave.userId,
        studentName: leave.studentName,
        usn: leave.usn,
        department: leave.department,
        originalReturnDate: leave.approvedReturnDate,
        requestedReturnDate: newReturn,
        reason: String(reason).trim(),
        documentUrl: docUrl,
        documentName: docName,
        isLateExtension: isLate,
        extensionTag,
        status: 'PENDING_SWO',
        swoDecision: { status: 'PENDING' },
        wardenDecision: { status: 'PENDING' },
      });

      await logApprovalHistory({
        leaveType: 'REGULAR_EXTENSION',
        targetId: extension._id,
        requestCode: extension.extensionCode,
        stage: 'STUDENT',
        action: 'SUBMITTED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'STUDENT',
        remarks: `${isLate ? '[LATE_EXTENSION_REQUEST] ' : ''}Extension requested for ${leave.requestCode} until ${newReturn.toLocaleString()}. Original leave dates remain unchanged while pending.`,
      });

      await notifyRoles({
        roles: ['SWO', 'WARDEN'],
        title: `${isLate ? 'Late ' : ''}Extension Request: ${extension.extensionCode}`,
        message: `${leave.studentName} (${leave.usn}) requested extension for ${leave.requestCode} to ${newReturn.toLocaleString()}. Routed to SWO.`,
        category: 'EXTENSION',
        relatedId: extension.extensionCode,
      });

      await logAudit({
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: req.user.role,
        action: 'REQUEST_REGULAR_EXTENSION',
        entityType: 'LeaveExtension',
        entityId: extension.extensionCode,
        details: `Requested ${extensionTag} for ${leave.requestCode}`,
      });

      res.status(201).json({ extension });
      return;
    }

    if (leaveType === 'EMERGENCY') {
      const emg = await EmergencyLeave.findById(leaveId);
      if (!emg) {
        res.status(404).json({ error: 'Original emergency leave not found.' });
        return;
      }
      if (String(emg.userId) !== req.user.userId) {
        res.status(403).json({ error: 'You can only extend your own approved leaves.' });
        return;
      }
      if (!['APPROVED', 'EXITED', 'OVERDUE'].includes(emg.status)) {
        res.status(400).json({
          error: `Extensions are allowed only for approved/active emergency leaves. Current status: ${emg.status}.`,
        });
        return;
      }
      if (newReturn <= new Date(emg.approvedReturnDate)) {
        res.status(400).json({
          error: 'Requested new return date/time must be later than the current approved return date/time.',
        });
        return;
      }

      const existingPending = await EmergencyLeaveExtension.findOne({
        emergencyLeaveId: emg._id,
        status: 'PENDING_AO',
      });
      if (existingPending) {
        res.status(409).json({
          error: `A pending emergency extension (${existingPending.extensionCode}) already exists for ${emg.requestCode}.`,
        });
        return;
      }

      const isLate = now > new Date(emg.approvedReturnDate);
      const extensionTag = isLate ? 'LATE_EXTENSION_REQUEST' : 'STANDARD_EXTENSION';
      const extensionCode = generateCode('EEXT');

      const extension = await EmergencyLeaveExtension.create({
        extensionCode,
        emergencyLeaveId: emg._id,
        leaveRequestCode: emg.requestCode,
        studentId: emg.studentId,
        userId: emg.userId,
        studentName: emg.studentName,
        usn: emg.usn,
        department: emg.department,
        originalReturnDate: emg.approvedReturnDate,
        requestedReturnDate: newReturn,
        reason: String(reason).trim(),
        documentUrl: docUrl,
        documentName: docName,
        isLateExtension: isLate,
        extensionTag,
        status: 'PENDING_AO',
        aoDecision: { status: 'PENDING' },
      });

      await logApprovalHistory({
        leaveType: 'EMERGENCY_EXTENSION',
        targetId: extension._id,
        requestCode: extension.extensionCode,
        stage: 'STUDENT',
        action: 'SUBMITTED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'STUDENT',
        remarks: `${isLate ? '[LATE_EXTENSION_REQUEST] ' : ''}Emergency extension requested directly to AO for ${emg.requestCode}.`,
      });

      await notifyRoles({
        roles: ['AO', 'EMERGENCY_CONTROL'],
        title: `${isLate ? 'Late ' : ''}Emergency Extension: ${extension.extensionCode}`,
        message: `${emg.studentName} (${emg.usn}) requested emergency extension for ${emg.requestCode} directly to AO.`,
        category: 'EXTENSION',
        relatedId: extension.extensionCode,
      });

      await logAudit({
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: req.user.role,
        action: 'REQUEST_EMERGENCY_EXTENSION',
        entityType: 'EmergencyLeaveExtension',
        entityId: extension.extensionCode,
        details: `Requested ${extensionTag} for ${emg.requestCode}`,
      });

      res.status(201).json({ extension });
      return;
    }

    res.status(400).json({ error: 'leaveType must be REGULAR or EMERGENCY.' });
  } catch (error) {
    console.error('applyExtension error:', error);
    res.status(500).json({ error: 'Failed to submit extension request.' });
  }
}

export async function getExtensions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const regQuery: Record<string, unknown> = {};
    const emgQuery: Record<string, unknown> = {};

    if (req.user.role === 'STUDENT') {
      regQuery.userId = req.user.userId;
      emgQuery.userId = req.user.userId;
    }

    const [regularExtensions, emergencyExtensions] = await Promise.all([
      LeaveExtension.find(regQuery).sort({ createdAt: -1 }).lean(),
      EmergencyLeaveExtension.find(emgQuery).sort({ createdAt: -1 }).lean(),
    ]);

    res.json({ regularExtensions, emergencyExtensions });
  } catch (error) {
    console.error('getExtensions error:', error);
    res.status(500).json({ error: 'Failed to fetch leave extensions.' });
  }
}

export async function decideRegularExtension(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || !['SWO', 'WARDEN'].includes(req.user.role)) {
      res.status(403).json({
        error: 'Only SWO and Warden can review regular leave extensions.',
      });
      return;
    }

    const { decision, remarks } = req.body;
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      res.status(400).json({ error: 'Decision must be APPROVE or REJECT.' });
      return;
    }

    if (decision === 'REJECT' && (!remarks || !String(remarks).trim())) {
      res.status(400).json({ error: 'Remarks are required when rejecting an extension.' });
      return;
    }

    const ext = await LeaveExtension.findById(req.params.id);
    if (!ext) {
      res.status(404).json({ error: 'Regular leave extension not found.' });
      return;
    }

    const cleanRemarks = remarks ? String(remarks).trim() : '';

    if (req.user.role === 'SWO') {
      if (ext.status !== 'PENDING_SWO') {
        res.status(400).json({ error: `SWO cannot decide extension in status ${ext.status}.` });
        return;
      }

      ext.swoDecision = {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        remarks: cleanRemarks || (decision === 'APPROVE' ? 'Approved by SWO' : 'Rejected by SWO'),
        decidedBy: req.user.userId as unknown as typeof ext.userId,
        decidedByName: req.user.name,
        decidedAt: new Date(),
      };

      if (decision === 'REJECT') {
        ext.status = 'REJECTED';
        await ext.save();

        await logApprovalHistory({
          leaveType: 'REGULAR_EXTENSION',
          targetId: ext._id,
          requestCode: ext.extensionCode,
          stage: 'SWO',
          action: 'REJECTED',
          actorUserId: req.user.userId,
          actorName: req.user.name,
          actorRole: 'SWO',
          remarks: cleanRemarks,
        });

        await notifyUser({
          userId: ext.userId,
          role: 'STUDENT',
          title: `Extension Rejected by SWO (${ext.extensionCode})`,
          message: `Your extension request ${ext.extensionCode} was rejected by SWO: ${cleanRemarks}. Original return date remains unchanged.`,
          category: 'EXTENSION',
          relatedId: ext.extensionCode,
        });

        res.json({ extension: ext, message: 'Extension rejected by SWO.' });
        return;
      }

      ext.status = 'PENDING_WARDEN';
      await ext.save();

      await logApprovalHistory({
        leaveType: 'REGULAR_EXTENSION',
        targetId: ext._id,
        requestCode: ext.extensionCode,
        stage: 'SWO',
        action: 'APPROVED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'SWO',
        remarks: cleanRemarks || 'SWO approved extension and forwarded to Warden.',
      });

      await notifyRoles({
        roles: ['WARDEN'],
        title: `Extension Final Review: ${ext.extensionCode}`,
        message: `SWO approved extension ${ext.extensionCode} for ${ext.studentName} (${ext.usn}). Pending Warden final approval.`,
        category: 'EXTENSION',
        relatedId: ext.extensionCode,
      });

      await notifyUser({
        userId: ext.userId,
        role: 'STUDENT',
        title: `SWO Approved Extension (${ext.extensionCode})`,
        message: `SWO approved your extension request ${ext.extensionCode}. Forwarded to Warden for final decision.`,
        category: 'EXTENSION',
        relatedId: ext.extensionCode,
      });

      res.json({ extension: ext, message: 'Extension approved by SWO and forwarded to Warden.' });
      return;
    }

    // WARDEN FINAL DECISION
    if (ext.status !== 'PENDING_WARDEN') {
      res.status(400).json({ error: `Warden cannot decide extension in status ${ext.status}.` });
      return;
    }

    ext.wardenDecision = {
      status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      remarks: cleanRemarks || (decision === 'APPROVE' ? 'Final approval by Warden' : 'Rejected by Warden'),
      decidedBy: req.user.userId as unknown as typeof ext.userId,
      decidedByName: req.user.name,
      decidedAt: new Date(),
    };

    if (decision === 'REJECT') {
      ext.status = 'REJECTED';
      await ext.save();

      await logApprovalHistory({
        leaveType: 'REGULAR_EXTENSION',
        targetId: ext._id,
        requestCode: ext.extensionCode,
        stage: 'WARDEN',
        action: 'REJECTED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'WARDEN',
        remarks: cleanRemarks,
      });

      await notifyUser({
        userId: ext.userId,
        role: 'STUDENT',
        title: `Extension Rejected by Warden (${ext.extensionCode})`,
        message: `Your extension request ${ext.extensionCode} was rejected by Warden: ${cleanRemarks}. Original return date remains unchanged.`,
        category: 'EXTENSION',
        relatedId: ext.extensionCode,
      });

      res.json({ extension: ext, message: 'Extension rejected by Warden.' });
      return;
    }

    // WARDEN APPROVE -> Update approvedReturnDate, revoke old QR pass, issue new QR pass!
    ext.status = 'APPROVED';
    await ext.save();

    const leave = await LeaveApplication.findById(ext.leaveId);
    if (!leave) {
      res.status(404).json({ error: 'Original leave application missing.' });
      return;
    }

    leave.approvedReturnDate = ext.requestedReturnDate;
    if (leave.status === 'OVERDUE') {
      const gate = await GateActivity.findOne({ leaveRefId: leave._id, leaveType: 'REGULAR' });
      leave.status = gate?.exitTime ? 'EXITED' : 'APPROVED';
      leave.overdueAt = undefined;
    }
    await leave.save();

    await LocationShare.findOneAndUpdate(
      { leaveRefId: leave._id, isSharing: true },
      { approvedReturnDate: leave.approvedReturnDate, leaveApprovalStatus: leave.status }
    );

    const newQrPass = await issueQRPassForLeave({
      leaveType: 'REGULAR',
      leaveRefId: leave._id,
      leaveRequestCode: leave.requestCode,
      studentId: leave.studentId,
      userId: leave.userId,
      studentName: leave.studentName,
      usn: leave.usn,
      department: leave.department,
      departureDate: leave.departureDate,
      approvedReturnDate: leave.approvedReturnDate,
      issuedBy: `Warden (${req.user.name}) - Extension ${ext.extensionCode}`,
      replaceReason: `Revoked after approved extension ${ext.extensionCode}`,
    });

    await logApprovalHistory({
      leaveType: 'REGULAR_EXTENSION',
      targetId: ext._id,
      requestCode: ext.extensionCode,
      stage: 'WARDEN',
      action: 'APPROVED',
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'WARDEN',
      remarks: `${cleanRemarks ? cleanRemarks + ' — ' : ''}Return deadline updated to ${new Date(ext.requestedReturnDate).toLocaleString()}. New QR Pass ${newQrPass.passId} issued.`,
    });

    await notifyUser({
      userId: leave.userId,
      role: 'STUDENT',
      title: `Extension Approved & Updated QR Pass (${ext.extensionCode})`,
      message: `Warden approved your extension until ${new Date(ext.requestedReturnDate).toLocaleString()}. Old QR pass revoked; new QR Pass ${newQrPass.passId} is active.`,
      category: 'QR_PASS',
      relatedId: newQrPass.passId,
    });

    await notifyRoles({
      roles: ['SECURITY'],
      title: `Extension Update: ${leave.studentName} (${leave.usn})`,
      message: `Leave ${leave.requestCode} extended until ${new Date(ext.requestedReturnDate).toLocaleString()}. Replacement Pass: ${newQrPass.passId}.`,
      category: 'EXTENSION',
      relatedId: newQrPass.passId,
    });

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'WARDEN',
      action: 'APPROVE_REGULAR_EXTENSION',
      entityType: 'LeaveExtension',
      entityId: ext.extensionCode,
      details: `Approved ${ext.extensionCode}; updated return to ${ext.requestedReturnDate.toISOString()}; issued ${newQrPass.passId}`,
    });

    res.json({
      extension: ext,
      leave,
      qrPass: newQrPass,
      message: 'Extension approved, return date updated, and replacement QR pass issued.',
    });
  } catch (error) {
    console.error('decideRegularExtension error:', error);
    res.status(500).json({ error: 'Failed to process regular extension decision.' });
  }
}

export async function decideEmergencyExtension(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'AO') {
      res.status(403).json({ error: 'Only AO can approve or reject emergency leave extensions.' });
      return;
    }

    const { decision, remarks } = req.body;
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      res.status(400).json({ error: 'Decision must be APPROVE or REJECT.' });
      return;
    }
    if (decision === 'REJECT' && (!remarks || !String(remarks).trim())) {
      res.status(400).json({ error: 'Remarks are required when rejecting an emergency extension.' });
      return;
    }

    const ext = await EmergencyLeaveExtension.findById(req.params.id);
    if (!ext) {
      res.status(404).json({ error: 'Emergency leave extension not found.' });
      return;
    }
    if (ext.status !== 'PENDING_AO') {
      res.status(400).json({ error: `Emergency extension is already ${ext.status}.` });
      return;
    }

    const cleanRemarks = remarks ? String(remarks).trim() : '';
    ext.aoDecision = {
      status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      remarks: cleanRemarks || (decision === 'APPROVE' ? 'Approved by AO' : 'Rejected by AO'),
      decidedBy: req.user.userId as unknown as typeof ext.userId,
      decidedByName: req.user.name,
      decidedAt: new Date(),
    };

    if (decision === 'REJECT') {
      ext.status = 'REJECTED';
      await ext.save();

      await logApprovalHistory({
        leaveType: 'EMERGENCY_EXTENSION',
        targetId: ext._id,
        requestCode: ext.extensionCode,
        stage: 'AO',
        action: 'REJECTED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'AO',
        remarks: cleanRemarks,
      });

      await notifyUser({
        userId: ext.userId,
        role: 'STUDENT',
        title: `Emergency Extension Rejected (${ext.extensionCode})`,
        message: `AO rejected emergency extension ${ext.extensionCode}: ${cleanRemarks}. Original return date unchanged.`,
        category: 'EXTENSION',
        relatedId: ext.extensionCode,
      });

      res.json({ extension: ext, message: 'Emergency extension rejected by AO.' });
      return;
    }

    ext.status = 'APPROVED';
    await ext.save();

    const emg = await EmergencyLeave.findById(ext.emergencyLeaveId);
    if (!emg) {
      res.status(404).json({ error: 'Original emergency leave missing.' });
      return;
    }

    emg.approvedReturnDate = ext.requestedReturnDate;
    if (emg.status === 'OVERDUE') {
      const gate = await GateActivity.findOne({ leaveRefId: emg._id, leaveType: 'EMERGENCY' });
      emg.status = gate?.exitTime ? 'EXITED' : 'APPROVED';
      emg.overdueAt = undefined;
    }
    await emg.save();

    await LocationShare.findOneAndUpdate(
      { leaveRefId: emg._id, isSharing: true },
      { approvedReturnDate: emg.approvedReturnDate, leaveApprovalStatus: emg.status }
    );

    const newQrPass = await issueQRPassForLeave({
      leaveType: 'EMERGENCY',
      leaveRefId: emg._id,
      leaveRequestCode: emg.requestCode,
      studentId: emg.studentId,
      userId: emg.userId,
      studentName: emg.studentName,
      usn: emg.usn,
      department: emg.department,
      departureDate: emg.departureDate,
      approvedReturnDate: emg.approvedReturnDate,
      issuedBy: `AO (${req.user.name}) - Extension ${ext.extensionCode}`,
      replaceReason: `Revoked after approved emergency extension ${ext.extensionCode}`,
    });

    await logApprovalHistory({
      leaveType: 'EMERGENCY_EXTENSION',
      targetId: ext._id,
      requestCode: ext.extensionCode,
      stage: 'AO',
      action: 'APPROVED',
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'AO',
      remarks: `${cleanRemarks ? cleanRemarks + ' — ' : ''}Updated return date to ${new Date(ext.requestedReturnDate).toLocaleString()}. New QR Pass ${newQrPass.passId} issued.`,
    });

    await notifyUser({
      userId: emg.userId,
      role: 'STUDENT',
      title: `Emergency Extension Approved (${ext.extensionCode})`,
      message: `AO approved your emergency extension until ${new Date(ext.requestedReturnDate).toLocaleString()}. Replacement QR Pass ${newQrPass.passId} is active.`,
      category: 'QR_PASS',
      relatedId: newQrPass.passId,
    });

    await notifyRoles({
      roles: ['SWO', 'WARDEN', 'EMERGENCY_CONTROL', 'SECURITY'],
      title: `Emergency Extension Approved: ${ext.extensionCode}`,
      message: `AO approved emergency extension for ${emg.studentName} (${emg.usn}). New Pass: ${newQrPass.passId}.`,
      category: 'EXTENSION',
      relatedId: newQrPass.passId,
    });

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'AO',
      action: 'APPROVE_EMERGENCY_EXTENSION',
      entityType: 'EmergencyLeaveExtension',
      entityId: ext.extensionCode,
      details: `AO approved ${ext.extensionCode}; issued ${newQrPass.passId}`,
    });

    res.json({
      extension: ext,
      emergencyLeave: emg,
      qrPass: newQrPass,
      message: 'Emergency extension approved and replacement QR pass issued.',
    });
  } catch (error) {
    console.error('decideEmergencyExtension error:', error);
    res.status(500).json({ error: 'Failed to process emergency extension decision.' });
  }
}
