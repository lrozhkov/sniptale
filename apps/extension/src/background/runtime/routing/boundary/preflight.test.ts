import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSender,
  expectListenerResult,
  flushPromises,
  isBackgroundInternalSignalMessageMock,
  isVideoRuntimeMessageMock,
  loggerWarnMock,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
  routeAISecretUnlockMessageMock,
  routeAiSettingsMutationMessageMock,
  routeVideoRuntimeMessageMock,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { resetPopupTabRouteCapabilitiesForTests } from '../capabilities/popup-tab/route-capabilities';

function verifiesRegistration() {
  const { subscribeMock, deps } = registerListener();
  expect(deps.captureGuardState.isCapturing).toBe(false);
  expect(subscribeMock).toHaveBeenCalledTimes(1);
}

function verifiesParseFailure() {
  const { listener, sendResponse } = registerListener();
  parseBackgroundRuntimeMessageMock.mockImplementation(() => {
    throw new Error('bad message');
  });
  expectListenerResult(false, listener, { type: 'BROKEN' }, createSender(5), sendResponse);
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unknown message type' });
  expect(loggerWarnMock).toHaveBeenCalledWith('Rejected runtime message without a valid contract');
}

function verifiesInternalSignalShortCircuit() {
  const { listener, sendResponse } = registerListener();
  parseBackgroundRuntimeMessageMock.mockReturnValue({ type: 'KEEP_ALIVE' });
  isBackgroundInternalSignalMessageMock.mockReturnValue(true);
  expectListenerResult(false, listener, { type: 'KEEP_ALIVE' }, createSender(5), sendResponse);
  expect(sendResponse).not.toHaveBeenCalled();
}

function verifiesAiSettingsMutationRouteShortCircuit() {
  const { listener, sendResponse } = registerListener();
  const sender = createSender(
    undefined,
    'chrome-extension://test/apps/extension/src/settings/index.html'
  );
  const message = { type: 'AI_SETTINGS_MUTATION', operation: 'save-default-model' };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  routeAiSettingsMutationMessageMock.mockReturnValue(true);
  expectListenerResult(true, listener, message, sender, sendResponse);
  expect(routeAiSettingsMutationMessageMock).toHaveBeenCalledWith(message, sender, sendResponse);
}

function verifiesAISecretUnlockRouteShortCircuit() {
  const { listener, sendResponse } = registerListener();
  const sender = createSender(
    undefined,
    'chrome-extension://test/apps/extension/src/settings/index.html'
  );
  const message = { type: 'AI_SECRET_UNLOCK', operation: 'submit' };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  routeAISecretUnlockMessageMock.mockReturnValue(true);
  expectListenerResult(true, listener, message, sender, sendResponse);
  expect(routeAISecretUnlockMessageMock).toHaveBeenCalledWith(
    message,
    sender,
    sendResponse,
    expect.objectContaining({
      authorityFamily: 'ai-secret-unlock-authority',
      preauthorization: { kind: 'ai-secret-unlock-route' },
    })
  );
}

async function verifiesPopupTabRouteCapabilityShortCircuit() {
  const { listener, sendResponse } = registerListener();
  const message = {
    operation: MessageType.EXPORT_POPUP_PREVIEW,
    requestId: 'route-req-1',
    tabId: 7,
    type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);

  expectListenerResult(
    true,
    listener,
    message,
    createSender(undefined, 'chrome-extension://test/apps/extension/src/popup/index.html'),
    sendResponse
  );
  await flushPromises();
  expect(sendResponse).toHaveBeenCalledTimes(1);
}

function verifiesVideoRuntimeRouteResult() {
  const { listener, sendResponse } = registerListener();
  parseBackgroundRuntimeMessageMock.mockReturnValue({ type: VideoMessageType.GET_RECORDING_STATE });
  isVideoRuntimeMessageMock.mockReturnValue(true);
  routeVideoRuntimeMessageMock.mockReturnValue({ handled: true, keepChannelOpen: true });
  expectListenerResult(
    true,
    listener,
    { type: VideoMessageType.GET_RECORDING_STATE },
    createSender(9),
    sendResponse
  );
  expect(routeVideoRuntimeMessageMock).toHaveBeenCalledWith(
    { type: VideoMessageType.GET_RECORDING_STATE },
    sendResponse,
    9,
    createSender(9),
    undefined
  );
}

function verifiesOffscreenOnlyVideoRuntimeSenderGate() {
  const { listener, sendResponse } = registerListener();
  const message = {
    type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
    recordingId: 'rec-1',
  };
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);
  isVideoRuntimeMessageMock.mockReturnValue(true);

  expectListenerResult(false, listener, message, createSender(9), sendResponse);
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized offscreen sender',
  });
  expect(routeVideoRuntimeMessageMock).not.toHaveBeenCalled();

  sendResponse.mockClear();
  routeVideoRuntimeMessageMock.mockReturnValue({ handled: true, keepChannelOpen: false });
  expectListenerResult(
    false,
    listener,
    message,
    createSender(undefined, 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html'),
    sendResponse
  );
  expect(routeVideoRuntimeMessageMock).toHaveBeenCalledWith(
    message,
    sendResponse,
    undefined,
    createSender(undefined, 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html'),
    undefined
  );

  const downloadMessage = {
    type: VideoMessageType.DOWNLOAD_RECORDING,
    recordingId: 'rec-1',
    filename: 'clip.webm',
  };
  sendResponse.mockClear();
  routeVideoRuntimeMessageMock.mockClear();
  parseBackgroundRuntimeMessageMock.mockReturnValue(downloadMessage);

  expectListenerResult(false, listener, downloadMessage, createSender(9), sendResponse);
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized offscreen sender',
  });
  expect(routeVideoRuntimeMessageMock).not.toHaveBeenCalled();
}

function verifiesUnknownRuntimeMessageAfterParsing() {
  const { listener, sendResponse } = registerListener();
  parseBackgroundRuntimeMessageMock.mockReturnValue({ type: 'UNHANDLED_RUNTIME' });
  expectListenerResult(
    false,
    listener,
    { type: 'UNHANDLED_RUNTIME' },
    createSender(5),
    sendResponse
  );
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unknown message type' });
  expect(loggerWarnMock).toHaveBeenCalledWith('Unknown background runtime message type', {
    type: 'UNHANDLED_RUNTIME',
  });
}

type RuntimeMessagingGuardCase = [string, () => void | Promise<void>];

const runtimeMessagingGuardCases: RuntimeMessagingGuardCase[] = [
  [
    'registers the background runtime listener through the shared runtime seam',
    verifiesRegistration,
  ],
  ['rejects messages that fail boundary parsing', verifiesParseFailure],
  ['short-circuits background internal signals', verifiesInternalSignalShortCircuit],
  [
    'returns early when the AI settings mutation route handles the message',
    verifiesAiSettingsMutationRouteShortCircuit,
  ],
  [
    'returns early when the AI secret unlock route handles the message',
    verifiesAISecretUnlockRouteShortCircuit,
  ],
  [
    'returns early when the popup tab route capability request is handled',
    verifiesPopupTabRouteCapabilityShortCircuit,
  ],
  ['returns the video runtime router keepChannelOpen result', verifiesVideoRuntimeRouteResult],
  [
    'rejects offscreen-only video events from non-offscreen senders',
    verifiesOffscreenOnlyVideoRuntimeSenderGate,
  ],
  [
    'rejects parsed runtime messages that are not routable in background',
    verifiesUnknownRuntimeMessageAfterParsing,
  ],
];

describe('index.runtime-messaging guards', () => {
  beforeEach(() => {
    resetRuntimeMessagingMocks();
    resetPopupTabRouteCapabilitiesForTests();
  });

  for (const [name, verifier] of runtimeMessagingGuardCases) {
    it(name, verifier);
  }
});
