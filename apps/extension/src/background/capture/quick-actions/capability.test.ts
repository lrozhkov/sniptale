import { beforeEach, expect, it, vi } from 'vitest';

const { getQuickActionCapabilityMock, translateMock, loggerWarnMock } = vi.hoisted(() => ({
  getQuickActionCapabilityMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
  loggerWarnMock: vi.fn(),
}));

vi.mock('../../../platform/i18n/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/index')>()),
  translate: translateMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

vi.mock('../../../features/tab-capabilities/capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/tab-capabilities/capabilities')>()),
  getQuickActionCapability: getQuickActionCapabilityMock,
}));

import { assertQuickActionSupported } from './capability';

beforeEach(() => {
  vi.clearAllMocks();
  getQuickActionCapabilityMock.mockReturnValue({ supported: true, reason: null });
});

it('allows supported tabs', () => {
  expect(() =>
    assertQuickActionSupported('action-1', 12, { url: 'https://example.test' } as chrome.tabs.Tab)
  ).not.toThrow();
});

it('throws and logs unsupported tabs', () => {
  getQuickActionCapabilityMock.mockReturnValue({
    supported: false,
    reason: 'Blocked on this tab',
  });

  expect(() =>
    assertQuickActionSupported('action-2', 12, { url: 'https://example.test' } as chrome.tabs.Tab)
  ).toThrow('Blocked on this tab');
  expect(loggerWarnMock).toHaveBeenCalledWith('Unsupported tab for popup screenshot action', {
    actionId: 'action-2',
    tabId: 12,
    url: 'https://example.test',
  });
});
