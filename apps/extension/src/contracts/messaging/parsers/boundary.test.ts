import { describe, expect, it } from 'vitest';

import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  parseBackgroundRuntimeMessage,
  parseContentTabMessage,
  parseOffscreenRuntimeMessage,
  parsePopupRuntimeMessage,
  parseRuntimeRequestMessage,
  parseRuntimeResponseForRequest,
  parseTabRequestMessage,
  parseTabResponseForMessage,
  parseTabResponseForRequest,
} from './boundary';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  RegionCaptureControlMessageType,
  VideoMessageType,
} from '@sniptale/runtime-contracts/video/messages';

function verifyBackgroundRuntimeMessageParsing() {
  const message = parseBackgroundRuntimeMessage({
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    autoStartCaptureType: 'visible',
  });

  expect(message.type).toBe(MessageType.ENABLE_SCREENSHOT_MODE);
}

function verifyScenarioEditorLlmRuntimeMessageParsing() {
  const message = parseBackgroundRuntimeMessage({
    type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
    contractVersion: 3,
    instruction: 'Rewrite steps',
    llmSessionToken: 'llm-session-token-1',
    projectSnapshotJson: '{"steps":[]}',
    attachments: [],
    modelId: null,
  });

  expect(message.type).toBe(MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM);
}

function verifyUnsupportedPopupRuntimeMessageRejected() {
  expect(() =>
    parsePopupRuntimeMessage({
      type: MessageType.ENABLE_SCREENSHOT_MODE,
    })
  ).toThrow(MessageContractError);
}

function verifyMalformedContentPayloadRejection() {
  expect(() =>
    parseContentTabMessage({
      type: RegionCaptureControlMessageType.START,
    })
  ).toThrow(MessageContractError);
}

function verifyOffscreenRuntimeMessageParsing() {
  const message = parseOffscreenRuntimeMessage({
    type: VideoMessageType.GET_DESKTOP_MEDIA,
    capabilityToken: 'test-capability',
    captureMode: CaptureMode.SCREEN,
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
  });

  expect(message.type).toBe(VideoMessageType.GET_DESKTOP_MEDIA);
}

function verifyOffscreenErrorPhaseParsing() {
  const message = parseBackgroundRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_ERROR,
    error: 'stop failed',
    phase: 'stop',
  });

  expect(message).toEqual({
    type: VideoMessageType.OFFSCREEN_ERROR,
    error: 'stop failed',
    phase: 'stop',
  });
}

function verifyInvalidOffscreenErrorPhaseRejected() {
  expect(() =>
    parseBackgroundRuntimeMessage({
      type: VideoMessageType.OFFSCREEN_ERROR,
      error: 'bad phase',
      phase: 'invalid',
    })
  ).toThrow(MessageContractError);
}

function verifyPopupRuntimeSyncMessageParsing() {
  const message = parsePopupRuntimeMessage({
    type: VideoMessageType.RECORDING_STATE_SYNC,
    state: {
      status: 'recording',
      duration: 12,
      countdownEndsAt: null,
      captureMode: CaptureMode.TAB,
      captureSource: null,
      viewportPreset: null,
      error: null,
    },
  });

  expect(message.type).toBe(VideoMessageType.RECORDING_STATE_SYNC);
}

function verifyInvalidBackgroundImageDataRejected() {
  expect(() =>
    parseBackgroundRuntimeMessage({
      type: MessageType.OPEN_EDITOR_WITH_IMAGE,
      dataUrl: 'not-a-data-url',
    })
  ).toThrow(MessageContractError);

  expect(() =>
    parseBackgroundRuntimeMessage({
      type: MessageType.EXECUTE_SAVE,
      dataUrl: 'https://example.com/image.png',
      filename: 'capture.png',
    })
  ).toThrow(MessageContractError);
}

function verifyInvalidContentImageDataRejected() {
  expect(() =>
    parseContentTabMessage({
      type: MessageType.COPY_IMAGE_TO_CLIPBOARD,
      dataUrl: 'broken-image',
    })
  ).toThrow(MessageContractError);

  expect(() =>
    parseContentTabMessage({
      type: MessageType.SHOW_SAVE_DIALOG,
      dataUrl: 'broken-image',
      filename: 'capture.png',
    })
  ).toThrow(MessageContractError);
}

function verifyRemovedNavigationLockMessagesRejected() {
  expect(() =>
    parseBackgroundRuntimeMessage({
      type: 'ENABLE_NAVIGATION_LOCK',
      tabId: 1,
    })
  ).toThrow(MessageContractError);

  expect(() =>
    parseContentTabMessage({
      type: 'DISABLE_NAVIGATION_LOCK',
      tabId: 1,
    })
  ).toThrow(MessageContractError);
}

function verifyDiagnosticLoggerTabMessageParsing() {
  expect(
    parseContentTabMessage({
      type: VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER,
      recordingId: 'recording-1',
    })
  ).toEqual({
    type: VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER,
    recordingId: 'recording-1',
  });

  expect(
    parseContentTabMessage({
      type: VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
    })
  ).toEqual({
    type: VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
  });
}

function verifyGenericBoundaryParserFacades() {
  const runtimeMessage = parseRuntimeRequestMessage({
    type: MessageType.TRIGGER_QUICK_ACTION,
    actionId: 'copy',
  });
  const tabMessage = parseTabRequestMessage({
    type: MessageType.COPY_TEXT_TO_CLIPBOARD,
    text: 'copied',
  });

  expect(runtimeMessage.type).toBe(MessageType.TRIGGER_QUICK_ACTION);
  expect(parseRuntimeResponseForRequest(runtimeMessage, { success: true })).toEqual({
    success: true,
  });
  expect(tabMessage.type).toBe(MessageType.COPY_TEXT_TO_CLIPBOARD);
  expect(parseTabResponseForMessage(MessageType.COPY_TEXT_TO_CLIPBOARD, { success: true })).toEqual(
    { success: true }
  );
  expect(parseTabResponseForRequest(tabMessage, { success: false, error: 'denied' })).toEqual({
    success: false,
    error: 'denied',
  });
}

function verifyScreenshotModeStatusCapabilityResponseParsing() {
  const runtimeMessage = parseRuntimeRequestMessage({
    type: MessageType.SCREENSHOT_MODE_STATUS,
  });

  expect(
    parseRuntimeResponseForRequest(runtimeMessage, {
      success: true,
      enabled: false,
      supported: false,
      unsupportedReason: 'Screen capture is unavailable',
      viewport: null,
    })
  ).toEqual({
    success: true,
    enabled: false,
    supported: false,
    unsupportedReason: 'Screen capture is unavailable',
    viewport: null,
  });
}

function verifyWebSnapshotTabAuthorityFieldParsing() {
  expect(
    parseTabRequestMessage({
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: true,
      requestId: 'req-web',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    })
  ).toEqual({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: true,
    requestId: 'req-web',
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  });

  expect(() =>
    parseTabRequestMessage({
      requestId: 'req-web',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    })
  ).toThrow(MessageContractError);
}

describe('message boundary parsers', () => {
  it('accepts valid background runtime messages', verifyBackgroundRuntimeMessageParsing);
  it(
    'accepts valid scenario editor AI runtime messages',
    verifyScenarioEditorLlmRuntimeMessageParsing
  );
  it(
    'rejects runtime messages unsupported by the popup boundary',
    verifyUnsupportedPopupRuntimeMessageRejected
  );
  it(
    'rejects malformed content tab payloads before runtime logic executes',
    verifyMalformedContentPayloadRejection
  );
  it('parses canonical diagnostic logger tab messages', verifyDiagnosticLoggerTabMessageParsing);
  it('accepts valid offscreen runtime messages', verifyOffscreenRuntimeMessageParsing);
  it('accepts offscreen error payloads with a valid phase', verifyOffscreenErrorPhaseParsing);
  it(
    'rejects offscreen error payloads with an invalid phase',
    verifyInvalidOffscreenErrorPhaseRejected
  );
  it('accepts valid popup runtime sync messages', verifyPopupRuntimeSyncMessageParsing);
  it('rejects invalid background image data payloads', verifyInvalidBackgroundImageDataRejected);
  it('rejects invalid content image data payloads', verifyInvalidContentImageDataRejected);
  it(
    'rejects removed navigation lock messages at the boundary',
    verifyRemovedNavigationLockMessagesRejected
  );
  it('parses generic runtime and tab boundary facades', verifyGenericBoundaryParserFacades);
  it(
    'accepts screenshot mode status capability fields',
    verifyScreenshotModeStatusCapabilityResponseParsing
  );
  it(
    'requires background-owned web snapshot tab authority',
    verifyWebSnapshotTabAuthorityFieldParsing
  );
});
