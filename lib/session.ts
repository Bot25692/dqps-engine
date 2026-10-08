import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { OutcomeSchema } from './types';

export const SessionPayloadSchema = z.strictObject({
  dataset: z.enum(['apparel', 'skincare']).optional(),
  recommendationId: z.string().min(1),
  status: z.enum(['pending', 'approved', 'rejected', 'executed']),
  approvedAt: z.string().optional(),
  outcome: OutcomeSchema.optional(),
  confidence: z.object({
    recommendation_type: z.string().min(1),
    weight: z.number().min(0).max(1),
  }).optional(),
  simulatedAt: z.string().optional(),
  predictedGainPerDay: z.number().finite().optional(),
  predictedTotal: z.number().finite().optional(),
  actualGain: z.number().finite().optional(),
  errorPct: z.number().finite().optional(),
  confidenceUpdate: z.strictObject({
    previousConfidence: z.number().finite(),
    accuracy: z.number().finite(),
    rawStep: z.number().finite(),
    clampedStep: z.number().finite(),
    newConfidence: z.number().finite(),
  }).optional(),
  issuedAt: z.number().int().positive(),
});

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

let ephemeralProdSecret: Buffer | null = null;

function getEncryptionKey(): Buffer {
  const secret = process.env.ADAPT_SESSION_SECRET;
  if (secret && secret.length >= 16) {
    return createHash('sha256').update(secret).digest();
  }

  // Public deployment metadata is not a secret. An unconfigured production
  // instance gets a random key; stable cross-instance sessions require
  // ADAPT_SESSION_SECRET configured by the deployment owner.
  if (process.env.NODE_ENV === 'production') {
    if (!ephemeralProdSecret) {
      ephemeralProdSecret = randomBytes(32);
    }
    return ephemeralProdSecret;
  }

  // Local development / testing fallback only
  return createHash('sha256').update('adapt-dev-secret-only-for-local-testing').digest();
}

/**
 * Seals and encrypts a session payload using AES-256-GCM authenticated encryption.
 * Output format: base64url(iv + authTag + ciphertext)
 */
export function sealSession(payload: Omit<SessionPayload, 'issuedAt'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    issuedAt: Date.now(),
  };

  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for AES-GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const plaintext = Buffer.from(JSON.stringify(fullPayload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine IV (12 bytes) + authTag (16 bytes) + ciphertext
  const combined = Buffer.concat([iv, authTag, ciphertext]);
  return combined.toString('base64url');
}

/**
 * Decrypts and validates an authenticated session token.
 * Returns null if token is corrupted, tampered, expired (>24h), or fails schema validation.
 */
export function unsealSession(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;

  try {
    const combined = Buffer.from(token, 'base64url');
    if (combined.length < 12 + 16 + 1) return null; // Minimum IV + Tag + 1 byte ciphertext

    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    const ciphertext = combined.subarray(28);

    const key = getEncryptionKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const json = JSON.parse(decrypted.toString('utf8'));

    const parsed = SessionPayloadSchema.safeParse(json);
    if (!parsed.success) return null;

    // Reject expired sessions (>24 hours)
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.data.issuedAt > MAX_AGE_MS) {
      return null;
    }

    return parsed.data;
  } catch {
    // Decryption or tag verification failed -> tampered or corrupted
    return null;
  }
}
