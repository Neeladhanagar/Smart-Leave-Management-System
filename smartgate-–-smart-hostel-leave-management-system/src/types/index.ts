export type UserRole =
  | 'STUDENT'
  | 'COORDINATOR'
  | 'MENTOR'
  | 'HOD'
  | 'SWO'
  | 'WARDEN'
  | 'AO'
  | 'SECURITY'
  | 'ADMIN'
  | 'EMERGENCY_CONTROL';

export type RegistrationRole = Exclude<UserRole, 'ADMIN'>;

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  department?: string;
  isActive: boolean;
  accountStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'SUSPENDED' | 'PENDING_ACTIVATION' | 'DEACTIVATED';
  lastLoginAt?: string;
}

export interface StudentProfile {
  _id: string;
  userId: string;
  usn: string;
  department: string;
  semester: number;
  section: string;
  hostelBlock: string;
  roomNumber: string;
  parentName?: string;
  parentPhone: string;
  approvedRegularDaysInSem?: number;
}

export interface AuthorityProfile {
  _id: string;
  userId: string;
  employeeId: string;
  role: UserRole;
  department?: string;
  designation: string;
  officeLocation?: string;
  assignedHostelBlock?: string;
  hostelName?: string;
  assignedSection?: string;
  assignedStudentGroups?: string[];
  assignedGate?: string;
  dutyLocation?: string;
  shift?: string;
  assignedControlCentre?: string;
  administrativePermissions?: string[];
}

export interface AppSettings {
  collegeName: string;
  hostelName: string;
  hodThresholdDays: number;
  currentSemesterLabel: string;
  allowLateExtensions: boolean;
  qrValidityBufferMinutes: number;
}

export interface ApprovalHistoryItem {
  _id: string;
  leaveType: string;
  targetId: string;
  requestCode: string;
  stage: string;
  action: string;
  actorName: string;
  actorRole: string;
  remarks?: string;
  timestamp: string;
}

export interface QRPass {
  _id: string;
  passId: string;
  leaveType: 'REGULAR' | 'EMERGENCY';
  leaveRefId: string;
  leaveRequestCode: string;
  studentId: string;
  userId: string;
  studentName: string;
  usn: string;
  department: string;
  departureDate: string;
  approvedReturnDate: string;
  verificationToken: string;
  qrPayload: string;
  qrImageDataUrl: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'USED';
  revokedReason?: string;
  revokedAt?: string;
  replacedByPassId?: string;
  issuedBy: string;
  createdAt: string;
}

export interface LeaveApplication {
  _id: string;
  requestCode: string;
  studentId: string;
  userId: string;
  studentName: string;
  usn: string;
  department: string;
  semester: number;
  section: string;
  reason: string;
  departureDate: string;
  expectedReturnDate: string;
  approvedReturnDate: string;
  parentContact: string;
  documentUrl?: string;
  documentName?: string;
  status: string;
  hodRequired: boolean;
  previousApprovedDaysInSem: number;
  currentStage: string;
  rejectionReason?: string;
  rejectedByRole?: string;
  overdueAt?: string;
  activeQrPassId?: QRPass | string;
  history?: ApprovalHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface EmergencyLeave {
  _id: string;
  requestCode: string;
  studentId: string;
  userId: string;
  studentName: string;
  usn: string;
  department: string;
  semester: number;
  section: string;
  emergencyType: string;
  reason: string;
  departureDate: string;
  expectedReturnDate: string;
  approvedReturnDate: string;
  parentContact: string;
  documentUrl?: string;
  documentName?: string;
  status: string;
  aoRemarks?: string;
  aoDecidedAt?: string;
  overdueAt?: string;
  activeQrPassId?: QRPass | string;
  history?: ApprovalHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DecisionRecord {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  remarks?: string;
  decidedByName?: string;
  decidedAt?: string;
}

export interface LeaveExtension {
  _id: string;
  extensionCode: string;
  leaveId: string;
  leaveRequestCode: string;
  studentName: string;
  usn: string;
  department: string;
  originalReturnDate: string;
  requestedReturnDate: string;
  reason: string;
  documentUrl?: string;
  documentName?: string;
  isLateExtension: boolean;
  extensionTag: 'STANDARD_EXTENSION' | 'LATE_EXTENSION_REQUEST';
  status: 'PENDING_SWO' | 'PENDING_WARDEN' | 'APPROVED' | 'REJECTED';
  swoDecision: DecisionRecord;
  wardenDecision: DecisionRecord;
  createdAt: string;
}

export interface EmergencyLeaveExtension {
  _id: string;
  extensionCode: string;
  emergencyLeaveId: string;
  leaveRequestCode: string;
  studentName: string;
  usn: string;
  department: string;
  originalReturnDate: string;
  requestedReturnDate: string;
  reason: string;
  documentUrl?: string;
  documentName?: string;
  isLateExtension: boolean;
  extensionTag: 'STANDARD_EXTENSION' | 'LATE_EXTENSION_REQUEST';
  status: 'PENDING_AO' | 'APPROVED' | 'REJECTED';
  aoDecision: DecisionRecord;
  createdAt: string;
}

export interface GateActivity {
  _id: string;
  passId: string;
  leaveType: 'REGULAR' | 'EMERGENCY';
  leaveRefId: string;
  leaveRequestCode: string;
  studentName: string;
  usn: string;
  department: string;
  exitTime?: string;
  exitRecordedByName?: string;
  exitRemarks?: string;
  returnTime?: string;
  returnRecordedByName?: string;
  returnRemarks?: string;
  isLateReturn: boolean;
  lateReturnReason?: string;
  lateReturnAuthorized: boolean;
  status: 'EXITED' | 'RETURNED' | 'RETURNED_LATE';
  updatedAt: string;
}

export interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  category: string;
  relatedId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface LocationShareItem {
  _id: string;
  studentId: string;
  studentName: string;
  usn: string;
  phone?: string;
  department: string;
  leaveType?: 'REGULAR' | 'EMERGENCY';
  leaveRefId?: string;
  leaveRequestCode?: string;
  leaveApprovalStatus?: string;
  approvedReturnDate?: string;
  isSharing: boolean;
  trackingState?: 'SHARING' | 'STOPPED' | 'EXPIRED';
  source?: 'GPS' | 'MANUAL';
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  address?: string;
  area?: string;
  city?: string;
  landmark?: string;
  sharingStartedAt?: string;
  lastUpdatedAt?: string;
  sharedAt?: string;
  stoppedAt?: string;
  expiredReason?: string;
}

export interface EligibleTrackingLeave {
  _id: string;
  requestCode: string;
  leaveType: 'REGULAR' | 'EMERGENCY';
  status: string;
  departureDate: string;
  approvedReturnDate: string;
  reason: string;
}

export interface LocationTrackingSummary {
  total: number;
  activeSharing: number;
  stopped: number;
  expired: number;
}

export interface AuditLogItem {
  _id: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: string;
  createdAt: string;
}
