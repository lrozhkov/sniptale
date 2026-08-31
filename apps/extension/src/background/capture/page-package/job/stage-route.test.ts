import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({ append: vi.fn() }));

vi.mock('./staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./staging')>()),
  createPagePackageStagingStore: () => ({ append: mocks.append }),
}));

import { handleStagePagePackageJobChunk } from './stage-route';

const payload = {
  base64: 'YQ==',
  final: true,
  jobId: 'job-1',
  ordinal: 2,
  sequence: 0,
  stagedBlobId: 'stage-1',
  type: MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK,
} as const;

beforeEach(() => vi.clearAllMocks());

it('injects the sender-resolved tab and returns the exact staging acknowledgement', async () => {
  const sendResponse = vi.fn();
  mocks.append.mockResolvedValue({ complete: true, stagedBlobId: 'stage-1' });

  expect(handleStagePagePackageJobChunk(payload, 17, sendResponse)).toBe(true);

  await vi.waitFor(() => expect(mocks.append).toHaveBeenCalledWith({ ...payload, tabId: 17 }));
  expect(sendResponse).toHaveBeenCalledWith({
    complete: true,
    stagedBlobId: 'stage-1',
    success: true,
  });
});

it('surfaces staging rejection without acknowledging completion', async () => {
  const sendResponse = vi.fn();
  mocks.append.mockRejectedValue(new Error('binding rejected'));

  handleStagePagePackageJobChunk(payload, 17, sendResponse);

  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ error: 'binding rejected', success: false })
  );
});
