import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/User.ts';
import { Student } from '../models/Student.ts';
import { Authority } from '../models/Authority.ts';
import type { PublicStaffRole } from '../models/RegistrationRequest.ts';
import { AppSettings } from '../models/AppSettings.ts';
import { Notification } from '../models/Notification.ts';
import { signAuthToken, type AuthenticatedRequest } from '../middleware/auth.ts';
import { logAudit } from '../services/auditService.ts';
import { calculateApprovedRegularLeaveDays } from '../utils/leaveHelpers.ts';
import { normalizePhoneNumber, userPhoneAlreadyExists } from '../utils/phoneNumbers.ts';

function getErrorProperty(value: unknown, property: string): unknown {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return (value as Record<string, unknown>)[property];
}

function isDatabaseUnavailable(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 3 && current; depth += 1) {
    const name = getErrorProperty(current, 'name');
    const code = getErrorProperty(current, 'code');
    if (
      name === 'MongoServerSelectionError' ||
      name === 'MongooseServerSelectionError' ||
      name === 'MongoNetworkError' ||
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT'
    ) {
      return true;
    }
    current = getErrorProperty(current, 'cause');
  }
  return false;
}

function getStudentDuplicateError(error: unknown): string | null {
  if (getErrorProperty(error, 'code') !== 11000) {
    return null;
  }
  const keyPattern = getErrorProperty(error, 'keyPattern');
  if (keyPattern && typeof keyPattern === 'object' && 'usn' in keyPattern) {
    return 'A student account with this USN / Student ID already exists.';
  }
  if (keyPattern && typeof keyPattern === 'object' && 'email' in keyPattern) {
    return 'An account with this institutional email already exists.';
  }
  if (keyPattern && typeof keyPattern === 'object' && 'phoneNormalized' in keyPattern) {
    return 'An account with this phone number already exists.';
  }
  return 'A student account with this USN or institutional email already exists.';
}

export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!user.isActive || !['ACTIVE', 'APPROVED'].includes(user.accountStatus)) {
      if (user.accountStatus === 'PENDING_ACTIVATION') {
        res.status(403).json({ error: 'This authority account is awaiting password activation.' });
        return;
      }
      res.status(403).json({ error: 'This account has been deactivated. Contact Admin.' });
      return;
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    user.lastLoginAt = new Date();
    await user.save();

    let studentProfile = null;
    let authorityProfile = null;

    if (user.role === 'STUDENT') {
      studentProfile = await Student.findOne({ userId: user._id }).lean();
    } else {
      authorityProfile = await Authority.findOne({ userId: user._id }).lean();
    }

    const token = signAuthToken({
      userId: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
    });

    await logAudit({
      actorUserId: user._id,
      actorName: user.name,
      actorRole: user.role,
      action: 'LOGIN',
      entityType: 'User',
      entityId: String(user._id),
      details: `${user.name} (${user.role}) signed in.`,
    });

    res.json({
      token,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        department: user.department,
        isActive: user.isActive,
        accountStatus: user.accountStatus,
      },
      studentProfile,
      authorityProfile,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to authenticate user.' });
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const user = await User.findById(req.user.userId).select('-passwordHash').lean();
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    let studentProfile: Record<string, unknown> | null = null;
    let authorityProfile: Record<string, unknown> | null = null;
    let approvedRegularDaysInSem = 0;

    if (user.role === 'STUDENT') {
      const sp = await Student.findOne({ userId: user._id }).lean();
      if (sp) {
        approvedRegularDaysInSem = await calculateApprovedRegularLeaveDays(sp._id, sp.semester);
        studentProfile = { ...sp, approvedRegularDaysInSem };
      }
    } else {
      authorityProfile = (await Authority.findOne({ userId: user._id }).lean()) as Record<string, unknown> | null;
    }

    const unreadNotifications = await Notification.countDocuments({
      recipientUserId: user._id,
      isRead: false,
    });

    const settings = await AppSettings.findOne({ key: 'GLOBAL' }).lean();

    res.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        department: user.department,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
      },
      studentProfile,
      authorityProfile,
      unreadNotifications,
      settings,
    });
  } catch (error) {
    console.error('getMe error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
}

export async function updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const { phone, parentPhone, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

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

    if (newPassword) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Current password is required to set a new password.' });
        return;
      }
      const valid = await bcrypt.compare(String(currentPassword), user.passwordHash);
      if (!valid) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
      }
      if (
        String(newPassword).length < 8 ||
        !/[A-Z]/.test(String(newPassword)) ||
        !/[a-z]/.test(String(newPassword)) ||
        !/[0-9]/.test(String(newPassword)) ||
        !/[^A-Za-z0-9]/.test(String(newPassword))
      ) {
        res.status(400).json({
          error: 'Password must be 8+ characters and include uppercase, lowercase, number, and special character.',
        });
        return;
      }
      user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    }

    await user.save();

    if (user.role === 'STUDENT' && parentPhone !== undefined) {
      await Student.findOneAndUpdate(
        { userId: user._id },
        { parentPhone: String(parentPhone).trim() }
      );
    }

    res.json({ message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('updateProfile error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
}

export async function registerStudent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (req.body.role !== undefined && String(req.body.role).toUpperCase() !== 'STUDENT') {
      res.status(403).json({ error: 'Public registration can only create Student accounts.' });
      return;
    }
    const {
      name,
      usn,
      email,
      phone,
      department,
      semester,
      section,
      hostelBlock,
      roomNumber,
      parentPhone,
      password,
      confirmPassword,
    } = req.body;

    if (!name || !usn || !email || !phone || !department || !semester || !section || !password) {
      res.status(400).json({
        error:
          'Full Name, USN, Institutional Email, Phone Number, Department, Semester, Section, and Password are required.',
      });
      return;
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanUsn = String(usn).toUpperCase().trim();
    const cleanPhone = String(phone).trim();
    const cleanDept = String(department).toUpperCase().trim();
    const cleanSection = String(section).toUpperCase().trim();
    const cleanHostelBlock = hostelBlock ? String(hostelBlock).trim() : 'Day Scholar / Campus Hostel';
    const cleanRoomNumber = roomNumber ? String(roomNumber).trim() : 'N/A';
    const cleanParentPhone = parentPhone ? String(parentPhone).trim() : cleanPhone;
    const semNum = Number(semester);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid institutional email address.' });
      return;
    }

    if (!/^\+?[0-9][0-9\s-]{7,14}$/.test(cleanPhone)) {
      res.status(400).json({ error: 'Please enter a valid phone number.' });
      return;
    }

    if (!Number.isInteger(semNum) || semNum < 1 || semNum > 8) {
      res.status(400).json({ error: 'Semester must be between 1 and 8.' });
      return;
    }

    if (
      String(password).length < 8 ||
      String(password).length > 128 ||
      !/[A-Z]/.test(String(password)) ||
      !/[a-z]/.test(String(password)) ||
      !/[0-9]/.test(String(password)) ||
      !/[^A-Za-z0-9]/.test(String(password))
    ) {
      res.status(400).json({
        error: 'Password must be 8+ characters and include uppercase, lowercase, number, and special character.',
      });
      return;
    }

    if (confirmPassword !== undefined && String(confirmPassword) !== String(password)) {
      res.status(400).json({ error: 'Password and Confirm Password do not match.' });
      return;
    }

    if (
      cleanName.length > 120 ||
      !/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(cleanUsn) ||
      cleanDept.length > 120 ||
      cleanSection.length > 32 ||
      cleanHostelBlock.length > 120 ||
      cleanRoomNumber.length > 32
    ) {
      res.status(400).json({ error: 'Please check the length or format of your student registration details.' });
      return;
    }
    if (!/^\+?[0-9][0-9\s-]{7,14}$/.test(cleanParentPhone)) {
      res.status(400).json({ error: 'Please enter a valid parent phone number.' });
      return;
    }

    const existingEmail = await User.findOne({ email: cleanEmail }).lean();
    if (existingEmail) {
      res.status(409).json({ error: 'An account with this institutional email already exists.' });
      return;
    }

    if (await userPhoneAlreadyExists(cleanPhone)) {
      res.status(409).json({ error: 'An account with this phone number already exists.' });
      return;
    }

    const existingUsn = await Student.findOne({ usn: cleanUsn }).lean();
    if (existingUsn) {
      res.status(409).json({ error: 'A student account with this USN / Student ID already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    // Public registration is strictly locked to STUDENT role — never accept client-supplied roles
    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      role: 'STUDENT',
      phone: cleanPhone,
      phoneNormalized: normalizePhoneNumber(cleanPhone),
      department: cleanDept,
      isActive: true,
      accountStatus: 'ACTIVE',
    });

    let studentProfile;
    try {
      studentProfile = await Student.create({
        userId: user._id,
        usn: cleanUsn,
        department: cleanDept,
        semester: semNum,
        section: cleanSection,
        hostelBlock: cleanHostelBlock,
        roomNumber: cleanRoomNumber,
        parentPhone: cleanParentPhone,
      });
      await logAudit({
        actorUserId: user._id,
        actorName: user.name,
        actorRole: 'STUDENT',
        action: 'REGISTER_STUDENT',
        entityType: 'Student',
        entityId: cleanUsn,
        details: `Self-registered student account ${cleanName} (${cleanUsn}) in ${cleanDept} Sem ${semNum}.`,
      });
    } catch (studentErr) {
      await Student.findOneAndDelete({ userId: user._id });
      await User.findByIdAndDelete(user._id);
      throw studentErr;
    }

    res.status(201).json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: 'STUDENT',
        phone: user.phone,
        department: user.department,
        isActive: user.isActive,
        accountStatus: user.accountStatus,
      },
      studentProfile: {
        ...studentProfile.toObject(),
        approvedRegularDaysInSem: 0,
      },
      authorityProfile: null,
      accountStatus: user.accountStatus,
      message: 'Registration successful! Your SmartGate account has been created. You can now sign in.',
    });
  } catch (error) {
    const duplicateError = getStudentDuplicateError(error);
    if (duplicateError) {
      res.status(409).json({ error: duplicateError });
      return;
    }
    console.error('registerStudent error:', error);
    if (isDatabaseUnavailable(error)) {
      res.status(503).json({
        error: 'Student registration is temporarily unavailable because the database cannot be reached. Please try again shortly.',
      });
      return;
    }
    if (getErrorProperty(error, 'name') === 'ValidationError') {
      res.status(400).json({ error: 'Some student registration details are invalid. Review the required fields and try again.' });
      return;
    }
    res.status(500).json({ error: 'Failed to create student account.' });
  }
}

const PUBLIC_STAFF_ROLES: PublicStaffRole[] = [
  'MENTOR',
  'COORDINATOR',
  'HOD',
  'SWO',
  'WARDEN',
  'AO',
  'SECURITY',
  'EMERGENCY_CONTROL',
];

export async function registerPublicAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  const bodyInput =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  const rawRole = bodyInput.requestedRole ?? bodyInput.role ?? 'STUDENT';
  const requestedRole = String(rawRole).toUpperCase().trim();

  if (bodyInput.role !== undefined && String(bodyInput.role).toUpperCase().trim() !== requestedRole) {
    res.status(400).json({ error: 'Account type selection is inconsistent.' });
    return;
  }
  if (requestedRole === 'ADMIN') {
    res.status(403).json({ error: 'System Admin accounts can only be created through secure administrator provisioning.' });
    return;
  }
  if (requestedRole === 'STUDENT') {
    req.body = bodyInput;
    await registerStudent(req, res);
    return;
  }
  if (!PUBLIC_STAFF_ROLES.includes(requestedRole as PublicStaffRole)) {
    res.status(400).json({ error: 'Select a valid account type.' });
    return;
  }

  try {
    const role = requestedRole as PublicStaffRole;
    const body = bodyInput;
    const read = (key: string) => (typeof body[key] === 'string' ? String(body[key]).trim() : '');
    const name = read('name');
    const email = read('email').toLowerCase();
    const phone = read('phone');
    const employeeId = read('employeeId').toUpperCase();
    const password = read('password');
    const confirmPassword = read('confirmPassword');
    const designation = read('designation');
    const accountDesignation = designation || (role === 'SECURITY' ? 'Security Guard' : '');

    if (!name || !email || !phone || !employeeId || !password || !confirmPassword || !accountDesignation) {
      res.status(400).json({ error: 'Name, employee ID, institutional email, phone, designation, and password are required.' });
      return;
    }

    const department =
      role === 'SWO' ? read('officeDepartment') : role === 'AO' ? read('administrativeDepartment') : read('department');
    const assignedHostelBlock = read('assignedHostelBlock');
    const hostelName = read('hostelName');
    const assignedGate = read('assignedGate');
    const dutyLocation = read('dutyLocation');
    const shift = read('shift');
    const assignedControlCentre = read('assignedControlCentre');

    if (['MENTOR', 'COORDINATOR', 'HOD', 'SWO', 'AO'].includes(role) && !department) {
      res.status(400).json({ error: 'Department or office is required for this account type.' });
      return;
    }
    if (role === 'WARDEN' && (!assignedHostelBlock || !hostelName)) {
      res.status(400).json({ error: 'Assigned hostel block and hostel name are required.' });
      return;
    }
    if (role === 'SECURITY' && (!assignedGate || !dutyLocation || !shift)) {
      res.status(400).json({ error: 'Assigned gate, duty location, and shift are required.' });
      return;
    }
    if (role === 'EMERGENCY_CONTROL' && !assignedControlCentre) {
      res.status(400).json({ error: 'Assigned control centre is required.' });
      return;
    }

    if (
      !/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(employeeId) ||
      name.length > 120 ||
      accountDesignation.length > 120 ||
      (department && department.length > 120) ||
      [assignedHostelBlock, hostelName, assignedGate, dutyLocation, shift, assignedControlCentre].some(
        (value) => value.length > 120
      )
    ) {
      res.status(400).json({ error: 'Employee ID contains invalid characters or a registration field is too long.' });
      return;
    }
    if (role === 'SECURITY' && !['Morning', 'Evening', 'Night', 'Rotating'].includes(shift)) {
      res.status(400).json({ error: 'Select a valid security shift.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid institutional email address.' });
      return;
    }
    if (!/^\+?[0-9][0-9\s-]{7,14}$/.test(phone)) {
      res.status(400).json({ error: 'Please enter a valid phone number.' });
      return;
    }
    if (
      password.length < 8 ||
      password.length > 128 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      res.status(400).json({
        error: 'Password must be 8+ characters and include uppercase, lowercase, number, and special character.',
      });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Password and Confirm Password do not match.' });
      return;
    }

    if (await User.exists({ email })) {
      res.status(409).json({ error: 'An account with this institutional email already exists.' });
      return;
    }
    if (await userPhoneAlreadyExists(phone)) {
      res.status(409).json({ error: 'An account with this phone number already exists.' });
      return;
    }
    if (await Authority.exists({ employeeId })) {
      res.status(409).json({ error: 'Employee ID is already in use.' });
      return;
    }

    let createdUserId: string | null = null;
    try {
      const user = await User.create({
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role,
        phone,
        phoneNormalized: normalizePhoneNumber(phone),
        department: department || 'ALL',
        isActive: true,
        accountStatus: 'ACTIVE',
      });
      createdUserId = String(user._id);

      const authority = await Authority.create({
        userId: user._id,
        employeeId,
        role,
        department: department || 'ALL',
        designation: accountDesignation,
        officeLocation:
          dutyLocation ||
          assignedControlCentre ||
          department ||
          'SmartGate',
        assignedHostelBlock: assignedHostelBlock || undefined,
        hostelName: hostelName || undefined,
        assignedGate: assignedGate || undefined,
        dutyLocation: dutyLocation || undefined,
        shift: shift || undefined,
        assignedControlCentre: assignedControlCentre || undefined,
      });

      await logAudit({
        actorUserId: user._id,
        actorName: name,
        actorRole: role,
        action: 'REGISTER_AUTHORITY',
        entityType: 'Authority',
        entityId: employeeId,
        details: `Created active ${role} account ${name} (${employeeId}) through direct registration.`,
      });

      res.status(201).json({
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          department: user.department,
          isActive: user.isActive,
          accountStatus: user.accountStatus,
        },
        authorityProfile: {
          employeeId: authority.employeeId,
          role: authority.role,
          department: authority.department,
          designation: authority.designation,
          officeLocation: authority.officeLocation,
        },
        accountStatus: user.accountStatus,
        message: 'Registration successful! Your SmartGate account has been created. You can now sign in.',
      });
    } catch (error) {
      if (createdUserId) {
        await Authority.deleteMany({ userId: createdUserId });
        await User.findByIdAndDelete(createdUserId);
      }
      throw error;
    }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    ) {
      const keyPattern = getErrorProperty(error, 'keyPattern');
      if (keyPattern && typeof keyPattern === 'object' && 'phoneNormalized' in keyPattern) {
        res.status(409).json({ error: 'An account with this phone number already exists.' });
      } else if (keyPattern && typeof keyPattern === 'object' && 'employeeId' in keyPattern) {
        res.status(409).json({ error: 'Employee ID is already in use.' });
      } else {
        res.status(409).json({ error: 'An account with this institutional email already exists.' });
      }
      return;
    }
    console.error('registerPublicAccount error:', error);
    if (isDatabaseUnavailable(error)) {
      res.status(503).json({
        error: 'Account registration is temporarily unavailable because the database cannot be reached. Please try again shortly.',
      });
      return;
    }
    if (getErrorProperty(error, 'name') === 'ValidationError') {
      res.status(400).json({ error: 'Some registration details are invalid. Review the required fields and try again.' });
      return;
    }
    res.status(500).json({ error: 'Failed to create account.' });
  }
}

export async function activateAuthority(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const token = String(req.params.token || '').trim();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!token) {
      res.status(400).json({ error: 'Activation token is required.' });
      return;
    }
    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      res.status(400).json({
        error: 'Password must be 8+ characters and include uppercase, lowercase, number, and special character.',
      });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Password and Confirm Password do not match.' });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      activationTokenHash: tokenHash,
      accountStatus: 'PENDING_ACTIVATION',
    });

    if (!user) {
      res.status(400).json({ error: 'This activation link is invalid or has already been used.' });
      return;
    }
    if (!user.activationExpiresAt || user.activationExpiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: 'This activation link has expired. Contact the System Administrator.' });
      return;
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.accountStatus = 'ACTIVE';
    user.isActive = true;
    user.activationTokenHash = undefined;
    user.activationExpiresAt = undefined;
    await user.save();

    await logAudit({
      actorUserId: user._id,
      actorName: user.name,
      actorRole: user.role,
      action: 'ACTIVATE_AUTHORITY',
      entityType: 'Authority',
      entityId: String(user._id),
      details: `Activated authority account ${user.name} (${user.email}).`,
    });

    res.json({ message: 'Account activated successfully. You can now sign in.' });
  } catch (error) {
    console.error('activateAuthority error:', error);
    res.status(500).json({ error: 'Failed to activate authority account.' });
  }
}

export async function forgotPassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Institutional email is required.' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail }).lean();

    if (user) {
      const admins = await User.find({ role: 'ADMIN', isActive: true }).select('_id').lean();
      if (admins.length > 0) {
        await Notification.insertMany(
          admins.map((admin) => ({
            recipientUserId: admin._id,
            recipientRole: 'ADMIN',
            title: `Password Reset Request: ${user.name}`,
            message: `${user.name} (${user.email}, ${user.role}) requested a password reset from the SmartGate login portal.`,
            category: 'SYSTEM',
            relatedId: String(user._id),
          }))
        );
      }

      await logAudit({
        actorUserId: user._id,
        actorName: user.name,
        actorRole: user.role,
        action: 'PASSWORD_RESET_REQUEST',
        entityType: 'User',
        entityId: String(user._id),
        details: `Password reset requested via login portal for ${cleanEmail}.`,
      });
    }

    res.json({
      message:
        'If an institutional account exists for this email, a password reset ticket has been logged with the System Administrator.',
    });
  } catch (error) {
    console.error('forgotPassword error:', error);
    res.status(500).json({ error: 'Failed to process password reset request.' });
  }
}

