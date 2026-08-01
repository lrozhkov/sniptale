import { beforeEach, describe, expect, it } from 'vitest';

import {
  createSender,
  createSendResponse,
  createTopLevelContentSender,
  expectListenerResult,
  flushPromises,
  isBackgroundTabMessageMock,
  isVideoControlMessageMock,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeVideoControlMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  authorizeCameraRecorderDocument,
  clearCameraRecorderControlGrant,
  issueCameraRecorderLaunchToken,
} from '../../../media/video/runtime/camera-recorder-control';
import { vi } from 'vitest';

const { readCameraRecorderGrantMock } = vi.hoisted(() => ({
  readCameraRecorderGrantMock: vi.fn(),
}));

vi.mock('../../../storage/video/camera-recorder-grant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../storage/video/camera-recorder-grant')>()),
  clearCameraRecorderGrant: vi.fn().mockResolvedValue(true),
  createCameraRecorderLaunchGrant: vi.fn(
    async (recordingId: string, registrationToken: string) => ({
      documentId: '',
      expiresAt: Date.now() + 60_000,
      previousRegistrationToken: null,
      registrationToken,
      recordingId,
      senderUrl: '',
      stage: 'launch' as const,
      tabId: null,
    })
  ),
  bindCameraRecorderDocumentGrant: vi.fn(async (args) => ({
    documentId: args.documentId,
    expiresAt: Date.now() + 86_400_000,
    previousRegistrationToken: args.registrationToken,
    registrationToken: args.nextRegistrationToken,
    recordingId: args.recordingId,
    senderUrl: args.senderUrl,
    stage: 'document' as const,
    tabId: args.tabId,
  })),
  readCameraRecorderGrant: readCameraRecorderGrantMock,
}));

const POPUP_ACTIVE_RECORDING_CONTROLS = [
  {
    type: VideoMessageType.CANCEL_RECORDING_START,
    controlToken: 'token-1',
    recordingId: 'rec-1',
  },
  { type: VideoMessageType.PAUSE_RECORDING, controlToken: 'token-1', recordingId: 'rec-1' },
  { type: VideoMessageType.RESUME_RECORDING, controlToken: 'token-1', recordingId: 'rec-1' },
  { type: VideoMessageType.STOP_RECORDING, controlToken: 'token-1', recordingId: 'rec-1' },
  {
    type: VideoMessageType.STOP_RECORDING,
    controlToken: 'token-1',
    discard: true,
    recordingId: 'rec-1',
  },
] as const;
const CAMERA_RECORDER_CONTROLS = [
  { type: VideoMessageType.PAUSE_RECORDING, controlToken: 'token-1', recordingId: 'rec-1' },
  { type: VideoMessageType.RESUME_RECORDING, controlToken: 'token-1', recordingId: 'rec-1' },
  { type: VideoMessageType.STOP_RECORDING, controlToken: 'token-1', recordingId: 'rec-1' },
] as const;
const CONTENT_URL = 'https://example.test/page';
const CONTENT_RECORDING_CONTROLS = [
  { type: VideoMessageType.START_RECORDING },
  { type: VideoMessageType.CANCEL_RECORDING_START, controlToken: 'token-1', recordingId: 'rec-1' },
  { controlToken: 'token-1', recordingId: 'rec-1', type: VideoMessageType.PAUSE_RECORDING },
  { controlToken: 'token-1', recordingId: 'rec-1', type: VideoMessageType.RESUME_RECORDING },
  { controlToken: 'token-1', recordingId: 'rec-1', type: VideoMessageType.STOP_RECORDING },
] as const;

async function verifiesPopupOriginActiveRecordingControls() {
  const { listener, sendResponse } = registerListener();

  isBackgroundTabMessageMock.mockReturnValue(true);
  isVideoControlMessageMock.mockReturnValue(true);

  for (const message of POPUP_ACTIVE_RECORDING_CONTROLS) {
    await dispatchPopupVideoControl(listener, sendResponse, message);
  }

  expect(routeVideoControlMessageMock).toHaveBeenCalledTimes(
    POPUP_ACTIVE_RECORDING_CONTROLS.length
  );
  for (const message of POPUP_ACTIVE_RECORDING_CONTROLS) {
    expect(routeVideoControlMessageMock).toHaveBeenCalledWith({
      message,
      resolvedTabId: undefined,
      sendResponse,
      sender: createSender(
        undefined,
        'chrome-extension://test/apps/extension/src/popup/index.html'
      ),
    });
  }
  expect(sendResponse).not.toHaveBeenCalledWith({ success: false, error: 'No tab ID' });
}

async function dispatchPopupVideoControl(
  listener: ReturnType<typeof registerListener>['listener'],
  sendResponse: ReturnType<typeof createSendResponse>,
  message: (typeof POPUP_ACTIVE_RECORDING_CONTROLS)[number]
): Promise<void> {
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  expectListenerResult(
    true,
    listener,
    message,
    createSender(undefined, 'chrome-extension://test/apps/extension/src/popup/index.html'),
    sendResponse
  );
  await flushPromises();
}

async function verifiesTabIdResolutionStaysRequired() {
  const { listener, sendResponse } = registerListener();

  isBackgroundTabMessageMock.mockReturnValue(true);
  isVideoControlMessageMock.mockReturnValue(true);
  parseBackgroundRuntimeMessageMock.mockReturnValue({ type: VideoMessageType.START_RECORDING });
  expectListenerResult(
    true,
    listener,
    { type: VideoMessageType.START_RECORDING },
    createSender(),
    sendResponse
  );
  await flushPromises();

  expect(routeVideoControlMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'No tab ID' });

  resetRuntimeMessagingMocks();
  const noTabResponse = createSendResponse();
  isBackgroundTabMessageMock.mockReturnValue(true);
  parseBackgroundRuntimeMessageMock.mockReturnValue({ type: MessageType.ENABLE_SCREENSHOT_MODE });
  expectListenerResult(
    true,
    listener,
    { type: MessageType.ENABLE_SCREENSHOT_MODE },
    createSender(),
    noTabResponse
  );
  await flushPromises();

  expect(noTabResponse).toHaveBeenCalledWith({ success: false, error: 'No tab ID' });
}

async function verifiesContentRecordingControlsAreRejected() {
  const { listener, sendResponse } = registerListener();

  isBackgroundTabMessageMock.mockReturnValue(true);
  isVideoControlMessageMock.mockReturnValue(true);
  for (const message of CONTENT_RECORDING_CONTROLS) {
    parseBackgroundRuntimeMessageMock.mockReturnValue(message);
    expectListenerResult(
      true,
      listener,
      message,
      createTopLevelContentSender(88, CONTENT_URL),
      sendResponse
    );
    await flushPromises();
  }

  expect(routeVideoControlMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledTimes(CONTENT_RECORDING_CONTROLS.length);
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized video-control route sender',
    success: false,
  });
}

async function resetVideoControlRoutingSuite(): Promise<void> {
  resetRuntimeMessagingMocks();
  readCameraRecorderGrantMock.mockReset();
  readCameraRecorderGrantMock.mockResolvedValue(null);
  await clearCameraRecorderControlGrant();
}

function registerPopupVideoControlRoutingSuite() {
  beforeEach(async () => {
    await resetVideoControlRoutingSuite();
  });

  it(
    'routes popup-origin active recording controls without a sender tab id',
    verifiesPopupOriginActiveRecordingControls
  );
  it('routes popup-origin camera starts without a sender tab id', async () => {
    const { listener, sendResponse } = registerListener();
    const message = { captureMode: CaptureMode.CAMERA, type: VideoMessageType.START_RECORDING };

    isBackgroundTabMessageMock.mockReturnValue(true);
    isVideoControlMessageMock.mockReturnValue(true);
    parseBackgroundRuntimeMessageMock.mockReturnValue(message);

    expectListenerResult(
      true,
      listener,
      message,
      createSender(undefined, 'chrome-extension://test/apps/extension/src/popup/index.html'),
      sendResponse
    );
    await flushPromises();

    expect(routeVideoControlMessageMock).toHaveBeenCalledWith({
      message,
      resolvedTabId: undefined,
      sendResponse,
      sender: createSender(
        undefined,
        'chrome-extension://test/apps/extension/src/popup/index.html'
      ),
    });
  });
  it(
    'keeps start recording and non-video tab messages behind tab id resolution',
    verifiesTabIdResolutionStaysRequired
  );
  it(
    'rejects content start, stop, pause, and resume recording controls',
    verifiesContentRecordingControlsAreRejected
  );
}

function registerCameraRecorderRoutingSuite() {
  beforeEach(async () => {
    await resetVideoControlRoutingSuite();
  });

  it(
    'rejects registered camera-recorder document controls without a sender tab id',
    verifiesCameraRecorderControlsWithoutSenderTab
  );
  it(
    'routes registered camera-recorder document controls only from the bound sender tab',
    verifiesCameraRecorderControlsWithSenderTab
  );
  it(
    'hydrates the exact persisted camera document before the first control after worker restart',
    verifiesPersistedCameraRecorderControlAfterWorkerRestart
  );
}

async function verifiesCameraRecorderControlsWithoutSenderTab() {
  const { listener, sendResponse } = registerListener();
  const cameraSender = createCameraRecorderSender();
  await authorizeCameraRecorderSender();
  isBackgroundTabMessageMock.mockReturnValue(true);
  isVideoControlMessageMock.mockReturnValue(true);

  for (const message of CAMERA_RECORDER_CONTROLS) {
    parseBackgroundRuntimeMessageMock.mockReturnValue(message);
    expectListenerResult(true, listener, message, cameraSender, sendResponse);
    await flushPromises();
  }

  expect(routeVideoControlMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized camera recorder control sender',
    success: false,
  });
}

async function verifiesCameraRecorderControlsWithSenderTab() {
  const { listener, sendResponse } = registerListener();
  const cameraSender = createCameraRecorderSender(7);
  const message = {
    type: VideoMessageType.STOP_RECORDING,
    controlToken: 'token-1',
    recordingId: 'rec-1',
  };
  await authorizeCameraRecorderSender();
  isBackgroundTabMessageMock.mockReturnValue(true);
  isVideoControlMessageMock.mockReturnValue(true);
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);

  expectListenerResult(true, listener, message, cameraSender, sendResponse);
  await flushPromises();

  expect(routeVideoControlMessageMock).toHaveBeenCalledWith({
    message,
    resolvedTabId: undefined,
    sendResponse,
    sender: cameraSender,
  });
  expect(sendResponse).not.toHaveBeenCalledWith({
    error: 'Unauthorized video-control route sender',
    success: false,
  });

  routeVideoControlMessageMock.mockClear();
  const wrongTabSender = createCameraRecorderSender(91);
  expectListenerResult(true, listener, message, wrongTabSender, sendResponse);
  await flushPromises();
  expect(routeVideoControlMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'Unauthorized camera recorder control sender',
    success: false,
  });
}

async function verifiesPersistedCameraRecorderControlAfterWorkerRestart() {
  const { listener, sendResponse } = registerListener();
  const exactSender = createCameraRecorderSender(7);
  const message = CAMERA_RECORDER_CONTROLS[2];
  await clearCameraRecorderControlGrant();
  readCameraRecorderGrantMock.mockResolvedValue({
    documentId: 'camera-document-1',
    expiresAt: Date.now() + 86_400_000,
    previousRegistrationToken: 'launch-token-1',
    registrationToken: 'reload-token-1',
    recordingId: 'rec-1',
    senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
    stage: 'document',
    tabId: 7,
  });
  isBackgroundTabMessageMock.mockReturnValue(true);
  isVideoControlMessageMock.mockReturnValue(true);
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);

  expectListenerResult(true, listener, message, exactSender, sendResponse);
  await flushPromises();
  expect(routeVideoControlMessageMock).toHaveBeenCalledOnce();

  routeVideoControlMessageMock.mockClear();
  const mismatchedSender = { ...exactSender, documentId: 'other-document' };
  expectListenerResult(true, listener, message, mismatchedSender, sendResponse);
  await flushPromises();
  expect(routeVideoControlMessageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'Unauthorized camera recorder control sender',
    success: false,
  });
}

function createCameraRecorderSender(tabId?: number): chrome.runtime.MessageSender {
  return {
    ...createSender(tabId, 'chrome-extension://test/apps/extension/src/camera-recorder/index.html'),
    documentId: 'camera-document-1',
  };
}

async function authorizeCameraRecorderSender(): Promise<void> {
  await authorizeCameraRecorderDocument({
    documentId: 'camera-document-1',
    registrationToken: await issueCameraRecorderLaunchToken('rec-1'),
    recordingId: 'rec-1',
    senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
    tabId: 7,
  });
}

describe('index.runtime-messaging video control routing', registerPopupVideoControlRoutingSuite);
describe('index.runtime-messaging camera recorder routing', registerCameraRecorderRoutingSuite);
