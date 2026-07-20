import { describe, expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parseBackgroundRuntimeMessage } from './boundary';

function verifyWebSnapshotStageChunkBackgroundParsing() {
  expect(
    parseBackgroundRuntimeMessage({
      base64: 'emlw',
      blobKind: 'package',
      chunkIndex: 0,
      snapshotSessionId: 'snapshot-session-1',
      stagedBlobId: 'stage-package-1',
      totalBytes: 3,
      totalChunks: 1,
      type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
    })
  ).toEqual({
    base64: 'emlw',
    blobKind: 'package',
    chunkIndex: 0,
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: 'stage-package-1',
    totalBytes: 3,
    totalChunks: 1,
    type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
  });
}

describe('web snapshot message boundary parsers', () => {
  it(
    'accepts staged web snapshot chunks at the background boundary',
    verifyWebSnapshotStageChunkBackgroundParsing
  );
});
