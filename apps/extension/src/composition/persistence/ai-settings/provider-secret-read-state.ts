import { createLogger } from '@sniptale/platform/observability/logger';
import { importAesGcmKey } from '@sniptale/platform/security/local-secret-crypto';
import { readStoredSecretKeyMaterial } from './provider-secret-keys.store.ts';
import { assertUnprotectedLegacyAccess } from './provider-secret-keys.store.ts';
import { SecretProtectionLockedError } from '../secret-protection/model';

const logger = createLogger({ namespace: 'SharedAiStorage' });

export type AIProviderSecretReadState =
  | { status: 'ok'; secret: string }
  | { status: 'missing' }
  | { status: 'locked' }
  | { status: 'key-missing' }
  | { status: 'corrupt'; error: unknown };

export async function readProviderSecretKeyState(
  operationKey?: CryptoKey | null
): Promise<
  | { status: 'ok'; key: CryptoKey }
  | { status: 'locked' }
  | { status: 'key-missing' }
  | { status: 'corrupt'; error: unknown }
> {
  if (operationKey) return { status: 'ok', key: operationKey };
  if (operationKey === undefined) {
    try {
      await assertUnprotectedLegacyAccess();
    } catch (error) {
      if (error instanceof SecretProtectionLockedError) return { status: 'locked' };
      throw error;
    }
  }

  const keyMaterial = await readStoredSecretKeyMaterial();
  if (!keyMaterial) {
    return { status: 'key-missing' };
  }

  try {
    return { status: 'ok', key: await importAesGcmKey(keyMaterial) };
  } catch (error) {
    return { status: 'corrupt', error };
  }
}

export function readPlaintextProviderSecretFromState(
  providerId: string,
  state: AIProviderSecretReadState
): string | null {
  if (state.status === 'ok') {
    return state.secret;
  }

  if (state.status === 'key-missing') {
    logger.warn('Encrypted AI provider secret is missing key material', { providerId });
    return null;
  }

  if (state.status === 'corrupt') {
    logger.error('Failed to decrypt AI provider secret', {
      error: state.error,
      providerId,
    });
  }

  return null;
}
