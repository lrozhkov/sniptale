import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
const { localGetMock, localRemoveMock, localSetMock, syncGetMock, syncRemoveMock, syncSetMock } =
  vi.hoisted(() => ({
    localGetMock: vi.fn(),
    localRemoveMock: vi.fn(),
    localSetMock: vi.fn(),
    syncGetMock: vi.fn(),
    syncRemoveMock: vi.fn(),
    syncSetMock: vi.fn(),
  }));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: {
      get: localGetMock,
      remove: localRemoveMock,
      set: localSetMock,
    },
    sync: {
      get: syncGetMock,
      remove: syncRemoveMock,
      set: syncSetMock,
    },
  },
}));

function createStoredProvider(id = 'provider-1') {
  return {
    id,
    name: `Provider ${id}`,
    connectionType: 'openai-compatible' as const,
    baseUrl: `https://${id}.example.com`,
    hasStoredApiKey: true,
    createdAt: 1,
  };
}

function createProviderInput(id = 'provider-1') {
  return {
    id,
    name: `Provider ${id}`,
    connectionType: 'openai-compatible' as const,
    baseUrl: `https://${id}.example.com`,
    apiKey: `${id}-secret`,
    createdAt: 1,
  };
}

let localState: Record<string, unknown> = {};
let syncState: Record<string, unknown> = {};

function pickStateValues(
  state: Record<string, unknown>,
  keys?: string | string[]
): Record<string, unknown> {
  if (!keys) {
    return { ...state };
  }

  const requestedKeys = Array.isArray(keys) ? keys : [keys];
  return requestedKeys.reduce<Record<string, unknown>>((result, key) => {
    if (key in state) {
      result[key] = state[key];
    }
    return result;
  }, {});
}

function installStorageState({
  local = {},
  sync = {},
}: {
  local?: Record<string, unknown>;
  sync?: Record<string, unknown>;
}) {
  localState = { ...local };
  syncState = { ...sync };

  localGetMock.mockImplementation(async (keys?: string | string[]) =>
    pickStateValues(localState, keys)
  );
  localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(localState, payload);
  });
  localRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete localState[key];
    }
  });
  syncGetMock.mockImplementation(async (keys?: string | string[]) =>
    pickStateValues(syncState, keys)
  );
  syncSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(syncState, payload);
  });
  syncRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete syncState[key];
    }
  });
}

function resetAiStorageProviderSecretMocks() {
  vi.clearAllMocks();
  vi.resetModules();
  installStorageState({});
}

async function verifyProviderSecretLifecycle() {
  installStorageState({
    local: {
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    },
  });

  const { deleteAIProviderRecord, loadAIProviderSecret, loadAIProviders, upsertAIProviderRecord } =
    await import('./core');

  await upsertAIProviderRecord({
    ...createProviderInput('provider-1'),
  });
  await expect(loadAIProviders()).resolves.toEqual([
    expect.objectContaining({
      ...createStoredProvider('provider-1'),
      incarnation: expect.any(String),
      revision: 1,
      credentialRevision: 1,
    }),
  ]);
  await expect(loadAIProviderSecret('provider-1')).resolves.toBe('provider-1-secret');
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toEqual(expect.any(String));

  await upsertAIProviderRecord({
    id: 'provider-1',
    name: 'Updated provider',
    connectionType: 'openai-compatible',
    baseUrl: 'https://provider-1.example.com',
    createdAt: 1,
  });
  await expect(loadAIProviders()).resolves.toEqual([
    expect.objectContaining({
      ...createStoredProvider('provider-1'),
      name: 'Updated provider',
      revision: 2,
      credentialRevision: 1,
    }),
  ]);
  await expect(loadAIProviderSecret('provider-1')).resolves.toBe('provider-1-secret');

  await upsertAIProviderRecord({
    id: 'provider-1',
    name: 'Updated provider',
    connectionType: 'openai-compatible',
    baseUrl: 'https://provider-1.example.com',
    createdAt: 1,
    apiKey: 'rotated-secret',
  });
  await expect(loadAIProviderSecret('provider-1')).resolves.toBe('rotated-secret');

  await deleteAIProviderRecord('provider-1');
  await expect(loadAIProviders()).resolves.toEqual([]);
  await expect(loadAIProviderSecret('provider-1')).resolves.toBeNull();
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
}

describe('AI provider secret lifecycle', () => {
  beforeEach(resetAiStorageProviderSecretMocks);
  it(
    'encrypts, preserves, rotates and deletes protected provider secrets',
    verifyProviderSecretLifecycle
  );
});
