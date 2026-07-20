import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listNativeTransferSessions: vi.fn(),
}));

vi.mock('./persistence/staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./persistence/staging')>()),
  listNativeTransferSessions: mocks.listNativeTransferSessions,
}));

import { createNativeTransferResumeRequests } from './resume';

beforeEach(() => {
  vi.clearAllMocks();
});

it('requests the first missing recording chunk for the active lease only', async () => {
  mocks.listNativeTransferSessions.mockResolvedValue([
    createSession({ controllerLeaseId: 'other-lease' }),
    createSession({ kind: 'screenshot' }),
    createSession({ id: 'complete-recording', receivedChunkIndexes: [0, 1] }),
    createSession({ receivedChunkIndexes: [0] }),
  ]);

  await expect(createNativeTransferResumeRequests('lease-1')).resolves.toEqual([
    {
      chunkIndex: 1,
      controllerLeaseId: 'lease-1',
      protocolVersion: 1,
      recordingId: 'recording-1',
      type: 'extension.recording.chunkRequest',
    },
  ]);
});

function createSession(patch: Record<string, unknown> = {}) {
  return {
    chunkCount: 2,
    controllerLeaseId: 'lease-1',
    createdAt: 1,
    expiresAt: Date.now() + 60_000,
    filename: 'recording.mp4',
    id: 'recording-1',
    kind: 'recording',
    metadata: { height: 720, openEditor: false, width: 1280 },
    mimeType: 'video/mp4',
    receivedBytes: 4,
    receivedChunkIndexes: [],
    sha256: '0'.repeat(64),
    totalBytes: 8,
    updatedAt: 2,
    ...patch,
  };
}
