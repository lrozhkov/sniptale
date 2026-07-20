import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installContentRuntimeMessagingMock } from '../../platform/runtime-services/services.test-support';

const mocks = vi.hoisted(() => ({
  buildCurrentPageWebSnapshot: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  stageWebSnapshotBlobForGallery: vi.fn(),
}));

vi.mock('./service', () => ({
  buildCurrentPageWebSnapshot: mocks.buildCurrentPageWebSnapshot,
}));

vi.mock('./staged-transfer', () => ({
  stageWebSnapshotBlobForGallery: mocks.stageWebSnapshotBlobForGallery,
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: mocks.sendRuntimeMessage,
}));

import { saveCurrentPageWebSnapshot } from './save';

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(mocks.sendRuntimeMessage);
  mocks.buildCurrentPageWebSnapshot.mockResolvedValue({
    manifest: { id: 'snapshot-1' },
    packageBlob: new Blob(['zip']),
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    screenshotMimeType: 'image/png',
    snapshotSessionId: 'snapshot-session-1',
    warnings: ['asset skipped'],
  });
  mocks.stageWebSnapshotBlobForGallery
    .mockResolvedValueOnce('package-staged-1')
    .mockResolvedValueOnce('screenshot-staged-1');
  mocks.sendRuntimeMessage.mockResolvedValue({
    assetId: 'asset-web',
    success: true,
  });
});

it('returns saved asset id and build warnings after staged gallery save', async () => {
  await expect(
    saveCurrentPageWebSnapshot({
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      requestId: 'req-web',
    })
  ).resolves.toEqual({
    assetId: 'asset-web',
    success: true,
    warnings: ['asset skipped'],
  });

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    manifest: { id: 'snapshot-1' },
    packageStagedBlobId: 'package-staged-1',
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: 'screenshot-staged-1',
    snapshotSessionId: 'snapshot-session-1',
    type: MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
  });
});

it('preserves gallery save failures with a stage-prefixed error', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({
    error: 'window is not defined',
    success: false,
  });

  await expect(
    saveCurrentPageWebSnapshot({
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      requestId: 'req-web',
    })
  ).rejects.toThrow('save web snapshot to gallery: window is not defined');
});
