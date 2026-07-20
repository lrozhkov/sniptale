import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuickAction } from '../../../contracts/settings';

const { browserStorageLocalGetMock, browserStorageLocalSetMock } = vi.hoisted(() => ({
  browserStorageLocalGetMock: vi.fn(),
  browserStorageLocalSetMock: vi.fn(),
}));

const {
  getBundledQuickActionsMock,
  isBundledQuickActionMock,
  mergeStoredQuickActionsMock,
  normalizeQuickActionMock,
  sanitizeQuickActionsDisplayModeMock,
} = vi.hoisted(() => ({
  getBundledQuickActionsMock: vi.fn(),
  isBundledQuickActionMock: vi.fn(),
  mergeStoredQuickActionsMock: vi.fn(),
  normalizeQuickActionMock: vi.fn(),
  sanitizeQuickActionsDisplayModeMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  BrowserStorageAdapter: undefined,
  BrowserStorageAreaAdapter: undefined,
  BrowserStorageChangeListener: undefined,
  BrowserStorageChanges: undefined,
  BrowserStorageGetKeys: undefined,
  BrowserStorageSetItems: undefined,
  browserStorage: {
    local: {
      get: browserStorageLocalGetMock,
      set: browserStorageLocalSetMock,
    },
  },
}));

vi.mock('../../../features/quick-actions-presets/catalog', () => ({
  createBundledQuickAction: vi.fn(),
  getBundledQuickActionConfig: vi.fn(),
  getBundledQuickActions: getBundledQuickActionsMock,
  getQuickActionDisplayName: vi.fn(),
  isBundledQuickAction: isBundledQuickActionMock,
}));

vi.mock('../../../features/quick-actions-presets/display-mode', () => ({
  DEFAULT_QUICK_ACTIONS_DISPLAY_MODE: 'list',
  sanitizeQuickActionsDisplayMode: sanitizeQuickActionsDisplayModeMock,
}));

vi.mock('../../../features/quick-actions-presets/normalization', () => ({
  mergeStoredQuickActions: mergeStoredQuickActionsMock,
  normalizeQuickAction: normalizeQuickActionMock,
}));

import { addQuickAction, getQuickActions, saveQuickActions } from './index';

function createAction(id: string, origin: 'bundled' | 'user' = 'user'): QuickAction {
  return {
    id,
    status: true,
    name: `Action ${id}`,
    icon: 'Camera',
    origin,
    bundledId: origin === 'bundled' ? ('default-fullscreen' as const) : null,
    hotkey: null,
    screenshotMode: 'visible',
    emulation: 'native',
    delay: null,
    afterCapture: 'download_default',
    imageFormat: 'png',
    imageQuality: null,
    exitAfterCapture: true,
  };
}

function resetQuickActionsAuthorityMocks() {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  getBundledQuickActionsMock.mockReturnValue([createAction('bundled-1', 'bundled')]);
  normalizeQuickActionMock.mockImplementation((action: QuickAction) => action);
  mergeStoredQuickActionsMock.mockImplementation((actions: QuickAction[]) => ({
    actions,
    changed: false,
  }));
  isBundledQuickActionMock.mockReturnValue(false);
  sanitizeQuickActionsDisplayModeMock.mockImplementation((mode: unknown) =>
    mode === 'hidden' ? 'hidden' : 'list'
  );
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
}

describe('quick-actions storage authority', () => {
  beforeEach(resetQuickActionsAuthorityMocks);

  it('surfaces list write failures without claiming success', async () => {
    const error = new Error('quick actions write failed');
    browserStorageLocalSetMock.mockRejectedValueOnce(error);

    await expect(saveQuickActions([createAction('saved-1')])).rejects.toThrow(error);
  });

  it('keeps the serialized mutation queue usable after a failed write', async () => {
    let storedActions = [createAction('existing-1')];
    const error = new Error('first write failed');

    browserStorageLocalGetMock.mockImplementation(async () => ({
      sniptale_quick_actions: storedActions,
    }));
    browserStorageLocalSetMock
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(async (payload: Record<string, QuickAction[]>) => {
        storedActions = payload['sniptale_quick_actions'] ?? [];
      });

    await expect(addQuickAction(createAction('new-1'))).rejects.toThrow(error);
    await expect(addQuickAction(createAction('new-2'))).resolves.toBeUndefined();

    expect(storedActions.map((action) => action.id)).toEqual(['existing-1', 'new-2']);
  });

  it('does not repair-write when reads fall back from an invalid root payload', async () => {
    browserStorageLocalGetMock.mockResolvedValueOnce({ sniptale_quick_actions: { broken: true } });

    await expect(getQuickActions()).resolves.toEqual([createAction('bundled-1', 'bundled')]);

    expect(browserStorageLocalSetMock).not.toHaveBeenCalled();
  });
});
