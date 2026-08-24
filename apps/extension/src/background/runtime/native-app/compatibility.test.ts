import { beforeEach, expect, it, vi } from 'vitest';

import { createNativeHello } from './service.test-support';

const mocks = vi.hoisted(() => ({
  getManifest: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getManifest: mocks.getManifest,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getManifest.mockReturnValue({ name: 'Sniptale', version: '0.1.0' });
});

it('rejects native host manifest drift and update-channel mismatch', async () => {
  const { resolveNativeHandshakeFailure } = await import('./compatibility');

  expect(
    resolveNativeHandshakeFailure(
      createNativeHello({
        install: { ...createNativeHello().install, nativeHostManifestVersion: '0.9.0' },
      })
    )
  ).toBe('repair-required');

  expect(
    resolveNativeHandshakeFailure(
      createNativeHello({ install: { ...createNativeHello().install, updateChannel: 'beta' } })
    )
  ).toBe('repair-required');
});

it.each([
  { install: { packageIntegrity: 'invalid' as const }, signal: 'invalid package' },
  { install: { rollbackProtected: false }, signal: 'rollback protection absent' },
  { install: { signedBinary: false }, signal: 'binary signature absent' },
])('uses host-reported install health as repair guidance: $signal', async ({ install }) => {
  const { resolveNativeHandshakeFailure } = await import('./compatibility');

  expect(
    resolveNativeHandshakeFailure(
      createNativeHello({ install: { ...createNativeHello().install, ...install } })
    )
  ).toBe('repair-required');
});

it('does not turn unavailable host package-integrity reporting into attestation failure', async () => {
  const { resolveNativeHandshakeFailure } = await import('./compatibility');

  expect(
    resolveNativeHandshakeFailure(
      createNativeHello({
        install: { ...createNativeHello().install, packageIntegrity: 'unsupported' },
      })
    )
  ).toBeNull();
});

it('resolves native host channels from manifest names and versions', async () => {
  const { resolveNativeHostName } = await import('./host');

  mocks.getManifest.mockReturnValue({ name: 'Sniptale Beta', version: '0.1.0' });
  expect(resolveNativeHostName()).toBe('com.sniptale.beta.native_host');

  mocks.getManifest.mockReturnValue({ name: 'Sniptale', version_name: '0.1.0-dev' });
  expect(resolveNativeHostName()).toBe('com.sniptale.dev.native_host');
});
