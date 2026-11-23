import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { Student } from '../models/Student.ts';
import { EmergencyLeave } from '../models/EmergencyLeave.ts';
import { ApprovalHistory } from '../models/ApprovalHistory.ts';
import { QRPass } from '../models/QRPass.ts';
import { EmergencyLeaveExtension } from '../models/EmergencyLeaveExtension.ts';
import {
  generateCode,
  issueQRPassForLeave,
  syncOverdueLeaves,
} from '../utils/leaveHelpers.ts';
import { notifyRoles, notifyUser } from '../services/notificationService.ts';
import { logApprovalHistory, logAudit } from '../services/auditService.ts';

export async function applyEmergencyLeave(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const student = await Student.findOne({ userId: req.user.userId });
    if (!student) {
      res.status(404).json({ error: 'Student profile not found.' });
      return;
    }

    const {
      studentName,
      usn,
      department,
      semester,
      section,
      emergencyType,
      reason,
      departureDate,
      expectedReturnDate,
      parentContact,
    } = req.body;

    if (!reason || !departureDate || !expectedReturnDate || !parentContact) {
      res.status(400).json({ error: 'All required emergency leave fields must be filled.' });
      return;
    }

    const depDate = new Date(departureDate);
    const retDate = new Date(expectedReturnDate);

    if (Number.isNaN(depDate.getTime()) || Number.isNaN(retDate.getTime()) || retDate <= depDate) {
      res.status(400).json({ error: 'Invalid emergency departure or return date/time.' });
      return;
    }

    const requestCode = generateCode('EMG');
    const docUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    const docName = req.file ? req.file.originalname : undefined;

    const leave = await EmergencyLeave.create({
      requestCode,
      studentId: student._id,
      userId: req.user.userId,
      studentName: studentName?.trim() || req.user.name,
      usn: usn?.trim().toUpperCase() || student.usn,
      department: department?.trim() || student.department,
      semester: Number(semester) || student.semester,
      section: section?.trim().toUpperCase() || student.section,
      emergencyType: emergencyType?.trim() || 'Medical / Family Emergency',
      reason: String(reason).trim(),
      departureDate: depDate,
      expectedReturnDate: retDate,
      approvedReturnDate: retDate,
      parentContact: String(parentContact).trim(),
      documentUrl: docUrl,
      documentName: docName,
      status: 'PENDING_AO',
    });

    await logApprovalHistory({
      leaveType: 'EMERGENCY',
      targetId: leave._id,
      requestCode: leave.requestCode,
      stage: 'STUDENT',
      action: 'SUBMITTED',
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'STUDENT',
      remarks: `Emergency leave (${leave.emergencyType}) routed directly to AO.`,
    });

    await notifyRoles({
      roles: ['AO', 'EMERGENCY_CONTROL'],
      title: `Urgent Emergency Leave: ${leave.requestCode}`,
      message: `${leave.studentName} (${leave.usn}) submitted an emergency leave (${leave.emergencyType}). Direct AO decision required.`,
      category: 'EMERGENCY',
      relatedId: leave.requestCode,
    });

    // Notify SWO and Warden for information only
    await notifyRoles({
      roles: ['SWO', 'WARDEN'],
      title: `Emergency Leave Notice (Info): ${leave.requestCode}`,
      message: `${leave.studentName} (${leave.usn}) submitted emergency leave to AO for immediate review.`,
      category: 'EMERGENCY',
      relatedId: leave.requestCode,
    });

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: 'APPLY_EMERGENCY_LEAVE',
      entityType: 'EmergencyLeave',
      entityId: leave.requestCode,
      details: `Submitted emergency leave ${leave.requestCode} directly to AO`,
    });

    res.status(201).json({ leave });
  } catch (error) {
    console.error('applyEmergencyLeave error:', error);
    res.status(500).json({ error: 'Failed to submit emergency leave.' });
  }
}

export async function getEmergencyLeaves(req: AuthenticatedRequest, res: Response): Promise<void> {
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
        { requestCode: regex },
        { studentName: regex },
        { usn: regex },
        { emergencyType: regex },
        { reason: regex },
      ];
    }

    const leaves = await EmergencyLeave.find(query)
      .sort({ createdAt: -1 })
      .populate('activeQrPassId')
      .lean();

    const leaveIds = leaves.map((l) => l._id);
    const histories = await ApprovalHistory.find({
      leaveType: 'EMERGENCY',
      targetId: { $in: leaveIds },
    })
      .sort({ timestamp: 1 })
      .lean();

    const historyMap = new Map<string, typeof histories>();
    for (const h of histories) {
      const key = String(h.targetId);
      const list = historyMap.get(key) || [];
      list.push(h);
      historyMap.set(key, list);
    }

    const enriched = leaves.map((l) => ({
      ...l,
      history: historyMap.get(String(l._id)) || [],
    }));

    res.json({ leaves: enriched });
  } catch (error) {
    console.error('getEmergencyLeaves error:', error);
    res.status(500).json({ error: 'Failed to fetch emergency leave applications.' });
  }
}

export async function getEmergencyLeaveDetail(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const leave = await EmergencyLeave.findById(req.params.id).populate('activeQrPassId').lean();
    if (!leave) {
      res.status(404).json({ error: 'Emergency leave not found.' });
      return;
    }

    if (req.user.role === 'STUDENT' && String(leave.userId) !== req.user.userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const history = await ApprovalHistory.find({
      leaveType: 'EMERGENCY',
      targetId: leave._id,
    })
      .sort({ timestamp: 1 })
      .lean();

    const qrPasses = await QRPass.find({
      leaveRefId: leave._id,
      leaveType: 'EMERGENCY',
    })
      .sort({ createdAt: -1 })
      .lean();

    const extensions = await EmergencyLeaveExtension.find({ emergencyLeaveId: leave._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ leave, history, qrPasses, extensions });
  } catch (error) {
    console.error('getEmergencyLeaveDetail error:', error);
    res.status(500).json({ error: 'Failed to load emergency leave detail.' });
  }
}

export async function decideEmergencyLeave(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'AO') {
      res.status(403).json({ error: 'Only the Administrative Officer (AO) can approve or reject emergency leaves.' });
      return;
    }

    const { decision, remarks } = req.body;
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      res.status(400).json({ error: 'Decision must be APPROVE or REJECT.' });
      return;
    }

    if (decision === 'REJECT' && (!remarks || !String(remarks).trim())) {
      res.status(400).json({ error: 'Remarks are required when rejecting an emergency leave.' });
      return;
    }

    const leave = await EmergencyLeave.findById(req.params.id);
    if (!leave) {
      res.status(404).json({ error: 'Emergency leave request not found.' });
      return;
    }

    if (leave.status !== 'PENDING_AO') {
      res.status(400).json({ error: `Emergency leave is already ${leave.status}.` });
      return;
    }

    const cleanRemarks = remarks ? String(remarks).trim() : '';
    leave.aoRemarks = cleanRemarks;
    leave.aoDecidedAt = new Date();
    leave.aoDecidedBy = req.user.userId as unknown as typeof leave.aoDecidedBy;

    if (decision === 'REJECT') {
      leave.status = 'REJECTED';
      await leave.save();

      await logApprovalHistory({
        leaveType: 'EMERGENCY',
        targetId: leave._id,
        requestCode: leave.requestCode,
        stage: 'AO',
        action: 'REJECTED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'AO',
        remarks: cleanRemarks,
      });

      await notifyUser({
        userId: leave.userId,
        role: 'STUDENT',
        title: `Emergency Leave Rejected (${leave.requestCode})`,
        message: `AO rejected emergency leave ${leave.requestCode}: ${cleanRemarks}`,
        category: 'EMERGENCY',
        relatedId: leave.requestCode,
      });

      await notifyRoles({
        roles: ['SWO', 'WARDEN', 'EMERGENCY_CONTROL'],
        title: `Emergency Leave Rejected (Info): ${leave.requestCode}`,
        message: `AO rejected emergency leave for ${leave.studentName} (${leave.usn}).`,
        category: 'EMERGENCY',
        relatedId: leave.requestCode,
      });

      await logAudit({
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'AO',
        action: 'REJECT_EMERGENCY_LEAVE',
        entityType: 'EmergencyLeave',
        entityId: leave.requestCode,
        details: `AO rejected ${leave.requestCode}: ${cleanRemarks}`,
      });

      res.json({ leave, message: 'Emergency leave rejected.' });
      return;
    }

    // APPROVE PATH
    leave.status = 'APPROVED';
    await leave.save();

    const qrPass = await issueQRPassForLeave({
      leaveType: 'EMERGENCY',
      leaveRefId: leave._id,
      leaveRequestCode: leave.requestCode,
      studentId: leave.studentId,
      userId: leave.userId,
      studentName: leave.studentName,
      usn: leave.usn,
      department: leave.department,
      departureDate: leave.departureDate,
      approvedReturnDate: leave.approvedReturnDate,
      issuedBy: `AO (${req.user.name})`,
    });

    await logApprovalHistory({
      leaveType: 'EMERGENCY',
      targetId: leave._id,
      requestCode: leave.requestCode,
      stage: 'AO',
      action: 'APPROVED',
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'AO',
      remarks: cleanRemarks || 'Emergency leave approved by AO.',
    });

    await logApprovalHistory({
      leaveType: 'EMERGENCY',
      targetId: leave._id,
      requestCode: leave.requestCode,
      stage: 'SYSTEM',
      action: 'QR_GENERATED',
      actorName: 'SmartGate QR Engine',
      actorRole: 'SYSTEM',
      remarks: `Emergency QR Pass ${qrPass.passId} generated and activated.`,
    });

    await notifyUser({
      userId: leave.userId,
      role: 'STUDENT',
      title: `Emergency Leave Approved & QR Ready (${leave.requestCode})`,
      message: `AO approved your emergency leave ${leave.requestCode}. QR Pass ${qrPass.passId} is now active.`,
      category: 'QR_PASS',
      relatedId: qrPass.passId,
    });

    // Notify SWO, Warden (for info), Security, and Emergency Control Centre
    await notifyRoles({
      roles: ['SWO', 'WARDEN', 'EMERGENCY_CONTROL', 'SECURITY'],
      title: `Emergency Leave Approved (Info): ${leave.requestCode}`,
      message: `AO approved emergency leave for ${leave.studentName} (${leave.usn}). QR Pass ${qrPass.passId} issued.`,
      category: 'EMERGENCY',
      relatedId: leave.requestCode,
    });

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'AO',
      action: 'APPROVE_EMERGENCY_LEAVE',
      entityType: 'EmergencyLeave',
      entityId: leave.requestCode,
      details: `AO approved emergency leave ${leave.requestCode} and issued ${qrPass.passId}`,
    });

    res.json({
      leave,
      qrPass,
      message: 'Emergency leave approved and QR Pass generated.',
    });
  } catch (error) {
    console.error('decideEmergencyLeave error:', error);
    res.status(500).json({ error: 'Failed to decide emergency leave.' });
  }
}
