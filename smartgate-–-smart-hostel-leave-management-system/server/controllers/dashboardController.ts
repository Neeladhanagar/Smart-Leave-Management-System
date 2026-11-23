import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { User } from '../models/User.ts';
import { Student } from '../models/Student.ts';
import { Authority } from '../models/Authority.ts';
import { LeaveApplication } from '../models/LeaveApplication.ts';
import { EmergencyLeave } from '../models/EmergencyLeave.ts';
import { LeaveExtension } from '../models/LeaveExtension.ts';
import { EmergencyLeaveExtension } from '../models/EmergencyLeaveExtension.ts';
import { QRPass } from '../models/QRPass.ts';
import { GateActivity } from '../models/GateActivity.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { calculateApprovedRegularLeaveDays, syncOverdueLeaves } from '../utils/leaveHelpers.ts';

export async function getDashboardOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await syncOverdueLeaves();

    const role = req.user.role;

    if (role === 'STUDENT') {
      const student = await Student.findOne({ userId: req.user.userId }).lean();
      const [regLeaves, emgLeaves, regExt, emgExt, activePasses, allPasses] = await Promise.all([
        LeaveApplication.find({ userId: req.user.userId }).sort({ createdAt: -1 }).lean(),
        EmergencyLeave.find({ userId: req.user.userId }).sort({ createdAt: -1 }).lean(),
        LeaveExtension.find({ userId: req.user.userId }).sort({ createdAt: -1 }).lean(),
        EmergencyLeaveExtension.find({ userId: req.user.userId }).sort({ createdAt: -1 }).lean(),
        QRPass.countDocuments({ userId: req.user.userId, status: 'ACTIVE' }),
        QRPass.find({ userId: req.user.userId }).sort({ createdAt: -1 }).lean(),
      ]);

      const combined = [...regLeaves, ...emgLeaves];
      const approvedStatuses = new Set(['APPROVED', 'EXITED', 'OVERDUE', 'RETURNED', 'RETURNED_LATE']);
      const pendingStatuses = new Set([
        'PENDING_COORDINATOR',
        'PENDING_MENTOR',
        'PENDING_HOD',
        'PENDING_SWO',
        'PENDING_WARDEN',
        'PENDING_AO',
      ]);

      const approvedCount = combined.filter((l) => approvedStatuses.has(l.status)).length;
      const pendingCount = combined.filter((l) => pendingStatuses.has(l.status)).length;
      const rejectedCount = combined.filter((l) => l.status === 'REJECTED').length;

      const approvedDaysInSem = student
        ? await calculateApprovedRegularLeaveDays(student._id, student.semester)
        : 0;

      const latestLeave = [...regLeaves.map((l) => ({ ...l, type: 'REGULAR' })), ...emgLeaves.map((l) => ({ ...l, type: 'EMERGENCY' }))]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;

      res.json({
        stats: {
          totalLeaves: combined.length,
          approvedLeaves: approvedCount,
          pendingLeaves: pendingCount,
          rejectedLeaves: rejectedCount,
          activeQrPasses: activePasses,
          approvedDaysInSem,
          pendingExtensions:
            regExt.filter((e) => e.status.startsWith('PENDING')).length +
            emgExt.filter((e) => e.status === 'PENDING_AO').length,
        },
        currentLeaveStatus: latestLeave ? latestLeave.status : 'NO_ACTIVE_LEAVE',
        latestLeave,
        recentRegularLeaves: regLeaves.slice(0, 6),
        recentEmergencyLeaves: emgLeaves.slice(0, 6),
        qrPasses: allPasses.slice(0, 5),
        chartData: [
          { name: 'Approved', count: approvedCount },
          { name: 'Pending', count: pendingCount },
          { name: 'Rejected', count: rejectedCount },
          { name: 'Active QR', count: activePasses },
        ],
      });
      return;
    }

    // Authority & System-wide statistics
    const deptFilter =
      ['COORDINATOR', 'MENTOR', 'HOD'].includes(role) && req.user.department && req.user.department !== 'ALL'
        ? { department: req.user.department }
        : {};

    const [
      totalStudents,
      totalAuthorities,
      regLeaves,
      emgLeaves,
      regExtensions,
      emgExtensions,
      activeQrPasses,
      totalQrPasses,
      gateActivities,
      recentAudits,
    ] = await Promise.all([
      Student.countDocuments(),
      Authority.countDocuments(),
      LeaveApplication.find(deptFilter).sort({ createdAt: -1 }).lean(),
      EmergencyLeave.find().sort({ createdAt: -1 }).lean(),
      LeaveExtension.find().sort({ createdAt: -1 }).lean(),
      EmergencyLeaveExtension.find().sort({ createdAt: -1 }).lean(),
      QRPass.countDocuments({ status: 'ACTIVE' }),
      QRPass.countDocuments(),
      GateActivity.find().sort({ updatedAt: -1 }).limit(50).lean(),
      AuditLog.find().sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    const approvedSet = new Set(['APPROVED', 'EXITED', 'OVERDUE', 'RETURNED', 'RETURNED_LATE']);
    const pendingRegSet = new Set([
      'PENDING_COORDINATOR',
      'PENDING_MENTOR',
      'PENDING_HOD',
      'PENDING_SWO',
      'PENDING_WARDEN',
    ]);

    const overdueRegular = regLeaves.filter((l) => l.status === 'OVERDUE').length;
    const overdueEmergency = emgLeaves.filter((l) => l.status === 'OVERDUE').length;

    const deptCountsMap = new Map<string, { department: string; regular: number; emergency: number }>();
    for (const l of regLeaves) {
      const entry = deptCountsMap.get(l.department) || { department: l.department, regular: 0, emergency: 0 };
      entry.regular += 1;
      deptCountsMap.set(l.department, entry);
    }
    for (const e of emgLeaves) {
      const entry = deptCountsMap.get(e.department) || { department: e.department, regular: 0, emergency: 0 };
      entry.emergency += 1;
      deptCountsMap.set(e.department, entry);
    }

    const statusDistribution = [
      {
        stage: 'Pending',
        regular: regLeaves.filter((l) => pendingRegSet.has(l.status)).length,
        emergency: emgLeaves.filter((l) => l.status === 'PENDING_AO').length,
      },
      {
        stage: 'Approved',
        regular: regLeaves.filter((l) => approvedSet.has(l.status)).length,
        emergency: emgLeaves.filter((l) => approvedSet.has(l.status)).length,
      },
      {
        stage: 'Rejected',
        regular: regLeaves.filter((l) => l.status === 'REJECTED').length,
        emergency: emgLeaves.filter((l) => l.status === 'REJECTED').length,
      },
      {
        stage: 'Overdue',
        regular: overdueRegular,
        emergency: overdueEmergency,
      },
    ];

    res.json({
      stats: {
        totalStudents,
        totalAuthorities,
        totalRegularLeaves: regLeaves.length,
        pendingCoordinator: regLeaves.filter((l) => l.status === 'PENDING_COORDINATOR').length,
        pendingMentor: regLeaves.filter((l) => l.status === 'PENDING_MENTOR').length,
        pendingHod: regLeaves.filter((l) => l.status === 'PENDING_HOD').length,
        pendingSwo: regLeaves.filter((l) => l.status === 'PENDING_SWO').length,
        pendingWarden: regLeaves.filter((l) => l.status === 'PENDING_WARDEN').length,
        approvedRegular: regLeaves.filter((l) => approvedSet.has(l.status)).length,
        rejectedRegular: regLeaves.filter((l) => l.status === 'REJECTED').length,
        totalEmergencyLeaves: emgLeaves.length,
        pendingEmergencyAo: emgLeaves.filter((l) => l.status === 'PENDING_AO').length,
        approvedEmergency: emgLeaves.filter((l) => approvedSet.has(l.status)).length,
        rejectedEmergency: emgLeaves.filter((l) => l.status === 'REJECTED').length,
        totalExtensions: regExtensions.length + emgExtensions.length,
        pendingExtensionsSwo: regExtensions.filter((e) => e.status === 'PENDING_SWO').length,
        pendingExtensionsWarden: regExtensions.filter((e) => e.status === 'PENDING_WARDEN').length,
        pendingExtensionsAo: emgExtensions.filter((e) => e.status === 'PENDING_AO').length,
        activeQrPasses,
        totalQrPasses,
        overdueCount: overdueRegular + overdueEmergency,
        currentlyExited: gateActivities.filter((g) => g.status === 'EXITED').length,
        returnedLateCount: gateActivities.filter((g) => g.status === 'RETURNED_LATE').length,
      },
      departmentChart: Array.from(deptCountsMap.values()),
      statusDistribution,
      recentGateActivities: gateActivities.slice(0, 10),
      recentAudits: recentAudits.slice(0, 12),
    });
  } catch (error) {
    console.error('getDashboardOverview error:', error);
    res.status(500).json({ error: 'Failed to load dashboard overview.' });
  }
}

export async function getStudentLeaveHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const students = await Student.find().populate('userId', 'name email phone isActive').lean();
    const result = await Promise.all(
      students.map(async (s) => {
        const [regCount, emgCount, approvedDays] = await Promise.all([
          LeaveApplication.countDocuments({ studentId: s._id }),
          EmergencyLeave.countDocuments({ studentId: s._id }),
          calculateApprovedRegularLeaveDays(s._id, s.semester),
        ]);
        const userObj = s.userId as unknown as { name: string; email: string; phone?: string; isActive: boolean };
        return {
          ...s,
          name: userObj?.name || 'Unknown',
          email: userObj?.email || '',
          phone: userObj?.phone || '',
          isActive: userObj?.isActive ?? true,
          regularLeavesCount: regCount,
          emergencyLeavesCount: emgCount,
          approvedRegularDaysInSem: approvedDays,
        };
      })
    );
    res.json({ students: result });
  } catch (error) {
    console.error('getStudentLeaveHistory error:', error);
    res.status(500).json({ error: 'Failed to load student leave history.' });
  }
}
