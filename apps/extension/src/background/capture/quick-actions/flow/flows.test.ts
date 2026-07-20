import { beforeEach, expect, it, vi } from 'vitest';
import type { Settings, ViewportPreset } from '../../../../contracts/settings';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  issueContentPrivilegedActionAutoStartGrantMock,
  ensureNativeVisibleCaptureAuthorityMock,
  sendTabMessageMock,
  sendViewerPreparationCommandMock,
  setupQuickActionDebuggerMock,
} = vi.hoisted(() => ({
  issueContentPrivilegedActionAutoStartGrantMock: vi.fn(),
  ensureNativeVisibleCaptureAuthorityMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  sendViewerPreparationCommandMock: vi.fn(),
  setupQuickActionDebuggerMock: vi.fn(),
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

vi.mock('./debugger', () => ({
  isDebuggerRequired: vi.fn((emulation: string) => emulation !== 'native'),
  setupQuickActionDebugger: setupQuickActionDebuggerMock,
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
    defaultViewportId: 'native',
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
    emulation: 'native',
    imageFormat: 'jpeg' as const,
    imageQuality: 75,
    pageAccessPort: {
      ensureActivePageAccessRuntime: vi.fn(),
      ensureNativeVisibleCaptureAuthority: ensureNativeVisibleCaptureAuthorityMock,
    },
    screenshotModeState: new Map<number, boolean>(),
    settings: createSettings([]),
    tabId: 17,
    viewportState: new Map<number, { width: number; height: number } | null>(),
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
    emulation: 'preset-1',
    imageFormat: 'png' as const,
    imageQuality: 88,
    pageAccessPort: {
      ensureActivePageAccessRuntime: vi.fn(),
      ensureNativeVisibleCaptureAuthority: ensureNativeVisibleCaptureAuthorityMock,
    },
    screenshotModeState: new Map<number, boolean>(),
    settings: createSettings([{ id: 'preset-1', width: 1440, height: 900, label: 'Preset 1' }]),
    tabId: 21,
    viewportState: new Map<number, { width: number; height: number } | null>([
      [21, { width: 1440, height: 900 }],
    ]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  issueContentPrivilegedActionAutoStartGrantMock.mockReturnValue({ grantToken: 'grant-token-1' });
  sendTabMessageMock.mockResolvedValue(undefined);
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  sendViewerPreparationCommandMock.mockResolvedValue(undefined);
  setupQuickActionDebuggerMock.mockResolvedValue({
    cleanup: vi.fn().mockResolvedValue(undefined),
    ready: true,
  });
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

  expect(setupQuickActionDebuggerMock).not.toHaveBeenCalled();
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

  expect(setupQuickActionDebuggerMock).not.toHaveBeenCalled();
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
    viewport: { width: 1440, height: 900 },
    contentIntentGrant: { grantToken: 'grant-token-1' },
    quickActionOverlay: {
      afterCapture: 'download_default',
      delaySeconds: 0,
      exitAfterCapture: false,
      imageFormat: 'png',
      imageQuality: 88,
    },
    autoStartCaptureType: 'visible',
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
    emulation: 'native',
    viewportState: new Map<number, { width: number; height: number } | null>(),
  };
  ensureNativeVisibleCaptureAuthorityMock.mockRejectedValueOnce(new Error('capture authority'));

  await expect(runCaptureFlow(args)).rejects.toThrow('capture authority');

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(setupQuickActionDebuggerMock).not.toHaveBeenCalled();
});

it('stops before messaging when debugger attachment fails', async () => {
  const args = createCaptureArgs();
  setupQuickActionDebuggerMock.mockResolvedValue({ ready: false });
  args.emulation = 'preset-2';
  args.imageQuality = 90;
  args.settings = createSettings([{ id: 'preset-2', width: 1280, height: 720, label: 'Preset 2' }]);
  args.tabId = 29;
  args.viewportState = new Map<number, { width: number; height: number } | null>();

  await runCaptureFlow(args);

  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(args.screenshotModeState.has(29)).toBe(false);
});

it('routes owned viewer capture flows through the viewer port with preset viewport', async () => {
  const args = {
    ...createCaptureArgs(),
    pageCapability: TabRuntimeCapability.OwnedSnapshotViewer,
    webSnapshotViewerPorts: new Map(),
  };

  await runCaptureFlow(args);

  expect(setupQuickActionDebuggerMock).not.toHaveBeenCalled();
  expect(sendTabMessageMock).not.toHaveBeenCalled();
  expect(sendViewerPreparationCommandMock).toHaveBeenCalledWith(args.webSnapshotViewerPorts, 21, {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    viewport: { width: 1440, height: 900 },
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
