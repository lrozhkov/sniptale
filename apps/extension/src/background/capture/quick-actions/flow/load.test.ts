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

import {
  loadQuickActionRuntimeContext,
  loadScreenshotCaptureRuntimeContext,
  resolveQuickActionRuntimeContext,
} from './load';

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
      showWindowResize: true,
      showSettings: true,
    },
    saveCapturesToGallery: false,
    defaultViewportPresetId: null,
    imageFormat: 'png',
    imageQuality: 90,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
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
      createQuickAction({ screenshotMode: 'selection', viewportPresetId: 'preset-1' }),
    ]);
    loadSettingsMock.mockResolvedValue(
      createSettings({
        defaultViewportPresetId: 'preset-default',
        imageFormat: 'jpeg',
        imageQuality: 80,
      })
    );

    await expect(loadQuickActionRuntimeContext('action-1')).resolves.toEqual({
      action: createQuickAction({ screenshotMode: 'selection', viewportPresetId: 'preset-1' }),
      afterCapture: 'download_default',
      captureMode: 'selection',
      delaySeconds: 0,
      viewportPresetId: 'preset-1',
      imageFormat: 'jpeg',
      imageQuality: 80,
      settings: createSettings({
        defaultViewportPresetId: 'preset-default',
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

describe('loadScreenshotCaptureRuntimeContext', () => {
  it('normalizes an allowed popup desktop config before creating the runtime context', async () => {
    const context = await loadScreenshotCaptureRuntimeContext({
      screenshotMode: 'desktop',
      viewportPresetId: 'wide',
      delay: 10,
      afterCapture: 'edit',
      imageFormat: 'webp',
      imageQuality: 70,
      exitAfterCapture: true,
    });
    expect(context).toMatchObject({
      captureMode: 'desktop',
      viewportPresetId: null,
      delaySeconds: 0,
      afterCapture: 'edit',
      imageFormat: 'webp',
      action: { exitAfterCapture: false, imageQuality: 70 },
    });
  });

  it.each(['scenario', 'copy'] as const)(
    'rejects unsupported desktop delivery %s at the runtime boundary',
    async (afterCapture) => {
      await expect(
        loadScreenshotCaptureRuntimeContext({
          screenshotMode: 'desktop',
          viewportPresetId: null,
          delay: null,
          afterCapture,
          imageFormat: null,
          imageQuality: null,
          exitAfterCapture: false,
        })
      ).rejects.toThrow('unavailable for window or screen capture');
    }
  );

  it('closes only tools opened by a direct popup tab capture', async () => {
    const context = await loadScreenshotCaptureRuntimeContext({
      screenshotMode: 'visible',
      viewportPresetId: null,
      delay: null,
      afterCapture: 'download_default',
      imageFormat: null,
      imageQuality: null,
      exitAfterCapture: false,
    });

    expect(context.action.exitAfterCapture).toBe(true);
  });
});

describe('resolveQuickActionRuntimeContext', () => {
  it.each(['scenario', 'ask_preset'] as const)(
    'rejects the unsupported desktop sink %s at the runtime boundary',
    (afterCapture) => {
      expect(() =>
        resolveQuickActionRuntimeContext(
          createQuickAction({ screenshotMode: 'desktop', afterCapture }),
          createSettings()
        )
      ).toThrow('unavailable for window or screen capture');
    }
  );

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
      viewportPresetId: null,
      imageFormat: 'png',
      imageQuality: 90,
    });
  });

  it('does not inherit the retired global viewport default', () => {
    expect(
      resolveQuickActionRuntimeContext(
        createQuickAction(),
        createSettings({ defaultViewportPresetId: 'legacy-default' })
      ).viewportPresetId
    ).toBeNull();
  });
});
