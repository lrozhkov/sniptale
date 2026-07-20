import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserStorageSyncGetMock } = vi.hoisted(() => ({
  browserStorageSyncGetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    sync: {
      get: browserStorageSyncGetMock,
      remove: vi.fn(),
      set: vi.fn(),
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
  })),
}));

import { createDefaultSettings, loadSettings } from './index';

beforeEach(() => {
  browserStorageSyncGetMock.mockReset();
  browserStorageSyncGetMock.mockResolvedValue({});
});

describe('settings default graph', () => {
  it('clones nested default settings on each load', async () => {
    const firstSettings = await loadSettings();
    const secondSettings = await loadSettings();

    expect(firstSettings).toEqual(secondSettings);
    expect(firstSettings).not.toBe(secondSettings);
    expect(firstSettings.viewportPresets).not.toBe(secondSettings.viewportPresets);
    expect(firstSettings.contextMenu).not.toBe(secondSettings.contextMenu);
    expect(firstSettings.contentToolbar).not.toBe(secondSettings.contentToolbar);
  });

  it('creates fresh nested defaults for direct default-settings consumers', () => {
    const firstSettings = createDefaultSettings();
    const secondSettings = createDefaultSettings();

    expect(firstSettings.viewportPresets).not.toBe(secondSettings.viewportPresets);
    expect(firstSettings.contextMenu).not.toBe(secondSettings.contextMenu);
    expect(firstSettings.contentToolbar).not.toBe(secondSettings.contentToolbar);
  });
});
