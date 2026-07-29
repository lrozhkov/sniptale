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
} = vi.hoisted(() => ({
  issueContentPrivilegedActionAutoStartGrantMock: vi.fn(),
  ensureNativeVisibleCaptureAuthorityMock: vi.fn(),
  getScreenshotSurfaceBindingMock: vi.fn(),
  prepareQuickActionSurfaceMock: vi.fn(),
  releaseQuickActionSurfaceAfterFailureMock: vi.fn(),
  releaseQuickActionSurfaceMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  sendViewerPreparationCommandMock: vi.fn(),
}));

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

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
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
      showSettings: true,
    },
    saveCapturesToGallery: false,
    defaultViewportPresetId: null,
    imageFormat: 'png',
    imageQuality: 90,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    viewportPresets,
  };
}

function createQuickAction(
  overrides: Partial<{
    id: string;
    screenshotMode: 'visible' | 'full' | 'selection';
    afterCapture: 'download_default' | 'ask_preset' | 'ask_system' | 'scenario' | 'edit' | 'copy';
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
      { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
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
        target: 'viewport' as const,
        width: 1440,
        height: 900,
        enabled: true,
        order: 0,
      },
    ]),
    tabId: 21,
    viewportState: new Map<
      number,
      { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
    >([[21, { presetId: 'test:viewport', target: 'viewport' as const, width: 1440, height: 900 }]]),
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
  sendTabMessageMock.mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  sendViewerPreparationCommandMock.mockResolvedValue(undefined);
  prepareQuickActionSurfaceMock.mockImplementation(
    async (args: ReturnType<typeof createCaptureArgs>) => {
      if (args.viewportPresetId) {
        args.viewportState.set(args.tabId, {
          presetId: args.viewportPresetId,
          target: 'viewport' as const,
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
        throw new AggregateError([cause, rollbackError], 'rollback failed');
      }
      throw cause;
    }
  );
  ensureNativeVisibleCaptureAuthorityMock.mockResolvedValue(undefined);
});

it('starts screenshot selection and marks the tab active', async () => {
  const args = createSelectionArgs();

  await runSelectionFlow(args);

  expect(sendTabMessageMock).toHaveBeenCalledWith(17, {
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
  });
  expect(ensureNativeVisibleCaptureAuthorityMock).toHaveBeenCalledWith(17);
  expect(issueContentPrivilegedActionAutoStartGrantMock).toHaveBeenCalledWith({
    actionTypes: [CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP],
    tabId: 17,
  });
  expect(sendViewerPreparationCommandMock).not.toHaveBeenCalled();
  expect(args.screenshotModeState.get(17)).toBe(true);
});

it('skips debugger setup for native selection flows and keeps viewport null', async () => {
  const args = createSelectionArgs();

  await runSelectionFlow(args);

  expect(prepareQuickActionSurfaceMock).toHaveBeenCalledWith(args);
  expect(sendTabMessageMock).toHaveBeenCalledWith(
    17,
    expect.objectContaining({
      autoStartSelection: true,
      viewport: null,
    })
  );
});

it('routes owned viewer selection flows through the viewer port without debugger setup', async () => {
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

  expect(sendTabMessageMock).toHaveBeenCalledWith(21, {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    viewport: {
      presetId: 'preset-1',
      target: 'viewport' as const,
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
  });
  expect(issueContentPrivilegedActionAutoStartGrantMock).toHaveBeenCalledWith({
    actionTypes: [CaptureMessageType.CAPTURE_VISIBLE],
    tabId: 21,
  });
  expect(sendViewerPreparationCommandMock).not.toHaveBeenCalled();
  expect(ensureNativeVisibleCaptureAuthorityMock).not.toHaveBeenCalled();
  expect(args.screenshotModeState.get(21)).toBe(true);
});

it('blocks native visible quick actions without native visible-capture authority', async () => {
  const args = {
    ...createCaptureArgs(),
    viewportPresetId: null,
    viewportState: new Map<
      number,
      { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
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
    { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
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
      target: 'viewport' as const,
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
