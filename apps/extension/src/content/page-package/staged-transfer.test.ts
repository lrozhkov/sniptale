// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const { sendRuntimeMessage } = vi.hoisted(() => ({ sendRuntimeMessage: vi.fn() }));

vi.mock('../platform/runtime-services/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/runtime-services/services')>()),
  getContentRuntimeServices: () => ({ messaging: { sendRuntimeMessage } }),
}));

import { createPagePackageJobStagedSink } from './staged-transfer';

describe('Page Package job staged transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001'
    );
    sendRuntimeMessage.mockImplementation(async (message: { final: boolean }) => ({
      complete: message.final,
      stagedBlobId: '00000000-0000-4000-8000-000000000001',
      success: true,
    }));
  });

  it('emits bounded sequential chunks bound to job and ordinal', async () => {
    const transfer = createPagePackageJobStagedSink({ jobId: 'job-1', ordinal: 3 });
    const writer = transfer.sink.writable.getWriter();
    await writer.write(new Uint8Array(512 * 1024 * 2 + 1));
    await writer.close();

    expect(sendRuntimeMessage).toHaveBeenCalledTimes(3);
    expect(
      sendRuntimeMessage.mock.calls.map(([message]) => ({
        final: message.final,
        jobId: message.jobId,
        ordinal: message.ordinal,
        sequence: message.sequence,
        type: message.type,
      }))
    ).toEqual([
      {
        final: false,
        jobId: 'job-1',
        ordinal: 3,
        sequence: 0,
        type: MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK,
      },
      {
        final: false,
        jobId: 'job-1',
        ordinal: 3,
        sequence: 1,
        type: MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK,
      },
      {
        final: true,
        jobId: 'job-1',
        ordinal: 3,
        sequence: 2,
        type: MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK,
      },
    ]);
    expect(sendRuntimeMessage.mock.calls[0]?.[0].base64.length).toBeLessThanOrEqual(768 * 1024);
  });

  it('rejects a mismatched background acknowledgement', async () => {
    sendRuntimeMessage.mockResolvedValue({
      complete: true,
      stagedBlobId: 'another-stage',
      success: true,
    });
    const transfer = createPagePackageJobStagedSink({ jobId: 'job-1', ordinal: 0 });
    const writer = transfer.sink.writable.getWriter();
    await writer.write(new Uint8Array([1]));

    await expect(writer.close()).rejects.toThrow('Background rejected');
  });
});
