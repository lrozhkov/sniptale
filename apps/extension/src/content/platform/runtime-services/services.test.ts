import { beforeEach, expect, it, vi } from 'vitest';
import { FakeRuntimeMessagingTransport } from '../../../platform/runtime-messaging/fake';
import {
  getContentRuntimeServices,
  resetContentRuntimeServicesForTests,
  setContentRuntimeServicesForTests,
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
  resetContentRuntimeServicesForTests();
  createRuntimeMessagingTransportMock.mockReturnValue(new FakeRuntimeMessagingTransport());
});

it('creates default runtime services lazily around one messaging transport', () => {
  const services = getContentRuntimeServices();

  expect(createRuntimeMessagingTransportMock).toHaveBeenCalledOnce();
  expect(getContentRuntimeServices()).toBe(services);
});

it('uses test overrides until reset', () => {
  const services = {
    contentActionIntent: getContentRuntimeServices().contentActionIntent,
    messaging: new FakeRuntimeMessagingTransport(),
  };
  setContentRuntimeServicesForTests(services);

  expect(getContentRuntimeServices()).toBe(services);
  resetContentRuntimeServicesForTests();

  expect(getContentRuntimeServices()).not.toBe(services);
});
