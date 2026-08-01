import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  isBackgroundTabMessage,
  isPopupExportViewerMessage,
  isRouteCaptureMessage,
  isScenarioMessage,
  isTabModeMessage,
  isVideoControlMessage,
} from './tab';

it('classifies web snapshot gallery saves as background capture messages', () => {
  const message = {
    type: MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
    manifest: {},
    packageStagedBlobId: 'package-stage-1',
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: 'screenshot-stage-1',
    snapshotSessionId: 'snapshot-session-1',
  };

  expect(isRouteCaptureMessage(message)).toBe(true);
  expect(isBackgroundTabMessage(message)).toBe(true);
});

it('classifies registered web snapshot asset fetches as background capture messages', () => {
  const message = {
    type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    snapshotSessionId: 'snapshot-session-1',
    url: 'https://upload.wikimedia.org/example.svg',
  };

  expect(isRouteCaptureMessage(message)).toBe(true);
  expect(isBackgroundTabMessage(message)).toBe(true);
});

it('classifies staged web snapshot chunks as background capture messages', () => {
  const message = {
    base64: 'emlw',
    blobKind: 'package',
    chunkIndex: 0,
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: 'stage-package-1',
    totalBytes: 3,
    totalChunks: 1,
    type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
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

it('rejects unrelated messages across tab-message guard families', () => {
  const message = { type: 'UNKNOWN_MESSAGE' };

  expect(isTabModeMessage(message)).toBe(false);
  expect(isScenarioMessage(message)).toBe(false);
  expect(isPopupExportViewerMessage(message)).toBe(false);
  expect(isRouteCaptureMessage(message)).toBe(false);
  expect(isVideoControlMessage(message)).toBe(false);
  expect(isBackgroundTabMessage(message)).toBe(false);
});
