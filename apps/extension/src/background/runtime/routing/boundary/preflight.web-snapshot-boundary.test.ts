import { expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import { parseRuntimeMessage } from './parser';

function createStageChunkMessage() {
  return {
    base64: 'emlw',
    blobKind: 'package',
    chunkIndex: 0,
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: 'stage-package-1',
    totalBytes: 3,
    totalChunks: 1,
    type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
  };
}

it('accepts staged web snapshot chunks through the background runtime preflight parser', () => {
  const sendResponse = vi.fn();
  const logger = { warn: vi.fn() };

  expect(
    parseRuntimeMessage({
      logger,
      message: attachRuntimeMessageFreshness(createStageChunkMessage()),
      sender: { tab: { id: 7 } as chrome.tabs.Tab },
      sendResponse,
    })
  ).toEqual(createStageChunkMessage());
  expect(sendResponse).not.toHaveBeenCalled();
  expect(logger.warn).not.toHaveBeenCalled();
});
