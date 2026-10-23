import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingSurfaceCommandMessage } from '@sniptale/runtime-contracts/video/types/messages.surface';
import type { RouteCaptureMessage } from '../../../capture/routing';
import {
  canRouteCaptureMessageFromSender,
  getUnauthorizedPrivilegedTabRouteSenderReason,
} from './sender-policy';

const runtimeInfoGetUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: runtimeInfoGetUrlMock,
  },
}));

const POPUP_URL = 'chrome-extension://test/apps/extension/src/popup/index.html';
const EDITOR_URL = 'chrome-extension://test/apps/extension/src/editor/index.html?session=s1';
const SETTINGS_URL = 'chrome-extension://test/apps/extension/src/settings/index.html';
const VIEWER_URL =
  'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1';

function createTab(tabId: number): chrome.tabs.Tab {
  return {
    active: true,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: true,
    id: tabId,
    incognito: false,
    index: 0,
    lastAccessed: 0,
    pinned: false,
    selected: true,
    status: 'complete',
    title: 'Example',
    url: 'https://example.test',
    windowId: 1,
  };
}

function createSender(props: {
  documentId?: string;
  frameId?: number;
  tabId?: number;
  url?: string;
}): chrome.runtime.MessageSender {
  return {
    ...(props.documentId === undefined ? {} : { documentId: props.documentId }),
    ...(props.frameId === undefined ? {} : { frameId: props.frameId }),
    ...(props.tabId === undefined ? {} : { tab: createTab(props.tabId) }),
    ...(props.url === undefined ? {} : { url: props.url }),
  };
}

function createTopLevelContentSender(tabId = 7): chrome.runtime.MessageSender {
  return createSender({
    documentId: `document-${tabId}`,
    frameId: 0,
    tabId,
    url: 'https://example.test/page',
  });
}

function canRoute(message: RouteCaptureMessage, sender: chrome.runtime.MessageSender): boolean {
  return canRouteCaptureMessageFromSender({ message, resolvedTabId: 7, sender });
}

it('allows capture messages from the resolved sender tab', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );

  expect(
    canRoute({ type: CaptureMessageType.CAPTURE_VISIBLE }, createTopLevelContentSender())
  ).toBe(true);
  expect(
    canRoute(
      { type: CaptureMessageType.CAPTURE_VISIBLE },
      createSender({ tabId: 8, url: POPUP_URL })
    )
  ).toBe(false);
  expect(
    canRoute(
      { type: CaptureMessageType.CAPTURE_VISIBLE },
      createSender({ tabId: 7, url: SETTINGS_URL })
    )
  ).toBe(false);
});

it('rejects privileged content routes from iframe or document-less senders', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );
  const message = { type: CaptureMessageType.CAPTURE_VISIBLE };

  expect(
    canRoute(
      message,
      createSender({
        documentId: 'iframe-document',
        frameId: 4,
        tabId: 7,
        url: 'https://example.test/frame',
      })
    )
  ).toBe(false);
  expect(
    canRoute(message, createSender({ frameId: 0, tabId: 7, url: 'https://example.test/page' }))
  ).toBe(false);
  expect(
    canRoute(
      message,
      createSender({ documentId: 'document-7', tabId: 7, url: 'https://example.test/page' })
    )
  ).toBe(false);
});

it('applies top-level content proof to non-capture privileged route families', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );

  expect(
    getUnauthorizedPrivilegedTabRouteSenderReason({
      family: 'scenario',
      resolvedTabId: 7,
      sender: createSender({
        documentId: 'iframe-document',
        frameId: 2,
        tabId: 7,
        url: 'https://example.test/frame',
      }),
    })
  ).toBe('Unauthorized scenario route sender');
  expect(
    getUnauthorizedPrivilegedTabRouteSenderReason({
      family: 'tab-mode',
      resolvedTabId: 7,
      sender: createSender({ frameId: 0, tabId: 7, url: 'https://example.test/page' }),
    })
  ).toBe('Unauthorized tab-mode route sender');
});

it('keeps video-control privileged tab routes popup-only', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );

  expect(
    getUnauthorizedPrivilegedTabRouteSenderReason({
      family: 'video-control',
      resolvedTabId: 7,
      sender: createSender({ url: POPUP_URL }),
    })
  ).toBeNull();
  expect(
    getUnauthorizedPrivilegedTabRouteSenderReason({
      family: 'video-control',
      resolvedTabId: 7,
      sender: createTopLevelContentSender(),
    })
  ).toBe('Unauthorized video-control route sender');
});

it('allows only popup quick-action targeted capture routes without a sender tab', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );

  expect(
    canRoute(
      { actionId: 'quick-1', tabId: 7, type: 'TRIGGER_QUICK_ACTION' },
      createSender({ url: POPUP_URL })
    )
  ).toBe(true);
  expect(
    canRoute(
      {
        type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
        tabId: 7,
        config: {
          screenshotMode: 'desktop',
          viewportPresetId: null,
          delay: null,
          afterCapture: 'download_default',
          imageFormat: null,
          imageQuality: null,
          exitAfterCapture: false,
        },
      },
      createSender({ url: POPUP_URL })
    )
  ).toBe(true);
  expect(
    canRoute(
      {
        type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
        tabId: 7,
        config: {
          screenshotMode: 'visible',
          viewportPresetId: null,
          delay: null,
          afterCapture: 'download_default',
          imageFormat: null,
          imageQuality: null,
          exitAfterCapture: false,
        },
      },
      createTopLevelContentSender()
    )
  ).toBe(false);
  expect(
    canRoute(
      { exportRunId: 'export-run-1', type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
      createSender({ url: POPUP_URL })
    )
  ).toBe(false);
});

it('accepts popup desktop selections only from the popup document', () => {
  runtimeInfoGetUrlMock.mockReturnValue(
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );
  const message = {
    actionId: 'desktop-action',
    desktopSelection: {
      dataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=',
      height: 1,
      requestId: 'request-1',
      reservationToken: 'reservation-1',
      status: 'selected' as const,
      width: 1,
    },
    tabId: 7,
    type: MessageType.TRIGGER_QUICK_ACTION,
  };

  expect(canRoute(message, createSender({ url: POPUP_URL }))).toBe(true);
  expect(canRoute(message, createTopLevelContentSender())).toBe(false);
  expect(canRoute(message, createSender({ url: VIEWER_URL }))).toBe(false);
});

it('allows owned snapshot viewer routes and rejects unrelated extension pages', () => {
  runtimeInfoGetUrlMock.mockImplementation((path: string) => `chrome-extension://test/${path}`);

  expect(
    canRoute(
      {
        snapshotSessionId: 'snapshot-session-1',
        type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
        urls: ['https://example.test/asset.png'],
      },
      createSender({ url: VIEWER_URL })
    )
  ).toBe(true);
  expect(
    canRoute(
      { actionId: 'quick-1', tabId: 7, type: 'TRIGGER_QUICK_ACTION' },
      createSender({ url: SETTINGS_URL })
    )
  ).toBe(false);
});

it('allows editor save routes without allowing arbitrary editor capture routes', () => {
  runtimeInfoGetUrlMock.mockImplementation((path: string) => `chrome-extension://test/${path}`);

  expect(
    canRoute(
      {
        actionType: 'download_default',
        dataUrl: 'data:image/png;base64,1',
        filename: 'capture.png',
        type: MessageType.EXECUTE_SAVE,
      },
      createSender({ tabId: 7, url: EDITOR_URL })
    )
  ).toBe(true);
  expect(
    canRoute(
      { exportRunId: 'export-run-1', type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
      createSender({ tabId: 7, url: EDITOR_URL })
    )
  ).toBe(false);
});

describe('recording permission frame sender', () => {
  const permissionFrameUrl =
    'chrome-extension://test/apps/extension/src/media-permission/index.html';
  const request: VideoRecordingSurfaceCommandMessage = {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
    capabilityEpoch: 2,
    documentGeneration: 3,
    recordingId: null,
    command: { kind: 'list-media-devices', deviceKind: 'audioinput', requestPermission: false },
  };
  const sender: chrome.runtime.MessageSender = {
    id: 'test',
    documentId: 'permission-document',
    frameId: 4,
    tab: createTab(7),
    url: permissionFrameUrl,
  };
  const route = <Message extends { type: string }>(message: Message, candidate = sender) =>
    getUnauthorizedPrivilegedTabRouteSenderReason({
      family: 'video-recording-surface',
      resolvedTabId: 7,
      message,
      sender: candidate,
    });

  beforeEach(() => {
    vi.stubGlobal('chrome', { runtime: { id: 'test' } });
    runtimeInfoGetUrlMock.mockImplementation((path: string) => `chrome-extension://test/${path}`);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('admits only explicitly read-only media lists from the owned child document', () => {
    expect(route(request)).toBeNull();
    expect(
      route({
        ...request,
        command: { kind: 'list-media-devices', deviceKind: 'videoinput', requestPermission: false },
      })
    ).toBeNull();
    expect(
      getUnauthorizedPrivilegedTabRouteSenderReason({
        family: 'video-control',
        message: request,
        resolvedTabId: 7,
        sender,
      })
    ).toBe('Unauthorized video-control route sender');
  });

  it('uses the canonical extension origin when the web-accessible URL is dynamic', () => {
    runtimeInfoGetUrlMock.mockImplementation((path: string) =>
      path === 'apps/extension/src/media-permission/index.html'
        ? `chrome-extension://dynamic-resource-id/${path}`
        : `chrome-extension://test/${path}`
    );
    expect(route(request)).toBeNull();
    expect(
      route(request, {
        ...sender,
        url: 'chrome-extension://dynamic-resource-id/apps/extension/src/media-permission/index.html',
      })
    ).toBe('Unauthorized video recording surface sender');
  });

  it.each([
    { kind: 'list-media-devices', deviceKind: 'audioinput' },
    { kind: 'list-media-devices', deviceKind: 'audioinput', requestPermission: true },
    { kind: 'list-media-devices', deviceKind: 'audioinput', requestPermission: 'false' },
    { kind: 'list-media-devices', deviceKind: 'audioinput', requestPermission: false, extra: true },
    { kind: 'set-microphone-enabled', enabled: true },
    { kind: 'set-webcam-enabled', enabled: true },
    { kind: 'select-microphone-device', deviceId: 'device' },
    { kind: 'select-webcam-device', deviceId: 'device' },
    { kind: 'set-toolbar-requested', enabled: true },
    { kind: 'set-auto-fade-delay', delay: 0 },
    {
      kind: 'set-spotlight-settings',
      cursorHaloEnabled: true,
      cursorDimmingEnabled: true,
      clickAnimationEnabled: true,
    },
    { kind: 'update-embedded-camera', appearance: {} },
    { kind: 'cancel-start' },
    { kind: 'pause' },
    { kind: 'resume' },
    { kind: 'stop' },
  ])('rejects other commands and permission-request variants: %j', (command) => {
    expect(route({ ...request, command })).toBe('Unauthorized video recording surface sender');
  });

  it.each([
    VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE,
    VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
    VideoMessageType.RELEASE_VIDEO_RECORDING_SURFACE,
    VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER,
    VideoMessageType.VIDEO_RECORDING_CAMERA_CLOSE,
  ])('rejects other surface messages: %s', (type) => {
    expect(route({ ...request, type })).toBe('Unauthorized video recording surface sender');
  });

  it.each([
    { id: 'another-extension' },
    { frameId: 0 },
    { frameId: -1 },
    { frameId: 1.5 },
    { documentId: '' },
    { tab: createTab(8) },
    { url: 'https://example.test/apps/extension/src/media-permission/index.html' },
    { url: 'chrome-extension://foreign/apps/extension/src/media-permission/index.html' },
    { url: SETTINGS_URL },
    { url: `${permissionFrameUrl}/extra` },
  ])('rejects missing or foreign document context: %j', (override) => {
    expect(route(request, { ...sender, ...override })).toBe(
      'Unauthorized video recording surface sender'
    );
  });

  it.each(['id', 'frameId', 'documentId', 'tab', 'url'] as const)(
    'rejects omitted document context: %s',
    (field) => {
      const { [field]: omitted, ...candidate } = sender;
      expect(omitted).toBeDefined();
      expect(route(request, candidate)).toBe('Unauthorized video recording surface sender');
    }
  );

  it('rejects malformed surface authority fields at ingress', () => {
    expect(route({ ...request, surfaceToken: 3 })).toBe(
      'Unauthorized video recording surface sender'
    );
    expect(route({ ...request, documentGeneration: '3' })).toBe(
      'Unauthorized video recording surface sender'
    );
    expect(route({ ...request, capabilityEpoch: Number.NaN })).toBe(
      'Unauthorized video recording surface sender'
    );
  });
});
