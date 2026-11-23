import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, type UserRole } from '../models/User.ts';
import { getJwtSecret } from '../utils/secrets.ts';

export interface AuthUserPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

export function signAuthToken(payload: AuthUserPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '12h' });
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }

    const decoded = jwt.verify(token, getJwtSecret()) as AuthUserPayload;
    const userDoc = await User.findById(decoded.userId).select('name email role department isActive accountStatus');

    if (!userDoc || !userDoc.isActive || !['ACTIVE', 'APPROVED'].includes(userDoc.accountStatus)) {
      res.status(401).json({ error: 'Account is inactive or no longer exists.' });
      return;
    }

    req.user = {
      userId: String(userDoc._id),
      email: userDoc.email,
      name: userDoc.name,
      role: userDoc.role as UserRole,
      department: userDoc.department,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Role '${req.user.role}' is not authorized for this resource.`,
      });
      return;
    }
    next();
  };
}
