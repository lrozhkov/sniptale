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

function resetVideoControlRoutingSuite(): void {
  resetRuntimeMessagingMocks();
  clearCameraRecorderControlGrant();
}

function registerPopupVideoControlRoutingSuite() {
  beforeEach(() => {
    resetVideoControlRoutingSuite();
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
  beforeEach(() => {
    resetVideoControlRoutingSuite();
  });

  it(
    'routes registered camera-recorder document controls without a sender tab id',
    verifiesCameraRecorderControlsWithoutSenderTab
  );
  it(
    'routes registered camera-recorder document controls even when Chrome reports a sender tab',
    verifiesCameraRecorderControlsWithSenderTab
  );
}

async function verifiesCameraRecorderControlsWithoutSenderTab() {
  const { listener, sendResponse } = registerListener();
  const cameraSender = createCameraRecorderSender();
  authorizeCameraRecorderSender();
  isBackgroundTabMessageMock.mockReturnValue(true);
  isVideoControlMessageMock.mockReturnValue(true);

  for (const message of CAMERA_RECORDER_CONTROLS) {
    parseBackgroundRuntimeMessageMock.mockReturnValue(message);
    expectListenerResult(true, listener, message, cameraSender, sendResponse);
    await flushPromises();
  }

  expect(routeVideoControlMessageMock).toHaveBeenCalledTimes(CAMERA_RECORDER_CONTROLS.length);
}

async function verifiesCameraRecorderControlsWithSenderTab() {
  const { listener, sendResponse } = registerListener();
  const cameraSender = createCameraRecorderSender(91);
  const message = {
    type: VideoMessageType.STOP_RECORDING,
    controlToken: 'token-1',
    recordingId: 'rec-1',
  };
  authorizeCameraRecorderSender();
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
}

function createCameraRecorderSender(tabId?: number): chrome.runtime.MessageSender {
  return {
    ...createSender(tabId, 'chrome-extension://test/apps/extension/src/camera-recorder/index.html'),
    documentId: 'camera-document-1',
  };
}

function authorizeCameraRecorderSender(): void {
  authorizeCameraRecorderDocument({
    documentId: 'camera-document-1',
    launchToken: issueCameraRecorderLaunchToken('rec-1'),
    recordingId: 'rec-1',
    senderUrl: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
  });
}

describe('index.runtime-messaging video control routing', registerPopupVideoControlRoutingSuite);
describe('index.runtime-messaging camera recorder routing', registerCameraRecorderRoutingSuite);
