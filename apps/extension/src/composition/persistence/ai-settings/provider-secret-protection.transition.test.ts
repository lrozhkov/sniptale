import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
vi.mock('../secret-protection/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../secret-protection/service')>();
  const { SecretProtectionAdmissionPermit, SecretProtectionLockedError } =
    await import('../secret-protection/model');
  const { readPreparedSecretProtectionControl } =
    await import('../secret-protection/transition.store');
  const withSecretProtectionWriter: typeof actual.withSecretProtectionWriter = async (
    operation,
    permit
  ) => {
    const control = await readPreparedSecretProtectionControl();
    if (control?.phase === 'transitioning') throw new SecretProtectionLockedError();
    if (permit) {
      if (!SecretProtectionAdmissionPermit.isActive(permit))
        throw new SecretProtectionLockedError();
      return operation(permit);
    }
    return SecretProtectionAdmissionPermit.run(operation);
  };
  return { ...actual, withSecretProtectionWriter };
});

import { beforeEach, expect, it, vi } from 'vitest';

import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_SECRET_PROTECTION_KEY,
} from './constants';
import {
  createAesGcmKeyMaterial,
  encryptSecret,
} from '@sniptale/platform/security/local-secret-crypto';

let localState: Record<string, unknown> = {};
let sessionState: Record<string, unknown> = {};

const { localGetMock, localRemoveMock, localSetMock, sessionRemoveMock } = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localRemoveMock: vi.fn(),
  localSetMock: vi.fn(),
  sessionRemoveMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: {
      get: localGetMock,
      remove: localRemoveMock,
      set: localSetMock,
    },
    session: {
      get: vi.fn(async () => ({})),
      remove: sessionRemoveMock,
      set: vi.fn(),
    },
  },
}));

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

function installStorageState(state: Record<string, unknown>) {
  localState = { ...state };
  sessionState = {};
  localGetMock.mockImplementation(async (keys?: string | string[]) => pickLocalValues(keys));
  localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(localState, payload);
  });
  localRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete localState[key];
    }
  });
  sessionRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete sessionState[key];
    }
  });
}

function createStoredProvider() {
  return {
    baseUrl: 'https://provider.example.com',
    connectionType: 'openai-compatible' as const,
    createdAt: 1,
    hasStoredApiKey: true,
    id: 'provider-1',
    name: 'Provider',
  };
}

async function installTransparentProviderSecret(secret: string) {
  const key = await createAesGcmKeyMaterial();
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: key.material,
    [AI_PROVIDERS_KEY]: [createStoredProvider()],
    [AI_PROVIDER_SECRETS_KEY]: {
      'provider-1': await encryptSecret(secret, key.key),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  installStorageState({});
});

async function prepareProtection(passphrase = 'shared phrase') {
  const { createSecretProtectionProfile } = await import('../secret-protection/profile.store');
  const { createAISecretProtectionParticipant } =
    await import('./provider-secret-protection.store');
  const profile = await createSecretProtectionProfile(passphrase);
  const participant = createAISecretProtectionParticipant();
  const prepared = await participant.prepare({
    action: 'protect',
    sourceKey: null,
    targetKey: profile.key,
    sourceProfileBinding: null,
    targetProfileBinding: 'target',
  });
  return { ...profile, participant, prepared };
}

it('prepares ciphertext without retaining a source transparent decryption key', async () => {
  await installTransparentProviderSecret('provider-canary');
  const sourceKey = localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY];
  const before = structuredClone(localState);
  const selected = await prepareProtection();
  expect(localState).toEqual(before);
  expect(JSON.stringify(selected.prepared.payload)).not.toContain('provider-canary');
  expect(JSON.stringify(selected.prepared.payload)).not.toContain(sourceKey);
  expect(JSON.stringify(selected.prepared.payload)).not.toContain('shared phrase');
});

it('publishes participant ciphertext and the common profile in one browser storage set', async () => {
  await installTransparentProviderSecret('provider-secret');
  const selected = await prepareProtection();
  localSetMock.mockClear();
  await selected.participant.apply(selected.prepared, undefined, selected.profile);
  expect(localSetMock).toHaveBeenCalledOnce();
  expect(localSetMock.mock.calls[0]?.[0]).toMatchObject({
    [AI_SECRET_PROTECTION_KEY]: selected.profile,
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: null,
  });
  const { loadStoredAIProviderSecret } = await import('./provider-secrets.store');
  await expect(loadStoredAIProviderSecret('provider-1', selected.key)).resolves.toBe(
    'provider-secret'
  );
  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBeNull();
});

it('replays an exact decided target without decrypting its secret again', async () => {
  await installTransparentProviderSecret('provider-secret');
  const selected = await prepareProtection();
  await selected.participant.apply(selected.prepared, undefined, selected.profile);
  const target = structuredClone(localState);
  await selected.participant.apply(selected.prepared, undefined, selected.profile);
  expect(localState).toEqual(target);
});

it('rejects a delayed target after another participant writer replaces source identity', async () => {
  await installTransparentProviderSecret('provider-secret');
  const selected = await prepareProtection();
  localState[AI_PROVIDERS_KEY] = [];
  const before = structuredClone(localState);
  await expect(
    selected.participant.apply(selected.prepared, undefined, selected.profile)
  ).rejects.toThrow('admission refused');
  expect(localState).toEqual(before);
});

it('converts only AI participant ciphertext back to transparent local encryption', async () => {
  await installTransparentProviderSecret('provider-secret');
  const selected = await prepareProtection();
  await selected.participant.apply(selected.prepared, undefined, selected.profile);
  const prepared = await selected.participant.prepare({
    action: 'unprotect',
    sourceKey: selected.key,
    targetKey: null,
    sourceProfileBinding: 'profile',
    targetProfileBinding: 'profile',
  });
  await selected.participant.apply(prepared, undefined, selected.profile);
  expect(localState[AI_SECRET_PROTECTION_KEY]).toEqual(selected.profile);
  expect(typeof localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBe('string');
  const { loadStoredAIProviderSecret } = await import('./provider-secrets.store');
  await expect(loadStoredAIProviderSecret('provider-1', null)).resolves.toBe('provider-secret');
});

it('resets participant secrets without removing the shared profile or unrelated data', async () => {
  await installTransparentProviderSecret('provider-secret');
  const selected = await prepareProtection();
  await selected.participant.apply(selected.prepared, undefined, selected.profile);
  localState['unrelated-project'] = { id: 'retained' };
  const prepared = await selected.participant.prepare({
    action: 'reset',
    sourceKey: null,
    targetKey: null,
    sourceProfileBinding: 'profile',
    targetProfileBinding: 'profile',
  });
  await selected.participant.apply(prepared, undefined, selected.profile);
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({});
  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({ hasStoredApiKey: false }),
  ]);
  expect(localState[AI_SECRET_PROTECTION_KEY]).toEqual(selected.profile);
  expect(localState['unrelated-project']).toEqual({ id: 'retained' });
});

it('refuses rekey with a key that cannot decrypt the exact source ciphertext', async () => {
  await installTransparentProviderSecret('provider-secret');
  const selected = await prepareProtection();
  await selected.participant.apply(selected.prepared, undefined, selected.profile);
  const wrong = await createAesGcmKeyMaterial();
  const before = structuredClone(localState);
  await expect(
    selected.participant.prepare({
      action: 'rekey',
      sourceKey: wrong.key,
      targetKey: selected.key,
      sourceProfileBinding: 'profile',
      targetProfileBinding: 'next',
    })
  ).rejects.toThrow();
  expect(localState).toEqual(before);
});

function chromeOrderedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(chromeOrderedValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, chromeOrderedValue(value[key])])
  );
}

function installChromeOrderedWriter() {
  localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    const serialized: unknown = JSON.parse(JSON.stringify(payload));
    const stored = chromeOrderedValue(serialized);
    if (!isRecord(stored)) throw new Error('Expected browser storage object.');
    Object.assign(localState, stored);
  });
}

it('replays a decided target after Chrome storage alphabetizes nested object keys', async () => {
  await installTransparentProviderSecret('provider-secret');
  const selected = await prepareProtection();
  installChromeOrderedWriter();
  await selected.participant.apply(selected.prepared, undefined, selected.profile);
  const stored = structuredClone(localState);
  localSetMock.mockClear();
  await selected.participant.apply(selected.prepared);
  expect(localSetMock).not.toHaveBeenCalled();
  expect(localState).toEqual(stored);
  const { loadStoredAIProviderSecret } = await import('./provider-secrets.store');
  await expect(loadStoredAIProviderSecret('provider-1', selected.key)).resolves.toBe(
    'provider-secret'
  );
});

it('preserves the legacy order-sensitive source digest in prepared payloads', async () => {
  await installTransparentProviderSecret('provider-secret');
  const snapshot = {
    providers: localState[AI_PROVIDERS_KEY],
    secrets: localState[AI_PROVIDER_SECRETS_KEY],
    transparentKey: localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY],
  };
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(snapshot))
  );
  const expected = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  const selected = await prepareProtection();
  expect(selected.prepared.payload).toMatchObject({ sourceDigest: expected });
});

it.each(['before publication', 'after publication'] as const)(
  'refuses a delayed decided target after provider recreation %s',
  async (phase) => {
    await installTransparentProviderSecret('provider-secret');
    const selected = await prepareProtection();
    installChromeOrderedWriter();
    if (phase === 'after publication') await selected.participant.apply(selected.prepared);
    localState[AI_PROVIDERS_KEY] = [
      {
        ...createStoredProvider(),
        createdAt: 2,
        incarnation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    ];
    const before = structuredClone(localState);
    localSetMock.mockClear();
    await expect(selected.participant.apply(selected.prepared)).rejects.toThrow(
      'admission refused'
    );
    expect(localState).toEqual(before);
    expect(localSetMock).not.toHaveBeenCalled();
  }
);

it('refuses a reordered provider array while allowing reordered nested object keys', async () => {
  await installTransparentProviderSecret('provider-secret');
  const providers = [
    createStoredProvider(),
    { ...createStoredProvider(), id: 'provider-2', hasStoredApiKey: false },
  ];
  localState[AI_PROVIDERS_KEY] = providers;
  const selected = await prepareProtection();
  installChromeOrderedWriter();
  await selected.participant.apply(selected.prepared);
  await selected.participant.apply(selected.prepared);
  localState[AI_PROVIDERS_KEY] = [...providers].reverse();
  const before = structuredClone(localState);
  localSetMock.mockClear();
  await expect(selected.participant.apply(selected.prepared)).rejects.toThrow('admission refused');
  expect(localState).toEqual(before);
  expect(localSetMock).not.toHaveBeenCalled();
});

it('refuses foreign ciphertext after a decided target was published', async () => {
  await installTransparentProviderSecret('provider-secret');
  const selected = await prepareProtection();
  installChromeOrderedWriter();
  await selected.participant.apply(selected.prepared);
  localState[AI_PROVIDER_SECRETS_KEY] = {
    'provider-1': await encryptSecret('foreign-writer', selected.key),
  };
  const before = structuredClone(localState);
  localSetMock.mockClear();
  await expect(selected.participant.apply(selected.prepared)).rejects.toThrow('admission refused');
  expect(localState).toEqual(before);
  expect(localSetMock).not.toHaveBeenCalled();
});

it('recovers a decided reordered target after storage commits but its acknowledgement fails', async () => {
  await installTransparentProviderSecret('provider-secret');
  const selected = await prepareProtection();
  installChromeOrderedWriter();
  const write = localSetMock.getMockImplementation();
  if (!write) throw new Error('Expected storage adapter.');
  localSetMock.mockImplementationOnce(async (payload: Record<string, unknown>) => {
    await write(payload);
    throw new Error('Storage acknowledgement lost.');
  });
  await expect(
    selected.participant.apply(selected.prepared, undefined, selected.profile)
  ).rejects.toThrow('acknowledgement lost');
  const committed = structuredClone(localState);
  await selected.participant.apply(selected.prepared, undefined, selected.profile);
  expect(localState).toEqual(committed);
  expect(localState[AI_SECRET_PROTECTION_KEY]).toEqual(selected.profile);
  const { loadStoredAIProviderSecret } = await import('./provider-secrets.store');
  await expect(loadStoredAIProviderSecret('provider-1', selected.key)).resolves.toBe(
    'provider-secret'
  );
});
