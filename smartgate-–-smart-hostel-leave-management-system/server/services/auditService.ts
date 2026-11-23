import { Types } from 'mongoose';
import { ApprovalHistory } from '../models/ApprovalHistory.ts';
import { AuditLog } from '../models/AuditLog.ts';

export async function logApprovalHistory(params: {
  leaveType: 'REGULAR' | 'EMERGENCY' | 'REGULAR_EXTENSION' | 'EMERGENCY_EXTENSION';
  targetId: string | Types.ObjectId;
  requestCode: string;
  stage: string;
  action: string;
  actorUserId?: string | Types.ObjectId;
  actorName: string;
  actorRole: string;
  remarks?: string;
}): Promise<void> {
  await ApprovalHistory.create({
    leaveType: params.leaveType,
    targetId: params.targetId,
    requestCode: params.requestCode,
    stage: params.stage,
    action: params.action,
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    remarks: params.remarks,
    timestamp: new Date(),
  });
}

export async function logAudit(params: {
  actorUserId?: string | Types.ObjectId;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: string;
}): Promise<void> {
  await AuditLog.create({
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    details: params.details,
  });
}
