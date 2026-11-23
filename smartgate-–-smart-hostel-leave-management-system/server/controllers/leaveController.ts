import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { Student } from '../models/Student.ts';
import { LeaveApplication } from '../models/LeaveApplication.ts';
import { ApprovalHistory } from '../models/ApprovalHistory.ts';
import { QRPass } from '../models/QRPass.ts';
import { LeaveExtension } from '../models/LeaveExtension.ts';
import {
  calculateApprovedRegularLeaveDays,
  generateCode,
  getHodThresholdDays,
  issueQRPassForLeave,
  syncOverdueLeaves,
} from '../utils/leaveHelpers.ts';
import { notifyRoles, notifyUser } from '../services/notificationService.ts';
import { logApprovalHistory, logAudit } from '../services/auditService.ts';

export async function applyRegularLeave(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      reason,
      departureDate,
      expectedReturnDate,
      parentContact,
    } = req.body;

    if (!reason || !departureDate || !expectedReturnDate || !parentContact) {
      res.status(400).json({ error: 'All required regular leave fields must be filled.' });
      return;
    }

    const depDate = new Date(departureDate);
    const retDate = new Date(expectedReturnDate);

    if (Number.isNaN(depDate.getTime()) || Number.isNaN(retDate.getTime())) {
      res.status(400).json({ error: 'Invalid departure or return date/time.' });
      return;
    }

    if (retDate <= depDate) {
      res.status(400).json({ error: 'Expected return date and time must be after departure date and time.' });
      return;
    }

    const semNum = Number(semester) || student.semester;
    const previousDays = await calculateApprovedRegularLeaveDays(student._id, semNum);
    const hodThreshold = await getHodThresholdDays();
    const hodRequired = previousDays > hodThreshold;

    const requestCode = generateCode('REG');
    const docUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    const docName = req.file ? req.file.originalname : undefined;

    const leave = await LeaveApplication.create({
      requestCode,
      studentId: student._id,
      userId: req.user.userId,
      studentName: studentName?.trim() || req.user.name,
      usn: usn?.trim().toUpperCase() || student.usn,
      department: department?.trim() || student.department,
      semester: semNum,
      section: section?.trim().toUpperCase() || student.section,
      reason: String(reason).trim(),
      departureDate: depDate,
      expectedReturnDate: retDate,
      approvedReturnDate: retDate,
      parentContact: String(parentContact).trim(),
      documentUrl: docUrl,
      documentName: docName,
      status: 'PENDING_COORDINATOR',
      hodRequired,
      previousApprovedDaysInSem: previousDays,
      currentStage: 'COORDINATOR',
    });

    await logApprovalHistory({
      leaveType: 'REGULAR',
      targetId: leave._id,
      requestCode: leave.requestCode,
      stage: 'STUDENT',
      action: 'SUBMITTED',
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'STUDENT',
      remarks: `Regular leave application submitted (${previousDays} prior approved days in Sem ${semNum}; HOD ${hodRequired ? 'required' : 'not required'}).`,
    });

    await notifyRoles({
      roles: ['COORDINATOR'],
      department: leave.department,
      title: `New Regular Leave: ${leave.requestCode}`,
      message: `${leave.studentName} (${leave.usn}) applied for regular leave from ${depDate.toLocaleDateString()} to ${retDate.toLocaleDateString()}.`,
      category: 'LEAVE',
      relatedId: leave.requestCode,
    });

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: 'APPLY_REGULAR_LEAVE',
      entityType: 'LeaveApplication',
      entityId: leave.requestCode,
      details: `Submitted regular leave ${leave.requestCode}`,
    });

    res.status(201).json({ leave });
  } catch (error) {
    console.error('applyRegularLeave error:', error);
    res.status(500).json({ error: 'Failed to submit regular leave application.' });
  }
}

export async function getRegularLeaves(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await syncOverdueLeaves();

    const { status, search, scope } = req.query;
    const query: Record<string, unknown> = {};

    if (req.user.role === 'STUDENT') {
      query.userId = req.user.userId;
    } else if (scope === 'pending') {
      const rolePendingMap: Record<string, string> = {
        COORDINATOR: 'PENDING_COORDINATOR',
        MENTOR: 'PENDING_MENTOR',
        HOD: 'PENDING_HOD',
        SWO: 'PENDING_SWO',
        WARDEN: 'PENDING_WARDEN',
      };
      if (rolePendingMap[req.user.role]) {
        query.status = rolePendingMap[req.user.role];
      }
    }

    // Department scoping for department-level authorities when viewing pending
    if (
      ['COORDINATOR', 'MENTOR', 'HOD'].includes(req.user.role) &&
      req.user.department &&
      req.user.department !== 'ALL'
    ) {
      query.department = req.user.department;
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
        { reason: regex },
        { department: regex },
      ];
    }

    const leaves = await LeaveApplication.find(query)
      .sort({ createdAt: -1 })
      .populate('activeQrPassId')
      .lean();

    const leaveIds = leaves.map((l) => l._id);
    const histories = await ApprovalHistory.find({
      leaveType: 'REGULAR',
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
    console.error('getRegularLeaves error:', error);
    res.status(500).json({ error: 'Failed to retrieve regular leave applications.' });
  }
}

export async function getRegularLeaveDetail(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const leave = await LeaveApplication.findById(req.params.id).populate('activeQrPassId').lean();
    if (!leave) {
      res.status(404).json({ error: 'Leave application not found.' });
      return;
    }

    if (req.user.role === 'STUDENT' && String(leave.userId) !== req.user.userId) {
      res.status(403).json({ error: 'You cannot access another student’s leave application.' });
      return;
    }

    const history = await ApprovalHistory.find({
      leaveType: 'REGULAR',
      targetId: leave._id,
    })
      .sort({ timestamp: 1 })
      .lean();

    const qrPasses = await QRPass.find({
      leaveRefId: leave._id,
      leaveType: 'REGULAR',
    })
      .sort({ createdAt: -1 })
      .lean();

    const extensions = await LeaveExtension.find({ leaveId: leave._id }).sort({ createdAt: -1 }).lean();

    res.json({ leave, history, qrPasses, extensions });
  } catch (error) {
    console.error('getRegularLeaveDetail error:', error);
    res.status(500).json({ error: 'Failed to load leave details.' });
  }
}

export async function decideRegularLeave(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { decision, remarks } = req.body;
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      res.status(400).json({ error: 'Decision must be APPROVE or REJECT.' });
      return;
    }

    if (decision === 'REJECT' && (!remarks || !String(remarks).trim())) {
      res.status(400).json({ error: 'Remarks are required when rejecting a leave application.' });
      return;
    }

    const leave = await LeaveApplication.findById(req.params.id);
    if (!leave) {
      res.status(404).json({ error: 'Regular leave application not found.' });
      return;
    }

    const roleStageMap: Record<string, string> = {
      COORDINATOR: 'PENDING_COORDINATOR',
      MENTOR: 'PENDING_MENTOR',
      HOD: 'PENDING_HOD',
      SWO: 'PENDING_SWO',
      WARDEN: 'PENDING_WARDEN',
    };

    const expectedStatus = roleStageMap[req.user.role];
    if (!expectedStatus || leave.status !== expectedStatus) {
      res.status(403).json({
        error: `Role ${req.user.role} cannot decide an application in status ${leave.status}.`,
      });
      return;
    }

    const cleanRemarks = remarks ? String(remarks).trim() : '';

    if (decision === 'REJECT') {
      leave.status = 'REJECTED';
      leave.currentStage = 'REJECTED';
      leave.rejectionReason = cleanRemarks;
      leave.rejectedByRole = req.user.role;
      await leave.save();

      await logApprovalHistory({
        leaveType: 'REGULAR',
        targetId: leave._id,
        requestCode: leave.requestCode,
        stage: req.user.role,
        action: 'REJECTED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: req.user.role,
        remarks: cleanRemarks,
      });

      await notifyUser({
        userId: leave.userId,
        role: 'STUDENT',
        title: `Leave Rejected (${leave.requestCode})`,
        message: `Your regular leave ${leave.requestCode} was rejected by ${req.user.role}: ${cleanRemarks}`,
        category: 'LEAVE',
        relatedId: leave.requestCode,
      });

      await logAudit({
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: req.user.role,
        action: 'REJECT_REGULAR_LEAVE',
        entityType: 'LeaveApplication',
        entityId: leave.requestCode,
        details: `${req.user.role} rejected ${leave.requestCode}: ${cleanRemarks}`,
      });

      res.json({ leave, message: 'Leave application rejected.' });
      return;
    }

    // APPROVE PATHS
    let generatedQrPass = null;

    if (req.user.role === 'COORDINATOR') {
      leave.status = 'PENDING_MENTOR';
      leave.currentStage = 'MENTOR';
      await leave.save();

      await logApprovalHistory({
        leaveType: 'REGULAR',
        targetId: leave._id,
        requestCode: leave.requestCode,
        stage: 'COORDINATOR',
        action: 'APPROVED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'COORDINATOR',
        remarks: cleanRemarks || 'Approved by Coordinator and forwarded to Mentor.',
      });

      await notifyRoles({
        roles: ['MENTOR'],
        department: leave.department,
        title: `Mentor Review Needed: ${leave.requestCode}`,
        message: `Coordinator approved ${leave.studentName} (${leave.usn}) regular leave. Forwarded for Mentor review.`,
        category: 'LEAVE',
        relatedId: leave.requestCode,
      });

      await notifyUser({
        userId: leave.userId,
        role: 'STUDENT',
        title: `Coordinator Approved: ${leave.requestCode}`,
        message: `Your regular leave ${leave.requestCode} was approved by Coordinator and forwarded to Mentor.`,
        category: 'LEAVE',
        relatedId: leave.requestCode,
      });
    } else if (req.user.role === 'MENTOR') {
      // Recalculate approved regular leave days in current semester from MongoDB
      const approvedDays = await calculateApprovedRegularLeaveDays(
        leave.studentId,
        leave.semester,
        leave._id
      );
      const hodThreshold = await getHodThresholdDays();
      const requiresHod = approvedDays > hodThreshold;

      leave.previousApprovedDaysInSem = approvedDays;
      leave.hodRequired = requiresHod;

      if (requiresHod) {
        leave.status = 'PENDING_HOD';
        leave.currentStage = 'HOD';
        await leave.save();

        await logApprovalHistory({
          leaveType: 'REGULAR',
          targetId: leave._id,
          requestCode: leave.requestCode,
          stage: 'MENTOR',
          action: 'FORWARDED',
          actorUserId: req.user.userId,
          actorName: req.user.name,
          actorRole: 'MENTOR',
          remarks: `${cleanRemarks ? cleanRemarks + ' — ' : ''}Student has ${approvedDays} approved regular leave days (> ${hodThreshold}). Forwarded to HOD.`,
        });

        await notifyRoles({
          roles: ['HOD'],
          department: leave.department,
          title: `HOD Approval Required: ${leave.requestCode}`,
          message: `${leave.studentName} (${leave.usn}) has ${approvedDays} approved leave days this semester (> ${hodThreshold}). HOD review mandatory.`,
          category: 'LEAVE',
          relatedId: leave.requestCode,
        });

        await notifyUser({
          userId: leave.userId,
          role: 'STUDENT',
          title: `Forwarded to HOD: ${leave.requestCode}`,
          message: `Mentor approved your leave. Because you have ${approvedDays} approved regular leave days in Semester ${leave.semester} (> ${hodThreshold}), it is routed to HOD.`,
          category: 'LEAVE',
          relatedId: leave.requestCode,
        });
      } else {
        leave.status = 'PENDING_SWO';
        leave.currentStage = 'SWO';
        await leave.save();

        await logApprovalHistory({
          leaveType: 'REGULAR',
          targetId: leave._id,
          requestCode: leave.requestCode,
          stage: 'MENTOR',
          action: 'APPROVED',
          actorUserId: req.user.userId,
          actorName: req.user.name,
          actorRole: 'MENTOR',
          remarks: `${cleanRemarks ? cleanRemarks + ' — ' : ''}Student has ${approvedDays} approved regular leave days (<= ${hodThreshold}). HOD skipped; forwarded directly to SWO.`,
        });

        await notifyRoles({
          roles: ['SWO'],
          title: `SWO Review Needed: ${leave.requestCode}`,
          message: `Mentor approved ${leave.studentName} (${leave.usn}). Prior approved days: ${approvedDays} (HOD skipped). Forwarded to SWO.`,
          category: 'LEAVE',
          relatedId: leave.requestCode,
        });

        await notifyUser({
          userId: leave.userId,
          role: 'STUDENT',
          title: `Forwarded to SWO: ${leave.requestCode}`,
          message: `Mentor approved your leave (${approvedDays} prior approved days; HOD skipped). Now pending SWO review.`,
          category: 'LEAVE',
          relatedId: leave.requestCode,
        });
      }
    } else if (req.user.role === 'HOD') {
      leave.status = 'PENDING_SWO';
      leave.currentStage = 'SWO';
      await leave.save();

      await logApprovalHistory({
        leaveType: 'REGULAR',
        targetId: leave._id,
        requestCode: leave.requestCode,
        stage: 'HOD',
        action: 'APPROVED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'HOD',
        remarks: cleanRemarks || 'HOD approved and forwarded to SWO.',
      });

      await notifyRoles({
        roles: ['SWO'],
        title: `SWO Review Needed: ${leave.requestCode}`,
        message: `HOD approved ${leave.studentName} (${leave.usn}) regular leave. Forwarded to SWO.`,
        category: 'LEAVE',
        relatedId: leave.requestCode,
      });

      await notifyUser({
        userId: leave.userId,
        role: 'STUDENT',
        title: `HOD Approved: ${leave.requestCode}`,
        message: `HOD approved your regular leave ${leave.requestCode}. Forwarded to SWO.`,
        category: 'LEAVE',
        relatedId: leave.requestCode,
      });
    } else if (req.user.role === 'SWO') {
      leave.status = 'PENDING_WARDEN';
      leave.currentStage = 'WARDEN';
      await leave.save();

      await logApprovalHistory({
        leaveType: 'REGULAR',
        targetId: leave._id,
        requestCode: leave.requestCode,
        stage: 'SWO',
        action: 'APPROVED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'SWO',
        remarks: cleanRemarks || 'SWO approved and forwarded to Warden for final approval.',
      });

      await notifyRoles({
        roles: ['WARDEN'],
        title: `Warden Final Approval Needed: ${leave.requestCode}`,
        message: `SWO approved ${leave.studentName} (${leave.usn}) regular leave. Pending Warden final decision.`,
        category: 'LEAVE',
        relatedId: leave.requestCode,
      });

      await notifyUser({
        userId: leave.userId,
        role: 'STUDENT',
        title: `SWO Approved: ${leave.requestCode}`,
        message: `SWO approved your regular leave ${leave.requestCode}. Forwarded to Warden for final approval.`,
        category: 'LEAVE',
        relatedId: leave.requestCode,
      });
    } else if (req.user.role === 'WARDEN') {
      leave.status = 'APPROVED';
      leave.currentStage = 'COMPLETED';
      await leave.save();

      generatedQrPass = await issueQRPassForLeave({
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
        issuedBy: `Warden (${req.user.name})`,
      });

      await logApprovalHistory({
        leaveType: 'REGULAR',
        targetId: leave._id,
        requestCode: leave.requestCode,
        stage: 'WARDEN',
        action: 'APPROVED',
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'WARDEN',
        remarks: cleanRemarks || 'Final Warden approval granted.',
      });

      await logApprovalHistory({
        leaveType: 'REGULAR',
        targetId: leave._id,
        requestCode: leave.requestCode,
        stage: 'SYSTEM',
        action: 'QR_GENERATED',
        actorName: 'SmartGate QR Engine',
        actorRole: 'SYSTEM',
        remarks: `QR Pass ${generatedQrPass.passId} generated and activated.`,
      });

      await notifyUser({
        userId: leave.userId,
        role: 'STUDENT',
        title: `Leave Approved & QR Pass Ready (${leave.requestCode})`,
        message: `Warden granted final approval for ${leave.requestCode}. QR Pass ${generatedQrPass.passId} is now active in QR Pass Generator.`,
        category: 'QR_PASS',
        relatedId: generatedQrPass.passId,
      });

      await notifyRoles({
        roles: ['SECURITY'],
        title: `New Approved Gate Pass: ${generatedQrPass.passId}`,
        message: `${leave.studentName} (${leave.usn}) regular leave approved. Pass ${generatedQrPass.passId} is valid until ${new Date(leave.approvedReturnDate).toLocaleString()}.`,
        category: 'QR_PASS',
        relatedId: generatedQrPass.passId,
      });
    }

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: 'APPROVE_REGULAR_LEAVE',
      entityType: 'LeaveApplication',
      entityId: leave.requestCode,
      details: `${req.user.role} approved ${leave.requestCode} -> ${leave.status}`,
    });

    res.json({
      leave,
      qrPass: generatedQrPass,
      message: `Leave ${leave.requestCode} approved and updated to ${leave.status}.`,
    });
  } catch (error) {
    console.error('decideRegularLeave error:', error);
    res.status(500).json({ error: 'Failed to process leave decision.' });
  }
}
