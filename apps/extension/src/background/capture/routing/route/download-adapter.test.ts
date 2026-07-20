import { beforeEach, expect, it, vi } from 'vitest';

const {
  handleReleaseRecordingDownloadMock,
  handleSaveRecordingForDownloadMock,
  handleStageRecordingDownloadChunkMock,
} = vi.hoisted(() => ({
  handleReleaseRecordingDownloadMock: vi.fn(),
  handleSaveRecordingForDownloadMock: vi.fn(),
  handleStageRecordingDownloadChunkMock: vi.fn(),
}));

vi.mock('../actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../actions')>()),
  handleReleaseRecordingDownload: handleReleaseRecordingDownloadMock,
  handleSaveRecordingForDownload: handleSaveRecordingForDownloadMock,
  handleStageRecordingDownloadChunk: handleStageRecordingDownloadChunkMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  markPreauthorizedContentActionRouteMessage,
  type ContentSenderBinding,
} from '../authorization/content-action';
import { createScenarioSessionServiceStub } from '../../../../../../../tooling/test/support/scenario-session-service.stub';
import { routeDownloadMessage } from './download-adapter';
import type { RouteCaptureMessageArgs } from './types';

const recordingOwner: ContentSenderBinding = {
  documentId: 'document-1',
  frameId: 0,
  senderUrl: 'https://example.test/page',
  tabId: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  handleReleaseRecordingDownloadMock.mockReturnValue(true);
  handleSaveRecordingForDownloadMock.mockReturnValue(true);
  handleStageRecordingDownloadChunkMock.mockReturnValue(true);
});

function createRouteArgs(args: {
  message: RouteCaptureMessageArgs['message'];
  sendResponse: RouteCaptureMessageArgs['sendResponse'];
}): RouteCaptureMessageArgs {
  return {
    captureGuardState: { isCapturing: false },
    message: args.message,
    resolvedTabId: 7,
    scenarioSessionService: createScenarioSessionServiceStub(),
    screenshotModeState: new Map(),
    sendResponse: args.sendResponse,
    viewportState: new Map(),
  };
}

it('fails closed when staged recording messages lack route preauthorization', () => {
  const sendResponse = vi.fn();
  const message = {
    base64: 'dmlkZW8=',
    chunkIndex: 0,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 1,
    type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
  };

  expect(routeDownloadMessage(createRouteArgs({ message, sendResponse }))).toBe(true);

  expect(handleStageRecordingDownloadChunkMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized recording download owner',
    success: false,
  });
});

it('passes preauthorized sender bindings into staged recording handlers', () => {
  const sendResponse = vi.fn();
  const message = createStageRecordingMessage();
  markPreauthorizedContentActionRouteMessage(message, recordingOwner);

  expect(routeDownloadMessage(createRouteArgs({ message, sendResponse }))).toBe(true);

  expect(handleStageRecordingDownloadChunkMock).toHaveBeenCalledWith(
    message,
    recordingOwner,
    sendResponse
  );
});

it('passes preauthorized sender bindings into recording save handlers', () => {
  const sendResponse = vi.fn();
  const message = createSaveRecordingMessage();
  markPreauthorizedContentActionRouteMessage(message, recordingOwner);

  expect(routeDownloadMessage(createRouteArgs({ message, sendResponse }))).toBe(true);

  expect(handleSaveRecordingForDownloadMock).toHaveBeenCalledWith(
    message,
    recordingOwner,
    sendResponse
  );
});

it('fails closed when recording release messages lack route preauthorization', () => {
  const sendResponse = vi.fn();
  const message = createReleaseRecordingMessage();

  expect(routeDownloadMessage(createRouteArgs({ message, sendResponse }))).toBe(true);

  expect(handleReleaseRecordingDownloadMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized recording download owner',
    success: false,
  });
});

it('passes preauthorized sender bindings into recording release handlers', () => {
  const sendResponse = vi.fn();
  const message = createReleaseRecordingMessage();
  markPreauthorizedContentActionRouteMessage(message, recordingOwner);

  expect(routeDownloadMessage(createRouteArgs({ message, sendResponse }))).toBe(true);

  expect(handleReleaseRecordingDownloadMock).toHaveBeenCalledWith(
    message,
    recordingOwner,
    sendResponse
  );
});

function createStageRecordingMessage() {
  return {
    base64: 'dmlkZW8=',
    chunkIndex: 0,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 1,
    type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
  };
}

function createSaveRecordingMessage() {
  return {
    filename: 'recording.webm',
    mimeType: 'video/webm',
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    type: MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
  };
}

function createReleaseRecordingMessage() {
  return {
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    type: MessageType.RELEASE_RECORDING_DOWNLOAD,
  };
}
