import { browserStorage } from '../infrastructure/browser-storage';
import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_SECRET_PROTECTION_KEY,
  AI_SECRET_PROTECTION_TRANSITION_KEY,
} from './constants';
import {
  lockStoredAISecretPassphrase,
  readStoredAISecretProtection,
} from './secret-protection.store.ts';

const SECRET_PROTECTION_TRANSITION_VERSION = 1;

type StoredAISecretProtectionTransition = {
  phase: 'pending-disable' | 'pending-enable' | 'pending-reset';
  startedAt: number;
  version: 1;
};

export type AISecretProtectionTransitionPhase = StoredAISecretProtectionTransition['phase'];

function isStoredAISecretProtectionTransition(
  value: unknown
): value is StoredAISecretProtectionTransition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as StoredAISecretProtectionTransition).version ===
      SECRET_PROTECTION_TRANSITION_VERSION &&
    ((value as StoredAISecretProtectionTransition).phase === 'pending-disable' ||
      (value as StoredAISecretProtectionTransition).phase === 'pending-enable' ||
      (value as StoredAISecretProtectionTransition).phase === 'pending-reset') &&
    typeof (value as StoredAISecretProtectionTransition).startedAt === 'number'
  );
}

function isStoredString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export async function beginStoredAISecretProtectionTransition(
  phase: AISecretProtectionTransitionPhase
): Promise<void> {
  await browserStorage.local.set({
    [AI_SECRET_PROTECTION_TRANSITION_KEY]: {
      phase,
      startedAt: Date.now(),
      version: SECRET_PROTECTION_TRANSITION_VERSION,
    } satisfies StoredAISecretProtectionTransition,
  });
}

export async function finishStoredAISecretProtectionTransitionCleanup(
  keys: string | string[]
): Promise<void> {
  const keysToRemove = Array.isArray(keys) ? keys : [keys];
  await browserStorage.local.remove([...keysToRemove, AI_SECRET_PROTECTION_TRANSITION_KEY]);
}

export async function recoverStoredAISecretPassphraseProtectionTransition(): Promise<void> {
  const result = await browserStorage.local.get([
    AI_LOCAL_SECRET_KEY_STORAGE_KEY,
    AI_SECRET_PROTECTION_KEY,
    AI_SECRET_PROTECTION_TRANSITION_KEY,
  ]);
  const transition = result[AI_SECRET_PROTECTION_TRANSITION_KEY];
  if (!isStoredAISecretProtectionTransition(transition)) {
    if (transition !== undefined) {
      await browserStorage.local.remove(AI_SECRET_PROTECTION_TRANSITION_KEY);
    }
    return;
  }

  await recoverKnownSecretProtectionTransition({
    hasProtection: (await readStoredAISecretProtection()) !== null,
    hasTransparentKey: isStoredString(result[AI_LOCAL_SECRET_KEY_STORAGE_KEY]),
    protectionValue: result[AI_SECRET_PROTECTION_KEY],
    transition,
  });
}

async function recoverKnownSecretProtectionTransition(args: {
  hasProtection: boolean;
  hasTransparentKey: boolean;
  protectionValue: unknown;
  transition: StoredAISecretProtectionTransition;
}): Promise<void> {
  if (args.transition.phase === 'pending-disable') {
    await recoverPendingDisable(args.hasProtection, args.hasTransparentKey);
    return;
  }

  if (args.transition.phase === 'pending-enable') {
    await recoverPendingEnable(args.hasProtection);
    return;
  }

  await recoverPendingReset(args);
}

async function recoverPendingDisable(
  hasProtection: boolean,
  hasTransparentKey: boolean
): Promise<void> {
  if (hasProtection) {
    await browserStorage.local.remove(
      hasTransparentKey
        ? [AI_LOCAL_SECRET_KEY_STORAGE_KEY, AI_SECRET_PROTECTION_TRANSITION_KEY]
        : AI_SECRET_PROTECTION_TRANSITION_KEY
    );
    return;
  }

  await lockStoredAISecretPassphrase();
  await finishStoredAISecretProtectionTransitionCleanup(AI_SECRET_PROTECTION_KEY);
}

async function recoverPendingEnable(hasProtection: boolean): Promise<void> {
  if (hasProtection) {
    await finishStoredAISecretProtectionTransitionCleanup(AI_LOCAL_SECRET_KEY_STORAGE_KEY);
    return;
  }

  await browserStorage.local.remove(AI_SECRET_PROTECTION_TRANSITION_KEY);
}

async function recoverPendingReset(args: {
  hasProtection: boolean;
  hasTransparentKey: boolean;
  protectionValue: unknown;
}): Promise<void> {
  if (!args.hasProtection && !args.hasTransparentKey && args.protectionValue !== undefined) {
    await lockStoredAISecretPassphrase();
    await finishStoredAISecretProtectionTransitionCleanup([
      AI_LOCAL_SECRET_KEY_STORAGE_KEY,
      AI_SECRET_PROTECTION_KEY,
    ]);
    return;
  }

  await browserStorage.local.remove(AI_SECRET_PROTECTION_TRANSITION_KEY);
}
