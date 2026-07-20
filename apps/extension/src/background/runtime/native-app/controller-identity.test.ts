import { afterEach, expect, it, vi } from 'vitest';

import { resolveNativeControllerIdentity } from './controller-identity';
import { createNativeStorage } from './service-storage.test-support';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('resolves browser family from user-agent brands before user-agent fallback', async () => {
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
    userAgentData: { brands: [{ brand: 'Microsoft Edge' }, { brand: 'Chromium' }] },
  });

  await expect(createIdentity()).resolves.toEqual(
    expect.objectContaining({ browserFamily: 'edge' })
  );
});

it('resolves browser family from user-agent when brands are unavailable', async () => {
  for (const [userAgent, browserFamily] of [
    ['Mozilla/5.0 Chrome/140.0.0.0', 'chrome'],
    ['Mozilla/5.0 Chromium/140.0.0.0', 'chromium'],
    ['Mozilla/5.0 Firefox/140.0', 'unknown'],
  ] as const) {
    vi.stubGlobal('navigator', { userAgent });

    await expect(createIdentity()).resolves.toEqual(expect.objectContaining({ browserFamily }));
  }
});

it('replaces invalid stored profile keys with a valid profile-scoped key', async () => {
  const storage = createNativeStorage({
    'sniptale.nativeApp.controllerProfileKey': '../profile',
  });

  const identity = await resolveNativeControllerIdentity({
    connectionId: 'conn-1',
    extensionId: 'extension-id',
    storage,
  });

  expect(identity.profileKey).toMatch(/^profile:[A-Za-z0-9._:-]+$/);
  expect(identity.profileKey).not.toBe('../profile');
  expect(storage.local.set).toHaveBeenCalledWith({
    'sniptale.nativeApp.controllerProfileKey': identity.profileKey,
  });
});

function createIdentity() {
  return resolveNativeControllerIdentity({
    connectionId: 'conn-1',
    extensionId: 'extension-id',
    storage: createNativeStorage({
      'sniptale.nativeApp.controllerProfileKey': 'profile:stable',
    }),
  });
}
