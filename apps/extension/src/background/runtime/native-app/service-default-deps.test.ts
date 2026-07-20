import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  browserStorage: {
    canObserveChanges: vi.fn(),
    local: { get: vi.fn(), isAvailable: vi.fn(), remove: vi.fn(), set: vi.fn() },
    subscribeToChanges: vi.fn(),
  },
  connectNative: vi.fn(),
  resolveNativeHostName: vi.fn(() => 'com.sniptale.native_host'),
}));

vi.mock('@sniptale/platform/browser/native-messaging', () => ({
  browserNativeMessaging: { connectNative: mocks.connectNative },
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: mocks.browserStorage,
}));

vi.mock('./host', () => ({
  resolveNativeAppChannel: vi.fn(() => 'stable'),
  resolveNativeHostName: mocks.resolveNativeHostName,
}));

it('keeps provided native runtime service dependencies', async () => {
  const connectNative = vi.fn();
  const storage = {
    canObserveChanges: vi.fn(),
    local: { get: vi.fn(), isAvailable: vi.fn(), remove: vi.fn(), set: vi.fn() },
    subscribeToChanges: vi.fn(),
  };
  const { resolveNativeRuntimeServiceDeps } = await import('./service-default-deps');

  expect(
    resolveNativeRuntimeServiceDeps({
      connectNative,
      hostName: 'custom.host',
      storage,
    })
  ).toEqual({
    connectNative,
    hostName: 'custom.host',
    storage,
  });
});

it('fills missing native runtime service dependencies from default adapters', async () => {
  const { resolveNativeRuntimeServiceDeps } = await import('./service-default-deps');

  expect(resolveNativeRuntimeServiceDeps({})).toEqual({
    connectNative: mocks.connectNative,
    hostName: 'com.sniptale.native_host',
    storage: mocks.browserStorage,
  });
  expect(mocks.resolveNativeHostName).toHaveBeenCalledTimes(1);
});
