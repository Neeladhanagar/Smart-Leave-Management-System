import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { Student } from '../models/Student.ts';
import { User } from '../models/User.ts';
import { LeaveApplication } from '../models/LeaveApplication.ts';
import { EmergencyLeave } from '../models/EmergencyLeave.ts';
import { LocationShare, type ILocationShare } from '../models/LocationShare.ts';
import { logAudit } from '../services/auditService.ts';

const AUTHORIZED_TRACKING_ROLES = [
  'WARDEN',
  'SWO',
  'AO',
  'SECURITY',
  'EMERGENCY_CONTROL',
  'ADMIN',
];

interface EligibleLeaveRecord {
  _id: string;
  requestCode: string;
  leaveType: 'REGULAR' | 'EMERGENCY';
  status: string;
  departureDate: Date;
  approvedReturnDate: Date;
  reason: string;
}

/**
 * Automatically expires active location shares whose approved leave return date/time
 * has passed or whose linked leave has completed/returned/been rejected.
 * Also keeps approvedReturnDate in sync when an extension is approved.
 */
export async function expireEndedLocationShares(): Promise<void> {
  const now = new Date();
  const activeShares = await LocationShare.find({ isSharing: true });

  for (const share of activeShares) {
    let shouldExpire = false;
    let reason = 'Approved leave return period ended';

    if (share.leaveRefId && share.leaveType) {
      const leave =
        share.leaveType === 'REGULAR'
          ? await LeaveApplication.findById(share.leaveRefId).lean()
          : await EmergencyLeave.findById(share.leaveRefId).lean();

      if (!leave) {
        shouldExpire = true;
        reason = 'Linked leave application no longer active';
      } else {
        // Sync extended return date or status changes
        share.leaveApprovalStatus = leave.status;
        share.approvedReturnDate = leave.approvedReturnDate;

        if (['RETURNED', 'RETURNED_LATE', 'REJECTED'].includes(leave.status)) {
          shouldExpire = true;
          reason =
            leave.status === 'REJECTED'
              ? 'Linked leave was rejected'
              : `Student leave completed (${leave.status.replace(/_/g, ' ')})`;
        } else if (new Date(leave.approvedReturnDate) <= now) {
          shouldExpire = true;
          reason = 'Approved leave return date/time has passed (tracking expired)';
        }
      }
    } else if (share.approvedReturnDate && new Date(share.approvedReturnDate) <= now) {
      shouldExpire = true;
      reason = 'Approved leave return date/time has passed (tracking expired)';
    }

    if (shouldExpire) {
      share.isSharing = false;
      share.latitude = undefined;
      share.longitude = undefined;
      share.accuracy = undefined;
      share.stoppedAt = now;
      share.expiredReason = reason;
      await share.save();

      await logAudit({
        actorUserId: share.userId,
        actorName: share.studentName,
        actorRole: 'SYSTEM',
        action: 'LOCATION_TRACKING_AUTO_EXPIRED',
        entityType: 'LocationShare',
        entityId: share.leaveRequestCode || share.usn,
        details: `Location sharing automatically stopped for ${share.studentName} (${share.usn}): ${reason}.`,
      });
    } else if (share.isModified()) {
      await share.save();
    }
  }
}

async function fetchEligibleLeavesForUser(userId: string): Promise<EligibleLeaveRecord[]> {
  const now = new Date();
  const [regLeaves, emgLeaves] = await Promise.all([
    LeaveApplication.find({
      userId,
      status: { $in: ['APPROVED', 'EXITED'] },
      approvedReturnDate: { $gt: now },
    })
      .sort({ approvedReturnDate: -1 })
      .lean(),
    EmergencyLeave.find({
      userId,
      status: { $in: ['APPROVED', 'EXITED'] },
      approvedReturnDate: { $gt: now },
    })
      .sort({ approvedReturnDate: -1 })
      .lean(),
  ]);

  const combined: EligibleLeaveRecord[] = [
    ...regLeaves.map((l) => ({
      _id: String(l._id),
      requestCode: l.requestCode,
      leaveType: 'REGULAR' as const,
      status: l.status,
      departureDate: l.departureDate,
      approvedReturnDate: l.approvedReturnDate,
      reason: l.reason,
    })),
    ...emgLeaves.map((l) => ({
      _id: String(l._id),
      requestCode: l.requestCode,
      leaveType: 'EMERGENCY' as const,
      status: l.status,
      departureDate: l.departureDate,
      approvedReturnDate: l.approvedReturnDate,
      reason: l.reason,
    })),
  ];

  return combined.sort(
    (a, b) => new Date(b.approvedReturnDate).getTime() - new Date(a.approvedReturnDate).getTime()
  );
}

async function geocodeManualAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  if (!query.trim()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      query
    )}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SmartGate-Hostel-Management/1.0',
      },
    });
    if (!response.ok) return null;
    const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    if (Array.isArray(results) && results.length > 0 && results[0].lat && results[0].lon) {
      const lat = Number(results[0].lat);
      const lng = Number(results[0].lon);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { lat, lng };
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeShareForResponse(doc: ILocationShare | Record<string, unknown>) {
  const plain = typeof (doc as ILocationShare).toObject === 'function' ? (doc as ILocationShare).toObject() : { ...doc };
  const isSharing = Boolean(plain.isSharing);
  const trackingState = isSharing
    ? 'SHARING'
    : plain.expiredReason && String(plain.expiredReason).toLowerCase().includes('expired')
    ? 'EXPIRED'
    : 'STOPPED';

  return {
    ...plain,
    trackingState,
    // Never expose live coordinates if sharing has stopped or expired
    latitude: isSharing ? plain.latitude : undefined,
    longitude: isSharing ? plain.longitude : undefined,
    accuracy: isSharing ? plain.accuracy : undefined,
  };
}

export async function shareMyLocation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      res.status(403).json({ error: 'Only students can share their location.' });
      return;
    }

    await expireEndedLocationShares();

    const { latitude, longitude, accuracy, leaveRefId, leaveType, address, area, city, landmark } =
      req.body;

    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      res.status(400).json({ error: 'Valid numeric GPS latitude and longitude are required.' });
      return;
    }

    const [student, userDoc, eligibleLeaves] = await Promise.all([
      Student.findOne({ userId: req.user.userId }),
      User.findById(req.user.userId).select('phone name').lean(),
      fetchEligibleLeavesForUser(req.user.userId),
    ]);

    if (!student) {
      res.status(404).json({ error: 'Student profile not found.' });
      return;
    }

    if (eligibleLeaves.length === 0) {
      res.status(400).json({
        error:
          'Location sharing is only available while you have an approved or active leave whose return date/time has not passed.',
      });
      return;
    }

    const chosenLeave = leaveRefId
      ? eligibleLeaves.find(
          (l) => l._id === String(leaveRefId) && (!leaveType || l.leaveType === leaveType)
        )
      : eligibleLeaves[0];

    if (!chosenLeave) {
      res.status(400).json({
        error: 'Selected leave application is not eligible for active location sharing (pending, returned, or expired).',
      });
      return;
    }

    const existing = await LocationShare.findOne({ studentId: student._id });
    const now = new Date();
    const continuingSameSession =
      Boolean(existing?.isSharing) &&
      String(existing?.leaveRefId || '') === chosenLeave._id &&
      Boolean(existing?.sharingStartedAt);

    const record = await LocationShare.findOneAndUpdate(
      { studentId: student._id },
      {
        studentId: student._id,
        userId: req.user.userId,
        studentName: userDoc?.name || req.user.name,
        usn: student.usn,
        phone: userDoc?.phone || student.parentPhone || '',
        department: student.department,
        leaveType: chosenLeave.leaveType,
        leaveRefId: chosenLeave._id,
        leaveRequestCode: chosenLeave.requestCode,
        leaveApprovalStatus: chosenLeave.status,
        approvedReturnDate: chosenLeave.approvedReturnDate,
        isSharing: true,
        source: 'GPS',
        latitude,
        longitude,
        accuracy: typeof accuracy === 'number' ? accuracy : undefined,
        address: address ? String(address).trim() : existing?.address || 'Live Browser GPS Coordinates',
        area: area ? String(area).trim() : undefined,
        city: city ? String(city).trim() : undefined,
        landmark: landmark ? String(landmark).trim() : undefined,
        sharingStartedAt: continuingSameSession ? existing?.sharingStartedAt : now,
        lastUpdatedAt: now,
        sharedAt: now,
        stoppedAt: undefined,
        expiredReason: undefined,
      },
      { upsert: true, new: true }
    );

    if (!continuingSameSession) {
      await logAudit({
        actorUserId: req.user.userId,
        actorName: req.user.name,
        actorRole: 'STUDENT',
        action: 'SHARE_LOCATION_ON',
        entityType: 'LocationShare',
        entityId: chosenLeave.requestCode,
        details: `${req.user.name} (${student.usn}) enabled consent-based GPS sharing for ${chosenLeave.requestCode}.`,
      });
    }

    res.json({
      location: sanitizeShareForResponse(record),
      eligibleLeaves,
      message: 'GPS location sharing is active.',
    });
  } catch (error) {
    console.error('shareMyLocation error:', error);
    res.status(500).json({ error: 'Failed to update shared GPS location.' });
  }
}

export async function shareManualLocation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      res.status(403).json({ error: 'Only students can submit their location.' });
      return;
    }

    await expireEndedLocationShares();

    const { address, area, city, landmark, latitude, longitude, leaveRefId, leaveType } = req.body;
    const cleanAddress = address ? String(address).trim() : '';
    const cleanArea = area ? String(area).trim() : '';
    const cleanCity = city ? String(city).trim() : '';
    const cleanLandmark = landmark ? String(landmark).trim() : '';

    if (!cleanAddress && (!cleanArea || !cleanCity)) {
      res.status(400).json({
        error: 'Please enter a street/place address or both Area and City for manual location sharing.',
      });
      return;
    }

    const [student, userDoc, eligibleLeaves] = await Promise.all([
      Student.findOne({ userId: req.user.userId }),
      User.findById(req.user.userId).select('phone name').lean(),
      fetchEligibleLeavesForUser(req.user.userId),
    ]);

    if (!student) {
      res.status(404).json({ error: 'Student profile not found.' });
      return;
    }

    if (eligibleLeaves.length === 0) {
      res.status(400).json({
        error:
          'Location sharing is only available while you have an approved or active leave whose return date/time has not passed.',
      });
      return;
    }

    const chosenLeave = leaveRefId
      ? eligibleLeaves.find(
          (l) => l._id === String(leaveRefId) && (!leaveType || l.leaveType === leaveType)
        )
      : eligibleLeaves[0];

    if (!chosenLeave) {
      res.status(400).json({
        error: 'Selected leave application is not eligible for location sharing.',
      });
      return;
    }

    let resolvedLat = typeof latitude === 'number' && !Number.isNaN(latitude) ? latitude : undefined;
    let resolvedLng = typeof longitude === 'number' && !Number.isNaN(longitude) ? longitude : undefined;

    if (resolvedLat === undefined || resolvedLng === undefined) {
      const searchStr = [cleanAddress, cleanArea, cleanCity].filter(Boolean).join(', ');
      const geocoded = await geocodeManualAddress(searchStr);
      if (geocoded) {
        resolvedLat = geocoded.lat;
        resolvedLng = geocoded.lng;
      }
    }

    const existing = await LocationShare.findOne({ studentId: student._id });
    const now = new Date();
    const continuingSameSession =
      Boolean(existing?.isSharing) &&
      String(existing?.leaveRefId || '') === chosenLeave._id &&
      Boolean(existing?.sharingStartedAt);

    const record = await LocationShare.findOneAndUpdate(
      { studentId: student._id },
      {
        studentId: student._id,
        userId: req.user.userId,
        studentName: userDoc?.name || req.user.name,
        usn: student.usn,
        phone: userDoc?.phone || student.parentPhone || '',
        department: student.department,
        leaveType: chosenLeave.leaveType,
        leaveRefId: chosenLeave._id,
        leaveRequestCode: chosenLeave.requestCode,
        leaveApprovalStatus: chosenLeave.status,
        approvedReturnDate: chosenLeave.approvedReturnDate,
        isSharing: true,
        source: 'MANUAL',
        latitude: resolvedLat,
        longitude: resolvedLng,
        accuracy: undefined,
        address: cleanAddress || [cleanArea, cleanCity].filter(Boolean).join(', '),
        area: cleanArea,
        city: cleanCity,
        landmark: cleanLandmark,
        sharingStartedAt: continuingSameSession ? existing?.sharingStartedAt : now,
        lastUpdatedAt: now,
        sharedAt: now,
        stoppedAt: undefined,
        expiredReason: undefined,
      },
      { upsert: true, new: true }
    );

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'STUDENT',
      action: 'SHARE_MANUAL_LOCATION',
      entityType: 'LocationShare',
      entityId: chosenLeave.requestCode,
      details: `${req.user.name} (${student.usn}) shared manual location (${[
        cleanAddress,
        cleanArea,
        cleanCity,
      ]
        .filter(Boolean)
        .join(', ')}) for ${chosenLeave.requestCode}.`,
    });

    res.json({
      location: sanitizeShareForResponse(record),
      eligibleLeaves,
      message: 'Manual location shared with authorized authorities.',
    });
  } catch (error) {
    console.error('shareManualLocation error:', error);
    res.status(500).json({ error: 'Failed to save manual location.' });
  }
}

export async function stopSharingLocation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      res.status(403).json({ error: 'Only students can manage their location sharing.' });
      return;
    }

    const now = new Date();
    const record = await LocationShare.findOneAndUpdate(
      { userId: req.user.userId },
      {
        isSharing: false,
        latitude: undefined,
        longitude: undefined,
        accuracy: undefined,
        stoppedAt: now,
        expiredReason: 'Stopped manually by student',
      },
      { new: true }
    );

    await logAudit({
      actorUserId: req.user.userId,
      actorName: req.user.name,
      actorRole: 'STUDENT',
      action: 'SHARE_LOCATION_OFF',
      entityType: 'LocationShare',
      entityId: req.user.userId,
      details: `${req.user.name} stopped location sharing.`,
    });

    res.json({
      location: record ? sanitizeShareForResponse(record) : null,
      message: 'Location Sharing Stopped.',
    });
  } catch (error) {
    console.error('stopSharingLocation error:', error);
    res.status(500).json({ error: 'Failed to stop location sharing.' });
  }
}

export async function getMyLocationStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      res.status(403).json({ error: 'Only students can access personal location controls.' });
      return;
    }

    await expireEndedLocationShares();

    const [locationDoc, eligibleLeaves] = await Promise.all([
      LocationShare.findOne({ userId: req.user.userId }),
      fetchEligibleLeavesForUser(req.user.userId),
    ]);

    res.json({
      location: locationDoc ? sanitizeShareForResponse(locationDoc) : null,
      eligibleLeaves,
    });
  } catch (error) {
    console.error('getMyLocationStatus error:', error);
    res.status(500).json({ error: 'Failed to get location status.' });
  }
}

export async function getSharedLocations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!AUTHORIZED_TRACKING_ROLES.includes(req.user.role)) {
      res.status(403).json({ error: 'You are not authorized to view student live tracking.' });
      return;
    }

    await expireEndedLocationShares();

    const search = String(req.query.search || '').trim().toLowerCase();
    const leaveCode = String(req.query.leaveCode || '').trim().toLowerCase();
    const statusFilter = String(req.query.status || 'ALL').toUpperCase();

    const rawRecords = await LocationShare.find().sort({ lastUpdatedAt: -1, updatedAt: -1 }).lean();
    const allSanitized = rawRecords.map((doc) => sanitizeShareForResponse(doc));

    const summary = {
      total: allSanitized.length,
      activeSharing: allSanitized.filter((r) => r.trackingState === 'SHARING').length,
      stopped: allSanitized.filter((r) => r.trackingState === 'STOPPED').length,
      expired: allSanitized.filter((r) => r.trackingState === 'EXPIRED').length,
    };

    const filtered = allSanitized.filter((loc) => {
      if (statusFilter === 'SHARING' && loc.trackingState !== 'SHARING') return false;
      if (statusFilter === 'STOPPED' && loc.trackingState !== 'STOPPED') return false;
      if (statusFilter === 'EXPIRED' && loc.trackingState !== 'EXPIRED') return false;
      if (statusFilter === 'NOT_SHARING' && loc.trackingState === 'SHARING') return false;

      if (leaveCode) {
        const code = String(loc.leaveRequestCode || '').toLowerCase();
        if (!code.includes(leaveCode)) return false;
      }

      if (search) {
        const hay = [
          loc.studentName,
          loc.usn,
          loc.phone,
          loc.department,
          loc.leaveRequestCode,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(search)) return false;
      }

      return true;
    });

    res.json({ locations: filtered, summary });
  } catch (error) {
    console.error('getSharedLocations error:', error);
    res.status(500).json({ error: 'Failed to load student live tracking records.' });
  }
}
