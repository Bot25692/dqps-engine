import { describe, it, expect } from 'vitest';
import { sealSession, unsealSession } from '../session';

describe('Cryptographic Session Security', () => {
  it('seals and unseals valid session payload with AES-256-GCM authenticated encryption', () => {
    const payload = {
      recommendationId: 'rec_123',
      status: 'executed' as const,
      outcome: {
        id: 'rec_123:outcome',
        recommendation_id: 'rec_123',
        created_at: '2026-03-31T00:00:00.000Z',
        predicted: 300,
        actual: 310,
        error_pct: 3.3,
        horizon_days: 3,
      },
      confidence: {
        recommendation_type: 'budget_reallocation',
        weight: 0.82,
      },
    };

    const token = sealSession(payload);
    expect(typeof token).toBe('string');
    // Ensure it is not plaintext JSON
    expect(token).not.toContain('rec_123');
    expect(token).not.toContain('budget_reallocation');

    const unsealed = unsealSession(token);
    expect(unsealed).not.toBeNull();
    expect(unsealed?.recommendationId).toBe('rec_123');
    expect(unsealed?.status).toBe('executed');
    expect(unsealed?.outcome?.actual).toBe(310);
    expect(unsealed?.confidence?.weight).toBe(0.82);
  });

  it('rejects tampered tokens due to AES-GCM authentication tag mismatch', () => {
    const token = sealSession({
      recommendationId: 'rec_safe',
      status: 'approved' as const,
    });

    // Alter one byte
    const rawBuffer = Buffer.from(token, 'base64url');
    rawBuffer[rawBuffer.length - 2] ^= 0x55;
    const corruptedToken = rawBuffer.toString('base64url');

    expect(unsealSession(corruptedToken)).toBeNull();
  });

  it('rejects payload with invalid schema', () => {
    // Arbitrary base64 string
    expect(unsealSession('invalid-not-even-base64')).toBeNull();
  });
});
