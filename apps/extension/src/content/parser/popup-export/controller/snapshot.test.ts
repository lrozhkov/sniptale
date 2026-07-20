// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installContentRuntimeMessagingMock } from '../../../platform/runtime-services/services.test-support';
import { handlePopupWebSnapshotRuntime } from './snapshot';

const mocks = vi.hoisted(() => ({
  buildCurrentPageWebSnapshot: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../web-snapshot/service', () => ({
  buildCurrentPageWebSnapshot: mocks.buildCurrentPageWebSnapshot,
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: mocks.sendRuntimeMessage,
}));

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(mocks.sendRuntimeMessage);
});

function expectStagedSaveMessages(manifest: unknown): void {
  const sentMessages = mocks.sendRuntimeMessage.mock.calls.map(([message]) => message);
  expect(sentMessages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        blobKind: 'package',
        snapshotSessionId: 'snapshot-session-1',
        type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
      }),
      expect.objectContaining({
        blobKind: 'screenshot',
        snapshotSessionId: 'snapshot-session-1',
        type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
      }),
    ])
  );
  const packageStageMessage = sentMessages.find((message) => message.blobKind === 'package');
  const screenshotStageMessage = sentMessages.find((message) => message.blobKind === 'screenshot');
  expect(sentMessages).toContainEqual({
    manifest,
    packageStagedBlobId: packageStageMessage?.stagedBlobId,
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: screenshotStageMessage?.stagedBlobId,
    snapshotSessionId: 'snapshot-session-1',
    type: MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
  });
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledTimes(3);
}

it('builds and persists the current page web snapshot', async () => {
  const sendResponse = vi.fn();
  const manifest = { id: 'snapshot-1', source: { title: 'Page', url: 'https://example.com' } };
  mocks.buildCurrentPageWebSnapshot.mockResolvedValue({
    manifest,
    packageBlob: new Blob(['zip'], { type: 'application/x-sniptale-web-snapshot+zip' }),
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    screenshotMimeType: 'image/png',
    snapshotSessionId: 'snapshot-session-1',
    warnings: ['missing asset'],
  });
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({ success: true, complete: true, stagedBlobId: 'package-stage' })
    .mockResolvedValueOnce({ success: true, complete: true, stagedBlobId: 'screenshot-stage' })
    .mockResolvedValueOnce({ success: true, assetId: 'asset-1' });

  expect(handlePopupWebSnapshotRuntime(sendResponse, 'req-web', true, false)).toBe(true);
  await flushPromises();

  expect(mocks.buildCurrentPageWebSnapshot).toHaveBeenCalledWith({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: true,
    requestId: 'req-web',
  });
  expectStagedSaveMessages(manifest);
  expect(sendResponse).toHaveBeenCalledWith({
    assetId: 'asset-1',
    success: true,
    warnings: ['missing asset'],
  });
});

it('returns clear failures when the background persistence route rejects', async () => {
  const sendResponse = vi.fn();
  mocks.buildCurrentPageWebSnapshot.mockResolvedValue({
    manifest: {},
    packageBlob: new Blob(['zip'], { type: 'application/x-sniptale-web-snapshot+zip' }),
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    screenshotMimeType: 'image/png',
    snapshotSessionId: 'snapshot-session-1',
    warnings: [],
  });
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({ success: true, complete: true, stagedBlobId: 'package-stage' })
    .mockResolvedValueOnce({ success: true, complete: true, stagedBlobId: 'screenshot-stage' })
    .mockResolvedValueOnce({ success: false, error: 'denied' });

  handlePopupWebSnapshotRuntime(sendResponse, 'req-web', true, false);
  await flushPromises();

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'save web snapshot to gallery: denied',
    success: false,
    warnings: [],
  });
});

it('normalizes non-error web snapshot runtime failures', async () => {
  const sendResponse = vi.fn();
  mocks.buildCurrentPageWebSnapshot.mockRejectedValueOnce('string failure');

  handlePopupWebSnapshotRuntime(sendResponse, 'req-web', true, false);
  await flushPromises();

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'build web snapshot package: string failure',
    success: false,
    warnings: [],
  });
});
