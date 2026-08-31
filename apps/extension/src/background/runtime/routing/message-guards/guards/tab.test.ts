import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  isBackgroundInternalSignalMessage,
  isBackgroundTabMessage,
  isPopupExportViewerMessage,
  isRouteCaptureMessage,
  isScenarioMessage,
  isTabModeMessage,
  isVideoControlMessage,
} from './tab';

it('classifies registered web snapshot asset fetches as background capture messages', () => {
  const message = {
    type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    snapshotSessionId: 'snapshot-session-1',
    url: 'https://upload.wikimedia.org/example.svg',
  };

  expect(isRouteCaptureMessage(message)).toBe(true);
  expect(isBackgroundTabMessage(message)).toBe(true);
});

it('classifies viewer-routed popup export messages as background tab messages', () => {
  const message = {
    tabId: 7,
    type: MessageType.EXPORT_POPUP_PREVIEW,
  };

  expect(isPopupExportViewerMessage(message)).toBe(true);
  expect(isBackgroundTabMessage(message)).toBe(true);
});

it('classifies recording start cancellation as a video control tab message', () => {
  const message = { type: VideoMessageType.CANCEL_RECORDING_START };

  expect(isVideoControlMessage(message)).toBe(true);
  expect(isBackgroundTabMessage(message)).toBe(true);
});

it('classifies region selection events as background internal signals', () => {
  const selected = {
    captureViewport: {
      devicePixelRatio: 1,
      height: 720,
      scrollX: 0,
      scrollY: 0,
      visualViewportScale: 1,
      width: 1280,
    },
    region: { height: 200, width: 300, x: 10, y: 20 },
    requestId: 'request-1',
    tabId: 7,
    type: VideoMessageType.REGION_SELECTED,
  };
  const cancelled = {
    requestId: 'request-1',
    tabId: 7,
    type: VideoMessageType.REGION_SELECTION_CANCELLED,
  };

  expect(isBackgroundInternalSignalMessage(selected)).toBe(true);
  expect(isBackgroundInternalSignalMessage(cancelled)).toBe(true);
});

it('does not route region selection events as tab actions', () => {
  const message = {
    requestId: 'request-1',
    tabId: 7,
    type: VideoMessageType.REGION_SELECTION_CANCELLED,
  };

  expect(isBackgroundTabMessage(message)).toBe(false);
});

it('rejects unrelated messages across tab-message guard families', () => {
  const message = { type: 'UNKNOWN_MESSAGE' };

  expect(isTabModeMessage(message)).toBe(false);
  expect(isScenarioMessage(message)).toBe(false);
  expect(isPopupExportViewerMessage(message)).toBe(false);
  expect(isRouteCaptureMessage(message)).toBe(false);
  expect(isVideoControlMessage(message)).toBe(false);
  expect(isBackgroundTabMessage(message)).toBe(false);
});
