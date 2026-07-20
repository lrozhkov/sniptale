import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickAction, Settings } from '../../../../contracts/settings';

const { getQuickActionsMock, loadSettingsMock } = vi.hoisted(() => ({
  getQuickActionsMock: vi.fn(),
  loadSettingsMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/quick-actions')>()),
  getQuickActions: getQuickActionsMock,
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

import { loadQuickActionRuntimeContext, resolveQuickActionRuntimeContext } from './load';

function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    captureAction: 'download_default',
    contextMenu: {
      enabled: true,
      showScreenshots: true,
      showVideo: true,
      showExport: true,
      showImageEditor: true,
      showVideoEditor: true,
      showGallery: true,
      showPageLinkCopy: true,
      showSettings: true,
    },
    saveCapturesToGallery: false,
    defaultViewportId: 'native',
    imageFormat: 'png',
    imageQuality: 90,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    viewportPresets: [],
    ...overrides,
  };
}

function createQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    id: 'action-1',
    status: true,
    name: 'Action 1',
    icon: 'camera',
    screenshotMode: 'visible',
    exitAfterCapture: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getQuickActionsMock.mockResolvedValue([]);
  loadSettingsMock.mockResolvedValue(createSettings());
});

describe('loadQuickActionRuntimeContext', () => {
  it('loads the quick action and resolves defaults', async () => {
    getQuickActionsMock.mockResolvedValue([
      createQuickAction({ screenshotMode: 'selection', emulation: 'preset-1' }),
    ]);
    loadSettingsMock.mockResolvedValue(
      createSettings({
        defaultViewportId: 'preset-default',
        imageFormat: 'jpeg',
        imageQuality: 80,
      })
    );

    await expect(loadQuickActionRuntimeContext('action-1')).resolves.toEqual({
      action: createQuickAction({ screenshotMode: 'selection', emulation: 'preset-1' }),
      afterCapture: 'download_default',
      captureMode: 'selection',
      delaySeconds: 0,
      emulation: 'preset-1',
      imageFormat: 'jpeg',
      imageQuality: 80,
      settings: createSettings({
        defaultViewportId: 'preset-default',
        imageFormat: 'jpeg',
        imageQuality: 80,
      }),
    });
  });

  it('throws when the requested quick action is missing', async () => {
    await expect(loadQuickActionRuntimeContext('missing-action')).rejects.toThrow(
      'Quick action not found'
    );
  });
});

describe('resolveQuickActionRuntimeContext', () => {
  it('fills the runtime defaults from the action and settings', () => {
    expect(
      resolveQuickActionRuntimeContext(
        createQuickAction({
          id: 'action-2',
          screenshotMode: 'visible',
          afterCapture: 'copy',
        }),
        createSettings()
      )
    ).toMatchObject({
      afterCapture: 'copy',
      captureMode: 'visible',
      delaySeconds: 0,
      emulation: 'native',
      imageFormat: 'png',
      imageQuality: 90,
    });
  });
});
