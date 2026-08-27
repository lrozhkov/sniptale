import { beforeEach, expect, it, vi } from 'vitest';
import type { Settings, ViewportPreset } from '../../../../contracts/settings';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  issueContentPrivilegedActionAutoStartGrantMock,
  ensureNativeVisibleCaptureAuthorityMock,
  getScreenshotSurfaceBindingMock,
  prepareQuickActionSurfaceMock,
  releaseQuickActionSurfaceAfterFailureMock,
  releaseQuickActionSurfaceMock,
  sendTabMessageMock,
  sendViewerPreparationCommandMock,
  waitForContentToolbarReadyMock,
  waitForContentScreenshotModeMock,
} = vi.hoisted(() => ({
  issueContentPrivilegedActionAutoStartGrantMock: vi.fn(),
  ensureNativeVisibleCaptureAuthorityMock: vi.fn(),
  getScreenshotSurfaceBindingMock: vi.fn(),
  prepareQuickActionSurfaceMock: vi.fn(),
  releaseQuickActionSurfaceAfterFailureMock: vi.fn(),
  releaseQuickActionSurfaceMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  sendViewerPreparationCommandMock: vi.fn(),
  waitForContentToolbarReadyMock: vi.fn(),
  waitForContentScreenshotModeMock: vi.fn(),
}));

vi.mock(
  '../../../routing-contracts/runtime-messaging/content-toolbar-readiness',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../routing-contracts/runtime-messaging/content-toolbar-readiness')
    >()),
    waitForContentToolbarReady: waitForContentToolbarReadyMock,
    waitForContentScreenshotMode: waitForContentScreenshotModeMock,
  })
);

vi.mock('../../../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging/index')>()),
  sendTabMessage: sendTabMessageMock,
}));
vi.mock('../../page-preparation/viewer-ports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-preparation/viewer-ports')>()),
  sendViewerPreparationCommand: sendViewerPreparationCommandMock,
}));
vi.mock('../../../routing-contracts/capabilities/content-action/route', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/capabilities/content-action/route')
  >()),
  issueContentPrivilegedActionAutoStartGrant: issueContentPrivilegedActionAutoStartGrantMock,
}));
vi.mock('../../../capture-surface/screenshot-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface/screenshot-session')>()),
  getScreenshotSurfaceBinding: getScreenshotSurfaceBindingMock,
}));

vi.mock('./surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./surface')>()),
  applyQuickActionSurface: prepareQuickActionSurfaceMock,
  releaseQuickActionSurfaceAfterFailure: releaseQuickActionSurfaceAfterFailureMock,
  releaseQuickActionSurface: releaseQuickActionSurfaceMock,
}));

import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { runCaptureFlow, runSelectionFlow } from './flows';

function createSettings(viewportPresets: ViewportPreset[]): Settings {
  return {
    captureAction: 'download_default' as const,
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
    viewportPresets,
  };
}

function createQuickAction(
  overrides: Partial<{
    id: string;
    screenshotMode: 'visible' | 'full' | 'selection';
    afterCapture:
      | 'download_default'
      | 'ask_preset'
      | 'ask_system'
      | 'scenario'
      | 'edit'
      | 'copy'
      | 'save_to_library';
    exitAfterCapture: boolean;
  }> = {}
) {
  return {
    id: 'quick-action',
    status: true,
    name: 'Quick Action',
    icon: 'camera',
    screenshotMode: 'visible' as const,
    exitAfterCapture: false,
    ...overrides,
  };
}

function createSelectionArgs() {
  return {
    action: createQuickAction({
      id: 'selection-action',
      screenshotMode: 'selection',
      afterCapture: 'copy',
      exitAfterCapture: true,
    }),
    afterCapture: 'copy' as const,
    delaySeconds: 2,
    viewportPresetId: null,
    imageFormat: 'jpeg' as const,
    imageQuality: 75,
    pageAccessPort: {
      ensureActivePageAccessRuntime: vi.fn(),
      ensureNativeVisibleCaptureAuthority: ensureNativeVisibleCaptureAuthorityMock,
    },
    screenshotModeState: new Map<number, boolean>(),
    settings: createSettings([]),
    tabId: 17,
    viewportState: new Map<
      number,
      { presetId: string; target: 'window' | 'window'; width: number; height: number } | null
    >(),
  };
}

function createCaptureArgs() {
  return {
    action: createQuickAction({
      id: 'visible-action',
      screenshotMode: 'visible',
    }),
    afterCapture: 'download_default' as const,
    captureMode: 'visible' as const,
    delaySeconds: 0,
    viewportPresetId: 'preset-1',
    imageFormat: 'png' as const,
    imageQuality: 88,
    pageAccessPort: {
      ensureActivePageAccessRuntime: vi.fn(),
      ensureNativeVisibleCaptureAuthority: ensureNativeVisibleCaptureAuthorityMock,
    },
    screenshotModeState: new Map<number, boolean>(),
    settings: createSettings([
      {
        kind: 'user',
        id: 'preset-1',
        name: 'Preset 1',
        target: 'window' as const,
        width: 1440,
        height: 900,
        enabled: true,
        order: 0,
      },
    ]),
    tabId: 21,
    viewportState: new Map<
      number,
      { presetId: string; target: 'window' | 'window'; width: number; height: number } | null
    >([[21, { presetId: 'test:viewport', target: 'window' as const, width: 1440, height: 900 }]]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  issueContentPrivilegedActionAutoStartGrantMock.mockReturnValue({ grantToken: 'grant-token-1' });
  getScreenshotSurfaceBindingMock.mockImplementation((tabId: number) => ({
    surfaceCapabilityToken: 'surface-token-1',
    surfaceOperationGeneration: tabId === 17 ? 0 : 1,
    ...(tabId === 17 ? {} : { surfaceLeaseGeneration: 1 }),
  }));
  sendTabMessageMock.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  sendViewerPreparationCommandMock.mockResolvedValue(undefined);
  waitForContentToolbarReadyMock.mockResolvedValue({ screenshotMode: false, visible: false });
  waitForContentScreenshotModeMock.mockResolvedValue({ screenshotMode: true, visible: false });
  prepareQuickActionSurfaceMock.mockImplementation(
    async (args: ReturnType<typeof createCaptureArgs>) => {
      if (args.viewportPresetId) {
        args.viewportState.set(args.tabId, {
          presetId: args.viewportPresetId,
          target: 'window' as const,
          width: 1440,
          height: 900,
        });
      } else {
        args.viewportState.set(args.tabId, null);
      }
      return { surfaceCapabilityToken: 'surface-token-1' };
    }
  );
  releaseQuickActionSurfaceMock.mockResolvedValue(undefined);
  releaseQuickActionSurfaceAfterFailureMock.mockImplementation(
    async (tabId: number, viewportState: unknown, cause: unknown) => {
      try {
        await releaseQuickActionSurfaceMock(tabId, viewportState);
      } catch (rollbackError) {
        throw new AggregateError([cause, rollbackError], 'rollback failed', {
          cause: rollbackError,
        });
      }
      throw cause;
    }
  );
  ensureNativeVisibleCaptureAuthorityMock.mockResolvedValue(undefined);
});

it('starts screenshot selection and marks the tab active', async () => {
  const args = createSelectionArgs();

  await runSelectionFlow(args);

  expect(sendTabMessageMock).toHaveBeenCalledWith(
    17,
    {
      type: MessageType.ENABLE_SCREENSHOT_MODE,
      viewport: null,
      contentIntentGrant: { grantToken: 'grant-token-1' },
      quickActionOverlay: {
        afterCapture: 'copy',
        delaySeconds: 2,
        exitAfterCapture: true,
        imageFormat: 'jpeg',
        imageQuality: 75,
      },
      autoStartSelection: true,
      surfaceCapabilityToken: 'surface-token-1',
      surfaceOperationGeneration: 0,
    },
    { frameId: 0 }
  );
  expect(ensureNativeVisibleCaptureAuthorityMock).toHaveBeenCalledWith(17);
  expect(issueContentPrivilegedActionAutoStartGrantMock).toHaveBeenCalledWith({
    actionTypes: [
      CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
      MessageType.SAVE_SCREENSHOT_TO_GALLERY,
    ],
    libraryActionTypes: [],
    tabId: 17,
  });
  expect(sendViewerPreparationCommandMock).not.toHaveBeenCalled();
  expect(args.screenshotModeState.get(17)).toBe(true);
});

it('binds library destination authority only for the explicit save-to-library action', async () => {
  const args = { ...createSelectionArgs(), afterCapture: 'save_to_library' as const };
  await runSelectionFlow(args);
  expect(issueContentPrivilegedActionAutoStartGrantMock).toHaveBeenCalledWith({
    actionTypes: [
      CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
      MessageType.SAVE_SCREENSHOT_TO_GALLERY,
    ],
    libraryActionTypes: [MessageType.SAVE_SCREENSHOT_TO_GALLERY],
    tabId: 17,
  });
});

it('keeps native selection flows on the active page with viewport null', async () => {
  const args = createSelectionArgs();

  await runSelectionFlow(args);

  expect(prepareQuickActionSurfaceMock).toHaveBeenCalledWith(args);
  expect(sendTabMessageMock).toHaveBeenCalledWith(
    17,
    expect.objectContaining({
      autoStartSelection: true,
      viewport: null,
    }),
    { frameId: 0 }
  );
});

it('routes owned viewer selection flows through the viewer port', async () => {
  const args = {
    ...createSelectionArgs(),
    pageCapability: TabRuntimeCapability.OwnedSnapshotViewer,
    webSnapshotViewerPorts: new Map(),
  };

  await runSelectionFlow(args);

  expect(prepareQuickActionSurfaceMock).toHaveBeenCalledWith(args);
  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendViewerPreparationCommandMock).toHaveBeenCalledWith(
    args.webSnapshotViewerPorts,
    17,
    expect.objectContaining({
      type: MessageType.ENABLE_SCREENSHOT_MODE,
      autoStartSelection: true,
      viewport: null,
    })
  );
  expect(ensureNativeVisibleCaptureAuthorityMock).not.toHaveBeenCalled();
  expect(args.screenshotModeState.get(17)).toBe(true);
});

it('starts capture mode with the resolved viewport and marks the tab active', async () => {
  const args = createCaptureArgs();

  await runCaptureFlow(args);

  expect(sendTabMessageMock).toHaveBeenCalledWith(
    21,
    {
      type: MessageType.ENABLE_SCREENSHOT_MODE,
      viewport: {
        presetId: 'preset-1',
        target: 'window' as const,
        width: 1440,
        height: 900,
      },
      contentIntentGrant: { grantToken: 'grant-token-1' },
      quickActionOverlay: {
        afterCapture: 'download_default',
        delaySeconds: 0,
        exitAfterCapture: false,
        imageFormat: 'png',
        imageQuality: 88,
      },
      autoStartCaptureType: 'visible',
      surfaceCapabilityToken: 'surface-token-1',
      surfaceLeaseGeneration: 1,
      surfaceOperationGeneration: 1,
    },
    { frameId: 0 }
  );
  expect(issueContentPrivilegedActionAutoStartGrantMock).toHaveBeenCalledWith({
    actionTypes: [CaptureMessageType.CAPTURE_VISIBLE],
    libraryActionTypes: [],
    tabId: 21,
  });
  expect(sendViewerPreparationCommandMock).not.toHaveBeenCalled();
  expect(ensureNativeVisibleCaptureAuthorityMock).toHaveBeenCalledWith(21);
  expect(args.screenshotModeState.get(21)).toBe(true);
});

it('blocks native visible quick actions without native visible-capture authority', async () => {
  const args = {
    ...createCaptureArgs(),
    viewportPresetId: null,
    viewportState: new Map<
      number,
      { presetId: string; target: 'window' | 'window'; width: number; height: number } | null
    >(),
  };
  ensureNativeVisibleCaptureAuthorityMock.mockRejectedValueOnce(new Error('capture authority'));

  await expect(runCaptureFlow(args)).rejects.toThrow('capture authority');

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(releaseQuickActionSurfaceMock).toHaveBeenCalledWith(21, args.viewportState);
});

it('stops before messaging when surface preparation fails', async () => {
  const args = createCaptureArgs();
  prepareQuickActionSurfaceMock.mockRejectedValueOnce(new Error('surface unavailable'));
  args.viewportPresetId = 'preset-2';
  args.imageQuality = 90;
  args.tabId = 29;
  args.viewportState = new Map<
    number,
    { presetId: string; target: 'window' | 'window'; width: number; height: number } | null
  >();

  await expect(runCaptureFlow(args)).rejects.toThrow('surface unavailable');

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(args.screenshotModeState.has(29)).toBe(false);
  expect(releaseQuickActionSurfaceMock).toHaveBeenCalledWith(29, args.viewportState);
});

it('surfaces both content delivery and privileged rollback failures', async () => {
  const args = createCaptureArgs();
  sendTabMessageMock.mockRejectedValueOnce(new Error('content delivery failed'));
  releaseQuickActionSurfaceMock.mockRejectedValueOnce(new Error('restore failed'));

  const error = await runCaptureFlow(args).catch((cause: unknown) => cause);

  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors).toEqual([
    expect.objectContaining({ message: 'content delivery failed' }),
    expect.objectContaining({ message: 'restore failed' }),
  ]);
});

it('rolls the surface back when the UI listener rejects capture startup', async () => {
  const args = createCaptureArgs();
  sendTabMessageMock.mockResolvedValueOnce({ success: false, error: 'startup rejected' });

  await expect(runCaptureFlow(args)).rejects.toThrow('startup rejected');

  expect(args.screenshotModeState.has(21)).toBe(false);
  expect(releaseQuickActionSurfaceMock).toHaveBeenCalledWith(21, args.viewportState);
});

it('accepts an empty delivery response only after toolbar state confirms startup', async () => {
  const args = createCaptureArgs();
  sendTabMessageMock.mockResolvedValueOnce(undefined);

  await expect(runCaptureFlow(args)).resolves.toEqual({ result: 'accepted' });

  expect(waitForContentScreenshotModeMock).toHaveBeenCalledWith(21, true);
  expect(args.screenshotModeState.get(21)).toBe(true);
});

it('rolls the surface back when toolbar state does not confirm startup', async () => {
  const args = createCaptureArgs();
  sendTabMessageMock.mockResolvedValueOnce(undefined);
  waitForContentScreenshotModeMock.mockRejectedValueOnce(new Error('mode was not enabled'));

  await expect(runCaptureFlow(args)).rejects.toThrow('mode was not enabled');

  expect(args.screenshotModeState.has(21)).toBe(false);
  expect(releaseQuickActionSurfaceMock).toHaveBeenCalledWith(21, args.viewportState);
});

it('routes owned viewer capture flows through the viewer port with preset viewport', async () => {
  const args = {
    ...createCaptureArgs(),
    pageCapability: TabRuntimeCapability.OwnedSnapshotViewer,
    webSnapshotViewerPorts: new Map(),
  };

  await runCaptureFlow(args);

  expect(prepareQuickActionSurfaceMock).toHaveBeenCalledWith(args);
  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendViewerPreparationCommandMock).toHaveBeenCalledWith(args.webSnapshotViewerPorts, 21, {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    viewport: {
      presetId: 'preset-1',
      target: 'window' as const,
      width: 1440,
      height: 900,
    },
    quickActionOverlay: {
      afterCapture: 'download_default',
      delaySeconds: 0,
      exitAfterCapture: false,
      imageFormat: 'png',
      imageQuality: 88,
    },
    autoStartCaptureType: 'visible',
  });
  expect(args.screenshotModeState.get(21)).toBe(true);
});
