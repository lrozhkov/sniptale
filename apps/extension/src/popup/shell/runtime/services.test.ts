import { beforeEach, expect, it, vi } from 'vitest';

const transportMocks = vi.hoisted(() => ({
  createRuntimeMessagingTransport: vi.fn(),
  defaultTransport: {
    sendRuntimeMessage: vi.fn(),
    sendTabMessage: vi.fn(),
  },
  installedTransport: {
    sendRuntimeMessage: vi.fn(),
    sendTabMessage: vi.fn(),
  },
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: transportMocks.createRuntimeMessagingTransport,
}));

import {
  getPopupRuntimeServices,
  resetPopupRuntimeServicesForTests,
  setPopupRuntimeServicesForTests,
} from './services';

beforeEach(() => {
  vi.clearAllMocks();
  resetPopupRuntimeServicesForTests();
  transportMocks.createRuntimeMessagingTransport.mockReturnValue(transportMocks.defaultTransport);
});

it('lazily creates one default popup runtime messaging service', () => {
  const first = getPopupRuntimeServices();
  const second = getPopupRuntimeServices();

  expect(first).toBe(second);
  expect(first.messaging).toBe(transportMocks.defaultTransport);
  expect(transportMocks.createRuntimeMessagingTransport).toHaveBeenCalledTimes(1);
});

it('allows tests to install and reset popup runtime services', () => {
  setPopupRuntimeServicesForTests({ messaging: transportMocks.installedTransport });

  expect(getPopupRuntimeServices().messaging).toBe(transportMocks.installedTransport);

  resetPopupRuntimeServicesForTests();

  expect(getPopupRuntimeServices().messaging).toBe(transportMocks.defaultTransport);
});
