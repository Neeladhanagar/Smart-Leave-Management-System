import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from './config/db.ts';
import { User } from './models/User.ts';
import { logAudit } from './services/auditService.ts';

function isStrongPassword(password: string): boolean {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

async function provisionFirstAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || '';
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set a valid BOOTSTRAP_ADMIN_EMAIL.');
  }
  if (!isStrongPassword(password)) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters with uppercase, lowercase, a number, and a symbol.');
  }

  await connectDB();
  try {
    if (await User.exists({ role: 'ADMIN' })) {
      throw new Error('A System Admin already exists; bootstrap is only allowed once.');
    }
    if (await User.exists({ email })) {
      throw new Error('That email is already assigned to an account; choose a different bootstrap email.');
    }

    const user = await User.create({
      name: 'System Administrator',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'ADMIN',
      department: 'ALL',
      isActive: true,
      accountStatus: 'ACTIVE',
    });

    await logAudit({
      actorUserId: user._id,
      actorName: user.name,
      actorRole: 'ADMIN',
      action: 'BOOTSTRAP_ADMIN',
      entityType: 'User',
      entityId: String(user._id),
      details: 'Provisioned the first System Admin through the secure bootstrap command.',
    });
    console.log(`Provisioned the first System Admin account: ${email}`);
  } finally {
    await disconnectDB();
  }
}

provisionFirstAdmin().catch((error: unknown) => {
  console.error(
    '[SmartGate Admin Bootstrap]',
    error instanceof Error ? error.message : 'Failed to provision System Admin.'
  );
  process.exitCode = 1;
});
