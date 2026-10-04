import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWindow: vi.fn(),
  updateWindow: vi.fn(),
  subscribeBoundsChanged: vi.fn(() => vi.fn()),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/windows', () => ({
  browserWindows: {
    get: mocks.getWindow,
    update: mocks.updateWindow,
    subscribeBoundsChanged: mocks.subscribeBoundsChanged,
  },
}));
vi.mock('../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: mocks.storageGet,
      isAvailable: () => true,
      set: mocks.storageSet,
    },
  },
}));

import { DefaultCaptureSurfaceService } from './service';

const prior = {
  type: 'window' as const,
  left: 0,
  top: 0,
  width: 1600,
  height: 900,
  state: 'maximized' as const,
};
const normalized = { ...prior, state: 'normal' as const };
const applied = { ...normalized, width: 1280, height: 720 };

beforeEach(() => {
  vi.clearAllMocks();
  let current = normalized;
  mocks.getWindow.mockImplementation(async () => ({ id: 3, ...current }));
  mocks.updateWindow.mockImplementation(async (_id, update) => {
    current = { ...current, ...update };
    return { id: 3, ...current };
  });
  mocks.storageSet.mockResolvedValue(undefined);
});

it.each(['screenshot', 'quick-action'] as const)(
  'restores an interrupted %s normalization through the real journal parser',
  async (owner) => {
    mocks.storageGet.mockResolvedValue({
      'capture-surface-journal-v1': [
        {
          version: 1,
          sessionId: 'session-1',
          leaseId: 'lease-1',
          generation: 1,
          owner,
          tabId: 7,
          windowId: 3,
          presetId: 'window-hd',
          target: 'window',
          prior,
          applied,
          alignmentFrom: normalized,
          phase: 'prepared',
          parentLeaseId: null,
          updatedAt: 1,
        },
      ],
    });

    await new DefaultCaptureSurfaceService().recover();

    expect(mocks.updateWindow).toHaveBeenLastCalledWith(3, { state: 'maximized' });
    expect(mocks.storageSet).toHaveBeenLastCalledWith({ 'capture-surface-journal-v1': [] });
  }
);
