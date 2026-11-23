import { User } from '../models/User.ts';

export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

export async function userPhoneAlreadyExists(
  phone: string,
  excludedUserId?: string
): Promise<boolean> {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) {
    return false;
  }

  const excluded = excludedUserId ? { _id: { $ne: excludedUserId } } : {};
  if (await User.exists({ phoneNormalized: normalized, ...excluded })) {
    return true;
  }

  const legacyUsers = await User.find({
    phone: { $exists: true, $nin: ['', null] },
    phoneNormalized: { $exists: false },
    ...excluded,
  })
    .select('phone')
    .lean();

  return legacyUsers.some((user) => normalizePhoneNumber(user.phone || '') === normalized);
}
