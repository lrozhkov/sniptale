// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const { sendRuntimeMessageMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../platform/runtime-services/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-services/services')>()),
  getContentRuntimeServices: () => ({
    messaging: { sendRuntimeMessage: sendRuntimeMessageMock },
  }),
}));

import { stageWebSnapshotBlobForGallery } from './staged-transfer';

async function verifyBoundedChunks(): Promise<void> {
  const blob = new Blob([new Uint8Array(512 * 1024 + 1)]);

  await expect(
    stageWebSnapshotBlobForGallery({
      blob,
      blobKind: 'package',
      snapshotSessionId: 'snapshot-1',
    })
  ).resolves.toBe('00000000-0000-4000-8000-000000000001');

  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(2);
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      blobKind: 'package',
      chunkIndex: 0,
      snapshotSessionId: 'snapshot-1',
      stagedBlobId: '00000000-0000-4000-8000-000000000001',
      totalBytes: 512 * 1024 + 1,
      totalChunks: 2,
      type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
    })
  );
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ chunkIndex: 1, totalChunks: 2 })
  );
}

async function verifyOwnerRejection(): Promise<void> {
  sendRuntimeMessageMock.mockResolvedValue({ success: false, error: 'staging denied' });

  await expect(
    stageWebSnapshotBlobForGallery({
      blob: new Blob([]),
      blobKind: 'screenshot',
      snapshotSessionId: 'snapshot-2',
    })
  ).rejects.toThrow('staging denied');

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ chunkIndex: 0, totalBytes: 0, totalChunks: 1 })
  );
}

describe('web snapshot staged transfer', () => {
  beforeEach(() => {
    sendRuntimeMessageMock.mockReset();
    sendRuntimeMessageMock.mockResolvedValue({ success: true });
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001'
    );
  });

  it('sends bounded chunks with one stable staged blob identity', verifyBoundedChunks);
  it('stages an empty blob as one chunk and surfaces owner rejection', verifyOwnerRejection);
});
