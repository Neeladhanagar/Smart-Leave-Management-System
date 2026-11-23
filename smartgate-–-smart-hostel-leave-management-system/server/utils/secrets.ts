import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface SecretStore {
  jwtSecret: string;
  qrSecret: string;
}

let cachedSecrets: SecretStore | null = null;

function loadOrCreateDevSecrets(): SecretStore {
  if (cachedSecrets) return cachedSecrets;

  const envJwt = process.env.JWT_SECRET?.trim();
  const envQr = process.env.QR_SIGNING_SECRET?.trim();

  if (envJwt && envQr) {
    cachedSecrets = { jwtSecret: envJwt, qrSecret: envQr };
    return cachedSecrets;
  }

  const secretFile = path.resolve(process.cwd(), '.smartgate-secrets.local.json');
  try {
    if (fs.existsSync(secretFile)) {
      const parsed = JSON.parse(fs.readFileSync(secretFile, 'utf8'));
      if (parsed.jwtSecret && parsed.qrSecret) {
        cachedSecrets = {
          jwtSecret: envJwt || parsed.jwtSecret,
          qrSecret: envQr || parsed.qrSecret,
        };
        return cachedSecrets;
      }
    }
  } catch {
    // Regenerate below if unreadable
  }

  const generated: SecretStore = {
    jwtSecret: envJwt || crypto.randomBytes(48).toString('hex'),
    qrSecret: envQr || crypto.randomBytes(48).toString('hex'),
  };

  try {
    fs.writeFileSync(secretFile, JSON.stringify(generated, null, 2), { mode: 0o600 });
  } catch {
    // Non-fatal if read-only filesystem
  }

  cachedSecrets = generated;
  return cachedSecrets;
}

export function getJwtSecret(): string {
  return loadOrCreateDevSecrets().jwtSecret;
}

export function getQrSigningSecret(): string {
  return loadOrCreateDevSecrets().qrSecret;
}
