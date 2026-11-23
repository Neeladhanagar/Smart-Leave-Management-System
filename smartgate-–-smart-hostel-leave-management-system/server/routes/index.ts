import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import { uploadDocument } from '../middleware/upload.ts';
import {
  login,
  registerStudent,
  registerPublicAccount,
  activateAuthority,
  forgotPassword,
  getMe,
  updateProfile,
} from '../controllers/authController.ts';
import {
  applyRegularLeave,
  getRegularLeaves,
  getRegularLeaveDetail,
  decideRegularLeave,
} from '../controllers/leaveController.ts';
import {
  applyEmergencyLeave,
  getEmergencyLeaves,
  getEmergencyLeaveDetail,
  decideEmergencyLeave,
} from '../controllers/emergencyController.ts';
import {
  applyExtension,
  getExtensions,
  decideRegularExtension,
  decideEmergencyExtension,
} from '../controllers/extensionController.ts';
import { getQRPasses, verifyQRPass } from '../controllers/qrController.ts';
import {
  recordGateExit,
  recordGateReturn,
  getGateHistory,
  getOverdueStudents,
  searchStudents,
} from '../controllers/gateController.ts';
import {
  shareMyLocation,
  shareManualLocation,
  stopSharingLocation,
  getMyLocationStatus,
  getSharedLocations,
} from '../controllers/locationController.ts';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/notificationController.ts';
import { getDashboardOverview, getStudentLeaveHistory } from '../controllers/dashboardController.ts';
import {
  getAllUsers,
  createStudentAccount,
  updateStudentAccount,
  createAuthorityAccount,
  toggleUserActive,
  deleteUserSafely,
  updateAuthorityAccount,
  getAuditLogs,
  getSettings,
  updateSettings,
  getRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
} from '../controllers/adminController.ts';

const router = Router();

// Public Auth
router.post('/auth/login', login);
router.post('/auth/register', registerPublicAccount);
router.post('/auth/activate/:token', activateAuthority);
router.post('/auth/forgot-password', forgotPassword);

// Authenticated User Profile
router.get('/auth/me', authenticate, getMe);
router.put('/auth/profile', authenticate, updateProfile);

// Dashboard Overview
router.get('/dashboard/overview', authenticate, getDashboardOverview);
router.get(
  '/dashboard/students-history',
  authenticate,
  authorize('COORDINATOR', 'MENTOR', 'HOD', 'SWO', 'WARDEN', 'AO', 'ADMIN'),
  getStudentLeaveHistory
);

// Regular Leave Routes
router.post(
  '/leaves/regular',
  authenticate,
  authorize('STUDENT'),
  uploadDocument.single('document'),
  applyRegularLeave
);
router.get('/leaves/regular', authenticate, getRegularLeaves);
router.get('/leaves/regular/:id', authenticate, getRegularLeaveDetail);
router.post(
  '/leaves/regular/:id/decide',
  authenticate,
  authorize('COORDINATOR', 'MENTOR', 'HOD', 'SWO', 'WARDEN'),
  decideRegularLeave
);

// Emergency Leave Routes
router.post(
  '/leaves/emergency',
  authenticate,
  authorize('STUDENT'),
  uploadDocument.single('document'),
  applyEmergencyLeave
);
router.get('/leaves/emergency', authenticate, getEmergencyLeaves);
router.get('/leaves/emergency/:id', authenticate, getEmergencyLeaveDetail);
router.post(
  '/leaves/emergency/:id/decide',
  authenticate,
  authorize('AO'),
  decideEmergencyLeave
);

// Extension Routes
router.post(
  '/extensions',
  authenticate,
  authorize('STUDENT'),
  uploadDocument.single('document'),
  applyExtension
);
router.get('/extensions', authenticate, getExtensions);
router.post(
  '/extensions/regular/:id/decide',
  authenticate,
  authorize('SWO', 'WARDEN'),
  decideRegularExtension
);
router.post(
  '/extensions/emergency/:id/decide',
  authenticate,
  authorize('AO'),
  decideEmergencyExtension
);

// QR Pass Routes
router.get('/qr-passes', authenticate, getQRPasses);
router.post(
  '/qr-passes/verify',
  authenticate,
  authorize('SECURITY', 'WARDEN', 'ADMIN', 'AO', 'SWO'),
  verifyQRPass
);

// Gate Activity & Overdue Management
router.post('/gate/exit', authenticate, authorize('SECURITY'), recordGateExit);
router.post('/gate/return', authenticate, authorize('SECURITY'), recordGateReturn);
router.get(
  '/gate/history',
  authenticate,
  authorize('SECURITY', 'WARDEN', 'ADMIN', 'SWO', 'AO'),
  getGateHistory
);
router.get(
  '/gate/overdue',
  authenticate,
  authorize('SECURITY', 'WARDEN', 'SWO', 'ADMIN', 'AO', 'EMERGENCY_CONTROL'),
  getOverdueStudents
);
router.get(
  '/gate/students',
  authenticate,
  authorize('SECURITY', 'WARDEN', 'SWO', 'ADMIN', 'AO'),
  searchStudents
);

// Student Location Sharing
router.post('/location/share', authenticate, authorize('STUDENT'), shareMyLocation);
router.post('/location/manual', authenticate, authorize('STUDENT'), shareManualLocation);
router.post('/location/stop', authenticate, authorize('STUDENT'), stopSharingLocation);
router.get('/location/me', authenticate, authorize('STUDENT'), getMyLocationStatus);
router.get(
  '/location/shared',
  authenticate,
  authorize('WARDEN', 'SWO', 'AO', 'SECURITY', 'EMERGENCY_CONTROL', 'ADMIN'),
  getSharedLocations
);

// Notifications
router.get('/notifications', authenticate, getNotifications);
router.put('/notifications/:id/read', authenticate, markNotificationRead);
router.put('/notifications/read-all', authenticate, markAllNotificationsRead);

// Admin Management
router.get('/admin/registration-requests', authenticate, authorize('ADMIN'), getRegistrationRequests);
router.post('/admin/registration-requests/:id/approve', authenticate, authorize('ADMIN'), approveRegistrationRequest);
router.post('/admin/registration-requests/:id/reject', authenticate, authorize('ADMIN'), rejectRegistrationRequest);
router.get('/admin/users', authenticate, authorize('ADMIN'), getAllUsers);
router.post('/admin/students', authenticate, authorize('ADMIN'), createStudentAccount);
router.put('/admin/students/:id', authenticate, authorize('ADMIN'), updateStudentAccount);
router.post('/admin/authorities', authenticate, authorize('ADMIN'), createAuthorityAccount);
router.put('/admin/authorities/:id', authenticate, authorize('ADMIN'), updateAuthorityAccount);
router.put('/admin/users/:id/toggle-active', authenticate, authorize('ADMIN'), toggleUserActive);
router.delete('/admin/users/:id', authenticate, authorize('ADMIN'), deleteUserSafely);
router.get('/admin/audit-logs', authenticate, authorize('ADMIN', 'EMERGENCY_CONTROL'), getAuditLogs);
router.get('/admin/settings', authenticate, authorize('ADMIN', 'WARDEN', 'SWO'), getSettings);
router.put('/admin/settings', authenticate, authorize('ADMIN'), updateSettings);

export default router;
