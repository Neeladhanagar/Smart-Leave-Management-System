import bcrypt from 'bcryptjs';
import { connectDB } from './config/db.ts';
import { User, type UserRole } from './models/User.ts';
import { Student } from './models/Student.ts';
import { Authority } from './models/Authority.ts';
import { AppSettings } from './models/AppSettings.ts';
import { LeaveApplication } from './models/LeaveApplication.ts';
import { EmergencyLeave } from './models/EmergencyLeave.ts';
import { LeaveExtension } from './models/LeaveExtension.ts';
import { GateActivity } from './models/GateActivity.ts';
import { issueQRPassForLeave } from './utils/leaveHelpers.ts';
import { logApprovalHistory, logAudit } from './services/auditService.ts';
import { notifyUser, notifyRoles } from './services/notificationService.ts';
import { normalizePhoneNumber } from './utils/phoneNumbers.ts';

function isStrongSeedPassword(password: string): boolean {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export async function ensureInitialSeed(): Promise<void> {
  const existingUsers = await User.countDocuments();
  if (existingUsers > 0) {
    return;
  }

  const demoPassword = process.env.DEMO_SEED_PASSWORD || '';
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || '';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error('Set a valid SEED_ADMIN_EMAIL before initializing an empty database.');
  }
  if (!isStrongSeedPassword(adminPassword)) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters with uppercase, lowercase, a number, and a symbol.');
  }
  if (!isStrongSeedPassword(demoPassword) || demoPassword === adminPassword) {
    throw new Error('Set a strong DEMO_SEED_PASSWORD different from SEED_ADMIN_PASSWORD before initializing an empty database.');
  }

  console.log('[SmartGate Seed] Database empty — seeding initial roles, students, and workflow scenarios...');

  await AppSettings.findOneAndUpdate(
    { key: 'GLOBAL' },
    {
      key: 'GLOBAL',
      collegeName: process.env.COLLEGE_NAME || 'National Institute of Engineering & Technology',
      hostelName: 'SmartGate Central Hostels',
      hodThresholdDays: 5,
      currentSemesterLabel: '2026-ODD',
      allowLateExtensions: true,
      qrValidityBufferMinutes: 30,
    },
    { upsert: true }
  );

  const demoHash = await bcrypt.hash(demoPassword, 10);
  const adminHash = await bcrypt.hash(adminPassword, 10);

  // Create Authority Accounts for all 9 staff roles
  const authorityDefs: Array<{
    name: string;
    email: string;
    role: UserRole;
    department: string;
    employeeId: string;
    designation: string;
    officeLocation: string;
    phone: string;
  }> = [
    {
      name: 'Prof. Rajeshwari Kulkarni',
      email: 'coordinator@smartgate.edu',
      role: 'COORDINATOR',
      department: 'CSE',
      employeeId: 'EMP-COORD-01',
      designation: 'Class & Hostel Leave Coordinator',
      officeLocation: 'CSE Block Room 204',
      phone: '+91 98450 11001',
    },
    {
      name: 'Dr. Vikramaditya Rao',
      email: 'mentor@smartgate.edu',
      role: 'MENTOR',
      department: 'CSE',
      employeeId: 'EMP-MENT-01',
      designation: 'Faculty Mentor',
      officeLocation: 'CSE Block Room 212',
      phone: '+91 98450 11002',
    },
    {
      name: 'Dr. Meenakshi Sundaram',
      email: 'hod@smartgate.edu',
      role: 'HOD',
      department: 'CSE',
      employeeId: 'EMP-HOD-01',
      designation: 'Head of Department (CSE)',
      officeLocation: 'CSE Block Room 101',
      phone: '+91 98450 11003',
    },
    {
      name: 'Dr. Harishankar Iyer',
      email: 'swo@smartgate.edu',
      role: 'SWO',
      department: 'ALL',
      employeeId: 'EMP-SWO-01',
      designation: 'Student Welfare Officer',
      officeLocation: 'Student Affairs Wing',
      phone: '+91 98450 11004',
    },
    {
      name: 'Mr. Prakash Hegde',
      email: 'warden@smartgate.edu',
      role: 'WARDEN',
      department: 'ALL',
      employeeId: 'EMP-WARD-01',
      designation: 'Chief Hostel Warden',
      officeLocation: 'Central Hostel Office',
      phone: '+91 98450 11005',
    },
    {
      name: 'Mrs. Ananya Deshmukh',
      email: 'ao@smartgate.edu',
      role: 'AO',
      department: 'ALL',
      employeeId: 'EMP-AO-01',
      designation: 'Administrative Officer',
      officeLocation: 'Admin Block Suite 102',
      phone: '+91 98450 11006',
    },
    {
      name: 'Mr. Baldev Singh',
      email: 'security@smartgate.edu',
      role: 'SECURITY',
      department: 'ALL',
      employeeId: 'EMP-SEC-01',
      designation: 'Chief Gate Security Officer',
      officeLocation: 'Main Hostel Gate Post',
      phone: '+91 98450 11007',
    },
    {
      name: 'System Administrator',
      email: adminEmail,
      role: 'ADMIN',
      department: 'ALL',
      employeeId: 'EMP-ADM-01',
      designation: 'SmartGate System Admin',
      officeLocation: 'IT Infrastructure Cell',
      phone: '+91 98450 11008',
    },
    {
      name: 'Cmdr. Siddharth Menon',
      email: 'emergency.control@smartgate.edu',
      role: 'EMERGENCY_CONTROL',
      department: 'ALL',
      employeeId: 'EMP-ECC-01',
      designation: 'Emergency Control Centre Director',
      officeLocation: '24x7 Campus Command Desk',
      phone: '+91 98450 11009',
    },
  ];

  const authorityMap = new Map<UserRole, typeof User.prototype>();

  for (const def of authorityDefs) {
    const user = await User.create({
      name: def.name,
      email: def.email,
      passwordHash: def.role === 'ADMIN' ? adminHash : demoHash,
      role: def.role,
      department: def.department,
      phone: def.phone,
      phoneNormalized: normalizePhoneNumber(def.phone),
      isActive: true,
      accountStatus: 'ACTIVE',
    });
    await Authority.create({
      userId: user._id,
      employeeId: def.employeeId,
      role: def.role,
      department: def.department,
      designation: def.designation,
      officeLocation: def.officeLocation,
    });
    authorityMap.set(def.role, user);
  }

  // Create 3 Students with varied semester leave histories
  const studentDefs = [
    {
      name: 'Aarav Sharma',
      email: 'student@smartgate.edu',
      usn: '1NI23CS014',
      department: 'CSE',
      semester: 6,
      section: 'A',
      hostelBlock: 'Sapphire Block',
      roomNumber: 'S-304',
      parentName: 'Mr. Rajiv Sharma',
      parentPhone: '+91 98111 22334',
      phone: '+91 98860 55441',
    },
    {
      name: 'Diya Patel',
      email: 'diya.patel@smartgate.edu',
      usn: '1NI23CS042',
      department: 'CSE',
      semester: 6,
      section: 'B',
      hostelBlock: 'Pearl Block',
      roomNumber: 'P-218',
      parentName: 'Mrs. Kavita Patel',
      parentPhone: '+91 98222 33445',
      phone: '+91 98860 55442',
    },
    {
      name: 'Rohan Verma',
      email: 'rohan.verma@smartgate.edu',
      usn: '1NI24EC019',
      department: 'CSE',
      semester: 4,
      section: 'A',
      hostelBlock: 'Emerald Block',
      roomNumber: 'E-112',
      parentName: 'Mr. Suresh Verma',
      parentPhone: '+91 98333 44556',
      phone: '+91 98860 55443',
    },
  ];

  const createdStudents: Array<{ user: typeof User.prototype; student: typeof Student.prototype }> = [];
  for (const sDef of studentDefs) {
    const u = await User.create({
      name: sDef.name,
      email: sDef.email,
      passwordHash: demoHash,
      role: 'STUDENT',
      department: sDef.department,
      phone: sDef.phone,
      phoneNormalized: normalizePhoneNumber(sDef.phone),
      isActive: true,
      accountStatus: 'ACTIVE',
    });
    const s = await Student.create({
      userId: u._id,
      usn: sDef.usn,
      department: sDef.department,
      semester: sDef.semester,
      section: sDef.section,
      hostelBlock: sDef.hostelBlock,
      roomNumber: sDef.roomNumber,
      parentName: sDef.parentName,
      parentPhone: sDef.parentPhone,
    });
    createdStudents.push({ user: u, student: s });
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const wardenUser = authorityMap.get('WARDEN')!;
  const swoUser = authorityMap.get('SWO')!;
  const mentorUser = authorityMap.get('MENTOR')!;
  const coordUser = authorityMap.get('COORDINATOR')!;
  const aoUser = authorityMap.get('AO')!;
  const secUser = authorityMap.get('SECURITY')!;

  // 1. Aarav Sharma: 1 past returned leave (2 days) + 1 currently APPROVED active QR Pass (2 days) = 4 days (<= 5, skips HOD)
  const aarav = createdStudents[0];
  const aaravPast = await LeaveApplication.create({
    requestCode: 'REG-2026-A101',
    studentId: aarav.student._id,
    userId: aarav.user._id,
    studentName: aarav.user.name,
    usn: aarav.student.usn,
    department: aarav.student.department,
    semester: aarav.student.semester,
    section: aarav.student.section,
    reason: 'Attending sibling convocation ceremony in Bengaluru.',
    departureDate: new Date(now - 20 * dayMs),
    expectedReturnDate: new Date(now - 19 * dayMs),
    approvedReturnDate: new Date(now - 19 * dayMs),
    parentContact: aarav.student.parentPhone,
    status: 'RETURNED',
    hodRequired: false,
    previousApprovedDaysInSem: 0,
    currentStage: 'COMPLETED',
  });

  await GateActivity.create({
    passId: 'SG-PASS-HIST01',
    leaveType: 'REGULAR',
    leaveRefId: aaravPast._id,
    leaveRequestCode: aaravPast.requestCode,
    studentId: aarav.student._id,
    studentName: aarav.user.name,
    usn: aarav.student.usn,
    department: aarav.student.department,
    exitTime: new Date(now - 20 * dayMs),
    exitRecordedBy: secUser._id,
    exitRecordedByName: secUser.name,
    exitRemarks: 'Verified pass at main gate',
    returnTime: new Date(now - 19 * dayMs),
    returnRecordedBy: secUser._id,
    returnRecordedByName: secUser.name,
    returnRemarks: 'Returned on schedule',
    status: 'RETURNED',
  });

  // Active approved regular leave for Aarav with real QR Pass!
  const aaravActive = await LeaveApplication.create({
    requestCode: 'REG-2026-A204',
    studentId: aarav.student._id,
    userId: aarav.user._id,
    studentName: aarav.user.name,
    usn: aarav.student.usn,
    department: aarav.student.department,
    semester: aarav.student.semester,
    section: aarav.student.section,
    reason: 'Weekend hometown visit for passport renewal appointment.',
    departureDate: new Date(now + 1 * 3600 * 1000),
    expectedReturnDate: new Date(now + 1 * dayMs + 2 * 3600 * 1000),
    approvedReturnDate: new Date(now + 1 * dayMs + 2 * 3600 * 1000),
    parentContact: aarav.student.parentPhone,
    status: 'APPROVED',
    hodRequired: false,
    previousApprovedDaysInSem: 2,
    currentStage: 'COMPLETED',
  });

  const aaravQr = await issueQRPassForLeave({
    leaveType: 'REGULAR',
    leaveRefId: aaravActive._id,
    leaveRequestCode: aaravActive.requestCode,
    studentId: aarav.student._id,
    userId: aarav.user._id,
    studentName: aarav.user.name,
    usn: aarav.student.usn,
    department: aarav.student.department,
    departureDate: aaravActive.departureDate,
    approvedReturnDate: aaravActive.approvedReturnDate,
    issuedBy: `Warden (${wardenUser.name})`,
  });

  await logApprovalHistory({
    leaveType: 'REGULAR',
    targetId: aaravActive._id,
    requestCode: aaravActive.requestCode,
    stage: 'WARDEN',
    action: 'APPROVED',
    actorUserId: wardenUser._id,
    actorName: wardenUser.name,
    actorRole: 'WARDEN',
    remarks: 'Approved after SWO clearance. QR Pass issued.',
  });

  // 2. Diya Patel: 6 prior approved days in Sem 6 (> 5) + 1 leave at PENDING_MENTOR so Mentor approval routes to HOD!
  const diya = createdStudents[1];
  await LeaveApplication.create({
    requestCode: 'REG-2026-D101',
    studentId: diya.student._id,
    userId: diya.user._id,
    studentName: diya.user.name,
    usn: diya.student.usn,
    department: diya.student.department,
    semester: diya.student.semester,
    section: diya.student.section,
    reason: 'Inter-university hackathon finals in Hyderabad.',
    departureDate: new Date(now - 28 * dayMs),
    expectedReturnDate: new Date(now - 23 * dayMs),
    approvedReturnDate: new Date(now - 23 * dayMs),
    parentContact: diya.student.parentPhone,
    status: 'RETURNED',
    hodRequired: false,
    previousApprovedDaysInSem: 0,
    currentStage: 'COMPLETED',
  });

  const diyaPendingMentor = await LeaveApplication.create({
    requestCode: 'REG-2026-D209',
    studentId: diya.student._id,
    userId: diya.user._id,
    studentName: diya.user.name,
    usn: diya.student.usn,
    department: diya.student.department,
    semester: diya.student.semester,
    section: diya.student.section,
    reason: 'Family wedding ceremony in Pune (4 days).',
    departureDate: new Date(now + 1 * dayMs),
    expectedReturnDate: new Date(now + 4 * dayMs),
    approvedReturnDate: new Date(now + 4 * dayMs),
    parentContact: diya.student.parentPhone,
    status: 'PENDING_MENTOR',
    hodRequired: true,
    previousApprovedDaysInSem: 6,
    currentStage: 'MENTOR',
  });

  await logApprovalHistory({
    leaveType: 'REGULAR',
    targetId: diyaPendingMentor._id,
    requestCode: diyaPendingMentor.requestCode,
    stage: 'COORDINATOR',
    action: 'APPROVED',
    actorUserId: coordUser._id,
    actorName: coordUser.name,
    actorRole: 'COORDINATOR',
    remarks: 'Parent consent verified via call. Forwarded to Mentor.',
  });

  // Also seed a pending Coordinator request and a pending SWO extension request
  await LeaveApplication.create({
    requestCode: 'REG-2026-A310',
    studentId: aarav.student._id,
    userId: aarav.user._id,
    studentName: aarav.user.name,
    usn: aarav.student.usn,
    department: aarav.student.department,
    semester: aarav.student.semester,
    section: aarav.student.section,
    reason: 'Industrial visit preparation workshop off-campus.',
    departureDate: new Date(now + 5 * dayMs),
    expectedReturnDate: new Date(now + 6 * dayMs),
    approvedReturnDate: new Date(now + 6 * dayMs),
    parentContact: aarav.student.parentPhone,
    status: 'PENDING_COORDINATOR',
    hodRequired: false,
    previousApprovedDaysInSem: 5,
    currentStage: 'COORDINATOR',
  });

  await LeaveExtension.create({
    extensionCode: 'EXT-2026-A001',
    leaveId: aaravActive._id,
    leaveRequestCode: aaravActive.requestCode,
    studentId: aarav.student._id,
    userId: aarav.user._id,
    studentName: aarav.user.name,
    usn: aarav.student.usn,
    department: aarav.student.department,
    originalReturnDate: aaravActive.approvedReturnDate,
    requestedReturnDate: new Date(now + 3 * dayMs),
    reason: 'Passport verification slot rescheduled to Monday morning.',
    isLateExtension: false,
    extensionTag: 'STANDARD_EXTENSION',
    status: 'PENDING_SWO',
  });

  // 3. Rohan Verma: 1 OVERDUE regular leave + 1 PENDING_AO emergency leave
  const rohan = createdStudents[2];
  const rohanOverdue = await LeaveApplication.create({
    requestCode: 'REG-2026-R115',
    studentId: rohan.student._id,
    userId: rohan.user._id,
    studentName: rohan.user.name,
    usn: rohan.student.usn,
    department: rohan.student.department,
    semester: rohan.student.semester,
    section: rohan.student.section,
    reason: 'Home travel for medical checkup.',
    departureDate: new Date(now - 3 * dayMs),
    expectedReturnDate: new Date(now - 6 * 3600 * 1000),
    approvedReturnDate: new Date(now - 6 * 3600 * 1000),
    parentContact: rohan.student.parentPhone,
    status: 'OVERDUE',
    hodRequired: false,
    previousApprovedDaysInSem: 0,
    currentStage: 'COMPLETED',
    overdueAt: new Date(now - 5 * 3600 * 1000),
  });

  const rohanQr = await issueQRPassForLeave({
    leaveType: 'REGULAR',
    leaveRefId: rohanOverdue._id,
    leaveRequestCode: rohanOverdue.requestCode,
    studentId: rohan.student._id,
    userId: rohan.user._id,
    studentName: rohan.user.name,
    usn: rohan.student.usn,
    department: rohan.student.department,
    departureDate: rohanOverdue.departureDate,
    approvedReturnDate: rohanOverdue.approvedReturnDate,
    issuedBy: `Warden (${wardenUser.name})`,
  });
  rohanQr.status = 'EXPIRED';
  await rohanQr.save();

  await GateActivity.create({
    passId: rohanQr.passId,
    qrPassRef: rohanQr._id,
    leaveType: 'REGULAR',
    leaveRefId: rohanOverdue._id,
    leaveRequestCode: rohanOverdue.requestCode,
    studentId: rohan.student._id,
    studentName: rohan.user.name,
    usn: rohan.student.usn,
    department: rohan.student.department,
    exitTime: new Date(now - 3 * dayMs),
    exitRecordedBy: secUser._id,
    exitRecordedByName: secUser.name,
    exitRemarks: 'Exited via Main Gate',
    status: 'EXITED',
  });

  // Emergency Leave pending AO
  const emgPending = await EmergencyLeave.create({
    requestCode: 'EMG-2026-R501',
    studentId: rohan.student._id,
    userId: rohan.user._id,
    studentName: rohan.user.name,
    usn: rohan.student.usn,
    department: rohan.student.department,
    semester: rohan.student.semester,
    section: rohan.student.section,
    emergencyType: 'Medical Emergency',
    reason: 'Grandfather hospitalized in ICU; immediate family presence required.',
    departureDate: new Date(now + 2 * 3600 * 1000),
    expectedReturnDate: new Date(now + 3 * dayMs),
    approvedReturnDate: new Date(now + 3 * dayMs),
    parentContact: rohan.student.parentPhone,
    status: 'PENDING_AO',
  });

  await logApprovalHistory({
    leaveType: 'EMERGENCY',
    targetId: emgPending._id,
    requestCode: emgPending.requestCode,
    stage: 'STUDENT',
    action: 'SUBMITTED',
    actorUserId: rohan.user._id,
    actorName: rohan.user.name,
    actorRole: 'STUDENT',
    remarks: 'Urgent medical emergency leave submitted directly to AO.',
  });

  // Historical approved emergency leave
  const emgApproved = await EmergencyLeave.create({
    requestCode: 'EMG-2026-D402',
    studentId: diya.student._id,
    userId: diya.user._id,
    studentName: diya.user.name,
    usn: diya.student.usn,
    department: diya.student.department,
    semester: diya.student.semester,
    section: diya.student.section,
    emergencyType: 'Medical Emergency',
    reason: 'Urgent dental surgical procedure with parent accompaniment.',
    departureDate: new Date(now - 10 * dayMs),
    expectedReturnDate: new Date(now - 8 * dayMs),
    approvedReturnDate: new Date(now - 8 * dayMs),
    parentContact: diya.student.parentPhone,
    status: 'RETURNED',
    aoRemarks: 'Verified clinic appointment; immediate emergency clearance issued.',
    aoDecidedAt: new Date(now - 10 * dayMs),
    aoDecidedBy: aoUser._id,
  });

  await issueQRPassForLeave({
    leaveType: 'EMERGENCY',
    leaveRefId: emgApproved._id,
    leaveRequestCode: emgApproved.requestCode,
    studentId: diya.student._id,
    userId: diya.user._id,
    studentName: diya.user.name,
    usn: diya.student.usn,
    department: diya.student.department,
    departureDate: emgApproved.departureDate,
    approvedReturnDate: emgApproved.approvedReturnDate,
    issuedBy: `AO (${aoUser.name})`,
  });

  await notifyUser({
    userId: aarav.user._id,
    role: 'STUDENT',
    title: `QR Pass Ready: ${aaravQr.passId}`,
    message: `Your regular leave ${aaravActive.requestCode} is approved. Open QR Pass Generator to view, download, or print pass ${aaravQr.passId}.`,
    category: 'QR_PASS',
    relatedId: aaravQr.passId,
  });

  await notifyRoles({
    roles: ['AO', 'EMERGENCY_CONTROL'],
    title: `Pending Emergency Request: ${emgPending.requestCode}`,
    message: `${rohan.user.name} (${rohan.student.usn}) submitted an emergency leave pending AO approval.`,
    category: 'EMERGENCY',
    relatedId: emgPending.requestCode,
  });

  await notifyRoles({
    roles: ['SWO', 'WARDEN', 'SECURITY'],
    title: `Overdue Alert: ${rohan.user.name} (${rohan.student.usn})`,
    message: `Leave ${rohanOverdue.requestCode} passed its return deadline without digital gate return.`,
    category: 'OVERDUE',
    relatedId: rohanOverdue.requestCode,
  });

  await logAudit({
    actorName: 'SmartGate Bootstrap',
    actorRole: 'SYSTEM',
    action: 'SEED_DATABASE',
    entityType: 'System',
    details: 'Initialized demo accounts for all 10 SmartGate roles and sample workflows.',
  });

  console.log('[SmartGate Seed] Initial seed completed successfully.');
}

// Allow running directly via `npm run seed`
const isDirectRun = process.argv[1]?.endsWith('seed.ts');
if (isDirectRun) {
  connectDB()
    .then(() => ensureInitialSeed())
    .then(() => {
      console.log('Seed script finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
