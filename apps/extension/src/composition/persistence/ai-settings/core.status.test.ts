import { beforeEach, expect, it, vi } from 'vitest';

import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDER_STORAGE_MIGRATION_PHASE,
  AI_SECRET_PROTECTION_KEY,
  AI_SECRET_PROTECTION_TRANSITION_KEY,
  AI_STORAGE_MIGRATION_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';

const { localGetMock, localRemoveMock, sessionRemoveMock } = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localRemoveMock: vi.fn(),
  sessionRemoveMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: {
      get: localGetMock,
      remove: localRemoveMock,
    },
    session: {
      remove: sessionRemoveMock,
    },
  },
}));

let localState: Record<string, unknown> = {};

function createTransition(phase: 'pending-disable' | 'pending-enable' | 'pending-reset') {
  return { phase, startedAt: 1, version: 1 };
}

function pickLocalValues(keys?: string | string[]): Record<string, unknown> {
  if (!keys) {
    return { ...localState };
  }

  const requestedKeys = Array.isArray(keys) ? keys : [keys];
  return requestedKeys.reduce<Record<string, unknown>>((result, key) => {
    if (key in localState) {
      result[key] = localState[key];
    }
    return result;
  }, {});
}

function installStorageState(local: Record<string, unknown>) {
  localState = { ...local };
  localGetMock.mockImplementation(async (keys?: string | string[]) => pickLocalValues(keys));
  localRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete localState[key];
    }
  });
  sessionRemoveMock.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  installStorageState({
    [AI_STORAGE_MIGRATION_PHASE_KEY]: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
    [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
  });
});

it('reads AI secret protection status through the initialized core facade', async () => {
  const { loadAISecretProtectionStatus } = await import('./core');

  await expect(loadAISecretProtectionStatus()).resolves.toEqual({
    isEnabled: false,
    isUnlocked: true,
    mode: 'transparent',
  });
});

it('recovers interrupted passphrase transitions before reading protection status', async () => {
  const { createAISecretPassphraseProtection } = await import('./secret-protection.store.ts');
  const protection = await createAISecretPassphraseProtection('passphrase');
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: null,
    [AI_SECRET_PROTECTION_KEY]: protection.protection,
    [AI_SECRET_PROTECTION_TRANSITION_KEY]: createTransition('pending-enable'),
    [AI_STORAGE_MIGRATION_PHASE_KEY]: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
    [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
  });

  const { loadAISecretProtectionStatus } = await import('./core');

  await expect(loadAISecretProtectionStatus()).resolves.toEqual({
    isEnabled: true,
    isUnlocked: false,
    mode: 'passphrase',
  });
  expect(localState[AI_SECRET_PROTECTION_KEY]).toEqual(protection.protection);
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
  expect(localState[AI_SECRET_PROTECTION_TRANSITION_KEY]).toBeUndefined();
});
