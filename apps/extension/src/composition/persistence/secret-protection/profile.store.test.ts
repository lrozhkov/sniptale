// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { encryptSecret, decryptSecret } from '@sniptale/platform/security/local-secret-crypto';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  createSecretProtectionProfile,
  parseSecretProtectionProfile,
  readSecretProtectionProfile,
  secretProtectionProfileBinding,
  verifySecretProtectionPassphrase,
  writeSecretProtectionProfile,
} from './profile.store';
import { SECRET_PROTECTION_PROFILE_KEY } from './constants';

const io = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
function chromeOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(chromeOrder);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, chromeOrder(value[key])])
    );
  return value;
}
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: async () => structuredClone(io.state),
      set: async (values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values)) io.state[key] = chromeOrder(value);
      },
      remove: async (key: string) => {
        delete io.state[key];
      },
    },
    session: { remove: async () => undefined },
  },
}));
beforeEach(() => {
  io.state = {};
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());
async function rawDigest(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
    ),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}
it('keeps the Chrome-read digest across verifier key reordering without changing stored profile bytes', async () => {
  const { profile } = await createSecretProtectionProfile('synthetic phrase');
  const before = structuredClone(profile);
  await writeSecretProtectionProfile(profile);
  const stored = await readSecretProtectionProfile();
  if (!stored) throw new Error('Profile missing');
  const expectedChromeDigest = await rawDigest(stored);
  expect(await secretProtectionProfileBinding(profile)).toBe(expectedChromeDigest);
  expect(await secretProtectionProfileBinding(stored)).toBe(expectedChromeDigest);
  expect(profile).toEqual(before);
  expect(io.state[SECRET_PROTECTION_PROFILE_KEY]).toEqual(chromeOrder(before));
});
it('recognizes only the exact historical construction-order alias of the current profile', async () => {
  const { profile } = await createSecretProtectionProfile('synthetic phrase');
  const legacy = await rawDigest(profile);
  await writeSecretProtectionProfile(profile);
  const canonical = await secretProtectionProfileBinding(profile);
  if (!canonical) throw new Error('Binding missing');
  const { readCompatibleSecretProtectionProfileBindings } = await import('./profile.store');
  const supported = await readCompatibleSecretProtectionProfileBindings(canonical);
  expect(supported).toEqual([canonical, legacy]);
  const arbitraryOrder = {
    ...profile,
    verifier: {
      version: profile.verifier.version,
      iv: profile.verifier.iv,
      algorithm: profile.verifier.algorithm,
      ciphertext: profile.verifier.ciphertext,
    },
  };
  expect(supported).not.toContain(await rawDigest(arbitraryOrder));
});
it('does not derive aliases from a foreign current profile or an arbitrary requested binding', async () => {
  const first = await createSecretProtectionProfile('same phrase');
  const second = await createSecretProtectionProfile('same phrase');
  const legacy = await rawDigest(first.profile);
  const canonical = await secretProtectionProfileBinding(first.profile);
  if (!canonical) throw new Error('Binding missing');
  await writeSecretProtectionProfile(second.profile);
  const { readCompatibleSecretProtectionProfileBindings } = await import('./profile.store');
  expect(await readCompatibleSecretProtectionProfileBindings(canonical)).toEqual([canonical]);
  expect(await readCompatibleSecretProtectionProfileBindings(canonical)).not.toContain(legacy);
  expect(await readCompatibleSecretProtectionProfileBindings('a'.repeat(64))).toEqual([
    'a'.repeat(64),
  ]);
});
it('retains legacy verifier decryption and refuses a wrong phrase after Chrome roundtrip', async () => {
  const { profile } = await createSecretProtectionProfile('legacy phrase');
  await writeSecretProtectionProfile(profile);
  const stored = await readSecretProtectionProfile();
  if (!stored) throw new Error('Profile missing');
  expect((await verifySecretProtectionPassphrase('legacy phrase', stored)).extractable).toBe(false);
  await expect(verifySecretProtectionPassphrase('wrong phrase', stored)).rejects.toThrow(
    'Invalid secret passphrase'
  );
  expect(parseSecretProtectionProfile(chromeOrder(profile))).toEqual(stored);
});

it('preserves accepted v2 AAD and extra nested values while keeping array order significant', async () => {
  const { profile, key } = await createSecretProtectionProfile('synthetic phrase');
  const additionalData = { version: 'synthetic-test:v1', namespace: 'test-only' };
  const verifier = await encryptSecret('synthetic verifier', key, additionalData);
  const parsed = parseSecretProtectionProfile({
    ...profile,
    kdf: { ...profile.kdf, extra: { z: 2, a: 1 } },
    verifier: { ...verifier, extra: { z: true, sequence: ['first', 'second'] } },
  });
  if (!parsed) throw new Error('Profile missing');
  const persisted = parseSecretProtectionProfile(chromeOrder(parsed));
  if (!persisted) throw new Error('Profile missing');
  expect(await secretProtectionProfileBinding(parsed)).toBe(await rawDigest(persisted));
  expect(await secretProtectionProfileBinding(parsed)).toBe(
    await secretProtectionProfileBinding(persisted)
  );
  expect(await decryptSecret(persisted.verifier, key, additionalData)).toBe('synthetic verifier');
  const changedArray = parseSecretProtectionProfile({
    ...parsed,
    verifier: { ...parsed.verifier, extra: { z: true, sequence: ['second', 'first'] } },
  });
  expect(await secretProtectionProfileBinding(changedArray)).not.toBe(
    await secretProtectionProfileBinding(parsed)
  );
  await writeSecretProtectionProfile(parsed);
  const canonical = await secretProtectionProfileBinding(parsed);
  if (!canonical) throw new Error('Binding missing');
  const { readCompatibleSecretProtectionProfileBindings } = await import('./profile.store');
  expect(await readCompatibleSecretProtectionProfileBindings(canonical)).toEqual([canonical]);
});
it('grants no legacy alias when current profile storage is absent or malformed', async () => {
  const { profile } = await createSecretProtectionProfile('synthetic phrase');
  const expected = await secretProtectionProfileBinding(profile);
  if (!expected) throw new Error('Binding missing');
  const { readCompatibleSecretProtectionProfileBindings } = await import('./profile.store');
  expect(await readCompatibleSecretProtectionProfileBindings(expected)).toEqual([expected]);
  io.state[SECRET_PROTECTION_PROFILE_KEY] = { broken: true };
  expect(await readCompatibleSecretProtectionProfileBindings(expected)).toEqual([expected]);
  expect(await readCompatibleSecretProtectionProfileBindings('not-a-profile-binding')).toEqual([]);
});
