import { beforeEach, expect, it, vi } from 'vitest';

import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_PROVIDERS_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';

let localState: Record<string, unknown> = {};

const { localGetMock, localRemoveMock, localSetMock } = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localRemoveMock: vi.fn(),
  localSetMock: vi.fn(),
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
      get: vi.fn(async () => ({})),
      remove: vi.fn(),
      set: vi.fn(),
    },
  },
}));

function pickStateValues(keys?: string | string[]): Record<string, unknown> {
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

function createProvider(id: string) {
  return {
    apiKey: `${id}-secret`,
    baseUrl: `https://${id}.example.com`,
    connectionType: 'openai-compatible' as const,
    createdAt: 1,
    id,
    name: `Provider ${id}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  localState = { [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION };
  localGetMock.mockImplementation(async (keys?: string | string[]) => pickStateValues(keys));
  localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(localState, payload);
  });
  localRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete localState[key];
    }
  });
});

it('keeps local key material until the final encrypted provider secret is deleted', async () => {
  const { clearAIProviderSecret, deleteAIProviderRecord, upsertAIProviderRecord } =
    await import('./core');

  await upsertAIProviderRecord(createProvider('provider-1'));
  await upsertAIProviderRecord(createProvider('provider-2'));
  const keyMaterial = localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY];

  await deleteAIProviderRecord('provider-1');
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBe(keyMaterial);

  await clearAIProviderSecret('provider-2');
  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({ id: 'provider-2', hasStoredApiKey: false }),
  ]);
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({});
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();

  await deleteAIProviderRecord('provider-2');
  expect(localState[AI_PROVIDERS_KEY]).toEqual([]);
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({});
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
});

it('reads only non-empty transparent key material strings from local storage', async () => {
  const { readStoredSecretKeyMaterial } = await import('./provider-secret-keys.store.ts');

  localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY] = '';
  await expect(readStoredSecretKeyMaterial()).resolves.toBeNull();

  localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY] = 42;
  await expect(readStoredSecretKeyMaterial()).resolves.toBeNull();

  localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY] = 'transparent-key-material';
  await expect(readStoredSecretKeyMaterial()).resolves.toBe('transparent-key-material');
});

it('resolves explicit and stored transparent key material without creating replacements', async () => {
  const { createAesGcmKeyMaterial } =
    await import('@sniptale/platform/security/local-secret-crypto');
  const { resolveSecretKey } = await import('./provider-secret-keys.store.ts');
  const keyMaterial = await createAesGcmKeyMaterial();

  await expect(resolveSecretKey(keyMaterial.material)).resolves.toMatchObject({
    created: false,
    material: keyMaterial.material,
  });

  localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY] = keyMaterial.material;
  await expect(resolveSecretKey()).resolves.toMatchObject({
    created: false,
    material: keyMaterial.material,
  });
});

it('creates transparent key material when storage has no usable key', async () => {
  const { resolveSecretKey } = await import('./provider-secret-keys.store.ts');

  await expect(resolveSecretKey()).resolves.toMatchObject({
    created: true,
    material: expect.any(String),
  });
});

it('removes transparent key material only after unprotected secrets are gone', async () => {
  const { removeTransparentKeyIfUnused } = await import('./provider-secret-keys.store.ts');

  localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY] = 'transparent-key-material';

  await removeTransparentKeyIfUnused(1);
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBe('transparent-key-material');

  await removeTransparentKeyIfUnused(0);
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
});
