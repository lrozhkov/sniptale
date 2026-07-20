import { beforeEach, expect, it, vi } from 'vitest';
import type { Settings, ViewportPreset } from '../../../../contracts/settings';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  issueContentPrivilegedActionAutoStartGrantMock,
  sendTabMessageMock,
  setupQuickActionDebuggerMock,
} = vi.hoisted(() => ({
  issueContentPrivilegedActionAutoStartGrantMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  setupQuickActionDebuggerMock: vi.fn(),
}));

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
vi.mock('./debugger', () => ({
  isDebuggerRequired: vi.fn((emulation: string) => emulation !== 'native'),
  setupQuickActionDebugger: setupQuickActionDebuggerMock,
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
    emulation: 'preset-1',
    imageFormat: 'png' as const,
    imageQuality: 88,
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
  setupQuickActionDebuggerMock.mockResolvedValue({
    cleanup: vi.fn().mockResolvedValue(undefined),
    ready: true,
  });
});

it('grants visible auto-start access to content-owned preset-session saves', async () => {
  await runCaptureFlow(createCaptureArgs('visible'));

  expect(issueContentPrivilegedActionAutoStartGrantMock).toHaveBeenCalledWith({
    actionTypes: [CaptureMessageType.CAPTURE_VISIBLE, MessageType.EXECUTE_SAVE],
    tabId: 21,
  });
  expect(sendTabMessageMock).toHaveBeenCalledWith(
    21,
    expect.objectContaining({
      autoStartCaptureType: 'visible',
      contentIntentGrant: { grantToken: 'grant-token-1' },
    })
  );
});

it('grants full auto-start access to content-owned preset-session saves', async () => {
  await runCaptureFlow(createCaptureArgs('full'));

  expect(issueContentPrivilegedActionAutoStartGrantMock).toHaveBeenCalledWith({
    actionTypes: [CaptureMessageType.CAPTURE_FULL, MessageType.EXECUTE_SAVE],
    tabId: 21,
  });
  expect(sendTabMessageMock).toHaveBeenCalledWith(
    21,
    expect.objectContaining({
      autoStartCaptureType: 'full',
      contentIntentGrant: { grantToken: 'grant-token-1' },
    })
  );
});
