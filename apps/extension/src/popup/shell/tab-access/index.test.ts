import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn(),
  translateMock: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    query: mocks.queryMock,
  },
}));

vi.mock('../../../platform/i18n', () => ({
  translate: mocks.translateMock,
}));

import { getActiveTabId } from './index';

describe('getActiveTabId', () => {
  it('returns the active tab id', async () => {
    mocks.queryMock.mockResolvedValue([{ id: 42 }]);

    await expect(getActiveTabId()).resolves.toBe(42);
  });

  it('throws a translated error when no tab is active', async () => {
    mocks.queryMock.mockResolvedValue([{}]);

    await expect(getActiveTabId()).rejects.toThrow('t:popup.common.noActiveTab');
  });
});
