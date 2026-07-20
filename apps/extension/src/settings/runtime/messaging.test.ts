import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transport: { sendRuntimeMessage: vi.fn(), sendTabMessage: vi.fn() },
  createRuntimeMessagingTransport: vi.fn(),
}));

vi.mock('../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: mocks.createRuntimeMessagingTransport,
}));

it('creates the settings runtime messaging transport through the shared owner', async () => {
  mocks.createRuntimeMessagingTransport.mockReturnValue(mocks.transport);

  const { settingsRuntimeMessagingTransport } = await import('./messaging');

  expect(settingsRuntimeMessagingTransport).toBe(mocks.transport);
  expect(mocks.createRuntimeMessagingTransport).toHaveBeenCalledTimes(1);
});
