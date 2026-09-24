import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { config } from '../config';
import { RepositoryError } from '../repositories/contracts';

function key(): Buffer {
  if (!config.checkpointTokenSecret) {
    throw new RepositoryError(
      'CHECKPOINT_TOKEN_SECRET_REQUIRED',
      'CHECKPOINT_TOKEN_SECRET wajib dikonfigurasi untuk token QR PostgreSQL.',
      503,
    );
  }
  return createHash('sha256').update(config.checkpointTokenSecret).digest();
}

export function encryptCheckpointToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptCheckpointToken(payload: string | null | undefined): string {
  if (!payload) return '';
  try {
    const [ivRaw, tagRaw, encryptedRaw] = payload.split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw) return '';
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new RepositoryError(
      'CHECKPOINT_TOKEN_DECRYPT_FAILED',
      'Secure token QR tidak dapat dibaca. Periksa CHECKPOINT_TOKEN_SECRET.',
      503,
    );
  }
}
