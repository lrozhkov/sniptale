import { beforeEach, expect, it, vi } from 'vitest';
import { FakeRuntimeMessagingTransport } from '../../../platform/runtime-messaging/fake';
import {
  getBackgroundRuntimeMessaging,
  resetBackgroundRuntimeMessagingForTests,
  setBackgroundRuntimeMessagingForTests,
} from './services';

const { createRuntimeMessagingTransportMock } = vi.hoisted(() => ({
  createRuntimeMessagingTransportMock: vi.fn(),
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: createRuntimeMessagingTransportMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetBackgroundRuntimeMessagingForTests();
  createRuntimeMessagingTransportMock.mockReturnValue(new FakeRuntimeMessagingTransport());
});

it('creates the default background runtime messaging transport lazily', () => {
  const messaging = getBackgroundRuntimeMessaging();

  expect(messaging).toBe(getBackgroundRuntimeMessaging());
  expect(createRuntimeMessagingTransportMock).toHaveBeenCalledOnce();
});

it('uses test overrides until reset', () => {
  const messaging = new FakeRuntimeMessagingTransport();
  setBackgroundRuntimeMessagingForTests(messaging);

  expect(getBackgroundRuntimeMessaging()).toBe(messaging);
  resetBackgroundRuntimeMessagingForTests();

  expect(getBackgroundRuntimeMessaging()).not.toBe(messaging);
});
