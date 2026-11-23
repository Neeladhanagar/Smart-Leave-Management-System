import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { QRPass } from '../models/QRPass.ts';
import { GateActivity } from '../models/GateActivity.ts';
import { LeaveApplication } from '../models/LeaveApplication.ts';
import { EmergencyLeave } from '../models/EmergencyLeave.ts';
import { Student } from '../models/Student.ts';
import { User } from '../models/User.ts';
import { LocationShare } from '../models/LocationShare.ts';
import { syncOverdueLeaves } from '../utils/leaveHelpers.ts';
import { notifyRoles, notifyUser } from '../services/notificationService.ts';
import { logApprovalHistory, logAudit } from '../services/auditService.ts';

export async function recordGateExit(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'SECURITY') {
      res.status(403).json({ error: 'Only authorized Security Guards can record gate exits.' });
      return;
    }

    const { passId, remarks } = req.body;
    if (!passId) {
      res.status(400).json({ error: 'Pass ID is required.' });
      return;
    }

    const qrPass = await QRPass.findOne({ passId: String(passId).trim().toUpperCase() });
    if (!qrPass) {
      res.status(404).json({ error: 'QR Pass not found.' });
      return;
    }

    if (qrPass.status !== 'ACTIVE') {
      res.status(400).json({ error: `Cannot record exit: QR Pass is ${qrPass.status}.` });
      return;
    }

    const now = new Date();
    if (now > new Date(qrPass.approvedReturnDate)) {
      res.status(400).json({ error: 'Cannot record exit: QR Pass return deadline has already expired.' });
      return;
    }

    // Prevent duplicate exit records
    const existingGate = await GateActivity.findOne({
      leaveRefId: qrPass.leaveRefId,
      leaveType: qrPass.leaveType,
    });
    if (existingGate && existingGate.exitTime) {
      res.status(409).json({
        error: `Duplicate exit blocked: Exit already recorded for ${qrPass.leaveRequestCode} at ${new Date(
          existingGate.exitTime
        ).toLocaleString()}.`,
      });
      return;
    }

    const gateRecord = await GateActivity.create({
      passId: qrPass.passId,
      qrPassRef: qrPass._id,
      leaveType: qrPass.leaveType,
      leaveRefId: qrPass.leaveRefId,
      leaveRequestCode: qrPass.leaveRequestCode,
      studentId: qrPass.studentId,
      studentName: qrPass.studentName,
      usn: qrPass.usn,
      department: qrPass.department,
      exitTime: now,
      exitRecordedBy: req.user.userId,
      exitRecordedByName: req.user.name,
      exitRemarks: remarks ? String(remarks).trim() : 'Verified at main hostel gate',
      status: 'EXITED',
    });

    if (qrPass.leaveType === 'REGULAR') {
      await LeaveApplication.findByIdAndUpdate(qrPass.leaveRefId, { status: 'EXITED' });
    } else {
      await EmergencyLeave.findByIdAndUpdate(qrPass.leaveRefId, { status: 'EXITED' });
    }

    await logApprovalHistory({
      leaveType: qrPass.leaveType,
      targetId: qrPass.leaveRefId,
      requestCode: qrPass.leaveRequestCode,
      stage: 'SECURITY',
      action: 'EXITED',
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'SECURITY',
      remarks: gateRecord.exitRemarks,
    });

    await notifyUser({
      userId: qrPass.userId,
      role: 'STUDENT',
      title: `Gate Exit Recorded (${qrPass.passId})`,
      message: `Hostel exit recorded at ${now.toLocaleString()} for ${qrPass.leaveRequestCode}. Return due by ${new Date(
        qrPass.approvedReturnDate
      ).toLocaleString()}.`,
      category: 'GATE',
      relatedId: qrPass.passId,
    });

    await notifyRoles({
      roles: ['WARDEN'],
      title: `Student Exited Hostel: ${qrPass.studentName}`,
      message: `${qrPass.studentName} (${qrPass.usn}) exited at ${now.toLocaleString()} using pass ${qrPass.passId}.`,
      category: 'GATE',
      relatedId: qrPass.passId,
    });

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'SECURITY',
      action: 'GATE_EXIT',
      entityType: 'GateActivity',
      entityId: qrPass.passId,
      details: `Recorded exit for ${qrPass.studentName} (${qrPass.usn}) on ${qrPass.passId}`,
    });

    res.status(201).json({ gateActivity: gateRecord, message: 'Student exit recorded successfully.' });
  } catch (error) {
    console.error('recordGateExit error:', error);
    res.status(500).json({ error: 'Failed to record gate exit.' });
  }
}

export async function recordGateReturn(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'SECURITY') {
      res.status(403).json({ error: 'Only authorized Security Guards can record gate returns.' });
      return;
    }

    const { passId, leaveRefId, leaveType, remarks, lateReturnAuthorized, lateReturnReason } = req.body;

    let qrPass = passId ? await QRPass.findOne({ passId: String(passId).trim().toUpperCase() }) : null;
    if (!qrPass && leaveRefId && leaveType) {
      qrPass = await QRPass.findOne({ leaveRefId, leaveType }).sort({ createdAt: -1 });
    }

    if (!qrPass) {
      res.status(404).json({ error: 'Associated QR Pass / leave record not found.' });
      return;
    }

    if (qrPass.status === 'REVOKED' && qrPass.replacedByPassId) {
      res.status(400).json({
        error: `Pass ${qrPass.passId} was revoked. Use replacement pass ${qrPass.replacedByPassId}.`,
      });
      return;
    }

    let gateRecord = await GateActivity.findOne({
      leaveRefId: qrPass.leaveRefId,
      leaveType: qrPass.leaveType,
    });

    if (gateRecord && gateRecord.returnTime) {
      res.status(409).json({
        error: `Duplicate return blocked: Return already recorded at ${new Date(
          gateRecord.returnTime
        ).toLocaleString()}.`,
      });
      return;
    }

    const now = new Date();
    const isPastDeadline = now > new Date(qrPass.approvedReturnDate);

    if (isPastDeadline) {
      if (!lateReturnAuthorized || !lateReturnReason || !String(lateReturnReason).trim()) {
        res.status(400).json({
          error:
            'Approved return deadline has passed (pass expired). Authorized late-return exception and reason are required.',
          requiresLateException: true,
        });
        return;
      }
    }

    const finalStatus = isPastDeadline ? 'RETURNED_LATE' : 'RETURNED';

    if (!gateRecord) {
      gateRecord = new GateActivity({
        passId: qrPass.passId,
        qrPassRef: qrPass._id,
        leaveType: qrPass.leaveType,
        leaveRefId: qrPass.leaveRefId,
        leaveRequestCode: qrPass.leaveRequestCode,
        studentId: qrPass.studentId,
        studentName: qrPass.studentName,
        usn: qrPass.usn,
        department: qrPass.department,
        exitRemarks: 'Direct return recorded (no prior exit scan)',
      });
    }

    gateRecord.returnTime = now;
    gateRecord.returnRecordedBy = req.user.userId as unknown as typeof gateRecord.returnRecordedBy;
    gateRecord.returnRecordedByName = req.user.name;
    gateRecord.returnRemarks = remarks ? String(remarks).trim() : 'Returned to hostel';
    gateRecord.isLateReturn = isPastDeadline;
    gateRecord.lateReturnAuthorized = Boolean(isPastDeadline && lateReturnAuthorized);
    gateRecord.lateReturnReason = isPastDeadline ? String(lateReturnReason).trim() : undefined;
    gateRecord.status = finalStatus;
    await gateRecord.save();

    if (qrPass.status === 'ACTIVE') {
      qrPass.status = isPastDeadline ? 'EXPIRED' : 'USED';
      await qrPass.save();
    }

    if (qrPass.leaveType === 'REGULAR') {
      await LeaveApplication.findByIdAndUpdate(qrPass.leaveRefId, { status: finalStatus });
    } else {
      await EmergencyLeave.findByIdAndUpdate(qrPass.leaveRefId, { status: finalStatus });
    }

    await LocationShare.findOneAndUpdate(
      { userId: qrPass.userId, leaveRefId: qrPass.leaveRefId, isSharing: true },
      {
        isSharing: false,
        leaveApprovalStatus: finalStatus,
        latitude: undefined,
        longitude: undefined,
        accuracy: undefined,
        stoppedAt: now,
        expiredReason: `Leave completed (${finalStatus.replace(/_/g, ' ')})`,
      }
    );

    await logApprovalHistory({
      leaveType: qrPass.leaveType,
      targetId: qrPass.leaveRefId,
      requestCode: qrPass.leaveRequestCode,
      stage: 'SECURITY',
      action: finalStatus,
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'SECURITY',
      remarks: isPastDeadline
        ? `Authorized late return: ${gateRecord.lateReturnReason}`
        : gateRecord.returnRemarks,
    });

    await notifyUser({
      userId: qrPass.userId,
      role: 'STUDENT',
      title: isPastDeadline
        ? `Late Return Recorded (${qrPass.leaveRequestCode})`
        : `Gate Return Recorded (${qrPass.leaveRequestCode})`,
      message: isPastDeadline
        ? `Your return was recorded at ${now.toLocaleString()} as RETURNED_LATE (${gateRecord.lateReturnReason}).`
        : `Your hostel return was verified at ${now.toLocaleString()}.`,
      category: 'GATE',
      relatedId: qrPass.passId,
    });

    await notifyRoles({
      roles: ['SWO', 'WARDEN'],
      title: isPastDeadline
        ? `Late Return Alert: ${qrPass.studentName} (${qrPass.usn})`
        : `Student Returned: ${qrPass.studentName}`,
      message: isPastDeadline
        ? `${qrPass.studentName} (${qrPass.usn}) returned late at ${now.toLocaleString()}. Reason: ${gateRecord.lateReturnReason}`
        : `${qrPass.studentName} (${qrPass.usn}) returned on time at ${now.toLocaleString()}.`,
      category: 'GATE',
      relatedId: qrPass.passId,
    });

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'SECURITY',
      action: finalStatus,
      entityType: 'GateActivity',
      entityId: qrPass.passId,
      details: `${finalStatus} recorded for ${qrPass.studentName} (${qrPass.usn})`,
    });

    res.json({
      gateActivity: gateRecord,
      message: isPastDeadline
        ? 'Late return recorded with authorized security exception.'
        : 'Student return recorded successfully.',
    });
  } catch (error) {
    console.error('recordGateReturn error:', error);
    res.status(500).json({ error: 'Failed to record gate return.' });
  }
}

export async function getGateHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const activities = await GateActivity.find().sort({ updatedAt: -1 }).limit(200).lean();
    res.json({ activities });
  } catch (error) {
    console.error('getGateHistory error:', error);
    res.status(500).json({ error: 'Failed to load gate history.' });
  }
}

export async function getOverdueStudents(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await syncOverdueLeaves();

    const [overdueRegular, overdueEmergency] = await Promise.all([
      LeaveApplication.find({ status: 'OVERDUE' }).populate('activeQrPassId').sort({ overdueAt: -1 }).lean(),
      EmergencyLeave.find({ status: 'OVERDUE' }).populate('activeQrPassId').sort({ overdueAt: -1 }).lean(),
    ]);

    const items = [
      ...overdueRegular.map((l) => ({ ...l, leaveType: 'REGULAR' as const })),
      ...overdueEmergency.map((l) => ({ ...l, leaveType: 'EMERGENCY' as const })),
    ].sort(
      (a, b) =>
        new Date(b.overdueAt || b.approvedReturnDate).getTime() -
        new Date(a.overdueAt || a.approvedReturnDate).getTime()
    );

    res.json({ overdue: items });
  } catch (error) {
    console.error('getOverdueStudents error:', error);
    res.status(500).json({ error: 'Failed to fetch overdue students.' });
  }
}

export async function searchStudents(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const q = String(req.query.q || '').trim();
    const students = await Student.find(
      q
        ? {
            $or: [{ usn: new RegExp(q, 'i') }, { department: new RegExp(q, 'i') }],
          }
        : {}
    )
      .populate('userId', 'name email phone isActive')
      .limit(50)
      .lean();

    const filtered = q
      ? students.filter((s) => {
          const u = s.userId as unknown as { name?: string; email?: string } | null;
          return (
            s.usn.toLowerCase().includes(q.toLowerCase()) ||
            s.department.toLowerCase().includes(q.toLowerCase()) ||
            (u?.name || '').toLowerCase().includes(q.toLowerCase())
          );
        })
      : students;

    // Also include matching by name if search didn't hit USN/dept directly
    if (q && filtered.length === 0) {
      const matchingUsers = await User.find({
        role: 'STUDENT',
        name: new RegExp(q, 'i'),
      })
        .select('_id')
        .lean();
      const userIds = matchingUsers.map((u) => u._id);
      const byName = await Student.find({ userId: { $in: userIds } })
        .populate('userId', 'name email phone isActive')
        .limit(50)
        .lean();
      res.json({ students: byName });
      return;
    }

    res.json({ students: filtered });
  } catch (error) {
    console.error('searchStudents error:', error);
    res.status(500).json({ error: 'Failed to search students.' });
  }
}
