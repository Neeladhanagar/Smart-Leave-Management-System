import { connectDB, disconnectDB } from './config/db.ts';
import { User } from './models/User.ts';
import { normalizePhoneNumber } from './utils/phoneNumbers.ts';

async function migratePhoneNumbers(): Promise<void> {
  await connectDB();
  try {
    const users = await User.find({
      phone: { $exists: true, $nin: ['', null] },
    })
      .select('phone email +phoneNormalized')
      .lean();

    const ownersByPhone = new Map<string, string[]>();
    for (const user of users) {
      const normalized = normalizePhoneNumber(user.phone || '');
      if (!normalized) {
        continue;
      }
      const owners = ownersByPhone.get(normalized) || [];
      owners.push(String(user._id));
      ownersByPhone.set(normalized, owners);
    }

    const duplicateCount = [...ownersByPhone.values()].filter((owners) => owners.length > 1).length;
    if (duplicateCount > 0) {
      throw new Error(
        `Found ${duplicateCount} duplicate normalized phone number(s). Resolve those accounts before rerunning this migration. No records were changed.`
      );
    }

    const operations = users.flatMap((user) => {
      const normalized = normalizePhoneNumber(user.phone || '');
      if (!normalized || user.phoneNormalized === normalized) {
        return [];
      }
      return [{
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { phoneNormalized: normalized } },
        },
      }];
    });

    if (operations.length > 0) {
      await User.bulkWrite(operations);
    }
    await User.collection.createIndex(
      { phoneNormalized: 1 },
      { unique: true, sparse: true, name: 'unique_user_phone_normalized' }
    );
    console.log(`Normalized phone numbers for ${operations.length} user account(s).`);
  } finally {
    await disconnectDB();
  }
}

migratePhoneNumbers().catch((error: unknown) => {
  console.error(
    '[SmartGate Phone Migration]',
    error instanceof Error ? error.message : 'Phone number migration failed.'
  );
  process.exitCode = 1;
});
