import { beforeEach, expect, it, vi } from 'vitest';
import type { Settings, ViewportPreset } from '../../../../contracts/settings';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  getScreenshotSurfaceBindingMock,
  issueContentPrivilegedActionAutoStartGrantMock,
  prepareQuickActionSurfaceMock,
  sendTabMessageMock,
  waitForContentToolbarReadyMock,
  waitForContentScreenshotModeMock,
} = vi.hoisted(() => ({
  getScreenshotSurfaceBindingMock: vi.fn(),
  issueContentPrivilegedActionAutoStartGrantMock: vi.fn(),
  prepareQuickActionSurfaceMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
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
  releaseQuickActionSurface: vi.fn(),
}));

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runCaptureFlow } from './flows';

function createSettings(viewportPresets: ViewportPreset[]): Settings {
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
    viewportPresets,
  };
}

function createCaptureArgs(captureMode: 'visible' | 'full') {
  return {
    action: {
      id: 'visible-action',
      status: true,
      name: 'Quick Action',
      icon: 'camera',
      screenshotMode: 'visible' as const,
      exitAfterCapture: false,
    },
    afterCapture: 'ask_preset' as const,
    captureMode,
    delaySeconds: 0,
    viewportPresetId: 'preset-1',
    imageFormat: 'png' as const,
    imageQuality: 88,
    pageAccessPort: {
      ensureActivePageAccessRuntime: vi.fn(),
      ensureNativeVisibleCaptureAuthority: vi.fn().mockResolvedValue(undefined),
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
  getScreenshotSurfaceBindingMock.mockReturnValue({
    surfaceCapabilityToken: 'surface-token-1',
    surfaceLeaseGeneration: 1,
    surfaceOperationGeneration: 1,
  });
  sendTabMessageMock.mockResolvedValue({ success: true });
  waitForContentToolbarReadyMock.mockResolvedValue({ screenshotMode: false, visible: false });
  waitForContentScreenshotModeMock.mockResolvedValue({ screenshotMode: true, visible: false });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  prepareQuickActionSurfaceMock.mockImplementation(
    async (args: ReturnType<typeof createCaptureArgs>) => {
      args.viewportState.set(args.tabId, {
        presetId: 'preset-1',
        target: 'window' as const,
        width: 1440,
        height: 900,
      });
      return { surfaceCapabilityToken: 'surface-token-1' };
    }
  );
});

it('grants visible auto-start access to content-owned preset-session saves', async () => {
  await runCaptureFlow(createCaptureArgs('visible'));

  expect(issueContentPrivilegedActionAutoStartGrantMock).toHaveBeenCalledWith({
    actionTypes: [CaptureMessageType.CAPTURE_VISIBLE, MessageType.EXECUTE_SAVE],
    libraryActionTypes: [],
    tabId: 21,
  });
  expect(sendTabMessageMock).toHaveBeenCalledWith(
    21,
    expect.objectContaining({
      autoStartCaptureType: 'visible',
      contentIntentGrant: { grantToken: 'grant-token-1' },
    }),
    { frameId: 0 }
  );
});

it('grants full auto-start access to content-owned preset-session saves', async () => {
  await runCaptureFlow(createCaptureArgs('full'));

  expect(issueContentPrivilegedActionAutoStartGrantMock).toHaveBeenCalledWith({
    actionTypes: [CaptureMessageType.CAPTURE_FULL, MessageType.EXECUTE_SAVE],
    libraryActionTypes: [],
    tabId: 21,
  });
  expect(sendTabMessageMock).toHaveBeenCalledWith(
    21,
    expect.objectContaining({
      autoStartCaptureType: 'full',
      contentIntentGrant: { grantToken: 'grant-token-1' },
    }),
    { frameId: 0 }
  );
});
