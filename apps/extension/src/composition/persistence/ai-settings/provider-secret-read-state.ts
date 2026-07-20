import { createLogger } from '@sniptale/platform/observability/logger';
import { importAesGcmKey } from '@sniptale/platform/security/local-secret-crypto';
import { readStoredSecretKeyMaterial } from './provider-secret-keys.store.ts';
import {
  readStoredAISecretProtection,
  readUnlockedAISecretPassphraseKey,
} from './secret-protection.store.ts';

const logger = createLogger({ namespace: 'SharedAiStorage' });

export type AIProviderSecretReadState =
  | { status: 'ok'; secret: string }
  | { status: 'missing' }
  | { status: 'locked' }
  | { status: 'key-missing' }
  | { status: 'corrupt'; error: unknown };

export async function readProviderSecretKeyState(): Promise<
  | { status: 'ok'; key: CryptoKey }
  | { status: 'locked' }
  | { status: 'key-missing' }
  | { status: 'corrupt'; error: unknown }
> {
  const protection = await readStoredAISecretProtection();
  if (protection) {
    const key = await readUnlockedAISecretPassphraseKey();
    return key ? { status: 'ok', key } : { status: 'locked' };
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
