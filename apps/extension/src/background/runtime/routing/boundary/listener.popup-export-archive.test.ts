import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createSender,
  expectListenerResult,
  flushPromises,
  parseBackgroundRuntimeMessageMock,
  registerListener,
  resetRuntimeMessagingMocks,
} from '../../../../../../../tooling/test/support/background-runtime-messaging.test-support';

const popupArchiveMocks = vi.hoisted(() => ({
  buildDownloadFilename: vi.fn(),
  createDownloadRouterService: vi.fn(),
  executeDownload: vi.fn(),
  executeDownloadBlob: vi.fn(),
  resolvePresetPath: vi.fn(),
}));

vi.mock('../../../capture/download/download-router', () => ({
  buildDownloadFilename: popupArchiveMocks.buildDownloadFilename,
  createDownloadRouterService: popupArchiveMocks.createDownloadRouterService,
  executeDownload: popupArchiveMocks.executeDownload,
  executeDownloadBlob: popupArchiveMocks.executeDownloadBlob,
  resolvePresetPath: popupArchiveMocks.resolvePresetPath,
}));

beforeEach(() => {
  resetRuntimeMessagingMocks();
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
  popupArchiveMocks.executeDownloadBlob.mockResolvedValue(undefined);
});

function createArchiveMessage() {
  return {
    archiveSessionId: 'archive-session-1',
    filename: 'export.zip',
    mimeType: 'application/zip',
    stagedArchiveId: 'staged-archive-1',
    type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
  };
}

function createStageMessage() {
  return {
    archiveSessionId: 'archive-session-1',
    base64: Buffer.from('zip').toString('base64'),
    chunkIndex: 0,
    stagedArchiveId: 'staged-archive-1',
    totalBytes: 3,
    totalChunks: 1,
    type: MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
  };
}

it('routes popup export archive saves through the background-owned listener path', async () => {
  const { listener, sendResponse } = registerListener();
  const sender = createSender(
    undefined,
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );
  const stageMessage = createStageMessage();
  const message = createArchiveMessage();
  parseBackgroundRuntimeMessageMock.mockReturnValueOnce(stageMessage).mockReturnValueOnce(message);

  expectListenerResult(true, listener, stageMessage, sender, sendResponse);
  expectListenerResult(true, listener, message, sender, sendResponse);
  await flushPromises();

  expect(popupArchiveMocks.executeDownloadBlob).toHaveBeenCalledWith(
    expect.any(Blob),
    'export.zip',
    undefined
  );
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('rejects content callers before popup export archive download side effects', () => {
  const { listener, sendResponse } = registerListener();
  const sender = createSender(7, 'https://example.test/page');
  const message = createStageMessage();
  parseBackgroundRuntimeMessageMock.mockReturnValue(message);

  expectListenerResult(false, listener, message, sender, sendResponse);

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Unauthorized popup export archive sender',
    success: false,
  });
  expect(popupArchiveMocks.executeDownloadBlob).not.toHaveBeenCalled();
});
