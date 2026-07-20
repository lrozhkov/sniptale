import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createNativeAppRuntimeService: vi.fn(),
  service: { connect: vi.fn() },
}));

vi.mock('./service', () => ({
  createNativeAppRuntimeService: mocks.createNativeAppRuntimeService,
}));

it('creates the default native app runtime service once', async () => {
  mocks.createNativeAppRuntimeService.mockReturnValue(mocks.service);
  const { getNativeAppRuntimeService } = await import('./service-singleton');

  expect(getNativeAppRuntimeService()).toBe(mocks.service);
  expect(getNativeAppRuntimeService()).toBe(mocks.service);
  expect(mocks.createNativeAppRuntimeService).toHaveBeenCalledTimes(1);
});
