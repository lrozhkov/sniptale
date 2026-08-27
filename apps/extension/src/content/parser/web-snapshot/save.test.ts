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
  mocks.sendRuntimeMessage.mockImplementation(async (message: { type: string }) => {
    if (message.type === MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY) {
      return {
        error: 'window is not defined',
        success: false,
      };
    }
    return { success: true };
  });

  await expect(
    saveCurrentPageWebSnapshot({
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      requestId: 'req-web',
    })
  ).rejects.toThrow('save web snapshot to gallery: window is not defined');
});

it('releases every owner-staged record when parallel staging fails', async () => {
  mocks.stageWebSnapshotBlobForGallery
    .mockReset()
    .mockResolvedValueOnce('package-staged-1')
    .mockRejectedValueOnce(new Error('screenshot staging failed'));
  mocks.sendRuntimeMessage.mockReset().mockResolvedValue({ success: true });

  await expect(
    saveCurrentPageWebSnapshot({
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      requestId: 'req-web',
    })
  ).rejects.toThrow('stage web snapshot screenshot: screenshot staging failed');

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    snapshotSessionId: 'snapshot-session-1',
    type: MessageType.RELEASE_WEB_SNAPSHOT_STAGED_BLOBS,
  });
});

it('aborts and awaits a late staging sibling before releasing owner records', async () => {
  let resolvePackageStage: (stagedBlobId: string) => void = () => undefined;
  let packageSignal: AbortSignal | undefined;
  mocks.stageWebSnapshotBlobForGallery
    .mockReset()
    .mockImplementationOnce(({ abortSignal }: { abortSignal?: AbortSignal }) => {
      packageSignal = abortSignal;
      return new Promise<string>((resolve) => {
        resolvePackageStage = resolve;
      });
    })
    .mockRejectedValueOnce(new Error('screenshot staging failed'));
  mocks.sendRuntimeMessage.mockReset().mockResolvedValue({ success: true });

  const saving = saveCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    requestId: 'req-web-late-sibling',
  });
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

  expect(packageSignal?.aborted).toBe(true);
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({
      type: MessageType.RELEASE_WEB_SNAPSHOT_STAGED_BLOBS,
    })
  );

  resolvePackageStage('late-package-stage');
  await expect(saving).rejects.toThrow('stage web snapshot screenshot: screenshot staging failed');

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    snapshotSessionId: 'snapshot-session-1',
    type: MessageType.RELEASE_WEB_SNAPSHOT_STAGED_BLOBS,
  });
});

it('does not stage or persist a snapshot cancelled while its package is being built', async () => {
  let resolveBuild: (value: unknown) => void = () => undefined;
  mocks.buildCurrentPageWebSnapshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveBuild = resolve;
      })
  );
  const controller = new AbortController();
  const saving = saveCurrentPageWebSnapshot({
    abortSignal: controller.signal,
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: false,
    requestId: 'req-cancelled',
  });
  controller.abort(new Error('Web snapshot save was cancelled'));
  resolveBuild({
    manifest: { id: 'snapshot-cancelled' },
    packageBlob: new Blob(['zip']),
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    screenshotMimeType: 'image/png',
    snapshotSessionId: 'snapshot-session-cancelled',
    warnings: [],
  });

  await expect(saving).rejects.toThrow('Web snapshot save was cancelled');
  expect(mocks.stageWebSnapshotBlobForGallery).not.toHaveBeenCalled();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});
