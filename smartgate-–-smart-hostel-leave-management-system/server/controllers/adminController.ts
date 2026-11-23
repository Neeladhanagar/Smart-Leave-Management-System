import type { Response } from 'express';
import { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { User, USER_ROLES, type UserRole } from '../models/User.ts';
import { Student } from '../models/Student.ts';
import { Authority } from '../models/Authority.ts';
import { RegistrationRequest } from '../models/RegistrationRequest.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { AppSettings } from '../models/AppSettings.ts';
import { logAudit } from '../services/auditService.ts';
import { normalizePhoneNumber, userPhoneAlreadyExists } from '../utils/phoneNumbers.ts';

export async function getAllUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [users, students, authorities] = await Promise.all([
      User.find().select('-passwordHash').sort({ createdAt: -1 }).lean(),
      Student.find().lean(),
      Authority.find().lean(),
    ]);

    const studentMap = new Map(students.map((s) => [String(s.userId), s]));
    const authorityMap = new Map(authorities.map((a) => [String(a.userId), a]));

    const enriched = users.map((u) => ({
      ...u,
      id: String(u._id),
      studentProfile: studentMap.get(String(u._id)) || null,
      authorityProfile: authorityMap.get(String(u._id)) || null,
    }));

    res.json({ users: enriched });
  } catch (error) {
    console.error('getAllUsers error:', error);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
}

export async function getRegistrationRequests(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const requests = await RegistrationRequest.find()
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      requests: requests.map((request) => ({ ...request, id: String(request._id) })),
    });
  } catch (error) {
    console.error('getRegistrationRequests error:', error);
    res.status(500).json({ error: 'Failed to fetch registration requests.' });
  }
}

export async function approveRegistrationRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: 'Invalid registration request ID.' });
    return;
  }
  let createdUserId: string | null = null;
  let requestId: string | null = null;
  try {
    const request = await RegistrationRequest.findById(req.params.id).select('+passwordHash');
    if (!request) {
      res.status(404).json({ error: 'Registration request not found.' });
      return;
    }
    requestId = String(request._id);
    if (request.status !== 'PENDING') {
      res.status(409).json({ error: 'Only pending registration requests can be approved.' });
      return;
    }

    const existingEmail = await User.findOne({ email: request.email }).lean();
    const existingEmployee = await Authority.findOne({ employeeId: request.employeeId }).lean();
    if (existingEmail || existingEmployee || (await userPhoneAlreadyExists(request.phone))) {
      res.status(409).json({
        error: 'This email, phone number, or employee ID is already assigned to an account. Resolve the duplicate before approving.',
      });
      return;
    }

    const details = request.details;
    const user = await User.create({
      name: request.name,
      email: request.email,
      passwordHash: request.passwordHash,
      role: request.requestedRole,
      phone: request.phone,
      phoneNormalized: normalizePhoneNumber(request.phone),
      department: request.department,
      isActive: true,
      accountStatus: 'APPROVED',
    });
    createdUserId = String(user._id);

    try {
      await Authority.create({
        userId: user._id,
        employeeId: request.employeeId,
        role: request.requestedRole,
        department: request.department,
        designation: details.designation,
        officeLocation:
          details.dutyLocation ||
          details.assignedControlCentre ||
          details.department ||
          'SmartGate',
        assignedHostelBlock: details.assignedHostelBlock,
        hostelName: details.hostelName,
        assignedGate: details.assignedGate,
        dutyLocation: details.dutyLocation,
        shift: details.shift,
        assignedControlCentre: details.assignedControlCentre,
      });
    } catch (error) {
      await User.findByIdAndDelete(user._id);
      createdUserId = null;
      throw error;
    }

    request.status = 'APPROVED';
    request.reviewedBy = new Types.ObjectId(req.user!.userId);
    request.reviewedAt = new Date();
    request.createdUserId = user._id;
    await request.save();

    await logAudit({
      actorUserId: req.user?.userId,
      actorName: req.user?.name || 'System Admin',
      actorRole: req.user?.role || 'ADMIN',
      action: 'APPROVE_REGISTRATION_REQUEST',
      entityType: 'RegistrationRequest',
      entityId: String(request._id),
      details: `Approved ${request.requestedRole} registration for ${request.name} (${request.employeeId}); account activated.`,
    });
    await RegistrationRequest.updateOne({ _id: request._id }, { $unset: { passwordHash: 1 } });

    res.json({
      message: `${request.name}'s ${request.requestedRole} account is approved and active.`,
      request: {
        id: String(request._id),
        status: request.status,
        createdUserId: String(user._id),
      },
    });
  } catch (error) {
    if (createdUserId) {
      await User.findByIdAndDelete(createdUserId);
      await Authority.findOneAndDelete({ userId: createdUserId });
      if (requestId) {
        await RegistrationRequest.updateOne(
          { _id: requestId, status: 'APPROVED' },
          {
            $set: { status: 'PENDING' },
            $unset: { reviewedBy: 1, reviewedAt: 1, createdUserId: 1 },
          }
        );
      }
    }
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    ) {
      res.status(409).json({ error: 'This email or employee ID is already assigned to another account.' });
      return;
    }
    console.error('approveRegistrationRequest error:', error);
    res.status(500).json({ error: 'Failed to approve registration request.' });
  }
}

export async function rejectRegistrationRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: 'Invalid registration request ID.' });
    return;
  }
  try {
    const request = await RegistrationRequest.findById(req.params.id);
    if (!request) {
      res.status(404).json({ error: 'Registration request not found.' });
      return;
    }
    if (request.status !== 'PENDING') {
      res.status(409).json({ error: 'Only pending registration requests can be rejected.' });
      return;
    }

    const reason =
      req.body && typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      res.status(400).json({ error: 'A rejection reason is required.' });
      return;
    }
    if (reason.length > 1000) {
      res.status(400).json({ error: 'Rejection reason must be 1000 characters or fewer.' });
      return;
    }
    const reviewNotes = reason;
    request.status = 'REJECTED';
    request.reviewedBy = new Types.ObjectId(req.user!.userId);
    request.reviewedAt = new Date();
    request.reviewNotes = reviewNotes;
    await request.save();

    await logAudit({
      actorUserId: req.user?.userId,
      actorName: req.user?.name || 'System Admin',
      actorRole: req.user?.role || 'ADMIN',
      action: 'REJECT_REGISTRATION_REQUEST',
      entityType: 'RegistrationRequest',
      entityId: String(request._id),
      details: `Rejected ${request.requestedRole} registration for ${request.name} (${request.employeeId}).${reviewNotes ? ` Reason: ${reviewNotes}` : ''}`,
    });
    await RegistrationRequest.updateOne({ _id: request._id }, { $unset: { passwordHash: 1 } });
    res.json({ message: `${request.name}'s registration request was rejected.`, status: request.status });
  } catch (error) {
    console.error('rejectRegistrationRequest error:', error);
    res.status(500).json({ error: 'Failed to reject registration request.' });
  }
}

export async function createStudentAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      name,
      email,
      password,
      phone,
      usn,
      department,
      semester,
      section,
      hostelBlock,
      roomNumber,
      parentName,
      parentPhone,
    } = req.body;

    if (!name || !email || !password || !usn || !department || !semester || !section || !parentPhone) {
      res.status(400).json({ error: 'All mandatory student fields are required.' });
      return;
    }

    const existingEmail = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existingEmail) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const cleanPhone = phone ? String(phone).trim() : '';
    if (cleanPhone && (await userPhoneAlreadyExists(cleanPhone))) {
      res.status(409).json({ error: 'An account with this phone number already exists.' });
      return;
    }

    const existingUsn = await Student.findOne({ usn: String(usn).toUpperCase().trim() });
    if (existingUsn) {
      res.status(409).json({ error: 'A student with this USN already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      passwordHash,
      role: 'STUDENT',
      phone: cleanPhone,
      phoneNormalized: normalizePhoneNumber(cleanPhone) || undefined,
      department: String(department).trim(),
      isActive: true,
      accountStatus: 'ACTIVE',
    });

    const student = await Student.create({
      userId: user._id,
      usn: String(usn).toUpperCase().trim(),
      department: String(department).trim(),
      semester: Number(semester),
      section: String(section).toUpperCase().trim(),
      hostelBlock: hostelBlock ? String(hostelBlock).trim() : 'Block A',
      roomNumber: roomNumber ? String(roomNumber).trim() : '101',
      parentName: parentName ? String(parentName).trim() : '',
      parentPhone: String(parentPhone).trim(),
    });

    await logAudit({
      actorUserId: req.user?.userId,
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'ADMIN',
      action: 'CREATE_STUDENT',
      entityType: 'Student',
      entityId: student.usn,
      details: `Created student account ${user.name} (${student.usn})`,
    });

    res.status(201).json({ user, student });
  } catch (error) {
    console.error('createStudentAccount error:', error);
    res.status(500).json({ error: 'Failed to create student account.' });
  }
}

export async function updateStudentAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, phone, department, semester, section, hostelBlock, roomNumber, parentPhone, isActive } =
      req.body;

    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'STUDENT') {
      res.status(404).json({ error: 'Student user not found.' });
      return;
    }

    if (name) user.name = String(name).trim();
    if (phone !== undefined) {
      const cleanPhone = String(phone).trim();
      if (cleanPhone && (await userPhoneAlreadyExists(cleanPhone, String(user._id)))) {
        res.status(409).json({ error: 'An account with this phone number already exists.' });
        return;
      }
      user.phone = cleanPhone;
      user.phoneNormalized = normalizePhoneNumber(cleanPhone) || undefined;
    }
    if (department) user.department = String(department).trim();
    if (typeof isActive === 'boolean') {
      user.isActive = isActive;
      user.accountStatus = isActive ? 'ACTIVE' : 'SUSPENDED';
    }
    await user.save();

    const student = await Student.findOne({ userId: user._id });
    if (student) {
      if (department) student.department = String(department).trim();
      if (semester) student.semester = Number(semester);
      if (section) student.section = String(section).toUpperCase().trim();
      if (hostelBlock) student.hostelBlock = String(hostelBlock).trim();
      if (roomNumber) student.roomNumber = String(roomNumber).trim();
      if (parentPhone) student.parentPhone = String(parentPhone).trim();
      await student.save();
    }

    await logAudit({
      actorUserId: req.user?.userId,
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'ADMIN',
      action: 'UPDATE_STUDENT',
      entityType: 'Student',
      entityId: student?.usn || String(user._id),
      details: `Updated student details for ${user.name}`,
    });

    res.json({ message: 'Student updated successfully.', user, student });
  } catch (error) {
    console.error('updateStudentAccount error:', error);
    res.status(500).json({ error: 'Failed to update student.' });
  }
}

export async function createAuthorityAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      name,
      email,
      role,
      phone,
      department,
      employeeId,
      designation,
      officeLocation,
      assignedHostelBlock,
      hostelName,
      assignedSection,
      assignedStudentGroups,
      assignedGate,
      dutyLocation,
      shift,
      assignedControlCentre,
      administrativePermissions,
    } = req.body;

    if (!name || !email || !role || !employeeId || !designation) {
      res.status(400).json({ error: 'All mandatory authority fields are required.' });
      return;
    }

    if (!USER_ROLES.includes(role as UserRole) || role === 'STUDENT') {
      res.status(400).json({ error: 'Invalid authority role.' });
      return;
    }

    const existingEmail = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existingEmail) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const existingEmp = await Authority.findOne({ employeeId: String(employeeId).toUpperCase().trim() });
    if (existingEmp) {
      res.status(409).json({ error: 'Employee ID already exists.' });
      return;
    }

    if (phone && !/^\+?[0-9][0-9\s-]{7,14}$/.test(String(phone).trim())) {
      res.status(400).json({ error: 'Please enter a valid phone number.' });
      return;
    }
    if (phone && (await userPhoneAlreadyExists(String(phone).trim()))) {
      res.status(409).json({ error: 'An account with this phone number already exists.' });
      return;
    }

    const activationToken = crypto.randomBytes(32).toString('hex');
    const activationTokenHash = crypto.createHash('sha256').update(activationToken).digest('hex');
    const temporaryPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      passwordHash: temporaryPasswordHash,
      role: role as UserRole,
      phone: phone ? String(phone).trim() : '',
      phoneNormalized: phone ? normalizePhoneNumber(String(phone).trim()) : undefined,
      department: department ? String(department).trim() : 'ALL',
      isActive: false,
      accountStatus: 'PENDING_ACTIVATION',
      activationTokenHash,
      activationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const authority = await Authority.create({
      userId: user._id,
      employeeId: String(employeeId).toUpperCase().trim(),
      role: role as UserRole,
      department: department ? String(department).trim() : 'ALL',
      designation: String(designation).trim(),
      officeLocation: officeLocation ? String(officeLocation).trim() : 'Admin Block',
      assignedHostelBlock: assignedHostelBlock ? String(assignedHostelBlock).trim() : undefined,
      hostelName: hostelName ? String(hostelName).trim() : undefined,
      assignedSection: assignedSection ? String(assignedSection).trim() : undefined,
      assignedStudentGroups: Array.isArray(assignedStudentGroups) ? assignedStudentGroups : [],
      assignedGate: assignedGate ? String(assignedGate).trim() : undefined,
      dutyLocation: dutyLocation ? String(dutyLocation).trim() : undefined,
      shift: shift ? String(shift).trim() : undefined,
      assignedControlCentre: assignedControlCentre ? String(assignedControlCentre).trim() : undefined,
      administrativePermissions: Array.isArray(administrativePermissions)
        ? administrativePermissions
        : [],
    });

    await logAudit({
      actorUserId: req.user?.userId,
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'ADMIN',
      action: 'CREATE_AUTHORITY',
      entityType: 'Authority',
      entityId: authority.employeeId,
      details: `Created ${role} authority account ${user.name} (${authority.employeeId})`,
    });

    const activationUrl = `${req.protocol}://${req.get('host')}/login?activate=${activationToken}`;
    res.status(201).json({
      message: 'Authority account created. Password activation is required before login.',
      user,
      authority,
      activationUrl,
      expiresInHours: 24,
    });
  } catch (error) {
    console.error('createAuthorityAccount error:', error);
    res.status(500).json({ error: 'Failed to create authority account.' });
  }
}

export async function updateAuthorityAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'STUDENT') {
      res.status(404).json({ error: 'Authority user not found.' });
      return;
    }

    const {
      name,
      email,
      phone,
      department,
      designation,
      role,
      officeLocation,
      assignedHostelBlock,
      hostelName,
      assignedSection,
      assignedStudentGroups,
      assignedGate,
      dutyLocation,
      shift,
      assignedControlCentre,
      administrativePermissions,
      isActive,
    } = req.body;

    if (role && (!USER_ROLES.includes(role as UserRole) || role === 'STUDENT')) {
      res.status(400).json({ error: 'Invalid authority role.' });
      return;
    }
    if (email) {
      const cleanEmail = String(email).toLowerCase().trim();
      const duplicate = await User.findOne({ email: cleanEmail, _id: { $ne: user._id } });
      if (duplicate) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }
      user.email = cleanEmail;
    }
    if (name) user.name = String(name).trim();
    if (phone !== undefined) {
      const cleanPhone = String(phone).trim();
      if (cleanPhone && !/^\+?[0-9][0-9\s-]{7,14}$/.test(cleanPhone)) {
        res.status(400).json({ error: 'Please enter a valid phone number.' });
        return;
      }
      if (cleanPhone && (await userPhoneAlreadyExists(cleanPhone, String(user._id)))) {
        res.status(409).json({ error: 'An account with this phone number already exists.' });
        return;
      }
      user.phone = cleanPhone;
      user.phoneNormalized = normalizePhoneNumber(cleanPhone) || undefined;
    }
    if (department !== undefined) user.department = String(department).trim();
    if (role) user.role = role as UserRole;
    if (typeof isActive === 'boolean') {
      user.isActive = isActive;
      user.accountStatus = isActive ? 'ACTIVE' : 'SUSPENDED';
    }
    await user.save();

    const authority = await Authority.findOne({ userId: user._id });
    if (authority) {
      if (role) authority.role = role as UserRole;
      if (department !== undefined) authority.department = String(department).trim();
      if (designation) authority.designation = String(designation).trim();
      if (officeLocation !== undefined) authority.officeLocation = String(officeLocation).trim();
      if (assignedHostelBlock !== undefined) authority.assignedHostelBlock = String(assignedHostelBlock).trim();
      if (hostelName !== undefined) authority.hostelName = String(hostelName).trim();
      if (assignedSection !== undefined) authority.assignedSection = String(assignedSection).trim();
      if (Array.isArray(assignedStudentGroups)) authority.assignedStudentGroups = assignedStudentGroups;
      if (assignedGate !== undefined) authority.assignedGate = String(assignedGate).trim();
      if (dutyLocation !== undefined) authority.dutyLocation = String(dutyLocation).trim();
      if (shift !== undefined) authority.shift = String(shift).trim();
      if (assignedControlCentre !== undefined) authority.assignedControlCentre = String(assignedControlCentre).trim();
      if (Array.isArray(administrativePermissions)) {
        authority.administrativePermissions = administrativePermissions;
      }
      await authority.save();
    }

    await logAudit({
      actorUserId: req.user?.userId,
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'ADMIN',
      action: 'UPDATE_AUTHORITY',
      entityType: 'Authority',
      entityId: authority?.employeeId || String(user._id),
      details: `Updated authority account ${user.name} (${user.role}).`,
    });

    res.json({ message: 'Authority account updated successfully.', user, authority });
  } catch (error) {
    console.error('updateAuthorityAccount error:', error);
    res.status(500).json({ error: 'Failed to update authority account.' });
  }
}

export async function toggleUserActive(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (req.user?.userId === req.params.id) {
      res.status(400).json({ error: 'You cannot deactivate your own active Admin account.' });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (!user.isActive && user.accountStatus === 'PENDING_ACTIVATION') {
      res.status(409).json({ error: 'This account must complete its secure invitation activation before it can be enabled.' });
      return;
    }

    user.isActive = !user.isActive;
    user.accountStatus = user.isActive ? 'ACTIVE' : 'SUSPENDED';
    await user.save();

    await logAudit({
      actorUserId: req.user?.userId,
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'ADMIN',
      action: user.isActive ? 'ACTIVATE_USER' : 'SUSPEND_USER',
      entityType: 'User',
      entityId: user.email,
      details: `${user.isActive ? 'Activated' : 'Suspended'} user ${user.name} (${user.role})`,
    });

    res.json({ message: `User ${user.isActive ? 'activated' : 'suspended'}.`, isActive: user.isActive });
  } catch (error) {
    console.error('toggleUserActive error:', error);
    res.status(500).json({ error: 'Failed to update account status.' });
  }
}

export async function deleteUserSafely(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (req.user?.userId === req.params.id) {
      res.status(400).json({ error: 'You cannot delete your own Admin account.' });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Soft-deactivate to preserve referential integrity on historical leaves & audit trails
    user.isActive = false;
    user.accountStatus = 'SUSPENDED';
    await user.save();

    await logAudit({
      actorUserId: req.user?.userId,
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'ADMIN',
      action: 'SAFE_ARCHIVE_USER',
      entityType: 'User',
      entityId: user.email,
      details: `Safely deactivated/archived user ${user.name} (${user.role}) preserving leave & audit records.`,
    });

    res.json({ message: 'Account safely deactivated to preserve historical leave & security audit records.' });
  } catch (error) {
    console.error('deleteUserSafely error:', error);
    res.status(500).json({ error: 'Failed to archive user.' });
  }
}

export async function getAuditLogs(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(250).lean();
    res.json({ logs });
  } catch (error) {
    console.error('getAuditLogs error:', error);
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
}

export async function getSettings(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    let settings = await AppSettings.findOne({ key: 'GLOBAL' }).lean();
    if (!settings) {
      settings = await AppSettings.create({ key: 'GLOBAL' });
    }
    res.json({ settings });
  } catch (error) {
    console.error('getSettings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings.' });
  }
}

export async function updateSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { collegeName, hostelName, hodThresholdDays, currentSemesterLabel, allowLateExtensions } = req.body;
    const settings = await AppSettings.findOneAndUpdate(
      { key: 'GLOBAL' },
      {
        ...(collegeName ? { collegeName: String(collegeName).trim() } : {}),
        ...(hostelName ? { hostelName: String(hostelName).trim() } : {}),
        ...(hodThresholdDays !== undefined ? { hodThresholdDays: Number(hodThresholdDays) } : {}),
        ...(currentSemesterLabel ? { currentSemesterLabel: String(currentSemesterLabel).trim() } : {}),
        ...(typeof allowLateExtensions === 'boolean' ? { allowLateExtensions } : {}),
      },
      { upsert: true, new: true }
    );

    await logAudit({
      actorUserId: req.user?.userId,
      actorName: req.user?.name || 'Admin',
      actorRole: req.user?.role || 'ADMIN',
      action: 'UPDATE_SETTINGS',
      entityType: 'AppSettings',
      entityId: 'GLOBAL',
      details: `Updated SmartGate global settings (HOD threshold: ${settings.hodThresholdDays} days)`,
    });

    res.json({ settings, message: 'Application settings updated.' });
  } catch (error) {
    console.error('updateSettings error:', error);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
}
